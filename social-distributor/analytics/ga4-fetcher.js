/**
 * GA4 Data Fetcher — FlashVoyage Analytics
 *
 * Uses Google Analytics Data API (v1beta) with service account auth.
 * Property: 505793742
 * Service account key: ga4-service-account.json (at repo root or clodoproject/)
 *
 * Fetches: pageviews, sessions, avg session duration per article page
 *
 * Requires: npm install @google-analytics/data
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GA4_PROPERTY = '505793742';

// Locate service account key file — check multiple paths
const SA_PATHS = [
  join(__dirname, '..', '..', 'ga4-service-account.json'),                   // flashvoyage-content/
  join(__dirname, '..', '..', '..', 'clodoproject', 'ga4-service-account.json'), // clodoproject/
  process.env.GOOGLE_APPLICATION_CREDENTIALS,                                  // env override
].filter(Boolean);

function findServiceAccountPath() {
  for (const p of SA_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

function log(msg) {
  console.log(`[ANALYTICS/GA4] ${msg}`);
}

function logError(msg) {
  console.error(`[ANALYTICS/GA4] ERROR: ${msg}`);
}

/**
 * Initialize the GA4 Data API client with service account credentials.
 *
 * @returns {BetaAnalyticsDataClient}
 */
function createClient() {
  const saPath = findServiceAccountPath();

  if (!saPath) {
    throw new Error(
      'GA4 service account key not found. Expected at:\n' +
      SA_PATHS.filter(Boolean).map(p => `  - ${p}`).join('\n') +
      '\n\nInstall: npm install @google-analytics/data\n' +
      'Or set GOOGLE_APPLICATION_CREDENTIALS env var.'
    );
  }

  log(`Using service account: ${saPath}`);

  // Parse the key file to extract credentials
  const keyFile = JSON.parse(readFileSync(saPath, 'utf-8'));

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: keyFile.client_email,
      private_key: keyFile.private_key,
    },
    projectId: keyFile.project_id,
  });
}

/**
 * Build a date string N days ago in YYYY-MM-DD format.
 * @param {number} daysAgo
 * @returns {string}
 */
function daysAgoStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch top performing articles by pageviews in the last N days.
 *
 * @param {number} days  - Lookback window (default 30)
 * @param {number} limit - Max articles to return (default 20)
 * @returns {Promise<Array<{ pagePath: string, pageTitle: string, pageviews: number, sessions: number, avgSessionDuration: number }>>}
 */
export async function fetchTopArticles(days = 30, limit = 20) {
  const client = createClient();

  log(`Fetching top ${limit} articles over the last ${days} days...`);

  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY}`,
    dateRanges: [
      {
        startDate: daysAgoStr(days),
        endDate: 'today',
      },
    ],
    dimensions: [
      { name: 'pagePath' },
      { name: 'pageTitle' },
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [
      {
        metric: { metricName: 'screenPageViews' },
        desc: true,
      },
    ],
    limit,
    // Filter out non-article pages (homepage, admin, etc.)
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          matchType: 'BEGINS_WITH',
          value: '/',
          caseSensitive: false,
        },
      },
    },
  });

  const articles = (response.rows ?? []).map(row => ({
    pagePath: row.dimensionValues[0].value,
    pageTitle: row.dimensionValues[1].value,
    pageviews: parseInt(row.metricValues[0].value, 10) || 0,
    sessions: parseInt(row.metricValues[1].value, 10) || 0,
    avgSessionDuration: parseFloat(row.metricValues[2].value) || 0,
  }));

  // Filter out non-article paths (keep only real article slugs)
  const filtered = articles.filter(a => {
    const path = a.pagePath;
    // Skip homepage, admin, feeds, search, pagination
    if (path === '/' || path === '/wp-admin' || path.startsWith('/wp-')) return false;
    if (path.includes('/feed') || path.includes('/page/') || path.includes('?')) return false;
    if (path === '/(not set)') return false;
    return true;
  });

  log(`Found ${filtered.length} articles with traffic data`);
  return filtered;
}

/**
 * Fetch traffic sources for a specific article page.
 * Useful to see if traffic comes from Instagram, Google, or direct.
 *
 * @param {string} pagePath - Article URL path (e.g., '/bali-guide-complet/')
 * @param {number} days     - Lookback window (default 30)
 * @returns {Promise<Array<{ source: string, medium: string, sessions: number, pageviews: number }>>}
 */
export async function fetchArticleTrafficSources(pagePath, days = 30) {
  const client = createClient();

  log(`Fetching traffic sources for ${pagePath} (last ${days} days)...`);

  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY}`,
    dateRanges: [
      {
        startDate: daysAgoStr(days),
        endDate: 'today',
      },
    ],
    dimensions: [
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'screenPageViews' },
    ],
    orderBys: [
      {
        metric: { metricName: 'sessions' },
        desc: true,
      },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          matchType: 'EXACT',
          value: pagePath,
          caseSensitive: false,
        },
      },
    },
  });

  const sources = (response.rows ?? []).map(row => ({
    source: row.dimensionValues[0].value,
    medium: row.dimensionValues[1].value,
    sessions: parseInt(row.metricValues[0].value, 10) || 0,
    pageviews: parseInt(row.metricValues[1].value, 10) || 0,
  }));

  log(`Found ${sources.length} traffic sources for ${pagePath}`);
  return sources;
}

