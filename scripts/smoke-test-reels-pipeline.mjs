#!/usr/bin/env node
/**
 * scripts/smoke-test-reels-pipeline.mjs
 *
 * Full-story smoke test for the FlashVoyage reels pipeline.
 *
 * Purpose
 * -------
 * The reels pipeline has silently broken in the past because:
 *   1. `performance-scorer.js --update` CLI fell into the default Usage branch
 *      → performance-weights.json was never refreshed.
 *   2. `ig-stats-fetcher.js --days 2` parsed `--days` as NaN → zero reels analyzed.
 *   3. State files (content-history.json, reel-history.jsonl) were never re-committed
 *      to main → dedup DB stayed empty → scheduler re-picked the same articles.
 *   4. The scheduler's decideContent() had no cross-check against the real IG feed.
 *
 * Workflows swallowed every error with `|| echo WARN`, so nothing surfaced.
 *
 * This script is a fast, dependency-free, NETWORK-FREE smoke test that a human
 * (or CI) can run to answer: "is the pipeline still learning?" before hitting
 * prod. It inspects the on-disk state and does a dry-run decideContent() call
 * with skipNews:true so it never hits IG / GA4 / Anthropic.
 *
 * Output format is GitHub-Actions-friendly (`::error::`, `::warning::`,
 * `::notice::`) so annotations surface on the PR/Actions UI. Exits 0 on pass,
 * 1 on fail.
 *
 * Usage
 * -----
 *   node scripts/smoke-test-reels-pipeline.mjs
 *
 * CI
 * --
 *   See .github/workflows/smoke-test-reels.yml (daily at 05:00 UTC + manual).
 */

import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ── Resolve repo-relative paths ────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

const PERF_WEIGHTS_PATH = resolve(
  REPO_ROOT,
  'social-distributor/reels/data/performance-weights.json'
);
const CONTENT_HISTORY_PATH = resolve(
  REPO_ROOT,
  'social-distributor/reels/data/content-history.json'
);
const REEL_HISTORY_PATH = resolve(
  REPO_ROOT,
  'social-distributor/data/reel-history.jsonl'
);
const SCHEDULER_PATH = resolve(
  REPO_ROOT,
  'social-distributor/reels/smart-scheduler.js'
);

// ── Config ─────────────────────────────────────────────────────────────────
const STALE_WEIGHTS_DAYS = 2;
const STALE_REEL_HISTORY_DAYS = 2;
const SEED_REEL_HISTORY_LINES = 3; // the historical seed baseline
const KILLED_FORMATS = new Set(['poll', 'versus']);
const VALID_FORMATS = new Set([
  'poll', 'pick', 'humor', 'humor-tweet', 'budget', 'versus',
  'avantapres', 'month', 'cost-vs', 'leaderboard', 'best-time',
]);

// ── Accumulators ───────────────────────────────────────────────────────────
const errors = [];
const warnings = [];

function logCheck(name, status, details) {
  const line = `[SMOKE-TEST] ${name} — ${status} — ${details}`;
  process.stdout.write(line + '\n');
}

function ghError(msg) {
  process.stdout.write(`::error::${msg}\n`);
  errors.push(msg);
}

function ghWarning(msg) {
  process.stdout.write(`::warning::${msg}\n`);
  warnings.push(msg);
}

function ghNotice(msg) {
  process.stdout.write(`::notice::${msg}\n`);
}

