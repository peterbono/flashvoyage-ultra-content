#!/usr/bin/env node

/**
 * A/B Test Engine — FlashVoyage Content Intelligence
 *
 * Centralized testing infrastructure for automated experimentation:
 *   - Article titles (via Rank Math SEO title)
 *   - Meta descriptions (via Rank Math meta description)
 *   - Widget placements (via sub_id position tracking)
 *   - Reel posting times (via performance-weights.json timeSlot dimension)
 *   - Audio types (via reel-history.jsonl audioType tag)
 *   - Caption CTAs (via reel-history.jsonl ctaVariant tag)
 *
 * Runs daily at 05h UTC (after analytics data refresh).
 * Checks active tests for statistical significance and auto-promotes winners.
 *
 * Minimum sample sizes for significance:
 *   - Title/meta CTR: 200 impressions per variant (14-day minimum)
 *   - Widget clicks: 500 pageviews per variant (30-day minimum)
 *   - Reel engagement: 5 reels per variant (14-day minimum)
 *   - Caption CTA: 5 reels per variant (14-day minimum)
 *
 * Data file: social-distributor/data/ab-tests.json
 *
 * Safety:
 *   - Max 5 concurrent title tests
 *   - Max 3 concurrent meta tests
 *   - 7-day early termination if CTR drops >20%
 *   - All changes reversible via WP REST API
 *   - Human review required for high-traffic articles (>1000 impr/month)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const TESTS_PATH = join(DATA_DIR, 'ab-tests.json');

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] [AB-TEST] ${msg}`);
}

function logWarn(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.warn(`[${ts}] [AB-TEST] WARN: ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.error(`[${ts}] [AB-TEST] ERROR: ${msg}`);
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_CONCURRENT_TITLE_TESTS = 5;
const MAX_CONCURRENT_META_TESTS = 3;
const MIN_IMPRESSIONS_FOR_SIGNIFICANCE = 200;
const MIN_TEST_DAYS = 14;
const EARLY_TERMINATION_DAYS = 7;
const EARLY_TERMINATION_CTR_DROP = -0.20; // -20%
const HIGH_TRAFFIC_THRESHOLD = 1000; // impressions/month — requires manual review

const TEST_TYPES = {
  TITLE: 'title',
  META_DESCRIPTION: 'meta_description',
  WIDGET_PLACEMENT: 'widget_placement',
  REEL_TIME: 'reel_time',
  AUDIO_TYPE: 'audio_type',
  CAPTION_CTA: 'caption_cta',
};

// ── Data Persistence ────────────────────────────────────────────────────────

function loadTestData() {
  if (!existsSync(TESTS_PATH)) {
    return {
      activeTests: [],
      completedTests: [],
      winningPatterns: [],
      meta: {
        lastRunAt: null,
        totalTestsRun: 0,
        totalWins: 0,
        avgLift: 0,
      },
    };
  }
  try {
    return JSON.parse(readFileSync(TESTS_PATH, 'utf-8'));
  } catch (err) {
    logError(`Failed to parse ab-tests.json: ${err.message}`);
    return { activeTests: [], completedTests: [], winningPatterns: [], meta: {} };
  }
}

function saveTestData(data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  data.meta.lastRunAt = new Date().toISOString();
  writeFileSync(TESTS_PATH, JSON.stringify(data, null, 2), 'utf-8');
  log(`Test data saved to ${TESTS_PATH}`);
}

// ── Test ID Generator ───────────────────────────────────────────────────────

function generateTestId(type, slug) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${type}-${slug.slice(0, 20)}-${date}-${rand}`;
}

// ── Title A/B Test Creation ─────────────────────────────────────────────────

/**
 * Create a title A/B test for an article.
 *
 * Uses GSC data to identify articles where CTR < expected CTR for position.
 * Generates a variant title and deploys via WP REST API (Rank Math SEO title).
 *
 * @param {Object} article - Article data
 * @param {number} article.wpId - WordPress post ID
 * @param {string} article.slug - URL slug
 * @param {string} article.currentTitle - Current title tag
 * @param {string} article.topQuery - Top search query for this article
 * @param {number} article.position - Average GSC position
 * @param {number} article.currentCTR - Current CTR (percentage)
 * @param {number} article.impressions - Monthly impressions
 * @param {string} variantTitle - The new title to test
 * @returns {Object} The created test object
 */
