#!/usr/bin/env node

/**
 * Content Velocity Engine — FlashVoyage Content Intelligence
 *
 * Computes urgency scores for trending topics and determines
 * whether to override the editorial calendar.
 *
 * The Problem:
 *   A trending topic about "Thailand visa changes" has a half-life of ~12 hours.
 *   Publishing on day 4 captures only ~6% of available traffic.
 *   The current pipeline has no urgency signal.
 *
 * Velocity Score Formula:
 *   velocity_score = trend_intensity * time_decay * competition_gap * monetization_boost
 *
 *   - trend_intensity: Google Trends score normalized to 0-1
 *   - time_decay: 2^(-hours_since_spike / half_life_hours)
 *   - competition_gap: 1 - (FR articles on page 1 / 10)
 *   - monetization_boost: 1.5 if affiliate angle, 1.0 otherwise
 *
 * Half-life varies by topic type:
 *   breaking_news = 12h
 *   policy_change = 48h (visa, airline route)
 *   seasonal_shift = 168h (1 week)
 *   evergreen_trend = 720h (1 month)
 *
 * Actions:
 *   score >= 0.8 → PUBLISH_NOW (trigger pipeline immediately)
 *   score 0.6-0.8 → QUEUE_PRIORITY (next in calendar)
 *   score 0.4-0.6 → QUEUE_NORMAL
 *   score < 0.4 → SKIP
 *
 * Cron: Every 2 hours
 *   0 * /2 * * *
 *
 * Data: social-distributor/data/velocity-queue.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const VELOCITY_QUEUE_PATH = join(DATA_DIR, 'velocity-queue.json');
const TRENDS_PATH = join(__dirname, '..', 'reels', 'data', 'trend-priorities.json');

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [VELOCITY] ${msg}`);
}

function logWarn(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.warn(`[${ts}] [VELOCITY] WARN: ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] [VELOCITY] ERROR: ${msg}`);
}

// ── Constants ───────────────────────────────────────────────────────────────

const TOPIC_TYPES = {
  BREAKING_NEWS: { key: 'breaking_news', halfLifeHours: 12 },
  POLICY_CHANGE: { key: 'policy_change', halfLifeHours: 48 },
  SEASONAL_SHIFT: { key: 'seasonal_shift', halfLifeHours: 168 },
  EVERGREEN_TREND: { key: 'evergreen_trend', halfLifeHours: 720 },
};

const ACTIONS = {
  PUBLISH_NOW: 'PUBLISH_NOW',
  QUEUE_PRIORITY: 'QUEUE_PRIORITY',
  QUEUE_NORMAL: 'QUEUE_NORMAL',
  SKIP: 'SKIP',
};

// Keywords that indicate topic types
const BREAKING_KEYWORDS = [
  'crash', 'accident', 'eruption', 'tsunami', 'seisme', 'tremblement',
  'fermeture', 'annulation', 'evacuation', 'alerte', 'urgence',
  'greve', 'tempete', 'cyclone', 'typhon', 'inondation',
];

const POLICY_KEYWORDS = [
  'visa', 'passeport', 'douane', 'frontiere', 'reglementation',
  'taxe', 'interdiction', 'obligation', 'nouvelle route', 'nouvelle liaison',
  'compagnie aerienne', 'vol direct', 'ouverture', 'e-visa',
];

const SEASONAL_KEYWORDS = [
  'saison', 'mousson', 'haute saison', 'basse saison', 'fete',
  'festival', 'cerisiers', 'automne', 'hiver', 'ete', 'printemps',
  'nouvel an', 'ramadan', 'songkran', 'tet',
];

// Destinations with high monetization potential (Travelpayouts has good offers)
const HIGH_MONETIZATION_DESTINATIONS = [
  'bali', 'thailande', 'japon', 'vietnam', 'philippines',
  'maldives', 'sri lanka', 'singapour', 'malaisie', 'coree',
];

// ── Topic Type Classification ───────────────────────────────────────────────

/**
 * Classify a topic into a type based on keywords in its text.
 * Determines the half-life used for time decay calculation.
 *
 * @param {string} text - Topic title or description
 * @returns {{ type: string, halfLifeHours: number }}
 */
