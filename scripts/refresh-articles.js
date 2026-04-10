#!/usr/bin/env node
/**
 * Script batch — Rafraichit les articles WordPress avec des donnees live fraiches.
 *
 * Usage:
 *   node scripts/refresh-articles.js                      # articles de +30 jours
 *   node scripts/refresh-articles.js --days 14            # articles de +14 jours
 *   node scripts/refresh-articles.js --limit 5            # max 5 articles
 *   node scripts/refresh-articles.js --slug my-article    # un seul article ciblé
 *   node scripts/refresh-articles.js --slugs s1,s2,s3     # plusieurs articles (CSV)
 */

import { ContentRefresher } from '../content-refresher.js';

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Mode batch ciblé: --slugs <csv> → refresh plusieurs articles en un seul run
  const slugsIdx = args.indexOf('--slugs');
  if (slugsIdx >= 0 && args[slugsIdx + 1]) {
    const slugs = args[slugsIdx + 1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (slugs.length === 0) {
      console.error('❌ --slugs: au moins un slug requis');
      process.exit(1);
    }
    const refresher = new ContentRefresher();
    await refresher.refreshBySlugs(slugs);
    return;
  }

  // Mode ciblé: --slug <slug> → refresh un seul article
  const slugIdx = args.indexOf('--slug');
  if (slugIdx >= 0 && args[slugIdx + 1]) {
    const slug = args[slugIdx + 1];
    const refresher = new ContentRefresher();
    await refresher.refreshBySlug(slug);
    return;
  }

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
