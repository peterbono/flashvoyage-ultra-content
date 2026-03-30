#!/usr/bin/env node

/**
 * Content Intelligence Engine — FlashVoyage Orchestrator
 *
 * The master orchestrator that runs all analytics modules and produces
 * a unified intelligence report. Designed to run daily via cron.
 *
 * Architecture:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │                CONTENT INTELLIGENCE ENGINE                      │
 *   │                                                                 │
 *   │   Phase 1: DATA COLLECTION (parallel)                           │
 *   │   ├── GA4 Fetcher ──────────── pageviews, sessions, duration   │
 *   │   ├── GSC Fetcher ──────────── queries, impressions, position  │
 *   │   ├── IG Stats Fetcher ─────── reel engagement metrics         │
 *   │   ├── Trends Scanner ───────── rising queries, destinations    │
 *   │   └── Revenue Tracker ──────── affiliate sales, clicks         │
 *   │                                                                 │
 *   │   Phase 2: ANALYSIS (parallel)                                  │
 *   │   ├── Article Scorer ───────── unified 0-10 score per article  │
 *   │   ├── Low-Hanging Fruit ────── SEO quick wins                  │
 *   │   ├── Cannibalization ──────── competing URLs detection        │
 *   │   ├── Content Gap Detector ─── missing articles to write       │
 *   │   └── Reel Attribution ─────── reel → article traffic mapping  │
 *   │                                                                 │
 *   │   Phase 3: ACTION PLANS (sequential)                            │
 *   │   ├── Refresh Queue ────────── articles to update              │
 *   │   ├── Reel Calendar ────────── next reels to produce           │
 *   │   ├── Content Calendar ─────── next articles to write          │
 *   │   └── Revenue Optimization ─── widget placement changes        │
 *   │                                                                 │
 *   │   Phase 4: OUTPUT                                               │
 *   │   └── data/intelligence-report.json                             │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Cron schedule: Daily at 06:00 Bangkok time (23:00 UTC-1)
 *   0 23 * * * cd /Users/floriangouloubi/flashvoyage-content && node social-distributor/analytics/content-intelligence-engine.js daily
 *
 * Or via npm script:
 *   npm run intelligence:daily
 *   npm run intelligence:full
 *   npm run intelligence:quick
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const REPORT_PATH = join(DATA_DIR, 'intelligence-report.json');

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [INTELLIGENCE] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] [INTELLIGENCE] ERROR: ${msg}`);
}

function logPhase(phase, msg) {
  log(`[Phase ${phase}] ${msg}`);
}

// ── Phase 1: Data Collection ────────────────────────────────────────────────

async function collectData(options = {}) {
  const { skipGSC = false, skipGA4 = false, skipIG = false, skipTrends = false, skipRevenue = false } = options;

  logPhase(1, 'Starting parallel data collection...');
  const startTime = Date.now();

  const results = {
    ga4: null,
    gsc: null,
    ig: null,
    trends: null,
    revenue: null,
    wpArticles: null,
  };

  const tasks = [];

  // GA4
  if (!skipGA4) {
    tasks.push(
      (async () => {
        try {
          const { fetchTopArticles } = await import('./ga4-fetcher.js');
          results.ga4 = await fetchTopArticles(30, 500);
          logPhase(1, `GA4: ${results.ga4.length} articles fetched`);
        } catch (err) {
          logError(`GA4: ${err.message}`);
          results.ga4 = [];
        }
      })()
    );
  }

  // GSC
  if (!skipGSC) {
    tasks.push(
      (async () => {
        try {
          const { fetchTopQueries, fetchTopPages, findLowHangingFruit, detectCannibalization, findDecliningQueries } = await import('./search-console-fetcher.js');

          const [queries, pages, fruit, cannibal, declining] = await Promise.all([
            fetchTopQueries(28, 500),
            fetchTopPages(28, 200),
            findLowHangingFruit(28),
            detectCannibalization(28),
            findDecliningQueries(90),
          ]);

          results.gsc = { queries, pages, fruit, cannibal, declining };
          logPhase(1, `GSC: ${queries.length} queries, ${fruit.length} fruit, ${cannibal.length} cannibalized, ${declining.length} declining`);
        } catch (err) {
          logError(`GSC: ${err.message}`);
          results.gsc = { queries: [], pages: [], fruit: [], cannibal: [], declining: [] };
        }
      })()
    );
  }

  // IG Stats
  if (!skipIG) {
    tasks.push(
      (async () => {
        try {
          const { fetchRecentReelStats } = await import('./ig-stats-fetcher.js');
          results.ig = await fetchRecentReelStats(30);
          logPhase(1, `IG: ${results.ig.length} reel stats fetched`);
        } catch (err) {
          logError(`IG: ${err.message}`);
          results.ig = [];
        }
      })()
    );
  }

  // Google Trends
  if (!skipTrends) {
    tasks.push(
      (async () => {
        try {
          // Use the trends scanner in scan mode
          const trendsPath = join(DATA_DIR, 'trends-report.json');
          if (existsSync(trendsPath)) {
            const trendsReport = JSON.parse(readFileSync(trendsPath, 'utf-8'));
            // Use cached trends if less than 24h old
            if (trendsReport.scannedAt && (Date.now() - new Date(trendsReport.scannedAt).getTime()) < 24 * 60 * 60 * 1000) {
              results.trends = trendsReport;
              logPhase(1, `Trends: Using cached report (${trendsReport.trendingTopics?.length || 0} topics)`);
              return;
            }
          }

          // Fetch fresh trends data
          // We import the scanner module but only use the data collection functions
          logPhase(1, 'Trends: Cache miss, skipping live scan (use npm run trends:scan)');
          results.trends = { trendingTopics: [], risingQueries: [], destinationInsights: {} };
        } catch (err) {
          logError(`Trends: ${err.message}`);
          results.trends = { trendingTopics: [], risingQueries: [], destinationInsights: {} };
        }
      })()
    );
  }

  // Revenue
  if (!skipRevenue) {
    tasks.push(
      (async () => {
        try {
          const { fetchSales } = await import('./revenue-tracker.js');
          const sales = await fetchSales(30);
          results.revenue = { sales };
          logPhase(1, `Revenue: ${sales.length} sales records`);
        } catch (err) {
          logError(`Revenue: ${err.message}`);
          results.revenue = { sales: [] };
        }
      })()
    );
  }

  // WordPress articles (always needed)
  tasks.push(
    (async () => {
      try {
        const response = await fetch(
          'https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&_fields=id,title,slug,content,modified,excerpt&status=publish',
          { signal: AbortSignal.timeout(15000) }
        );
        if (response.ok) {
          const posts = await response.json();
          const totalPages = parseInt(response.headers.get('x-wp-totalpages') || '1');
          const allPosts = [...posts];
          for (let page = 2; page <= totalPages; page++) {
            try {
              const nextResp = await fetch(
                `https://flashvoyage.com/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,title,slug,content,modified,excerpt&status=publish`,
                { signal: AbortSignal.timeout(10000) }
              );
              if (nextResp.ok) allPosts.push(...await nextResp.json());
            } catch { break; }
          }
          results.wpArticles = allPosts;
          logPhase(1, `WP: ${allPosts.length} articles fetched`);
        }
      } catch (err) {
        logError(`WP: ${err.message}`);
        results.wpArticles = [];
      }
    })()
  );

  await Promise.all(tasks);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logPhase(1, `Data collection complete in ${elapsed}s`);

  return results;
}

// ── Phase 2: Analysis ───────────────────────────────────────────────────────

async function runAnalysis(data) {
  logPhase(2, 'Starting analysis...');
  const startTime = Date.now();

  const analysis = {};

  // Article Scoring
  try {
    const { scoreAllArticles } = await import('./article-scorer.js');

    // Build trends relevance map
    const trendsRelevance = {};
    if (data.trends?.trendingTopics) {
      for (const topic of data.trends.trendingTopics) {
        // Simple: if a trending topic mentions a slug, give it relevance
        const articles = data.wpArticles || [];
        for (const article of articles) {
          const slug = article.slug || '';
          const topicText = (topic.query || topic.title || '').toLowerCase();
          if (topicText.includes(slug.replace(/-/g, ' ').slice(0, 10))) {
            trendsRelevance[slug] = Math.min((trendsRelevance[slug] || 0) + 0.3, 1.0);
          }
        }
      }
    }

    // Build affiliate clicks map from revenue data
    const affiliateData = {};
    if (data.revenue?.sales) {
      for (const sale of data.revenue.sales) {
        const id = sale.articleId;
        if (id && id !== 'unknown') {
          affiliateData[id] = (affiliateData[id] || 0) + 1;
        }
      }
    }

    analysis.articleScores = await scoreAllArticles({
      trendsData: trendsRelevance,
      affiliateData,
    });
    logPhase(2, `Article scores: ${analysis.articleScores.length} articles scored`);
  } catch (err) {
    logError(`Article scoring: ${err.message}`);
    analysis.articleScores = [];
  }

  // Content Gaps
  try {
    const { analyzeContentGaps } = await import('./content-gap-detector.js');
    const gscQueries = data.gsc?.queries || [];
    const trendsData = [
      ...(data.trends?.trendingTopics || []),
      ...(data.trends?.risingQueries || []),
    ];
    analysis.contentGaps = await analyzeContentGaps({ gscQueries, trendsData });
    logPhase(2, `Content gaps: ${analysis.contentGaps.length} opportunities found`);
  } catch (err) {
    logError(`Content gaps: ${err.message}`);
    analysis.contentGaps = [];
  }

  // Reel Attribution
  try {
    const { computeReelAttribution } = await import('./article-reel-router.js');
    analysis.reelAttribution = await computeReelAttribution(30);
    logPhase(2, `Reel attribution: ${analysis.reelAttribution.length} reel-article pairs`);
  } catch (err) {
    logError(`Reel attribution: ${err.message}`);
    analysis.reelAttribution = [];
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logPhase(2, `Analysis complete in ${elapsed}s`);

  return analysis;
}

// ── Phase 3: Action Plans ───────────────────────────────────────────────────

async function generateActionPlans(data, analysis) {
  logPhase(3, 'Generating action plans...');

  const plans = {};

  // Refresh Queue
  try {
    const { buildRefreshQueue } = await import('./content-refresh-engine.js');
    plans.refreshQueue = buildRefreshQueue({
      gscDeclining: data.gsc?.declining || [],
      articleScores: analysis.articleScores || [],
      wpArticles: data.wpArticles || [],
    });
    logPhase(3, `Refresh queue: ${plans.refreshQueue.length} articles`);
  } catch (err) {
    logError(`Refresh queue: ${err.message}`);
    plans.refreshQueue = [];
  }

  // Reel Calendar (next 7 days)
  try {
    const { routeArticleToReel } = await import('./article-reel-router.js');

    // Pick top 21 articles (3/day for 7 days) that don't have recent reels
    const topWithoutReels = (analysis.articleScores || [])
      .filter(a => a.raw.reelCount === 0)
      .slice(0, 21);

    plans.reelCalendar = topWithoutReels.map((article, i) => {
      const wpArticle = (data.wpArticles || []).find(wp => wp.slug === article.slug);
      const routing = routeArticleToReel({
        title: article.title || wpArticle?.title?.rendered || '',
        slug: article.slug,
        excerpt: wpArticle?.excerpt?.rendered?.replace(/<[^>]+>/g, '') || '',
      });

      return {
        day: Math.floor(i / 3) + 1,
        slot: (i % 3) + 1,
        articleSlug: article.slug,
        articleTitle: article.title,
        articleScore: article.totalScore,
        reelFormat: routing.primaryFormat,
        articleType: routing.articleType,
      };
    });
    logPhase(3, `Reel calendar: ${plans.reelCalendar.length} reels planned`);
  } catch (err) {
    logError(`Reel calendar: ${err.message}`);
    plans.reelCalendar = [];
  }

  // Content Calendar (next articles to write)
  plans.contentCalendar = (analysis.contentGaps || [])
    .slice(0, 10)
    .map((gap, i) => ({
      priority: i + 1,
      keyword: gap.keyword,
      suggestedTitle: gap.suggestedTitle,
      articleType: gap.articleType,
      estimatedTraffic: gap.estimatedMonthlyTraffic,
      priorityScore: gap.priorityScore,
      sources: gap.sources,
    }));
  logPhase(3, `Content calendar: ${plans.contentCalendar.length} articles to write`);

  // Revenue Optimization
  try {
    const { computeRevenueByWidgetType, analyzeWidgetPlacement } = await import('./revenue-tracker.js');
    const [widgets, placement] = await Promise.all([
      computeRevenueByWidgetType(30).catch(() => []),
      analyzeWidgetPlacement(30).catch(() => ({ placements: [] })),
    ]);
    plans.revenueOptimization = {
      topWidgets: widgets.slice(0, 5),
      placementAnalysis: placement,
      articlesNeedingWidgets: (plans.refreshQueue || [])
        .filter(r => r.types?.includes('missing_widgets'))
        .length,
    };
  } catch (err) {
    logError(`Revenue optimization: ${err.message}`);
    plans.revenueOptimization = {};
  }

  return plans;
}

// ── Phase 4: Output ─────────────────────────────────────────────────────────

function generateReport(data, analysis, plans) {
  logPhase(4, 'Generating intelligence report...');

  const report = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',

    // Executive Summary
    summary: {
      totalArticles: (data.wpArticles || []).length,
      totalPageviews30d: (data.ga4 || []).reduce((s, a) => s + a.pageviews, 0),
      totalImpressions28d: (data.gsc?.queries || []).reduce((s, q) => s + q.impressions, 0),
      avgPosition: (() => {
        const positions = (data.gsc?.pages || []).map(p => p.position).filter(p => p > 0);
        return positions.length > 0 ? Math.round((positions.reduce((s, p) => s + p, 0) / positions.length) * 10) / 10 : 0;
      })(),
      totalReelStats: (data.ig || []).length,
      totalRevenueSales: (data.revenue?.sales || []).length,
    },

    // SEO Intelligence
    seo: {
      lowHangingFruit: (data.gsc?.fruit || []).slice(0, 20),
      cannibalization: (data.gsc?.cannibal || []).slice(0, 10),
      decliningQueries: (data.gsc?.declining || []).slice(0, 15),
      topQueries: (data.gsc?.queries || []).slice(0, 20),
    },

    // Article Performance
    articles: {
      top10: (analysis.articleScores || []).slice(0, 10).map(a => ({
        slug: a.slug,
        score: a.totalScore,
        pageviews: a.raw.pageviews,
        impressions: a.raw.impressions,
        position: a.raw.position,
        reelCount: a.raw.reelCount,
      })),
      bottom10: (analysis.articleScores || []).slice(-10).map(a => ({
        slug: a.slug,
        score: a.totalScore,
        actions: a.actions,
      })),
      withActions: (analysis.articleScores || []).filter(a => a.actions.length > 0).length,
    },

    // Content Opportunities
    contentGaps: (analysis.contentGaps || []).slice(0, 15).map(g => ({
      keyword: g.keyword,
      suggestedTitle: g.suggestedTitle,
      estimatedTraffic: g.estimatedMonthlyTraffic,
      priorityScore: g.priorityScore,
      sources: g.sources,
    })),

    // Action Plans
    actionPlans: {
      refreshQueue: {
        total: (plans.refreshQueue || []).length,
        critical: (plans.refreshQueue || []).filter(r => r.severity === 'critical').length,
        top5: (plans.refreshQueue || []).slice(0, 5).map(r => ({
          slug: r.slug,
          severity: r.severity,
          types: r.types,
          signal: r.signal?.slice(0, 100),
        })),
      },
      reelCalendar: (plans.reelCalendar || []).slice(0, 7),
      contentCalendar: plans.contentCalendar || [],
      revenueOptimization: plans.revenueOptimization || {},
    },

    // Social Performance
    social: {
      reelAttribution: (analysis.reelAttribution || []).slice(0, 10),
      totalIGTraffic: (analysis.reelAttribution || []).reduce((s, r) => s + r.igSessions, 0),
    },

    // Metadata
    meta: {
      dataSources: {
        ga4: (data.ga4 || []).length > 0,
        gsc: (data.gsc?.queries || []).length > 0,
        ig: (data.ig || []).length > 0,
        trends: (data.trends?.trendingTopics || []).length > 0,
        revenue: (data.revenue?.sales || []).length > 0,
      },
    },
  };

  // Save report
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  logPhase(4, `Report saved to ${REPORT_PATH}`);

  return report;
}

// ── Run Modes ───────────────────────────────────────────────────────────────

/**
 * Full intelligence run: all data sources, all analysis, all action plans.
 * Takes 2-5 minutes depending on API response times.
 */