function daysBetween(a, b) {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function safeReadJson(path) {
  if (!existsSync(path)) {
    return { ok: false, reason: 'file does not exist' };
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    return { ok: true, data: JSON.parse(raw), raw };
  } catch (err) {
    return { ok: false, reason: `parse error: ${err.message}` };
  }
}

// ── CHECK 1: performance-weights.json freshness ───────────────────────────
function checkPerformanceWeights() {
  const name = 'performance-weights';
  const res = safeReadJson(PERF_WEIGHTS_PATH);
  if (!res.ok) {
    ghError(`performance-weights.json unreadable: ${res.reason}`);
    logCheck(name, 'FAIL', `cannot read file (${res.reason})`);
    return;
  }
  const { data } = res;
  const lastUpdated = data.lastUpdated || null;
  if (!lastUpdated) {
    ghError('performance-weights.json has no lastUpdated field');
    logCheck(name, 'FAIL', 'missing lastUpdated');
    return;
  }
  const parsed = new Date(lastUpdated);
  if (Number.isNaN(parsed.getTime())) {
    ghError(`performance-weights.json lastUpdated is unparseable: "${lastUpdated}"`);
    logCheck(name, 'FAIL', `unparseable lastUpdated=${lastUpdated}`);
    return;
  }
  const ageDays = daysBetween(new Date(), parsed);
  const ageFixed = ageDays.toFixed(2);
  if (ageDays > STALE_WEIGHTS_DAYS) {
    ghError(
      `performance-weights.json is STALE: lastUpdated=${lastUpdated} ` +
      `(${ageFixed} days ago, threshold ${STALE_WEIGHTS_DAYS}d). ` +
      `The --update CLI in performance-scorer.js is likely broken again.`
    );
    logCheck(name, 'FAIL', `lastUpdated=${lastUpdated} age=${ageFixed}d (>${STALE_WEIGHTS_DAYS}d)`);
  } else {
    logCheck(name, 'PASS', `lastUpdated=${lastUpdated} age=${ageFixed}d`);
  }
}

// ── CHECK 2: content-history.json coverage ────────────────────────────────
function checkContentHistory() {
  const name = 'content-history';
  const res = safeReadJson(CONTENT_HISTORY_PATH);
  if (!res.ok) {
    ghError(`content-history.json unreadable: ${res.reason}`);
    logCheck(name, 'FAIL', `cannot read file (${res.reason})`);
    return;
  }
  const { data } = res;
  const counts = {
    recentDestinations: Array.isArray(data.recentDestinations) ? data.recentDestinations.length : 0,
    recentFormats: Array.isArray(data.recentFormats) ? data.recentFormats.length : 0,
    recentArticleIds: Array.isArray(data.recentArticleIds) ? data.recentArticleIds.length : 0,
    recentFingerprints: Array.isArray(data.recentFingerprints) ? data.recentFingerprints.length : 0,
  };
  const summary =
    `recentDestinations=${counts.recentDestinations} ` +
    `recentFormats=${counts.recentFormats} ` +
    `recentArticleIds=${counts.recentArticleIds} ` +
    `recentFingerprints=${counts.recentFingerprints}`;

  const allZero = Object.values(counts).every((c) => c === 0);

  // Cross-reference with reel-history.jsonl: if we have publishes on record
  // but content-history is empty, the dedup DB never got re-committed.
  let reelLines = 0;
  if (existsSync(REEL_HISTORY_PATH)) {
    try {
      const raw = readFileSync(REEL_HISTORY_PATH, 'utf-8');
      reelLines = raw.split('\n').filter((l) => l.trim().length > 0).length;
    } catch {
      // handled in check 3
    }
  }

  if (allZero && reelLines > SEED_REEL_HISTORY_LINES) {
    ghError(
      `content-history.json is EMPTY (all four arrays = 0) but reel-history.jsonl ` +
      `has ${reelLines} entries (> seed ${SEED_REEL_HISTORY_LINES}). ` +
      `Publishes happened but the dedup DB was never re-committed. ` +
      `Scheduler will re-pick the same articles.`
    );
    logCheck(name, 'FAIL', `${summary} (reelLines=${reelLines})`);
  } else if (allZero) {
    ghWarning(
      `content-history.json is empty but reel-history.jsonl is at/under seed ` +
      `(${reelLines} lines). Acceptable only if no publishes happened yet.`
    );
    logCheck(name, 'WARN', `${summary} (reelLines=${reelLines}, seed-only)`);
  } else {
    logCheck(name, 'PASS', summary);
  }
}

// ── CHECK 3: reel-history.jsonl freshness ─────────────────────────────────
function checkReelHistory() {
  const name = 'reel-history';
  if (!existsSync(REEL_HISTORY_PATH)) {
    ghError(`reel-history.jsonl does not exist at ${REEL_HISTORY_PATH}`);
    logCheck(name, 'FAIL', 'file missing');
    return;
  }
  let lines = [];
  try {
    const raw = readFileSync(REEL_HISTORY_PATH, 'utf-8');
    lines = raw.split('\n').filter((l) => l.trim().length > 0);
  } catch (err) {
    ghError(`reel-history.jsonl unreadable: ${err.message}`);
    logCheck(name, 'FAIL', `read error: ${err.message}`);
    return;
  }
  if (lines.length === 0) {
    ghError('reel-history.jsonl is empty');
    logCheck(name, 'FAIL', '0 lines');
    return;
  }

  // Parse most recent entry (assume append order, but be defensive and scan).
  let mostRecent = null;
  let mostRecentDate = null;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!entry.date) continue;
      const d = new Date(entry.date);
      if (Number.isNaN(d.getTime())) continue;
      if (!mostRecentDate || d > mostRecentDate) {
        mostRecent = entry;
        mostRecentDate = d;
      }
    } catch {
      // skip malformed line
    }
  }

  if (!mostRecent) {
    ghError('reel-history.jsonl has no parseable entries with a date field');
    logCheck(name, 'FAIL', `${lines.length} lines, none parseable`);
    return;
  }

  const ageDays = daysBetween(new Date(), mostRecentDate);
  const ageFixed = ageDays.toFixed(2);
  const summary =
    `lines=${lines.length} mostRecent=${mostRecent.date} age=${ageFixed}d`;

  if (ageDays > STALE_REEL_HISTORY_DAYS) {
    ghError(
      `reel-history.jsonl is STALE: most recent entry ${mostRecent.date} ` +
      `(${ageFixed} days ago, threshold ${STALE_REEL_HISTORY_DAYS}d). ` +
      `No publishes have been recorded recently — pipeline likely broken.`
    );
    logCheck(name, 'FAIL', summary);
  } else {
    logCheck(name, 'PASS', summary);
  }
}

