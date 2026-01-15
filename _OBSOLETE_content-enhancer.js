#!/usr/bin/env node

import TravelpayoutsWidgetManager from './travelpayouts-widget-manager.js';
import InternalLinksManager from './internal-links-manager.js';

class ContentEnhancer {
  constructor() {
    this.widgetManager = new TravelpayoutsWidgetManager();
    this.linksManager = new InternalLinksManager();
  }

  // Améliorer le contenu avec widgets et liens internes
  async enhanceContent(content, analysis, articleId = null) {
    try {
      console.log('🔧 Amélioration du contenu avec widgets et liens internes...');
      
      // Ajouter l'ID de l'article à l'analyse pour éviter l'auto-référence
      if (articleId) {
        analysis.articleId = articleId;
      }

      // 1. Analyser et ajouter les widgets Travelpayouts
      const widgets = this.widgetManager.analyzeContentForWidgets(content, analysis);
      const widgetsHTML = this.widgetManager.generateWidgetsHTML(widgets);
      
      // 2. Trouver et ajouter les liens internes pertinents
      const internalLinks = await this.linksManager.findRelevantInternalLinks(content, analysis);
      const linksHTML = this.linksManager.generateInternalLinksHTML(internalLinks);
      
      // 3. Intégrer les améliorations dans le contenu
      const enhancedContent = this.integrateEnhancements(content, widgetsHTML, linksHTML);
      
      // 4. Valider les améliorations
      const validation = this.validateEnhancements(enhancedContent, widgets, internalLinks);
      
      console.log('✅ Contenu amélioré:', {
        widgets: widgets.length,
        internalLinks: internalLinks.length,
        validation: validation
      });
      
      return {
        content: enhancedContent,
        widgets: widgets,
        internalLinks: internalLinks,
        validation: validation
      };

    } catch (error) {
      console.error('❌ Erreur amélioration contenu:', error.message);
      return {
        content: content,
        widgets: [],
        internalLinks: [],
        validation: { score: 0, issues: ['Erreur lors de l\'amélioration'] }
      };
    }
  }

  // Intégrer les améliorations dans le contenu
  integrateEnhancements(content, widgetsHTML, linksHTML) {
    let enhancedContent = content;
    
    // DÉSACTIVÉ: Ne plus ajouter de section "Outils recommandés" en fin d'article
    // Le placement contextuel intelligent (ContextualWidgetPlacer) gère maintenant
    // l'insertion des widgets dans le flow du contenu avec accroches style TPG
    
    // Ajouter les liens internes si pas déjà présents
    // (La section "Articles connexes" est gérée par contextual-link-integrator.js)
    if (linksHTML && !enhancedContent.includes('Articles connexes')) {
      enhancedContent += '\n\n' + linksHTML;
    }
    
    return enhancedContent;
  }

