/**
 * content-gap-detector.js — Content Intelligence Engine
 *
 * Identifies content gaps: topics people search for that FlashVoyage doesn't cover.
 *
 * Three gap detection strategies:
 *   1. TREND GAPS: Google Trends rising queries with no matching article
 *      (already partially done in trends-scanner.js — this module deepens the analysis)
 *   2. KEYWORD GAPS: High-impression / low-click queries from Search Console
 *      (position 8-30 = page 2-3, where a dedicated article could rank page 1)
 *   3. COMPETITOR GAPS: Topics covered by travel competitors but not by us
 *      (future: RSS competitor analysis)
 *
 * Each gap is scored by:
 *   - Search volume proxy (trend traffic or SC impressions)
 *   - Trend growth velocity (rising vs stable vs declining)
 *   - Monetization potential (destination + category → widget opportunity)
 *   - Competition difficulty estimate (keyword length, specificity)
 *
 * Data sources consumed:
 *   - trends-scanner.js → scanTrends() → contentGaps[]
 *   - Search Console API (NEW — via googleapis) → keyword positions
 *   - data/article-scores.json → existing article coverage map
 *   - WP REST API → article inventory
 *
 * Writes: data/content-gaps.json
 *
 * Cron: daily at 3h05 UTC (after article-scorer)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { scanTrends } from '../social-distributor/sources/trends-scanner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const GAPS_PATH = join(DATA_DIR, 'content-gaps.json');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');

// ── Monetization Potential Map ─────────────────────────────────────────────
// Categories where Travelpayouts widgets generate revenue

const HIGH_MONETIZATION_CATEGORIES = ['budget', 'itineraire', 'transport', 'destination', 'pratique'];
const MEDIUM_MONETIZATION_CATEGORIES = ['visa', 'securite'];
const HIGH_MONETIZATION_DESTINATIONS = [
  'bali', 'thailande', 'vietnam', 'japon', 'philippines',
  'indonesie', 'malaisie', 'singapour', 'cambodge',
];

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[INTELLIGENCE/GAPS] ${msg}`);
}

function logError(msg) {
  console.error(`[INTELLIGENCE/GAPS] ERROR: ${msg}`);
}

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Estimate monetization potential for a gap topic (0-1).
 * Higher if destination is popular + category is budget/itinerary.
 *
 * @param {string|null} destination
 * @param {string|null} category
 * @returns {number}
 */
function monetizationPotential(destination, category) {
  let score = 0.3; // base

  if (destination && HIGH_MONETIZATION_DESTINATIONS.includes(normalize(destination))) {
    score += 0.3;
  }
  if (category && HIGH_MONETIZATION_CATEGORIES.includes(category)) {
    score += 0.3;
  } else if (category && MEDIUM_MONETIZATION_CATEGORIES.includes(category)) {
    score += 0.15;
  }

  return Math.min(1.0, score);
}

/**
 * Estimate keyword competition difficulty (0-1, lower = easier to rank).
 * Long-tail queries (4+ words) are easier; generic 1-2 word queries are harder.
 *
 * @param {string} query
 * @returns {number}
 */
function competitionEstimate(query) {
  const words = query.split(/\s+/).filter(w => w.length > 2);
  if (words.length >= 5) return 0.2; // very long-tail, low competition
  if (words.length >= 3) return 0.4;
  if (words.length >= 2) return 0.6;
  return 0.8; // single-word = very competitive
}

// ── Search Console Integration ─────────────────────────────────────────────

/**
 * Fetch high-impression / low-click keywords from Google Search Console.
 * These are queries where flashvoyage.com appears but doesn't get clicks
 * (typically position 8-30 = page 2-3).
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account
 * with Search Console API access.
 *
 * @param {number} days - Lookback window (default 28, SC max is 16 months)
 * @returns {Promise<Array<{
 *   query: string,
 *   impressions: number,
 *   clicks: number,
 *   ctr: number,
 *   position: number
 * }>>}
 */
