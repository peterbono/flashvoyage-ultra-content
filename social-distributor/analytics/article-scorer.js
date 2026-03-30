#!/usr/bin/env node

/**
 * Article Scorer — FlashVoyage Content Intelligence Engine
 *
 * Unified scoring system that combines ALL data sources into a single
 * ArticleScore per URL. This score drives every downstream decision:
 *   - Which articles to refresh
 *   - Which articles to promote via reels
 *   - Which articles to add/upgrade affiliate widgets
 *   - Which content gaps to fill next
 *
 * Data sources & weights:
 *
 *   Source                          | Weight | Normalization    | Why
 *   -------------------------------|--------|------------------|-----------------------------
 *   GA4 pageviews (30d)            | 0.20   | log10            | Raw traffic demand
 *   GA4 avg_session_duration (30d) | 0.10   | linear, cap 300s | Content quality signal
 *   GSC impressions (28d)          | 0.20   | log10            | SEO visibility / keyword demand
 *   GSC avg_position (28d)         | 0.15   | inverse linear   | Ranking authority
 *   Travelpayouts affiliate clicks | 0.15   | log10            | Monetization potential
 *   Reel engagement (linked)       | 0.10   | composite score  | Social amplification
 *   Google Trends relevance        | 0.10   | 0-1 direct       | Timeliness / seasonality
 *
 * Normalization strategy:
 *   All metrics are normalized to 0-10 scale before weighting.
 *   log10 normalization prevents outliers (1 article with 10K views)
 *   from dominating. The max for each metric is computed dynamically
 *   from the current dataset.
 *
 * Output: Array of { slug, url, title, totalScore, breakdown, rank, actions }
 *   sorted by totalScore descending.
 */

import { fetchTopArticles, fetchArticleTrafficSources } from './ga4-fetcher.js';
import { fetchTopPages, findLowHangingFruit } from './search-console-fetcher.js';
import { fetchRecentReelStats } from './ig-stats-fetcher.js';
import { scoreReel } from './performance-scorer.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');

// Re-export scoreReel for convenience
export { scoreReel } from './performance-scorer.js';

// ── Weights ─────────────────────────────────────────────────────────────────

/**
 * Default scoring weights. Can be overridden via data/scoring-config.json.
 * Sum = 1.0.
 */
const DEFAULT_WEIGHTS = {
  ga4Pageviews:        0.20,
  ga4AvgDuration:      0.10,
  gscImpressions:      0.20,
  gscPositionInverse:  0.15,
  affiliateClicks:     0.15,
  reelEngagement:      0.10,
  trendsRelevance:     0.10,
};

function loadWeights() {
  const configPath = join(DATA_DIR, 'scoring-config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      return { ...DEFAULT_WEIGHTS, ...config.weights };
    } catch {
      // Fall back to defaults
    }
  }
  return { ...DEFAULT_WEIGHTS };
}

// ── Normalization Functions ─────────────────────────────────────────────────

/**
 * Normalize a value to 0-10 scale using log10.
 * Prevents outlier domination: difference between 100 and 1000 views
 * matters more than 10000 vs 10100.
 *
 * @param {number} value - Raw value
 * @param {number} maxValue - Maximum value in the dataset
 * @returns {number} Normalized score (0-10)
 */
function normalizeLog10(value, maxValue) {
  if (value <= 0 || maxValue <= 0) return 0;
  const logVal = Math.log10(value + 1);
  const logMax = Math.log10(maxValue + 1);
  return Math.min(10, (logVal / logMax) * 10);
}

/**
 * Normalize a value to 0-10 scale linearly with a cap.
 *
 * @param {number} value - Raw value
 * @param {number} cap - Value at which score reaches 10
 * @returns {number} Normalized score (0-10)
 */
function normalizeLinearCapped(value, cap) {
  if (value <= 0) return 0;
  return Math.min(10, (value / cap) * 10);
}

/**
 * Normalize GSC position (inverse: lower position = higher score).
 * Position 1 = 10, position 50 = 0.
 *
 * @param {number} position - Average position (1-100+)
 * @returns {number} Normalized score (0-10)
 */
