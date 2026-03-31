/**
 * budget-allocator.js — Content Intelligence Engine
 *
 * Computes expected ROI for each content action in the priority queue
 * and re-sorts by ROI descending, applying a daily budget cap.
 *
 * ROI formula:
 *   Expected ROI = (projected_monthly_traffic × avg_RPM) / production_cost
 *
 * Production costs:
 *   - New article: $0.075 (Haiku 92% + GPT-4o-mini 8%)
 *   - Update: $0.02 (partial regeneration)
 *   - Reel: $0.005 (social content)
 *   - Enrich: $0.015 (widget insertion, no content generation)
 *   - Standard: $0.075 (same as new)
 *   - Review: $0.00 (analysis only, no production)
 *
 * Traffic projections:
 *   - NEW: median monthly traffic of similar articles at 90 days
 *   - UPDATE: current traffic × 1.3 (30% uplift from freshness)
 *   - ENRICH: current traffic × 1.1 (10% uplift from better monetization)
 *   - STANDARD: same as NEW
 *   - REVIEW: 0 (no direct traffic impact)
 *
 * Data consumed:
 *   - data/next-articles-queue.json (from article-prioritizer.js)
 *   - data/article-scores.json (traffic data)
 *   - data/revenue-report.json (Travelpayouts data, optional)
 *
 * Writes: data/roi-optimized-queue.json
 *
 * CLI: node intelligence/budget-allocator.js
 * Cron: daily at 3h15 UTC (after article-prioritizer)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const QUEUE_PATH = join(DATA_DIR, 'next-articles-queue.json');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');
const REVENUE_PATH = join(DATA_DIR, 'revenue-report.json');
const OUTPUT_PATH = join(DATA_DIR, 'roi-optimized-queue.json');

// ── Cost Model ────────────────────────────────────────────────────────────

const PRODUCTION_COSTS = {
  write_new: 0.075,   // Full article generation
  update: 0.02,       // Partial regeneration
  enrich: 0.015,      // Widget insertion
  standard: 0.075,    // Same as write_new
  review: 0.0,        // No production cost (analysis only)
};

// Traffic uplift multipliers for existing articles
const TRAFFIC_UPLIFT = {
  update: 1.3,    // 30% uplift from content refresh
  enrich: 1.1,    // 10% uplift from better monetization UX
};

// Default RPM if no revenue data available ($2 per 1000 pageviews)
const DEFAULT_RPM = 2.0;

// Default daily budget cap
const DEFAULT_DAILY_BUDGET = 2.0;

// ── Helpers ───────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[BUDGET] ${msg}`);
}

function logError(msg) {
  console.error(`[BUDGET] ERROR: ${msg}`);
}

/**
 * Load a JSON data file. Returns null if not found.
 */
