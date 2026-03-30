#!/usr/bin/env node

/**
 * Revenue Tracker — FlashVoyage Content Intelligence Engine
 *
 * Tracks and attributes affiliate revenue across the content funnel:
 *   Article → Widget Click → Affiliate Conversion → Revenue
 *
 * Data sources:
 *   1. Travelpayouts Statistics API (partner dashboard)
 *   2. GA4 event tracking (widget click events)
 *   3. Article Scorer output (for traffic context)
 *
 * ═══════════════════════════════════════════════════════════════════
 * TRAVELPAYOUTS STATISTICS API
 * ═══════════════════════════════════════════════════════════════════
 *
 * Endpoint: https://api.travelpayouts.com/statistics/v1/sales
 * Auth: X-Access-Token header (same as Partner Links API)
 * Docs: https://support.travelpayouts.com/hc/en-us/articles/360015558499
 *
 * Available endpoints:
 *   GET /statistics/v1/sales       — individual sale records
 *   GET /statistics/v1/balance     — current balance
 *   GET /statistics/v1/payments    — payment history
 *
 * The sales endpoint returns:
 *   {
 *     "data": [{
 *       "created_at": "2026-03-15T12:00:00Z",
 *       "click_id": "...",
 *       "status": "confirmed|pending|rejected",
 *       "payout": 2.50,           // EUR earned
 *       "payout_currency": "EUR",
 *       "program": "aviasales",   // Which brand
 *       "sub_id": "article-123-flights",  // Our custom tracking ID!
 *       "source": "flashvoyage.com"
 *     }]
 *   }
 *
 * CRITICAL: sub_id tracking
 *   Our affiliate links use sub_id format: "{articleId}-{widgetType}"
 *   e.g., "4132-flights", "4150-esim", "4200-hotels"
 *   This lets us attribute revenue to specific articles AND widget types.
 *
 * ═══════════════════════════════════════════════════════════════════
 * GA4 WIDGET CLICK TRACKING
 * ═══════════════════════════════════════════════════════════════════
 *
 * To track widget clicks in GA4, inject this JS on the site:
 *
 *   // Track Travelpayouts widget interactions
 *   document.addEventListener('click', function(e) {
 *     const widget = e.target.closest('[data-tp-widget]');
 *     if (widget) {
 *       gtag('event', 'affiliate_click', {
 *         event_category: 'monetization',
 *         event_label: widget.dataset.tpWidget,  // 'flights', 'tours', 'esim'
 *         page_path: window.location.pathname,
 *       });
 *     }
 *     // Also track CTA links
 *     const ctaLink = e.target.closest('a[rel*="sponsored"]');
 *     if (ctaLink) {
 *       gtag('event', 'affiliate_click', {
 *         event_category: 'monetization',
 *         event_label: 'cta_link',
 *         page_path: window.location.pathname,
 *       });
 *     }
 *   });
 *
 * This code should be added via WPCode Lite (already installed) as a
 * site-wide footer snippet.
 *
 * ═══════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const REVENUE_PATH = join(DATA_DIR, 'revenue-report.json');

// ── Config ──────────────────────────────────────────────────────────────────

const TP_API_BASE = 'https://api.travelpayouts.com';
const TP_STATS_BASE = 'https://www.travelpayouts.com/api/statistics/v1';

/**
 * Load Travelpayouts API token from env or config.
 */
