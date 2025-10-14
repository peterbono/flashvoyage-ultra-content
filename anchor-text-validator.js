/**
 * VALIDATEUR D'ANCRES DE LIENS
 * Vérifie que les ancres suggérées sont grammaticalement correctes
 */

export class AnchorTextValidator {
  constructor() {
    // Patterns de texte invalide à détecter
    this.invalidPatterns = [
      /\bComparer les prix\b/i,  // Fragment de widget
      /\b(https?:\/\/|www\.)/i,  // URLs
      /\b[A-Z]{3,}\b/,            // Acronymes longs (probablement du code)
      /[<>{}[\]]/,                // Balises HTML ou code
      /\s{2,}/,                   // Espaces multiples
      /^\s|\s$/,                  // Espaces en début/fin
      /\d{5,}/,                   // Longues séquences de chiffres
      /[^\w\s\-'àâäéèêëïîôùûüÿçœæ]/gi  // Caractères spéciaux suspects (sauf ponctuation de base)
    ];

    // Mots interdits (fragments de code, widgets, etc.)
    this.forbiddenWords = [
      'comparer les prix',
      'aviasales',
      'hotellook',
      'script',
      'charset',
      'utf-8',
      'target',
      'href'
    ];

    // Longueur min/max pour une ancre
    this.minLength = 3;
    this.maxLength = 60;
  }

  /**
   * Valide une ancre de lien
   * @param {string} anchorText - Le texte de l'ancre à valider
   * @returns {Object} - { valid: boolean, reason: string, suggestion: string }
   */
  validate(anchorText) {
    // 1. Vérifier la longueur
    if (anchorText.length < this.minLength) {
      return {
        valid: false,
        reason: `Ancre trop courte (${anchorText.length} caractères, min: ${this.minLength})`,
        suggestion: null
      };
    }

    if (anchorText.length > this.maxLength) {
      return {
        valid: false,
        reason: `Ancre trop longue (${anchorText.length} caractères, max: ${this.maxLength})`,
        suggestion: anchorText.substring(0, this.maxLength)
      };
    }

    // 2. Vérifier les patterns invalides
    for (const pattern of this.invalidPatterns) {
      if (pattern.test(anchorText)) {
        return {
          valid: false,
          reason: `Contient un pattern invalide: ${pattern}`,
          suggestion: this.cleanAnchorText(anchorText)
        };
      }
    }

    // 3. Vérifier les mots interdits
    const lowerAnchor = anchorText.toLowerCase();
    for (const word of this.forbiddenWords) {
      if (lowerAnchor.includes(word)) {
        return {
          valid: false,
          reason: `Contient un mot interdit: "${word}"`,
          suggestion: this.cleanAnchorText(anchorText)
        };
      }
    }

    // 4. Vérifier la cohérence grammaticale basique
    const grammarCheck = this.checkBasicGrammar(anchorText);
    if (!grammarCheck.valid) {
      return grammarCheck;
    }

    // Tout est OK
    return {
      valid: true,
      reason: 'Ancre valide',
      suggestion: null
    };
  }

  /**
   * Vérifie la cohérence grammaticale basique
   */
  checkBasicGrammar(text) {
    // Vérifier qu'il n'y a pas de mots en majuscules au milieu
    const words = text.split(/\s+/);
    
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      // Si un mot au milieu commence par une majuscule (sauf noms propres connus)
      if (/^[A-Z]/.test(word) && !this.isProperNoun(word)) {
        return {
          valid: false,
          reason: 'Majuscule inattendue au milieu du texte',
          suggestion: text.toLowerCase()
        };
      }
    }

    // Vérifier qu'il n'y a pas de ponctuation bizarre
    if (/[.!?;:]{2,}/.test(text)) {
      return {
        valid: false,
        reason: 'Ponctuation multiple suspecte',
        suggestion: text.replace(/[.!?;:]{2,}/g, '')
      };
    }

    return { valid: true };
  }

  /**
   * Vérifie si un mot est un nom propre connu
   */
  isProperNoun(word) {
    const properNouns = [
      'Bali', 'Jakarta', 'Indonésie', 'Thaïlande', 'Bangkok', 
      'Paris', 'France', 'Asie', 'Reddit', 'FlashVoyages',
      'Hubud', 'Canggu', 'Ubud'
    ];
    return properNouns.includes(word);
  }

  /**
   * Nettoie une ancre de texte
   */
  cleanAnchorText(text) {
    let cleaned = text;

    // Supprimer les patterns invalides
    cleaned = cleaned.replace(/Comparer les prix/gi, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ');
    cleaned = cleaned.trim();

    return cleaned || null;
  }

  /**
   * Valide un lot d'ancres
   * @param {Array} suggestedLinks - Liste des liens suggérés avec anchor_text
   * @returns {Array} - Liste filtrée avec uniquement les liens valides
   */
  validateBatch(suggestedLinks) {
    console.log('\n🔍 VALIDATION DES ANCRES:');
    console.log('========================\n');

    const validLinks = [];
    const invalidLinks = [];

    suggestedLinks.forEach((link, index) => {
      const validation = this.validate(link.anchor_text);
      
      if (validation.valid) {
        validLinks.push(link);
        console.log(`✅ ${index + 1}. "${link.anchor_text}" - Valide`);
      } else {
        invalidLinks.push({ link, validation });
        console.log(`❌ ${index + 1}. "${link.anchor_text}"`);
        console.log(`   Raison: ${validation.reason}`);
        if (validation.suggestion) {
          console.log(`   Suggestion: "${validation.suggestion}"`);
        }
      }
    });

    console.log(`\n📊 Résumé: ${validLinks.length} valides, ${invalidLinks.length} invalides\n`);

    return {
      valid: validLinks,
      invalid: invalidLinks
    };
  }
}

export default AnchorTextValidator;
