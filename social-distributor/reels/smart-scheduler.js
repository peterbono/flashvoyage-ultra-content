/**
 * Smart Scheduler — FlashVoyage Reels v2
 *
 * Decides WHAT to publish at each time slot based on:
 * 1. Breaking news (RSS) — if score >60, override the scheduled format
 * 2. Google Trends — prioritize trending destinations
 * 3. Performance analytics — boost winning formats, reduce losers
 * 4. Content dedup — don't repeat same destination within 3 days
 * 5. Base calendar — fallback weekly rotation
 *
 * Called by GitHub Actions at each cron trigger.
 * Returns: { format, articleId, destination, reason, isBreakingNews }
 *
 * Log prefix: [SCHEDULER]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const HISTORY_PATH = join(DATA_DIR, 'content-history.json');
const TRENDS_PATH = join(DATA_DIR, 'trend-priorities.json');
const PERF_PATH = join(DATA_DIR, 'performance-weights.json');

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [SCHEDULER] ${msg}`);
}

function logWarn(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.warn(`[${ts}] [SCHEDULER] WARN: ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] [SCHEDULER] ERROR: ${msg}`);
}

// ── Base Calendar (fallback when no overrides) ──────────────────────────────
// hour (UTC) -> day of week (1=Mon ... 7=Sun) -> format
// 05 UTC = 7h00 Paris summer / 6h00 winter
// 10 UTC = 12h00 Paris (the cron is at 10:30 but we round to 10)
// 16 UTC = 18h00 Paris

// Strategy (CEO + Growth Hacker, 2026-04-05):
// avantapres: 2/day (morning + midday)  | cost-vs: 1/day (morning or midday)
// leaderboard: 1 every 2 days           | best-time: 1 every 2 days
// pick: 1/day max                       | budget: 1 every 2 days
// humor/humor-tweet: 1 every 3 days     | month: 1 every 3 days (first Tue only)
// poll: KILLED                          | versus: KILLED

const BASE_CALENDAR = {
  '05': {
    1: 'avantapres',   // Mon morning: Avant/Apres (star format)
    2: 'cost-vs',      // Tue morning: Cost vs France (star format)
    3: 'avantapres',   // Wed morning: Avant/Apres
    4: 'cost-vs',      // Thu morning: Cost vs France
    5: 'avantapres',   // Fri morning: Avant/Apres
    6: 'cost-vs',      // Sat morning: Cost vs France
    7: 'avantapres',   // Sun morning: Avant/Apres
  },
  '10': {
    1: 'avantapres',   // Mon midday: Avant/Apres (2nd daily slot)
    2: 'avantapres',   // Tue midday: Avant/Apres (2nd daily slot)
    3: 'avantapres',   // Wed midday: Avant/Apres (2nd daily slot)
    4: 'avantapres',   // Thu midday: Avant/Apres (2nd daily slot)
    5: 'avantapres',   // Fri midday: Avant/Apres (2nd daily slot)
    6: 'avantapres',   // Sat midday: Avant/Apres (2nd daily slot)
    7: 'avantapres',   // Sun midday: Avant/Apres (2nd daily slot)
  },
  '16': {
    1: 'pick',         // Mon evening: Trip Pick
    2: 'leaderboard',  // Tue evening: Top 10 Leaderboard
    3: 'humor',        // Wed evening: Humor
    4: 'budget',       // Thu evening: Budget Jour
    5: 'best-time',    // Fri evening: Best Time to Visit
    6: 'humor-tweet',  // Sat evening: Humor Tweet
    7: 'month',        // Sun evening: Ou Partir En (guarded: 1st Tue only)
  },
};

// All valid format names for sanity checks
const VALID_FORMATS = new Set([
  'poll', 'pick', 'humor', 'humor-tweet', 'budget', 'versus', 'avantapres', 'month',
  'cost-vs', 'leaderboard', 'best-time',
]);

// ── Killed Formats ─────────────────────────────────────────────────────────
// Formats that are permanently disabled based on CEO + Growth Hacker analysis.
// These are NEVER scheduled, even if they appear in the base calendar.
// The set is loaded from performance-weights.json (killedFormats array) at init,
// with a hardcoded fallback so the blacklist survives even if the JSON is missing.

const KILLED_FORMATS_HARDCODED = new Set(['poll', 'versus']);

function loadKilledFormats() {
  try {
    if (existsSync(PERF_PATH)) {
      const data = JSON.parse(readFileSync(PERF_PATH, 'utf-8'));
      if (Array.isArray(data.killedFormats) && data.killedFormats.length > 0) {
        return new Set(data.killedFormats);
      }
    }
  } catch { /* fall through to hardcoded */ }
  return KILLED_FORMATS_HARDCODED;
}

