/**
 * article-scorer.js — Content Intelligence Engine
 *
 * Scores ALL published articles using multi-signal data fusion.
 * Each article gets a composite score (0-100) based on:
 *   - GA4 traffic (pageviews, sessions, avg duration)
 *   - Trend alignment (is the topic trending on Google Trends?)
 *   - Reel amplification (do reels link to this article? how did they perform?)
 *   - Content freshness (age penalty for outdated articles)
 *   - Monetization signal (presence of Travelpayouts widgets)
 *
 * Data sources consumed:
 *   - GA4 via ga4-fetcher.js → fetchTopArticles(), fetchArticleTrafficSources()
 *   - Google Trends via trends-scanner.js → scanTrends()
 *   - IG stats via ig-stats-fetcher.js → fetchRecentReelStats()
 *   - WP REST API → all published articles
 *   - data/article-reel-map.json (from article-reel-linker.js)
 *
 * Writes: data/article-scores.json
 *
 * Each scored article also carries FR-traffic metadata (Phase 1):
 *   - signals.frPageviews : integer, pageviews coming from France (30d)
 *   - signals.frShare     : 0-1, FR share of total pageviews (null if 0 traffic)
 * These are metadata ONLY — NOT weighted into the composite formula. The
 * dashboard uses them to surface FR-SEO / sibling / reel-reallocation ops.
 *
 * Cron: daily at 3h00 UTC (before analytics at 4h00 UTC)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { fetchTopArticles, fetchTopArticlesFR, fetchArticleTrafficSources, fetchSiteSummary } from '../social-distributor/analytics/ga4-fetcher.js';
import { scanTrends } from '../social-distributor/sources/trends-scanner.js';
import { fetchRecentReelStats } from '../social-distributor/analytics/ig-stats-fetcher.js';
import { scoreReel } from '../social-distributor/analytics/performance-scorer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');
const REEL_MAP_PATH = join(DATA_DIR, 'article-reel-map.json');

// ── Scoring Weights ────────────────────────────────────────────────────────

const WEIGHTS = {
  traffic: 0.30,        // GA4 pageviews (normalized)
  sessionQuality: 0.10, // avg session duration (engagement proxy)
  trendAlignment: 0.20, // is the topic currently trending?
  reelAmplification: 0.15, // linked reels and their performance
  freshness: 0.15,      // newer = better (decay over 6 months)
  monetization: 0.10,   // has affiliate widgets?
};

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[INTELLIGENCE/SCORER] ${msg}`);
}

function logError(msg) {
  console.error(`[INTELLIGENCE/SCORER] ERROR: ${msg}`);
}

/**
 * Fetch all published articles from WP REST API.
 * Returns: Array<{ id, title, slug, date, categories, excerpt }>
 *
 * Uses the same endpoint pattern as trends-scanner.js fetchWpArticles().
 * TODO: Extract into shared wp-client.js to avoid duplication.
 */
async function fetchAllWpArticles() {
  const wpUrl = process.env.WORDPRESS_URL || 'https://flashvoyage.com';
  const allArticles = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `${wpUrl}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,slug,date,categories,tags,content`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'FlashVoyage-Intelligence/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        if (response.status === 400) { hasMore = false; break; }
        throw new Error(`WP API returned ${response.status}`);
      }

      const posts = await response.json();
      if (posts.length === 0) { hasMore = false; break; }

      for (const post of posts) {
        const content = post.content?.rendered || '';
        allArticles.push({
          id: post.id,
          title: post.title?.rendered || '',
          slug: post.slug || '',
          date: post.date,
          categories: post.categories || [],
          tags: post.tags || [],
          hasWidgets: content.includes('data-tp') || content.includes('travelpayouts'),
          wordCount: content.replace(/<[^>]+>/g, '').split(/\s+/).length,
        });
      }

      page++;
      await new Promise(r => setTimeout(r, 300)); // rate limit
    } catch (err) {
      logError(`WP API fetch error (page ${page}): ${err.message}`);
      hasMore = false;
    }
  }

  log(`Fetched ${allArticles.length} articles from WP`);
  return allArticles;
}

/**
 * Normalize a value to 0-1 range using min-max scaling.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function normalize(value, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/**
 * Calculate freshness score (0-1). Articles < 30 days = 1.0, decays linearly to 0 at 365 days.
 * @param {string} dateStr - ISO date string
 * @returns {number}
 */
