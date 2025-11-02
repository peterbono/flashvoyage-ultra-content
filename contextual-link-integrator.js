#!/usr/bin/env node

/**
 * INTÉGRATEUR CONTEXTUEL - INSÉRER LES LIENS INTELLIGEMMENT DANS L'ARTICLE
 */

class ContextualLinkIntegrator {
  constructor() {
    this.linkStyle = 'color: #dc2626; text-decoration: underline;';
    this.maxLinksPerArticle = 15;
  }

  /**
   * Intégrer les liens suggérés dans le contenu HTML
   * Différencie les liens INTERNES (cherche ancre exacte) et EXTERNES (insertion contextuelle)
   */
  integrateLinks(htmlContent, suggestedLinks) {
    console.log('🔗 INTÉGRATION DES LIENS CONTEXTUELS');
    console.log('====================================\n');

    // Vérifier que htmlContent est une string
    if (typeof htmlContent !== 'string') {
      console.error('❌ htmlContent doit être une string, reçu:', typeof htmlContent);
      return {
        content: typeof htmlContent === 'object' && htmlContent !== null ? String(htmlContent) : '',
        stats: { integrated: 0, skipped: 0, total: 0 }
      };
    }

    let updatedContent = htmlContent;
    let linksIntegrated = 0;
    let linksSkipped = 0;

    // Trier les liens par score de pertinence (du plus pertinent au moins pertinent)
    const sortedLinks = [...suggestedLinks].sort((a, b) => b.relevance_score - a.relevance_score);

    console.log(`📊 Liens à intégrer: ${sortedLinks.length}`);
    console.log(`🎯 Limite maximale: ${this.maxLinksPerArticle}\n`);

    for (const link of sortedLinks) {
      // Vérifier si on n'a pas dépassé la limite
      if (linksIntegrated >= this.maxLinksPerArticle) {
        console.log(`⚠️ Limite de ${this.maxLinksPerArticle} liens atteinte`);
        break;
      }

      const linkUrl = link.article_url || link.url;
      const linkTitle = link.article_title || link.anchor_text;
      
      // DÉTECTION : Lien interne ou externe ?
      const isExternalLink = linkUrl && !linkUrl.includes('flashvoyage.com') && !linkUrl.startsWith('/');
      
      if (isExternalLink) {
        // ===== LOGIQUE LIENS EXTERNES =====
        // Les liens externes peuvent être insérés directement sans chercher l'ancre exacte
        // On cherche un contexte pertinent et on insère le lien avec l'ancre suggérée
        
        const insertionResult = this.insertExternalLinkContextually(
          updatedContent,
          link.anchor_text,
          linkUrl,
          linkTitle
        );
        
        if (insertionResult.inserted) {
          updatedContent = insertionResult.content;
          linksIntegrated++;
          const displayTitle = linkTitle.substring(0, 50);
          console.log(`✅ ${linksIntegrated}. [EXTERNE] "${link.anchor_text}" → ${displayTitle}...`);
          if (link.relevance_score) {
            console.log(`   Score: ${link.relevance_score}/10 | Contexte: ${insertionResult.contextKeyword}`);
          }
        } else {
          console.log(`⏭️ [EXTERNE] Pas de contexte trouvé pour "${link.anchor_text}" - Ignoré`);
          linksSkipped++;
        }
      } else {
        // ===== LOGIQUE LIENS INTERNES =====
        // Les liens internes doivent trouver l'ancre exacte dans le contenu
        
        // 1. Essayer d'extraire une ancre depuis le contenu
        const extractedAnchor = this.extractAnchorFromContent(
          updatedContent, 
          link,
          linkTitle
        );

        // 2. Utiliser ancre extraite ou fallback sur ancre suggérée
        let candidateAnchor = extractedAnchor.anchor || link.anchor_text;
        
        // 3. Recherche flexible de l'ancre dans le contenu
        let anchorMatch = this.findAnchorInContent(updatedContent, candidateAnchor);
        
        if (!anchorMatch) {
          // Fallback : essayer avec l'ancre suggérée originale
          const fallbackMatch = this.findAnchorInContent(updatedContent, link.anchor_text);
          if (!fallbackMatch) {
            console.log(`⏭️ [INTERNE] Ancre "${candidateAnchor}" non trouvée - Lien ignoré`);
            linksSkipped++;
            continue;
          }
          // Utiliser le fallback
          anchorMatch = fallbackMatch;
          candidateAnchor = link.anchor_text;
        }

        // 4. Validation contextuelle avant insertion
        const validation = this.validateContextualInsertion(
          updatedContent,
          anchorMatch.fullMatch,
          anchorMatch.index
        );

        if (!validation.valid) {
          console.log(`⏭️ [INTERNE] Contexte insuffisant pour "${candidateAnchor}" (${validation.reason}) - Lien ignoré`);
          linksSkipped++;
          continue;
        }

        // 5. Utiliser l'ancre validée (extraite du contexte validé)
        let finalAnchor = validation.anchor.length > 0 ? validation.anchor : candidateAnchor;
        
        // 6. Enrichir les ancres trop courtes
        let enrichedPosition = validation.position;
        if (finalAnchor.length < 15) {
          const enrichmentResult = this.enrichShortAnchorInContent(
            updatedContent,
            finalAnchor,
            validation.position,
            linkTitle,
            validation.context
          );
          if (enrichmentResult.enriched) {
            updatedContent = enrichmentResult.content;
            finalAnchor = enrichmentResult.newAnchor;
            // Recalculer la position après enrichissement
            const htmlLower = updatedContent.toLowerCase();
            const anchorLower = finalAnchor.toLowerCase();
            enrichedPosition = htmlLower.indexOf(anchorLower, Math.max(0, validation.position - 50));
            if (enrichedPosition === -1) enrichedPosition = validation.position;
            console.log(`   📝 Ancre enrichie: "${finalAnchor}"`);
          }
        }

        // 7. Vérifier si l'ancre n'est pas déjà dans un lien
        if (this.isAlreadyLinked(updatedContent, finalAnchor)) {
          console.log(`⏭️ [INTERNE] "${finalAnchor}" déjà dans un lien - Ignoré`);
          linksSkipped++;
          continue;
        }

        // 8. Créer le lien HTML
        const linkHtml = this.createLink(finalAnchor, linkUrl, linkTitle);

        // 9. Remplacer l'occurrence validée par le lien dans le HTML
        const beforeLength = updatedContent.length;
        
        // Trouver la position exacte dans le HTML (peut avoir changé après enrichissement)
        const htmlLower = updatedContent.toLowerCase();
        const anchorLower = finalAnchor.toLowerCase();
        let htmlAnchorIndex = htmlLower.indexOf(anchorLower, Math.max(0, enrichedPosition - 30));
        if (htmlAnchorIndex === -1) {
          htmlAnchorIndex = htmlLower.indexOf(anchorLower);
        }
        
        if (htmlAnchorIndex === -1) {
          // Si pas trouvé dans HTML, utiliser la position validée
          const plainContent = updatedContent.replace(/<[^>]*>/g, ' ');
          const plainIndex = plainContent.toLowerCase().indexOf(finalAnchor.toLowerCase());
          if (plainIndex !== -1) {
            // Convertir position plain vers HTML (approximatif)
            updatedContent = updatedContent.replace(
              new RegExp(this.escapeRegex(finalAnchor), 'i'),
              linkHtml,
              1
            );
          } else {
            console.log(`⏭️ [INTERNE] Ancre "${finalAnchor}" non trouvée dans HTML - Lien ignoré`);
            linksSkipped++;
            continue;
          }
        } else {
          // Remplacer à la position exacte trouvée
          updatedContent = updatedContent.substring(0, htmlAnchorIndex) +
            linkHtml +
            updatedContent.substring(htmlAnchorIndex + finalAnchor.length);
        }

        if (updatedContent.length !== beforeLength) {
          linksIntegrated++;
          const displayTitle = linkTitle.substring(0, 50);
          console.log(`✅ ${linksIntegrated}. [INTERNE] "${finalAnchor}" → ${displayTitle}...`);
          if (link.relevance_score) {
            console.log(`   Score: ${link.relevance_score}/10`);
          }
        } else {
          linksSkipped++;
        }
      }
    }

    console.log(`\n📊 RÉSUMÉ:`);
    console.log(`  - Liens intégrés: ${linksIntegrated}`);
    console.log(`  - Liens ignorés: ${linksSkipped}`);
    console.log(`  - Total de liens dans l'article: ${this.countLinks(updatedContent)}`);

    return {
      content: updatedContent,
      stats: {
        integrated: linksIntegrated,
        skipped: linksSkipped,
        total: this.countLinks(updatedContent)
      }
    };
  }

