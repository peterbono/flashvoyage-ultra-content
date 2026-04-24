#!/usr/bin/env node

/**
 * DEEP FOCUS TRACKER — per-article surveillance for articles under SEO deep focus.
 *
 * Pulls daily metrics for each article listed in data/deep-focus-tracked.json:
 *  - GSC (search-console API)  — impressions, clicks, CTR, position on primary kw,
 *                                 + top queries from keywordCluster
 *  - GA4 (property 505793742)  — sessions last 24h, broken down by source (quora,
 *                                 reddit, others ≥1 session)
 *  - Travelpayouts Finance API — conversions with sub_id starting with "{wpId}-"
 *                                 in the last 24h and since focusStartedAt
 *  - 7-day impressions trend (sparkline data)
 *
 * Design:
 *  - never throws — each metric fails to `null` / `'n/a'` and the caller renders it
 *    as "n/a" without crashing the whole section
 *  - in-memory cache, 15min TTL, keyed by the slug
 *  - zero new npm deps (uses googleapis for GSC + google-auth-library for GA4,
 *    both already dependencies of the digest generator)
 *
 * Public API:
 *   buildDeepFocusReport()   → Promise<DeepFocusReport>
 *   clearCache()             → void
 *
 * DeepFocusReport shape:
 *   {
 *     generatedAt: ISO,
 *     articles: [{
 *       slug, wpId, primaryKeyword, focusStartedAt, daysSinceFocus,
 *       metrics: {
 *         gsc: { impressions24h, clicks24h, ctr24h, avgImp7d, positionToday,
 *                positionAtD0, topQueries: [{ query, position, impressions, clicks }],
 *                sparkline: [{ date, impressions }], available, error? },
 *         ga4: { sessions24h, quoraSessions24h, redditSessions24h,
 *                otherSources: [{ source, sessions }], available, error? },
 *         tp:  { conversions24h, conversionsSinceFocus, revenueEur24h, revenueEurSinceFocus,
 *                topPartner, available, error?, todo? }
 *       },
 *       deltas: {
 *         impressions24hVsAvg7d: { pct, badge },  // '▲' | '▼' | '◆'
 *         positionVsD0: { delta, badge },
 *         sessions24hVsSameDayLastWeek: { pct, badge }
 *       },
 *       status: 'ok' | 'partial' | 'no-data'
 *     }]
 *   }
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_PATH = join(ROOT, 'data', 'deep-focus-tracked.json');
const SA_PATH = join(ROOT, 'ga4-service-account.json');

const GA4_PROPERTY_ID = '505793742'; // HARDCODED per spec — DO NOT CHANGE
const GSC_SITE_URL = 'https://flashvoyage.com/';
const CACHE_TTL_MS = 15 * 60 * 1000;

let _cache = { at: 0, data: null };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function log(msg) {
  console.error(`[DEEP-FOCUS] ${msg}`);
}

function loadConfig() {
  try {
    if (!existsSync(CONFIG_PATH)) return { articles: [] };
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    return { articles: Array.isArray(parsed?.articles) ? parsed.articles : [] };
  } catch (err) {
    log(`config load failed: ${err.message}`);
    return { articles: [] };
  }
}

function loadServiceAccount() {
  try {
    if (existsSync(SA_PATH)) return JSON.parse(readFileSync(SA_PATH, 'utf-8'));
    if (process.env.GA4_SERVICE_ACCOUNT) return JSON.parse(process.env.GA4_SERVICE_ACCOUNT);
  } catch (err) {
    log(`service account load failed: ${err.message}`);
  }
  return null;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysBetween(fromIso, toIso = ymd(new Date())) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function pctDelta(current, baseline) {
  if (baseline === 0 || baseline == null) return null;
  return ((current - baseline) / baseline) * 100;
}

function badgeFor(pct) {
  if (pct == null || Number.isNaN(pct)) return '◆';
  if (pct >= 5) return '▲';
  if (pct <= -5) return '▼';
  return '◆';
}

// ─────────────────────────────────────────────────────────────────────────────
// GSC fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchGscForArticle(article, deps) {
  const { google } = deps;
  const saKey = loadServiceAccount();
  if (!saKey) return { available: false, error: 'no_service_account' };

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: saKey,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    const sc = google.searchconsole({ version: 'v1', auth });
    const pageUrl = `${GSC_SITE_URL}${article.slug}/`;

    const today = new Date();
    // GSC has a ~2-day data delay so "last 24h" is best-effort on the most recent day with data.
    const end24h = ymd(today);
    const start24h = ymd(daysAgo(1));
    const start7d = ymd(daysAgo(7));
    const end7d = ymd(daysAgo(1));
    const startD0 = article.focusStartedAt || start7d;

    // 1) 24h page metrics
    let impressions24h = null, clicks24h = null, ctr24h = null;
    try {
      const r = await sc.searchanalytics.query({
        siteUrl: GSC_SITE_URL,
        requestBody: {
          startDate: start24h,
          endDate: end24h,
          dimensions: [],
          dimensionFilterGroups: [{
            filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
          }],
          rowLimit: 1,
        },
      });
      const row = r.data?.rows?.[0];
      impressions24h = row?.impressions ?? 0;
      clicks24h = row?.clicks ?? 0;
      ctr24h = row?.ctr ?? 0;
    } catch (err) {
      log(`GSC 24h page failed (${article.slug}): ${err.message}`);
    }

    // 2) 7-day daily average (for delta baseline) + sparkline
    let sparkline = [];
    let avgImp7d = null;
    try {
      const r = await sc.searchanalytics.query({
        siteUrl: GSC_SITE_URL,
        requestBody: {
          startDate: start7d,
          endDate: end7d,
          dimensions: ['date'],
          dimensionFilterGroups: [{
            filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
          }],
          rowLimit: 50,
        },
      });
      const rows = r.data?.rows || [];
      sparkline = rows.map(row => ({
        date: row.keys[0],
        impressions: row.impressions || 0,
      }));
      if (sparkline.length > 0) {
        const total = sparkline.reduce((s, d) => s + d.impressions, 0);
        avgImp7d = total / sparkline.length;
      }
    } catch (err) {
      log(`GSC sparkline failed (${article.slug}): ${err.message}`);
    }

    // 3) Position on primary keyword — today
    let positionToday = null;
    try {
      const r = await sc.searchanalytics.query({
        siteUrl: GSC_SITE_URL,
        requestBody: {
          startDate: start24h,
          endDate: end24h,
          dimensions: ['query'],
          dimensionFilterGroups: [{
            filters: [
              { dimension: 'page', operator: 'equals', expression: pageUrl },
              { dimension: 'query', operator: 'equals', expression: article.primaryKeyword },
            ],
          }],
          rowLimit: 1,
        },
      });
      const row = r.data?.rows?.[0];
      if (row) positionToday = row.position;
    } catch (err) {
      log(`GSC position today failed (${article.slug}): ${err.message}`);
    }

    // 4) Position on primary keyword — at focus start (D0-ish)
    let positionAtD0 = null;
    try {
      const r = await sc.searchanalytics.query({
        siteUrl: GSC_SITE_URL,
        requestBody: {
          startDate: startD0,
          endDate: startD0,
          dimensions: ['query'],
          dimensionFilterGroups: [{
            filters: [
              { dimension: 'page', operator: 'equals', expression: pageUrl },
              { dimension: 'query', operator: 'equals', expression: article.primaryKeyword },
            ],
          }],
          rowLimit: 1,
        },
      });
      const row = r.data?.rows?.[0];
      if (row) positionAtD0 = row.position;
    } catch (err) {
      log(`GSC position D0 failed (${article.slug}): ${err.message}`);
    }

    // 5) Top ranking queries from keywordCluster
    let topQueries = [];
    try {
      const r = await sc.searchanalytics.query({
        siteUrl: GSC_SITE_URL,
        requestBody: {
          startDate: start7d,
          endDate: end24h,
          dimensions: ['query'],
          dimensionFilterGroups: [{
            filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
          }],
          rowLimit: 30,
        },
      });
      const rows = r.data?.rows || [];
      const cluster = (article.keywordCluster || []).map(k => k.toLowerCase());
      const scored = rows
        .map(row => ({
          query: row.keys[0],
          position: row.position,
          impressions: row.impressions,
          clicks: row.clicks,
        }))
        .filter(q => {
          const ql = q.query.toLowerCase();
          return cluster.some(k => ql.includes(k) || k.includes(ql));
        })
        .sort((a, b) => a.position - b.position);
      topQueries = scored.slice(0, 5);
    } catch (err) {
      log(`GSC top queries failed (${article.slug}): ${err.message}`);
    }

    return {
      available: true,
      impressions24h,
      clicks24h,
      ctr24h,
      avgImp7d,
      positionToday,
      positionAtD0,
      topQueries,
      sparkline,
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GA4 fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchGa4ForArticle(article, deps) {
  const { GoogleAuth } = deps;
  const saKey = loadServiceAccount();
  if (!saKey) return { available: false, error: 'no_service_account' };

  try {
    const auth = new GoogleAuth({
      credentials: saKey,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    const client = await auth.getClient();
    const pagePath = `/${article.slug}/`;

    const end = ymd(new Date());
    const start = ymd(daysAgo(1));
    // Same-day-last-week baseline: sessions 7-8d ago on the article
    const startLw = ymd(daysAgo(8));
    const endLw = ymd(daysAgo(7));

    // 1) 24h by source on target page
    let rows = [];
    try {
      const res = await client.request({
        url: `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
        method: 'POST',
        data: {
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: [{ name: 'sessionSource' }],
          metrics: [{ name: 'sessions' }],
          dimensionFilter: {
            filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } },
          },
          limit: 50,
        },
      });
      rows = res.data?.rows || [];
    } catch (err) {
      log(`GA4 24h failed (${article.slug}): ${err.message}`);
      return { available: false, error: err.message };
    }

    let sessions24h = 0;
    let quoraSessions24h = 0;
    let redditSessions24h = 0;
    const otherSources = [];
    for (const row of rows) {
      const src = row.dimensionValues[0].value || '';
      const sess = parseInt(row.metricValues[0].value, 10) || 0;
      sessions24h += sess;
      const sl = src.toLowerCase();
      if (sl.includes('quora')) quoraSessions24h += sess;
      else if (sl.includes('reddit')) redditSessions24h += sess;
      else if (sess >= 1) otherSources.push({ source: src, sessions: sess });
    }
    otherSources.sort((a, b) => b.sessions - a.sessions);

    // 2) Same-day-last-week sessions (single number, all sources)
    let sessionsLastWeek = null;
    try {
      const res = await client.request({
        url: `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
        method: 'POST',
        data: {
          dateRanges: [{ startDate: startLw, endDate: endLw }],
          dimensions: [],
          metrics: [{ name: 'sessions' }],
          dimensionFilter: {
            filter: { fieldName: 'pagePath', stringFilter: { matchType: 'EXACT', value: pagePath } },
          },
          limit: 1,
        },
      });
      const row = res.data?.rows?.[0];
      sessionsLastWeek = row ? (parseInt(row.metricValues[0].value, 10) || 0) : 0;
    } catch (err) {
      log(`GA4 sameDayLastWeek failed (${article.slug}): ${err.message}`);
    }

    return {
      available: true,
      sessions24h,
      quoraSessions24h,
      redditSessions24h,
      otherSources: otherSources.slice(0, 5),
      sessionsLastWeek,
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Travelpayouts fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTpForArticle(article) {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  if (!token) return { available: false, error: 'no_token' };

  const focusStart = article.focusStartedAt || ymd(daysAgo(7));
  const today = ymd(new Date());
  const start24h = ymd(daysAgo(1));

  async function actions(dateFrom, dateTo) {
    const url = `https://api.travelpayouts.com/finance/v2/get_user_actions_affecting_balance?date_from=${dateFrom}&date_to=${dateTo}&limit=100&offset=0`;
    const res = await fetch(url, {
      headers: { 'X-Access-Token': token },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return await res.json();
  }

  try {
    const [since, day] = await Promise.all([
      actions(focusStart, today),
      actions(start24h, today),
    ]);

    const wpIdStr = String(article.wpId || '');
    const reSub = wpIdStr ? new RegExp(`^${wpIdStr}-`) : null;

    const match = (j) => {
      const list = Array.isArray(j?.actions) ? j.actions : [];
      if (!reSub) return list;
      return list.filter(a => {
        const sub = a.sub_id || a.subId || a.sub || '';
        return reSub.test(String(sub));
      });
    };

    const sinceMatches = match(since);
    const dayMatches = match(day);

    const sumEur = (list) => list.reduce((s, a) => s + (parseFloat(a.profit_eur || a.profit || 0) || 0), 0);

    // Top partner (by count within sinceMatches)
    const byPartner = new Map();
    for (const a of sinceMatches) {
      const name = a.campaign_name || a.partner || a.campaign || 'unknown';
      byPartner.set(name, (byPartner.get(name) || 0) + 1);
    }
    const topPartner = [...byPartner.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // If we couldn't match any action by sub_id but the account has zero activity,
    // this is still "available" — just 0 conversions.
    const todo = sinceMatches.length === 0 && (Array.isArray(since?.actions) ? since.actions.length : 0) > 0
      ? 'sub_id attribution pattern did not match any action — validate regex on first conversion'
      : null;

    return {
      available: true,
      conversions24h: dayMatches.length,
      conversionsSinceFocus: sinceMatches.length,
      revenueEur24h: sumEur(dayMatches),
      revenueEurSinceFocus: sumEur(sinceMatches),
      topPartner,
      todo,
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build report
// ─────────────────────────────────────────────────────────────────────────────

export async function buildDeepFocusReport() {
  const now = Date.now();
  if (_cache.data && now - _cache.at < CACHE_TTL_MS) {
    return _cache.data;
  }

  const cfg = loadConfig();
  if (!cfg.articles.length) {
    const empty = { generatedAt: new Date().toISOString(), articles: [] };
    _cache = { at: now, data: empty };
    return empty;
  }

  // Lazy-load google deps to keep the module cheap when there are 0 articles.
  let googleDeps = null;
  let authDeps = null;
  try {
    googleDeps = await import('googleapis');
    authDeps = await import('google-auth-library');
  } catch (err) {
    log(`google libs unavailable: ${err.message}`);
  }

  const results = [];
  for (const a of cfg.articles) {
    const [gsc, ga4, tp] = await Promise.all([
      googleDeps ? fetchGscForArticle(a, googleDeps).catch(e => ({ available: false, error: e.message })) : Promise.resolve({ available: false, error: 'no_googleapis' }),
      authDeps ? fetchGa4ForArticle(a, authDeps).catch(e => ({ available: false, error: e.message })) : Promise.resolve({ available: false, error: 'no_google_auth' }),
      fetchTpForArticle(a).catch(e => ({ available: false, error: e.message })),
    ]);

    // Deltas
    const impPct = gsc.available && gsc.avgImp7d != null
      ? pctDelta(gsc.impressions24h || 0, gsc.avgImp7d)
      : null;
    const posDelta = gsc.available && typeof gsc.positionToday === 'number' && typeof gsc.positionAtD0 === 'number'
      ? gsc.positionAtD0 - gsc.positionToday  // positive = improved (lower position number)
      : null;
    const sessPct = ga4.available && ga4.sessionsLastWeek != null
      ? pctDelta(ga4.sessions24h || 0, ga4.sessionsLastWeek)
      : null;

    const availableCount = [gsc.available, ga4.available, tp.available].filter(Boolean).length;
    const status = availableCount === 3 ? 'ok' : availableCount === 0 ? 'no-data' : 'partial';

    results.push({
      slug: a.slug,
      wpId: a.wpId,
      primaryKeyword: a.primaryKeyword,
      focusStartedAt: a.focusStartedAt,
      daysSinceFocus: a.focusStartedAt ? daysBetween(a.focusStartedAt) : null,
      notes: a.notes,
      metrics: { gsc, ga4, tp },
      deltas: {
        impressions24hVsAvg7d: { pct: impPct, badge: badgeFor(impPct) },
        positionVsD0: {
          delta: posDelta,
          // For position, IMPROVEMENT means delta > 0 (position got smaller).
          badge: posDelta == null ? '◆' : posDelta > 0.2 ? '▲' : posDelta < -0.2 ? '▼' : '◆',
        },
        sessions24hVsSameDayLastWeek: { pct: sessPct, badge: badgeFor(sessPct) },
      },
      status,
    });
  }

  const report = { generatedAt: new Date().toISOString(), articles: results };
  _cache = { at: now, data: report };
  return report;
}

export function clearCache() {
  _cache = { at: 0, data: null };
}

export default { buildDeepFocusReport, clearCache };
