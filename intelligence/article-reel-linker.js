/**
 * article-reel-linker.js — Content Intelligence Engine
 *
 * Bidirectional linking between articles and reels:
 *
 *   Article → Reels:
 *   - Which reels were created FROM this article?
 *   - Which reel formats work best for this article's content type?
 *   - Suggested reel formats for articles that have no reels yet
 *
 *   Reel → Articles:
 *   - Which article does this reel promote?
 *   - Did the reel drive traffic to the article? (GA4 referral: ig → article page)
 *   - If reel goes viral, flag article for promotion boost
 *
 * Data sources consumed:
 *   - social-distributor/data/reel-history.jsonl → published reels with captions/articles
 *   - social-distributor/reels/data/content-history.json → reel content mapping
 *   - GA4 via ga4-fetcher.js → fetchArticleTrafficSources() (ig referral data)
 *   - data/article-scores.json → article metadata
 *   - social-distributor/analytics/ig-stats-fetcher.js → reel performance
 *   - social-distributor/analytics/performance-scorer.js → scoreReel()
 *
 * Writes: data/article-reel-map.json
 *
 * Cron: daily at 3h15 UTC (after article-prioritizer)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { fetchArticleTrafficSources } from '../social-distributor/analytics/ga4-fetcher.js';
import { fetchRecentReelStats } from '../social-distributor/analytics/ig-stats-fetcher.js';
import { scoreReel, engagementRate } from '../social-distributor/analytics/performance-scorer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const MAP_PATH = join(DATA_DIR, 'article-reel-map.json');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');
const REEL_HISTORY_PATH = join(__dirname, '..', 'social-distributor', 'data', 'reel-history.jsonl');
const CONTENT_HISTORY_PATH = join(__dirname, '..', 'social-distributor', 'reels', 'data', 'content-history.json');

// ── Reel Format Suggestions by Content Type ────────────────────────────────

const FORMAT_SUGGESTIONS = {
  // Article content category → best reel formats (ordered by effectiveness)
  budget: ['budget', 'versus', 'poll'],
  itineraire: ['pick', 'month', 'avantapres'],
  pratique: ['humor', 'poll', 'pick'],
  securite: ['humor', 'poll', 'avantapres'],
  visa: ['poll', 'humor'],
  transport: ['pick', 'versus', 'budget'],
  destination: ['pick', 'month', 'avantapres'],
  default: ['pick', 'poll', 'humor'],
};

// ── Viral Threshold ────────────────────────────────────────────────────────
// A reel scoring above this is considered "viral" and the linked article
// should be flagged for promotion (ads boost, internal linking, etc.)
const VIRAL_SCORE_THRESHOLD = 100;

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[INTELLIGENCE/LINKER] ${msg}`);
}

function logError(msg) {
  console.error(`[INTELLIGENCE/LINKER] ERROR: ${msg}`);
}

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Load reel history from JSONL (one JSON object per line).
 * Each entry: { id, format, destination, caption, articleSlug?, publishedAt, igMediaId? }
 * @returns {Array<Object>}
 */
function loadReelHistory() {
  if (!existsSync(REEL_HISTORY_PATH)) {
    log('No reel-history.jsonl found');
    return [];
  }
  const lines = readFileSync(REEL_HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch { /* skip malformed lines */ }
  }
  return entries;
}

/**
 * Load content history (reel → article mapping from reel generator).
 * @returns {Object}
 */
async function loadContentHistory() {
  if (!existsSync(CONTENT_HISTORY_PATH)) return {};
  try {
    return JSON.parse(await readFile(CONTENT_HISTORY_PATH, 'utf-8'));
  } catch { return {}; }
}

/**
 * Try to match a reel to an article by caption/destination fuzzy matching.
 * @param {Object} reel - Reel entry from history
 * @param {Array<Object>} articles - Article list from scores
 * @returns {string|null} Matched article slug, or null
 */
