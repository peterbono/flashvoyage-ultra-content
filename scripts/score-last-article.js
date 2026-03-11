#!/usr/bin/env node
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const html = fs.readFileSync('/tmp/last-generated-article.html', 'utf-8');

const { default: QualityAnalyzer } = await import('../quality-analyzer.js');
const { runAllKPITests } = await import('../tests/kpi-quality.test.js');

const qa = new QualityAnalyzer();

console.log('════════════════════════════════════════════════════════════════');
console.log('📊 AUDIT QUALITÉ — Article généré par Claude Haiku 4.5');
console.log('════════════════════════════════════════════════════════════════\n');

const wrappedHtml = `<h1>Maratua ou Labuan Bajo : l'itinéraire indonésien qui coûte une décision irremplaçable</h1>\n${html}`;

const score = qa.getGlobalScore(wrappedHtml, 'evergreen', null);
console.log(`\n📈 SCORE GLOBAL: ${score.globalScore}% (seuil: ${score.threshold}%)`);
console.log(`   Blocking: ${score.blockingPassed ? '✅ PASS' : '❌ FAIL'}`);

if (score.categories) {
  const cats = score.categories;
  console.log(`\n📊 DÉTAIL PAR CATÉGORIE:`);
  for (const [name, cat] of Object.entries(cats)) {
    console.log(`   ${name}: ${cat.percentage?.toFixed(1) || 'N/A'}% (${cat.score}/${cat.maxScore})`);
    if (cat.details) {
      cat.details.forEach(d => {
        const icon = d.score > 0 ? '✅' : '❌';
        console.log(`      ${icon} ${d.name}: ${d.score}/${d.maxScore}${d.reason ? ` — ${d.reason}` : ''}`);
      });
    }
    if (cat.checks) {
      cat.checks.forEach(c => {
        const icon = c.passed ? '✅' : '❌';
        console.log(`      ${icon} ${c.check}${c.ratio ? ` (${c.ratio})` : ''}`);
      });
    }
  }
}

console.log('\n────────────────────────────────────────────────────────────────');
console.log('📋 KPI TESTS K1-K10:\n');

const kpiResults = await runAllKPITests(html, {
  angleHook: null,
  allowedNumberTokens: null,
  editorialMode: 'evergreen',
  title: "Maratua ou Labuan Bajo : l'itinéraire indonésien qui coûte une décision irremplaçable"
});

console.log(`\n📊 RÉSUMÉ KPI: ${kpiResults.summary.passed} PASS / ${kpiResults.summary.failed} FAIL / ${kpiResults.summary.skipped} SKIP`);
kpiResults.results.forEach(r => {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
  console.log(`   ${icon} ${r.id}: ${r.status} — ${r.reason}`);
});

const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = textOnly.split(/\s+/).length;

console.log('\n────────────────────────────────────────────────────────────────');
console.log('💡 ANALYSE EXPERT MARKETING AFFILIATION:\n');

const widgetCount = (html.match(/fv_widget/g) || []).length;
const affiliateModules = (html.match(/affiliate-module/g) || []).length;
const internalLinks = (html.match(/flashvoyage\.com/g) || []).length;
const blockquotes = (html.match(/<blockquote/g) || []).length;
const h2Count = (html.match(/<h2/g) || []).length;
const hasFaq = /faq|question/i.test(html);
const hasQuickGuide = /quick-guide/i.test(html);

console.log(`   📝 Mots: ${wordCount}`);
console.log(`   📦 Widgets affiliation: ${widgetCount}`);
console.log(`   🔌 Modules affiliés: ${affiliateModules}`);
console.log(`   🔗 Liens internes: ${internalLinks}`);
console.log(`   💬 Citations (blockquotes): ${blockquotes}`);
console.log(`   📋 Sections H2: ${h2Count}`);
console.log(`   ❓ FAQ: ${hasFaq ? 'Oui' : 'Non'}`);
console.log(`   📖 Quick Guide: ${hasQuickGuide ? 'Oui' : 'Non'}`);

console.log('\n════════════════════════════════════════════════════════════════\n');
