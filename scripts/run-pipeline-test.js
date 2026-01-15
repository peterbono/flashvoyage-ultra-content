#!/usr/bin/env node

/**
 * Script de test pour exécuter le pipeline complet
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import PipelineRunner from '../pipeline-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger une fixture Reddit
function loadRedditFixture() {
  try {
    const fixturePath = join(__dirname, '..', 'data', 'fixtures', 'reddit-digitalnomad.json');
    const fixtureContent = readFileSync(fixturePath, 'utf-8');
    const fixtures = JSON.parse(fixtureContent);
    
    // Prendre le premier article de la fixture
    const fixture = Array.isArray(fixtures) ? fixtures[0] : fixtures;
    
    // Normaliser la structure pour le pipeline
    return {
      post: {
        title: fixture.title || fixture.post?.title || '',
        selftext: fixture.selftext || fixture.post?.selftext || fixture.body || fixture.content || '',
        author: fixture.author || fixture.post?.author || null,
        url: fixture.url || fixture.post?.url || null,
        subreddit: fixture.subreddit || fixture.post?.subreddit || 'digitalnomad',
        created_utc: fixture.created_utc || fixture.post?.created_utc || Date.now() / 1000
      },
      comments: fixture.comments || [],
      geo: fixture.geo || {},
      source: fixture.source || {}
    };
  } catch (error) {
    console.error(`❌ Erreur chargement fixture: ${error.message}`);
    // Retourner une fixture minimale pour les tests
    return {
      post: {
        title: 'After 10 years of dreaming, we\'re finally living the digital nomad life in Asia',
        selftext: 'My partner and I finally made the jump! We\'re currently in Chiang Mai, Thailand, and it\'s been amazing. The cost of living is so much lower, the food is incredible, and the nomad community here is welcoming. Happy to answer any questions! We\'ve been here for 3 months now and plan to stay at least another 6 months. The internet is reliable, coworking spaces are affordable ($50-100/month), and we\'ve met so many amazing people.',
        author: 'nomad_dreams',
        url: 'https://reddit.com/r/digitalnomad/comments/test',
        subreddit: 'digitalnomad',
        created_utc: Date.now() / 1000
      },
      comments: [],
      geo: { country: 'thailand', city: 'chiang mai' },
      source: {}
    };
  }
}

// Main
async function main() {
  console.log('🚀 Lancement du pipeline FlashVoyage\n');
  
  // S'assurer que les flags sont activés
  process.env.FORCE_OFFLINE = '1';
  process.env.FLASHVOYAGE_DRY_RUN = '1';
  
  const runner = new PipelineRunner();
  const input = loadRedditFixture();
  
  console.log('📋 Input Reddit:');
  console.log(`   Titre: ${input.post.title}`);
  console.log(`   Auteur: ${input.post.author}`);
  console.log(`   Subreddit: ${input.post.subreddit}`);
  console.log(`   Contenu: ${input.post.selftext.substring(0, 100)}...\n`);
  
  const report = await runner.runPipeline(input);
  
  console.log('\n📊 RÉSUMÉ DU PIPELINE:');
  console.log('====================');
  console.log(`✅ Succès: ${report.success ? 'OUI' : 'NON'}`);
  console.log(`🚫 Bloquant: ${report.blocking ? 'OUI' : 'NON'}`);
  if (report.blockingReasons && report.blockingReasons.length > 0) {
    console.log(`   Raisons: ${report.blockingReasons.join(', ')}`);
  }
  console.log(`⏱️  Durée: ${report.metrics.duration}ms`);
  console.log(`📝 Étapes exécutées: ${Object.keys(report.steps).length}`);
  
  console.log('\n📋 DÉTAILS DES ÉTAPES:');
  for (const [stepName, stepData] of Object.entries(reportObj.steps || {})) {
    const status = stepData.success ? '✅' : '❌';
    const timing = stepData.timing ? `${stepData.timing.duration}ms` : 'N/A';
    console.log(`   ${status} ${stepName}: ${stepData.status} (${timing})`);
    if (stepData.issues && stepData.issues.length > 0) {
      console.log(`      Issues: ${stepData.issues.length}`);
    }
  }
  
  if (reportObj.errors && reportObj.errors.length > 0) {
    console.log('\n❌ ERREURS:');
    reportObj.errors.forEach(err => {
      console.log(`   - [${err.step}] ${err.message}`);
    });
  }
  
  if (reportObj.finalArticle) {
    console.log('\n📄 ARTICLE FINAL:');
    console.log(`   Titre: ${reportObj.finalArticle.title}`);
    console.log(`   Longueur contenu: ${reportObj.finalArticle.contentLength} chars`);
    if (reportObj.finalArticle.qaReport) {
      console.log(`   QA Status: ${reportObj.finalArticle.qaReport.status}`);
      console.log(`   QA Checks: ${reportObj.finalArticle.qaReport.checks}`);
      console.log(`   QA Issues: ${reportObj.finalArticle.qaReport.issues}`);
    }
  }
  
  // Sauvegarder le rapport JSON
  const fs = await import('fs');
  const reportPath = join(__dirname, '..', 'pipeline-report-output.json');
  const reportJson = report.toJSON ? report.toJSON() : JSON.stringify(reportObj, null, 2);
  fs.writeFileSync(reportPath, reportJson);
  console.log(`\n💾 Rapport sauvegardé dans: ${reportPath}`);
  
  process.exit(reportObj.success && !reportObj.blocking ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