  /**
   * 1. Détection unique des widgets rendus (même logique que article-finalizer)
   */
  detectRenderedWidgets(html) {
    const detected = {
      count: 0,
      types: [],
      details: []
    };

    // Marqueurs robustes pour widget FLIGHTS Kiwi.com
    const kiwiMarkers = [
      /<form[^>]*kiwi[^>]*>/gi,
      /<form[^>]*travelpayouts[^>]*>/gi,
      /data-widget-type=["']flights["']/gi,
      /class=["'][^"']*kiwi[^"']*["']/gi,
      /class=["'][^"']*travelpayouts[^"']*["']/gi,
      /trpwdg\.com\/content/gi,
      /travelpayouts-widget/gi,
      /kiwi\.com.*widget/gi,
      /<!-- FLASHVOYAGE_WIDGET:flights/gi,
      /<!-- FLASHVOYAGE_WIDGET:fallback/gi
    ];

    // Marqueurs textuels (moins fiables mais fallback)
    const textMarkers = [
      /Selon notre analyse de milliers de vols/gi,
      /D'après notre expérience avec des centaines de nomades/gi,
      /Notre partenaire Kiwi\.com/gi,
      /Notre outil compare les prix/gi
    ];

    // Détecter marqueurs HTML robustes
    for (const marker of kiwiMarkers) {
      const matches = html.match(marker);
      if (matches) {
        detected.count += matches.length;
        if (!detected.types.includes('flights')) {
          detected.types.push('flights');
        }
      }
    }

    // Si aucun marqueur HTML trouvé, fallback sur textuels
    if (detected.count === 0) {
      for (const marker of textMarkers) {
        const matches = html.match(marker);
        if (matches) {
          detected.count += matches.length;
          if (!detected.types.includes('flights')) {
            detected.types.push('flights');
          }
        }
      }
    }

    return detected;
  }

  // Valider les améliorations
  validateEnhancements(content, widgets, internalLinks, widgetsRendered = null) {
    const issues = [];
    let score = 100;
    
    // FIX 1: NE PAS appeler detectRenderedWidgets ici (HTML partiel)
    // La détection sera faite UNE SEULE FOIS après finalisation complète dans enhanced-ultra-generator
    // Cette validation est informelle uniquement (pas de détection HTML)
    
    // Validation basée sur widgets planifiés uniquement (informatif)
    const widgetValidation = {
      score: widgets.length >= 1 ? 100 : 0,
      present: widgets.map(w => w.slot),
      count: widgets.length
    };
    
    if (widgets.length === 0) {
      // Informatif uniquement, pas de pénalité ici (détection finale fera le vrai check)
      console.log(`   ℹ️ Widgets planifiés: 0 (détection finale après injection)`);
    }
    
    // FIX 3: Liens internes = bonus SEO, jamais prérequis
    // Ne jamais pénaliser pour 0 lien interne
    const linksValidation = this.linksManager.validateInternalLinks(content);
    if (linksValidation.internal > 0) {
      console.log(`   ✅ Liens internes détectés: ${linksValidation.internal} (bonus SEO)`);
    } else {
      console.log(`   ℹ️ Aucun lien interne (acceptable, bonus SEO uniquement)`);
    }
    // SUPPRIMÉ: pénalité pour liens internes insuffisants
    
    // Vérifier la structure du contenu
    if (!content.includes('<h2>') && !content.includes('<h3>')) {
      issues.push('Structure H2/H3 manquante');
      score -= 10;
    }
    
    // Vérifier la présence de CTA
    if (!content.includes('Découvrez') && !content.includes('En savoir plus')) {
      issues.push('CTA manquant');
      score -= 5;
    }
    
    return {
      score: Math.max(score, 0),
      issues: issues,
      widgets: widgetValidation || { score: 0, present: [], count: 0 }, // FIX A: Fallback safe
      links: linksValidation
    };
  }

  // Optimiser le contenu pour la monétisation
  optimizeForMonetization(content, analysis) {
    let optimizedContent = content;
    
    // Ajouter des CTA contextuels
    const cta = this.generateContextualCTA(analysis);
    if (cta && !optimizedContent.includes(cta)) {
      optimizedContent += '\n\n' + cta;
    }
    
    // Optimiser les widgets selon le contexte
    const optimizedWidgets = this.widgetManager.optimizeWidgetsForContext(
      this.widgetManager.analyzeContentForWidgets(content, analysis),
      {
        destination: analysis.destination,
        audience: analysis.audience,
        type: analysis.type_contenu
      }
    );
    
    return {
      content: optimizedContent,
      widgets: optimizedWidgets
    };
  }

  // Générer un CTA contextuel
  generateContextualCTA(analysis) {
    const ctaTemplates = {
      'TEMOIGNAGE_SUCCESS_STORY': 'Prêt à vivre votre propre succès en {destination} ? Découvrez nos guides pratiques et rejoignez la communauté des nomades qui réussissent !',
      'TEMOIGNAGE_ECHEC_LEÇONS': 'Évitez ces erreurs courantes en {destination} ! Consultez nos guides détaillés et préparez-vous au mieux pour votre aventure nomade.',
      'TEMOIGNAGE_TRANSITION': 'Envie de faire votre transition vers le nomadisme en {destination} ? Nos guides vous accompagnent pas à pas dans cette transformation.',
      'TEMOIGNAGE_COMPARAISON': 'Hésitez entre plusieurs destinations en Asie ? Nos comparatifs détaillés vous aident à faire le bon choix pour votre projet nomade.',
      'GUIDE_PRATIQUE': 'Besoin d\'aide pour {sous_categorie} en {destination} ? Suivez notre guide étape par étape et évitez les pièges courants.',
      'COMPARAISON_DESTINATIONS': 'Découvrez toutes nos comparaisons de destinations en Asie et trouvez celle qui correspond le mieux à votre profil nomade.',
      'ACTUALITE_NOMADE': 'Restez informé des dernières actualités nomades en {destination} ! Abonnez-vous à notre newsletter pour ne rien manquer.',
      'CONSEIL_PRATIQUE': 'Appliquez ces conseils pratiques en {destination} et optimisez votre expérience nomade ! Découvrez nos autres astuces d\'experts.'
    };
    
    const template = ctaTemplates[analysis.type_contenu] || ctaTemplates['CONSEIL_PRATIQUE'];
    
    return template
      .replace('{destination}', analysis.destination || 'Asie')
      .replace('{sous_categorie}', analysis.sous_categorie || 'votre projet');
  }

  // Analyser la performance des améliorations
  analyzeEnhancementPerformance(content, analysis) {
    const metrics = {
      widgets: this.widgetManager.validateWidgets(content),
      links: this.linksManager.validateInternalLinks(content),
      readability: this.calculateReadability(content),
      seo: this.calculateSEOScore(content, analysis)
    };
    
    return {
      overall: (metrics.widgets.score + metrics.links.internal * 10 + metrics.readability + metrics.seo) / 4,
      metrics: metrics
    };
  }

  // Calculer la lisibilité
  calculateReadability(content) {
    const sentences = content.split(/[.!?]+/).length;
    const words = content.split(/\s+/).length;
    const syllables = content.split(/\s+/).reduce((acc, word) => acc + this.countSyllables(word), 0);
    
    const avgWordsPerSentence = words / sentences;
    const avgSyllablesPerWord = syllables / words;
    
    const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    return Math.max(0, Math.min(100, fleschScore));
  }

  // Compter les syllabes (approximation)
  countSyllables(word) {
    return word.toLowerCase().replace(/[^aeiouy]/g, '').length || 1;
  }

  // Calculer le score SEO
  calculateSEOScore(content, analysis) {
    let score = 0;
    
    // Vérifier la présence de H2/H3
    if (content.includes('<h2>')) score += 20;
    if (content.includes('<h3>')) score += 15;
    
    // Vérifier la présence de listes
    if (content.includes('<ul>') || content.includes('<ol>')) score += 10;
    
    // Vérifier la présence de liens internes
    const internalLinks = this.linksManager.validateInternalLinks(content);
    score += Math.min(internalLinks.internal * 5, 25);
    
    // Vérifier la présence de widgets
    const widgets = this.widgetManager.validateWidgets(content);
    score += Math.min(widgets.present.length * 5, 20);
    
    // Vérifier la longueur du contenu
    const wordCount = content.split(/\s+/).length;
    if (wordCount >= 600 && wordCount <= 1400) score += 10;
    
    return Math.min(score, 100);
  }
}

export default ContentEnhancer;
