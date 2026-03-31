#!/usr/bin/env node

/**
 * lifecycle-manager.js — Content Lifecycle State Machine
 *
 * Tracks article lifecycle states based on score trajectory over time.
 *
 * States:
 *   NEW       → Published 0-14 days ago
 *   GROWING   → Score rising 3+ consecutive days
 *   PEAK      → Score >70, stable (not declining >5% over 7d)
 *   DECLINING → Score dropped -15% over 14 days
 *   EVERGREEN → Age >6 months, stable score 30-60
 *   DEAD      → Age >6 months, score <10
 *
 * Auto-actions per state:
 *   NEW       → flag for reel creation + social sharing
 *   GROWING   → flag for monetization (add widgets)
 *   PEAK      → ensure max widgets, add email CTA
 *   DECLINING → flag for content refresh (P0 urgency)
 *   EVERGREEN → light annual maintenance only
 *   DEAD      → candidate for merge/301 redirect
 *
 * Reads:
 *   - data/article-scores.json (from article-scorer.js)
 *   - data/score-history/YYYY-MM-DD.json (daily snapshots)
 *
 * Writes:
 *   - data/lifecycle-states.json
 *   - data/score-history/YYYY-MM-DD.json (today's snapshot)
 *
 * CLI: node intelligence/lifecycle-manager.js
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const SCORES_PATH = join(DATA_DIR, 'article-scores.json');
const LIFECYCLE_PATH = join(DATA_DIR, 'lifecycle-states.json');
const HISTORY_DIR = join(DATA_DIR, 'score-history');

// ── Constants ──────────────────────────────────────────────────────────────

const STATES = {
  NEW: 'NEW',
  GROWING: 'GROWING',
  PEAK: 'PEAK',
  DECLINING: 'DECLINING',
  EVERGREEN: 'EVERGREEN',
  DEAD: 'DEAD',
};

const THRESHOLDS = {
  newMaxAgeDays: 14,
  growingConsecutiveDays: 3,
  peakMinScore: 70,
  peakMaxDecline7d: 0.05,         // max 5% decline over 7d to remain "stable"
  decliningThreshold14d: -0.15,   // -15% over 14d
  evergreenMinAgeDays: 180,       // 6 months
  evergreenScoreMin: 30,
  evergreenScoreMax: 60,
  evergreenMaxVariance7d: 0.10,   // max 10% variance to count as "stable"
  deadMinAgeDays: 180,
  deadMaxScore: 10,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[LIFECYCLE] ${msg}`);
}

function logError(msg) {
  console.error(`[LIFECYCLE] ERROR: ${msg}`);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(dateStr1, dateStr2) {
  const ms = new Date(dateStr2).getTime() - new Date(dateStr1).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function ageDays(dateStr) {
  return daysBetween(dateStr, new Date().toISOString());
}

/**
 * Load a JSON file, return null if missing or malformed.
 */
async function loadJSON(path) {
  try {
    if (!existsSync(path)) return null;
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logError(`Failed to load ${path}: ${err.message}`);
    return null;
  }
}

// ── Score History ──────────────────────────────────────────────────────────

/**
 * Load score history files from data/score-history/.
 * Returns a Map<slug, Array<{ date: string, score: number }>> sorted by date ascending.
 */