function getTPToken() {
  // Try env first
  const token = process.env.TRAVELPAYOUTS_API_TOKEN || process.env.TRAVELPAYOUT_API;
  if (token) return token;

  // Try config.js exports
  try {
    // Dynamic import not ideal here; better to use env
    return null;
  } catch {
    return null;
  }
}

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[REVENUE] ${msg}`);
}

function logError(msg) {
  console.error(`[REVENUE] ERROR: ${msg}`);
}

// ── Travelpayouts Statistics API ────────────────────────────────────────────

/**
 * Fetch sales/conversions from Travelpayouts partner API.
 *
 * API: GET https://www.travelpayouts.com/api/statistics/v1/sales
 * Params:
 *   - date_from: YYYY-MM-DD
 *   - date_to: YYYY-MM-DD
 *   - status: confirmed|pending|rejected (optional)
 *   - limit: max results (default 100)
 *   - offset: pagination offset
 *
 * @param {number} days - Lookback window (default 30)
 * @param {string} [status] - Filter by status ('confirmed', 'pending', or null for all)
 * @returns {Promise<Array<{ createdAt: string, program: string, payout: number, currency: string, status: string, subId: string, articleId: string, widgetType: string }>>}
 */
export async function fetchSales(days = 30, status = null) {
  const token = getTPToken();
  if (!token) {
    log('No Travelpayouts API token — revenue tracking unavailable');
    return [];
  }

  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);
  const dateTo = new Date();

  const params = {
    date_from: dateFrom.toISOString().slice(0, 10),
    date_to: dateTo.toISOString().slice(0, 10),
    limit: 500,
    offset: 0,
  };

  if (status) params.status = status;

  log(`Fetching TP sales: ${params.date_from} to ${params.date_to}${status ? ` (${status})` : ''}...`);

  try {
    const response = await axios.get(`${TP_STATS_BASE}/sales`, {
      params,
      headers: {
        'X-Access-Token': token,
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    const sales = (response.data?.data || response.data || []).map(sale => {
      // Parse sub_id to extract articleId and widgetType
      const subId = sale.sub_id || '';
      const parts = subId.split('-');
      const articleId = parts[0] || 'unknown';
      const widgetType = parts.slice(1).join('-') || 'unknown';

      return {
        createdAt: sale.created_at,
        program: sale.program || 'unknown',
        payout: parseFloat(sale.payout) || 0,
        currency: sale.payout_currency || 'EUR',
        status: sale.status || 'unknown',
        subId,
        articleId,
        widgetType,
        clickId: sale.click_id,
      };
    });

    log(`Fetched ${sales.length} sales records`);
    return sales;
  } catch (err) {
    // The exact API might differ — Travelpayouts has evolved their endpoints
    // Try the alternative endpoint format
    if (err.response?.status === 404 || err.response?.status === 401) {
      log('Primary stats endpoint failed, trying alternative...');
      return fetchSalesAlternative(days, status);
    }
    logError(`TP sales fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Alternative: fetch clicks from the Partner Links API statistics.
 * Available at: GET https://api.travelpayouts.com/statistics/v1/clicks
 *
 * This endpoint tracks clicks through affiliate links created by our
 * travelpayouts-api-client.js (convertToAffiliateLinks), which include sub_id.
 */
async function fetchSalesAlternative(days, status) {
  const token = getTPToken();
  if (!token) return [];

  try {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const response = await axios.get(`${TP_API_BASE}/statistics/v1/clicks`, {
      params: {
        date_from: dateFrom.toISOString().slice(0, 10),
        date_to: new Date().toISOString().slice(0, 10),
        limit: 500,
      },
      headers: {
        'X-Access-Token': token,
      },
      timeout: 15000,
    });

    return (response.data?.data || []).map(click => ({
      createdAt: click.created_at,
      program: click.program || 'unknown',
      payout: 0, // Clicks don't have payouts yet
      currency: 'EUR',
      status: 'click', // Not a conversion, just a click
      subId: click.sub_id || '',
      articleId: (click.sub_id || '').split('-')[0] || 'unknown',
      widgetType: (click.sub_id || '').split('-').slice(1).join('-') || 'unknown',
      clickId: click.click_id,
    }));
  } catch (err) {
    logError(`Alternative TP endpoint failed: ${err.message}`);
    return [];
  }
}

/**
 * Fetch current Travelpayouts balance.
 *
 * @returns {Promise<{ balance: number, currency: string, pendingBalance: number }>}
 */
export async function fetchBalance() {
  const token = getTPToken();
  if (!token) return { balance: 0, currency: 'EUR', pendingBalance: 0 };

  try {
    const response = await axios.get(`${TP_STATS_BASE}/balance`, {
      headers: { 'X-Access-Token': token },
      timeout: 10000,
    });

    return {
      balance: parseFloat(response.data?.confirmed || response.data?.balance || 0),
      currency: 'EUR',
      pendingBalance: parseFloat(response.data?.pending || 0),
    };
  } catch (err) {
    logError(`Balance fetch failed: ${err.message}`);
    return { balance: 0, currency: 'EUR', pendingBalance: 0 };
  }
}

// ── Revenue Attribution by Article ──────────────────────────────────────────

