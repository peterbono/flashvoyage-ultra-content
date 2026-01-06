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

  async createStrategy(article, maxInternalLinks = 5, maxExternalLinks = 3, linkContext = {}) {
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
        maxInternalLinks,
        article.id || null,
        linkContext
      );
      internalLinks = analysis.suggested_links || [];
    }

    // Phase 2: Liens externes
    console.log('\n📊 PHASE 2: LIENS EXTERNES');
    console.log('==========================\n');
    
    let externalLinks = [];
    if (articleContent) {
      try {
        // Extraire le texte brut depuis le HTML pour la détection
        const plainText = articleContent
          .replace(/<[^>]*>/g, ' ')  // Supprimer les tags HTML
          .replace(/\s+/g, ' ')      // Normaliser les espaces
          .trim();
        
        // Appeler detectOpportunities avec les deux paramètres requis (maintenant async)
        const opportunities = await this.externalDetector.detectOpportunities(
          articleContent,  // HTML pour référence
          plainText        // Texte brut pour analyse
        );
        
        // Convertir les opportunités en format de liens externes
        externalLinks = opportunities.map(opp => ({
          anchor_text: opp.anchor_text,
          url: opp.url,
          relevance_score: this.getRelevanceScore(opp),
          type: opp.type,
          reason: opp.reason
        }));
      } catch (error) {
        console.log('⚠️ Erreur lors de la détection des liens externes:', error.message);
        console.error(error);
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

  /**
   * Convertit une priorité d'opportunité externe en score de pertinence
   */
  getRelevanceScore(opportunity) {
    const priorityScores = {
      'high': 9,
      'medium': 7,
      'low': 5
    };
    return priorityScores[opportunity.priority] || 6;
  }

  async integrateAllLinks(htmlContent, strategyResult, context = {}) {
    console.log('\n🔗 INTÉGRATION DE TOUS LES LIENS');
    console.log('================================\n');

    // Vérifier que htmlContent est une string
    if (typeof htmlContent !== 'string') {
      console.error('❌ htmlContent doit être une string, reçu:', typeof htmlContent);
      return typeof htmlContent === 'object' && htmlContent !== null ? String(htmlContent) : '';
    }

    // Préparer le contexte pour les liens (articleType, destination)
    const linkContext = {
      articleType: context.articleType || (strategyResult.articleType || 'temoignage'),
      destination: context.destination || (strategyResult.destination || '')
    };

    // Intégrer les liens internes
    console.log('📌 Intégration des liens internes...\n');
    const internalResult = await this.linkIntegrator.integrateLinks(
      htmlContent,
      strategyResult.internal_links || [],
      linkContext
    );
    let enrichedContent = internalResult.content || internalResult || htmlContent;

    // Intégrer les liens externes
    console.log('\n📌 Intégration des liens externes...\n');
    const externalResult = await this.linkIntegrator.integrateLinks(
      enrichedContent,
      strategyResult.external_links || [],
      linkContext
    );
    enrichedContent = externalResult.content || externalResult || enrichedContent;

    // Ajouter la section "Articles connexes"
    console.log('\n📚 AJOUT DE LA SECTION "ARTICLES CONNEXES"');
    console.log('==========================================\n');
    
    enrichedContent = this.linkIntegrator.addRelatedArticlesSection(
      enrichedContent,
      strategyResult.internal_links || []
    );

    console.log('\n✅ Liens intégrés avec succès');
    return enrichedContent;
  }
}