const KILLED_FORMATS = loadKilledFormats();

// ── Dedup Constraints ───────────────────────────────────────────────────────

const DEDUP_DESTINATION_DAYS = 3;   // Don't repeat same destination within 3 days
const DEDUP_FORMAT_SAME_SLOT = 2;   // Don't repeat same format in same time slot 2 days in a row
const DEDUP_ARTICLE_DAYS = 7;       // Don't reuse same article within 7 days

// ── Content History ─────────────────────────────────────────────────────────

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) {
    return { recentDestinations: [], recentFormats: [], recentArticleIds: [] };
  }
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
  } catch (err) {
    logWarn(`Failed to parse content-history.json: ${err.message}`);
    return { recentDestinations: [], recentFormats: [], recentArticleIds: [] };
  }
}

function saveHistory(history) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

/**
 * Record a published piece of content in the history tracker.
 * Called after successful publication.
 */
export function recordPublication({ format, articleId, destination }) {
  const history = loadHistory();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  if (destination) {
    history.recentDestinations.push({
      name: destination.toLowerCase(),
      date: today,
      format,
    });
  }

  history.recentFormats.push({
    format,
    date: now,
  });

  if (articleId) {
    if (!history.recentArticleIds.includes(articleId)) {
      history.recentArticleIds.push(articleId);
    }
  }

  // Prune old entries to keep the file small
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14); // Keep 14 days of history
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  history.recentDestinations = history.recentDestinations.filter(
    d => d.date >= cutoffStr
  );
  history.recentFormats = history.recentFormats.filter(
    f => f.date >= cutoffStr
  );
  // Keep last 100 article IDs
  if (history.recentArticleIds.length > 100) {
    history.recentArticleIds = history.recentArticleIds.slice(-100);
  }

  saveHistory(history);
  log(`Recorded publication: format=${format}, destination=${destination || 'none'}, articleId=${articleId || 'none'}`);
}

// ── Dedup Checks ────────────────────────────────────────────────────────────

/**
 * Check if a destination was used recently (within DEDUP_DESTINATION_DAYS).
 */
function isDestinationRecent(destination, history) {
  if (!destination) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEDUP_DESTINATION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const dest = destination.toLowerCase();

  return history.recentDestinations.some(
    d => d.name === dest && d.date >= cutoffStr
  );
}

/**
 * Check if the same format was used in the same time slot yesterday.
 */
function wasFormatInSameSlotYesterday(format, hourSlot, history) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  return history.recentFormats.some(f => {
    if (f.format !== format) return false;
    if (!f.date.startsWith(yesterdayStr)) return false;
    // Check if it was in the same hour slot
    const entryHour = new Date(f.date).getUTCHours();
    const slotHour = parseInt(hourSlot, 10);
    return Math.abs(entryHour - slotHour) <= 1; // Within 1 hour tolerance
  });
}

/**
 * Check if an article was used recently (within DEDUP_ARTICLE_DAYS).
 */
function isArticleRecent(articleId, history) {
  if (!articleId) return false;
  return history.recentArticleIds.includes(articleId);
}

/**
 * Get list of recently used destinations (for filtering article selection).
 */
function getRecentDestinations(history) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEDUP_DESTINATION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return history.recentDestinations
    .filter(d => d.date >= cutoffStr)
    .map(d => d.name);
}

// ── Trend Priorities ────────────────────────────────────────────────────────

function loadTrendPriorities() {
  if (!existsSync(TRENDS_PATH)) return {};
  try {
    const data = JSON.parse(readFileSync(TRENDS_PATH, 'utf-8'));
    return data.reelPriority || data.destinations || {};
  } catch {
    return {};
  }
}

/**
 * Get the top trending destination that hasn't been used recently.
 * Returns { destination, score } or null.
 */