async function loadJsonSafe(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    logError(`Failed to load ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Compute the median of a numeric array.
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Core Logic ────────────────────────────────────────────────────────────

/**
 * Compute ROI for each queue item and re-sort by expected ROI.
 *
 * @param {Object} options
 * @param {number} options.dailyBudget - Daily budget cap in USD (default $2)
 * @returns {Promise<{
 *   timestamp: string,
 *   config: { dailyBudget: number, defaultRpm: number, productionCosts: Object },
 *   trafficBaseline: { medianMonthlyPV: number, avgRpm: number, articlesAnalyzed: number },
 *   queue: Array<{
 *     rank: number,
 *     action: string,
 *     priority: string,
 *     topic: string,
 *     articleType: string,
 *     roi: {
 *       expectedRoi: number,
 *       projectedMonthlyTraffic: number,
 *       projectedMonthlyRevenue: number,
 *       productionCost: number,
 *       trafficSource: string,
 *     },
 *     context: Object,
 *     withinBudget: boolean,
 *     cumulativeCost: number,
 *   }>,
 *   budgetAllocation: {
 *     totalCost: number,
 *     itemsWithinBudget: number,
 *     itemsOverBudget: number,
 *     expectedDailyRevenue: number,
 *     expectedDailyRoi: number,
 *   },
 *   summary: Object,
 * }>}
 */
export async function allocateBudget({ dailyBudget = DEFAULT_DAILY_BUDGET } = {}) {
  log('Starting ROI-based budget allocation...');
  const startTime = Date.now();

  await mkdir(DATA_DIR, { recursive: true });

  // ── Load data ──
  const queueData = await loadJsonSafe(QUEUE_PATH);
  const scoresData = await loadJsonSafe(SCORES_PATH);
  const revenueData = await loadJsonSafe(REVENUE_PATH);

  if (!queueData?.queue || queueData.queue.length === 0) {
    log('No items in priority queue. Nothing to allocate.');
    const emptyResult = {
      timestamp: new Date().toISOString(),
      config: { dailyBudget, defaultRpm: DEFAULT_RPM, productionCosts: PRODUCTION_COSTS },
      trafficBaseline: { medianMonthlyPV: 0, avgRpm: DEFAULT_RPM, articlesAnalyzed: 0 },
      queue: [],
      budgetAllocation: {
        totalCost: 0, dailyBudget, itemsWithinBudget: 0, itemsOverBudget: 0,
        expectedDailyRevenue: 0, expectedDailyRoi: 0,
      },
      summary: {},
    };
    await writeFile(OUTPUT_PATH, JSON.stringify(emptyResult, null, 2));
    return emptyResult;
  }

  const articleScores = scoresData?.scores || [];
  const queue = queueData.queue;

  // ── Compute traffic baseline ──
  // Median monthly pageviews across all scored articles (used for NEW article projections)
  const trafficValues = articleScores
    .map(a => a.signals?.traffic ?? 0)
    .filter(t => t > 0);

  // Traffic signal is normalized 0-1 in article-scorer; we need to de-normalize
  // to estimate actual monthly pageviews. Use the site summary if available,
  // otherwise assume 100 PV/month per 0.1 traffic signal.
  const PV_PER_SIGNAL_UNIT = 1000; // 1.0 traffic signal ≈ 1000 PV/month (top article)
  const medianTrafficSignal = median(trafficValues);
  const medianMonthlyPV = Math.round(medianTrafficSignal * PV_PER_SIGNAL_UNIT);

  // ── Compute avg RPM ──
  // If we have revenue data, compute real RPM; otherwise use default
  let avgRpm = DEFAULT_RPM;
  if (revenueData?.totalRevenue && revenueData?.totalPageviews) {
    avgRpm = (revenueData.totalRevenue / revenueData.totalPageviews) * 1000;
    log(`Real RPM from revenue data: $${avgRpm.toFixed(2)}/1000 PV`);
  } else {
    log(`Using default RPM: $${DEFAULT_RPM}/1000 PV (no revenue data found)`);
  }

  const trafficBaseline = {
    medianMonthlyPV,
    medianTrafficSignal: medianTrafficSignal.toFixed(3),
    avgRpm: Math.round(avgRpm * 100) / 100,
    articlesAnalyzed: trafficValues.length,
  };

  log(`Traffic baseline: median ${medianMonthlyPV} PV/month (${trafficValues.length} articles), RPM $${avgRpm.toFixed(2)}`);

  // ── Compute ROI for each queue item ──
  const roiQueue = queue.map(item => {
    const cost = PRODUCTION_COSTS[item.action] ?? 0.075;
    let projectedMonthlyTraffic = 0;
    let trafficSource = '';

    switch (item.action) {
      case 'write_new':
      case 'standard': {
        // New articles: use median traffic at 90 days as projection
        // Adjust by gap score if available (higher gap score → more demand)
        const gapBoost = item.context?.gapScore ? Math.min(item.context.gapScore / 60, 2.0) : 1.0;
        projectedMonthlyTraffic = Math.round(medianMonthlyPV * gapBoost);
        trafficSource = `median baseline (${medianMonthlyPV} PV) × gap boost (${gapBoost.toFixed(2)})`;
        break;
      }

      case 'update': {
        // Updated articles: current traffic × 1.3 uplift
        const currentTraffic = (item.context?.traffic ?? 0) * PV_PER_SIGNAL_UNIT;
        projectedMonthlyTraffic = Math.round(currentTraffic * TRAFFIC_UPLIFT.update);
        trafficSource = `current (${Math.round(currentTraffic)} PV) × ${TRAFFIC_UPLIFT.update} uplift`;
        break;
      }

      case 'enrich': {
        // Enriched articles: current traffic × 1.1 (better monetization, not more traffic per se)
        const currentTraffic = (item.context?.traffic ?? 0) * PV_PER_SIGNAL_UNIT;
        projectedMonthlyTraffic = Math.round(currentTraffic * TRAFFIC_UPLIFT.enrich);
        trafficSource = `current (${Math.round(currentTraffic)} PV) × ${TRAFFIC_UPLIFT.enrich} uplift`;
        break;
      }

      case 'review': {
        // Review items don't generate direct traffic
        projectedMonthlyTraffic = 0;
        trafficSource = 'no direct traffic (review only)';
        break;
      }

      default: {
        projectedMonthlyTraffic = medianMonthlyPV;
        trafficSource = `default median baseline (${medianMonthlyPV} PV)`;
      }
    }

    const projectedMonthlyRevenue = (projectedMonthlyTraffic / 1000) * avgRpm;
    const expectedRoi = cost > 0
      ? Math.round((projectedMonthlyRevenue / cost) * 100) / 100
      : projectedMonthlyTraffic > 0 ? Infinity : 0;

    return {
      ...item,
      roi: {
        expectedRoi,
        projectedMonthlyTraffic,
        projectedMonthlyRevenue: Math.round(projectedMonthlyRevenue * 1000) / 1000,
        productionCost: cost,
        trafficSource,
      },
    };
  });

  // ── Sort by ROI descending ──
  // Infinity ROI (review with traffic) goes last; real ROI sorted descending
  roiQueue.sort((a, b) => {
    const aRoi = a.roi.expectedRoi === Infinity ? -1 : a.roi.expectedRoi;
    const bRoi = b.roi.expectedRoi === Infinity ? -1 : b.roi.expectedRoi;
    return bRoi - aRoi;
  });

  // ── Apply daily budget cap ──
  let cumulativeCost = 0;
  let itemsWithinBudget = 0;
  let expectedDailyRevenue = 0;

  for (const item of roiQueue) {
    cumulativeCost += item.roi.productionCost;
    item.cumulativeCost = Math.round(cumulativeCost * 1000) / 1000;
    item.withinBudget = cumulativeCost <= dailyBudget;

    if (item.withinBudget) {
      itemsWithinBudget++;
      expectedDailyRevenue += item.roi.projectedMonthlyRevenue / 30; // Daily fraction
    }
  }

  // Re-assign ranks after ROI sort
  roiQueue.forEach((item, i) => { item.rank = i + 1; });

  // ── Budget allocation summary ──
  const totalCost = roiQueue
    .filter(i => i.withinBudget)
    .reduce((sum, i) => sum + i.roi.productionCost, 0);

  const budgetAllocation = {
    totalCost: Math.round(totalCost * 1000) / 1000,
    dailyBudget,
    itemsWithinBudget,
    itemsOverBudget: roiQueue.length - itemsWithinBudget,
    expectedDailyRevenue: Math.round(expectedDailyRevenue * 1000) / 1000,
    expectedDailyRoi: totalCost > 0
      ? Math.round((expectedDailyRevenue / totalCost) * 100) / 100
      : 0,
  };

  // ── Build action summary ──
  const withinBudgetItems = roiQueue.filter(i => i.withinBudget);
  const summary = {
    write_new: withinBudgetItems.filter(q => q.action === 'write_new').length,
    update: withinBudgetItems.filter(q => q.action === 'update').length,
    enrich: withinBudgetItems.filter(q => q.action === 'enrich').length,
    standard: withinBudgetItems.filter(q => q.action === 'standard').length,
    review: withinBudgetItems.filter(q => q.action === 'review').length,
  };

  const result = {
    timestamp: new Date().toISOString(),
    config: {
      dailyBudget,
      defaultRpm: DEFAULT_RPM,
      productionCosts: PRODUCTION_COSTS,
      trafficUplift: TRAFFIC_UPLIFT,
      pvPerSignalUnit: PV_PER_SIGNAL_UNIT,
    },
    trafficBaseline,
    queue: roiQueue,
    budgetAllocation,
    summary,
  };

  // ── Write output ──
  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2));

  log(`ROI-optimized queue written to ${OUTPUT_PATH}`);
  log(`Queue: ${roiQueue.length} items, ${itemsWithinBudget} within budget ($${totalCost.toFixed(3)}/$${dailyBudget})`);
  log(`Expected daily revenue: $${expectedDailyRevenue.toFixed(4)} (ROI: ${budgetAllocation.expectedDailyRoi}x)`);

  if (roiQueue.length > 0) {
    log(`Top ROI item: #${roiQueue[0].rank} ${roiQueue[0].action} "${roiQueue[0].topic?.slice(0, 50)}" — ROI ${roiQueue[0].roi.expectedRoi}x`);
  }

  log(`Elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return result;
}

// ── CLI entry point ───────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  const dailyBudget = parseFloat(process.argv[2] || DEFAULT_DAILY_BUDGET);

  allocateBudget({ dailyBudget })
    .then(result => {
      console.log(`\nROI-Optimized Budget Allocation:`);
      console.log(`  Daily budget: $${result.budgetAllocation.dailyBudget}`);
      console.log(`  Items within budget: ${result.budgetAllocation.itemsWithinBudget}/${result.queue.length}`);
      console.log(`  Total cost: $${result.budgetAllocation.totalCost}`);
      console.log(`  Expected daily revenue: $${result.budgetAllocation.expectedDailyRevenue}`);
      console.log(`  Expected ROI: ${result.budgetAllocation.expectedDailyRoi}x`);

      console.log(`\n  Within-budget actions:`, result.summary);

      if (result.queue.length > 0) {
        console.log(`\n  Queue (by ROI):`);
        for (const item of result.queue.slice(0, 10)) {
          const budget = item.withinBudget ? '✓' : '✗';
          const roi = item.roi.expectedRoi === Infinity ? '∞' : `${item.roi.expectedRoi}x`;
          console.log(`    ${budget} #${item.rank} [${item.priority}] ${item.action}: ${item.topic?.slice(0, 45)} — ROI ${roi} ($${item.roi.productionCost})`);
        }
      }
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
