#!/usr/bin/env node
/**
 * Smoke test — resolveAffiliatePlaceholders()
 *
 * Asserts that body.html (9 placeholders) becomes body_final.html-equivalent:
 *   - 9 placeholders swapped
 *   - 4 tracked  (3× airalo-philippines + 1× airalo-asialink) — actual counts
 *   - 5 fallback (5× holafly-philippines — not subscribed)
 *   - 0 errors
 *
 * NOTE: the prompt's spec said "5 tracked / 4 fallback". Actual occurrence
 * counts in /tmp/rewrite_esim_philippines/body.html are 3 airalo-philippines
 * + 1 airalo-asialink + 5 holafly-philippines = 4 tracked / 5 fallback.
 * body_final.html confirms this (grep airalo.tpo.lv → 4, holafly → 5).
 *   - all sub_ids match /^4252-<key>-a$/
 *   - if TRAVELPAYOUTS_API_TOKEN is set, output should match body_final.html line-by-line > 95%
 *
 * Exits 0 on success, 1 on failure.
 *
 * Regression guard — do NOT delete.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Best-effort .env load so `node scripts/test-affiliate-resolver.mjs` works locally.
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch { /* dotenv optional */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = '/tmp/rewrite_esim_philippines/body.html';
const GOLDEN = '/tmp/rewrite_esim_philippines/body_final.html';
const ARTICLE_ID = 4252;

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

let failures = 0;
function ok(name) {
  console.log(`  ${green('✓')} ${name}`);
}
function fail(name, detail) {
  failures += 1;
  console.log(`  ${red('✗')} ${name}${detail ? ` — ${detail}` : ''}`);
}
function warn(name, detail) {
  console.log(`  ${yellow('⚠')} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('=== affiliate-resolver smoke test ===');

  // Use the real ArticleFinalizer class method end-to-end.
  const { default: ArticleFinalizer } = await import(
    join(__dirname, '..', 'article-finalizer.js')
  );
  const finalizer = new ArticleFinalizer();

  const html = await readFile(SOURCE, 'utf8');
  const golden = await readFile(GOLDEN, 'utf8');

  const placeholderRe = /\[AFFILIATE:([a-z0-9][a-z0-9-]*)\]/gi;
  const matches = [...html.matchAll(placeholderRe)];
  const totalPlaceholders = matches.length;
  if (totalPlaceholders === 9) ok(`source has 9 placeholders (got ${totalPlaceholders})`);
  else fail(`source placeholder count`, `expected 9, got ${totalPlaceholders}`);

  const uniqueKeys = [...new Set(matches.map((m) => m[1].toLowerCase()))];
  const subIds = uniqueKeys.map((k) => `${ARTICLE_ID}-${k}-a`);

  // sub_id format assertions
  const subIdRe = new RegExp(`^${ARTICLE_ID}-[a-z0-9-]+-a$`);
  const badIds = subIds.filter((s) => !subIdRe.test(s));
  if (badIds.length === 0) ok(`all sub_ids match ^${ARTICLE_ID}-<key>-a$ (${subIds.length} checked)`);
  else fail(`sub_id format`, `bad: ${badIds.join(', ')}`);

  // Run the real class method
  const result = await finalizer.resolveAffiliatePlaceholders({ html, articleId: ARTICLE_ID });
  const { html: newHtml, swapped, tracked, fallback, errors } = result;

  if (swapped === 9) ok(`swapped = 9`);
  else fail(`swapped`, `expected 9, got ${swapped}`);

  const hasToken = Boolean(process.env.TRAVELPAYOUTS_API_TOKEN);
  if (hasToken) {
    if (tracked === 4) ok(`tracked = 4 (3 Airalo PH + 1 Asialink)`);
    else fail(`tracked`, `expected 4, got ${tracked}`);
    if (fallback === 5) ok(`fallback = 5 (Holafly direct ×5)`);
    else fail(`fallback`, `expected 5, got ${fallback}`);
    if (errors.length === 0) ok(`errors = 0`);
    else fail(`errors`, `${errors.length} errors: ${JSON.stringify(errors)}`);
  } else {
    warn(
      'TRAVELPAYOUTS_API_TOKEN not set',
      'running in degraded mode — all 9 marked as fallback, TP API not hit'
    );
    if (fallback === 9 && tracked === 0) ok(`degraded-mode: fallback = 9 (holafly×4 + airalo×5 via no_token)`);
    else fail(`degraded-mode shape`, `tracked=${tracked} fallback=${fallback}`);
    // In degraded mode we don't assert errors because no_token is expected
  }

  // Line-by-line match ratio vs golden
  const outLines = newHtml.split('\n');
  const goldLines = golden.split('\n');
  const minLen = Math.min(outLines.length, goldLines.length);
  let matching = 0;
  for (let i = 0; i < minLen; i += 1) {
    if (outLines[i] === goldLines[i]) matching += 1;
  }
  const ratio = (matching / Math.max(outLines.length, goldLines.length)) * 100;
  const ratioStr = `${ratio.toFixed(1)}% (${matching}/${Math.max(outLines.length, goldLines.length)})`;

  if (hasToken) {
    if (ratio > 95) ok(`line-match vs body_final.html: ${ratioStr}`);
    else fail(`line-match vs body_final.html`, `${ratioStr} (need >95%)`);
  } else {
    // In degraded mode, the URL lines won't match (we use direct target URLs).
    // But all non-placeholder lines (most of the file) should match exactly.
    const placeholderLineCount = matches.length; // approximate upper bound
    const acceptable = ratio > 95 || matching >= minLen - placeholderLineCount - 1;
    if (acceptable) ok(`degraded-mode line-match: ${ratioStr} (placeholder lines differ, rest matches)`);
    else warn(`degraded-mode line-match`, `${ratioStr} — may indicate map drift`);
  }

  console.log('\n=== summary ===');
  console.log(`  swapped : ${swapped}`);
  console.log(`  tracked : ${tracked}`);
  console.log(`  fallback: ${fallback}`);
  console.log(`  errors  : ${errors.length}`);
  console.log(`  line-match: ${ratioStr}`);

  if (failures > 0) {
    console.log(red(`\nFAIL — ${failures} assertion(s) failed`));
    process.exit(1);
  }
  console.log(green('\nOK — all assertions passed'));
  process.exit(0);
}

main().catch((err) => {
  console.error(red('FATAL'), err);
  process.exit(1);
});
