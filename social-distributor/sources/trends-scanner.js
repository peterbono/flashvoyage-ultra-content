/**
 * Google Trends Scanner — FlashVoyage Content Intelligence
 *
 * Scans Google Trends for travel-related search spikes in France.
 * Cross-references with existing FlashVoyage articles on WordPress.
 * Identifies content gaps and trending opportunities.
 *
 * Data sources (hybrid approach):
 * 1. Google Trends RSS feed (https://trends.google.com/trending/rss?geo=FR)
 *    — daily trending searches, free, no auth, always works
 * 2. google-trends-api npm package for relatedQueries() and interestOverTime()
 *    — proactive destination monitoring, rising query detection
 * 3. Proactive SE Asia destination scan via relatedQueries
 *    — discovers rising travel queries per destination
 *
 * Outputs:
 * - trendingTopics: topics spiking right now
 * - articleMatches: existing articles that match trending topics
 * - contentGaps: trending topics with NO matching article (= opportunity)
 * - reelPriorities: which destinations/topics to prioritize in reels
 * - destinationInsights: rising queries per SE Asia destination
 *
 * Dependencies: google-trends-api (CJS), xml2js
 */

import { createRequire } from 'module';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const require = createRequire(import.meta.url);
const googleTrends = require('google-trends-api');
const parseXml = promisify(parseString);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** RSS feed URL for daily trending searches in France */
const TRENDS_RSS_URL = 'https://trends.google.com/trending/rss?geo=FR';

// ─── Load config ────────────────────────────────────────────────────────────

const CONFIG_PATH = join(__dirname, 'trends-config.json');
let config;

async function loadConfig() {
  if (!config) {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  }
  return config;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[TRENDS] ${msg}`);
}

function warn(msg) {
  console.warn(`[TRENDS] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Strip accents from a string for fuzzy matching.
 */
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize a string for matching: lowercase, strip accents, remove punctuation.
 */
function normalize(str) {
  return stripAccents(str.toLowerCase())
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse the JSON response from google-trends-api.
 * The library returns a JSON string, sometimes with a leading ")]}'\n" prefix.
 */
function parseTrendsResponse(raw) {
  try {
    if (typeof raw === 'string') {
      // Strip the XSSI protection prefix if present
      const cleaned = raw.replace(/^\)\]\}',?\n/, '');
      return JSON.parse(cleaned);
    }
    return raw;
  } catch (err) {
    warn(`Failed to parse trends response: ${err.message}`);
    return null;
  }
}

// ─── WP Article Cache ───────────────────────────────────────────────────────

let wpArticlesCache = null;
let wpArticlesCacheTime = 0;

/**
 * Fetch all published articles from WP REST API.
 * Caches for 1 hour (configurable via config.wpApi.cacheMaxAgeMs).
 */
async function fetchWpArticles() {
  const cfg = await loadConfig();
  const now = Date.now();

  if (wpArticlesCache && (now - wpArticlesCacheTime) < cfg.wpApi.cacheMaxAgeMs) {
    log(`Using cached WP articles (${wpArticlesCache.length} articles)`);
    return wpArticlesCache;
  }

  log('Fetching articles from WP REST API...');
  const allArticles = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${cfg.wpApi.baseUrl}/posts?per_page=${cfg.wpApi.postsPerPage}&page=${page}&_fields=id,title,slug,excerpt,categories,tags,date`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FlashVoyage-TrendsScanner/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 400) {
          // No more pages
          hasMore = false;
          break;
        }
        throw new Error(`WP API returned ${response.status}`);
      }

      const posts = await response.json();
      if (posts.length === 0) {
        hasMore = false;
        break;
      }

      for (const post of posts) {
        allArticles.push({
          id: post.id,
          title: post.title?.rendered || '',
          slug: post.slug || '',
          excerpt: (post.excerpt?.rendered || '').replace(/<[^>]+>/g, '').trim(),
          date: post.date,
          url: `https://flashvoyage.com/${post.slug}/`,
        });
      }

      page++;
      // Respect rate limits
      await sleep(300);
    } catch (err) {
      warn(`WP API fetch error (page ${page}): ${err.message}`);
      hasMore = false;
    }
  }

  log(`Fetched ${allArticles.length} articles from WP`);
  wpArticlesCache = allArticles;
  wpArticlesCacheTime = now;
  return allArticles;
}

