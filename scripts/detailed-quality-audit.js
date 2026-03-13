#!/usr/bin/env node
import fs from 'fs';

const articlePath = process.argv[2] || '/tmp/last-generated-article.html';
const html = fs.readFileSync(articlePath, 'utf-8');
const { default: QualityAnalyzer } = await import('../quality-analyzer.js');

const qa = new QualityAnalyzer();
const title = "Maratua vs Maldives pour une lune de miel : arbitrer entre authenticité et logistique";
const wrappedHtml = `<h1>${title}</h1>\n${html}`;

const score = qa.getGlobalScore(wrappedHtml, 'evergreen', null);

console.log(`\n📊 SCORE GLOBAL: ${score.globalScore}% (seuil: ${score.threshold}%) [${articlePath}]\n`);

for (const [catName, cat] of Object.entries(score.categories)) {
  const lost = cat.maxScore - cat.score;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📦 ${catName.toUpperCase()}: ${cat.score}/${cat.maxScore} (${cat.percentage?.toFixed(1)}%) — ${lost > 0 ? `${lost} pts perdus` : '✅ PARFAIT'}`);
  console.log(`${'═'.repeat(60)}`);
  
  if (cat.details && Array.isArray(cat.details)) {
    cat.details.forEach(d => {
      const pts = d.points || 0;
      const icon = pts >= 10 ? '✅' : pts > 0 ? '⚠️' : '❌';
      console.log(`   ${icon} ${d.check}: ${d.status} (${pts} pts)`);
    });
  }
  
  if (cat.checks && Array.isArray(cat.checks)) {
    cat.checks.forEach(c => {
      const icon = c.passed ? '✅' : '❌';
      console.log(`   ${icon} ${c.check}: ${c.passed ? 'PASS' : 'FAIL'}${c.ratio ? ` (${c.ratio})` : ''}`);
    });
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`📋 RÉSUMÉ: POINTS PERDUS POUR ATTEINDRE 100%`);
console.log(`${'═'.repeat(60)}\n`);

let totalLost = 0;
for (const [catName, cat] of Object.entries(score.categories)) {
  if (cat.details) {
    cat.details.filter(d => (d.points || 0) < 0 || d.status === 'MISSING' || d.status?.includes('< ')).forEach(d => {
      console.log(`   ⚡ ${catName}/${d.check}: ${d.status} (${d.points} pts)`);
    });
  }
  
  if (catName === 'links' || catName === 'contentWriting') {
    const lost = cat.maxScore - cat.score;
    if (lost > 0) {
      totalLost += lost;
      console.log(`   → ${catName}: -${lost} pts raw (poids ${cat.weight * 100}% → -${(lost * cat.weight).toFixed(1)} pts pondérés)`);
    }
  }
}
console.log(`\n   Score actuel: ${score.globalScore}% — Il manque ${(100 - parseFloat(score.globalScore)).toFixed(1)} pts pour 100%\n`);