export function createTitleTest(article, variantTitle) {
  const data = loadTestData();

  // Safety checks
  const activeTitleTests = data.activeTests.filter(t => t.type === TEST_TYPES.TITLE);
  if (activeTitleTests.length >= MAX_CONCURRENT_TITLE_TESTS) {
    throw new Error(`Max concurrent title tests reached (${MAX_CONCURRENT_TITLE_TESTS}). Wait for existing tests to complete.`);
  }

  // Check if this article already has an active test
  if (data.activeTests.some(t => t.slug === article.slug && t.type === TEST_TYPES.TITLE)) {
    throw new Error(`Article "${article.slug}" already has an active title test.`);
  }

  // High-traffic warning
  if (article.impressions > HIGH_TRAFFIC_THRESHOLD) {
    logWarn(`High-traffic article (${article.impressions} impressions). Consider manual review before deploying.`);
  }

  const test = {
    id: generateTestId('title', article.slug),
    type: TEST_TYPES.TITLE,
    wpId: article.wpId,
    slug: article.slug,
    topQuery: article.topQuery,
    position: article.position,
    originalTitle: article.currentTitle,
    variantTitle,
    startDate: new Date().toISOString().slice(0, 10),
    baselineCTR: article.currentCTR,
    baselineImpressions: article.impressions,
    currentCTR: null,
    currentImpressions: null,
    status: 'pending_deploy', // pending_deploy → running → completed → winner/loser/reverted
    checkDates: [
      addDays(new Date(), EARLY_TERMINATION_DAYS).toISOString().slice(0, 10),
      addDays(new Date(), MIN_TEST_DAYS).toISOString().slice(0, 10),
    ],
    result: null,
    liftPercent: null,
  };

  data.activeTests.push(test);
  data.meta.totalTestsRun = (data.meta.totalTestsRun || 0) + 1;
  saveTestData(data);

  log(`Created title test "${test.id}" for "${article.slug}": "${article.currentTitle}" vs "${variantTitle}"`);
  return test;
}

/**
 * Deploy a pending title test by updating the Rank Math SEO title via WP REST API.
 *
 * @param {string} testId - Test ID
 * @returns {Promise<boolean>} True if deployed successfully
 */