async function loadScoreHistory() {
  const history = new Map();

  await mkdir(HISTORY_DIR, { recursive: true });

  let files;
  try {
    files = await readdir(HISTORY_DIR);
  } catch {
    return history;
  }

  // Filter to valid YYYY-MM-DD.json files, sort chronologically
  const jsonFiles = files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  // Only load last 30 days of history to keep memory reasonable
  const recentFiles = jsonFiles.slice(-30);
  log(`Loading ${recentFiles.length} days of score history (of ${jsonFiles.length} total)`);

  for (const file of recentFiles) {
    const date = file.replace('.json', '');
    try {
      const data = JSON.parse(await readFile(join(HISTORY_DIR, file), 'utf-8'));
      const scores = data.scores || data;

      // data can be either: { scores: [{slug, compositeScore}] } or [{slug, compositeScore}]
      const scoreArray = Array.isArray(scores) ? scores : [];

      for (const entry of scoreArray) {
        const slug = entry.slug;
        if (!slug) continue;

        if (!history.has(slug)) {
          history.set(slug, []);
        }
        history.get(slug).push({
          date,
          score: entry.compositeScore ?? entry.score ?? 0,
        });
      }
    } catch (err) {
      logError(`Failed to parse history file ${file}: ${err.message}`);
    }
  }

  // Sort each slug's history by date
  for (const [, entries] of history) {
    entries.sort((a, b) => a.date.localeCompare(b.date));
  }

  return history;
}

/**
 * Save today's scores to data/score-history/YYYY-MM-DD.json.
 */
async function saveScoreSnapshot(scores) {
  await mkdir(HISTORY_DIR, { recursive: true });
  const filename = `${today()}.json`;
  const path = join(HISTORY_DIR, filename);

  // Compact format: only slug + compositeScore to keep files small
  const snapshot = {
    date: today(),
    timestamp: new Date().toISOString(),
    scores: scores.map(s => ({
      slug: s.slug,
      compositeScore: s.compositeScore,
    })),
  };

  await writeFile(path, JSON.stringify(snapshot, null, 2));
  log(`Saved score snapshot to ${filename} (${snapshot.scores.length} articles)`);
}

// ── Trajectory Analysis ───────────────────────────────────────────────────

/**
 * Compute score trajectory metrics for an article.
 *
 * @param {Array<{date: string, score: number}>} entries - Chronological score entries
 * @param {number} currentScore - Today's score
 * @returns {{
 *   trend7d: number,           // % change over 7 days (-1 to +inf)
 *   trend14d: number,          // % change over 14 days
 *   consecutiveRising: number, // consecutive days of score increase
 *   variance7d: number,        // coefficient of variation over 7 days (0-1)
 *   dataPoints: number         // how many days of history we have
 * }}
 */
function computeTrajectory(entries, currentScore) {
  // Add today's score to the history for analysis
  const all = [...entries, { date: today(), score: currentScore }];
  const n = all.length;

  if (n < 2) {
    return { trend7d: 0, trend14d: 0, consecutiveRising: 0, variance7d: 0, dataPoints: n };
  }

  // Find scores at approximately 7 and 14 days ago
  const todayDate = today();
  const score7dAgo = findScoreNDaysAgo(all, todayDate, 7);
  const score14dAgo = findScoreNDaysAgo(all, todayDate, 14);

  // % change (relative to baseline, avoid /0)
  const trend7d = score7dAgo > 0 ? (currentScore - score7dAgo) / score7dAgo : 0;
  const trend14d = score14dAgo > 0 ? (currentScore - score14dAgo) / score14dAgo : 0;

  // Consecutive rising days (looking backwards from today)
  let consecutiveRising = 0;
  for (let i = all.length - 1; i > 0; i--) {
    if (all[i].score > all[i - 1].score) {
      consecutiveRising++;
    } else {
      break;
    }
  }

  // Variance over last 7 entries
  const last7 = all.slice(-7);
  const mean = last7.reduce((sum, e) => sum + e.score, 0) / last7.length;
  const variance = mean > 0
    ? Math.sqrt(last7.reduce((sum, e) => sum + (e.score - mean) ** 2, 0) / last7.length) / mean
    : 0;

  return {
    trend7d: Math.round(trend7d * 1000) / 1000,
    trend14d: Math.round(trend14d * 1000) / 1000,
    consecutiveRising,
    variance7d: Math.round(variance * 1000) / 1000,
    dataPoints: n,
  };
}

/**
 * Find the score closest to N days ago.
 */