/**
 * Fetch article performance grouped by destination keyword.
 * Scans pagePaths and pageTitle for known destination names.
 *
 * @param {string[]} destinations - List of destination names to look for (e.g., ['bali', 'thailande', 'vietnam'])
 * @param {number} days           - Lookback window
 * @returns {Promise<Record<string, { pageviews: number, sessions: number, articles: number }>>}
 */
export async function fetchDestinationTraffic(destinations, days = 30) {
  const allArticles = await fetchTopArticles(days, 200);

  const result = {};
  for (const dest of destinations) {
    const lower = dest.toLowerCase();
    result[dest] = { pageviews: 0, sessions: 0, articles: 0 };

    for (const article of allArticles) {
      const pathLower = article.pagePath.toLowerCase();
      const titleLower = article.pageTitle.toLowerCase();

      if (pathLower.includes(lower) || titleLower.includes(lower)) {
        result[dest].pageviews += article.pageviews;
        result[dest].sessions += article.sessions;
        result[dest].articles += 1;
      }
    }
  }

  log(`Destination traffic: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Fetch overall site-level traffic summary.
 *
 * @param {number} days - Lookback window (default 7)
 * @returns {Promise<{ totalPageviews: number, totalSessions: number, totalUsers: number, avgSessionDuration: number }>}
 */
export async function fetchSiteSummary(days = 7) {
  const client = createClient();

  log(`Fetching site summary for the last ${days} days...`);

  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY}`,
    dateRanges: [
      {
        startDate: daysAgoStr(days),
        endDate: 'today',
      },
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'averageSessionDuration' },
    ],
  });

  const row = response.rows?.[0];
  if (!row) {
    return { totalPageviews: 0, totalSessions: 0, totalUsers: 0, avgSessionDuration: 0 };
  }

  return {
    totalPageviews: parseInt(row.metricValues[0].value, 10) || 0,
    totalSessions: parseInt(row.metricValues[1].value, 10) || 0,
    totalUsers: parseInt(row.metricValues[2].value, 10) || 0,
    avgSessionDuration: parseFloat(row.metricValues[3].value) || 0,
  };
}

// ── Audience Segments ──────────────────────────────────────────────────────

/**
 * Fetch audience segment data from GA4.
 * Runs 6 GA4 Data API queries in parallel to build a complete audience profile.
 *
 * The day/hour breakdown is critical for the smart-scheduler: it tells us
 * when OUR specific audience is active, replacing generic Paris-timezone defaults.
 *
 * @param {number} days - Lookback window (default 30)
 * @returns {Promise<{
 *   byCountry: Array<{country: string, sessions: number, percentage: number}>,
 *   byDevice: Array<{device: string, sessions: number, percentage: number}>,
 *   byChannel: Array<{channel: string, sessions: number, engagedRate: number}>,
 *   newVsReturning: {new: number, returning: number, returningRate: number},
 *   byDayOfWeek: Array<{day: string, sessions: number}>,
 *   byHour: Array<{hour: string, sessions: number}>
 * }>}
 */