  /**
   * Créer un lien HTML avec le style approprié
   */
  createLink(anchorText, url, title) {
    // Déterminer si c'est un lien interne ou externe
    const isInternal = url.includes('flashvoyage.com');
    const target = isInternal ? '_self' : '_blank';
    const rel = isInternal ? '' : ' rel="noopener"';

    return `<a href="${url}" target="${target}"${rel} style="${this.linkStyle}">${anchorText}</a>`;
  }

  /**
   * Insérer un lien externe de manière contextuelle
   * Cherche un mot-clé pertinent dans le contenu et insère le lien directement
   * @param {string} htmlContent - Contenu HTML de l'article
   * @param {string} anchorText - Texte d'ancre suggéré (ex: "Digital Nomads Bali")
   * @param {string} url - URL du lien externe
   * @param {string} title - Titre du lien (pour référence)
   * @returns {Object} - { inserted: boolean, content: string, contextKeyword?: string }
   */
  insertExternalLinkContextually(htmlContent, anchorText, url, title) {
    // Extraire les mots-clés pertinents depuis l'ancre (ex: "Bali" depuis "Digital Nomads Bali")
    const anchorKeywords = this.extractKeywordsFromAnchor(anchorText);
    
    // Si pas de mots-clés pertinents, essayer depuis le titre
    if (anchorKeywords.length === 0) {
      anchorKeywords.push(...this.extractKeywords(title || anchorText));
    }
    
    if (anchorKeywords.length === 0) {
      return { inserted: false, content: htmlContent };
    }
    
    // Chercher le premier mot-clé pertinent dans le contenu
    const plainContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    let bestMatch = null;
    let bestKeyword = null;
    
    for (const keyword of anchorKeywords) {
      // Ignorer les mots trop courts ou génériques (minimum 4 caractères)
      const forbidden = ['les', 'des', 'une', 'pour', 'dans', 'avec', 'the', 'a', 'de', 'du', 'la', 'le', 'un'];
      if (keyword.length < 4 || forbidden.includes(keyword.toLowerCase())) {
        continue;
      }
      
      const keywordRegex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
      const match = plainContent.match(keywordRegex);
      
      if (match) {
        const index = plainContent.toLowerCase().indexOf(match[0].toLowerCase());
        
        // Vérifier que ce n'est pas déjà dans un lien
        if (!this.isKeywordInLink(htmlContent, index, keyword)) {
          // Vérifier que le contexte est approprié (pas en début/fin de phrase)
          const context = this.getContextAround(plainContent, index, keyword.length);
          if (this.isValidExternalLinkContext(context, keyword)) {
            bestMatch = { index, keyword };
            bestKeyword = keyword;
            break; // Prendre le premier bon match
          }
        }
      }
    }
    
    if (!bestMatch) {
      return { inserted: false, content: htmlContent };
    }
    
    // Trouver la position exacte dans le HTML
    const htmlMatch = this.findKeywordInHTML(htmlContent, bestKeyword, bestMatch.index);
    if (!htmlMatch) {
      return { inserted: false, content: htmlContent };
    }
    
    // Créer le lien HTML avec l'ancre suggérée
    const linkHtml = this.createLink(anchorText, url, title);
    
    // Insérer le lien APRÈS le mot-clé trouvé (format: "Bali [Digital Nomads Bali]")
    // Ou remplacer le mot-clé si c'est approprié
    const insertionPoint = htmlMatch.position + htmlMatch.keywordLength;
    const beforeText = htmlContent.substring(0, insertionPoint);
    const afterText = htmlContent.substring(insertionPoint);
    
    // Insérer après le mot-clé avec un espace si nécessaire
    let separator = '';
    if (!afterText.trim().match(/^[.,;:!?\)]/)) {
      separator = ' ';
    }
    
    const newContent = beforeText + separator + linkHtml + afterText;
    
