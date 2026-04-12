#!/usr/bin/env node
/**
 * Auto-Apply Runner — LOW tier only.
 *
 * Orchestrates mechanical content-ops rules (R1/T3/T1) against the
 * FlashVoyage WordPress site with strong guardrails:
 *   - master kill-switch + per-tier toggles in data/auto-apply/settings.json
 *   - daily cap (max edits/day across all LOW rules)
 *   - per-article 14-day cooldown
 *   - HCU diff-size guard on R1/T3 (< 5% of total length → skip)
 *   - consecutive-failure abort (3 in a row)
 *   - article-modified-in-last-24h guard (belt + suspenders)
 *   - dry-run mode (no WP writes, no data/ writes)
 *
 * Audit trail: every decision is appended as one JSON line to
 * data/auto-edit-log.jsonl.
 *
 * CLI flags:
 *   --dry-run            no WP writes, no data/ writes
 *   --rules=R1,T1        limit to specific rule IDs
 *   --max=3              override daily cap ceiling (min with settings cap)
 *   --slug=foo           target a single article (debug escape hatch)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  fetchAllPublishedPosts,
  fetchPostBySlug,
  updatePost,
  getRawTitle,
  getRawContent,
} from './wp.js';

import R1 from './rules/r1-yyyy-refresh.js';
import T3 from './rules/t3-preemptive-refresh.js';
import T1 from './rules/t1-esim-widget.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const PATH_SETTINGS = path.join(REPO_ROOT, 'data', 'auto-apply', 'settings.json');
const PATH_COOLDOWNS = path.join(REPO_ROOT, 'data', 'auto-apply', 'cooldowns.json');
const PATH_LOG = path.join(REPO_ROOT, 'data', 'auto-edit-log.jsonl');

const RULES = [R1, T3, T1];
const RULES_BY_ID = Object.fromEntries(RULES.map(r => [r.id, r]));

const COOLDOWN_DAYS = 14;
const MODIFIED_GUARD_HOURS = 24;
const HCU_MIN_DIFF_RATIO = 0.05; // 5%
const MAX_CONSECUTIVE_FAILURES = 3;

// ─── CLI parsing ─────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    dryRun: false,
    rules: null, // null = all
    max: null,
    slug: null,
  };
  for (const raw of argv) {
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw.startsWith('--rules=')) {
      args.rules = raw.slice('--rules='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (raw.startsWith('--max=')) {
      const n = parseInt(raw.slice('--max='.length), 10);
      if (Number.isFinite(n) && n >= 0) args.max = n;
    } else if (raw.startsWith('--slug=')) {
      args.slug = raw.slice('--slug='.length).trim();
    }
  }
  return args;
}

// ─── Persistence helpers ─────────────────────────────────────────────

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(filePath, value) {
  const txt = JSON.stringify(value, null, 2) + '\n';
  await fs.writeFile(filePath, txt, 'utf8');
}

async function readLogLines() {
  try {
    const raw = await fs.readFile(PATH_LOG, 'utf8');
    if (!raw.trim()) return [];
    return raw.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function appendLogLine(entry) {
  await fs.appendFile(PATH_LOG, JSON.stringify(entry) + '\n', 'utf8');
}

// ─── Date helpers ────────────────────────────────────────────────────

function isToday(isoTs) {
  const d = new Date(isoTs);
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

function daysSince(isoTs) {
  const t = new Date(isoTs).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

function hoursSince(isoTs) {
  const t = new Date(isoTs).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60);
}

// ─── Step-summary accumulator ────────────────────────────────────────

const summary = {
  evaluated: 0,
  applied: 0,
  skipped: 0,
  failed: 0,
  byRule: {},
  rows: [], // { slug, ruleId, status, reason }
};

function recordRow(row) {
  summary.rows.push(row);
  summary.byRule[row.ruleId] = summary.byRule[row.ruleId] || { success: 0, skipped: 0, failed: 0 };
  summary.byRule[row.ruleId][row.status] = (summary.byRule[row.ruleId][row.status] || 0) + 1;
  if (row.status === 'success') summary.applied++;
  else if (row.status === 'skipped') summary.skipped++;
  else if (row.status === 'failed') summary.failed++;
}

async function writeStepSummary() {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (!p) return;
  const lines = [];
  lines.push('## Auto-Apply Runner');
  lines.push('');
  lines.push(`- Evaluated: ${summary.evaluated}`);
  lines.push(`- Applied: ${summary.applied}`);
  lines.push(`- Skipped: ${summary.skipped}`);
  lines.push(`- Failed: ${summary.failed}`);
  lines.push('');
  if (Object.keys(summary.byRule).length > 0) {
    lines.push('### By rule');
    lines.push('');
    lines.push('| Rule | Success | Skipped | Failed |');
    lines.push('|------|--------:|--------:|-------:|');
    for (const [id, s] of Object.entries(summary.byRule)) {
      lines.push(`| ${id} | ${s.success || 0} | ${s.skipped || 0} | ${s.failed || 0} |`);
    }
    lines.push('');
  }
  if (summary.rows.length > 0) {
    lines.push('### Details');
    lines.push('');
    lines.push('| Rule | Slug | Status | Reason |');
    lines.push('|------|------|--------|--------|');
    for (const r of summary.rows) {
      lines.push(`| ${r.ruleId} | ${r.slug} | ${r.status} | ${r.reason || ''} |`);
    }
    lines.push('');
  }
  try {
    await fs.appendFile(p, lines.join('\n') + '\n', 'utf8');
  } catch {
    // best-effort
  }
}

// ─── Core loop ───────────────────────────────────────────────────────

async function logEntry({ post, rule, status, diffSummary = '', reason, dryRun }) {
  const entry = {
    ts: new Date().toISOString(),
    articleSlug: post?.slug || '',
    articleTitle: getRawTitle(post) || '',
    articleUrl: post?.link || '',
    ruleId: rule.id,
    tier: rule.tier,
    diffSummary,
    status,
    dryRun: Boolean(dryRun),
  };
  if (reason) entry.reason = reason;
  if (!dryRun) {
    try { await appendLogLine(entry); } catch (e) {
      console.error(`⚠️  Failed to append to log: ${e.message}`);
    }
  }
  recordRow({
    slug: entry.articleSlug,
    ruleId: rule.id,
    status,
    reason: reason || diffSummary,
  });
  return entry;
}

/**
 * Count how many characters differ between two strings, character by
 * character at aligned positions, plus any length delta. This is a cheap
 * proxy for edit distance — good enough for our HCU guard (we only need
 * to catch "micro edits on very long articles"). For a pure same-length
 * token swap like "2025" → "2026" on a 10,000-char post, this returns
 * ~1 (one char differs), so ratio = 1 / 10000 < 5% → skip.
 */