export async function fetchSearchConsoleGaps(days = 28) {
  // Search Console API integration
  // Requires: npm install googleapis (already available via @google-analytics/data transitive deps)
  //
  // If SC credentials are not available, returns empty array (graceful degradation).

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    join(__dirname, '..', 'ga4-service-account.json');

  if (!existsSync(saPath)) {
    log('Search Console: no service account found, skipping SC gap detection');
    return [];
  }

  try {
    const { google } = await import('googleapis');
    const keyFile = JSON.parse(await readFile(saPath, 'utf-8'));

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: keyFile.client_email,
        private_key: keyFile.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });

    const searchconsole = google.searchconsole({ version: 'v1', auth });

    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const response = await searchconsole.searchanalytics.query({
      siteUrl: 'sc-domain:flashvoyage.com',
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 500,
        // Filter for high-impression, low-CTR keywords (position 5-30)
        dimensionFilterGroups: [{
          filters: [{
            dimension: 'query',
            operator: 'notContains',
            expression: 'flashvoyage',
          }],
        }],
      },
    });

    const rows = (response.data.rows || [])
      .filter(row => row.position >= 5 && row.position <= 30 && row.impressions >= 10)
      .map(row => ({
        query: row.keys[0],
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: Math.round(row.ctr * 10000) / 100,
        position: Math.round(row.position * 10) / 10,
      }))
      .sort((a, b) => b.impressions - a.impressions);

    log(`Search Console: ${rows.length} gap keywords (position 5-30, 10+ impressions)`);
    return rows;
  } catch (err) {
    logError(`Search Console fetch failed: ${err.message}`);
    return [];
  }
}

// ── Main Gap Detection ─────────────────────────────────────────────────────

/**
 * Detect all content gaps from multiple signals.
 *
 * @param {Object} options
 * @param {number} options.scDays      - Search Console lookback (default 28)
 * @param {number} options.maxGaps     - Max gaps to return (default 50)
 * @param {boolean} options.includeSC  - Include Search Console analysis (default true)
 * @returns {Promise<{
 *   timestamp: string,
 *   gapCount: number,
 *   gaps: Array<{
 *     topic: string,
 *     source: 'trends' | 'search_console' | 'combined',
 *     gapScore: number,
 *     signals: {
 *       searchVolume: number,
 *       trendGrowth: number,
 *       monetization: number,
 *       competition: number
 *     },
 *     destination: string | null,
 *     category: string | null,
 *     suggestedTitle: string,
 *     suggestedReelAngle: string,
 *     articleType: 'pillar' | 'support' | 'news',
 *     priority: 'critical' | 'high' | 'medium' | 'low'
 *   }>,
 *   summary: {
 *     byPriority: Record<string, number>,
 *     byCategory: Record<string, number>,
 *     byDestination: Record<string, number>,
 *     topDestinationGaps: string[]
 *   }
 * }>}
 */