function freshnessScore(dateStr) {
  const ageMs = Date.now() - new Date(dateStr).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 30) return 1.0;
  if (ageDays > 365) return 0.0;
  return Math.round((1 - (ageDays - 30) / 335) * 100) / 100;
}

/**
 * Fuzzy match: does an article's slug/title relate to a trend query?
 * Uses normalized word overlap with a minimum threshold.
 * @param {string} articleSlug
 * @param {string} articleTitle
 * @param {string} trendQuery
 * @returns {number} Match score 0-1
 */
function fuzzyTrendMatch(articleSlug, articleTitle, trendQuery) {
  const strip = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const slugWords = new Set(strip(articleSlug.replace(/-/g, ' ')).split(/\s+/).filter(w => w.length > 2));
  const titleWords = new Set(strip(articleTitle).split(/\s+/).filter(w => w.length > 2));
  const trendWords = strip(trendQuery).split(/\s+/).filter(w => w.length > 2);

  if (trendWords.length === 0) return 0;

  const allArticleWords = new Set([...slugWords, ...titleWords]);
  const matched = trendWords.filter(w => allArticleWords.has(w)).length;
  return matched / trendWords.length;
}

// ── Main Scoring Function ──────────────────────────────────────────────────

/**
 * Score all published articles. Composite score 0-100.
 *
 * @param {Object} options
 * @param {number} options.trafficDays - GA4 lookback window (default 30)
 * @param {number} options.reelDays    - IG stats lookback window (default 14)
 * @returns {Promise<{
 *   timestamp: string,
 *   articleCount: number,
 *   scores: Array<{
 *     wpId: number,
 *     slug: string,
 *     title: string,
 *     compositeScore: number,
 *     signals: {
 *       traffic: number,
 *       sessionQuality: number,
 *       trendAlignment: number,
 *       reelAmplification: number,
 *       freshness: number,
 *       monetization: number,
 *       frShare: number|null,       // 0-1, FR share of pageviews (metadata only, not weighted)
 *       frPageviews: number         // raw FR pageviews (metadata only, not weighted)
 *     },
 *     flags: string[],
 *     date: string
 *   }>
 * }>}
 */