function findScoreNDaysAgo(entries, todayStr, nDays) {
  const targetDate = new Date(todayStr);
  targetDate.setDate(targetDate.getDate() - nDays);
  const targetStr = targetDate.toISOString().split('T')[0];

  // Find closest entry to target date
  let closest = null;
  let closestDist = Infinity;

  for (const entry of entries) {
    const dist = Math.abs(daysBetween(entry.date, targetStr));
    if (dist < closestDist) {
      closestDist = dist;
      closest = entry;
    }
  }

  // Only use if within 3 days of target
  if (closest && closestDist <= 3) {
    return closest.score;
  }

  return 0;
}

// ── State Machine ─────────────────────────────────────────────────────────

/**
 * Determine lifecycle state for a single article.
 *
 * @param {{compositeScore: number, date: string, slug: string}} article
 * @param {Object} trajectory - From computeTrajectory()
 * @returns {string} One of STATES values
 */
function determineState(article, trajectory) {
  const age = ageDays(article.date);
  const score = article.compositeScore;

  // Priority order matters: check most specific/urgent states first

  // NEW: published within 14 days
  if (age <= THRESHOLDS.newMaxAgeDays) {
    return STATES.NEW;
  }

  // DEAD: old + very low score
  if (age >= THRESHOLDS.deadMinAgeDays && score < THRESHOLDS.deadMaxScore) {
    return STATES.DEAD;
  }

  // DECLINING: significant score drop over 14 days (regardless of age)
  if (trajectory.dataPoints >= 3 && trajectory.trend14d <= THRESHOLDS.decliningThreshold14d) {
    return STATES.DECLINING;
  }

  // GROWING: score rising 3+ consecutive days
  if (trajectory.consecutiveRising >= THRESHOLDS.growingConsecutiveDays) {
    return STATES.GROWING;
  }

  // PEAK: high score and stable
  if (score >= THRESHOLDS.peakMinScore && trajectory.trend7d >= -THRESHOLDS.peakMaxDecline7d) {
    return STATES.PEAK;
  }

  // EVERGREEN: old, moderate stable score
  if (
    age >= THRESHOLDS.evergreenMinAgeDays &&
    score >= THRESHOLDS.evergreenScoreMin &&
    score <= THRESHOLDS.evergreenScoreMax &&
    trajectory.variance7d <= THRESHOLDS.evergreenMaxVariance7d
  ) {
    return STATES.EVERGREEN;
  }

  // If >6 months and score between 10-30, still EVERGREEN (low end) with light maintenance
  if (age >= THRESHOLDS.evergreenMinAgeDays && score >= THRESHOLDS.deadMaxScore && score < THRESHOLDS.evergreenScoreMin) {
    return STATES.EVERGREEN;
  }

  // Default fallback: if we have no trajectory data, use score-based heuristic
  if (score >= THRESHOLDS.peakMinScore) return STATES.PEAK;
  if (score < THRESHOLDS.deadMaxScore && age > 90) return STATES.DEAD;

  // Articles in the middle without clear trajectory — treat as growing/stable
  return STATES.GROWING;
}

/**
 * Generate auto-actions based on lifecycle state.
 *
 * @param {string} state
 * @param {{compositeScore: number, flags: string[], slug: string}} article
 * @returns {Array<{action: string, priority: string, reason: string}>}
 */