function fuzzyMatchReelToArticle(reel, articles) {
  // If reel already has an articleSlug, use it
  if (reel.articleSlug) return reel.articleSlug;

  const caption = normalize(reel.caption || '');
  const destination = normalize(reel.destination || '');

  if (!caption && !destination) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const article of articles) {
    const slug = normalize(article.slug.replace(/-/g, ' '));
    const title = normalize(article.title);

    // Score: word overlap between reel caption/destination and article slug/title
    const captionWords = caption.split(' ').filter(w => w.length > 2);
    const matchingWords = captionWords.filter(w => slug.includes(w) || title.includes(w));
    const score = captionWords.length > 0 ? matchingWords.length / captionWords.length : 0;

    // Bonus for destination match
    const destBonus = destination && (slug.includes(destination) || title.includes(destination)) ? 0.3 : 0;

    const total = score + destBonus;
    if (total > bestScore && total >= 0.4) {
      bestScore = total;
      bestMatch = article.slug;
    }
  }

  return bestMatch;
}

/**
 * Detect content category from article title/slug.
 * Maps to FORMAT_SUGGESTIONS keys.
 * @param {string} slug
 * @param {string} title
 * @returns {string}
 */
function detectCategory(slug, title) {
  const text = normalize(`${slug} ${title}`);

  if (/budget|prix|cout|combien|pas cher|argent|depense/.test(text)) return 'budget';
  if (/itineraire|circuit|jours|semaines|road trip|parcours/.test(text)) return 'itineraire';
  if (/visa|passeport|immigration|douane|entree/.test(text)) return 'visa';
  if (/danger|securite|arnaque|piege|risque|escroquerie/.test(text)) return 'securite';
  if (/transport|avion|train|bus|ferry|vol|compagnie/.test(text)) return 'transport';
  if (/guide|decouverte|que faire|ou aller|meilleur/.test(text)) return 'destination';
  if (/conseil|astuce|preparer|quand partir|saison/.test(text)) return 'pratique';

  return 'default';
}

// ── Main Linking Function ──────────────────────────────────────────────────

/**
 * Build the bidirectional article-reel map.
 *
 * @param {Object} options
 * @param {number} options.reelDays - IG stats lookback window (default 14)
 * @param {boolean} options.checkReferrals - Check GA4 for IG referral traffic (default false, expensive)
 * @returns {Promise<{
 *   timestamp: string,
 *   articleMap: Record<string, {
 *     wpId: number,
 *     title: string,
 *     reels: Array<{
 *       reelId: string,
 *       format: string,
 *       score: number,
 *       publishedAt: string,
 *       isViral: boolean
 *     }>,
 *     suggestedFormats: string[],
 *     category: string,
 *     igReferralTraffic: number | null
 *   }>,
 *   viralAlerts: Array<{
 *     articleSlug: string,
 *     reelId: string,
 *     reelScore: number,
 *     engagementRate: number,
 *     recommendation: string
 *   }>,
 *   orphanReels: Array<{ reelId: string, format: string, publishedAt: string }>,
 *   stats: {
 *     totalArticles: number,
 *     articlesWithReels: number,
 *     articlesWithoutReels: number,
 *     totalReels: number,
 *     viralReels: number,
 *     orphanReels: number
 *   }
 * }>}
 */