function normalizePositionInverse(position) {
  if (!position || position <= 0) return 0;
  // Position 1 = 10, position 50+ = 0
  return Math.max(0, Math.min(10, (50 - position) / 5));
}

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[SCORER] ${msg}`);
}

function logError(msg) {
  console.error(`[SCORER] ERROR: ${msg}`);
}

// ── URL Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the slug from a FlashVoyage URL or path.
 * "/bali-budget-complet/" → "bali-budget-complet"
 * "https://flashvoyage.com/bali-budget-complet/" → "bali-budget-complet"
 */
function extractSlug(urlOrPath) {
  return urlOrPath
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/|\/$/g, '')
    .split('/')[0] || '';
}

// ── Core Scoring Engine ─────────────────────────────────────────────────────

/**
 * Compute ArticleScore for all published articles.
 *
 * Fetches data from all sources in parallel, merges by URL/slug,
 * normalizes, weights, and ranks.
 *
 * @param {Object} options
 * @param {number} options.ga4Days - GA4 lookback (default 30)
 * @param {number} options.gscDays - GSC lookback (default 28)
 * @param {number} options.reelDays - Reel stats lookback (default 30)
 * @param {Object} options.trendsData - Pre-fetched trends data { [slug]: relevanceScore 0-1 }
 * @param {Object} options.affiliateData - Pre-fetched affiliate click data { [slug]: clickCount }
 * @returns {Promise<Array<ArticleScore>>}
 */
export async function scoreAllArticles(options = {}) {
  const {
    ga4Days = 30,
    gscDays = 28,
    reelDays = 30,
    trendsData = {},
    affiliateData = {},
  } = options;

  const weights = loadWeights();
  log(`Weights: ${JSON.stringify(weights)}`);

  // ── Phase 1: Parallel data fetch ──────────────────────────────────────
  log('Phase 1: Fetching data from all sources...');

  const [ga4Articles, gscPages, reelStats] = await Promise.all([
    fetchTopArticles(ga4Days, 500).catch(err => {
      logError(`GA4 fetch failed: ${err.message}`);
      return [];
    }),
    fetchTopPages(gscDays, 500).catch(err => {
      logError(`GSC fetch failed: ${err.message}`);
      return [];
    }),
    fetchRecentReelStats(reelDays).catch(err => {
      logError(`Reel stats fetch failed: ${err.message}`);
      return [];
    }),
  ]);

  log(`Data fetched: GA4=${ga4Articles.length} articles, GSC=${gscPages.length} pages, Reels=${reelStats.length}`);

  // ── Phase 2: Build unified article map ────────────────────────────────
  log('Phase 2: Building unified article map...');

  const articleMap = {}; // slug → { ga4, gsc, reel, trends, affiliate }

  // Merge GA4 data
  for (const article of ga4Articles) {
    const slug = extractSlug(article.pagePath);
    if (!slug) continue;
    if (!articleMap[slug]) articleMap[slug] = { slug, url: `https://flashvoyage.com/${slug}/`, title: article.pageTitle };
    articleMap[slug].ga4 = {
      pageviews: article.pageviews,
      avgDuration: article.avgSessionDuration,
      sessions: article.sessions,
    };
  }

  // Merge GSC data
  for (const page of gscPages) {
    const slug = extractSlug(page.page);
    if (!slug) continue;
    if (!articleMap[slug]) articleMap[slug] = { slug, url: page.page, title: '' };
    articleMap[slug].gsc = {
      impressions: page.impressions,
      clicks: page.clicks,
      position: page.position,
      ctr: page.ctr,
    };
  }

  // Merge Reel data (match by slug in caption or by postId)
  for (const reel of reelStats) {
    if (!reel.stats) continue;
    const caption = (reel.stats.caption || '').toLowerCase();
    const score = scoreReel(reel.stats);

    // Try to match reel to an article by slug mention in caption
    for (const [slug, article] of Object.entries(articleMap)) {
      if (caption.includes(slug.replace(/-/g, ' ')) || caption.includes(slug)) {
        if (!article.reelScores) article.reelScores = [];
        article.reelScores.push(score);
      }
    }
  }

  // Merge Trends data
  for (const [slug, relevance] of Object.entries(trendsData)) {
    if (articleMap[slug]) {
      articleMap[slug].trendsRelevance = relevance;
    }
  }

  // Merge Affiliate data
  for (const [slug, clicks] of Object.entries(affiliateData)) {
    if (articleMap[slug]) {
      articleMap[slug].affiliateClicks = clicks;
    }
  }

  // ── Phase 3: Compute scores ───────────────────────────────────────────
  log('Phase 3: Computing normalized scores...');

  const articles = Object.values(articleMap);

  // Find max values for log10 normalization
  const maxGA4PV = Math.max(...articles.map(a => a.ga4?.pageviews || 0), 1);
  const maxGSCImpr = Math.max(...articles.map(a => a.gsc?.impressions || 0), 1);
  const maxAffClicks = Math.max(...articles.map(a => a.affiliateClicks || 0), 1);
  const maxReelScore = Math.max(...articles.map(a => {
    const scores = a.reelScores || [];
    return scores.length > 0 ? Math.max(...scores) : 0;
  }), 1);

  const scored = articles.map(article => {
    const ga4 = article.ga4 || {};
    const gsc = article.gsc || {};
    const reelScores = article.reelScores || [];
    const avgReelScore = reelScores.length > 0
      ? reelScores.reduce((s, v) => s + v, 0) / reelScores.length
      : 0;

    // Normalize each dimension to 0-10
    const breakdown = {
      ga4Pageviews: normalizeLog10(ga4.pageviews || 0, maxGA4PV),
      ga4AvgDuration: normalizeLinearCapped(ga4.avgDuration || 0, 300), // 5 min = max
      gscImpressions: normalizeLog10(gsc.impressions || 0, maxGSCImpr),
      gscPositionInverse: normalizePositionInverse(gsc.position || 0),
      affiliateClicks: normalizeLog10(article.affiliateClicks || 0, maxAffClicks),
      reelEngagement: normalizeLog10(avgReelScore, maxReelScore),
      trendsRelevance: (article.trendsRelevance || 0) * 10, // Already 0-1, scale to 0-10
    };

    // Weighted sum
    const totalScore = Math.round((
      breakdown.ga4Pageviews * weights.ga4Pageviews +
      breakdown.ga4AvgDuration * weights.ga4AvgDuration +
      breakdown.gscImpressions * weights.gscImpressions +
      breakdown.gscPositionInverse * weights.gscPositionInverse +
      breakdown.affiliateClicks * weights.affiliateClicks +
      breakdown.reelEngagement * weights.reelEngagement +
      breakdown.trendsRelevance * weights.trendsRelevance
    ) * 100) / 100;

    // Round breakdown values
    for (const key of Object.keys(breakdown)) {
      breakdown[key] = Math.round(breakdown[key] * 100) / 100;
    }

    return {
      slug: article.slug,
      url: article.url,
      title: article.title || '',
      totalScore,
      breakdown,
      raw: {
        pageviews: ga4.pageviews || 0,
        avgDuration: Math.round(ga4.avgDuration || 0),
        impressions: gsc.impressions || 0,
        position: gsc.position || 0,
        ctr: gsc.ctr || 0,
        affiliateClicks: article.affiliateClicks || 0,
        avgReelScore: Math.round(avgReelScore * 10) / 10,
        reelCount: reelScores.length,
        trendsRelevance: article.trendsRelevance || 0,
      },
    };
  });

  // ── Phase 4: Rank and generate actions ────────────────────────────────
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Assign rank and percentile
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1;
    scored[i].percentile = Math.round((1 - i / scored.length) * 100);
  }

  // Generate recommended actions
  for (const article of scored) {
    article.actions = generateActions(article);
  }

  log(`Scored ${scored.length} articles. Top: ${scored[0]?.slug} (${scored[0]?.totalScore}), Bottom: ${scored[scored.length - 1]?.slug} (${scored[scored.length - 1]?.totalScore})`);

  return scored;
}