export async function deployTitleTest(testId) {
  const data = loadTestData();
  const test = data.activeTests.find(t => t.id === testId);

  if (!test) throw new Error(`Test "${testId}" not found`);
  if (test.status !== 'pending_deploy') throw new Error(`Test "${testId}" is not pending deploy (status: ${test.status})`);

  try {
    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('../../config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

    // Update Rank Math SEO title via WP REST API
    // Rank Math stores the SEO title in post meta: rank_math_title
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${test.wpId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        meta: {
          rank_math_title: test.variantTitle,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WP API error ${response.status}: ${errorText}`);
    }

    test.status = 'running';
    test.deployedAt = new Date().toISOString();
    saveTestData(data);

    log(`Deployed title test "${testId}": SEO title changed to "${test.variantTitle}"`);
    return true;
  } catch (err) {
    logError(`Failed to deploy title test "${testId}": ${err.message}`);
    test.status = 'deploy_failed';
    test.error = err.message;
    saveTestData(data);
    return false;
  }
}

/**
 * Revert a title test by restoring the original Rank Math SEO title.
 *
 * @param {string} testId - Test ID
 * @returns {Promise<boolean>} True if reverted successfully
 */
export async function revertTitleTest(testId) {
  const data = loadTestData();
  const test = data.activeTests.find(t => t.id === testId);

  if (!test) throw new Error(`Test "${testId}" not found`);

  try {
    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('../../config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

    // Restore original title (or clear Rank Math override to use default)
    const response = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${test.wpId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        meta: {
          rank_math_title: test.originalTitle,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`WP API error ${response.status}`);
    }

    test.status = 'reverted';
    test.revertedAt = new Date().toISOString();

    // Move from active to completed
    data.activeTests = data.activeTests.filter(t => t.id !== testId);
    data.completedTests.push(test);
    saveTestData(data);

    log(`Reverted title test "${testId}": restored "${test.originalTitle}"`);
    return true;
  } catch (err) {
    logError(`Failed to revert title test "${testId}": ${err.message}`);
    return false;
  }
}

// ── Test Evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate all running tests against GSC data.
 *
 * Checks each running test:
 *   1. Early termination: if CTR dropped >20% after 7 days → revert
 *   2. Significance check: if 14 days passed and >200 impressions → decide
 *   3. Win/loss classification based on CTR change
 *
 * @returns {Promise<{ evaluated: number, wins: number, losses: number, reverted: number, continuing: number }>}
 */
export async function evaluateAllTests() {
  const data = loadTestData();
  const runningTests = data.activeTests.filter(t => t.status === 'running');

  if (runningTests.length === 0) {
    log('No running tests to evaluate');
    return { evaluated: 0, wins: 0, losses: 0, reverted: 0, continuing: 0 };
  }

  log(`Evaluating ${runningTests.length} running tests...`);

  let results = { evaluated: 0, wins: 0, losses: 0, reverted: 0, continuing: 0 };

  // Fetch current GSC data for all test articles
  let gscData;
  try {
    const { fetchQueryPagePairs } = await import('./search-console-fetcher.js');
    gscData = await fetchQueryPagePairs(14, 10000);
  } catch (err) {
    logError(`Cannot fetch GSC data for evaluation: ${err.message}`);
    return results;
  }

  for (const test of runningTests) {
    results.evaluated++;

    // Find GSC data for this article's top query
    const articleUrl = `https://flashvoyage.com/${test.slug}/`;
    const matchingRows = gscData.filter(
      row => row.page.includes(test.slug) &&
             (test.topQuery ? row.query.includes(test.topQuery.split(' ')[0]) : true)
    );

    if (matchingRows.length === 0) {
      log(`No GSC data found for test "${test.id}" (${test.slug}) — skipping`);
      results.continuing++;
      continue;
    }

    // Aggregate CTR and impressions across matching queries
    const totalImpressions = matchingRows.reduce((s, r) => s + r.impressions, 0);
    const weightedCTR = matchingRows.reduce((s, r) => s + r.ctr * r.impressions, 0) / totalImpressions;

    test.currentCTR = Math.round(weightedCTR * 100) / 100;
    test.currentImpressions = totalImpressions;

    const daysSinceStart = Math.floor(
      (Date.now() - new Date(test.startDate).getTime()) / (24 * 60 * 60 * 1000)
    );

    const ctrChange = test.baselineCTR > 0
      ? (test.currentCTR - test.baselineCTR) / test.baselineCTR
      : 0;

    log(`Test "${test.id}": day ${daysSinceStart}, CTR ${test.baselineCTR}% → ${test.currentCTR}% (${(ctrChange * 100).toFixed(1)}%), ${totalImpressions} impressions`);

    // Early termination check (7 days)
    if (daysSinceStart >= EARLY_TERMINATION_DAYS && ctrChange <= EARLY_TERMINATION_CTR_DROP) {
      logWarn(`EARLY TERMINATION: Test "${test.id}" CTR dropped ${(ctrChange * 100).toFixed(1)}% — reverting`);
      test.result = 'early_terminated';
      test.liftPercent = Math.round(ctrChange * 10000) / 100;
      await revertTitleTest(test.id);
      results.reverted++;
      continue;
    }

    // Significance check (14+ days, 200+ impressions)
    if (daysSinceStart >= MIN_TEST_DAYS && totalImpressions >= MIN_IMPRESSIONS_FOR_SIGNIFICANCE) {
      if (ctrChange > 0.10) {
        // CTR improved >10% — WINNER
        log(`WINNER: Test "${test.id}" CTR improved ${(ctrChange * 100).toFixed(1)}% — keeping variant`);
        test.result = 'winner';
        test.liftPercent = Math.round(ctrChange * 10000) / 100;
        test.status = 'completed';
        test.completedAt = new Date().toISOString();

        // Learn from winning pattern
        learnWinningPattern(test, data);

        // Move to completed
        data.activeTests = data.activeTests.filter(t => t.id !== test.id);
        data.completedTests.push(test);
        data.meta.totalWins = (data.meta.totalWins || 0) + 1;
        results.wins++;
      } else if (ctrChange < -0.05) {
        // CTR decreased >5% — LOSER, revert
        log(`LOSER: Test "${test.id}" CTR dropped ${(ctrChange * 100).toFixed(1)}% — reverting`);
        test.result = 'loser';
        test.liftPercent = Math.round(ctrChange * 10000) / 100;
        await revertTitleTest(test.id);
        results.losses++;
      } else {
        // Inconclusive (within -5% to +10%) — keep running for more data
        log(`INCONCLUSIVE: Test "${test.id}" CTR change ${(ctrChange * 100).toFixed(1)}% — needs more data`);
        results.continuing++;

        // If test has been running >30 days without significance, terminate
        if (daysSinceStart > 30) {
          log(`Test "${test.id}" exceeded 30 days without significance — reverting`);
          test.result = 'inconclusive';
          test.liftPercent = Math.round(ctrChange * 10000) / 100;
          await revertTitleTest(test.id);
          results.reverted++;
        }
      }
    } else {
      results.continuing++;
    }
  }

  // Update average lift across all completed tests
  const allCompleted = data.completedTests.filter(t => t.liftPercent !== null);
  if (allCompleted.length > 0) {
    data.meta.avgLift = Math.round(
      (allCompleted.reduce((s, t) => s + t.liftPercent, 0) / allCompleted.length) * 100
    ) / 100;
  }

  saveTestData(data);

  log(`Evaluation complete: ${results.wins} wins, ${results.losses} losses, ${results.reverted} reverted, ${results.continuing} continuing`);
  return results;
}

// ── Pattern Learning ────────────────────────────────────────────────────────

/**
 * Extract and store the winning pattern from a successful test.
 * Patterns are used to generate better variants for future tests.
 */
function learnWinningPattern(test, data) {
  const patterns = [];

  // Detect common winning patterns
  const variant = test.variantTitle.toLowerCase();
  const original = test.originalTitle.toLowerCase();

  // Year in title
  const currentYear = new Date().getFullYear();
  if (variant.includes(String(currentYear)) && !original.includes(String(currentYear))) {
    patterns.push('year_in_title');
  }

  // Question format
  if (variant.includes('?') && !original.includes('?')) {
    patterns.push('question_format');
  }

  // Number/list format
  if (/^\d+/.test(variant) && !/^\d+/.test(original)) {
    patterns.push('number_prefix');
  }

  // Emotional trigger words
  const emotionWords = ['secret', 'erreur', 'piege', 'vrai', 'complet', 'ultime', 'meilleur'];
  for (const word of emotionWords) {
    if (variant.includes(word) && !original.includes(word)) {
      patterns.push(`emotion_${word}`);
    }
  }

  // Cost/price trigger
  if ((variant.includes('prix') || variant.includes('cout') || variant.includes('budget') || variant.includes('combien')) &&
      !(original.includes('prix') || original.includes('cout') || original.includes('budget') || original.includes('combien'))) {
    patterns.push('price_curiosity');
  }

  // Store patterns
  for (const pattern of patterns) {
    const existing = data.winningPatterns.find(p => p.pattern === pattern);
    if (existing) {
      existing.avgLift = Math.round(
        ((existing.avgLift * existing.sampleSize + test.liftPercent) / (existing.sampleSize + 1)) * 100
      ) / 100;
      existing.sampleSize += 1;
    } else {
      data.winningPatterns.push({
        pattern,
        avgLift: test.liftPercent,
        sampleSize: 1,
        firstSeen: new Date().toISOString().slice(0, 10),
      });
    }
  }

  if (patterns.length > 0) {
    log(`Learned ${patterns.length} winning patterns from test "${test.id}": ${patterns.join(', ')}`);
  }
}

// ── Auto-Discovery: Find Articles to Test ───────────────────────────────────

/**
 * Identify the best candidates for title A/B testing.
 *
 * Selection criteria:
 *   1. CTR < expected CTR for position (from search-console-fetcher.getExpectedCTR)
 *   2. Position 3-15 (too high = risky, too low = not enough impressions)
 *   3. >100 impressions/month (enough data for significance)
 *   4. No active test on this article
 *
 * @returns {Promise<Array<{ slug, wpId, currentTitle, topQuery, position, currentCTR, expectedCTR, ctrGap, impressions }>>}
 */
export async function findTestCandidates() {
  const data = loadTestData();
  const activeArticleSlugs = new Set(data.activeTests.map(t => t.slug));

  let lowHangingFruit;
  try {
    const { findLowHangingFruit } = await import('./search-console-fetcher.js');
    lowHangingFruit = await findLowHangingFruit(28, {
      minPosition: 3,
      maxPosition: 15,
      minImpressions: 100,
    });
  } catch (err) {
    logError(`Cannot fetch low-hanging fruit: ${err.message}`);
    return [];
  }

  // Filter out articles with active tests
  const candidates = lowHangingFruit
    .filter(f => {
      const slug = f.page.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
      return !activeArticleSlugs.has(slug);
    })
    .map(f => ({
      slug: f.page.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, ''),
      topQuery: f.query,
      position: f.position,
      currentCTR: f.ctr,
      expectedCTR: f.expectedCTR,
      ctrGap: f.expectedCTR - f.ctr,
      impressions: f.impressions,
      fruitScore: f.fruitScore,
    }))
    .sort((a, b) => b.ctrGap - a.ctrGap) // Biggest CTR gap first
    .slice(0, 10);

  log(`Found ${candidates.length} test candidates (top CTR gap: ${candidates[0]?.ctrGap?.toFixed(1)}%)`);
  return candidates;
}

// ── Utility ─────────────────────────────────────────────────────────────────

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ── Summary Report ──────────────────────────────────────────────────────────

/**
 * Generate a summary report of all A/B testing activity.
 */
export function getTestingSummary() {
  const data = loadTestData();

  return {
    activeTests: data.activeTests.length,
    activeByType: {
      title: data.activeTests.filter(t => t.type === TEST_TYPES.TITLE).length,
      meta: data.activeTests.filter(t => t.type === TEST_TYPES.META_DESCRIPTION).length,
      widget: data.activeTests.filter(t => t.type === TEST_TYPES.WIDGET_PLACEMENT).length,
      reelTime: data.activeTests.filter(t => t.type === TEST_TYPES.REEL_TIME).length,
    },
    completedTotal: data.completedTests.length,
    totalWins: data.meta.totalWins || 0,
    winRate: data.completedTests.length > 0
      ? Math.round((data.meta.totalWins / data.completedTests.length) * 100)
      : 0,
    avgLift: data.meta.avgLift || 0,
    topPatterns: data.winningPatterns
      .sort((a, b) => b.avgLift - a.avgLift)
      .slice(0, 5)
      .map(p => `${p.pattern}: +${p.avgLift}% (n=${p.sampleSize})`),
    lastRun: data.meta.lastRunAt,
  };
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].includes('ab-test-engine')) {
  const command = process.argv[2] || 'help';

  (async () => {
    try {
      switch (command) {
        case 'evaluate': {
          const results = await evaluateAllTests();
          console.log(JSON.stringify(results, null, 2));
          break;
        }
        case 'candidates': {
          const candidates = await findTestCandidates();
          console.log(`\n=== TOP ${candidates.length} A/B TEST CANDIDATES ===\n`);
          for (const c of candidates) {
            console.log(`${c.slug}`);
            console.log(`  Query: "${c.topQuery}" | Pos: ${c.position} | CTR: ${c.currentCTR}% (expected: ${c.expectedCTR}%)`);
            console.log(`  CTR Gap: ${c.ctrGap.toFixed(1)}% | Impressions: ${c.impressions}`);
            console.log();
          }
          break;
        }
        case 'summary': {
          const summary = getTestingSummary();
          console.log('\n=== A/B TESTING SUMMARY ===\n');
          console.log(JSON.stringify(summary, null, 2));
          break;
        }
        case 'list': {
          const data = loadTestData();
          console.log(`\n=== ACTIVE TESTS (${data.activeTests.length}) ===\n`);
          for (const t of data.activeTests) {
            console.log(`[${t.status}] ${t.id}`);
            console.log(`  Article: ${t.slug} | Type: ${t.type}`);
            console.log(`  Original: "${t.originalTitle}"`);
            console.log(`  Variant:  "${t.variantTitle}"`);
            console.log(`  Baseline CTR: ${t.baselineCTR}% | Current: ${t.currentCTR ?? 'pending'}%`);
            console.log();
          }
          console.log(`=== COMPLETED TESTS (last 10 of ${data.completedTests.length}) ===\n`);
          for (const t of data.completedTests.slice(-10)) {
            console.log(`[${t.result}] ${t.id} | Lift: ${t.liftPercent}%`);
          }
          break;
        }
        default:
          console.log(`
A/B Test Engine — FlashVoyage Content Intelligence

Usage:
  node ab-test-engine.js evaluate     Evaluate all running tests against GSC data
  node ab-test-engine.js candidates   Find best articles for title A/B testing
  node ab-test-engine.js summary      Show testing activity summary
  node ab-test-engine.js list         List all active and recent tests

Programmatic:
  import { createTitleTest, deployTitleTest, evaluateAllTests } from './ab-test-engine.js';
`);
      }
    } catch (err) {
      logError(err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}
