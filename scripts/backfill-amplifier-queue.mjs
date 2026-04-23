#!/usr/bin/env node
/**
 * scripts/backfill-amplifier-queue.mjs
 *
 * Retroactively build amplifier queue files for articles that don't yet
 * have one. Reads `articles-database.json` (crawled WP corpus) and calls
 * `amplifyArticle` for each eligible slug.
 *
 * Flags:
 *   --limit N         cap the number of articles processed (default: unlimited)
 *   --min-traffic X   minimum (estimated) traffic to include — currently
 *                     we don't have per-article traffic in the JSON, so this
 *                     is a placeholder that filters by presence of featured
 *                     image + excerpt length as a weak proxy.
 *   --dry-run         don't write queue files, just report what would be done
 *   --slug SLUG       only process a single slug
 *   --force           re-process even if a queue file already exists
 *
 * Usage:
 *   node scripts/backfill-amplifier-queue.mjs --limit 10
 *   node scripts/backfill-amplifier-queue.mjs --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { amplifyArticle } from '../intelligence/authority-amplifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(REPO_ROOT, 'articles-database.json');
const QUEUE_DIR = path.join(REPO_ROOT, 'data', 'amplifier-queue');

function parseArgs(argv) {
  const out = { limit: Infinity, minTraffic: 0, dryRun: false, slug: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') { out.limit = Number(argv[++i] || Infinity); }
    else if (a === '--min-traffic') { out.minTraffic = Number(argv[++i] || 0); }
    else if (a === '--dry-run' || a === '-n') { out.dryRun = true; }
    else if (a === '--slug') { out.slug = argv[++i]; }
    else if (a === '--force') { out.force = true; }
    else if (a === '--help' || a === '-h') {
      console.log('Usage: backfill-amplifier-queue.mjs [--limit N] [--min-traffic X] [--slug S] [--dry-run] [--force]');
      process.exit(0);
    }
  }
  return out;
}

function tokensFromArticle(a) {
  const tokens = [];
  (a.categories || []).forEach((c) => { if (c.slug) tokens.push(c.slug); });
  (a.tags || []).forEach((t) => { if (t.slug) tokens.push(t.slug); });
  return tokens;
}

function hasQueueFile(slug) {
  return fs.existsSync(path.join(QUEUE_DIR, `${slug}.json`));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backfill] articles-database.json not found at ${DB_PATH}`);
    process.exit(1);
  }
  fs.mkdirSync(QUEUE_DIR, { recursive: true });

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  let articles = Array.isArray(db.articles) ? db.articles : [];

  if (args.slug) articles = articles.filter((a) => a.slug === args.slug);
  // Weak proxy for "decent-traffic" articles: has featured image AND excerpt ≥ 80 chars
  if (args.minTraffic > 0) {
    articles = articles.filter((a) => a.featured_image && (a.excerpt || '').length >= 80);
  }

  const todo = [];
  for (const a of articles) {
    if (!a.slug) continue;
    if (!args.force && hasQueueFile(a.slug)) continue;
    todo.push(a);
    if (todo.length >= args.limit) break;
  }

  console.log(`[backfill] total articles in DB: ${articles.length}`);
  console.log(`[backfill] eligible (no queue file${args.force ? ', --force' : ''}): ${todo.length}`);
  if (args.dryRun) {
    todo.slice(0, 20).forEach((a) => console.log(`  • ${a.slug}`));
    if (todo.length > 20) console.log(`  … and ${todo.length - 20} more`);
    console.log('[backfill] --dry-run: no queue files written');
    return;
  }

  let ok = 0, degraded = 0, failed = 0;
  for (const a of todo) {
    try {
      const res = await amplifyArticle({
        slug: a.slug,
        title: (a.title || '').replace(/&[a-z#0-9]+;/gi, ''),
        url: a.url,
        primaryKeyword: (a.tags && a.tags[0] && a.tags[0].name) || '',
        topicTokens: tokensFromArticle(a),
      });
      if (res.byPlatform?.quora?.degraded) degraded++;
      ok++;
      console.log(`  ✓ ${a.slug} — queued=${res.queued}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${a.slug} — ${e.message}`);
    }
  }
  console.log(`[backfill] done: ok=${ok} degraded=${degraded} failed=${failed}`);
}

main().catch((e) => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});