async function runFull() {
  log('=== FULL INTELLIGENCE RUN ===');
  const startTime = Date.now();

  const data = await collectData();
  const analysis = await runAnalysis(data);
  const plans = await generateActionPlans(data, analysis);
  const report = generateReport(data, analysis, plans);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`=== COMPLETE (${elapsed}s) ===`);

  printSummary(report);
  return report;
}

/**
 * Quick intelligence run: GA4 + GSC only (no IG, trends, revenue).
 * Takes ~30 seconds. Good for daily SEO monitoring.
 */
async function runQuick() {
  log('=== QUICK INTELLIGENCE RUN ===');
  const startTime = Date.now();

  const data = await collectData({
    skipIG: true,
    skipTrends: true,
    skipRevenue: true,
  });
  const analysis = await runAnalysis(data);
  const plans = await generateActionPlans(data, analysis);
  const report = generateReport(data, analysis, plans);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`=== COMPLETE (${elapsed}s) ===`);

  printSummary(report);
  return report;
}

/**
 * Daily run: same as full but with error tolerance.
 * Designed for unattended cron execution.
 */
async function runDaily() {
  log('=== DAILY INTELLIGENCE RUN ===');
  try {
    return await runFull();
  } catch (err) {
    logError(`Daily run failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

function printSummary(report) {
  console.log('\n' + '='.repeat(60));
  console.log('  FLASHVOYAGE CONTENT INTELLIGENCE REPORT');
  console.log('  ' + new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  console.log('='.repeat(60));

  const s = report.summary;
  console.log(`\n  Articles: ${s.totalArticles} | PV (30d): ${s.totalPageviews30d} | Impressions (28d): ${s.totalImpressions28d}`);
  console.log(`  Avg Position: ${s.avgPosition} | Reels tracked: ${s.totalReelStats} | Revenue records: ${s.totalRevenueSales}`);

  const seo = report.seo;
  console.log(`\n  SEO Quick Wins: ${seo.lowHangingFruit.length} low-hanging fruit keywords`);
  console.log(`  Cannibalization: ${seo.cannibalization.length} competing queries`);
  console.log(`  Declining: ${seo.decliningQueries.length} queries losing traffic`);

  const gaps = report.contentGaps;
  console.log(`\n  Content Opportunities: ${gaps.length} gaps identified`);
  if (gaps.length > 0) {
    console.log(`  Top opportunity: "${gaps[0].keyword}" (~${gaps[0].estimatedTraffic} traffic/mo)`);
  }

  const actions = report.actionPlans;
  console.log(`\n  Refresh Queue: ${actions.refreshQueue.total} articles (${actions.refreshQueue.critical} critical)`);
  console.log(`  Reel Calendar: ${report.actionPlans.reelCalendar.length} reels planned`);
  console.log(`  Content Calendar: ${actions.contentCalendar.length} articles to write`);

  console.log('\n' + '='.repeat(60));
  console.log(`  Report: ${REPORT_PATH}`);
  console.log('='.repeat(60) + '\n');
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

const command = process.argv[2] || 'help';

switch (command) {
  case 'full':
    runFull().catch(err => {
      logError(err.message);
      process.exit(1);
    });
    break;

  case 'quick':
    runQuick().catch(err => {
      logError(err.message);
      process.exit(1);
    });
    break;

  case 'daily':
    runDaily();
    break;

  case 'summary': {
    if (existsSync(REPORT_PATH)) {
      const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
      console.log(`Last report: ${report.generatedAt}`);
      printSummary(report);
    } else {
      console.log('No report found. Run: node content-intelligence-engine.js full');
    }
    break;
  }

  default:
    console.log(`
FlashVoyage Content Intelligence Engine

Usage:
  node content-intelligence-engine.js full      Full analysis (all sources, ~3-5 min)
  node content-intelligence-engine.js quick     SEO-only analysis (GA4 + GSC, ~30s)
  node content-intelligence-engine.js daily     Daily cron mode (full + error handling)
  node content-intelligence-engine.js summary   Display last report summary

Data sources:
  - GA4 (property 505793742) — pageviews, sessions, duration
  - Google Search Console — queries, impressions, position, CTR
  - Instagram Graph API — reel engagement metrics
  - Google Trends — rising queries for SE Asia travel
  - Travelpayouts Statistics — affiliate revenue data

Output: social-distributor/data/intelligence-report.json

Cron setup (daily at 06:00 Bangkok):
  0 23 * * * cd /Users/floriangouloubi/flashvoyage-content && node social-distributor/analytics/content-intelligence-engine.js daily >> /tmp/flashvoyage-intelligence.log 2>&1
`);
}