export async function detectContentGaps({ scDays = 28, maxGaps = 50, includeSC = true } = {}) {
  log('Starting content gap detection...');
  const startTime = Date.now();

  const gaps = [];

  // ── Source 1: Google Trends gaps (already computed by trends-scanner) ──
  let trendScan;
  try {
    trendScan = await scanTrends({ includeDestinationScan: true });
    log(`Trends: ${trendScan.contentGaps.length} trend-based gaps`);

    for (const gap of trendScan.contentGaps) {
      const monetization = monetizationPotential(gap.destination, gap.category);
      const competition = competitionEstimate(gap.trend);

      // Gap score formula: volume * (1 - competition) * monetization * relevance
      const volumeSignal = gap.compositeScore || 0.5;
      const gapScore = Math.round(
        (volumeSignal * 0.35 +
          (1 - competition) * 0.25 +
          monetization * 0.25 +
          (gap.relevance || 0.5) * 0.15) * 100
      );

      gaps.push({
        topic: gap.trend,
        source: 'trends',
        gapScore,
        signals: {
          searchVolume: Math.round(volumeSignal * 100) / 100,
          trendGrowth: Math.round((gap.compositeScore || 0.5) * 100) / 100,
          monetization: Math.round(monetization * 100) / 100,
          competition: Math.round(competition * 100) / 100,
        },
        destination: gap.destination || null,
        category: gap.category || null,
        suggestedTitle: gap.suggestedArticleTitle || '',
        suggestedReelAngle: gap.suggestedReelAngle || '',
        articleType: determineArticleType(gap),
        priority: 'medium', // will be recalculated below
      });
    }
  } catch (err) {
    logError(`Trends scan failed: ${err.message}`);
  }

  // ── Source 2: Search Console keyword gaps ──
  if (includeSC) {
    const scKeywords = await fetchSearchConsoleGaps(scDays);

    // Load existing article slugs for matching
    let existingArticles = [];
    try {
      if (existsSync(SCORES_PATH)) {
        const scoresData = JSON.parse(await readFile(SCORES_PATH, 'utf-8'));
        existingArticles = scoresData.scores || [];
      }
    } catch { /* ignore */ }

    for (const kw of scKeywords) {
      // Check if any existing article covers this keyword
      const isAlreadyCovered = existingArticles.some(a => {
        const slug = normalize(a.slug.replace(/-/g, ' '));
        const title = normalize(a.title);
        const query = normalize(kw.query);
        const queryWords = query.split(' ').filter(w => w.length > 2);
        const matchCount = queryWords.filter(w => slug.includes(w) || title.includes(w)).length;
        return matchCount >= queryWords.length * 0.6;
      });

      if (isAlreadyCovered) continue;

      // Check for duplicates with trend gaps
      const isDuplicate = gaps.some(g => normalize(g.topic) === normalize(kw.query));
      if (isDuplicate) {
        // Merge: boost the existing gap's score
        const existing = gaps.find(g => normalize(g.topic) === normalize(kw.query));
        if (existing) {
          existing.source = 'combined';
          existing.gapScore = Math.min(100, existing.gapScore + 15);
          existing.signals.searchVolume = Math.max(existing.signals.searchVolume,
            normalize(kw.impressions, 0, 1000));
        }
        continue;
      }

      const monetization = monetizationPotential(null, null); // SC doesn't give us destination/category
      const competition = competitionEstimate(kw.query);
      const volumeSignal = Math.min(1, kw.impressions / 500);

      gaps.push({
        topic: kw.query,
        source: 'search_console',
        gapScore: Math.round(
          (volumeSignal * 0.4 +
            (1 - competition) * 0.3 +
            monetization * 0.2 +
            (1 - kw.position / 30) * 0.1) * 100
        ),
        signals: {
          searchVolume: Math.round(volumeSignal * 100) / 100,
          trendGrowth: 0.5, // unknown for SC keywords
          monetization: Math.round(monetization * 100) / 100,
          competition: Math.round(competition * 100) / 100,
        },
        destination: null,
        category: null,
        suggestedTitle: `${capitalize(kw.query)} : Guide Complet ${new Date().getFullYear()}`,
        suggestedReelAngle: `Reel format pick ou budget sur "${kw.query}"`,
        articleType: 'support',
        priority: 'medium',
        scData: {
          impressions: kw.impressions,
          clicks: kw.clicks,
          ctr: kw.ctr,
          position: kw.position,
        },
      });
    }
  }

  // ── Assign priorities based on gap score ──
  for (const gap of gaps) {
    if (gap.gapScore >= 70) gap.priority = 'critical';
    else if (gap.gapScore >= 50) gap.priority = 'high';
    else if (gap.gapScore >= 30) gap.priority = 'medium';
    else gap.priority = 'low';
  }

  // Sort by gap score descending, take top N
  gaps.sort((a, b) => b.gapScore - a.gapScore);
  const topGaps = gaps.slice(0, maxGaps);

  // ── Build summary ──
  const byPriority = {};
  const byCategory = {};
  const byDestination = {};

  for (const g of topGaps) {
    byPriority[g.priority] = (byPriority[g.priority] || 0) + 1;
    if (g.category) byCategory[g.category] = (byCategory[g.category] || 0) + 1;
    if (g.destination) byDestination[g.destination] = (byDestination[g.destination] || 0) + 1;
  }

  const topDestinationGaps = Object.entries(byDestination)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([dest]) => dest);

  const result = {
    timestamp: new Date().toISOString(),
    gapCount: topGaps.length,
    gaps: topGaps,
    summary: {
      byPriority,
      byCategory,
      byDestination,
      topDestinationGaps,
    },
  };

  // ── Write output ──
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(GAPS_PATH, JSON.stringify(result, null, 2));
  log(`Detected ${result.gapCount} content gaps. Written to ${GAPS_PATH}`);
  log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Determine what article type a gap should produce.
 * @param {Object} gap - Trend gap object
 * @returns {'pillar' | 'support' | 'news'}
 */
function determineArticleType(gap) {
  const query = (gap.trend || '').toLowerCase();

  // News: contains time-sensitive keywords
  if (/2026|2027|nouveau|alerte|ferme|reouver|greve|annul/.test(query)) {
    return 'news';
  }

  // Pillar: broad destination guides or multi-aspect topics
  if (/guide|complet|tout savoir|itineraire|circuit/.test(query)) {
    return 'pillar';
  }

  // Default: support
  return 'support';
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Reuse normalize for deduplication (already defined above as local)
function normalizeForDedup(value, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ── CLI entry point ────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  detectContentGaps()
    .then(result => {
      console.log(`\nContent Gap Detection Complete:`);
      console.log(`  Total Gaps: ${result.gapCount}`);
      console.log(`  By Priority:`, result.summary.byPriority);
      console.log(`  Top Destination Gaps:`, result.summary.topDestinationGaps);
      if (result.gaps.length > 0) {
        console.log(`\n  Top 5 Gaps:`);
        for (const g of result.gaps.slice(0, 5)) {
          console.log(`    [${g.gapScore}] ${g.topic} (${g.source}, ${g.priority})`);
        }
      }
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