/**
 * Compute Revenue Per Article (RPA) and RPM (Revenue per 1000 views).
 *
 * Cross-references:
 *   - TP sales data (sub_id → articleId)
 *   - GA4 pageview data (per article)
 *   - Article scores (for context)
 *
 * @param {number} days - Lookback window
 * @returns {Promise<Array<{ articleId: string, slug: string, revenue: number, clicks: number, conversions: number, pageviews: number, rpm: number, conversionRate: number }>>}
 */
export async function computeRevenueByArticle(days = 30) {
  log(`Computing revenue by article (last ${days} days)...`);

  // Fetch sales data
  const sales = await fetchSales(days);

  // Group by articleId
  const byArticle = {};
  for (const sale of sales) {
    const id = sale.articleId;
    if (!byArticle[id]) {
      byArticle[id] = { revenue: 0, clicks: 0, conversions: 0, programs: {} };
    }
    if (sale.status === 'click') {
      byArticle[id].clicks += 1;
    } else {
      byArticle[id].conversions += 1;
      byArticle[id].revenue += sale.payout;
    }
    byArticle[id].programs[sale.program] = (byArticle[id].programs[sale.program] || 0) + 1;
  }

  // Fetch GA4 pageview data
  let ga4Data = {};
  try {
    const { fetchTopArticles } = await import('./ga4-fetcher.js');
    const articles = await fetchTopArticles(days, 500);
    for (const a of articles) {
      // Extract WP post ID from GA4 data if possible
      // Since we can't directly map pagePath → postId, we'll use the slug
      const slug = a.pagePath.replace(/^\/|\/$/g, '');
      ga4Data[slug] = { pageviews: a.pageviews, sessions: a.sessions };
    }
  } catch (err) {
    logError(`GA4 data unavailable: ${err.message}`);
  }

  // Combine
  const results = [];
  for (const [articleId, data] of Object.entries(byArticle)) {
    // Try to find matching GA4 data
    // articleId might be a post ID number; we need a slug lookup
    const pageviews = Object.values(ga4Data).reduce((best, pv) => {
      // For now, just use total site average as fallback
      return pv.pageviews > best ? pv.pageviews : best;
    }, 0) || 1;

    const rpm = pageviews > 0 ? Math.round((data.revenue / pageviews) * 1000 * 100) / 100 : 0;
    const conversionRate = data.clicks > 0 ? Math.round((data.conversions / data.clicks) * 10000) / 100 : 0;

    results.push({
      articleId,
      revenue: Math.round(data.revenue * 100) / 100,
      clicks: data.clicks,
      conversions: data.conversions,
      programs: data.programs,
      rpm,
      conversionRate,
    });
  }

  results.sort((a, b) => b.revenue - a.revenue);

  log(`Revenue computed for ${results.length} articles. Total revenue: ${results.reduce((s, r) => s + r.revenue, 0).toFixed(2)} EUR`);
  return results;
}

// ── Revenue by Widget Type ──────────────────────────────────────────────────

/**
 * Compute revenue breakdown by widget type (flights, esim, hotels, etc.).
 * Answers: "Which widget type generates the most revenue?"
 *
 * @param {number} days - Lookback window
 * @returns {Promise<Array<{ widgetType: string, revenue: number, clicks: number, conversions: number, avgPayout: number }>>}
 */
