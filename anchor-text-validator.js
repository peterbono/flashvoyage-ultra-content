/**
 * VALIDATEUR D'ANCRES DE LIENS
 * Vérifie que les ancres suggérées sont grammaticalement correctes
 */

export class AnchorTextValidator {
  constructor() {
    // Whitelist Unicode safe pour ancres valides
    // Autoriser: Lettres Unicode (\p{L}), Marques (\p{M}), Chiffres (\p{N}), Espaces, ponctuation de base
    this.validPattern = /^[\p{L}\p{M}\p{N}\s'’\-.,:;!?()]+$/u;
    
    // Patterns de texte invalide à détecter (HTML, URLs, code uniquement)
    this.invalidPatterns = [
      /\bComparer les prix\b/i,  // Fragment de widget
      /\b(https?:\/\/|www\.)/i,  // URLs
      /[<>{}[\]]/,                // Balises HTML ou code
      /\d{10,}/,                  // Très longues séquences de chiffres (probablement du code)
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
   * FIX 3: Normalise une ancre avant validation
   */
  normalizeAnchor(anchorText) {
    return anchorText
      .trim()
      .replace(/\s+/g, ' ') // Collapse espaces
      .replace(/[''"]/g, "'") // Normaliser apostrophes
      .replace(/[-–—]/g, '-') // Normaliser tirets
      .trim();
  }

  /**
   * Valide une ancre de lien
   * FIX 3: Normalisation avant validation + suggestion automatique
   * @param {string} anchorText - Le texte de l'ancre à valider
   * @returns {Object} - { valid: boolean, reason: string, suggestion: string }
   */
  validate(anchorText) {
    // FIX 3: Normaliser l'ancre avant validation
    const normalized = this.normalizeAnchor(anchorText);
    
    // 1. Vérifier la longueur
    if (normalized.length < this.minLength) {
      return {
        valid: false,
        reason: `Ancre trop courte (${normalized.length} caractères, min: ${this.minLength})`,
        suggestion: normalized.length > 0 ? normalized : null
      };
    }

    if (normalized.length > this.maxLength) {
      return {
        valid: false,
        reason: `Ancre trop longue (${normalized.length} caractères, max: ${this.maxLength})`,
        suggestion: normalized.substring(0, this.maxLength)
      };
    }

    // FIX 3: Autoriser /, -, ' dans les ancres (ex: r/digitalnomad)
    const validPatternExtended = /^[\p{L}\p{M}\p{N}\s'’\-.,:;!?()\/]+$/u;
    
    // 2. Vérifier la whitelist Unicode étendue
    if (!validPatternExtended.test(normalized)) {
      const cleaned = this.cleanAnchorText(normalized);
      return {
        valid: false,
        reason: 'Contient des caractères non autorisés (HTML, URLs, caractères de contrôle)',
        suggestion: cleaned || normalized
      };
    }

    // 3. Vérifier les patterns invalides (HTML, URLs, code)
    for (const pattern of this.invalidPatterns) {
      if (pattern.test(normalized)) {
        const cleaned = this.cleanAnchorText(normalized);
        return {
          valid: false,
          reason: `Contient un pattern invalide: ${pattern}`,
          suggestion: cleaned || normalized
        };
      }
    }

    // 4. Vérifier les mots interdits
    const lowerAnchor = normalized.toLowerCase();
    for (const word of this.forbiddenWords) {
      if (lowerAnchor.includes(word)) {
        const cleaned = this.cleanAnchorText(normalized);
        return {
          valid: false,
          reason: `Contient un mot interdit: "${word}"`,
          suggestion: cleaned || normalized
        };
      }
    }

    // Tout est OK
    return {
      valid: true,
      reason: 'Ancre valide',
      suggestion: normalized
      };
    }


  /**
   * Nettoie une ancre de texte
   * FIX 3: Nettoyage amélioré avec préservation de /, -, '
   */
  cleanAnchorText(text) {
    let cleaned = text;

    // Supprimer les patterns invalides
    cleaned = cleaned.replace(/Comparer les prix/gi, '');
    cleaned = cleaned.replace(/<[^>]*>/g, ''); // Supprimer HTML
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, ''); // Supprimer URLs
    cleaned = cleaned.replace(/\s{2,}/g, ' '); // Collapse espaces
    cleaned = cleaned.trim();

    // FIX 3: Autoriser /, -, ' (ex: r/digitalnomad, co-living, l'asie)
    cleaned = cleaned.replace(/[^\w\s'’\-.,:;!?()\/]/g, '');

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