/**
 * Generate recommended actions based on an article's score breakdown.
 *
 * @param {Object} article - Scored article with breakdown and raw data
 * @returns {string[]} List of recommended actions
 */
function generateActions(article) {
  const actions = [];
  const { breakdown, raw, percentile } = article;

  // High SEO visibility but low traffic → title/meta needs work
  if (breakdown.gscImpressions > 6 && breakdown.ga4Pageviews < 4) {
    actions.push('IMPROVE_TITLE_META: High impressions but low clicks — rewrite title tag and meta description');
  }

  // High traffic but no affiliate clicks → add/improve widgets
  if (breakdown.ga4Pageviews > 5 && breakdown.affiliateClicks < 2) {
    actions.push('ADD_AFFILIATE_WIDGETS: High traffic but low monetization — add Travelpayouts widgets');
  }

  // No reel coverage for a top article → create reels
  if (raw.reelCount === 0 && percentile > 50) {
    actions.push('CREATE_REEL: Top-performing article with no reel coverage — generate reels to amplify');
  }

  // Trending topic but low SEO position → optimize content
  if (breakdown.trendsRelevance > 5 && breakdown.gscPositionInverse < 4) {
    actions.push('SEO_OPTIMIZE: Trending topic but poor ranking — add content depth, build internal links');
  }

  // Good position but low engagement → content quality issue
  if (breakdown.gscPositionInverse > 6 && breakdown.ga4AvgDuration < 3) {
    actions.push('IMPROVE_CONTENT: Good ranking but low engagement — improve readability, add visuals, update data');
  }

  // Bottom 25% overall → candidate for refresh or removal
  if (percentile < 25) {
    if (raw.impressions > 50) {
      actions.push('REFRESH: Low overall score but has impressions — refresh content to recover');
    } else {
      actions.push('EVALUATE: Very low performance — consider merging with stronger article or removing');
    }
  }

  return actions;
}