export async function scoreAllArticles({ trafficDays = 30, reelDays = 14 } = {}) {
  log('Starting article scoring...');
  const startTime = Date.now();

  // ── Step 1: Fetch all WP articles ──
  const articles = await fetchAllWpArticles();

  // ── Step 2: Fetch GA4 traffic (total + FR-only) in parallel ──
  // frShare / frPageviews are metadata — NOT fed into the composite score.
  let trafficData = [];
  let frTrafficMap = new Map();
  try {
    const [allRes, frRes] = await Promise.all([
      fetchTopArticles(trafficDays, 200),
      fetchTopArticlesFR(trafficDays, 500),
    ]);
    trafficData = allRes;
    frTrafficMap = frRes;
    log(`GA4: ${trafficData.length} articles with traffic data (${frTrafficMap.size} with FR traffic)`);
  } catch (err) {
    logError(`GA4 fetch failed: ${err.message} — scoring without traffic data`);
  }

  // Build lookup: slug → traffic metrics (total + FR)
  // fetchTopArticles() groups by (pagePath, pageTitle), so the same slug can
  // appear multiple times when a title was edited mid-window. Sum pageviews/
  // sessions across rows and duration-weighted-average the duration — otherwise
  // the last-write-wins pattern drops 80-90% of traffic for re-titled articles
  // (visible as frShare > 1 on articles where the minor-variant title ranked
  // below the primary in the DESC sort).
  const trafficBySlug = {};
  for (const t of trafficData) {
    const slug = t.pagePath.replace(/^\/|\/$/g, '');
    const prev = trafficBySlug[slug];
    if (!prev) {
      trafficBySlug[slug] = {
        pageviews: t.pageviews,
        sessions: t.sessions,
        avgDuration: t.avgSessionDuration,
      };
    } else {
      const totalSessions = prev.sessions + t.sessions;
      trafficBySlug[slug] = {
        pageviews: prev.pageviews + t.pageviews,
        sessions: totalSessions,
        avgDuration: totalSessions > 0
          ? (prev.avgDuration * prev.sessions + t.avgSessionDuration * t.sessions) / totalSessions
          : 0,
      };
    }
  }

  // FR pageviews indexed by the same slug key (strip leading/trailing slash)
  const frBySlug = {};
  for (const [pagePath, m] of frTrafficMap.entries()) {
    const slug = pagePath.replace(/^\/|\/$/g, '');
    frBySlug[slug] = { pageviews: m.pageviews, sessions: m.sessions };
  }

  // ── Step 3: Fetch trending topics ──
  let trendingTopics = [];
  try {
    const trends = await scanTrends({ includeDestinationScan: true, includeInterest: false });
    trendingTopics = trends.trendingTopics || [];
    log(`Trends: ${trendingTopics.length} trending topics`);
  } catch (err) {
    logError(`Trends scan failed: ${err.message} — scoring without trend data`);
  }

  // ── Step 4: Load article-reel map ──
  // The linker writes a top-level envelope: { timestamp, articleMap, orphanReels, stats, ... }.
  // We want the inner articleMap keyed by slug. Historically this code read the
  // envelope directly (reelMap[slug]?.reels), which silently returned undefined
  // for every article because the slug keys live one level deeper. That bug is
  // what pinned reelAmplification to 0 across the board. Unwrap articleMap here.
  let reelMap = {};
  try {
    if (existsSync(REEL_MAP_PATH)) {
      const raw = JSON.parse(await readFile(REEL_MAP_PATH, 'utf-8'));
      reelMap = raw?.articleMap || raw || {};
    }
  } catch (err) {
    logError(`Reel map load failed: ${err.message}`);
  }

  // ── Step 5: Fetch reel performance (for cross-referencing) ──
  let reelStats = [];
  try {
    reelStats = await fetchRecentReelStats(reelDays);
    log(`IG: ${reelStats.length} recent reels with stats`);
  } catch (err) {
    logError(`IG stats fetch failed: ${err.message}`);
  }

  // ── Step 6: Compute per-article scores ──
  const allPageviews = articles.map(a => trafficBySlug[a.slug]?.pageviews || 0);
  const maxPageviews = Math.max(...allPageviews, 1);
  const allDurations = articles.map(a => trafficBySlug[a.slug]?.avgDuration || 0);
  const maxDuration = Math.max(...allDurations, 1);

  const scored = articles.map(article => {
    const traffic = trafficBySlug[article.slug] || { pageviews: 0, sessions: 0, avgDuration: 0 };
    const frTraffic = frBySlug[article.slug] || { pageviews: 0, sessions: 0 };
    const flags = [];

    // FR-share metadata (NOT weighted into composite — Phase 1)
    const frPageviews = frTraffic.pageviews;
    const totalPageviews = traffic.pageviews;
    const frShare = totalPageviews > 0
      ? Math.round((frPageviews / totalPageviews) * 100) / 100
      : null;

    // Signal 1: Traffic (normalized 0-1)
    const trafficSignal = normalize(traffic.pageviews, 0, maxPageviews);

    // Signal 2: Session quality (duration normalized 0-1)
    const sessionSignal = normalize(traffic.avgDuration, 0, maxDuration);

    // Signal 3: Trend alignment (best fuzzy match across all trending topics)
    let trendSignal = 0;
    for (const trend of trendingTopics) {
      const match = fuzzyTrendMatch(article.slug, article.title, trend.query);
      trendSignal = Math.max(trendSignal, match * (trend.compositeScore || 0.5));
    }
    trendSignal = Math.min(trendSignal, 1);
    if (trendSignal > 0.5) flags.push('trending');

    // Signal 4: Reel amplification (does this article have linked reels?)
    //
    // The linker writes pre-scored reels onto each article in article-reel-map.json:
    //   reels: [{ reelId, format, platform, score, engagementRate, isViral, ... }]
    // Prior to 2026-04-22 this code treated `linkedReels` as an array of bare
    // reel-ID strings and tried to `.find()` them in `reelStats` — which is only
    // populated for IG reels in the last `reelDays` window, so anything older
    // (and everything from TikTok) dropped out. Use the pre-computed score from
    // the linker and only fall back to the live IG stats if the linker didn't
    // record a score.
    let reelSignal = 0;
    const linkedReels = reelMap[article.slug]?.reels || [];
    if (linkedReels.length > 0) {
      const reelScores = linkedReels
        .map(r => {
          if (typeof r === 'string') {
            // legacy shape: array of raw reelIds — look up in live IG stats
            const s = reelStats.find(x => x.id === r)?.stats;
            return s ? scoreReel(s) : 0;
          }
          if (typeof r?.score === 'number') return r.score;
          // Object with only an ID — try live IG stats as a last resort
          const id = r?.reelId || r?.id || null;
          const s = id ? reelStats.find(x => x.id === id)?.stats : null;
          return s ? scoreReel(s) : 0;
        })
        .filter(s => s > 0);
      if (reelScores.length > 0) {
        reelSignal = Math.min(1, reelScores.reduce((a, b) => a + b, 0) / (reelScores.length * 50));
      }
      flags.push(`${linkedReels.length}_reels`);
    }

    // Signal 5: Freshness
    const freshSignal = freshnessScore(article.date);
    if (freshSignal < 0.2) flags.push('stale');

    // Signal 6: Monetization
    const monetizationSignal = article.hasWidgets ? 1.0 : 0.0;
    if (!article.hasWidgets && traffic.pageviews > 50) flags.push('missing_widgets');

    // Composite score (0-100)
    const composite = Math.round((
      trafficSignal * WEIGHTS.traffic +
      sessionSignal * WEIGHTS.sessionQuality +
      trendSignal * WEIGHTS.trendAlignment +
      reelSignal * WEIGHTS.reelAmplification +
      freshSignal * WEIGHTS.freshness +
      monetizationSignal * WEIGHTS.monetization
    ) * 100);

    // Additional flags
    if (traffic.pageviews === 0) flags.push('zero_traffic');
    if (traffic.pageviews > maxPageviews * 0.5) flags.push('top_performer');

    // FR-share diagnostic flags (metadata only — 20-pageview floor to kill noise)
    if (frShare !== null && frShare >= 0.8 && totalPageviews >= 20) {
      flags.push('fr_heavy');
    }
    if (frShare !== null && frShare < 0.25 && composite >= 50) {
      flags.push('fr_light');
    }
    if (frShare !== null && frShare >= 0.25 && frShare < 0.6 && totalPageviews >= 50) {
      flags.push('fr_diversified');
    }

    return {
      wpId: article.id,
      slug: article.slug,
      title: article.title,
      compositeScore: composite,
      signals: {
        traffic: Math.round(trafficSignal * 100) / 100,
        sessionQuality: Math.round(sessionSignal * 100) / 100,
        trendAlignment: Math.round(trendSignal * 100) / 100,
        reelAmplification: Math.round(reelSignal * 100) / 100,
        freshness: Math.round(freshSignal * 100) / 100,
        monetization: monetizationSignal,
        // FR-traffic metadata (NOT weighted)
        frShare,
        frPageviews,
      },
      flags,
      date: article.date,
      wordCount: article.wordCount,
    };
  });

  // Sort by composite score descending
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  const result = {
    timestamp: new Date().toISOString(),
    scoringWeights: WEIGHTS,
    articleCount: scored.length,
    scores: scored,
    summary: {
      avgScore: Math.round(scored.reduce((sum, s) => sum + s.compositeScore, 0) / scored.length),
      topPerformers: scored.filter(s => s.flags.includes('top_performer')).length,
      staleArticles: scored.filter(s => s.flags.includes('stale')).length,
      missingWidgets: scored.filter(s => s.flags.includes('missing_widgets')).length,
      zeroTraffic: scored.filter(s => s.flags.includes('zero_traffic')).length,
      trending: scored.filter(s => s.flags.includes('trending')).length,
      // FR-share breakdown (metadata only)
      frHeavy: scored.filter(s => s.flags.includes('fr_heavy')).length,
      frLight: scored.filter(s => s.flags.includes('fr_light')).length,
      frDiversified: scored.filter(s => s.flags.includes('fr_diversified')).length,
    },
  };

  // ── Write output ──
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SCORES_PATH, JSON.stringify(result, null, 2));
  log(`Scored ${result.articleCount} articles (avg ${result.summary.avgScore}/100). Written to ${SCORES_PATH}`);
  log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return result;
}

// ── CLI entry point ────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  scoreAllArticles()
    .then(result => {
      console.log(`\nArticle Scoring Complete:`);
      console.log(`  Total: ${result.articleCount}`);
      console.log(`  Avg Score: ${result.summary.avgScore}/100`);
      console.log(`  Top Performers: ${result.summary.topPerformers}`);
      console.log(`  Stale: ${result.summary.staleArticles}`);
      console.log(`  Missing Widgets: ${result.summary.missingWidgets}`);
      console.log(`  Zero Traffic: ${result.summary.zeroTraffic}`);
      console.log(`  Trending: ${result.summary.trending}`);
      console.log(`  FR Heavy: ${result.summary.frHeavy}`);
      console.log(`  FR Light (rewrite cand.): ${result.summary.frLight}`);
      console.log(`  FR Diversified: ${result.summary.frDiversified}`);
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