export async function linkArticlesAndReels({ reelDays = 14, checkReferrals = false } = {}) {
  log('Starting article-reel linking...');
  const startTime = Date.now();

  // ── Load data ──
  const reelHistory = loadReelHistory();
  const contentHistory = await loadContentHistory();
  const reelStats = await fetchRecentReelStats(reelDays).catch(() => []);

  let articleScores = [];
  try {
    if (existsSync(SCORES_PATH)) {
      const data = JSON.parse(await readFile(SCORES_PATH, 'utf-8'));
      articleScores = data.scores || [];
    }
  } catch { /* ignore */ }

  log(`Loaded: ${reelHistory.length} reel history entries, ${articleScores.length} articles`);

  // ── Build reel stats lookup ──
  const reelStatsById = {};
  for (const reel of reelStats) {
    if (reel.id) reelStatsById[reel.id] = reel;
  }

  // ── Build article map ──
  const articleMap = {};
  const orphanReels = [];
  const viralAlerts = [];

  // Initialize all articles
  for (const article of articleScores) {
    const category = detectCategory(article.slug, article.title);
    articleMap[article.slug] = {
      wpId: article.wpId,
      title: article.title,
      reels: [],
      suggestedFormats: FORMAT_SUGGESTIONS[category] || FORMAT_SUGGESTIONS.default,
      category,
      igReferralTraffic: null,
    };
  }

  // ── Link reels to articles ──
  for (const reel of reelHistory) {
    const matchedSlug = fuzzyMatchReelToArticle(reel, articleScores);

    if (!matchedSlug || !articleMap[matchedSlug]) {
      orphanReels.push({
        reelId: reel.id || reel.igMediaId || 'unknown',
        format: reel.format || 'unknown',
        publishedAt: reel.publishedAt || null,
        caption: (reel.caption || '').slice(0, 80),
      });
      continue;
    }

    const stats = reelStatsById[reel.igMediaId || reel.id];
    const score = stats?.stats ? scoreReel(stats.stats) : 0;
    const er = stats?.stats ? engagementRate(stats.stats) : 0;
    const isViral = score >= VIRAL_SCORE_THRESHOLD;

    articleMap[matchedSlug].reels.push({
      reelId: reel.igMediaId || reel.id || 'unknown',
      format: reel.format || 'unknown',
      score,
      engagementRate: er,
      publishedAt: reel.publishedAt || null,
      isViral,
    });

    // Viral alert
    if (isViral) {
      viralAlerts.push({
        articleSlug: matchedSlug,
        reelId: reel.igMediaId || reel.id,
        reelScore: score,
        engagementRate: er,
        recommendation: `Viral reel detected! Boost article "${articleMap[matchedSlug].title}" via internal links, social shares, and ad spend.`,
      });
    }
  }

  // ── Optional: Check GA4 for IG referral traffic per article ──
  if (checkReferrals) {
    log('Checking GA4 for IG referral traffic...');
    const articlesWithReels = Object.entries(articleMap).filter(([, v]) => v.reels.length > 0);

    for (const [slug, articleData] of articlesWithReels.slice(0, 10)) { // limit to 10 to avoid rate limits
      try {
        const sources = await fetchArticleTrafficSources(`/${slug}/`, 30);
        const igTraffic = sources
          .filter(s => s.source === 'instagram' || s.source === 'l.instagram.com' || s.medium === 'social')
          .reduce((sum, s) => sum + s.sessions, 0);
        articleData.igReferralTraffic = igTraffic;
      } catch (err) {
        logError(`GA4 referral fetch failed for ${slug}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 200)); // rate limit
    }
  }

  // ── Stats ──
  const articlesWithReels = Object.values(articleMap).filter(a => a.reels.length > 0).length;
  const totalReels = Object.values(articleMap).reduce((sum, a) => sum + a.reels.length, 0);

  const stats = {
    totalArticles: articleScores.length,
    articlesWithReels,
    articlesWithoutReels: articleScores.length - articlesWithReels,
    totalReels,
    viralReels: viralAlerts.length,
    orphanReels: orphanReels.length,
  };

  const result = {
    timestamp: new Date().toISOString(),
    articleMap,
    viralAlerts,
    orphanReels,
    stats,
  };

  // ── Write output ──
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(MAP_PATH, JSON.stringify(result, null, 2));
  log(`Linked ${stats.articlesWithReels} articles to ${stats.totalReels} reels. ${stats.viralReels} viral alerts. Written to ${MAP_PATH}`);
  log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return result;
}

// ── CLI entry point ────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  const checkReferrals = process.argv.includes('--referrals');
  linkArticlesAndReels({ checkReferrals })
    .then(result => {
      console.log(`\nArticle-Reel Linking Complete:`);
      console.log(`  Articles: ${result.stats.totalArticles}`);
      console.log(`  With Reels: ${result.stats.articlesWithReels}`);
      console.log(`  Total Reels Linked: ${result.stats.totalReels}`);
      console.log(`  Viral Alerts: ${result.stats.viralReels}`);
      console.log(`  Orphan Reels: ${result.stats.orphanReels}`);
      if (result.viralAlerts.length > 0) {
        console.log(`\n  Viral Alerts:`);
        for (const alert of result.viralAlerts) {
          console.log(`    ${alert.articleSlug}: score=${alert.reelScore}, ER=${alert.engagementRate}%`);
        }
      }
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
