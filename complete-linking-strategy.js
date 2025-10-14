#!/usr/bin/env node

/**
 * STRATÉGIE COMPLÈTE DE LIENS (INTERNES + EXTERNES)
 * Combine liens internes, externes officiels, et Travelpayouts
 */

import { SemanticLinkAnalyzer } from './semantic-link-analyzer.js';
import { ExternalLinksDetector } from './external-links-detector.js';
import { ContextualLinkIntegrator } from './contextual-link-integrator.js';
import { OPENAI_API_KEY } from './config.js';

export class CompleteLinkingStrategy {
  constructor() {
    this.internalAnalyzer = new SemanticLinkAnalyzer(OPENAI_API_KEY);
    this.externalDetector = new ExternalLinksDetector();
    this.integrator = new ContextualLinkIntegrator();
  }

  /**
   * Stratégie complète de liens
   * @param {string} content - Contenu HTML
   * @param {string} title - Titre de l'article
   * @param {number} articleId - ID de l'article (pour exclure des liens internes)
   * @returns {Object} - Stratégie complète avec tous les liens
   */
  async createStrategy(content, title, articleId = null) {
    console.log('\n🎯 STRATÉGIE COMPLÈTE DE LIENS');
    console.log('==============================\n');

    // 1. Analyser les liens internes (3-5 max)
    console.log('📊 PHASE 1: LIENS INTERNES');
    console.log('==========================\n');

    this.internalAnalyzer.loadArticlesDatabase('articles-database.json');
    const internalAnalysis = await this.internalAnalyzer.analyzeAndSuggestLinks(
      content,
      title,
      5, // Max 5 liens internes
      articleId
    );

    console.log(`✅ ${internalAnalysis.suggested_links.length} liens internes suggérés\n`);

    // 2. Détecter les liens externes (5-8 max)
    console.log('📊 PHASE 2: LIENS EXTERNES');
    console.log('==========================\n');

    const plainText = content.replace(/<[^>]*>/g, ' ');
    const externalSuggestions = this.externalDetector.suggestLinks(content, plainText, 8);

    console.log(`✅ ${externalSuggestions.length} liens externes suggérés\n`);

    // 3. Créer la stratégie globale
    console.log('📊 PHASE 3: STRATÉGIE GLOBALE');
    console.log('==============================\n');

    const strategy = {
      internal_links: internalAnalysis.suggested_links,
      external_links: externalSuggestions,
      total_links: internalAnalysis.suggested_links.length + externalSuggestions.length,
      breakdown: {
        internal: internalAnalysis.suggested_links.length,
        external: externalSuggestions.length,
        travelpayouts: 0 // À implémenter si besoin
      }
    };

    // 4. Afficher le résumé
    this.displayStrategy(strategy);

    return strategy;
  }

  /**
   * Intègre tous les liens dans le contenu
   * @param {string} content - Contenu HTML
   * @param {Object} strategy - Stratégie de liens
   * @returns {string} - Contenu avec tous les liens intégrés
   */
  integrateAllLinks(content, strategy) {
    console.log('\n🔗 INTÉGRATION DE TOUS LES LIENS');
    console.log('================================\n');

    let updatedContent = content;

    // 1. Intégrer les liens internes
    console.log('📌 Intégration des liens internes...\n');
    const internalResult = this.integrator.integrateLinks(updatedContent, strategy.internal_links);
    updatedContent = internalResult.content;

    console.log(`✅ ${internalResult.stats.integrated} liens internes intégrés\n`);

    // 2. Intégrer les liens externes
    console.log('📌 Intégration des liens externes...\n');
    const externalResult = this.integrator.integrateLinks(updatedContent, strategy.external_links);
    updatedContent = externalResult.content;

    console.log(`✅ ${externalResult.stats.integrated} liens externes intégrés\n`);

    // 3. Ajouter la section "Articles connexes" (seulement liens internes)
    updatedContent = this.integrator.addRelatedArticlesSection(updatedContent, strategy.internal_links, 3);

    // 4. Résumé final
    const finalLinkCount = this.integrator.countLinks(updatedContent);
    console.log('📊 RÉSUMÉ FINAL:');
    console.log('===============\n');
    console.log(`  Liens internes intégrés: ${internalResult.stats.integrated}`);
    console.log(`  Liens externes intégrés: ${externalResult.stats.integrated}`);
    console.log(`  Section "Articles connexes": Oui`);
    console.log(`  Total de liens: ${finalLinkCount}\n`);

    return updatedContent;
  }

  /**
   * Affiche la stratégie
   */
  displayStrategy(strategy) {
    console.log('📋 STRATÉGIE DE LIENS:');
    console.log('======================\n');

    console.log(`  Total de liens suggérés: ${strategy.total_links}`);
    console.log(`  - Liens internes: ${strategy.breakdown.internal}`);
    console.log(`  - Liens externes: ${strategy.breakdown.external}`);
    console.log(`  - Liens Travelpayouts: ${strategy.breakdown.travelpayouts}\n`);

    // Afficher les liens internes
    if (strategy.internal_links.length > 0) {
      console.log('🔗 LIENS INTERNES:');
      strategy.internal_links.forEach((link, i) => {
        console.log(`  ${i + 1}. "${link.anchor_text}" → ${link.article_title.substring(0, 50)}...`);
      });
      console.log('');
    }

    // Afficher les liens externes
    if (strategy.external_links.length > 0) {
      console.log('🌐 LIENS EXTERNES:');
      strategy.external_links.forEach((link, i) => {
        console.log(`  ${i + 1}. "${link.anchor_text}" → ${link.url}`);
        console.log(`     Type: ${link.type}, Priorité: ${link.priority}`);
      });
      console.log('');
    }
  }
}

export default CompleteLinkingStrategy;