function generateActions(state, article) {
  const actions = [];

  switch (state) {
    case STATES.NEW:
      actions.push({
        action: 'create_reel',
        priority: 'P1',
        reason: 'New article needs reel amplification within first 2 weeks',
      });
      actions.push({
        action: 'social_share',
        priority: 'P0',
        reason: 'New article — share on FB/IG/Threads for initial traffic burst',
      });
      if (!article.flags?.includes('missing_widgets')) {
        // Widgets can wait for NEW articles
      }
      break;

    case STATES.GROWING:
      actions.push({
        action: 'add_widgets',
        priority: 'P1',
        reason: 'Article gaining traction — monetize with Travelpayouts widgets',
      });
      if (article.flags?.includes('missing_widgets')) {
        actions.push({
          action: 'add_travelpayouts',
          priority: 'P0',
          reason: 'Growing article without widgets — immediate monetization opportunity',
        });
      }
      actions.push({
        action: 'create_reel',
        priority: 'P2',
        reason: 'Growing article benefits from additional reel amplification',
      });
      break;

    case STATES.PEAK:
      if (article.flags?.includes('missing_widgets')) {
        actions.push({
          action: 'add_max_widgets',
          priority: 'P0',
          reason: 'Peak article without widgets — maximum revenue loss',
        });
      }
      actions.push({
        action: 'add_email_cta',
        priority: 'P1',
        reason: 'Peak article — capture email subscribers while traffic is high',
      });
      actions.push({
        action: 'ensure_internal_links',
        priority: 'P1',
        reason: 'Peak article — maximize link equity distribution to other articles',
      });
      break;

    case STATES.DECLINING:
      actions.push({
        action: 'content_refresh',
        priority: 'P0',
        reason: 'Article declining -15%+ over 14d — urgent content refresh needed',
      });
      actions.push({
        action: 'update_title_meta',
        priority: 'P1',
        reason: 'Declining article — refresh title/meta for improved CTR',
      });
      actions.push({
        action: 'add_fresh_sections',
        priority: 'P1',
        reason: 'Declining article — add 2026 updates, new sections, fresh data',
      });
      break;

    case STATES.EVERGREEN:
      actions.push({
        action: 'annual_review',
        priority: 'P3',
        reason: 'Evergreen article — light annual fact-check and date update',
      });
      break;

    case STATES.DEAD:
      actions.push({
        action: 'evaluate_merge',
        priority: 'P2',
        reason: 'Dead article — evaluate merging into related pillar content',
      });
      actions.push({
        action: 'evaluate_301',
        priority: 'P2',
        reason: 'Dead article — candidate for 301 redirect to stronger page',
      });
      break;
  }

  return actions;
}

// ── Main ──────────────────────────────────────────────────────────────────

/**
 * Run the lifecycle state machine for all articles.
 *
 * @returns {Promise<Object>} Lifecycle states result
 */
export async function runLifecycleManager() {
  log('Starting lifecycle state machine...');
  const startTime = Date.now();

  // ── Step 1: Load current article scores ──
  const scoresData = await loadJSON(SCORES_PATH);
  if (!scoresData || !scoresData.scores || scoresData.scores.length === 0) {
    // If no scores file exists, try running the scorer first
    log('No article-scores.json found. Run article-scorer.js first.');
    log('Attempting to import and run scorer...');

    try {
      const { scoreAllArticles } = await import('./article-scorer.js');
      const freshScores = await scoreAllArticles();
      return await processLifecycle(freshScores.scores);
    } catch (err) {
      logError(`Cannot score articles: ${err.message}`);
      logError('Lifecycle manager requires article-scores.json. Aborting.');
      return { error: 'No scores data available', timestamp: new Date().toISOString() };
    }
  }

  return await processLifecycle(scoresData.scores);
}

/**
 * Core lifecycle processing (separated for reuse).
 */