// ── Persistence ─────────────────────────────────────────────────────────────

/**
 * Score all articles and persist results to article-scores.json.
 * Also returns the scores.
 */
export async function scoreAndPersist(options = {}) {
  const scores = await scoreAllArticles(options);

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    totalArticles: scores.length,
    weights: loadWeights(),
    articles: scores,
  };

  writeFileSync(SCORES_PATH, JSON.stringify(output, null, 2), 'utf-8');
  log(`Scores written to ${SCORES_PATH}`);

  return scores;
}

/**
 * Load previously computed scores from disk.
 *
 * @returns {Object|null} Parsed article-scores.json or null
 */
export function loadScores() {
  if (!existsSync(SCORES_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SCORES_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('article-scorer')) {
  const command = process.argv[2] || 'score';

  (async () => {
    try {
      switch (command) {
        case 'score': {
          const scores = await scoreAndPersist();
          // Print top 20
          console.log('\n=== TOP 20 ARTICLES BY SCORE ===\n');
          for (const a of scores.slice(0, 20)) {
            console.log(`#${a.rank} [${a.totalScore}] ${a.slug}`);
            console.log(`   PV=${a.raw.pageviews} | Impr=${a.raw.impressions} | Pos=${a.raw.position} | AffClicks=${a.raw.affiliateClicks} | Reels=${a.raw.reelCount}`);
            if (a.actions.length > 0) {
              console.log(`   Actions: ${a.actions.join('; ')}`);
            }
            console.log();
          }
          break;
        }
        case 'actions': {
          const scores = await scoreAndPersist();
          // Print all articles with actions
          const withActions = scores.filter(a => a.actions.length > 0);
          console.log(`\n=== ${withActions.length} ARTICLES WITH RECOMMENDED ACTIONS ===\n`);
          for (const a of withActions) {
            console.log(`#${a.rank} [${a.totalScore}] ${a.slug}`);
            for (const action of a.actions) {
              console.log(`   → ${action}`);
            }
            console.log();
          }
          break;
        }
        case 'load': {
          const data = loadScores();
          if (!data) {
            console.log('No cached scores. Run: node article-scorer.js score');
          } else {
            console.log(`Last scored: ${data.generatedAt}, ${data.totalArticles} articles`);
            console.log(JSON.stringify(data.articles.slice(0, 10), null, 2));
          }
          break;
        }
        default:
          console.log(`
Article Scorer — FlashVoyage Content Intelligence

Usage:
  node article-scorer.js score     Compute scores for all articles (saves to article-scores.json)
  node article-scorer.js actions   Show all articles with recommended actions
  node article-scorer.js load      Load and display cached scores
`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}