function approxCharDiff(a, b) {
  a = a || '';
  b = b || '';
  const minLen = Math.min(a.length, b.length);
  let diff = Math.abs(a.length - b.length);
  for (let i = 0; i < minLen; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) diff++;
  }
  return diff;
}

function diffTooSmall(oldTitle, newTitle, oldContent, newContent) {
  const oldLen = (oldTitle || '').length + (oldContent || '').length;
  if (oldLen === 0) return false;
  const titleDiff = approxCharDiff(oldTitle, newTitle);
  const contentDiff = approxCharDiff(oldContent, newContent);
  const total = titleDiff + contentDiff;
  return total / oldLen < HCU_MIN_DIFF_RATIO;
}

async function processPost({ post, rulesToRun, settings, cooldowns, dryRun, state }) {
  if (state.stopped) return;

  // Guard: modified in last 24h (external edit)
  if (post.modified && hoursSince(post.modified) < MODIFIED_GUARD_HOURS) {
    // Silent skip — don't even evaluate rules on a just-touched article.
    return;
  }

  // Guard: cooldown
  const cdTs = cooldowns[post.slug];
  if (cdTs && daysSince(cdTs) < COOLDOWN_DAYS) {
    // Emit a skipped log once per post per run (first eligible rule) so the
    // dashboard can surface "why wasn't this touched?"
    for (const rule of rulesToRun) {
      const a = rule.appliesTo(post);
      if (a.applies) {
        summary.evaluated++;
        await logEntry({
          post, rule,
          status: 'skipped',
          reason: 'cooldown',
          dryRun,
        });
        return; // one log line is enough
      }
    }
    return;
  }

  for (const rule of rulesToRun) {
    if (state.stopped) return;

    // Cap check BEFORE evaluating (so we don't waste work)
    if (!dryRun && state.appliedToday >= state.effectiveCap) {
      state.stopped = true;
      state.stopReason = 'daily_cap_reached';
      return;
    }

    summary.evaluated++;

    const a = rule.appliesTo(post);
    if (!a.applies) {
      // Silent — don't log every non-applicable (R1) combo, too noisy.
      continue;
    }

    let result;
    try {
      result = rule.apply(post, { dryRun });
    } catch (err) {
      state.consecutiveFailures++;
      await logEntry({
        post, rule,
        status: 'failed',
        reason: `apply_threw: ${err.message?.slice(0, 200) || 'unknown'}`,
        dryRun,
      });
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`❌ ${MAX_CONSECUTIVE_FAILURES} consecutive failures, aborting run`);
        state.stopped = true;
        state.stopReason = 'consecutive_failures';
      }
      continue;
    }

    if (result.status !== 'success') {
      await logEntry({
        post, rule,
        status: result.status,
        reason: result.reason,
        dryRun,
      });
      continue;
    }

    // HCU diff-size guard (R1 + T3). T1 is a widget injection, not a
    // micro-edit, so we exempt it.
    if (rule.id === 'R1' || rule.id === 'T3') {
      const oldTitle = getRawTitle(post);
      const oldContent = getRawContent(post);
      const newTitle = result.newTitle ?? oldTitle;
      const newContent = result.newContent ?? oldContent;
      if (diffTooSmall(oldTitle, newTitle, oldContent, newContent)) {
        await logEntry({
          post, rule,
          status: 'skipped',
          reason: 'hcu_diff_too_small',
          dryRun,
        });
        continue;
      }
    }

    // Write to WP (unless dry-run)
    if (dryRun) {
      await logEntry({
        post, rule,
        status: 'success',
        diffSummary: `[dry-run] ${result.diffSummary}`,
        dryRun: true,
      });
      state.consecutiveFailures = 0;
      continue;
    }

    try {
      const payload = {};
      if (result.newTitle !== undefined) payload.title = result.newTitle;
      if (result.newContent !== undefined) payload.content = result.newContent;
      if (Object.keys(payload).length === 0) {
        // Nothing to write — defensive.
        await logEntry({
          post, rule,
          status: 'skipped',
          reason: 'empty_payload',
          dryRun,
        });
        continue;
      }
      await updatePost(post.id, payload);
    } catch (err) {
      state.consecutiveFailures++;
      const safeMsg = (err.message || 'unknown').replace(/Basic\s+[A-Za-z0-9+/=]+/g, 'Basic <redacted>');
      await logEntry({
        post, rule,
        status: 'failed',
        reason: `wp_update_failed: ${safeMsg.slice(0, 200)}`,
        dryRun,
      });
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`❌ ${MAX_CONSECUTIVE_FAILURES} consecutive failures, aborting run`);
        state.stopped = true;
        state.stopReason = 'consecutive_failures';
      }
      continue;
    }

    // Success path
    state.consecutiveFailures = 0;
    state.appliedToday++;
    cooldowns[post.slug] = new Date().toISOString();
    await logEntry({
      post, rule,
      status: 'success',
      diffSummary: result.diffSummary,
      dryRun: false,
    });

    // Only one successful rule per article per run — don't stack edits.
    return;
  }
}