/**
 * Check if an article matches a given topic string.
 * Uses fuzzy matching on title, slug, and excerpt.
 *
 * Matching rules:
 * - Generic travel words (voyage, pas cher, prix, etc.) are excluded from word matching
 * - At least one "significant" word (destination name, specific term) must match
 * - Overall word match ratio must be >= 50%
 */
function articleMatchesTopic(article, topic) {
  const normalizedTopic = normalize(topic);

  // Words that are too generic to count as a match signal
  const genericWords = new Set([
    'voyage', 'voyager', 'pas', 'cher', 'prix', 'budget', 'cout',
    'comment', 'quand', 'partir', 'aller', 'faire', 'trouver',
    'meilleur', 'guide', 'conseil', 'avis', 'circuit', 'itineraire',
  ]);

  const topicWords = normalizedTopic.split(' ').filter(w => w.length > 2);
  const significantWords = topicWords.filter(w => !genericWords.has(w));

  // If no significant words, require exact phrase match in title/slug
  if (significantWords.length === 0) {
    const articleKey = normalize(`${article.title} ${article.slug.replace(/-/g, ' ')}`);
    return articleKey.includes(normalizedTopic);
  }

  const articleText = normalize(
    `${article.title} ${article.slug.replace(/-/g, ' ')} ${article.excerpt}`
  );

  // At least one significant word must appear in article text
  const sigMatch = significantWords.filter(word => articleText.includes(word)).length;
  if (sigMatch === 0) return false;

  // Overall match ratio (significant words only) must be >= 50%
  const matchRatio = significantWords.length > 0 ? sigMatch / significantWords.length : 0;

  return matchRatio >= 0.5;
}

// ─── Google Trends Data Sources ─────────────────────────────────────────────

/**
 * Fetch daily trending searches for France via the RSS feed.
 * The old google-trends-api dailyTrends() endpoint is dead (returns 404).
 * The RSS feed at trends.google.com/trending/rss?geo=FR is reliable and free.
 *
 * Returns an array of trending topics with traffic volume.
 */