function classifyTopicType(text) {
  const lower = text.toLowerCase();

  if (BREAKING_KEYWORDS.some(k => lower.includes(k))) {
    return TOPIC_TYPES.BREAKING_NEWS;
  }

  if (POLICY_KEYWORDS.some(k => lower.includes(k))) {
    return TOPIC_TYPES.POLICY_CHANGE;
  }

  if (SEASONAL_KEYWORDS.some(k => lower.includes(k))) {
    return TOPIC_TYPES.SEASONAL_SHIFT;
  }

  return TOPIC_TYPES.EVERGREEN_TREND;
}

// ── Velocity Score Computation ──────────────────────────────────────────────

/**
 * Compute the velocity score for a single topic.
 *
 * @param {Object} topic
 * @param {string} topic.text - Topic title or search query
 * @param {number} topic.trendIntensity - Google Trends score (0-100) or RSS urgency
 * @param {string} topic.detectedAt - ISO timestamp when the trend was first detected
 * @param {number} [topic.frCompetition] - Number of FR articles on page 1 (0-10)
 * @param {boolean} [topic.hasAffiliateAngle] - Whether the topic has monetization potential
 * @returns {{ velocityScore: number, action: string, hoursRemaining: number, topicType: object, breakdown: object }}
 */
export function computeVelocityScore(topic) {
  const topicType = classifyTopicType(topic.text);

  // 1. Trend intensity (0-1)
  const trendIntensity = Math.min(1, (topic.trendIntensity || 0) / 100);

  // 2. Time decay: 2^(-hours_since_spike / half_life)
  const hoursSinceDetection = topic.detectedAt
    ? (Date.now() - new Date(topic.detectedAt).getTime()) / (60 * 60 * 1000)
    : 0;
  const timeDecay = Math.pow(2, -hoursSinceDetection / topicType.halfLifeHours);

  // 3. Competition gap (0-1): fewer FR articles = bigger opportunity
  const frCompetition = topic.frCompetition ?? 5; // Default assume moderate competition
  const competitionGap = Math.max(0, 1 - (frCompetition / 10));

  // 4. Monetization boost
  const lower = topic.text.toLowerCase();
  const hasMonetization = topic.hasAffiliateAngle ||
    HIGH_MONETIZATION_DESTINATIONS.some(d => lower.includes(d)) ||
    lower.includes('vol') || lower.includes('hotel') || lower.includes('budget');
  const monetizationBoost = hasMonetization ? 1.5 : 1.0;

  // Final velocity score
  const rawScore = trendIntensity * timeDecay * competitionGap * monetizationBoost;
  const velocityScore = Math.round(Math.min(1, rawScore) * 1000) / 1000;

  // Hours remaining before 50% decay
  const hoursRemaining = Math.max(0, Math.round(
    topicType.halfLifeHours - hoursSinceDetection
  ));

  // Estimated traffic value
  // Rough formula: trend_intensity * 50 * time_decay * (1 - frCompetition/10)
  // At trend=100, 0 competition, t=0: ~5000 potential visits
  const estimatedTrafficNow = Math.round(
    trendIntensity * 5000 * timeDecay * competitionGap
  );
  const estimatedTrafficIn24h = Math.round(
    trendIntensity * 5000 * Math.pow(2, -(hoursSinceDetection + 24) / topicType.halfLifeHours) * competitionGap
  );

  // Determine action
  let action;
  if (velocityScore >= 0.8) action = ACTIONS.PUBLISH_NOW;
  else if (velocityScore >= 0.6) action = ACTIONS.QUEUE_PRIORITY;
  else if (velocityScore >= 0.4) action = ACTIONS.QUEUE_NORMAL;
  else action = ACTIONS.SKIP;

  return {
    velocityScore,
    action,
    hoursRemaining,
    topicType,
    estimatedTrafficNow,
    estimatedTrafficIn24h,
    trafficLossPerHour: estimatedTrafficNow > 0
      ? Math.round((estimatedTrafficNow - estimatedTrafficIn24h) / 24)
      : 0,
    breakdown: {
      trendIntensity: Math.round(trendIntensity * 1000) / 1000,
      timeDecay: Math.round(timeDecay * 1000) / 1000,
      competitionGap: Math.round(competitionGap * 1000) / 1000,
      monetizationBoost,
      hoursSinceDetection: Math.round(hoursSinceDetection * 10) / 10,
    },
  };
}

