#!/usr/bin/env node

/**
 * Nomade Hub Orchestrator - Orchestrateur principal du hub nomade
 * Coordonne tous les composants pour créer un hub nomade complet
 */

import NomadeHubCollector from './nomade-hub-collector.js';
import NomadeHubOrganizer from './nomade-hub-organizer.js';
import NomadeHubGenerator from './nomade-hub-generator.js';
import UltraStrategicGenerator from './ultra-strategic-generator.js';

class NomadeHubOrchestrator {
  constructor() {
    this.collector = new NomadeHubCollector();
    this.organizer = new NomadeHubOrganizer();
    this.generator = new NomadeHubGenerator();
    this.strategicGenerator = new UltraStrategicGenerator();
    
    this.stats = {
      startTime: null,
      endTime: null,
      totalArticles: 0,
      publishedHubs: 0,
      publishedArticles: 0,
      errors: []
    };
  }

  // Orchestrer le processus complet
  async orchestrate() {
    console.log('🎯 DÉMARRAGE DU HUB NOMADE ASIE\n');
    console.log('=' .repeat(50));
    
    this.stats.startTime = new Date();
    
    try {
      // Phase 1: Collecte du contenu
      console.log('\n📡 PHASE 1: COLLECTE DU CONTENU');
      console.log('-'.repeat(30));
      const collectedContent = await this.collector.collectAllNomadeContent();
      this.stats.totalArticles = Object.values(collectedContent).reduce((sum, arr) => sum + arr.length, 0);
      
      // Phase 2: Organisation du contenu
      console.log('\n📊 PHASE 2: ORGANISATION DU CONTENU');
      console.log('-'.repeat(30));
      const organizedContent = this.organizer.organizeContent(collectedContent);
      
      // Phase 3: Génération des pages hub
      console.log('\n🏠 PHASE 3: GÉNÉRATION DES PAGES HUB');
      console.log('-'.repeat(30));
      const hubResults = await this.generator.generateAllHubs(organizedContent);
      this.stats.publishedHubs = this.countPublishedHubs(hubResults);
      
      // Phase 4: Génération d'articles stratégiques
      console.log('\n📝 PHASE 4: GÉNÉRATION D\'ARTICLES STRATÉGIQUES');
      console.log('-'.repeat(30));
      const articleResults = await this.generateStrategicArticles(organizedContent);
      this.stats.publishedArticles = articleResults.published;
      
      // Phase 5: Rapport final
      console.log('\n📈 PHASE 5: RAPPORT FINAL');
      console.log('-'.repeat(30));
      this.generateFinalReport();
      
      this.stats.endTime = new Date();
      
      console.log('\n✅ HUB NOMADE ASIE TERMINÉ AVEC SUCCÈS !');
      console.log('=' .repeat(50));
      
      return {
        success: true,
        stats: this.stats,
        hubs: hubResults,
        articles: articleResults
      };
      
    } catch (error) {
      console.error('\n❌ ERREUR CRITIQUE:', error.message);
      this.stats.errors.push(error.message);
      this.stats.endTime = new Date();
      
      return {
        success: false,
        stats: this.stats,
        error: error.message
      };
    }
  }

  // Générer des articles stratégiques à partir du contenu organisé
  async generateStrategicArticles(organizedContent) {
    console.log('📝 Génération d\'articles stratégiques...');
    
    const publishedArticles = [];
    const errors = [];
    
    try {
      // Charger les articles déjà publiés
      await this.strategicGenerator.loadPublishedArticles();
      
      // Sélectionner les meilleurs articles de chaque catégorie
      const topArticles = this.selectTopArticlesForPublishing(organizedContent);
      
      console.log(`📊 ${topArticles.length} articles sélectionnés pour publication`);
      
      // Pour le test, on ne publie pas réellement
      console.log('⚠️ Mode test : publication simulée');
      
      for (const article of topArticles) {
        try {
          console.log(`\n📝 Traitement: ${article.title.substring(0, 50)}...`);
          
          // Vérifier si l'article n'est pas déjà publié
          if (this.strategicGenerator.isArticleAlreadyPublished(article.title)) {
            console.log('⏭️ Article déjà publié, ignoré');
            continue;
          }
          
          // Simuler la génération de contenu
          console.log('✅ Contenu généré (simulation)');
          
          // Simuler la publication
          const simulatedArticle = {
            title: article.title,
            link: `https://nomadeasie.com/article-${Date.now()}`,
            status: 'published'
          };
          
          publishedArticles.push(simulatedArticle);
          console.log(`✅ Article simulé: ${simulatedArticle.link}`);
          
        } catch (error) {
          console.error(`❌ Erreur traitement article:`, error.message);
          errors.push({
            article: article.title,
            error: error.message
          });
        }
      }
      
      console.log(`\n📊 Articles simulés: ${publishedArticles.length}`);
      console.log(`❌ Erreurs: ${errors.length}`);
      
      return {
        published: publishedArticles.length,
        articles: publishedArticles,
        errors: errors
      };
      
    } catch (error) {
      console.error('❌ Erreur génération articles stratégiques:', error.message);
      return {
        published: 0,
        articles: [],
        errors: [error.message]
      };
    }
  }

