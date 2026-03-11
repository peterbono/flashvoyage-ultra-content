#!/usr/bin/env node

/**
 * COMPARAISON QUALITÉ MULTI-MODÈLES
 * Génère le même article avec différents LLM et compare la qualité
 */

import { createChatCompletion } from '../openai-client.js';
import { createClaudeCompletion, isAnthropicAvailable } from '../anthropic-client.js';
import { runAllKPITests } from '../tests/kpi-quality.test.js';
import QualityAnalyzer from '../quality-analyzer.js';
import fs from 'fs';
import path from 'path';

const TEST_SOURCE = {
  title: "Living in Chiang Mai on $1000/month - My 6-month experience",
  subreddit: "digitalnomad",
  selftext: `After 6 months in Chiang Mai, here's my real budget breakdown. I spent around $1000/month total which is higher than the famous "$500/month" but way more comfortable.

Accommodation: $350/month for a modern studio in Nimman area with pool and gym. You can find cheaper ($150-200) in the old city but I valued the amenities.

Food: $250/month. Mix of street food (30-50 baht), local restaurants (80-150 baht) and occasional western food. Cooking at home is hard without a proper kitchen.

Coworking: $100/month at Punspace. Essential for productivity - the cafes get old fast. WiFi is 50-100mbps.

Transport: $50/month renting a Honda Click scooter. Grab is expensive compared to having your own wheels.

Health insurance: $80/month with SafetyWing. Had to use it once for food poisoning - process was smooth.

Entertainment/misc: $170/month. Weekend trips to Pai, massages, occasional bars.

Visa: Did the border run to Laos every 60 days, $50 each time including transport.

The "$500/month" people either live very basically, don't have insurance, or are lying. $800-1200 is realistic for a comfortable digital nomad lifestyle.

Pro tips:
- Get a Thai bank account (Bangkok Bank) - saves on ATM fees
- Use Wise for international transfers
- The AQI in burning season (Feb-April) is brutal - consider leaving
- Learn basic Thai - locals appreciate it

Would I recommend it? Yes, but don't expect luxury on a backpacker budget.`,
  comments: [
    { author: "nomad_mike", text: "Totally agree on the $500 myth. I tried that for 2 months and was miserable. $900-1000 is the sweet spot." },
    { author: "thai_expert", text: "The AQI warning is crucial. I got bronchitis last March. Now I go to the islands during burning season." },
    { author: "budget_traveler", text: "You can definitely do $600 if you cook and skip coworking. But your quality of life suffers." }
  ]
};

const SYSTEM_PROMPT_BASE = `Tu es un rédacteur expert pour FlashVoyages.com, spécialisé dans le nomadisme digital en Asie.

RÈGLES STRICTES:
1. Écris UNIQUEMENT en français
2. Tutoiement obligatoire
3. Ton expert mais accessible
4. Chaque paragraphe doit contenir un fait, un chiffre, ou une recommandation
5. Minimum 1500 mots
6. Structure: Introduction hook → Sections H2 avec arbitrages → Conclusion actionnable

SECTIONS OBLIGATOIRES:
- H2 "Ce que les autres guides ne disent pas"
- H2 "Les erreurs fréquentes à éviter"
- H2 "Limites et biais de cet article"

INTERDITS:
- Phrases vides type "il est important de"
- Paragraphes purement descriptifs sans prise de position
- H2 génériques ("Conseils", "Budget", "Transport")

FORMAT: HTML avec <h2>, <h3>, <p>, <ul>`;

const USER_PROMPT = `Rédige un article complet basé sur ce témoignage Reddit:

**Titre:** ${TEST_SOURCE.title}
**Subreddit:** r/${TEST_SOURCE.subreddit}

**Témoignage:**
${TEST_SOURCE.selftext}

**Commentaires communauté:**
${TEST_SOURCE.comments.map(c => `- ${c.author}: "${c.text}"`).join('\n')}

Génère l'article HTML complet en français.`;

