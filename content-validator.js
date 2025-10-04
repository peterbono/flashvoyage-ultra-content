#!/usr/bin/env node

/**
 * Content Validator - Système de validation du contenu généré
 * Évite les erreurs de cohérence et de qualité dans les articles
 */

class ContentValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  // Valider un article complet
  validateArticle(article) {
    this.errors = [];
    this.warnings = [];

    // Validation du titre
    this.validateTitle(article.title);
    
    // Validation du contenu
    this.validateContent(article.content);
    
    // Validation de la cohérence temporelle
    this.validateTemporalConsistency(article);
    
    // Validation des données économiques
    this.validateEconomicData(article);
    
    // Validation de la structure
    this.validateStructure(article);

    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      score: this.calculateQualityScore()
    };
  }

  // Valider le titre
  validateTitle(title) {
    if (!title || title.length < 10) {
      this.errors.push('Titre trop court ou manquant');
    }
    
    if (title.length > 100) {
      this.warnings.push('Titre très long, peut impacter le SEO');
    }
    
    // Vérifier les répétitions
    const words = title.toLowerCase().split(' ');
    const duplicates = words.filter((word, index) => words.indexOf(word) !== index);
    if (duplicates.length > 0) {
      this.warnings.push(`Mots répétés dans le titre: ${duplicates.join(', ')}`);
    }
    
    // Vérifier les emojis excessifs
    const emojiCount = (title.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
    if (emojiCount > 2) {
      this.warnings.push('Trop d\'emojis dans le titre');
    }
  }

  // Valider le contenu
  validateContent(content) {
    if (!content || content.length < 100) {
      this.errors.push('Contenu trop court');
    }
    
    // Vérifier les incohérences temporelles
    const timePatterns = [
      /(\d+)\s*(heures?|minutes?|jours?)\s*(depuis|il y a|ago)/gi,
      /quand\s*:\s*(\d+)\s*(heures?|minutes?)/gi
    ];
    
    timePatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        this.errors.push(`Incohérence temporelle détectée: ${matches[0]}`);
      }
    });
    
    // Vérifier les données économiques cohérentes
    const economicPattern = /(\d+)-(\d+)\s*€/g;
    const economicMatches = content.match(economicPattern);
    if (economicMatches) {
      economicMatches.forEach(match => {
        const [min, max] = match.match(/\d+/g).map(Number);
        if (min >= max) {
          this.errors.push(`Plage économique incohérente: ${match}`);
        }
      });
    }
  }

  // Valider la cohérence temporelle
  validateTemporalConsistency(article) {
    const content = article.content || '';
    
    // Vérifier que "Quand" n'est pas utilisé pour du temps relatif
    if (content.includes('Quand :') && /\d+\s*(heures?|minutes?)/.test(content)) {
      this.errors.push('"Quand" utilisé avec du temps relatif au lieu d\'une période de validité');
    }
    
    // Vérifier la cohérence des dates
    const year = new Date().getFullYear();
    const nextYear = year + 1;
    
    if (content.includes(`décembre ${year}`) && new Date().getMonth() >= 10) {
      this.warnings.push('Offre se terminant bientôt, considérer une extension');
    }
  }

  // Valider les données économiques
  validateEconomicData(article) {
    const content = article.content || '';
    
    // Vérifier la présence de données économiques
    if (!/\d+\s*€/.test(content)) {
      this.warnings.push('Aucune donnée économique chiffrée trouvée');
    }
    
    // Vérifier la cohérence des montants
    const amounts = content.match(/\d+\s*€/g);
    if (amounts) {
      const values = amounts.map(amount => parseInt(amount));
      const maxAmount = Math.max(...values);
      const minAmount = Math.min(...values);
      
      if (maxAmount > minAmount * 10) {
        this.warnings.push('Écart important entre les montants mentionnés');
      }
    }
  }

  // Valider la structure
  validateStructure(article) {
    const content = article.content || '';
    
    // Vérifier la présence de sections
    const sections = content.match(/<h[1-6]>/g);
    if (!sections || sections.length < 3) {
      this.warnings.push('Structure insuffisante, moins de 3 sections');
    }
    
    // Vérifier la présence de listes
    if (!content.includes('<ul>') && !content.includes('<ol>')) {
      this.warnings.push('Aucune liste trouvée, structure peut être améliorée');
    }
    
    // Vérifier la présence de liens
    if (!content.includes('<a ')) {
      this.warnings.push('Aucun lien externe trouvé');
    }
  }

  // Calculer un score de qualité
  calculateQualityScore() {
    const totalChecks = this.errors.length + this.warnings.length;
    if (totalChecks === 0) return 100;
    
    const errorWeight = 3;
    const warningWeight = 1;
    const penalty = (this.errors.length * errorWeight) + (this.warnings.length * warningWeight);
    
    return Math.max(0, 100 - penalty);
  }

  // Valider un template de contenu
  validateTemplate(template, data) {
    const errors = [];
    
    // Vérifier que tous les placeholders sont remplis
    const placeholders = template.match(/\$\{([^}]+)\}/g);
    if (placeholders) {
      placeholders.forEach(placeholder => {
        const key = placeholder.replace(/\$\{|\}/g, '');
        if (!data[key]) {
          errors.push(`Placeholder manquant: ${key}`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Générer un rapport de validation
  generateReport(validation) {
    const report = {
      timestamp: new Date().toISOString(),
      isValid: validation.isValid,
      score: validation.score,
      summary: {
        errors: validation.errors.length,
        warnings: validation.warnings.length
      },
      details: {
        errors: validation.errors,
        warnings: validation.warnings
      }
    };
    
    return report;
  }
}

export default ContentValidator;