// ─── Entry point ─────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('🤖 auto-apply runner starting');
  console.log(`   dryRun:   ${args.dryRun}`);
  console.log(`   rules:    ${args.rules ? args.rules.join(',') : '(all LOW)'}`);
  console.log(`   max:      ${args.max ?? '(from settings)'}`);
  console.log(`   slug:     ${args.slug ?? '(all published)'}`);

  // 1. Settings
  const settings = await readJson(PATH_SETTINGS, {
    master: false, low: true, medium: false, high: false, dailyCap: 5,
  });

  if (!settings.master) {
    console.log('⏭️  master disabled — exiting');
    await writeStepSummary();
    return;
  }
  if (!settings.low) {
    console.log('⏭️  low tier disabled — exiting');
    await writeStepSummary();
    return;
  }

  // 2. Daily cap already consumed?
  const prior = await readLogLines();
  const usedToday = prior.filter(l =>
    l.status === 'success' && !l.dryRun && l.tier !== 'MANUAL' && isToday(l.ts)
  ).length;
  const settingsCap = Number.isFinite(settings.dailyCap) ? settings.dailyCap : 5;
  const cliCap = Number.isFinite(args.max) ? args.max : settingsCap;
  const effectiveCap = Math.min(settingsCap, cliCap);
  const remaining = Math.max(0, effectiveCap - usedToday);

  console.log(`   cap: ${effectiveCap} (settings=${settingsCap} cli=${cliCap}), used today=${usedToday}, remaining=${remaining}`);

  if (remaining === 0 && !args.dryRun) {
    console.log('⏭️  daily cap reached — exiting');
    await writeStepSummary();
    return;
  }

  // 3. Rule filter
  let rulesToRun = RULES;
  if (args.rules && args.rules.length > 0) {
    rulesToRun = args.rules.map(id => RULES_BY_ID[id]).filter(Boolean);
    if (rulesToRun.length === 0) {
      console.log('⏭️  --rules filter matched no known rule — exiting');
      await writeStepSummary();
      return;
    }
  }

  // 4. Fetch posts
  let posts = [];
  try {
    if (args.slug) {
      const p = await fetchPostBySlug(args.slug);
      if (p) posts = [p];
      else console.log(`⚠️  no post found for slug=${args.slug}`);
    } else {
      posts = await fetchAllPublishedPosts();
    }
  } catch (err) {
    if (err.code === 'WP_CREDS_MISSING') {
      console.log(`⏭️  ${err.message} — cannot fetch posts, exiting gracefully`);
      if (args.dryRun) console.log('   (dry-run: this is expected when running locally without .env)');
      await writeStepSummary();
      return;
    }
    throw err;
  }

  console.log(`   fetched ${posts.length} published posts`);

  // 5. Cooldowns
  const cooldowns = await readJson(PATH_COOLDOWNS, {});

  // 6. Loop
  const state = {
    appliedToday: usedToday,
    effectiveCap,
    consecutiveFailures: 0,
    stopped: false,
    stopReason: null,
  };

  for (const post of posts) {
    if (state.stopped) break;
    await processPost({
      post, rulesToRun, settings, cooldowns,
      dryRun: args.dryRun, state,
    });
  }

  // 7. Persist cooldowns (skip on dry-run)
  if (!args.dryRun) {
    try { await writeJson(PATH_COOLDOWNS, cooldowns); } catch (e) {
      console.error(`⚠️  Failed to write cooldowns: ${e.message}`);
    }
  }

  // 8. Console summary
  console.log('\n📊 Summary:');
  console.log(`   evaluated: ${summary.evaluated}`);
  console.log(`   applied:   ${summary.applied}`);
  console.log(`   skipped:   ${summary.skipped}`);
  console.log(`   failed:    ${summary.failed}`);
  if (state.stopReason) console.log(`   stopped:   ${state.stopReason}`);

  await writeStepSummary();
}

main().catch(err => {
  console.error('❌ Fatal error in auto-apply runner:', err);
  process.exit(1);
});