    return {
      inserted: true,
      content: newContent,
      contextKeyword: bestKeyword
    };
  }
  
  /**
   * Extraire des mots-clés pertinents depuis une ancre (destinations, noms propres, etc.)
   * AMÉLIORATION: Évite les mots trop courts qui pourraient matcher dans d'autres mots
   */
  extractKeywordsFromAnchor(anchorText) {
    // Exemples:
    // "Digital Nomads Bali" → ["Bali"]
    // "Coworking spaces à Bali" → ["Bali", "Coworking"]
    // "r/digitalnomad" → ["digitalnomad", "digital", "nomad"]
    
    const keywords = [];
    const words = anchorText.split(/\s+/);
    
    // Mots interdits (trop génériques ou courts)
    const forbiddenWords = ['the', 'les', 'des', 'une', 'pour', 'dans', 'avec', 'spaces', 'groups', 
                           'digital', 'nomads', 'nomad', 'group', 'a', 'de', 'du', 'la', 'le', 
                           'un', 'et', 'ou', 'à', 'sur', 'par', 'sous', 'vers', 'pour'];
    
    // Chercher les destinations/villes (mots propres, minimum 4 caractères pour éviter les matches partiels)
    const destinations = words.filter(w => {
      const clean = w.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ]/g, '');
      return clean.length >= 4 &&  // Minimum 4 caractères pour éviter les matches partiels
             !forbiddenWords.includes(clean);
    });
    
    keywords.push(...destinations);
    
    // Si pas de destination, chercher d'autres mots-clés pertinents (minimum 5 caractères)
    if (keywords.length === 0) {
      const cleanWords = words
        .map(w => w.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ]/g, ''))
        .filter(w => w.length >= 5 && !forbiddenWords.includes(w)); // Minimum 5 caractères
      keywords.push(...cleanWords);
    }
    
    // Si toujours rien, prendre les mots de 4+ caractères (dernier recours)
    if (keywords.length === 0) {
      const lastResort = words
        .map(w => w.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ]/g, ''))
        .filter(w => w.length >= 4 && !forbiddenWords.includes(w));
      keywords.push(...lastResort);
    }
    
    return keywords;
  }
  
  /**
   * Vérifier si un mot-clé est déjà dans un lien HTML
   */
  isKeywordInLink(htmlContent, plainIndex, keyword) {
    // Convertir approximativement l'index plain vers HTML
    // Compter les balises HTML avant cette position
    const textBefore = htmlContent.substring(0, Math.min(plainIndex * 2, htmlContent.length));
    const linksBefore = (textBefore.match(/<a[^>]*>/g) || []).length;
    const closingLinksBefore = (textBefore.match(/<\/a>/g) || []).length;
    
    // Si on est dans un lien (plus de <a> ouverts que fermés)
    return linksBefore > closingLinksBefore;
  }
  
  /**
   * Obtenir le contexte autour d'un mot-clé (phrase complète)
   */
  getContextAround(plainContent, index, keywordLength) {
    const contextSize = 100;
    const start = Math.max(0, index - contextSize);
    const end = Math.min(plainContent.length, index + keywordLength + contextSize);
    return plainContent.substring(start, end);
  }
  
  /**
   * Valider que le contexte est approprié pour insérer un lien externe
   */
  isValidExternalLinkContext(context, keyword) {
    // Éviter les débuts de phrase (premier mot)
    if (context.trim().split(/\s+/)[0].toLowerCase() === keyword.toLowerCase()) {
      return false;
    }
    
    // Vérifier qu'il y a du contexte avant et après
    const keywordPos = context.toLowerCase().indexOf(keyword.toLowerCase());
    const beforeContext = context.substring(0, keywordPos).trim();
    const afterContext = context.substring(keywordPos + keyword.length).trim();
    
    if (beforeContext.length < 5 || afterContext.length < 5) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Trouver un mot-clé dans le HTML en tenant compte des balises
   * CORRECTION: Assure que le match est un mot complet (word boundaries) et pas une sous-chaîne
   */
  findKeywordInHTML(htmlContent, keyword, approximatePlainIndex) {
    // Construire une map: plainText index -> htmlContent index
    // Pour convertir les positions du texte brut vers HTML
    const plainToHtmlMap = [];
    let htmlIndex = 0;
    let plainIndex = 0;
    
    // Parcourir le HTML et créer la map
    while (htmlIndex < htmlContent.length && plainIndex < approximatePlainIndex + 200) {
      const char = htmlContent[htmlIndex];
      
      if (char === '<') {
        // Sauter les balises HTML (ne pas les compter dans le texte brut)
        const tagEnd = htmlContent.indexOf('>', htmlIndex);
        if (tagEnd === -1) break;
        htmlIndex = tagEnd + 1;
      } else {
        // Caractère de texte : mapper plainIndex -> htmlIndex
        plainToHtmlMap[plainIndex] = htmlIndex;
        htmlIndex++;
        plainIndex++;
      }
    }
    
    // Extraire le texte brut autour de la position approximative
    const plainContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const searchStart = Math.max(0, approximatePlainIndex - 100);
    const searchEnd = Math.min(plainContent.length, approximatePlainIndex + 100);
    const searchText = plainContent.substring(searchStart, searchEnd);
    
    // Rechercher le mot-clé avec word boundaries dans le texte brut
    const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
    const match = searchText.match(regex);
    
    if (!match) {
      // Fallback: recherche dans tout le texte brut
      const fullMatch = plainContent.match(regex);
      if (!fullMatch) {
        return null;
      }
      // Trouver la position HTML correspondante
      const plainMatchIndex = fullMatch.index || 0;
      if (plainToHtmlMap[plainMatchIndex] === undefined) {
        // Recalculer la map pour cette position
        return this.findKeywordInHTMLFallback(htmlContent, keyword);
      }
      
      const htmlMatchPos = plainToHtmlMap[plainMatchIndex];
      const keywordLength = fullMatch[0].length;
      
      // VÉRIFICATION CRITIQUE: S'assurer que le match est un mot complet
      // Vérifier les caractères avant et après dans le HTML
      const beforeChar = htmlMatchPos > 0 ? htmlContent[htmlMatchPos - 1] : ' ';
      const afterChar = htmlMatchPos + keywordLength < htmlContent.length 
        ? htmlContent[htmlMatchPos + keywordLength] 
        : ' ';
      
      // Un mot complet doit être précédé/suivi par un non-lettre (ou début/fin de balise)
      const isWordBoundaryBefore = !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(beforeChar) || beforeChar === '<' || beforeChar === '>';
      const isWordBoundaryAfter = !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(afterChar) || afterChar === '<' || afterChar === '>';
      
      if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
        // Le match n'est pas un mot complet, ignorer
        return null;
      }
      
      return {
        position: htmlMatchPos,
        keywordLength: keywordLength
      };
    }
    
    // Trouver la position HTML correspondante
    const matchInSearchText = match.index || 0;
    const plainMatchIndex = searchStart + matchInSearchText;
    
    if (plainToHtmlMap[plainMatchIndex] === undefined) {
      // Recalculer si nécessaire
      return this.findKeywordInHTMLFallback(htmlContent, keyword);
    }
    
    const htmlMatchPos = plainToHtmlMap[plainMatchIndex];
    const keywordLength = match[0].length;
    
    // VÉRIFICATION CRITIQUE: S'assurer que le match est un mot complet dans le HTML
    const beforeChar = htmlMatchPos > 0 ? htmlContent[htmlMatchPos - 1] : ' ';
    const afterChar = htmlMatchPos + keywordLength < htmlContent.length 
      ? htmlContent[htmlMatchPos + keywordLength] 
      : ' ';
    
    // Un mot complet doit être précédé/suivi par un non-lettre
    const isWordBoundaryBefore = !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(beforeChar) || beforeChar === '<' || beforeChar === '>';
    const isWordBoundaryAfter = !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(afterChar) || afterChar === '<' || afterChar === '>';
    
    if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
      // Le match n'est pas un mot complet, ignorer
      return null;
    }
    
    return {
      position: htmlMatchPos,
      keywordLength: keywordLength
    };
  }
  
  /**
   * Fallback: Recherche simple avec validation stricte
   */
  findKeywordInHTMLFallback(htmlContent, keyword) {
    const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
    
    // Extraire le texte brut et trouver la position
    const plainContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const match = plainContent.match(regex);
    
    if (!match) {
      return null;
    }
    
    // Reconstruire la position HTML en parcourant le HTML
    let htmlPos = 0;
    let plainPos = 0;
    const targetPlainPos = match.index || 0;
    
    while (htmlPos < htmlContent.length && plainPos < targetPlainPos) {
      if (htmlContent[htmlPos] === '<') {
        const tagEnd = htmlContent.indexOf('>', htmlPos);
        if (tagEnd === -1) break;
        htmlPos = tagEnd + 1;
      } else {
        htmlPos++;
        plainPos++;
      }
    }
    
    // Vérifier que le match est un mot complet
    const beforeChar = htmlPos > 0 ? htmlContent[htmlPos - 1] : ' ';
    const afterChar = htmlPos + keyword.length < htmlContent.length 
      ? htmlContent[htmlPos + keyword.length] 
      : ' ';
    
    const isWordBoundaryBefore = !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(beforeChar) || beforeChar === '<';
    const isWordBoundaryAfter = !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(afterChar) || afterChar === '>';
    
    if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
      return null;
    }
    
    return {
      position: htmlPos,
      keywordLength: match[0].length
    };
  }

  /**
   * Vérifier si le texte est déjà dans un lien
   */
  isAlreadyLinked(content, text) {
    // Chercher si le texte est entre <a> et </a>
    const linkPattern = new RegExp(`<a[^>]*>[^<]*${this.escapeRegex(text)}[^<]*</a>`, 'i');
    return linkPattern.test(content);
  }

  /**
   * Compter le nombre total de liens dans le contenu
   */
  countLinks(content) {
    const matches = content.match(/<a href=/g);
    return matches ? matches.length : 0;
  }

  /**
   * Échapper les caractères spéciaux pour regex
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * AMÉLIORATION 1: Extraire une ancre depuis le contenu au lieu d'utiliser celle suggérée
   * Analyse sémantique pour trouver la phrase/partie la plus pertinente
   */
  extractAnchorFromContent(htmlContent, link, linkTitle) {
    // Extraire le texte brut du HTML
    const plainText = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Extraire les mots-clés du titre du lien cible
    const linkKeywords = this.extractKeywords(linkTitle || link.article_title || link.anchor_text);
    
    // Extraire les phrases du contenu (séparées par ponctuation)
    const sentences = plainText.split(/[.!?]\s+/).filter(s => s.length > 10);
    
    // Pour chaque phrase, calculer un score de similarité
    const scoredSentences = sentences.map((sentence, index) => {
      const score = this.calculateSimilarityScore(sentence, linkKeywords);
      return {
        sentence: sentence.trim(),
        score,
        index,
        words: sentence.split(/\s+/)
      };
    });
    
    // Filtrer et trier par score
    const candidates = scoredSentences
      .filter(s => s.score > 0.3 && s.sentence.length >= 15 && s.sentence.length <= 80)
      .sort((a, b) => b.score - a.score);
    
    if (candidates.length === 0) {
      return { anchor: null, source: 'none' };
    }
    
    // Extraire la partie la plus pertinente de la meilleure phrase
    const bestCandidate = candidates[0];
    const anchorPart = this.extractMostRelevantPart(bestCandidate.sentence, linkKeywords);
    
    return {
      anchor: anchorPart || bestCandidate.sentence.substring(0, 60),
      fullSentence: bestCandidate.sentence,
      score: bestCandidate.score,
      source: 'extracted'
    };
  }

  /**
   * Extraire les mots-clés pertinents d'un titre
   */
  extractKeywords(title) {
    if (!title) return [];
    
    // Mots à ignorer
    const stopWords = new Set(['les', 'des', 'du', 'de', 'la', 'le', 'un', 'une', 'pour', 'avec', 'dans', 'sur', 'par', 'et', 'ou', 'mais', 'est', 'sont', 'a', 'ont', 'être', 'avoir']);
    
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Calculer un score de similarité entre une phrase et des mots-clés
   */
  calculateSimilarityScore(sentence, keywords) {
    if (!keywords || keywords.length === 0) return 0;
    
    const sentenceLower = sentence.toLowerCase();
    let matches = 0;
    
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(sentenceLower)) {
        matches++;
      }
    });
    
    // Score basé sur le ratio de mots-clés trouvés
    const score = matches / keywords.length;
    
    // Bonus si la phrase est de bonne longueur (ni trop courte ni trop longue)
    const lengthBonus = sentence.length >= 20 && sentence.length <= 70 ? 0.2 : 0;
    
    return score + lengthBonus;
  }

  /**
   * Extraire la partie la plus pertinente d'une phrase comme ancre
   * CORRECTION: S'assurer que l'ancre commence et finit à des limites de mots complets
   */
  extractMostRelevantPart(sentence, keywords) {
    if (!keywords || keywords.length === 0) {
      // Prendre le début de la phrase jusqu'à 60 caractères, mais jusqu'à un espace
      const words = sentence.split(/\s+/);
      let extracted = '';
      for (const word of words) {
        if ((extracted + ' ' + word).length <= 60) {
          extracted = extracted ? extracted + ' ' + word : word;
        } else {
          break;
        }
      }
      return extracted || sentence.substring(0, 60).trim();
    }
    
    const words = sentence.split(/\s+/);
    let bestStart = 0;
    let bestEnd = words.length;
    let maxScore = 0;
    
    // Trouver la sous-séquence avec le plus de mots-clés
    for (let start = 0; start < words.length; start++) {
      for (let end = start + 1; end <= words.length; end++) {
        const subsequence = words.slice(start, end).join(' ');
        const score = this.calculateSimilarityScore(subsequence, keywords);
        
        // Privilégier les sous-séquences de longueur raisonnable (10-60 chars)
        // ET qui commencent/finissent à des limites de mots (déjà le cas car on slice par mots)
        if (subsequence.length >= 10 && subsequence.length <= 60 && score > maxScore) {
          maxScore = score;
          bestStart = start;
          bestEnd = end;
        }
      }
    }
    
    const extracted = words.slice(bestStart, bestEnd).join(' ');
    
    // Vérification finale : s'assurer qu'on a une phrase complète (pas tronquée au milieu)
    if (extracted.length >= 10) {
      // Si l'extraction commence par un mot tronqué ou finit par un mot tronqué, ajuster
      const firstWord = words[bestStart];
      const lastWord = words[bestEnd - 1];
      
      // Vérifier que le premier et dernier mot sont complets
      // (déjà le cas car on slice par mots, mais vérification de sécurité)
      return extracted;
    }
    
    // Fallback : prendre le début de la phrase jusqu'à 60 caractères
    let fallbackExtracted = '';
    for (const word of words) {
      if ((fallbackExtracted + ' ' + word).length <= 60) {
        fallbackExtracted = fallbackExtracted ? fallbackExtracted + ' ' + word : word;
      } else {
        break;
      }
    }
    return fallbackExtracted || sentence.substring(0, 60).trim();
  }

  /**
   * AMÉLIORATION 2: Recherche flexible d'ancre (fuzzy matching)
   */
  findAnchorInContent(htmlContent, anchorText) {
    // Nettoyer le HTML pour recherche
    const plainContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Essai 1: Recherche exacte (case-insensitive)
    const exactRegex = new RegExp(`\\b${this.escapeRegex(anchorText)}\\b`, 'i');
    const exactMatch = plainContent.match(exactRegex);
    if (exactMatch) {
      const index = plainContent.toLowerCase().indexOf(exactMatch[0].toLowerCase());
      return {
        fullMatch: exactMatch[0],
        index: index,
        method: 'exact'
      };
    }
    
    // Essai 2: Recherche de mots-clés individuels (si ancre trop précise)
    const anchorWords = anchorText.split(/\s+/).filter(w => w.length > 3);
    if (anchorWords.length >= 2) {
      // Chercher une séquence qui contient au moins 70% des mots
      const minWords = Math.ceil(anchorWords.length * 0.7);
      const wordsPattern = anchorWords.map(w => this.escapeRegex(w)).join('|');
      const flexibleRegex = new RegExp(`\\b(?:${wordsPattern})\\b`, 'gi');
      const matches = [...plainContent.matchAll(flexibleRegex)];
      
      if (matches.length >= minWords) {
        // Trouver une zone du texte qui contient ces mots proches
        for (let i = 0; i <= matches.length - minWords; i++) {
          const firstMatch = matches[i];
          const lastMatch = matches[i + minWords - 1];
          const distance = lastMatch.index - firstMatch.index;
          
          // Si les mots sont dans un rayon de 100 caractères
          if (distance < 100) {
            const start = Math.max(0, firstMatch.index - 20);
            const end = Math.min(plainContent.length, lastMatch.index + lastMatch[0].length + 20);
            const extractedText = plainContent.substring(start, end).trim();
            
            return {
              fullMatch: extractedText,
              index: start,
              method: 'flexible'
            };
          }
        }
      }
    }
    
    // Essai 3: Recherche partielle (sans mots courts)
    const significantWords = anchorWords.filter(w => w.length > 4);
    if (significantWords.length > 0) {
      const significantPattern = significantWords.map(w => this.escapeRegex(w)).join('|');
      const partialRegex = new RegExp(`\\b(?:${significantPattern})\\b`, 'i');
      const partialMatch = plainContent.match(partialRegex);
      
      if (partialMatch) {
        const index = plainContent.toLowerCase().indexOf(partialMatch[0].toLowerCase());
        // Extraire contexte autour
        const start = Math.max(0, index - 10);
        const end = Math.min(plainContent.length, index + partialMatch[0].length + 30);
        const extractedText = plainContent.substring(start, end).trim();
        
        return {
          fullMatch: extractedText,
          index: start,
          method: 'partial'
        };
      }
    }
    
    return null;
  }

  /**
   * AMÉLIORATION 4: Enrichir les ancres courtes dans le contenu avec mots-clés du lien
   */
  enrichShortAnchorInContent(htmlContent, anchor, anchorPosition, linkTitle, context) {
    if (!anchor || anchor.length >= 40) {
      return { enriched: false, content: htmlContent, newAnchor: anchor };
    }
    
    // Extraire mots-clés pertinents du titre
    const keywords = this.extractKeywords(linkTitle);
    
    // Trouver des mots-clés qui ne sont pas déjà dans l'ancre ou contexte proche
    const anchorLower = anchor.toLowerCase();
    const contextLower = (context?.before + ' ' + context?.after || '').toLowerCase();
    const missingKeywords = keywords.filter(kw => 
      kw.length > 3 &&
      !anchorLower.includes(kw.toLowerCase()) &&
      !contextLower.includes(kw.toLowerCase())
    );
    
    if (missingKeywords.length === 0) {
      return { enriched: false, content: htmlContent, newAnchor: anchor };
    }
    
    const bestKeyword = missingKeywords[0];
    
    // Trouver la position de l'ancre dans le HTML
    const htmlLower = htmlContent.toLowerCase();
    const anchorIndex = htmlLower.indexOf(anchor.toLowerCase(), anchorPosition - 50);
    
    if (anchorIndex === -1) {
      return { enriched: false, content: htmlContent, newAnchor: anchor };
    }
    
    // Enrichir en ajoutant le mot-clé juste avant l'ancre (plus naturel)
    // Ex: "Bangkok" -> "la ville de Bangkok"
    const beforeAnchor = htmlContent.substring(Math.max(0, anchorIndex - 20), anchorIndex);
    const afterAnchor = htmlContent.substring(anchorIndex + anchor.length, Math.min(htmlContent.length, anchorIndex + anchor.length + 10));
    
    let enrichedAnchor = anchor;
    let insertion = '';
    
    // Si le contexte avant contient des déterminants/article
    if (beforeAnchor.match(/\s(de|du|des|à|en|le|la|les|un|une)\s$/i)) {
      enrichedAnchor = `${bestKeyword} ${anchor}`;
      insertion = bestKeyword + ' ';
    } else if (beforeAnchor.match(/\s(pour|vers|dans|avec|sans)\s$/i)) {
      enrichedAnchor = `${anchor} à ${bestKeyword}`;
      insertion = '';
    } else {
      // Ajout simple avant avec déterminant
      enrichedAnchor = `la ville de ${anchor}`;
      insertion = 'la ville de ';
    }
    
    // Vérifier que l'enrichissement ne casse pas le HTML
    const beforeHtml = htmlContent.substring(0, anchorIndex);
    const anchorHtml = htmlContent.substring(anchorIndex, anchorIndex + anchor.length);
    const afterHtml = htmlContent.substring(anchorIndex + anchor.length);
    
    const enrichedContent = beforeHtml + insertion + anchorHtml + afterHtml;
    
    return {
      enriched: true,
      content: enrichedContent,
      newAnchor: enrichedAnchor
    };
  }

  /**
   * AMÉLIORATION 3: Validation contextuelle avant insertion
   */
  validateContextualInsertion(htmlContent, anchorMatch, anchorIndex) {
    // Nettoyer le HTML pour validation
    const plainContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
    // Extraire l'ancre réelle (peut être une sous-chaîne de anchorMatch si méthode flexible/partial)
    // CORRECTION: S'assurer que l'ancre commence et finit à des limites de mots complets
    let finalAnchor = anchorMatch;
    
    if (anchorMatch.length > 60) {
      // Extraire une portion de 50-60 caractères centrée, mais aux limites de mots
      const midPoint = Math.floor(anchorMatch.length / 2);
      let start = Math.max(0, midPoint - 30);
      let end = Math.min(anchorMatch.length, midPoint + 30);
      
      // Ajuster au début de mot le plus proche
      while (start > 0 && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(anchorMatch[start - 1])) {
        start--;
      }
      
      // Ajuster à la fin de mot la plus proche
      while (end < anchorMatch.length && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(anchorMatch[end])) {
        end++;
      }
      
      finalAnchor = anchorMatch.substring(start, end).trim();
      
      // Si trop court après ajustement, prendre le début jusqu'à un espace
      if (finalAnchor.length < 10) {
        const words = anchorMatch.split(/\s+/);
        let accumulated = '';
        for (const word of words) {
          if ((accumulated + ' ' + word).length <= 60) {
            accumulated = accumulated ? accumulated + ' ' + word : word;
          } else {
            break;
          }
        }
        finalAnchor = accumulated || anchorMatch.substring(0, 60).trim();
      }
    }
    
    // Si toujours trop court, prendre le début jusqu'à un espace
    if (finalAnchor.length < 10) {
      const words = anchorMatch.split(/\s+/);
      let accumulated = '';
      for (const word of words) {
        if ((accumulated + ' ' + word).length <= 60) {
          accumulated = accumulated ? accumulated + ' ' + word : word;
        } else {
          break;
        }
      }
      finalAnchor = accumulated || anchorMatch.substring(0, Math.min(anchorMatch.length, 60)).trim();
    }
    
    // Vérification finale : s'assurer que l'ancre ne commence/finit pas au milieu d'un mot
    if (finalAnchor && finalAnchor.length > 0) {
      // Trouver le premier mot complet (ignorer les caractères isolés au début)
      const trimmedStart = finalAnchor.replace(/^[^a-zàâäéèêëïîôùûüÿçœæ]*/i, '');
      if (trimmedStart !== finalAnchor) {
        const firstWordMatch = trimmedStart.match(/^([a-zàâäéèêëïîôùûüÿçœæ]+(?:\s+[a-zàâäéèêëïîôùûüÿçœæ]+)*)/i);
        if (firstWordMatch) {
          // Trouver où commence le premier mot complet dans l'original
          const firstWordIndex = finalAnchor.indexOf(firstWordMatch[1]);
          finalAnchor = finalAnchor.substring(firstWordIndex);
        }
      }
      
      // Trouver le dernier mot complet (ignorer les caractères isolés à la fin)
      const trimmedEnd = finalAnchor.replace(/[^a-zàâäéèêëïîôùûüÿçœæ]*$/i, '');
      if (trimmedEnd !== finalAnchor) {
        const lastWordMatch = trimmedEnd.match(/([a-zàâäéèêëïîôùûüÿçœæ]+(?:\s+[a-zàâäéèêëïîôùûüÿçœæ]+)*)[^a-zàâäéèêëïîôùûüÿçœæ]*$/i);
        if (lastWordMatch) {
          // Trouver où finit le dernier mot complet dans l'original
          const lastWordEnd = finalAnchor.lastIndexOf(lastWordMatch[1]) + lastWordMatch[1].length;
          finalAnchor = finalAnchor.substring(0, lastWordEnd);
        }
      }
    }
    
    // Trouver la position de l'ancre dans le contenu HTML
    const htmlLower = htmlContent.toLowerCase();
    const anchorLower = finalAnchor.toLowerCase();
    let actualIndex = htmlLower.indexOf(anchorLower);
    
    // Si pas trouvé exactement, chercher dans plainContent pour contexte
    if (actualIndex === -1) {
      const plainLower = plainContent.toLowerCase();
      const plainIndex = plainLower.indexOf(anchorLower);
      if (plainIndex !== -1) {
        // Convertir approximativement en position HTML
        // Compter les tags HTML avant cette position
        const htmlBeforePlain = htmlContent.substring(0, plainIndex);
        const tagsBefore = (htmlBeforePlain.match(/<[^>]*>/g) || []).length;
        actualIndex = plainIndex + (tagsBefore * 5); // Estimation approximative
      } else {
        actualIndex = anchorIndex || 0;
      }
    }
    
    // Extraire contexte avant/après depuis plainContent
    const plainLower = plainContent.toLowerCase();
    let plainAnchorIndex = plainLower.indexOf(anchorLower);
    
    // Si ancre pas trouvée dans plainContent, essayer avec anchorMatch complet
    if (plainAnchorIndex === -1) {
      plainAnchorIndex = plainLower.indexOf(anchorMatch.toLowerCase());
    }
    
    // Si toujours pas trouvée, essayer sans les espaces multiples
    if (plainAnchorIndex === -1) {
      const normalizedAnchor = anchorLower.replace(/\s+/g, ' ');
      const normalizedPlain = plainContent.toLowerCase().replace(/\s+/g, ' ');
      plainAnchorIndex = normalizedPlain.indexOf(normalizedAnchor);
    }
    
    // Si toujours pas trouvée, utiliser l'index fourni approximativement
    if (plainAnchorIndex === -1) {
      // Convertir anchorIndex (qui peut être en HTML) vers plainContent
      // Approximatif : chaque tag HTML = ~10-20 chars de texte
      plainAnchorIndex = Math.min(plainContent.length - finalAnchor.length, anchorIndex || 0);
    }
    
    // Extraire contexte avant
    const contextBefore = plainAnchorIndex > 0 ? plainContent.substring(
      Math.max(0, plainAnchorIndex - 50), 
      plainAnchorIndex
    ).trim() : '';
    
    // Extraire contexte après avec vérification stricte
    const contextAfterStart = plainAnchorIndex + finalAnchor.length;
    const contextAfterEnd = Math.min(plainContent.length, contextAfterStart + 50);
    let contextAfter = '';
    
    if (contextAfterStart < plainContent.length) {
      contextAfter = plainContent.substring(contextAfterStart, contextAfterEnd).trim();
    }
    
    // Vérification supplémentaire : si l'ancre est en fin de paragraphe/phrase
    // Extraire plus loin pour voir s'il y a vraiment du contenu
    const extendedAfter = plainContent.substring(
      contextAfterStart,
      Math.min(plainContent.length, contextAfterStart + 100)
    ).trim();
    
    // Détecter si c'est vraiment la fin (pas de contenu jusqu'à 100 chars après)
    const isAtParagraphEnd = extendedAfter.length < 30 && (
      extendedAfter.match(/^[.!?]/) || 
      extendedAfter.length === 0 ||
      !extendedAfter.match(/[a-z]/i)
    );
    
    // Détecter si c'est la fin d'une phrase fermée
    const isAtSentenceEnd = contextAfter.match(/^[.!?]/) !== null;
    
    // Détecter si c'est la fin d'un paragraphe HTML (balise de fermeture proche)
    const htmlAfterAnchor = htmlContent.substring(
      actualIndex + finalAnchor.length,
      Math.min(htmlContent.length, actualIndex + finalAnchor.length + 50)
    );
    const isNearHtmlEnd = htmlAfterAnchor.match(/^[\s<>]*<\/p>|^[\s<>]*<\/div>|^[\s<>]*<h[1-6]>/i) !== null;
    
    // Validations renforcées
    const checks = {
      hasEnoughContextBefore: contextBefore.length >= 10,
      hasEnoughContextAfter: contextAfter.length >= 20 && !isAtParagraphEnd && !isNearHtmlEnd,
      notAtSentenceStart: !contextBefore.match(/[.!?]\s*$/) || contextBefore.length >= 20,
      notAtSentenceEnd: !isAtSentenceEnd && !isAtParagraphEnd && !isNearHtmlEnd,
      anchorLength: finalAnchor.length >= 10 && finalAnchor.length <= 70,
      hasRealContentAfter: extendedAfter.length > 20 || (!isAtParagraphEnd && !isNearHtmlEnd)
    };
    
    // Raison de rejet si validation échoue (ordre de priorité)
    let rejectionReason = null;
    if (!checks.hasRealContentAfter) {
      rejectionReason = 'fin de paragraphe/section détectée';
    } else if (!checks.hasEnoughContextBefore) {
      rejectionReason = 'contexte avant insuffisant';
    } else if (!checks.hasEnoughContextAfter) {
      rejectionReason = 'contexte après insuffisant (fin de phrase/paragraphe)';
    } else if (!checks.notAtSentenceStart && contextBefore.length < 20) {
      rejectionReason = 'trop proche du début de phrase';
    } else if (!checks.notAtSentenceEnd) {
      rejectionReason = 'trop proche de la fin de phrase/paragraphe';
    } else if (!checks.anchorLength) {
      rejectionReason = 'longueur ancre inappropriée';
    }
    
    const allValid = !rejectionReason;
    
    return {
      valid: allValid,
      anchor: finalAnchor,
      position: actualIndex,
      context: { before: contextBefore, after: contextAfter },
      checks,
      reason: rejectionReason
    };
  }

  /**
   * Nettoie la section "Articles connexes" pour ne garder que les vrais liens
   */
  cleanRelatedArticlesSection(htmlContent, suggestedLinks = []) {
    // Trouver la section "Articles connexes"
    const relatedSectionStart = htmlContent.indexOf('<h3>Articles connexes</h3>');
    if (relatedSectionStart === -1) return htmlContent;

    // Trouver la fin de la section (prochaine balise h2, h3 ou fin de contenu)
    const nextSectionStart = htmlContent.indexOf('<h2>', relatedSectionStart);
    const nextH3Start = htmlContent.indexOf('<h3>', relatedSectionStart + 1);
    const endOfContent = htmlContent.length;
    
    const sectionEnd = Math.min(
      nextSectionStart !== -1 ? nextSectionStart : endOfContent,
      nextH3Start !== -1 ? nextH3Start : endOfContent
    );

    // Extraire la section
    const beforeSection = htmlContent.substring(0, relatedSectionStart);
    const afterSection = htmlContent.substring(sectionEnd);
    
    // Créer une nouvelle section propre avec seulement les vrais liens
    const cleanSection = `\n\n<h3>Articles connexes</h3>\n<ul>\n`;
    
    // Chercher les vrais liens dans la section existante
    const linkMatches = htmlContent.substring(relatedSectionStart, sectionEnd).match(/<li><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/g);
    
    if (linkMatches && linkMatches.length > 0) {
      // Garder seulement les 3 premiers vrais liens
      const limitedLinks = linkMatches.slice(0, 3);
      const cleanedLinks = limitedLinks.map(link => {
        return link.replace(/<li><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/, (match, url, title) => {
          // Nettoyer le titre
          let cleanTitle = title
            .replace(/&#8217;/g, "'")
            .replace(/Source\s*:\s*/gi, '')
            .replace(/\s*–\s*Reddit\s+Digital\s+Nomad.*$/gi, '')
            .replace(/\s*–\s*Guide\s+FlashVoyages.*$/gi, '')
            .replace(/🌏\s*/g, '') // Supprimer les emojis
            .trim();
          
          if (cleanTitle.length > 80) {
            cleanTitle = cleanTitle.substring(0, 77) + '...';
          }
          
          console.log(`✅ Lien nettoyé: ${cleanTitle.substring(0, 60)}...`);
          return `<li><a href="${url}" target="_self" style="${this.linkStyle}">${cleanTitle}</a></li>`;
        });
      });
      
      return beforeSection + cleanSection + cleanedLinks.join('\n') + '\n</ul>\n' + afterSection;
    }
    
    // Si pas de vrais liens, recréer la section avec les liens suggérés
    console.log('⚠️ Aucun vrai lien trouvé, recréation de la section avec liens suggérés');
    
    // Utiliser les liens suggérés pour recréer la section
    if (suggestedLinks && suggestedLinks.length > 0) {
      const uniqueLinks = [];
      const seenUrls = new Set();

      suggestedLinks.forEach(link => {
        if (!seenUrls.has(link.article_url)) {
          uniqueLinks.push(link);
          seenUrls.add(link.article_url);
        }
      });

      const topLinks = uniqueLinks
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 3);

      if (topLinks.length > 0) {
        let newSection = `\n\n<h3>Articles connexes</h3>\n<ul>\n`;
        
        topLinks.forEach(link => {
          // Utiliser le vrai titre au lieu de l'excerpt
          let cleanTitle = link.title || link.article_title;
          
          // Nettoyer le titre
          cleanTitle = cleanTitle
            .replace(/&#8217;/g, "'")
            .replace(/Source\s*:\s*/gi, '')
            .replace(/\s*–\s*Reddit\s+Digital\s+Nomad.*$/gi, '')
            .replace(/\s*–\s*Guide\s+FlashVoyages.*$/gi, '')
            .replace(/🌏\s*/g, '') // Supprimer les emojis
            .trim();
          
          if (cleanTitle.length > 80) {
            cleanTitle = cleanTitle.substring(0, 77) + '...';
          }
          
          newSection += `<li><a href="${link.article_url}" target="_self" style="${this.linkStyle}">${cleanTitle}</a></li>\n`;
          console.log(`✅ Lien ajouté: ${cleanTitle.substring(0, 60)}...`);
        });
        
        newSection += `</ul>\n`;
        return beforeSection + newSection + afterSection;
      }
    }
    
    // Si vraiment aucun lien, supprimer la section
    console.log('⚠️ Aucun lien disponible, suppression de la section');
    return beforeSection + afterSection;
  }

  /**
   * Ajouter une section "Articles connexes" en fin d'article
   */
  addRelatedArticlesSection(htmlContent, suggestedLinks, maxDisplay = 3) {
    console.log('\n📚 AJOUT DE LA SECTION "ARTICLES CONNEXES"');
    console.log('==========================================\n');

    // Vérifier si une section existe déjà
    if (htmlContent.includes('<h3>Articles connexes</h3>')) {
      console.log('⚠️ Section "Articles connexes" déjà présente - Nettoyage...');
      
      // Nettoyer la section existante pour ne garder que les vrais liens
      htmlContent = this.cleanRelatedArticlesSection(htmlContent, suggestedLinks);
      return htmlContent;
    }

    // Éliminer les doublons par URL
    const uniqueLinks = [];
    const seenUrls = new Set();

    suggestedLinks.forEach(link => {
      if (!seenUrls.has(link.article_url)) {
        uniqueLinks.push(link);
        seenUrls.add(link.article_url);
      }
    });

    // Prendre les 3 meilleurs liens uniques
    const topLinks = uniqueLinks
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, maxDisplay);

    if (topLinks.length === 0) {
      console.log('⚠️ Aucun lien à ajouter\n');
      return htmlContent;
    }

    let relatedSection = `\n\n<h3>Articles connexes</h3>\n<ul>\n`;

    topLinks.forEach(link => {
      // Nettoyer le titre (enlever les HTML entities et les "Source :")
      let cleanTitle = link.article_title
        .replace(/&#8217;/g, "'")
        .replace(/Source\s*:\s*/gi, '') // Enlever "Source :"
        .replace(/\s*–\s*Reddit\s+Digital\s+Nomad.*$/gi, '') // Enlever "– Reddit Digital Nomad..."
        .replace(/\s*–\s*Guide\s+FlashVoyages.*$/gi, '') // Enlever "– Guide FlashVoyages..."
        .trim();
      
      // Limiter la longueur du titre
      if (cleanTitle.length > 80) {
        cleanTitle = cleanTitle.substring(0, 77) + '...';
      }
      
      relatedSection += `<li><a href="${link.article_url}" target="_self" style="${this.linkStyle}">${cleanTitle}</a></li>\n`;
      console.log(`✅ Ajouté: ${cleanTitle.substring(0, 60)}...`);
    });

    relatedSection += `</ul>\n`;

    // Insérer avant le dernier </p> ou à la fin
    const lastParagraph = htmlContent.lastIndexOf('</p>');
    if (lastParagraph !== -1) {
      return htmlContent.substring(0, lastParagraph + 4) + relatedSection + htmlContent.substring(lastParagraph + 4);
    } else {
      return htmlContent + relatedSection;
    }
  }

  /**
   * Valider que le contenu ne dépasse pas les limites
   */
  validateLinkDensity(content, wordCount) {
    const linkCount = this.countLinks(content);
    const linkDensity = (linkCount / wordCount) * 100;

    console.log(`\n📊 VALIDATION DE LA DENSITÉ DE LIENS:`);
    console.log(`====================================`);
    console.log(`  - Mots: ${wordCount}`);
    console.log(`  - Liens: ${linkCount}`);
    console.log(`  - Densité: ${linkDensity.toFixed(2)}%`);

    if (linkDensity > 3) {
      console.log(`  ⚠️ Densité élevée (>3%) - Peut affecter le SEO`);
      return false;
    } else if (linkDensity < 0.5) {
      console.log(`  ⚠️ Densité faible (<0.5%) - Opportunités manquées`);
      return false;
    } else {
      console.log(`  ✅ Densité optimale (0.5-3%)`);
      return true;
    }
  }
}

// Exporter la classe
export { ContextualLinkIntegrator };

// Test si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('⚠️ Pour tester, utilisez: node test-link-integrator.js');
}