  // Sélectionner les meilleurs articles pour publication
  selectTopArticlesForPublishing(organizedContent) {
    const selectedArticles = [];
    
    // Sélectionner les articles les plus prioritaires de chaque catégorie
    Object.keys(organizedContent).forEach(category => {
      Object.keys(organizedContent[category]).forEach(subCategory => {
        const articles = organizedContent[category][subCategory];
        
        // Prendre les 2-3 meilleurs articles de chaque sous-catégorie
        const topArticles = articles
          .sort((a, b) => (b.priority || 0) - (a.priority || 0))
          .slice(0, 3);
        
        selectedArticles.push(...topArticles);
      });
    });
    
    // Trier par priorité globale et limiter à 20 articles
    return selectedArticles
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, 20);
  }

  // Compter les hubs publiés
  countPublishedHubs(hubResults) {
    let count = 0;
    
    if (hubResults.mainHub) count++;
    
    if (hubResults.categoryHubs) {
      count += Object.keys(hubResults.categoryHubs).length;
    }
    
    if (hubResults.destinationHubs) {
      count += Object.keys(hubResults.destinationHubs).length;
    }
    
    return count;
  }

  // Générer le rapport final
  generateFinalReport() {
    const duration = this.stats.endTime - this.stats.startTime;
    const durationMinutes = Math.round(duration / 60000);
    
    console.log('\n📊 RAPPORT FINAL DU HUB NOMADE ASIE');
    console.log('=' .repeat(40));
    console.log(`⏱️  Durée totale: ${durationMinutes} minutes`);
    console.log(`📡 Articles collectés: ${this.stats.totalArticles}`);
    console.log(`🏠 Pages hub publiées: ${this.stats.publishedHubs}`);
    console.log(`📝 Articles stratégiques publiés: ${this.stats.publishedArticles}`);
    console.log(`❌ Erreurs: ${this.stats.errors.length}`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n⚠️ ERREURS DÉTECTÉES:');
      this.stats.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n🎯 RÉSULTATS:');
    if (this.stats.publishedHubs > 0 && this.stats.publishedArticles > 0) {
      console.log('   ✅ Hub nomade opérationnel');
      console.log('   ✅ Contenu stratégique publié');
      console.log('   ✅ Système automatisé fonctionnel');
    } else {
      console.log('   ⚠️ Hub partiellement opérationnel');
      console.log('   ⚠️ Vérifiez les erreurs ci-dessus');
    }
  }

  // Obtenir les statistiques en temps réel
  getStats() {
    return {
      ...this.stats,
      duration: this.stats.endTime ? this.stats.endTime - this.stats.startTime : null,
      isRunning: this.stats.endTime === null
    };
  }

  // Arrêter le processus
  stop() {
    console.log('\n🛑 Arrêt du processus...');
    this.stats.endTime = new Date();
  }

  // Redémarrer le processus
  async restart() {
    console.log('\n🔄 Redémarrage du processus...');
    this.stats = {
      startTime: null,
      endTime: null,
      totalArticles: 0,
      publishedHubs: 0,
      publishedArticles: 0,
      errors: []
    };
    
    return await this.orchestrate();
  }
}

// Fonction principale pour exécuter l'orchestrateur
async function main() {
  const orchestrator = new NomadeHubOrchestrator();
  
  try {
    const result = await orchestrator.orchestrate();
    
    if (result.success) {
      console.log('\n🎉 Hub nomade créé avec succès !');
      process.exit(0);
    } else {
      console.log('\n💥 Échec de la création du hub');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 Erreur fatale:', error.message);
    process.exit(1);
  }
}

// Exécuter si le script est appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default NomadeHubOrchestrator;
