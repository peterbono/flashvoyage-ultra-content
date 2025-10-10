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
    
    // Remplacer les placeholders de widgets s'ils existent
    if (enhancedContent.includes('{TRAVELPAYOUTS_FLIGHTS_WIDGET}') || 
        enhancedContent.includes('{TRAVELPAYOUTS_HOTELS_WIDGET}')) {
      // Remplacer les placeholders par les widgets réels
      enhancedContent = enhancedContent.replace(/\{TRAVELPAYOUTS_\w+_WIDGET\}/g, (match) => {
        const widgetKey = match.replace(/\{TRAVELPAYOUTS_(\w+)_WIDGET\}/, '$1').toLowerCase();
        return `{{TRAVELPAYOUTS_${widgetKey.toUpperCase()}_WIDGET}}`;
      });
    }
    
    // Ajouter les widgets si pas déjà présents
    if (widgetsHTML && !enhancedContent.includes('Outils recommandés')) {
      enhancedContent += '\n\n' + widgetsHTML;
    }
    
    // Ajouter les liens internes si pas déjà présents
    if (linksHTML && !enhancedContent.includes('Articles connexes')) {
      enhancedContent += '\n\n' + linksHTML;
    }
    
    return enhancedContent;
  }

  // Valider les améliorations
  validateEnhancements(content, widgets, internalLinks) {
    const issues = [];
    let score = 100;
    
    // Vérifier la présence des widgets
    const widgetValidation = this.widgetManager.validateWidgets(content);
    if (widgetValidation.score < 50) {
      issues.push(`Widgets insuffisants: ${widgetValidation.score}%`);
      score -= 20;
    }
    
    // Vérifier la présence des liens internes
    const linksValidation = this.linksManager.validateInternalLinks(content);
    if (linksValidation.internal < 2) {
      issues.push(`Liens internes insuffisants: ${linksValidation.internal}`);
      score -= 15;
    }
    
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
      widgets: widgetValidation,
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
