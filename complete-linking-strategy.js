import { SemanticLinkAnalyzer } from './semantic-link-analyzer.js';
import { ContextualLinkIntegrator } from './contextual-link-integrator.js';
import InternalLinksManager from './internal-links-manager.js';
import { ExternalLinksDetector } from './external-links-detector.js';

export class CompleteLinkingStrategy {
  constructor() {
    this.internalAnalyzer = new SemanticLinkAnalyzer();
    this.linkIntegrator = new ContextualLinkIntegrator();
    this.internalManager = new InternalLinksManager();
    this.externalDetector = new ExternalLinksDetector();
  }

  async createStrategy(article, maxInternalLinks = 5, maxExternalLinks = 3) {
    console.log('\n🎯 STRATÉGIE COMPLÈTE DE LIENS');
    console.log('==============================\n');

    // Phase 1: Liens internes
    console.log('📊 PHASE 1: LIENS INTERNES');
    console.log('==========================\n');
    
    // Utiliser semantic-link-analyzer pour les suggestions de liens internes
    const articleContent = article.content || article.text || '';
    const articleTitle = article.title || 'Article sans titre';
    
    let internalLinks = [];
    if (!articleContent) {
      console.log('⚠️ Pas de contenu disponible pour l\'analyse des liens internes');
    } else {
      const analysis = await this.internalAnalyzer.analyzeAndSuggestLinks(
        articleContent,
        articleTitle,
        maxInternalLinks
      );
      internalLinks = analysis.suggested_links || [];
    }

    // Phase 2: Liens externes
    console.log('\n📊 PHASE 2: LIENS EXTERNES');
    console.log('==========================\n');
    
    let externalLinks = [];
    if (articleContent) {
      try {
        externalLinks = await this.externalDetector.detectExternalLinkOpportunities(
          articleContent
        );
      } catch (error) {
        console.log('⚠️ Erreur lors de la détection des liens externes:', error.message);
      }
    }

    // Phase 3: Stratégie globale
    console.log('\n📊 PHASE 3: STRATÉGIE GLOBALE');
    console.log('==============================\n');

    const totalLinks = internalLinks.length + externalLinks.length;
    
    console.log('📋 STRATÉGIE DE LIENS:');
    console.log('======================\n');
    console.log(`  Total de liens suggérés: ${totalLinks}`);
    console.log(`  - Liens internes: ${internalLinks.length}`);
    console.log(`  - Liens externes: ${externalLinks.length}`);
    console.log(`  - Liens Travelpayouts: 0`);

    if (internalLinks.length > 0) {
      console.log('\n🔗 LIENS INTERNES:');
      internalLinks.forEach((link, index) => {
        console.log(`  ${index + 1}. "${link.anchor_text}" → ${link.article_title}`);
      });
    }

    if (externalLinks.length > 0) {
      console.log('\n🔗 LIENS EXTERNES:');
      externalLinks.forEach((link, index) => {
        console.log(`  ${index + 1}. "${link.anchor_text}" → ${link.url}`);
      });
    }

    console.log(`\n✅ Stratégie de liens créée: ${totalLinks} liens suggérés`);
    console.log(`   - Liens internes: ${internalLinks.length}`);
    console.log(`   - Liens externes: ${externalLinks.length}`);

    return {
      internal_links: internalLinks,
      external_links: externalLinks,
      total_links: totalLinks,
      breakdown: {
        internal: internalLinks.length,
        external: externalLinks.length
      }
    };
  }

  integrateAllLinks(htmlContent, strategyResult) {
    console.log('\n🔗 INTÉGRATION DE TOUS LES LIENS');
    console.log('================================\n');

    // Intégrer les liens internes
    console.log('📌 Intégration des liens internes...\n');
    let enrichedContent = this.linkIntegrator.integrateLinks(
      htmlContent,
      strategyResult.internal_links
    );

    // Intégrer les liens externes
    console.log('\n📌 Intégration des liens externes...\n');
    enrichedContent = this.linkIntegrator.integrateLinks(
      enrichedContent,
      strategyResult.external_links
    );

    // Ajouter la section "Articles connexes"
    console.log('\n📚 AJOUT DE LA SECTION "ARTICLES CONNEXES"');
    console.log('==========================================\n');
    
    enrichedContent = this.linkIntegrator.addRelatedArticlesSection(
      enrichedContent,
      strategyResult.internal_links
    );

    console.log('\n✅ Liens intégrés avec succès');
    return enrichedContent;
  }
}
