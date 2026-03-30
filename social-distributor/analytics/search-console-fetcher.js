#!/usr/bin/env node

/**
 * Google Search Console Fetcher — FlashVoyage Content Intelligence
 *
 * Uses Google Search Console API (v1) with the same service account as GA4.
 * Site: sc-domain:flashvoyage.com (or https://flashvoyage.com/)
 *
 * Prerequisites:
 *   1. In Google Search Console, add the SA email as a user:
 *      flashvoyage-ga4@mixitup-6d83e.iam.gserviceaccount.com
 *      Settings → Users and permissions → Add user → Full access
 *   2. Enable "Google Search Console API" in GCP project mixitup-6d83e:
 *      https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=mixitup-6d83e
 *   3. npm install googleapis (already available via @google-analytics/data transitive deps,
 *      but explicit install recommended)
 *
 * Data extracted:
 *   - queries: search terms, impressions, clicks, position, CTR
 *   - pages: URL performance breakdown
 *   - low-hanging fruit: position 5-20 with high impressions (easy wins)
 *   - cannibalization: multiple URLs competing for the same query
 *
 * Runs daily via cron (see content-intelligence-engine.js orchestrator).
 *
 * API Reference: https://developers.google.com/webmaster-tools/v1/api_reference_index
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ───────────────────────────────────────────────────────────

/** Search Console site URL — use sc-domain: format for domain-level property */
const SITE_URL = 'sc-domain:flashvoyage.com';

/** Fallback: URL-prefix property (if domain property not set up) */
const SITE_URL_FALLBACK = 'https://flashvoyage.com/';