export async function fetchAudienceSegments(days = 30) {
  const client = createClient();
  const dateRange = {
    startDate: daysAgoStr(days),
    endDate: 'today',
  };

  log(`Fetching audience segments for the last ${days} days...`);

  // Run all 6 queries in parallel for speed
  const [
    countryRes,
    deviceRes,
    channelRes,
    newRetRes,
    dayRes,
    hourRes,
  ] = await Promise.all([
    // 1. By country
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [dateRange],
      dimensions: [{ name: 'country' }],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    }),
    // 2. By device category
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [dateRange],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    // 3. By channel group
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [dateRange],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
    // 4. New vs returning users
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [dateRange],
      dimensions: [{ name: 'newVsReturning' }],
      metrics: [{ name: 'sessions' }],
    }),
    // 5. By day of week (0=Sunday, 6=Saturday in GA4)
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [dateRange],
      dimensions: [{ name: 'dayOfWeek' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'dayOfWeek' } }],
    }),
    // 6. By hour of day (00-23)
    client.runReport({
      property: `properties/${GA4_PROPERTY}`,
      dateRanges: [dateRange],
      dimensions: [{ name: 'hour' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'hour' } }],
    }),
  ]);

  // ── Parse results ──

  // Country
  const countryRows = countryRes[0].rows ?? [];
  const countryTotalSessions = countryRows.reduce((s, r) => s + (parseInt(r.metricValues[0].value, 10) || 0), 0);
  const byCountry = countryRows.map(row => {
    const sessions = parseInt(row.metricValues[0].value, 10) || 0;
    return {
      country: row.dimensionValues[0].value,
      sessions,
      percentage: countryTotalSessions > 0
        ? Math.round((sessions / countryTotalSessions) * 10000) / 100
        : 0,
    };
  });

  // Device
  const deviceRows = deviceRes[0].rows ?? [];
  const deviceTotalSessions = deviceRows.reduce((s, r) => s + (parseInt(r.metricValues[0].value, 10) || 0), 0);
  const byDevice = deviceRows.map(row => {
    const sessions = parseInt(row.metricValues[0].value, 10) || 0;
    return {
      device: row.dimensionValues[0].value,
      sessions,
      percentage: deviceTotalSessions > 0
        ? Math.round((sessions / deviceTotalSessions) * 10000) / 100
        : 0,
    };
  });

  // Channel
  const channelRows = channelRes[0].rows ?? [];
  const byChannel = channelRows.map(row => {
    const sessions = parseInt(row.metricValues[0].value, 10) || 0;
    const engaged = parseInt(row.metricValues[1].value, 10) || 0;
    return {
      channel: row.dimensionValues[0].value,
      sessions,
      engagedRate: sessions > 0
        ? Math.round((engaged / sessions) * 10000) / 100
        : 0,
    };
  });

  // New vs Returning
  const nrRows = newRetRes[0].rows ?? [];
  let newSessions = 0;
  let returningSessions = 0;
  for (const row of nrRows) {
    const val = parseInt(row.metricValues[0].value, 10) || 0;
    const type = row.dimensionValues[0].value.toLowerCase();
    if (type === 'new') newSessions = val;
    else if (type === 'returning') returningSessions = val;
  }
  const totalNR = newSessions + returningSessions;
  const newVsReturning = {
    new: newSessions,
    returning: returningSessions,
    returningRate: totalNR > 0
      ? Math.round((returningSessions / totalNR) * 10000) / 100
      : 0,
  };

  // Day of week — GA4 uses 0=Sunday through 6=Saturday
  const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const dayRows = dayRes[0].rows ?? [];
  const byDayOfWeek = dayRows.map(row => ({
    day: DAY_NAMES[parseInt(row.dimensionValues[0].value, 10)] || row.dimensionValues[0].value,
    sessions: parseInt(row.metricValues[0].value, 10) || 0,
  }));

  // Hour
  const hourRows = hourRes[0].rows ?? [];
  const byHour = hourRows.map(row => ({
    hour: row.dimensionValues[0].value.padStart(2, '0'),
    sessions: parseInt(row.metricValues[0].value, 10) || 0,
  }));

  const result = {
    fetchedAt: new Date().toISOString(),
    days,
    byCountry,
    byDevice,
    byChannel,
    newVsReturning,
    byDayOfWeek,
    byHour,
  };

  log(`Audience segments: ${byCountry.length} countries, ${byDevice.length} devices, ${byChannel.length} channels`);
  log(`Top country: ${byCountry[0]?.country || 'N/A'} (${byCountry[0]?.percentage || 0}%)`);
  log(`New: ${newSessions}, Returning: ${returningSessions} (${newVsReturning.returningRate}%)`);

  // Write output to data/audience-segments.json
  const dataDir = join(__dirname, '..', 'data');
  const outputPath = join(dataDir, 'audience-segments.json');
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    log(`Audience segments written to ${outputPath}`);
  } catch (writeErr) {
    logError(`Failed to write audience segments: ${writeErr.message}`);
  }

  return result;
}

// ── CLI mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('ga4-fetcher')) {
  const command = process.argv[2] || 'top';
  const days = parseInt(process.argv[3] || '30', 10);

  (async () => {
    try {
      switch (command) {
        case 'top': {
          const articles = await fetchTopArticles(days, 20);
          console.log(JSON.stringify(articles, null, 2));
          break;
        }
        case 'sources': {
          const pagePath = process.argv[3] || '/';
          const d = parseInt(process.argv[4] || '30', 10);
          const sources = await fetchArticleTrafficSources(pagePath, d);
          console.log(JSON.stringify(sources, null, 2));
          break;
        }
        case 'summary': {
          const summary = await fetchSiteSummary(days);
          console.log(JSON.stringify(summary, null, 2));
          break;
        }
        case 'audience': {
          const segments = await fetchAudienceSegments(days);
          console.log(JSON.stringify(segments, null, 2));
          break;
        }
        default:
          console.log('Usage: node ga4-fetcher.js [top|sources|summary|audience] [days]');
      }
    } catch (err) {
      logError(err.message);
      process.exit(1);
    }
  })();
}