async function processLifecycle(scores) {
  const startTime = Date.now();

  // ── Step 2: Load score history ──
  const history = await loadScoreHistory();
  log(`Score history loaded for ${history.size} unique slugs`);

  // ── Step 3: Save today's snapshot ──
  await saveScoreSnapshot(scores);

  // ── Step 4: Compute lifecycle state for each article ──
  const results = [];
  const stateCounts = {};
  let totalActions = 0;

  for (const article of scores) {
    const slugHistory = history.get(article.slug) || [];
    const trajectory = computeTrajectory(slugHistory, article.compositeScore);
    const state = determineState(article, trajectory);
    const actions = generateActions(state, article);

    stateCounts[state] = (stateCounts[state] || 0) + 1;
    totalActions += actions.length;

    results.push({
      slug: article.slug,
      title: article.title,
      wpId: article.wpId,
      compositeScore: article.compositeScore,
      date: article.date,
      ageDays: Math.round(ageDays(article.date)),
      state,
      trajectory: {
        trend7d: trajectory.trend7d,
        trend14d: trajectory.trend14d,
        consecutiveRising: trajectory.consecutiveRising,
        variance7d: trajectory.variance7d,
        dataPoints: trajectory.dataPoints,
      },
      actions,
      flags: article.flags || [],
    });
  }

  // Sort: P0 actions first (DECLINING, then PEAK missing widgets), then by score
  results.sort((a, b) => {
    const stateOrder = { DECLINING: 0, PEAK: 1, GROWING: 2, NEW: 3, EVERGREEN: 4, DEAD: 5 };
    const orderA = stateOrder[a.state] ?? 6;
    const orderB = stateOrder[b.state] ?? 6;
    if (orderA !== orderB) return orderA - orderB;
    return b.compositeScore - a.compositeScore;
  });

  // ── Step 5: Build output ──
  const output = {
    timestamp: new Date().toISOString(),
    articleCount: results.length,
    stateCounts,
    totalActions,
    actionsByPriority: {
      P0: results.reduce((n, r) => n + r.actions.filter(a => a.priority === 'P0').length, 0),
      P1: results.reduce((n, r) => n + r.actions.filter(a => a.priority === 'P1').length, 0),
      P2: results.reduce((n, r) => n + r.actions.filter(a => a.priority === 'P2').length, 0),
      P3: results.reduce((n, r) => n + r.actions.filter(a => a.priority === 'P3').length, 0),
    },
    articles: results,
  };

  // ── Step 6: Write output ──
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LIFECYCLE_PATH, JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Lifecycle analysis complete (${elapsed}s)`);
  log(`  Articles: ${output.articleCount}`);
  log(`  States: ${Object.entries(stateCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  log(`  Actions: ${output.totalActions} total (P0=${output.actionsByPriority.P0}, P1=${output.actionsByPriority.P1}, P2=${output.actionsByPriority.P2}, P3=${output.actionsByPriority.P3})`);
  log(`  Written to ${LIFECYCLE_PATH}`);

  return output;
}

// ── CLI entry point ────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/.*\//, ''));
if (isMain) {
  runLifecycleManager()
    .then(result => {
      if (result.error) {
        console.error(`\nLifecycle Manager Failed: ${result.error}`);
        process.exit(1);
      }

      console.log(`\nLifecycle Manager Complete:`);
      console.log(`  Total Articles: ${result.articleCount}`);
      console.log(`  States:`);
      for (const [state, count] of Object.entries(result.stateCounts)) {
        console.log(`    ${state}: ${count}`);
      }
      console.log(`  Total Actions: ${result.totalActions}`);
      console.log(`    P0 (urgent): ${result.actionsByPriority.P0}`);
      console.log(`    P1 (important): ${result.actionsByPriority.P1}`);
      console.log(`    P2 (nice-to-have): ${result.actionsByPriority.P2}`);
      console.log(`    P3 (maintenance): ${result.actionsByPriority.P3}`);

      // Show top 5 articles needing attention
      const urgent = result.articles.filter(a => a.actions.some(act => act.priority === 'P0'));
      if (urgent.length > 0) {
        console.log(`\n  Urgent (P0) Articles:`);
        for (const a of urgent.slice(0, 5)) {
          const p0Actions = a.actions.filter(act => act.priority === 'P0').map(act => act.action).join(', ');
          console.log(`    [${a.state}] ${a.slug} (score: ${a.compositeScore}) -> ${p0Actions}`);
        }
      }
    })
    .catch(err => {
      console.error('FATAL:', err);
      process.exit(1);
    });
}