async function fetchDailyTrends() {
  log('Fetching daily trending searches via RSS feed...');

  try {
    const response = await fetch(TRENDS_RSS_URL, {
      headers: {
        'User-Agent': 'FlashVoyage-TrendsScanner/1.0 (travel content)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`RSS feed returned HTTP ${response.status}`);
    }

    const xml = await response.text();
    const parsed = await parseXml(xml, { explicitArray: false, trim: true });

    const rawItems = parsed?.rss?.channel?.item;
    if (!rawItems) {
      warn('RSS feed returned no items');
      return [];
    }

    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    const trends = [];

    for (const item of items) {
      const title = item.title || '';
      const traffic = item['ht:approx_traffic'] || '0';
      const pubDate = item.pubDate || '';

      // Extract associated news items
      const rawNews = item['ht:news_item'];
      const newsArr = Array.isArray(rawNews) ? rawNews : (rawNews ? [rawNews] : []);
      const articles = newsArr.map(n => ({
        title: n['ht:news_item_title'] || '',
        url: n['ht:news_item_url'] || '',
        source: n['ht:news_item_source'] || '',
      }));

      trends.push({
        query: title,
        traffic: parseTrafficString(traffic),
        trafficFormatted: traffic,
        relatedQueries: [], // RSS does not provide related queries
        articles,
        date: pubDate,
        source: 'rss',
      });
    }

    log(`Found ${trends.length} daily trending searches via RSS`);
    return trends;
  } catch (err) {
    warn(`RSS daily trends failed: ${err.message}`);
    return [];
  }
}

/**
 * Proactively scan SE Asia destinations for rising search queries.
 * This is the primary travel-intelligence source: it queries Google Trends
 * for "voyage [destination]" and returns both top and rising related queries.
 *
 * This catches things like "vietnam visa 2026 +350%" or "bali budget backpacker Breakout"
 * that would never appear in the generic daily trends.
 *
 * @param {number} maxDestinations - How many destinations to scan (rate-limited)
 * @returns {Promise<Object>} { destinationInsights, risingQueries }
 */
async function scanDestinationQueries(maxDestinations = 6) {
  const cfg = await loadConfig();
  const destinations = cfg.destinations.seAsia.slice(0, maxDestinations);

  log(`Proactive scan: querying rising searches for ${destinations.length} SE Asia destinations...`);

  const insights = {};
  const allRising = [];

  for (const dest of destinations) {
    await sleep(cfg.rateLimiting.delayBetweenRequestsMs);

    const related = await fetchRelatedQueries(`voyage ${dest}`);

    if (related.top.length > 0 || related.rising.length > 0) {
      insights[dest] = {
        topQueries: related.top.slice(0, 10),
        risingQueries: related.rising.slice(0, 10),
      };

      // Collect all rising queries as trend-like objects
      for (const rq of related.rising) {
        allRising.push({
          query: rq.query,
          traffic: rq.value || 0,
          trafficFormatted: rq.formattedValue || '',
          relatedQueries: [],
          articles: [],
          date: new Date().toISOString(),
          source: 'related-rising',
          parentDestination: dest,
        });
      }
    }
  }

  log(`Destination scan complete: ${Object.keys(insights).length} destinations with data, ${allRising.length} rising queries found`);

  return { destinationInsights: insights, risingQueries: allRising };
}

/**
 * Fetch related queries for a specific keyword in France.
 * Returns top and rising related queries.
 */
async function fetchRelatedQueries(keyword) {
  const cfg = await loadConfig();

  try {
    const raw = await googleTrends.relatedQueries({
      keyword,
      geo: 'FR',
      hl: 'fr',
    });

    const data = parseTrendsResponse(raw);
    if (!data) return { top: [], rising: [] };

    const result = data?.default?.rankedList || [];
    const top = [];
    const rising = [];

    for (const list of result) {
      for (const item of (list.rankedKeyword || [])) {
        const entry = {
          query: item.query || '',
          value: item.value || 0,
          formattedValue: item.formattedValue || '',
          link: item.link || '',
        };

        if (item.hasData !== false) {
          if (item.formattedValue?.includes('%') || item.formattedValue === 'Breakout') {
            rising.push(entry);
          } else {
            top.push(entry);
          }
        }
      }
    }

    return { top, rising };
  } catch (err) {
    warn(`relatedQueries for "${keyword}" failed: ${err.message}`);
    return { top: [], rising: [] };
  }
}

/**
 * Fetch interest over time for multiple keywords (max 5).
 * Useful for comparing destination popularity.
 */
async function fetchInterestOverTime(keywords, startTime = null) {
  if (!startTime) {
    startTime = new Date();
    startTime.setMonth(startTime.getMonth() - 3); // Last 3 months
  }

  try {
    const raw = await googleTrends.interestOverTime({
      keyword: keywords.slice(0, 5), // Google Trends max 5 keywords
      geo: 'FR',
      hl: 'fr',
      startTime,
    });

    const data = parseTrendsResponse(raw);
    if (!data) return [];

    const timeline = data?.default?.timelineData || [];
    return timeline.map(point => ({
      time: point.formattedTime,
      timestamp: parseInt(point.time, 10) * 1000,
      values: (point.value || []).map((v, i) => ({
        keyword: keywords[i] || `keyword_${i}`,
        value: v,
      })),
    }));
  } catch (err) {
    warn(`interestOverTime failed: ${err.message}`);
    return [];
  }
}

/**
 * Parse traffic strings like "100K+", "500K+", "1M+" into numeric values.
 */
function parseTrafficString(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[+\s]/g, '').toUpperCase();
  if (cleaned.endsWith('M')) return parseFloat(cleaned) * 1000000;
  if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1000;
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

// ─── Travel Relevance Scoring ───────────────────────────────────────────────

/**
 * Score a trending topic for travel relevance to SE Asia.
 * Returns a score between 0 and 1.
 */
async function scoreTravelRelevance(topic) {
  const cfg = await loadConfig();
  const normalizedTopic = normalize(topic);

  let score = 0;

  // Check if topic mentions a monitored destination
  const allDestinations = [
    ...cfg.destinations.seAsia,
    ...cfg.destinations.broader,
  ];
  const destMatch = allDestinations.find(dest =>
    normalizedTopic.includes(normalize(dest))
  );
  if (destMatch) {
    score += 0.5; // Strong signal: destination mentioned
  }

  // Check if topic matches a travel category
  for (const [category, keywords] of Object.entries(cfg.categories)) {
    const catMatch = keywords.some(kw => normalizedTopic.includes(normalize(kw)));
    if (catMatch) {
      score += 0.3;
      break; // Only count once
    }
  }

  // Check for travel-adjacent generic terms
  const travelTerms = [
    'voyage', 'voyager', 'vacances', 'destination', 'hotel', 'auberge',
    'backpacker', 'plage', 'ile', 'temple', 'randonnee', 'trek',
    'nomade', 'expatrie', 'expat', 'sejour', 'hebergement', 'airbnb',
  ];
  const genericMatch = travelTerms.some(term => normalizedTopic.includes(term));
  if (genericMatch) {
    score += 0.2;
  }

  return Math.min(score, 1.0);
}

/**
 * Categorize a topic into a FlashVoyage content category.
 */
async function categorizeTopic(topic) {
  const cfg = await loadConfig();
  const normalizedTopic = normalize(topic);

  for (const [category, keywords] of Object.entries(cfg.categories)) {
    if (keywords.some(kw => normalizedTopic.includes(normalize(kw)))) {
      return category;
    }
  }
  return 'destination'; // default category
}

/**
 * Extract destination from a topic string, if any.
 */
async function extractDestination(topic) {
  const cfg = await loadConfig();
  const normalizedTopic = normalize(topic);

  const allDestinations = [
    ...cfg.destinations.seAsia,
    ...cfg.destinations.broader,
  ];

  for (const dest of allDestinations) {
    if (normalizedTopic.includes(normalize(dest))) {
      return dest;
    }
  }

  return null;
}

// ─── Main Scanner ───────────────────────────────────────────────────────────

/**
 * Main scan function: fetches trends from multiple sources,
 * cross-references with WP articles, identifies gaps and priorities.
 *
 * Two-source hybrid approach:
 * 1. RSS daily trends — what all of France is searching right now
 * 2. Proactive destination scan — rising travel queries for SE Asia destinations
 *
 * @param {Object} options
 * @param {boolean} options.includeDestinationScan - Scan SE Asia destinations for rising queries (default: true)
 * @param {number} options.destinationCount - How many destinations to scan (default: 6)
 * @param {boolean} options.includeInterest - Also fetch interest-over-time comparison (slower)
 * @returns {Promise<Object>} Full trends report
 */
export async function scanTrends(options = {}) {
  const {
    includeDestinationScan = true,
    destinationCount = 6,
    includeInterest = false,
  } = options;
  const cfg = await loadConfig();

  log('Starting trends scan...');
  const startTime = Date.now();

  // ── Source 1: RSS daily trending searches for France ──
  const dailyTrends = await fetchDailyTrends();

  // Score RSS trends for travel relevance
  const scoredTrends = [];
  for (const trend of dailyTrends) {
    const relevance = await scoreTravelRelevance(trend.query);
    if (relevance >= cfg.scoring.minScoreThreshold) {
      const category = await categorizeTopic(trend.query);
      const destination = await extractDestination(trend.query);
      scoredTrends.push({
        ...trend,
        relevanceScore: relevance,
        category,
        destination,
        compositeScore: (
          (trend.traffic > 0 ? Math.min(trend.traffic / 500000, 1) : 0) * cfg.scoring.trendVolumeWeight +
          relevance * cfg.scoring.relevanceWeight +
          cfg.scoring.recencyWeight // all daily trends are recent by definition
        ),
      });
    }
  }

  log(`${scoredTrends.length} travel-relevant RSS trends (from ${dailyTrends.length} total)`);

  // ── Source 2: Proactive SE Asia destination scan ──
  let destinationInsights = {};
  let risingTravelQueries = [];

  if (includeDestinationScan) {
    const destScan = await scanDestinationQueries(destinationCount);
    destinationInsights = destScan.destinationInsights;

    // Score rising travel queries and merge with scored trends
    for (const rq of destScan.risingQueries) {
      const relevance = await scoreTravelRelevance(rq.query);
      const category = await categorizeTopic(rq.query);
      const destination = rq.parentDestination || await extractDestination(rq.query);

      // Rising queries from destination scan always have high relevance
      const boostedRelevance = Math.max(relevance, 0.5);

      const scored = {
        ...rq,
        relevanceScore: boostedRelevance,
        category,
        destination,
        compositeScore: (
          0.3 * cfg.scoring.trendVolumeWeight + // Rising queries don't have absolute volume
          boostedRelevance * cfg.scoring.relevanceWeight +
          cfg.scoring.recencyWeight
        ),
      };

      risingTravelQueries.push(scored);
    }

    log(`${risingTravelQueries.length} rising travel queries from destination scan`);
  }

  // ── Merge and deduplicate all trends ──
  const allTrends = [...scoredTrends, ...risingTravelQueries];

  // Deduplicate by normalized query
  const seen = new Set();
  const dedupedTrends = allTrends.filter(t => {
    const key = normalize(t.query);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by composite score descending
  dedupedTrends.sort((a, b) => b.compositeScore - a.compositeScore);

  log(`${dedupedTrends.length} total unique travel trends after merge`);

  // ── Cross-reference with WP articles ──
  const articles = await fetchWpArticles();

  const articleMatches = [];
  const contentGaps = [];

  for (const trend of dedupedTrends) {
    const matchingArticles = articles.filter(article =>
      articleMatchesTopic(article, trend.query)
    );

    if (matchingArticles.length > 0) {
      articleMatches.push({
        trend: trend.query,
        traffic: trend.trafficFormatted,
        relevance: trend.relevanceScore,
        category: trend.category,
        destination: trend.destination,
        source: trend.source,
        articles: matchingArticles.map(a => ({ title: a.title, url: a.url })),
      });
    } else {
      contentGaps.push({
        trend: trend.query,
        traffic: trend.trafficFormatted,
        relevance: trend.relevanceScore,
        category: trend.category,
        destination: trend.destination,
        source: trend.source,
        compositeScore: trend.compositeScore,
        suggestedArticleTitle: generateArticleTitle(trend),
        suggestedReelAngle: generateReelAngle(trend),
      });
    }
  }

  // ── Build reel priorities ──
  const reelPriorities = buildReelPriorities(dedupedTrends);

  // ── Optional: interest-over-time comparison ──
  let interestComparison = [];
  if (includeInterest) {
    log('Fetching interest-over-time comparison...');
    await sleep(cfg.rateLimiting.delayBetweenRequestsMs);
    const topDests = ['voyage bali', 'voyage thailande', 'voyage vietnam', 'voyage philippines', 'voyage cambodge'];
    interestComparison = await fetchInterestOverTime(topDests);
    log(`Interest-over-time: ${interestComparison.length} data points`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Scan complete in ${elapsed}s`);

  return {
    timestamp: new Date().toISOString(),
    scanDurationMs: Date.now() - startTime,
    trendingTopics: dedupedTrends,
    articleMatches,
    contentGaps,
    reelPriorities,
    destinationInsights,
    interestComparison,
    stats: {
      totalDailyTrends: dailyTrends.length,
      travelRelevantRss: scoredTrends.length,
      risingDestQueries: risingTravelQueries.length,
      totalUniqueTrends: dedupedTrends.length,
      articlesChecked: articles.length,
      matchedTrends: articleMatches.length,
      gapTrends: contentGaps.length,
    },
  };
}

// ─── Reel Priority Builder ──────────────────────────────────────────────────

/**
 * Build destination priority scores for the reel pipeline.
 * Higher score = more reels should feature this destination.
 */
function buildReelPriorities(scoredTrends) {
  const destScores = {};

  for (const trend of scoredTrends) {
    if (trend.destination) {
      const dest = normalize(trend.destination);
      if (!destScores[dest]) {
        destScores[dest] = { totalScore: 0, count: 0, topics: [] };
      }
      destScores[dest].totalScore += trend.compositeScore;
      destScores[dest].count++;
      destScores[dest].topics.push(trend.query);
    }
  }

  // Normalize scores to 0-1 range
  const maxScore = Math.max(...Object.values(destScores).map(d => d.totalScore), 1);

  const priorities = {};
  for (const [dest, data] of Object.entries(destScores)) {
    priorities[dest] = {
      score: Math.round((data.totalScore / maxScore) * 100) / 100,
      trendCount: data.count,
      topics: data.topics.slice(0, 5), // Top 5 trending topics for this dest
    };
  }

  return priorities;
}

// ─── Content Suggestion Generators ──────────────────────────────────────────

/**
 * Generate a suggested article title for a content gap.
 */
function generateArticleTitle(trend) {
  const query = trend.query;
  const dest = trend.destination;
  const cat = trend.category;

  const templates = {
    visa: dest
      ? `${capitalize(dest)} : Guide Complet Visa ${new Date().getFullYear()} (Formalites, Delais, Astuces)`
      : `Visa ${capitalize(query)} : Tout Ce Qu'il Faut Savoir en ${new Date().getFullYear()}`,
    budget: dest
      ? `Budget ${capitalize(dest)} ${new Date().getFullYear()} : Combien Coute Vraiment un Voyage ?`
      : `${capitalize(query)} : Le Guide Budget Complet`,
    securite: dest
      ? `${capitalize(dest)} Est-il Dangereux ? La Verite sur la Securite en ${new Date().getFullYear()}`
      : `${capitalize(query)} : Ce Que les Voyageurs Doivent Savoir`,
    transport: dest
      ? `Comment Se Deplacer a ${capitalize(dest)} : Guide Transport Complet`
      : `${capitalize(query)} : Guide Pratique`,
    itineraire: dest
      ? `Itineraire ${capitalize(dest)} : Le Circuit Parfait de 2 Semaines`
      : `${capitalize(query)} : L'Itineraire Ideal`,
    pratique: dest
      ? `${capitalize(dest)} : Nos Conseils Pratiques Pour Voyageurs`
      : `${capitalize(query)} : Guide Pratique ${new Date().getFullYear()}`,
    destination: dest
      ? `${capitalize(dest)} ${new Date().getFullYear()} : Le Guide Ultime Pour Voyageurs Francais`
      : `${capitalize(query)} : Decouverte et Conseils`,
  };

  return templates[cat] || templates.destination;
}

/**
 * Generate a suggested reel angle for a trending topic.
 */
function generateReelAngle(trend) {
  const dest = trend.destination;
  const cat = trend.category;

  const angles = {
    visa: `Reel "Savais-tu ?" sur les conditions de visa ${dest ? `pour ${capitalize(dest)}` : ''} — format poll/quiz`,
    budget: `Reel "Budget Jour" ${dest ? `a ${capitalize(dest)}` : ''} — format listicle avec prix reels`,
    securite: `Reel "3 arnaques a eviter" ${dest ? `a ${capitalize(dest)}` : ''} — format avant/apres ou humor`,
    transport: `Reel "Comment se deplacer" ${dest ? `a ${capitalize(dest)}` : ''} — format pick avec photos`,
    itineraire: `Reel "X spots a ne pas rater" ${dest ? `a ${capitalize(dest)}` : ''} — format pick`,
    pratique: `Reel "Ce que personne ne te dit" ${dest ? `sur ${capitalize(dest)}` : ''} — format humor relatable`,
    destination: `Reel decouverte ${dest ? capitalize(dest) : trend.query} — format pick ou month`,
  };

  return angles[cat] || angles.destination;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Daily Report Generator ─────────────────────────────────────────────────

/**
 * Generate a human-readable daily trends report.
 * Suitable for logging, Slack/Discord notifications, or editorial briefings.
 */
export async function getDailyTrendsReport(options = {}) {
  const scanResult = await scanTrends(options);
  const { trendingTopics, articleMatches, contentGaps, reelPriorities, destinationInsights, stats } = scanResult;

  const lines = [];
  const divider = '─'.repeat(60);

  lines.push('');
  lines.push(`${'═'.repeat(60)}`);
  lines.push(`  FLASHVOYAGE — Rapport Tendances du ${new Date().toLocaleDateString('fr-FR')}`);
  lines.push(`${'═'.repeat(60)}`);
  lines.push('');

  // Stats summary
  lines.push(`  Statistiques :`);
  lines.push(`   Tendances RSS scannees       : ${stats.totalDailyTrends}`);
  lines.push(`   Pertinentes voyage (RSS)      : ${stats.travelRelevantRss}`);
  lines.push(`   Queries montantes (dest scan) : ${stats.risingDestQueries}`);
  lines.push(`   Total tendances uniques       : ${stats.totalUniqueTrends}`);
  lines.push(`   Articles WP verifies          : ${stats.articlesChecked}`);
  lines.push(`   Tendances avec article        : ${stats.matchedTrends}`);
  lines.push(`   Lacunes de contenu            : ${stats.gapTrends}`);
  lines.push('');

  // Top trending travel topics
  if (trendingTopics.length > 0) {
    lines.push(divider);
    lines.push('🔥 TOP TENDANCES VOYAGE :');
    lines.push(divider);
    for (const topic of trendingTopics.slice(0, 10)) {
      const destTag = topic.destination ? ` [${topic.destination.toUpperCase()}]` : '';
      lines.push(`   ${topic.query} (${topic.trafficFormatted})${destTag} — score: ${topic.compositeScore.toFixed(2)}`);
    }
    lines.push('');
  }

  // Content gaps (opportunities)
  if (contentGaps.length > 0) {
    lines.push(divider);
    lines.push('🎯 OPPORTUNITES DE CONTENU (pas d\'article existant) :');
    lines.push(divider);
    for (const gap of contentGaps.slice(0, 8)) {
      lines.push(`   ✏️  "${gap.trend}" (${gap.traffic})`);
      lines.push(`      → Article : ${gap.suggestedArticleTitle}`);
      lines.push(`      → Reel : ${gap.suggestedReelAngle}`);
      lines.push('');
    }
  }

  // Article matches (boost existing content)
  if (articleMatches.length > 0) {
    lines.push(divider);
    lines.push('📈 ARTICLES EXISTANTS A BOOSTER (matching trends) :');
    lines.push(divider);
    for (const match of articleMatches.slice(0, 5)) {
      lines.push(`   "${match.trend}" (${match.traffic})`);
      for (const article of match.articles.slice(0, 2)) {
        lines.push(`      → ${article.title}`);
        lines.push(`        ${article.url}`);
      }
      lines.push('');
    }
  }

  // Reel priorities
  if (Object.keys(reelPriorities).length > 0) {
    lines.push(divider);
    lines.push('🎬 PRIORITES REELS (destinations a mettre en avant) :');
    lines.push(divider);
    const sorted = Object.entries(reelPriorities)
      .sort(([, a], [, b]) => b.score - a.score);
    for (const [dest, data] of sorted.slice(0, 8)) {
      const bar = '█'.repeat(Math.round(data.score * 20));
      lines.push(`   ${capitalize(dest).padEnd(15)} ${bar} ${data.score} (${data.trendCount} tendances)`);
    }
    lines.push('');
  }

  // Destination insights (rising queries)
  if (Object.keys(destinationInsights).length > 0) {
    lines.push(divider);
    lines.push('  QUERIES MONTANTES PAR DESTINATION :');
    lines.push(divider);
    for (const [dest, data] of Object.entries(destinationInsights)) {
      if (data.risingQueries.length > 0) {
        lines.push(`   ${capitalize(dest)} :`);
        for (const rq of data.risingQueries.slice(0, 5)) {
          lines.push(`      ${rq.query} (${rq.formattedValue})`);
        }
        lines.push('');
      }
    }
  }

  lines.push(`${'═'.repeat(60)}`);
  lines.push(`  Scan termine en ${(scanResult.scanDurationMs / 1000).toFixed(1)}s`);
  lines.push(`${'═'.repeat(60)}`);
  lines.push('');

  const report = lines.join('\n');
  return { report, data: scanResult };
}

// ─── Trend Priority File Writer ─────────────────────────────────────────────

const TREND_PRIORITIES_PATH = join(__dirname, '..', 'reels', 'data', 'trend-priorities.json');

/**
 * Run a scan and write the trend-priorities.json file
 * that the reel pipeline reads to prioritize content.
 *
 * Designed to be called daily (e.g., via cron or pipeline-runner).
 */
export async function updateReelTrendPriorities() {
  log('Updating reel trend priorities...');

  const scanResult = await scanTrends({ includeDestinationScan: true, includeInterest: false });

  // Build the priority file
  const topDestinations = Object.entries(scanResult.reelPriorities)
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 10)
    .map(([dest]) => dest);

  const trendingTopics = scanResult.trendingTopics
    .slice(0, 15)
    .map(t => t.query);

  const gapTopics = scanResult.contentGaps
    .slice(0, 10)
    .map(g => g.trend);

  const reelPriority = {};
  for (const [dest, data] of Object.entries(scanResult.reelPriorities)) {
    reelPriority[dest] = data.score;
  }

  // Content suggestions for reels
  const reelSuggestions = scanResult.contentGaps
    .slice(0, 5)
    .map(gap => ({
      topic: gap.trend,
      destination: gap.destination,
      category: gap.category,
      angle: gap.suggestedReelAngle,
      articleSuggestion: gap.suggestedArticleTitle,
    }));

  const output = {
    lastUpdated: new Date().toISOString(),
    topDestinations,
    trendingTopics,
    contentGaps: gapTopics,
    reelPriority,
    reelSuggestions,
    stats: scanResult.stats,
  };

  // Ensure directory exists
  const dir = dirname(TREND_PRIORITIES_PATH);
  await mkdir(dir, { recursive: true });

  await writeFile(TREND_PRIORITIES_PATH, JSON.stringify(output, null, 2), 'utf-8');
  log(`Wrote trend priorities to ${TREND_PRIORITIES_PATH}`);

  return output;
}

// ─── Destination Deep Dive ──────────────────────────────────────────────────

/**
 * Deep dive into a specific destination: fetch related queries
 * and interest-over-time data. Useful for editorial planning.
 *
 * @param {string} destination - e.g., "bali", "vietnam"
 * @returns {Promise<Object>} Detailed trend data for the destination
 */
export async function destinationDeepDive(destination) {
  const cfg = await loadConfig();
  const dest = normalize(destination);

  log(`Deep dive into "${destination}"...`);

  // Fetch related queries for several angles
  const angles = [
    `voyage ${destination}`,
    `${destination} budget`,
    `${destination} visa`,
    `${destination} itineraire`,
  ];

  const relatedByAngle = {};
  for (const angle of angles) {
    await sleep(cfg.rateLimiting.delayBetweenRequestsMs);
    relatedByAngle[angle] = await fetchRelatedQueries(angle);
  }

  // Interest over time: compare with competitors
  await sleep(cfg.rateLimiting.delayBetweenRequestsMs);
  const competitors = cfg.destinations.seAsia
    .filter(d => normalize(d) !== dest)
    .slice(0, 4)
    .map(d => `voyage ${d}`);

  const interestComparison = await fetchInterestOverTime([
    `voyage ${destination}`,
    ...competitors,
  ]);

  // Cross-reference with existing articles
  const articles = await fetchWpArticles();
  const matchingArticles = articles.filter(a =>
    normalize(`${a.title} ${a.slug}`).includes(dest)
  );

  return {
    destination,
    timestamp: new Date().toISOString(),
    relatedQueries: relatedByAngle,
    interestComparison,
    existingArticles: matchingArticles.map(a => ({ title: a.title, url: a.url })),
    articleCount: matchingArticles.length,
  };
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1].endsWith('trends-scanner.js') ||
  process.argv[1] === fileURLToPath(import.meta.url)
);

if (isMain) {
  const command = process.argv[2] || 'report';

  (async () => {
    try {
      switch (command) {
        case 'scan': {
          const result = await scanTrends({ includeDestinationScan: true, includeInterest: true });
          console.log(JSON.stringify(result, null, 2));
          break;
        }

        case 'report': {
          const { report } = await getDailyTrendsReport();
          console.log(report);
          break;
        }

        case 'update-reels': {
          const result = await updateReelTrendPriorities();
          console.log(JSON.stringify(result, null, 2));
          break;
        }

        case 'deepdive': {
          const dest = process.argv[3];
          if (!dest) {
            console.error('Usage: node trends-scanner.js deepdive <destination>');
            process.exit(1);
          }
          const result = await destinationDeepDive(dest);
          console.log(JSON.stringify(result, null, 2));
          break;
        }

        default:
          console.log('Usage: node trends-scanner.js [scan|report|update-reels|deepdive <dest>]');
          console.log('  scan         — Full JSON scan output');
          console.log('  report       — Human-readable daily report (default)');
          console.log('  update-reels — Write trend-priorities.json for reel pipeline');
          console.log('  deepdive     — Deep dive into a specific destination');
      }
    } catch (err) {
      console.error(`[TRENDS] Fatal error: ${err.message}`);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  fetchDailyTrends,
  fetchRelatedQueries,
  fetchInterestOverTime,
  fetchWpArticles,
  scoreTravelRelevance,
  scanDestinationQueries,
};
