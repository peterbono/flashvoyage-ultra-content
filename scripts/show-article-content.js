#!/usr/bin/env node

/**
 * Script pour afficher le contenu de l'article généré
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
    const fixture = Array.isArray(fixtures) ? fixtures[0] : fixtures;
    
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
    return null;
  }
}

// Main
async function main() {
  process.env.FORCE_OFFLINE = '1';
  process.env.FLASHVOYAGE_DRY_RUN = '1';
  process.env.ENABLE_ANTI_HALLUCINATION_BLOCKING = '0';
  
  const runner = new PipelineRunner();
  const input = loadRedditFixture();
  
  if (!input) {
    console.error('❌ Impossible de charger la fixture');
    process.exit(1);
  }
  
  console.log('🚀 Génération de l\'article...\n');
  
  const report = await runner.runPipeline(input);
  const reportObj = report.getReport ? report.getReport() : report;
  
  if (reportObj.finalArticle) {
    console.log('\n' + '='.repeat(80));
    console.log('📄 CONTENU DE L\'ARTICLE GÉNÉRÉ');
    console.log('='.repeat(80));
    console.log(`\n📌 Titre: ${reportObj.finalArticle.title || 'N/A'}`);
    console.log(`📏 Longueur: ${reportObj.finalArticle.contentLength || 0} caractères`);
    console.log(`✅ QA Status: ${reportObj.finalArticle.qaReport?.status || 'N/A'}`);
    console.log(`🔍 Anti-Hallucination: ${reportObj.finalArticle.antiHallucinationReport?.status || 'N/A'}`);
    
    // Récupérer le contenu HTML depuis le pipeline
    let htmlContent = null;
    
    // Essayer depuis finalArticle.content
    if (reportObj.finalArticle?.content) {
      htmlContent = reportObj.finalArticle.content;
    }
    // Essayer depuis les steps finalizer
    else if (reportObj.steps?.['finalizer']?.debug?.finalHtml) {
      htmlContent = reportObj.steps.finalizer.debug.finalHtml;
    }
    // Essayer depuis les steps finalizer data
    else if (reportObj.steps?.['finalizer']?.data?.finalHtml) {
      htmlContent = reportObj.steps.finalizer.data.finalHtml;
    }
    
    if (htmlContent) {
      console.log('\n' + '-'.repeat(80));
      console.log('📝 CONTENU HTML:');
      console.log('-'.repeat(80));
      console.log(htmlContent);
      console.log('\n' + '-'.repeat(80));
    } else {
      console.log('\n⚠️ Contenu HTML non disponible dans le rapport');
      console.log('🔍 Debug: finalArticle keys:', Object.keys(reportObj.finalArticle || {}));
      if (reportObj.steps?.['finalizer']) {
        console.log('🔍 Debug: finalizer keys:', Object.keys(reportObj.steps.finalizer));
      }
    }
  } else {
    console.log('\n❌ Aucun article final généré');
    console.log('📊 Rapport:', JSON.stringify(reportObj, null, 2));
  }
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