async function generateWithModel(modelConfig) {
  const { name, model, provider, maxTokens } = modelConfig;
  console.log(`\n🚀 Génération avec ${name}...`);
  const startTime = Date.now();
  
  try {
    let response;
    
    if (provider === 'openai') {
      response = await createChatCompletion({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_BASE },
          { role: 'user', content: USER_PROMPT }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      }, 3, `compare-${name}`);
    } else if (provider === 'anthropic') {
      response = await createClaudeCompletion({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_BASE },
          { role: 'user', content: USER_PROMPT }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      }, 3, `compare-${name}`);
    }
    
    const content = response.choices[0]?.message?.content || '';
    const duration = Date.now() - startTime;
    const wordCount = content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
    
    console.log(`   ✅ ${name}: ${wordCount} mots en ${(duration/1000).toFixed(1)}s`);
    
    return {
      name,
      model,
      content,
      wordCount,
      duration,
      usage: response.usage,
      success: true
    };
  } catch (error) {
    console.error(`   ❌ ${name}: ${error.message}`);
    return { name, model, success: false, error: error.message };
  }
}

async function analyzeQuality(result) {
  if (!result.success) return null;
  
  const qa = new QualityAnalyzer();
  const htmlWithTitle = `<h1>${TEST_SOURCE.title}</h1>\n${result.content}`;
  const score = qa.getGlobalScore(htmlWithTitle, 'evergreen');
  
  const kpiResults = await runAllKPITests(result.content, {
    angleHook: 'budget Chiang Mai nomade digital coût vie',
    allowedNumberTokens: ['1000', '350', '250', '100', '50', '80', '170', '500', '800', '1200', '6', '60', '30', '150', '200'],
    editorialMode: 'evergreen',
    title: TEST_SOURCE.title
  });
  
  return {
    globalScore: parseFloat(score.globalScore),
    categories: {
      serp: score.categories.serp.percentage,
      links: score.categories.links.percentage,
      contentWriting: score.categories.contentWriting.percentage,
      blocking: score.categories.blocking.percentage
    },
    blockingPassed: score.blockingPassed,
    kpi: kpiResults.summary
  };
}

function expertReview(results) {
  console.log('\n' + '═'.repeat(80));
  console.log('📊 REVIEW EXPERT MARKETING CONTENT AFFILIATION (10 ans exp.)');
  console.log('═'.repeat(80));
  
  const validResults = results.filter(r => r.success && r.quality);
  
  if (validResults.length === 0) {
    console.log('❌ Aucun résultat valide à analyser');
    return;
  }
  
  // Classement par score global
  validResults.sort((a, b) => b.quality.globalScore - a.quality.globalScore);
  
  console.log('\n📈 CLASSEMENT QUALITÉ:\n');
  validResults.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    const costPer1kWords = r.usage ? 
      ((r.usage.prompt_tokens * 2.5 + r.usage.completion_tokens * 10) / 1000000 / r.wordCount * 1000).toFixed(4) : 'N/A';
    
    console.log(`${medal} ${r.name}`);
    console.log(`   Score global: ${r.quality.globalScore.toFixed(1)}%`);
    console.log(`   Mots: ${r.wordCount} | Durée: ${(r.duration/1000).toFixed(1)}s`);
    console.log(`   KPI: ${r.quality.kpi.passed} PASS / ${r.quality.kpi.failed} FAIL / ${r.quality.kpi.skipped} SKIP`);
    console.log(`   SERP: ${r.quality.categories.serp.toFixed(0)}% | Content: ${r.quality.categories.contentWriting.toFixed(0)}% | Blocking: ${r.quality.blockingPassed ? '✅' : '❌'}`);
    console.log(`   Tokens: ${r.usage?.total_tokens || 'N/A'} | Coût estimé: $${costPer1kWords}/1k mots`);
    console.log('');
  });
  
  // Analyse expert
  console.log('─'.repeat(80));
  console.log('💡 ANALYSE EXPERT:\n');
  
  const best = validResults[0];
  const cheapest = validResults.reduce((a, b) => {
    const costA = a.usage ? a.usage.total_tokens : Infinity;
    const costB = b.usage ? b.usage.total_tokens : Infinity;
    return costA < costB ? a : b;
  });
  
  console.log(`• MEILLEURE QUALITÉ: ${best.name} (${best.quality.globalScore.toFixed(1)}%)`);
  console.log(`  → Recommandé pour: Articles piliers, contenus à fort enjeu SEO`);
  console.log('');
  
  console.log(`• MEILLEUR RAPPORT QUALITÉ/COÛT: ${cheapest.name}`);
  console.log(`  → Recommandé pour: Volume, articles secondaires, brouillons`);
  console.log('');
  
  // Recommandation stratégique
  console.log('📋 RECOMMANDATION STRATÉGIQUE:');
  console.log('');
  
  if (best.name === cheapest.name) {
    console.log(`   ✅ ${best.name} est optimal sur les deux critères.`);
    console.log('   → Utiliser ce modèle pour toute la production.');
  } else {
    console.log('   STRATÉGIE HYBRIDE RECOMMANDÉE:');
    console.log(`   • Génération principale (evergreen, piliers): ${best.name}`);
    console.log(`   • Tâches secondaires (translate, improve): ${cheapest.name}`);
    console.log(`   • Économie estimée: 40-60% sur le coût total`);
  }
  
  console.log('\n' + '═'.repeat(80));
  
  return {
    ranking: validResults.map(r => ({ name: r.name, score: r.quality.globalScore })),
    bestQuality: best.name,
    bestValue: cheapest.name,
    recommendation: best.name === cheapest.name ? 'single' : 'hybrid'
  };
}