function getBestTrendingDestination(history) {
  const trends = loadTrendPriorities();
  const recentDests = new Set(getRecentDestinations(history));

  // Sort destinations by trend score descending
  const sorted = Object.entries(trends)
    .map(([dest, score]) => ({ destination: dest, score: typeof score === 'number' ? score : score?.score || 0 }))
    .sort((a, b) => b.score - a.score);

  // Find first non-recent destination
  for (const entry of sorted) {
    if (!recentDests.has(entry.destination.toLowerCase())) {
      return entry;
    }
  }

  return sorted[0] || null; // Fallback to top trending even if recent
}

// ── Performance Weights ─────────────────────────────────────────────────────

function loadPerformanceWeights() {
  if (!existsSync(PERF_PATH)) return {};
  try {
    const data = JSON.parse(readFileSync(PERF_PATH, 'utf-8'));
    return data.formatScores || {};
  } catch {
    return {};
  }
}

/**
 * Apply performance-based format adjustment.
 *
 * 1. If the base format is KILLED, replace it with the best alive performer.
 * 2. If a format's engagement score is >20% above the average of all formats,
 *    it can "steal" a slot from an underperformer (a format scoring >20% below avg).
 *
 * Returns the adjusted format (may be different from baseFormat).
 * Guaranteed: never returns a killed format.
 */
function applyPerformanceBoost(baseFormat, hourSlot, history) {
  const weights = loadPerformanceWeights();
  const formatNames = Object.keys(weights);

  // ── Hard block: never return a killed format ──────────────────────────────
  const isBaseKilled = KILLED_FORMATS.has(baseFormat);

  if (isBaseKilled) {
    log(`Format "${baseFormat}" is KILLED — finding replacement`);
  }

  if (formatNames.length < 3 && !isBaseKilled) {
    // Not enough data to make meaningful adjustments
    return baseFormat;
  }

  // Filter out killed formats from the scoring pool
  const aliveFormats = formatNames.filter(f => !KILLED_FORMATS.has(f));
  const scores = aliveFormats.map(f => weights[f]);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;

  if (avg === 0 && !isBaseKilled) return baseFormat;

  const baseScore = isBaseKilled ? 0 : (weights[baseFormat] || avg);
  const baseRatio = avg > 0 ? baseScore / avg : 0;

  // If the base format is killed OR underperforming (>20% below average)
  if (isBaseKilled || baseRatio < 0.8) {
    // Find the best-performing alive format that fits this slot
    const candidates = aliveFormats
      .filter(f => f !== baseFormat)
      .filter(f => VALID_FORMATS.has(f))
      .filter(f => !isBaseKilled ? (weights[f] / avg) > 1.2 : true) // For killed: any alive format is a candidate
      .filter(f => !wasFormatInSameSlotYesterday(f, hourSlot, history))
      .sort((a, b) => weights[b] - weights[a]);

    if (candidates.length > 0) {
      const replacement = candidates[0];
      if (isBaseKilled) {
        log(`Killed format "${baseFormat}" replaced by top performer "${replacement}" (score: ${weights[replacement]})`);
      } else {
        log(`Performance boost: replacing underperforming "${baseFormat}" (${(baseRatio * 100).toFixed(0)}% of avg) with "${replacement}" (${((weights[replacement] / avg) * 100).toFixed(0)}% of avg)`);
      }
      return replacement;
    }

    // Even without dedup-free candidates, still replace killed formats
    if (isBaseKilled && aliveFormats.length > 0) {
      const fallback = aliveFormats.sort((a, b) => (weights[b] || 0) - (weights[a] || 0))[0];
      log(`Killed format "${baseFormat}" replaced by fallback "${fallback}" (no dedup-free candidates)`);
      return fallback;
    }
  }

  return baseFormat;
}

// ── Breaking News Check ─────────────────────────────────────────────────────

/**
 * Lightweight breaking news check for the scheduler.
 * Imports and calls the scoring logic from breaking-news.js.
 * Returns the highest-scoring item or null.
 */