export async function computeRevenueByWidgetType(days = 30) {
  const sales = await fetchSales(days);

  const byType = {};
  for (const sale of sales) {
    const type = sale.widgetType || 'unknown';
    if (!byType[type]) byType[type] = { revenue: 0, clicks: 0, conversions: 0, payouts: [] };

    if (sale.status === 'click') {
      byType[type].clicks += 1;
    } else {
      byType[type].conversions += 1;
      byType[type].revenue += sale.payout;
      if (sale.payout > 0) byType[type].payouts.push(sale.payout);
    }
  }

  return Object.entries(byType).map(([type, data]) => ({
    widgetType: type,
    revenue: Math.round(data.revenue * 100) / 100,
    clicks: data.clicks,
    conversions: data.conversions,
    avgPayout: data.payouts.length > 0
      ? Math.round((data.revenue / data.payouts.length) * 100) / 100
      : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

// ── Revenue by Article Category ─────────────────────────────────────────────

/**
 * RPM by article category.
 * Answers: "Which types of articles generate the most revenue per 1000 views?"
 *
 * Uses the article scorer's detected article types + GA4 pageviews.
 *
 * @param {number} days - Lookback window
 * @returns {Promise<Object>} { byCategory: { budget: { rpm, totalRevenue, totalPV }, ... } }
 */
export async function computeRPMByCategory(days = 30) {
  // This requires cross-referencing article scores, GA4 data, and revenue data
  // Placeholder: will be wired in the orchestrator
  const revenue = await computeRevenueByArticle(days);
  const widgets = await computeRevenueByWidgetType(days);

  return {
    totalRevenue: revenue.reduce((s, r) => s + r.revenue, 0),
    topArticlesByRevenue: revenue.slice(0, 10),
    widgetBreakdown: widgets,
    generatedAt: new Date().toISOString(),
  };
}

// ── A/B Test Widget Placement ───────────────────────────────────────────────

/**
 * Widget placement A/B test framework.
 *
 * Strategy: Use sub_id to encode placement position.
 * sub_id format: "{articleId}-{widgetType}-{placement}"
 *
 * Placements:
 *   - "top" = After first H2 (above the fold)
 *   - "mid" = After 50% of content
 *   - "bottom" = Before conclusion
 *   - "sidebar" = In sidebar/floating
 *   - "inline" = Contextual within a paragraph
 *
 * The article pipeline (contextual-widget-placer-v2.js) should alternate
 * placements and encode them in the sub_id.
 *
 * After 30 days, compare RPM per placement:
 *   1. Group sales by sub_id placement suffix
 *   2. Compare conversion rates per placement
 *   3. Recommend optimal placement per widget type
 *
 * @param {number} days - Lookback window
 * @returns {Promise<Object>}
 */
export async function analyzeWidgetPlacement(days = 30) {
  const sales = await fetchSales(days);

  const byPlacement = {};
  for (const sale of sales) {
    // Parse placement from sub_id: "4132-flights-top"
    const parts = (sale.subId || '').split('-');
    const placement = parts.length >= 3 ? parts[parts.length - 1] : 'unknown';

    if (!byPlacement[placement]) {
      byPlacement[placement] = { clicks: 0, conversions: 0, revenue: 0 };
    }

    if (sale.status === 'click') {
      byPlacement[placement].clicks += 1;
    } else {
      byPlacement[placement].conversions += 1;
      byPlacement[placement].revenue += sale.payout;
    }
  }

  // Compute conversion rates
  const results = Object.entries(byPlacement).map(([placement, data]) => ({
    placement,
    clicks: data.clicks,
    conversions: data.conversions,
    revenue: Math.round(data.revenue * 100) / 100,
    conversionRate: data.clicks > 0 ? Math.round((data.conversions / data.clicks) * 10000) / 100 : 0,
  }));

  results.sort((a, b) => b.conversionRate - a.conversionRate);

  return {
    placements: results,
    recommendation: results.length > 0
      ? `Best placement: "${results[0].placement}" (${results[0].conversionRate}% CR). Move widgets to this position.`
      : 'Not enough data yet. Ensure sub_id includes placement suffix.',
  };
}

// ── GA4 Widget Click Tracking Code ──────────────────────────────────────────

/**
 * Generate the GA4 tracking snippet that should be injected into the site.
 * This tracks clicks on Travelpayouts widgets and CTA affiliate links.
 *
 * To install: WPCode Lite → Add Snippet → Footer → Paste this code.
 *
 * @returns {string} JavaScript code to inject
 */
export function generateGA4TrackingSnippet() {
  return `
<!-- FlashVoyage Affiliate Click Tracking -->
<script>
(function() {
  'use strict';

  // Track Travelpayouts widget clicks
  document.addEventListener('click', function(e) {
    // Travelpayouts widgets (data-tp-widget or iframe interactions)
    var widget = e.target.closest('[data-tp-widget], .tp-widget-container, .travelpayouts-widget');
    if (widget) {
      var widgetType = widget.getAttribute('data-tp-widget') ||
                       widget.getAttribute('data-widget-id') ||
                       'unknown';
      if (typeof gtag === 'function') {
        gtag('event', 'affiliate_widget_click', {
          event_category: 'monetization',
          event_label: widgetType,
          page_path: window.location.pathname,
          article_slug: window.location.pathname.replace(/^\\/|\\/$/g, ''),
        });
      }
    }

    // Track CTA affiliate links (rel="sponsored" or rel="nofollow sponsored")
    var link = e.target.closest('a[rel*="sponsored"]');
    if (link) {
      var href = link.getAttribute('href') || '';
      var program = 'unknown';
      if (href.includes('aviasales') || href.includes('tp.media')) program = 'aviasales';
      else if (href.includes('airalo')) program = 'airalo';
      else if (href.includes('booking.com')) program = 'booking';
      else if (href.includes('visitorcoverage')) program = 'insurance';

      if (typeof gtag === 'function') {
        gtag('event', 'affiliate_cta_click', {
          event_category: 'monetization',
          event_label: program,
          page_path: window.location.pathname,
          destination_url: href.substring(0, 100),
        });
      }
    }
  }, true);

  console.log('[FV] Affiliate click tracking initialized');
})();
</script>`.trim();
}

// ── Full Revenue Report ─────────────────────────────────────────────────────

/**
 * Generate a comprehensive revenue report.
 *
 * @param {number} days - Lookback window (default 30)
 * @returns {Promise<Object>}
 */
export async function generateRevenueReport(days = 30) {
  log(`Generating revenue report (last ${days} days)...`);

  const [byArticle, byWidget, balance, placement] = await Promise.all([
    computeRevenueByArticle(days),
    computeRevenueByWidgetType(days),
    fetchBalance(),
    analyzeWidgetPlacement(days),
  ]);

  const totalRevenue = byArticle.reduce((s, r) => s + r.revenue, 0);
  const totalClicks = byArticle.reduce((s, r) => s + r.clicks, 0);
  const totalConversions = byArticle.reduce((s, r) => s + r.conversions, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    period: `Last ${days} days`,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalClicks,
      totalConversions,
      overallConversionRate: totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0,
      balance: balance.balance,
      pendingBalance: balance.pendingBalance,
    },
    topArticlesByRevenue: byArticle.slice(0, 10),
    widgetTypeBreakdown: byWidget,
    placementAnalysis: placement,
    recommendations: [],
  };

  // Generate recommendations
  if (totalClicks === 0) {
    report.recommendations.push('SETUP: No affiliate clicks tracked. Ensure sub_id is set in all widget links.');
    report.recommendations.push('INSTALL: Add GA4 tracking snippet via WPCode. Run: node revenue-tracker.js snippet');
  }

  if (byWidget.length > 0) {
    const topWidget = byWidget[0];
    report.recommendations.push(`TOP_WIDGET: ${topWidget.widgetType} generates most revenue (${topWidget.revenue} EUR). Add to more articles.`);
  }

  // Save report
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(REVENUE_PATH, JSON.stringify(report, null, 2), 'utf-8');
  log(`Revenue report saved to ${REVENUE_PATH}`);

  return report;
}

// ── CLI Mode ────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('revenue-tracker')) {
  const command = process.argv[2] || 'report';
  const days = parseInt(process.argv[3] || '30', 10);

  (async () => {
    try {
      switch (command) {
        case 'report': {
          const report = await generateRevenueReport(days);
          console.log(JSON.stringify(report, null, 2));
          break;
        }
        case 'sales': {
          const sales = await fetchSales(days);
          console.log(JSON.stringify(sales, null, 2));
          break;
        }
        case 'widgets': {
          const widgets = await computeRevenueByWidgetType(days);
          console.log(JSON.stringify(widgets, null, 2));
          break;
        }
        case 'placement': {
          const placement = await analyzeWidgetPlacement(days);
          console.log(JSON.stringify(placement, null, 2));
          break;
        }
        case 'balance': {
          const balance = await fetchBalance();
          console.log(JSON.stringify(balance, null, 2));
          break;
        }
        case 'snippet': {
          console.log(generateGA4TrackingSnippet());
          console.log('\n--- Copy the above into WPCode Lite as a Footer snippet ---');
          break;
        }
        default:
          console.log(`
Revenue Tracker — FlashVoyage

Usage:
  node revenue-tracker.js report [days]      Full revenue report
  node revenue-tracker.js sales [days]       Raw sales data from Travelpayouts
  node revenue-tracker.js widgets [days]     Revenue breakdown by widget type
  node revenue-tracker.js placement [days]   Widget placement A/B analysis
  node revenue-tracker.js balance            Current TP balance
  node revenue-tracker.js snippet            Generate GA4 tracking code for WPCode
`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}