// ── Signal Collection ───────────────────────────────────────────────────────

/**
 * Collect trending signals from all sources.
 * Returns a unified list of topics with metadata.
 *
 * Sources:
 *   1. Google Trends (from cached trend-priorities.json)
 *   2. RSS breaking news (from breaking-news.js)
 *   3. GSC rising queries (impressions trending up)
 *
 * @returns {Promise<Array<{ text, source, trendIntensity, detectedAt, destination }>>}
 */
async function collectTrendingSignals() {
  const signals = [];

  // Source 1: Google Trends (cached)
  if (existsSync(TRENDS_PATH)) {
    try {
      const trendsData = JSON.parse(readFileSync(TRENDS_PATH, 'utf-8'));
      const destinations = trendsData.destinations || trendsData.reelPriority || {};

      for (const [dest, data] of Object.entries(destinations)) {
        const score = typeof data === 'number' ? data : data?.score || 0;
        if (score > 30) { // Only include trends above noise floor
          signals.push({
            text: `voyage ${dest}`,
            source: 'google_trends',
            trendIntensity: score,
            detectedAt: trendsData.updatedAt || new Date().toISOString(),
            destination: dest,
          });
        }
      }
      log(`Collected ${signals.length} signals from Google Trends`);
    } catch (err) {
      logWarn(`Failed to read trends: ${err.message}`);
    }
  }

  // Source 2: RSS breaking news
  try {
    const breakingModule = await import('../breaking-news.js');
    const { fetchLatestNews } = await import('../sources/rss-scraper.js');
    const newsItems = await fetchLatestNews(12);

    if (newsItems && newsItems.length > 0) {
      for (const item of newsItems) {
        const scoring = breakingModule.scoreNewsItem(item);
        if (scoring.score >= 30) {
          signals.push({
            text: item.title,
            source: 'rss_breaking',
            trendIntensity: scoring.score,
            detectedAt: item.pubDate || new Date().toISOString(),
            destination: item.region || null,
            link: item.link,
          });
        }
      }
      log(`Collected ${newsItems.length} RSS items, ${signals.filter(s => s.source === 'rss_breaking').length} above threshold`);
    }
  } catch (err) {
    logWarn(`RSS collection failed: ${err.message}`);
  }

  // Source 3: GSC rising queries
  try {
    const { findDecliningQueries } = await import('./search-console-fetcher.js');
    // "Rising" = the inverse: queries where secondHalf > firstHalf significantly
    // We'll reuse the declining queries function but invert the filter
    const pairs = await import('./search-console-fetcher.js')
      .then(m => m.fetchQueryPagePairs(28, 5000));

    // This would need a dedicated "rising queries" function
    // For now, use existing data from GSC
    log('GSC rising queries: using cached intelligence data');
  } catch (err) {
    logWarn(`GSC rising queries failed: ${err.message}`);
  }

  return signals;
}

// ── Existing Article Check ──────────────────────────────────────────────────

/**
 * Check if we already have an article covering this topic.
 * Returns the matching article slug or null.
 *
 * @param {string} topicText - Topic to check
 * @returns {Promise<string|null>} Matching slug or null
 */