async function main() {
  console.log('═'.repeat(80));
  console.log('🔬 TEST COMPARATIF MULTI-MODÈLES - FlashVoyages Content Pipeline');
  console.log('═'.repeat(80));
  console.log(`\n📄 Source: "${TEST_SOURCE.title}"\n`);
  
  const models = [
    { name: 'GPT-4o', model: 'gpt-4o', provider: 'openai', maxTokens: 8000 },
    { name: 'GPT-4o-mini', model: 'gpt-4o-mini', provider: 'openai', maxTokens: 8000 }
  ];
  
  // Ajouter Claude si disponible
  if (isAnthropicAvailable()) {
    models.push({ name: 'Claude-Haiku-4.5', model: 'claude-haiku-4-5-20251001', provider: 'anthropic', maxTokens: 8000 });
  } else {
    console.log('⚠️ Claude non disponible (ANTHROPIC_API_KEY non configurée)\n');
  }
  
  // Génération parallèle
  console.log('🚀 Lancement des générations en parallèle...');
  const generationPromises = models.map(m => generateWithModel(m));
  const results = await Promise.all(generationPromises);
  
  // Analyse qualité
  console.log('\n📊 Analyse qualité...');
  for (const result of results) {
    if (result.success) {
      result.quality = await analyzeQuality(result);
    }
  }
  
  // Review expert
  const review = expertReview(results);
  
  // Sauvegarder les résultats
  const outputPath = path.join(process.cwd(), 'data', 'model-comparison-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    source: TEST_SOURCE.title,
    results: results.map(r => ({
      name: r.name,
      model: r.model,
      success: r.success,
      wordCount: r.wordCount,
      duration: r.duration,
      usage: r.usage,
      quality: r.quality,
      error: r.error
    })),
    review
  }, null, 2));
  
  console.log(`\n💾 Résultats sauvegardés: ${outputPath}`);
  
  // Sauvegarder les contenus générés pour review manuelle
  for (const result of results.filter(r => r.success)) {
    const contentPath = path.join(process.cwd(), 'data', `generated-${result.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.html`);
    fs.writeFileSync(contentPath, result.content);
    console.log(`📄 Contenu ${result.name}: ${contentPath}`);
  }
}

main().catch(console.error);