// ── CHECK 4: decideContent dry-run ─────────────────────────────────────────
async function checkDecideContent() {
  const name = 'decideContent-dryrun';
  let scheduler;
  try {
    scheduler = await import(SCHEDULER_PATH);
  } catch (err) {
    ghError(`Failed to import smart-scheduler.js: ${err.message}`);
    logCheck(name, 'FAIL', `import error: ${err.message}`);
    return;
  }
  if (typeof scheduler.decideContent !== 'function') {
    ghError('smart-scheduler.js does not export decideContent()');
    logCheck(name, 'FAIL', 'missing decideContent export');
    return;
  }
  let decision;
  try {
    decision = await scheduler.decideContent({ skipNews: true });
  } catch (err) {
    ghError(`decideContent({ skipNews: true }) threw: ${err.message}`);
    logCheck(name, 'FAIL', `threw: ${err.message}`);
    return;
  }
  if (!decision || typeof decision !== 'object') {
    ghError(`decideContent returned non-object: ${JSON.stringify(decision)}`);
    logCheck(name, 'FAIL', `bad return: ${JSON.stringify(decision)}`);
    return;
  }
  const { format, articleId, destination, reason } = decision;
  const summary = `format=${format} articleId=${articleId} destination=${destination} reason="${(reason || '').slice(0, 80)}"`;

  let failed = false;
  if (!format) {
    ghError(`decideContent returned undefined/empty format: ${summary}`);
    failed = true;
  } else if (!VALID_FORMATS.has(format)) {
    ghError(`decideContent returned unknown format "${format}" (not in VALID_FORMATS)`);
    failed = true;
  } else if (KILLED_FORMATS.has(format)) {
    ghError(
      `decideContent returned KILLED format "${format}" — killedFormats guard is broken`
    );
    failed = true;
  }

  if (failed) {
    logCheck(name, 'FAIL', summary);
  } else {
    logCheck(name, 'PASS', summary);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  ghNotice('Reels pipeline smoke test starting (network-free, dry-run)');

  // Each check is independent — run all, accumulate errors.
  try { checkPerformanceWeights(); } catch (err) {
    ghError(`performance-weights check threw: ${err.message}`);
  }
  try { checkContentHistory(); } catch (err) {
    ghError(`content-history check threw: ${err.message}`);
  }
  try { checkReelHistory(); } catch (err) {
    ghError(`reel-history check threw: ${err.message}`);
  }
  try { await checkDecideContent(); } catch (err) {
    ghError(`decideContent check threw: ${err.message}`);
  }

  const passed = errors.length === 0;
  const summaryLine = passed
    ? '[SMOKE-TEST] PASSED'
    : `[SMOKE-TEST] FAILED (${errors.length} issue${errors.length === 1 ? '' : 's'})`;
  process.stdout.write(summaryLine + '\n');

  // Push to GitHub Actions step summary if available.
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    try {
      const ciLine = passed
        ? `### Reels smoke test: PASSED\n\nAll ${4} checks green (performance-weights, content-history, reel-history, decideContent dry-run).\n`
        : `### Reels smoke test: FAILED (${errors.length} issue${errors.length === 1 ? '' : 's'})\n\n` +
          errors.map((e) => `- ${e}`).join('\n') + '\n' +
          (warnings.length ? `\n**Warnings:**\n` + warnings.map((w) => `- ${w}`).join('\n') + '\n' : '');
      appendFileSync(stepSummary, ciLine);
    } catch {
      // best-effort; don't fail the test because of summary write
    }
  }

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  process.stdout.write(`::error::Smoke test crashed: ${err.stack || err.message}\n`);
  process.stdout.write('[SMOKE-TEST] FAILED (crashed)\n');
  process.exit(1);
});
