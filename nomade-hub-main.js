#!/usr/bin/env node

/**
 * Nomade Hub Main - Script principal pour le hub nomade
 * Point d'entrée pour l'orchestrateur du hub nomade
 */

import NomadeHubOrchestrator from './nomade-hub-orchestrator.js';

async function main() {
  console.log('🎯 DÉMARRAGE DU HUB NOMADE ASIE');
  console.log('=' .repeat(50));
  
  const orchestrator = new NomadeHubOrchestrator();
  
  try {
    const result = await orchestrator.orchestrate();
    
    if (result.success) {
      console.log('\n🎉 HUB NOMADE ASIE CRÉÉ AVEC SUCCÈS !');
      console.log('=' .repeat(50));
      console.log(`📊 Statistiques:`);
      console.log(`   📡 Articles collectés: ${result.stats.totalArticles}`);
      console.log(`   🏠 Pages hub publiées: ${result.stats.publishedHubs}`);
      console.log(`   📝 Articles stratégiques: ${result.stats.publishedArticles}`);
      console.log(`   ⏱️  Durée: ${Math.round((result.stats.endTime - result.stats.startTime) / 60000)} minutes`);
      
      if (result.stats.errors.length > 0) {
        console.log(`\n⚠️ Erreurs: ${result.stats.errors.length}`);
        result.stats.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }
      
      process.exit(0);
    } else {
      console.log('\n💥 ÉCHEC DE LA CRÉATION DU HUB');
      console.log('=' .repeat(50));
      console.log(`❌ Erreur: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 ERREUR FATALE:', error.message);
    process.exit(1);
  }
}

// Gestion des signaux d'arrêt
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt demandé par l\'utilisateur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt demandé par le système...');
  process.exit(0);
});

// Exécuter le script principal
main();
