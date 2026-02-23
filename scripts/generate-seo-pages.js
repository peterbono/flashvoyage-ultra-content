#!/usr/bin/env node
/**
 * Script batch — Genere les pages SEO programmatiques.
 *
 * Usage:
 *   node scripts/generate-seo-pages.js                    # toutes les pages manquantes
 *   node scripts/generate-seo-pages.js --status           # affiche la matrice
 *   node scripts/generate-seo-pages.js --template vols    # seulement les vols
 *   node scripts/generate-seo-pages.js --dest japan       # seulement le Japon
 *   node scripts/generate-seo-pages.js --limit 5          # max 5 pages
 *   node scripts/generate-seo-pages.js --force            # re-generer les existantes
 */

import { ProgrammaticSeoGenerator } from '../programmatic-seo-generator.js';

async function main() {
  const args = process.argv.slice(2);
  const gen = new ProgrammaticSeoGenerator();

  if (args.includes('--status')) {
    gen.status();
    return;
  }

  const options = { force: args.includes('--force') };

  const tplIdx = args.indexOf('--template');
  if (tplIdx >= 0 && args[tplIdx + 1]) {
    options.templates = [args[tplIdx + 1]];
  }

  const destIdx = args.indexOf('--dest');
  if (destIdx >= 0 && args[destIdx + 1]) {
    options.destinations = [args[destIdx + 1]];
  }

  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    options.limit = parseInt(args[limitIdx + 1], 10);
  }

  console.log('🚀 Génération des pages SEO programmatiques...\n');

  if (options.templates) console.log(`   Templates: ${options.templates.join(', ')}`);
  if (options.destinations) console.log(`   Destinations: ${options.destinations.join(', ')}`);
  if (options.limit) console.log(`   Limite: ${options.limit} pages`);
  if (options.force) console.log(`   Mode: force (re-generation)`);
  console.log('');

  const results = await gen.generateAll(options);

  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ Terminé — ${results.length} page(s) publiée(s)`);
  results.forEach(r => console.log(`   ${r.url}`));
  console.log('═══════════════════════════════════════════\n');

  gen.status();
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