async function checkBreakingNewsForScheduler() {
  try {
    // Dynamic import to avoid circular deps and keep scheduler lightweight
    const breakingModule = await import('../breaking-news.js');
    const { scoreNewsItem, SCORE_THRESHOLD_QUEUE } = breakingModule;

    // Fetch RSS (reuse the existing scraper)
    const { fetchLatestNews } = await import('../sources/rss-scraper.js');
    const newsItems = await fetchLatestNews(12); // Last 12 hours for freshness

    if (!newsItems || newsItems.length === 0) {
      return null;
    }

    // Score each item
    const scored = newsItems.map(item => ({
      ...item,
      scoring: scoreNewsItem(item),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.scoring.score - a.scoring.score);

    // Return the top item if it passes the queue threshold (30)
    const top = scored[0];
    if (top && top.scoring.score >= SCORE_THRESHOLD_QUEUE) {
      return {
        headline: top.title,
        score: top.scoring.score,
        region: top.region || null,
        categories: top.scoring.categories,
        link: top.link,
        source: top.source,
        pubDate: top.pubDate,
        rawItem: top,
      };
    }

    return null;
  } catch (err) {
    logWarn(`Breaking news check failed (non-fatal): ${err.message}`);
    return null;
  }
}

// ── Article Selection ───────────────────────────────────────────────────────

/**
 * Pick the best article for the given format and trending destination.
 * Uses the WP REST API to fetch candidates and filters by dedup rules.
 *
 * Returns { articleId, destination } or { articleId: null, destination: null }.
 */
async function selectArticle(format, trendingDest, history) {
  try {
    const { fetchAllPosts } = await import('../extractor.js');
    const posts = await fetchAllPosts();

    if (!posts || posts.length === 0) {
      log('No articles found in WordPress');
      return { articleId: null, destination: null };
    }

    const recentIds = new Set(history.recentArticleIds || []);
    const recentDests = new Set(getRecentDestinations(history));

    // Filter out recently used articles
    let candidates = posts.filter(p => !recentIds.has(p.id));

    // If we have a trending destination, try to find a matching article
    if (trendingDest) {
      const destLower = trendingDest.toLowerCase();
      const destMatches = candidates.filter(p => {
        const title = (p.title?.rendered || '').toLowerCase();
        const slug = (p.slug || '').toLowerCase();
        return title.includes(destLower) || slug.includes(destLower);
      });

      if (destMatches.length > 0) {
        const picked = destMatches[0];
        log(`Selected trending article #${picked.id}: "${(picked.title?.rendered || '').slice(0, 50)}" (matches trend: ${trendingDest})`);
        return {
          articleId: picked.id,
          destination: trendingDest,
        };
      }
    }

    // Filter out articles whose destination was used recently
    const filtered = candidates.filter(p => {
      const slug = (p.slug || '').toLowerCase();
      return !Array.from(recentDests).some(d => slug.includes(d));
    });

    // Pick from filtered if available, otherwise from all candidates
    const pool = filtered.length > 0 ? filtered : candidates;

    if (pool.length === 0) {
      log('All articles recently used, picking from full pool');
      const fallback = posts[Math.floor(Math.random() * Math.min(posts.length, 10))];
      return { articleId: fallback.id, destination: null };
    }

    // Pick a random article from the top 10 (to add variety)
    const topPool = pool.slice(0, Math.min(pool.length, 10));
    const picked = topPool[Math.floor(Math.random() * topPool.length)];
    const destGuess = extractDestinationFromSlug(picked.slug || '');

    log(`Selected article #${picked.id}: "${(picked.title?.rendered || '').slice(0, 50)}" (destination: ${destGuess || 'unknown'})`);

    return {
      articleId: picked.id,
      destination: destGuess,
    };
  } catch (err) {
    logError(`Article selection failed: ${err.message}`);
    return { articleId: null, destination: null };
  }
}

/**
 * Best-effort destination extraction from a WP slug.
 * e.g. "budget-bali-2-semaines" -> "bali"
 */
function extractDestinationFromSlug(slug) {
  const KNOWN_DESTINATIONS = [
    'bali', 'thailande', 'vietnam', 'philippines', 'cambodge', 'laos',
    'myanmar', 'malaisie', 'singapour', 'indonesie', 'jakarta', 'bangkok',
    'chiang-mai', 'phuket', 'koh-samui', 'koh-phangan', 'hanoi',
    'ho-chi-minh', 'da-nang', 'hoi-an', 'siem-reap', 'luang-prabang',
    'kuala-lumpur', 'cebu', 'palawan', 'el-nido', 'siargao', 'ubud',
    'lombok', 'nusa-penida', 'java', 'raja-ampat', 'japon', 'coree',
    'sri-lanka', 'inde', 'maldives', 'nepal',
  ];

  const slugLower = slug.toLowerCase();
  for (const dest of KNOWN_DESTINATIONS) {
    if (slugLower.includes(dest)) return dest;
  }
  return null;
}

// ── "Ou Partir En" Month Guard ──────────────────────────────────────────────

/**
 * The "month" format should only run on the first Tuesday of each month.
 * If it's not the first Tuesday, downgrade to "pick".
 */
function guardMonthFormat(format, now) {
  if (format !== 'month') return format;

  const dayOfMonth = now.getUTCDate();
  const dayOfWeek = now.getUTCDay(); // 0=Sun ... 6=Sat

  // First Tuesday = day 1-7 AND Tuesday (dayOfWeek === 2)
  if (dayOfMonth <= 7 && dayOfWeek === 2) {
    return 'month';
  }

  log(`"month" format downgraded to "pick" (not first Tuesday: day ${dayOfMonth}, dow ${dayOfWeek})`);
  return 'pick';
}

// ── Main Decision Function ──────────────────────────────────────────────────

/**
 * Determine what to publish right now.
 *
 * Priority order:
 * 1. Breaking news (score >=80 = IMMEDIATE override any slot)
 * 2. Breaking news (score 60-79 = override morning slot only)
 * 3. Trending destination boost (pick article matching trend)
 * 4. Performance-weighted format swap (boost winners, replace losers)
 * 5. Dedup guard (don't repeat same format in same slot 2 days running)
 * 6. Base calendar (fallback)
 *
 * @param {Object} [options] - Override options
 * @param {Date}   [options.now]    - Override current time (for testing)
 * @param {boolean} [options.skipNews] - Skip breaking news check (faster)
 * @returns {Promise<{ format: string, articleId: number|null, destination: string|null, reason: string, isBreakingNews: boolean, newsItem?: Object }>}
 */
export async function decideContent(options = {}) {
  const now = options.now || new Date();
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const dow = now.getUTCDay() || 7; // Convert Sunday 0 -> 7

  log('='.repeat(60));
  log(`Decision cycle: ${now.toISOString()} (UTC hour=${hour}, dow=${dow})`);
  log('='.repeat(60));

  const history = loadHistory();

  // ── 1. Check breaking news ────────────────────────────────────────────────
  let breakingNews = null;
  if (!options.skipNews) {
    try {
      breakingNews = await checkBreakingNewsForScheduler();
      if (breakingNews) {
        log(`Breaking news detected: score=${breakingNews.score}, headline="${breakingNews.headline?.slice(0, 60)}"`);
      }
    } catch (err) {
      logWarn(`Breaking news check error: ${err.message}`);
    }
  }

  // Score >= 80: IMMEDIATE override, any time slot
  if (breakingNews && breakingNews.score >= 80) {
    log(`IMMEDIATE OVERRIDE: Breaking news score ${breakingNews.score} >= 80`);
    return {
      format: 'pick', // Breaking news becomes a Trip Pick with news angle
      articleId: null,
      destination: breakingNews.region,
      reason: `BREAKING NEWS (score ${breakingNews.score}): ${breakingNews.headline?.slice(0, 80)}`,
      isBreakingNews: true,
      newsItem: breakingNews,
    };
  }

  // Score 60-79: Override morning slot (05h UTC) only
  if (breakingNews && breakingNews.score >= 60 && hour === '05') {
    log(`Morning slot override: Breaking news score ${breakingNews.score} >= 60`);
    return {
      format: 'pick',
      articleId: null,
      destination: breakingNews.region,
      reason: `Breaking news override morning slot (score ${breakingNews.score}): ${breakingNews.headline?.slice(0, 80)}`,
      isBreakingNews: true,
      newsItem: breakingNews,
    };
  }

  // ── 2. Get base format from calendar ──────────────────────────────────────
  let baseFormat = BASE_CALENDAR[hour]?.[dow];

  if (!baseFormat) {
    // If the hour doesn't match exactly, find the closest slot
    const hours = Object.keys(BASE_CALENDAR).map(Number);
    const currentHour = parseInt(hour, 10);
    const closest = hours.reduce((prev, curr) =>
      Math.abs(curr - currentHour) < Math.abs(prev - currentHour) ? curr : prev
    );
    baseFormat = BASE_CALENDAR[String(closest).padStart(2, '0')]?.[dow] || 'pick';
    log(`No exact calendar match for hour ${hour}, using closest slot (${closest}h): ${baseFormat}`);
  }

  // Guard "month" format (only first Tuesday)
  baseFormat = guardMonthFormat(baseFormat, now);

  log(`Base calendar format: ${baseFormat}`);

  // ── 3. Apply performance boost ────────────────────────────────────────────
  let finalFormat = applyPerformanceBoost(baseFormat, hour, history);

  // ── 4. Apply dedup guard ──────────────────────────────────────────────────
  if (wasFormatInSameSlotYesterday(finalFormat, hour, history)) {
    // Try to find an alternative format for this slot
    const slotFormats = BASE_CALENDAR[hour] || {};
    const alternatives = Object.values(slotFormats)
      .filter(f => f !== finalFormat && VALID_FORMATS.has(f))
      .filter(f => !KILLED_FORMATS.has(f))
      .filter(f => !wasFormatInSameSlotYesterday(f, hour, history));

    if (alternatives.length > 0) {
      const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
      log(`Dedup guard: "${finalFormat}" was in this slot yesterday, swapping to "${alt}"`);
      finalFormat = alt;
    } else {
      log(`Dedup guard: "${finalFormat}" repeated but no alternatives available, keeping it`);
    }
  }

  // ── 4b. Final killed-format safety net ─────────────────────────────────────
  // This should never trigger (applyPerformanceBoost already handles it),
  // but serves as a last-resort guard to guarantee killed formats never publish.
  if (KILLED_FORMATS.has(finalFormat)) {
    const safeDefault = 'avantapres';
    log(`SAFETY NET: "${finalFormat}" is killed, forcing fallback to "${safeDefault}"`);
    finalFormat = safeDefault;
  }

  log(`Final format after adjustments: ${finalFormat}`);

  // ── 5. Get trending destination ───────────────────────────────────────────
  const trending = getBestTrendingDestination(history);
  const trendingDest = trending?.destination || null;
  if (trendingDest) {
    log(`Top trending destination: ${trendingDest} (score: ${trending.score})`);
  }

  // ── 6. Select article ────────────────────────────────────────────────────
  const { articleId, destination } = await selectArticle(
    finalFormat,
    trendingDest,
    history
  );

  // ── 7. Queued breaking news info (score 30-59) ────────────────────────────
  let queuedNewsNote = '';
  if (breakingNews && breakingNews.score >= 30 && breakingNews.score < 60) {
    queuedNewsNote = ` | Queued news (score ${breakingNews.score}): "${breakingNews.headline?.slice(0, 50)}"`;
  }

  const reason = `Base calendar (${hour}h UTC, day ${dow}) -> ${baseFormat}${baseFormat !== finalFormat ? ` -> perf/dedup adjusted to ${finalFormat}` : ''}${trendingDest ? ` | trend: ${trendingDest}` : ''}${queuedNewsNote}`;

  log(`Decision: format=${finalFormat}, articleId=${articleId || 'none'}, destination=${destination || 'none'}`);
  log(`Reason: ${reason}`);
  log('='.repeat(60));

  return {
    format: finalFormat,
    articleId,
    destination,
    reason,
    isBreakingNews: false,
  };
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('/reels/smart-scheduler.js') ||
  process.argv[1].endsWith('\\reels\\smart-scheduler.js')
);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const skipNews = args.includes('--skip-news');
  const jsonOutput = args.includes('--json');

  decideContent({ skipNews })
    .then(decision => {
      if (jsonOutput) {
        // Machine-readable output for GitHub Actions
        console.log(JSON.stringify(decision));
      } else {
        // Human-readable summary
        console.log('\n--- Scheduler Decision ---');
        console.log(`Format:      ${decision.format}`);
        console.log(`Article ID:  ${decision.articleId || 'auto'}`);
        console.log(`Destination: ${decision.destination || 'auto'}`);
        console.log(`Reason:      ${decision.reason}`);
        console.log(`Breaking:    ${decision.isBreakingNews}`);
        if (decision.newsItem) {
          console.log(`News:        ${decision.newsItem.headline?.slice(0, 80)}`);
        }
      }
    })
    .catch(err => {
      logError(`Fatal: ${err.message}`);
      console.error(err.stack);
      process.exit(1);
    });
}

// ── Exports ─────────────────────────────────────────────────────────────────

export {
  BASE_CALENDAR,
  VALID_FORMATS,
  KILLED_FORMATS,
  loadHistory,
  saveHistory,
  isDestinationRecent,
  extractDestinationFromSlug,
};
