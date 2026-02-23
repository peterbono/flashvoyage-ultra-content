#!/usr/bin/env node
/**
 * Script batch — Rafraichit les articles WordPress avec des donnees live fraiches.
 *
 * Usage:
 *   node scripts/refresh-articles.js                # articles de +30 jours
 *   node scripts/refresh-articles.js --days 14      # articles de +14 jours
 *   node scripts/refresh-articles.js --limit 5      # max 5 articles
 */

import { ContentRefresher } from '../content-refresher.js';

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  const daysIdx = args.indexOf('--days');
  if (daysIdx >= 0 && args[daysIdx + 1]) {
    options.minAgeDays = parseInt(args[daysIdx + 1], 10);
  }

  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    options.limit = parseInt(args[limitIdx + 1], 10);
  }

  const refresher = new ContentRefresher();
  await refresher.refreshAll(options);
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