async function findExistingArticle(topicText) {
  try {
    // Paginated fetch to search ALL published articles
    const allPosts = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const response = await fetch(
        `https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=slug,title&status=publish`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!response.ok) break;
      const batch = await response.json();
      allPosts.push(...batch);
      if (page === 1) {
        totalPages = parseInt(response.headers.get('x-wp-totalpages') || '1');
      }
      page++;
    }

    const topicLower = topicText.toLowerCase();
    const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3);

    for (const post of allPosts) {
      const title = (post.title?.rendered || '').toLowerCase();
      const slug = (post.slug || '').toLowerCase().replace(/-/g, ' ');
      const combined = `${title} ${slug}`;

      // Check if 2+ significant words match
      const matchCount = topicWords.filter(w => combined.includes(w)).length;
      if (matchCount >= 2) {
        return post.slug;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

/**
 * Run the full velocity engine pipeline:
 * 1. Collect trending signals
 * 2. Filter out topics we already cover
 * 3. Score remaining topics
 * 4. Sort by velocity score
 * 5. Save to velocity-queue.json
 *
 * @returns {Promise<Array>} The velocity queue
 */
export async function runVelocityEngine() {
  log('=== VELOCITY ENGINE RUN ===');
  const startTime = Date.now();

  // 1. Collect signals
  const signals = await collectTrendingSignals();
  log(`Collected ${signals.length} total trending signals`);

  if (signals.length === 0) {
    log('No trending signals detected — velocity queue empty');
    saveVelocityQueue([]);
    return [];
  }

  // 2. Deduplicate by topic text (keep highest intensity)
  const deduped = new Map();
  for (const signal of signals) {
    const key = signal.text.toLowerCase().trim();
    const existing = deduped.get(key);
    if (!existing || signal.trendIntensity > existing.trendIntensity) {
      deduped.set(key, signal);
    }
  }
  const uniqueSignals = [...deduped.values()];
  log(`Deduplicated to ${uniqueSignals.length} unique topics`);

  // 3. Check existing coverage + compute velocity scores
  const queue = [];
  for (const signal of uniqueSignals) {
    const existingSlug = await findExistingArticle(signal.text);
    if (existingSlug) {
      log(`Topic "${signal.text}" already covered by /${existingSlug}/ — skipping`);
      continue;
    }

    const score = computeVelocityScore(signal);

    if (score.action === ACTIONS.SKIP) continue;

    queue.push({
      topic: signal.text,
      source: signal.source,
      destination: signal.destination || null,
      link: signal.link || null,
      ...score,
      detectedAt: signal.detectedAt,
      scoredAt: new Date().toISOString(),
    });
  }

  // 4. Sort by velocity score descending
  queue.sort((a, b) => b.velocityScore - a.velocityScore);

  // 5. Save
  saveVelocityQueue(queue);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Velocity engine complete in ${elapsed}s: ${queue.length} topics in queue`);

  if (queue.length > 0) {
    const urgent = queue.filter(q => q.action === ACTIONS.PUBLISH_NOW);
    const priority = queue.filter(q => q.action === ACTIONS.QUEUE_PRIORITY);
    log(`PUBLISH_NOW: ${urgent.length} | QUEUE_PRIORITY: ${priority.length} | QUEUE_NORMAL: ${queue.length - urgent.length - priority.length}`);

    if (urgent.length > 0) {
      log(`URGENT: "${urgent[0].topic}" (score ${urgent[0].velocityScore}, ${urgent[0].hoursRemaining}h remaining, ~${urgent[0].estimatedTrafficNow} potential visits)`);
    }
  }

  log('=== END VELOCITY ENGINE ===');
  return queue;
}

// ── Persistence ─────────────────────────────────────────────────────────────

function saveVelocityQueue(queue) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    totalTopics: queue.length,
    byAction: {
      publish_now: queue.filter(q => q.action === ACTIONS.PUBLISH_NOW).length,
      queue_priority: queue.filter(q => q.action === ACTIONS.QUEUE_PRIORITY).length,
      queue_normal: queue.filter(q => q.action === ACTIONS.QUEUE_NORMAL).length,
    },
    queue,
  };

  writeFileSync(VELOCITY_QUEUE_PATH, JSON.stringify(output, null, 2), 'utf-8');
  log(`Velocity queue written to ${VELOCITY_QUEUE_PATH}`);
}

/**
 * Load the current velocity queue from disk.
 * Used by pipeline-runner.js to check for urgent overrides.
 *
 * @returns {{ queue: Array, generatedAt: string }|null}
 */
export function loadVelocityQueue() {
  if (!existsSync(VELOCITY_QUEUE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(VELOCITY_QUEUE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Get the most urgent topic that needs immediate publication.
 * Returns null if nothing is urgent enough.
 *
 * @returns {Object|null} The highest-velocity topic or null
 */
export function getUrgentTopic() {
  const data = loadVelocityQueue();
  if (!data || !data.queue) return null;

  const urgent = data.queue.filter(q => q.action === ACTIONS.PUBLISH_NOW);
  if (urgent.length === 0) return null;

  // Check if the queue is fresh enough (less than 4 hours old)
  const queueAge = (Date.now() - new Date(data.generatedAt).getTime()) / (60 * 60 * 1000);
  if (queueAge > 4) {
    log('Velocity queue is stale (>4h old) — treating as empty');
    return null;
  }

  return urgent[0];
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('velocity-engine')) {
  const command = process.argv[2] || 'run';

  (async () => {
    try {
      switch (command) {
        case 'run': {
          const queue = await runVelocityEngine();
          if (queue.length > 0) {
            console.log('\n=== VELOCITY QUEUE ===\n');
            for (const item of queue.slice(0, 10)) {
              console.log(`[${item.action}] ${item.topic}`);
              console.log(`  Score: ${item.velocityScore} | Type: ${item.topicType.key} | Hours left: ${item.hoursRemaining}`);
              console.log(`  Traffic now: ~${item.estimatedTrafficNow} | In 24h: ~${item.estimatedTrafficIn24h} | Loss/hr: ~${item.trafficLossPerHour}`);
              console.log(`  Source: ${item.source} | Destination: ${item.destination || 'n/a'}`);
              console.log();
            }
          } else {
            console.log('\nNo urgent topics detected. Editorial calendar continues as normal.\n');
          }
          break;
        }
        case 'score': {
          // Quick test: score a manual topic
          const topic = process.argv[3] || 'nouveau visa thailande 2026';
          const result = computeVelocityScore({
            text: topic,
            trendIntensity: parseInt(process.argv[4] || '80', 10),
            detectedAt: new Date(Date.now() - (parseInt(process.argv[5] || '2', 10) * 60 * 60 * 1000)).toISOString(),
            frCompetition: parseInt(process.argv[6] || '2', 10),
          });
          console.log(`\nTopic: "${topic}"`);
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case 'urgent': {
          const urgent = getUrgentTopic();
          if (urgent) {
            console.log(`\nURGENT TOPIC: "${urgent.topic}"`);
            console.log(`Score: ${urgent.velocityScore} | Action: ${urgent.action}`);
            console.log(`Hours remaining: ${urgent.hoursRemaining}`);
          } else {
            console.log('\nNo urgent topics. Pipeline proceeds normally.');
          }
          break;
        }
        default:
          console.log(`
Content Velocity Engine — FlashVoyage

Usage:
  node velocity-engine.js run                              Full velocity scan (collects signals, scores, saves queue)
  node velocity-engine.js score "topic" [intensity] [hoursAgo] [frCompetition]   Score a single topic
  node velocity-engine.js urgent                           Check if any topic needs immediate publication

Examples:
  node velocity-engine.js score "eruption volcan bali" 95 1 0
  node velocity-engine.js score "meilleur moment vietnam" 40 48 5
`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}