/** Service account key paths (same as GA4) */
const SA_PATHS = [
  join(__dirname, '..', '..', 'ga4-service-account.json'),
  join(__dirname, '..', '..', '..', 'clodoproject', 'ga4-service-account.json'),
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
].filter(Boolean);

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[ANALYTICS/GSC] ${msg}`);
}

function logError(msg) {
  console.error(`[ANALYTICS/GSC] ERROR: ${msg}`);
}

// ── Auth ────────────────────────────────────────────────────────────────────

function findServiceAccountPath() {
  for (const p of SA_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Create an authenticated Search Console API client.
 * Uses the same service account as GA4 (flashvoyage-ga4@mixitup-6d83e.iam.gserviceaccount.com).
 *
 * @returns {{ searchconsole: object, siteUrl: string }}
 */
function createClient() {
  const saPath = findServiceAccountPath();
  if (!saPath) {
    throw new Error(
      'GA4/GSC service account key not found. Expected at:\n' +
      SA_PATHS.filter(Boolean).map(p => `  - ${p}`).join('\n')
    );
  }

  log(`Using service account: ${saPath}`);
  const keyFile = JSON.parse(readFileSync(saPath, 'utf-8'));

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: keyFile.client_email,
      private_key: keyFile.private_key,
    },
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });

  const searchconsole = google.searchconsole({ version: 'v1', auth });

  return { searchconsole, siteUrl: SITE_URL };
}

/**
 * Build a date string N days ago in YYYY-MM-DD format.
 */
function daysAgoStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ── Core API Calls ──────────────────────────────────────────────────────────

/**
 * Execute a Search Analytics query against GSC.
 *
 * API endpoint: POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
 *
 * @param {Object} params - Query parameters
 * @param {string} params.startDate - YYYY-MM-DD
 * @param {string} params.endDate - YYYY-MM-DD
 * @param {string[]} params.dimensions - ['query', 'page', 'country', 'device', 'date']
 * @param {number} params.rowLimit - Max rows (default 1000, max 25000)
 * @param {number} params.startRow - Offset for pagination
 * @param {Object[]} [params.dimensionFilterGroups] - Filters
 * @returns {Promise<Array<{ keys: string[], clicks: number, impressions: number, ctr: number, position: number }>>}
 */
async function querySearchAnalytics(params) {
  const { searchconsole, siteUrl } = createClient();

  const requestBody = {
    startDate: params.startDate,
    endDate: params.endDate,
    dimensions: params.dimensions || ['query'],
    rowLimit: params.rowLimit || 1000,
    startRow: params.startRow || 0,
    type: 'web',
  };

  if (params.dimensionFilterGroups) {
    requestBody.dimensionFilterGroups = params.dimensionFilterGroups;
  }

  try {
    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody,
    });

    return (response.data.rows || []).map(row => ({
      keys: row.keys,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: Math.round(row.ctr * 10000) / 100, // Convert to percentage, 2 decimals
      position: Math.round(row.position * 10) / 10,
    }));
  } catch (err) {
    // If domain property fails, try URL-prefix property
    if (err.message?.includes('User does not have sufficient permission') ||
        err.message?.includes('is not a verified')) {
      log(`Domain property failed, trying URL-prefix: ${SITE_URL_FALLBACK}`);
      try {
        const response = await searchconsole.searchanalytics.query({
          siteUrl: SITE_URL_FALLBACK,
          requestBody,
        });
        return (response.data.rows || []).map(row => ({
          keys: row.keys,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: Math.round(row.ctr * 10000) / 100,
          position: Math.round(row.position * 10) / 10,
        }));
      } catch (innerErr) {
        throw new Error(`GSC query failed for both properties: ${innerErr.message}`);
      }
    }
    throw err;
  }
}

// ── High-Level Fetchers ─────────────────────────────────────────────────────

/**
 * Fetch top queries with clicks, impressions, CTR, and position.
 * The bread-and-butter of SEO intelligence.
 *
 * @param {number} days - Lookback window (default 28, GSC data has ~3-day delay)
 * @param {number} limit - Max queries (default 500)
 * @returns {Promise<Array<{ query: string, clicks: number, impressions: number, ctr: number, position: number }>>}
 */
export async function fetchTopQueries(days = 28, limit = 500) {
  log(`Fetching top ${limit} queries over the last ${days} days...`);

  const rows = await querySearchAnalytics({
    startDate: daysAgoStr(days),
    endDate: daysAgoStr(3), // GSC data has ~3 day delay
    dimensions: ['query'],
    rowLimit: limit,
  });

  const queries = rows.map(row => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));

  log(`Found ${queries.length} queries`);
  return queries;
}

/**
 * Fetch page-level performance data.
 *
 * @param {number} days - Lookback window
 * @param {number} limit - Max pages
 * @returns {Promise<Array<{ page: string, clicks: number, impressions: number, ctr: number, position: number }>>}
 */
export async function fetchTopPages(days = 28, limit = 200) {
  log(`Fetching top ${limit} pages over the last ${days} days...`);

  const rows = await querySearchAnalytics({
    startDate: daysAgoStr(days),
    endDate: daysAgoStr(3),
    dimensions: ['page'],
    rowLimit: limit,
  });

  return rows.map(row => ({
    page: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

/**
 * Fetch query + page combinations.
 * Essential for cannibalization detection: shows which URLs rank for which queries.
 *
 * @param {number} days - Lookback window
 * @param {number} limit - Max rows (up to 25000)
 * @returns {Promise<Array<{ query: string, page: string, clicks: number, impressions: number, ctr: number, position: number }>>}
 */
export async function fetchQueryPagePairs(days = 28, limit = 5000) {
  log(`Fetching query-page pairs (last ${days} days, limit ${limit})...`);

  const rows = await querySearchAnalytics({
    startDate: daysAgoStr(days),
    endDate: daysAgoStr(3),
    dimensions: ['query', 'page'],
    rowLimit: limit,
  });

  return rows.map(row => ({
    query: row.keys[0],
    page: row.keys[1],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

// ── Intelligence: Low-Hanging Fruit ─────────────────────────────────────────

/**
 * Identify "low-hanging fruit" keywords: queries where FlashVoyage ranks
 * positions 5-20 (page 1 bottom / page 2) with significant impressions.
 *
 * These are the easiest SEO wins: a small content improvement or internal link
 * can push them to page 1 top positions, multiplying clicks.
 *
 * Scoring: fruit_score = impressions * (1 / position) * (1 - ctr)
 * Rationale:
 *   - High impressions = high search volume (people are searching this)
 *   - Lower position = more room to grow
 *   - Low CTR relative to position = title/meta needs improvement OR
 *     content doesn't fully match intent
 *
 * @param {number} days - Lookback window (default 28)
 * @param {Object} options
 * @param {number} options.minPosition - Minimum position (default 5)
 * @param {number} options.maxPosition - Maximum position (default 20)
 * @param {number} options.minImpressions - Minimum impressions (default 50)
 * @returns {Promise<Array<{ query: string, page: string, impressions: number, clicks: number, position: number, ctr: number, fruitScore: number, action: string }>>}
 */
export async function findLowHangingFruit(days = 28, options = {}) {
  const {
    minPosition = 5,
    maxPosition = 20,
    minImpressions = 50,
  } = options;

  log(`Finding low-hanging fruit (pos ${minPosition}-${maxPosition}, min ${minImpressions} impressions)...`);

  // Fetch query+page pairs to know which article ranks for what
  const pairs = await fetchQueryPagePairs(days, 10000);

  // Filter to the sweet spot
  const candidates = pairs.filter(row =>
    row.position >= minPosition &&
    row.position <= maxPosition &&
    row.impressions >= minImpressions
  );

  // Score each candidate
  const scored = candidates.map(row => {
    // fruit_score: higher = better opportunity
    // Weighted by impressions (demand), inversely by position (closer = easier win),
    // and by CTR gap (low CTR = more room to improve)
    const expectedCTR = getExpectedCTR(row.position);
    const ctrGap = Math.max(0, expectedCTR - (row.ctr / 100)); // Fraction, not %
    const fruitScore = Math.round(
      row.impressions * (1 / row.position) * (1 + ctrGap * 10) * 100
    ) / 100;

    // Determine recommended action
    let action;
    if (row.position >= 5 && row.position <= 10) {
      action = 'OPTIMIZE_TITLE_META'; // Already page 1, improve CTR with better title/meta
    } else if (row.position >= 11 && row.position <= 15) {
      action = 'ADD_CONTENT_DEPTH'; // Almost page 1, add 200-400 words of expert content
    } else {
      action = 'BUILD_INTERNAL_LINKS'; // Page 2+, build topical authority with internal links
    }

    return {
      query: row.query,
      page: row.page,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
      ctr: row.ctr,
      expectedCTR: Math.round(expectedCTR * 10000) / 100,
      fruitScore,
      action,
    };
  });

  // Sort by fruitScore descending
  scored.sort((a, b) => b.fruitScore - a.fruitScore);

  log(`Found ${scored.length} low-hanging fruit opportunities`);
  return scored;
}

/**
 * Expected CTR by position based on industry averages (2024/2025 data).
 * Source: Advanced Web Ranking / Backlinko CTR studies.
 *
 * @param {number} position - Average position (float)
 * @returns {number} Expected CTR as a fraction (0-1)
 */
function getExpectedCTR(position) {
  const ctrByPosition = {
    1: 0.319,
    2: 0.246,
    3: 0.186,
    4: 0.133,
    5: 0.095,
    6: 0.065,
    7: 0.047,
    8: 0.035,
    9: 0.027,
    10: 0.021,
    11: 0.015,
    12: 0.012,
    13: 0.010,
    14: 0.008,
    15: 0.007,
    16: 0.006,
    17: 0.005,
    18: 0.005,
    19: 0.004,
    20: 0.004,
  };

  const roundedPos = Math.min(Math.max(Math.round(position), 1), 20);
  return ctrByPosition[roundedPos] || 0.003;
}

// ── Intelligence: Cannibalization Detection ─────────────────────────────────

/**
 * Detect keyword cannibalization: queries where multiple FlashVoyage URLs
 * compete against each other in search results.
 *
 * Cannibalization dilutes authority and confuses Google about which page
 * to rank. Fixing it (consolidate, canonicalize, or differentiate) can
 * dramatically improve rankings.
 *
 * Detection criteria:
 *   - Same query appears for 2+ different URLs
 *   - Both URLs have significant impressions (>20)
 *   - Position difference < 10 (they're competing in the same SERP zone)
 *
 * @param {number} days - Lookback window (default 28)
 * @param {Object} options
 * @param {number} options.minImpressions - Min impressions per URL (default 20)
 * @param {number} options.maxPositionDiff - Max position gap to count as competing (default 10)
 * @returns {Promise<Array<{ query: string, pages: Array<{ url: string, position: number, impressions: number, clicks: number, ctr: number }>, severity: 'critical' | 'warning' | 'info', recommendation: string }>>}
 */
export async function detectCannibalization(days = 28, options = {}) {
  const {
    minImpressions = 20,
    maxPositionDiff = 10,
  } = options;

  log(`Detecting cannibalization (min ${minImpressions} impressions, max ${maxPositionDiff} pos diff)...`);

  const pairs = await fetchQueryPagePairs(days, 10000);

  // Group by query
  const byQuery = {};
  for (const row of pairs) {
    if (!byQuery[row.query]) byQuery[row.query] = [];
    byQuery[row.query].push(row);
  }

  const cannibalized = [];

  for (const [query, pages] of Object.entries(byQuery)) {
    // Only queries with 2+ URLs and minimum impressions
    const qualified = pages.filter(p => p.impressions >= minImpressions);
    if (qualified.length < 2) continue;

    // Sort by position (best first)
    qualified.sort((a, b) => a.position - b.position);

    // Check if top 2 URLs are within the position diff threshold
    const posDiff = qualified[1].position - qualified[0].position;
    if (posDiff > maxPositionDiff) continue;

    // Total impressions being wasted across competing URLs
    const totalImpressions = qualified.reduce((s, p) => s + p.impressions, 0);

    // Severity classification
    let severity;
    if (totalImpressions > 500 && posDiff < 5) {
      severity = 'critical'; // High volume, very close positions = big waste
    } else if (totalImpressions > 200) {
      severity = 'warning';
    } else {
      severity = 'info';
    }

    // Recommendation
    let recommendation;
    if (posDiff < 3) {
      recommendation = `MERGE: Consolidate into ${qualified[0].page} (best position). 301-redirect the other URL(s). Add missing content from the redirected page.`;
    } else {
      recommendation = `DIFFERENTIATE: Update ${qualified[1].page} to target a more specific sub-intent. Add canonical tag pointing to ${qualified[0].page} if content overlap is high.`;
    }

    cannibalized.push({
      query,
      totalImpressions,
      pages: qualified.map(p => ({
        url: p.page,
        position: p.position,
        impressions: p.impressions,
        clicks: p.clicks,
        ctr: p.ctr,
      })),
      severity,
      recommendation,
    });
  }

  // Sort by severity (critical first), then by total impressions
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  cannibalized.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.totalImpressions - a.totalImpressions;
  });

  log(`Found ${cannibalized.length} cannibalized queries (${cannibalized.filter(c => c.severity === 'critical').length} critical)`);
  return cannibalized;
}

// ── Intelligence: Query Trends Over Time ────────────────────────────────────

/**
 * Fetch daily click/impression trends for a specific query or page.
 * Useful for detecting declining vs growing content.
 *
 * @param {Object} filter - { type: 'query' | 'page', value: string }
 * @param {number} days - Lookback window (default 90)
 * @returns {Promise<Array<{ date: string, clicks: number, impressions: number, ctr: number, position: number }>>}
 */
export async function fetchTrendOverTime(filter, days = 90) {
  log(`Fetching trend for ${filter.type}="${filter.value}" over ${days} days...`);

  const dimensionFilterGroups = [{
    filters: [{
      dimension: filter.type.toUpperCase(),
      operator: filter.type === 'query' ? 'contains' : 'equals',
      expression: filter.value,
    }],
  }];

  const rows = await querySearchAnalytics({
    startDate: daysAgoStr(days),
    endDate: daysAgoStr(3),
    dimensions: ['date'],
    rowLimit: 25000,
    dimensionFilterGroups,
  });

  return rows.map(row => ({
    date: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

/**
 * Detect declining queries: queries where impressions/clicks are trending down
 * over the last 90 days (comparing first half vs second half).
 *
 * @param {number} days - Total lookback (default 90)
 * @param {number} minImpressions - Minimum total impressions to consider (default 100)
 * @returns {Promise<Array<{ query: string, page: string, firstHalfImpressions: number, secondHalfImpressions: number, declinePercent: number, position: number }>>}
 */
export async function findDecliningQueries(days = 90, minImpressions = 100) {
  log(`Finding declining queries over ${days} days...`);

  // Fetch date-level data with query+page dimensions
  const midpoint = daysAgoStr(Math.floor(days / 2));

  const [firstHalf, secondHalf] = await Promise.all([
    querySearchAnalytics({
      startDate: daysAgoStr(days),
      endDate: midpoint,
      dimensions: ['query', 'page'],
      rowLimit: 5000,
    }),
    querySearchAnalytics({
      startDate: midpoint,
      endDate: daysAgoStr(3),
      dimensions: ['query', 'page'],
      rowLimit: 5000,
    }),
  ]);

  // Build lookup maps
  const firstMap = {};
  for (const row of firstHalf) {
    const key = `${row.keys[0]}|||${row.keys[1]}`;
    firstMap[key] = { impressions: row.impressions, clicks: row.clicks };
  }

  const secondMap = {};
  for (const row of secondHalf) {
    const key = `${row.keys[0]}|||${row.keys[1]}`;
    secondMap[key] = { impressions: row.impressions, clicks: row.clicks, position: row.position };
  }

  // Find declines
  const declining = [];
  for (const [key, first] of Object.entries(firstMap)) {
    const second = secondMap[key];
    if (!second) continue;

    const totalImpressions = first.impressions + second.impressions;
    if (totalImpressions < minImpressions) continue;

    if (second.impressions < first.impressions * 0.7) {
      // 30%+ decline
      const [query, page] = key.split('|||');
      const declinePercent = Math.round(
        ((first.impressions - second.impressions) / first.impressions) * 100
      );

      declining.push({
        query,
        page,
        firstHalfImpressions: first.impressions,
        secondHalfImpressions: second.impressions,
        declinePercent,
        position: second.position,
      });
    }
  }

  declining.sort((a, b) => b.declinePercent - a.declinePercent);

  log(`Found ${declining.length} declining queries`);
  return declining;
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('search-console-fetcher')) {
  const command = process.argv[2] || 'help';
  const days = parseInt(process.argv[3] || '28', 10);

  (async () => {
    try {
      switch (command) {
        case 'queries': {
          const queries = await fetchTopQueries(days, 50);
          console.log(JSON.stringify(queries, null, 2));
          break;
        }
        case 'pages': {
          const pages = await fetchTopPages(days, 50);
          console.log(JSON.stringify(pages, null, 2));
          break;
        }
        case 'fruit': {
          const fruit = await findLowHangingFruit(days);
          console.log(JSON.stringify(fruit.slice(0, 30), null, 2));
          break;
        }
        case 'cannibalization': {
          const cannibal = await detectCannibalization(days);
          console.log(JSON.stringify(cannibal, null, 2));
          break;
        }
        case 'declining': {
          const declining = await findDecliningQueries(days);
          console.log(JSON.stringify(declining.slice(0, 30), null, 2));
          break;
        }
        default:
          console.log(`
Google Search Console Fetcher — FlashVoyage

Usage:
  node search-console-fetcher.js queries [days]          Top search queries
  node search-console-fetcher.js pages [days]            Top pages by clicks
  node search-console-fetcher.js fruit [days]            Low-hanging fruit keywords
  node search-console-fetcher.js cannibalization [days]  Detect keyword cannibalization
  node search-console-fetcher.js declining [days]        Queries losing traffic

Setup:
  1. Add SA email to Search Console: flashvoyage-ga4@mixitup-6d83e.iam.gserviceaccount.com
  2. Enable Search Console API: https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
  3. npm install googleapis
`);
      }
    } catch (err) {
      logError(err.message);
      if (err.message.includes('not a verified') || err.message.includes('permission')) {
        console.error('\nSetup required:');
        console.error('1. Go to https://search.google.com/search-console');
        console.error('2. Select flashvoyage.com property');
        console.error('3. Settings → Users and permissions → Add user');
        console.error('4. Email: flashvoyage-ga4@mixitup-6d83e.iam.gserviceaccount.com');
        console.error('5. Permission: Full');
      }
      process.exit(1);
    }
  })();
}
