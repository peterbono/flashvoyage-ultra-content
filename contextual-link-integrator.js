#!/usr/bin/env node

/**
 * INTÉGRATEUR CONTEXTUEL - INSÉRER LES LIENS INTELLIGEMMENT DANS L'ARTICLE
 */

import { OpenAI } from 'openai';
import { OPENAI_API_KEY } from './config.js';

class ContextualLinkIntegrator {
  constructor() {
    this.linkStyle = 'color: #dc2626; text-decoration: underline;';
    this.maxLinksPerArticle = 15;
    
    // Initialiser OpenAI pour générer des phrases de transition
    this.useLLM = Boolean(OPENAI_API_KEY);
    if (this.useLLM) {
      this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      console.log('✅ Génération LLM activée pour phrases de transition');
    } else {
      console.log('⚠️ Génération LLM désactivée (pas de clé API) - Utilisation structure par défaut');
    }
  }

  /**
   * Intégrer les liens suggérés dans le contenu HTML
   * Différencie les liens INTERNES (cherche ancre exacte) et EXTERNES (insertion contextuelle)
   */
  async integrateLinks(htmlContent, suggestedLinks) {
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

    // CORRECTION 2: Filtrer les liens avec ancre vide ou bit.ly (pub)
    const validLinks = suggestedLinks.filter(link => {
      const anchorText = link.anchor_text || '';
      const linkUrl = link.article_url || link.url || '';
      
      // Exclure les liens avec ancre vide
      if (anchorText.trim().length === 0) {
        console.log(`⏭️ Lien ignoré: ancre vide (${linkUrl.substring(0, 50)})`);
        return false;
      }
      
      // Exclure les liens bit.ly (pub WordPress)
      if (linkUrl.includes('bit.ly') || linkUrl.includes('jnewsio')) {
        console.log(`⏭️ Lien ignoré: lien pub (${linkUrl})`);
        return false;
      }
      
      return true;
    });

    // CORRECTION 4: Dédupliquer les liens par URL
    const seenUrls = new Map();
    const deduplicatedLinks = [];
    
    for (const link of validLinks) {
      const linkUrl = link.article_url || link.url;
      if (!linkUrl) continue;
      
      // Normaliser l'URL (enlever trailing slash, etc.)
      const normalizedUrl = linkUrl.replace(/\/$/, '').toLowerCase();
      
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.set(normalizedUrl, true);
        deduplicatedLinks.push(link);
      } else {
        console.log(`⏭️ Lien ignoré: doublon (${linkUrl.substring(0, 50)})`);
      }
    }

    // Trier les liens par score de pertinence (du plus pertinent au moins pertinent)
    const sortedLinks = [...deduplicatedLinks].sort((a, b) => b.relevance_score - a.relevance_score);

    console.log(`📊 Liens à intégrer: ${sortedLinks.length} (${validLinks.length - sortedLinks.length} filtrés/dédupliqués)`);
    console.log(`🎯 Limite maximale: ${this.maxLinksPerArticle}\n`);

    // NOUVELLE APPROCHE: Regrouper les liens externes par mot-clé avant insertion
    const externalLinksByKeyword = new Map(); // keyword -> array of {anchor, url, title, relevance_score}
    const internalLinks = [];

    // Séparer les liens internes et externes, et regrouper les externes par mot-clé
    for (const link of sortedLinks) {
      const linkUrl = link.article_url || link.url;
      const linkTitle = link.article_title || link.anchor_text;
      
      // DÉTECTION : Lien interne ou externe ?
      const isExternalLink = linkUrl && !linkUrl.includes('flashvoyage.com') && !linkUrl.startsWith('/');
      
      if (isExternalLink) {
        // Trouver le mot-clé pour ce lien externe
        const keywordResult = this.findKeywordForExternalLink(updatedContent, link.anchor_text, linkTitle);
        
        if (keywordResult && keywordResult.keyword) {
          // Regrouper par mot-clé
          if (!externalLinksByKeyword.has(keywordResult.keyword)) {
            externalLinksByKeyword.set(keywordResult.keyword, {
              keyword: keywordResult.keyword,
              position: keywordResult.position,
              links: []
            });
          }
          
          externalLinksByKeyword.get(keywordResult.keyword).links.push({
            anchor: link.anchor_text,
            url: linkUrl,
            title: linkTitle,
            relevance_score: link.relevance_score || 5
          });
        } else {
          console.log(`⏭️ [EXTERNE] Pas de contexte trouvé pour "${link.anchor_text}" - Ignoré`);
          linksSkipped++;
        }
      } else {
        // Liens internes à traiter séparément
        internalLinks.push(link);
      }
    }

    // CORRECTION: Trier les liens externes par position pour détecter les liens proches
    // et les regrouper même si mots-clés différents
    const sortedExternalLinks = Array.from(externalLinksByKeyword.entries())
      .sort((a, b) => a[1].position.position - b[1].position.position);
    
    // Insérer les liens externes groupés par mot-clé
    for (let i = 0; i < sortedExternalLinks.length; i++) {
      if (linksIntegrated >= this.maxLinksPerArticle) {
        console.log(`⚠️ Limite de ${this.maxLinksPerArticle} liens atteinte`);
        break;
      }

      const [keyword, keywordData] = sortedExternalLinks[i];
      const links = keywordData.links;
      if (links.length === 0) continue;

      // CORRECTION: Vérifier si le prochain lien externe est très proche (moins de 50 caractères)
      // Si oui, regrouper les deux groupes de liens
      let nearbyLinks = [...links];
      let nearbyKeyword = keyword;
      let nearbyPosition = keywordData.position;
      
      if (i + 1 < sortedExternalLinks.length) {
        const nextKeywordData = sortedExternalLinks[i + 1][1];
        const distance = nextKeywordData.position.position - keywordData.position.position;
        
        // Si les deux liens sont très proches (moins de 50 caractères), les regrouper
        if (distance < 50 && distance > 0) {
          nearbyLinks.push(...nextKeywordData.links);
          // Utiliser la position du premier comme point d'insertion
          nearbyPosition = keywordData.position;
          // Passer le prochain lien (skip it)
          i++;
          console.log(`🔗 [EXTERNE] Regroupement de ${links.length} + ${nextKeywordData.links.length} liens proches (distance: ${distance} chars)`);
        }
      }

      // Si un seul lien (ou groupe non regroupé), insertion simple
      if (nearbyLinks.length === 1) {
        const insertionResult = this.insertSingleExternalLink(
          updatedContent,
          nearbyLinks[0].anchor,
          nearbyLinks[0].url,
          nearbyLinks[0].title,
          nearbyKeyword,
          nearbyPosition
        );
        
        if (insertionResult.inserted) {
          updatedContent = insertionResult.content;
          linksIntegrated++;
          console.log(`✅ ${linksIntegrated}. [EXTERNE] "${nearbyLinks[0].anchor}" → ${nearbyLinks[0].title.substring(0, 50)}...`);
        }
      } else {
        // Plusieurs liens (même mot-clé ou liens proches) → générer une phrase structurée
        const insertionResult = await this.insertMultipleExternalLinks(
          updatedContent,
          nearbyLinks,
          nearbyKeyword,
          nearbyPosition
        );
        
        if (insertionResult.inserted) {
          updatedContent = insertionResult.content;
          linksIntegrated += nearbyLinks.length;
          console.log(`✅ ${linksIntegrated - nearbyLinks.length + 1}-${linksIntegrated}. [EXTERNE] ${nearbyLinks.length} liens groupés pour "${nearbyKeyword}"`);
          nearbyLinks.forEach(link => {
            console.log(`   - "${link.anchor}" → ${link.title.substring(0, 40)}...`);
          });
        }
      }
    }

    // Traiter les liens internes (logique existante)
    for (const link of internalLinks) {
      // Vérifier si on n'a pas dépassé la limite
      if (linksIntegrated >= this.maxLinksPerArticle) {
        console.log(`⚠️ Limite de ${this.maxLinksPerArticle} liens atteinte`);
        break;
      }

      const linkUrl = link.article_url || link.url;
      const linkTitle = link.article_title || link.anchor_text;
      
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
      
      // CORRECTION: Recherche directe avec regex dans le HTML (plus simple et robuste)
      const anchorLower = finalAnchor.toLowerCase().trim();
      const escapedAnchor = this.escapeRegex(anchorLower);
      
      // Construire un regex qui cherche l'ancre dans le HTML (en ignorant les balises)
      // Pattern: ancre avec limites de mots, mais peut contenir des balises HTML entre les mots
      const anchorWords = anchorLower.split(/\s+/).filter(w => w.length > 0);
      const anchorPattern = anchorWords.map(w => this.escapeRegex(w)).join('\\s*(?:<[^>]*>)?\\s*');
      const htmlAnchorRegex = new RegExp(`(\\b${anchorPattern}\\b)`, 'gi');
      
      // Trouver toutes les occurrences dans le HTML
      const allMatches = [...updatedContent.matchAll(htmlAnchorRegex)];
      
      let replaceMatch = null;
      let matchIndex = -1;
      
      // Chercher la première occurrence qui n'est pas déjà dans un lien
      for (const match of allMatches) {
        const testIndex = match.index;
        const matchedText = match[0];
        
        // Vérifier que ce n'est pas déjà dans un lien
        const htmlBefore = updatedContent.substring(0, testIndex);
        const openLinksBefore = (htmlBefore.match(/<a[^>]*>/gi) || []).length;
        const closeLinksBefore = (htmlBefore.match(/<\/a>/gi) || []).length;
        const isInLink = openLinksBefore > closeLinksBefore;
        
        if (!isInLink) {
          // Vérifier les limites de mots dans le texte visible (hors balises HTML)
          const textBefore = htmlBefore.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          const textAfter = updatedContent.substring(testIndex + matchedText.length)
            .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          
          const beforeChar = textBefore.length > 0 ? textBefore[textBefore.length - 1] : '';
          const afterChar = textAfter.length > 0 ? textAfter[0] : '';
          
          const isWordBoundaryBefore = !beforeChar || !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(beforeChar);
          const isWordBoundaryAfter = !afterChar || !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(afterChar);
          
          if (isWordBoundaryBefore && isWordBoundaryAfter) {
            replaceMatch = match;
            matchIndex = testIndex;
            console.log(`🔧 [DEBUG] Ancre "${finalAnchor}" trouvée dans HTML à la position ${matchIndex}`);
            break;
          }
        }
      }
      
      if (!replaceMatch || matchIndex === -1) {
        // Fallback : essayer une recherche plus simple sans limites de mots strictes
        console.log(`🔧 [DEBUG] Fallback: recherche simple de "${finalAnchor}" dans HTML`);
        
        // Recherche simple de l'ancre dans le HTML (sans limites de mots strictes)
        const simpleAnchorRegex = new RegExp(`(${escapedAnchor})`, 'gi');
        const simpleMatches = [...updatedContent.matchAll(simpleAnchorRegex)];
        
        for (const match of simpleMatches) {
          const testIndex = match.index;
          const htmlBefore = updatedContent.substring(0, testIndex);
          
          // Compter les balises <a> ouvertes avant
          const openLinksBefore = (htmlBefore.match(/<a[^>]*>/gi) || []).length;
          const closeLinksBefore = (htmlBefore.match(/<\/a>/gi) || []).length;
          const isInLink = openLinksBefore > closeLinksBefore;
          
          if (!isInLink) {
            replaceMatch = match;
            matchIndex = testIndex;
            console.log(`🔧 [DEBUG] Ancre trouvée (fallback) à la position ${matchIndex}`);
            break;
          }
        }
        
        if (!replaceMatch || matchIndex === -1) {
          console.log(`⏭️ [INTERNE] Ancre "${finalAnchor}" non trouvée dans HTML - Lien ignoré`);
          linksSkipped++;
          continue;
        }
      }
      
      // Remplacer l'ancre par le lien
      const matchedText = replaceMatch[0];
      updatedContent = updatedContent.substring(0, matchIndex) +
        linkHtml +
        updatedContent.substring(matchIndex + matchedText.length);
      console.log(`🔧 [DEBUG] Ancre "${finalAnchor}" remplacée à la position ${matchIndex}`);

      if (updatedContent.length !== beforeLength) {
        linksIntegrated++;
        const displayTitle = linkTitle.substring(0, 50);
        console.log(`✅ ${linksIntegrated}. [INTERNE] "${finalAnchor}" → ${displayTitle}...`);
        if (link.relevance_score) {
          console.log(`   Score: ${link.relevance_score}/10`);
        }
      } else {
        console.log(`⚠️ [DEBUG] Longueur du contenu inchangée après remplacement de "${finalAnchor}"`);
        linksSkipped++;
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
   * CORRECTION 3: Améliore la structure grammaticale si plusieurs liens au même endroit
   * @param {string} htmlContent - Contenu HTML de l'article
   * @param {string} anchorText - Texte d'ancre suggéré (ex: "Digital Nomads Bali")
   * @param {string} url - URL du lien externe
   * @param {string} title - Titre du lien (pour référence)
   * @param {Map} linksByKeyword - Tracker des liens déjà insérés par mot-clé (pour structuration)
   * @returns {Object} - { inserted: boolean, content: string, contextKeyword?: string }
   */
  insertExternalLinkContextually(htmlContent, anchorText, url, title, linksByKeyword = new Map()) {
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
    
    // CORRECTION 3: Vérifier si d'autres liens ont déjà été insérés au même endroit
    const existingLinks = linksByKeyword.get(bestKeyword) || [];
    
    // CORRECTION 3: Limiter à un seul lien externe par mot-clé pour éviter les phrases grammaticalement incorrectes
    // Si un lien existe déjà pour ce mot-clé, ignorer ce nouveau lien
    if (existingLinks.length > 0) {
      console.log(`⏭️ [EXTERNE] Lien "${anchorText}" ignoré: un lien externe existe déjà pour le mot-clé "${bestKeyword}"`);
      return { inserted: false, content: htmlContent };
    }
    
    // Insérer le premier (et seul) lien externe pour ce mot-clé
    const linkHtml = this.createLink(anchorText, url, title);
    const insertionPoint = htmlMatch.position + htmlMatch.keywordLength;
    const beforeText = htmlContent.substring(0, insertionPoint);
    const afterText = htmlContent.substring(insertionPoint);
    
    // CORRECTION 3: Insérer dans une structure grammaticalement correcte
    // Vérifier le contexte avant pour déterminer la meilleure structure
    const contextBefore = beforeText.replace(/<[^>]*>/g, ' ').trim().substring(beforeText.length - 50);
    const contextAfter = afterText.replace(/<[^>]*>/g, ' ').trim().substring(0, 50);
    
    // Si le contexte avant contient "à", "en", "dans", utiliser une structure avec parenthèses
    // Ex: "terrasse ensoleillée à Bali (comme Dojo Bali)" ou "à Bali, notamment Dojo Bali"
    if (contextBefore.match(/\b(à|en|dans|sur)\s+$/i)) {
      // Structure: "[mot-clé] (comme [lien])"
      const separator = ' (comme ';
      const closing = ')';
      const newContent = beforeText + separator + linkHtml + closing + afterText;
      
      return {
        inserted: true,
        content: newContent,
        contextKeyword: bestKeyword
      };
    } else {
      // Structure: "[mot-clé], notamment [lien]" ou "[mot-clé], comme [lien]"
      const separator = ', notamment ';
      const newContent = beforeText + separator + linkHtml + afterText;
      
      return {
        inserted: true,
        content: newContent,
        contextKeyword: bestKeyword
      };
    }
  }
  
  /**
   * Trouver le mot-clé pour un lien externe (utilisé pour regrouper les liens)
   */
  findKeywordForExternalLink(htmlContent, anchorText, title) {
    // CORRECTION: Exclure le début de l'article (source + intro FOMO) de la recherche
    // Trouver où commence le contenu principal (après la source et l'intro)
    
    // Détecter la fin de la section source (balise <p> avec "Source :")
    const sourceRegex = /<p[^>]*>.*?<strong>Source\s*:.*?<\/p>/is;
    const sourceMatch = htmlContent.match(sourceRegex);
    
    // Détecter la fin de l'intro FOMO (balise <p> avec "Pendant que vous" ou "Chez FlashVoyages")
    const fomoIntroRegex = /<p[^>]*>.*?(?:Pendant que vous|Chez FlashVoyages|Imaginez-vous|Plongé dans).*?<\/p>/is;
    const fomoIntroMatch = htmlContent.match(fomoIntroRegex);
    
    // Trouver la position de début du contenu principal
    let contentStartIndex = 0;
    if (sourceMatch) {
      contentStartIndex = Math.max(contentStartIndex, sourceMatch.index + sourceMatch[0].length);
    }
    if (fomoIntroMatch) {
      contentStartIndex = Math.max(contentStartIndex, fomoIntroMatch.index + fomoIntroMatch[0].length);
    }
    
    // Si on a trouvé une source ou une intro, commencer la recherche après
    // Sinon, chercher après les 200 premiers caractères (pour éviter le début de l'article)
    if (contentStartIndex === 0) {
      contentStartIndex = 200; // Au moins 200 caractères pour éviter le début
    }
    
    // Extraire le contenu principal (après la source/intro)
    const mainContent = htmlContent.substring(contentStartIndex);
    
    // Extraire les mots-clés pertinents depuis l'ancre
    const anchorKeywords = this.extractKeywordsFromAnchor(anchorText);
    console.log(`🔍 [DEBUG EXTERNE] Mots-clés extraits depuis "${anchorText}":`, anchorKeywords);
    
    // Si pas de mots-clés pertinents, essayer depuis le titre
    if (anchorKeywords.length === 0) {
      const titleKeywords = this.extractKeywords(title || anchorText);
      anchorKeywords.push(...titleKeywords);
      console.log(`🔍 [DEBUG EXTERNE] Mots-clés extraits depuis le titre "${title}":`, titleKeywords);
    }
    
    if (anchorKeywords.length === 0) {
      console.log(`⏭️ [EXTERNE] Aucun mot-clé extrait pour "${anchorText}" - Ignoré`);
      return null;
    }
    
    // Chercher le premier mot-clé pertinent dans le contenu principal (pas au début)
    const plainContent = mainContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    
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
        console.log(`🔍 [DEBUG EXTERNE] Mot-clé "${keyword}" trouvé dans le contenu à l'index ${index}`);
        
        // CORRECTION: Vérifier qu'il y a suffisamment de contexte avant le mot-clé
        // Si le mot-clé est au début du contenu principal (moins de 10 caractères avant), ignorer
        // Réduit de 20 à 10 pour permettre plus de liens externes
        const beforeKeyword = plainContent.substring(0, index).trim();
        if (beforeKeyword.length < 10) {
          console.log(`⏭️ [EXTERNE] Mot-clé "${keyword}" au début du contenu (${beforeKeyword.length} chars avant) - Ignoré`);
          continue;
        }
        
        // Vérifier que ce n'est pas déjà dans un lien (ajuster l'index avec contentStartIndex)
        const adjustedIndex = index + contentStartIndex;
        if (this.isKeywordInLink(htmlContent, adjustedIndex, keyword)) {
          console.log(`⏭️ [EXTERNE] Mot-clé "${keyword}" déjà dans un lien - Ignoré`);
          continue;
        }
        
        // Vérifier que le contexte est approprié
        const context = this.getContextAround(plainContent, index, keyword.length);
        if (!this.isValidExternalLinkContext(context, keyword)) {
          console.log(`⏭️ [EXTERNE] Contexte invalide pour "${keyword}" - Ignoré`);
          continue;
        }
        
        // Trouver la position exacte dans le HTML (ajuster avec contentStartIndex)
        const htmlMatch = this.findKeywordInHTML(mainContent, keyword, index);
        if (!htmlMatch) {
          console.log(`⏭️ [EXTERNE] Mot-clé "${keyword}" non trouvé dans le HTML - Ignoré`);
          continue;
        }
        
        // Ajuster la position pour tenir compte du début exclu
        const adjustedPosition = htmlMatch.position + contentStartIndex;
        
        // Vérifier que ce n'est pas au début d'un paragraphe dans le HTML
        const htmlBefore = htmlContent.substring(0, adjustedPosition);
        const isAtParagraphStart = /<p[^>]*>\s*$/i.test(htmlBefore) || /<strong[^>]*>\s*$/i.test(htmlBefore);
        
        if (isAtParagraphStart) {
          console.log(`⏭️ [EXTERNE] Mot-clé "${keyword}" au début d'un paragraphe - Ignoré`);
          continue;
        }
        
        console.log(`✅ [DEBUG EXTERNE] Mot-clé "${keyword}" validé et prêt pour insertion à la position ${adjustedPosition}`);
        return {
          keyword: keyword,
          position: adjustedPosition,
          keywordLength: htmlMatch.keywordLength,
          htmlMatch: htmlMatch
        };
      } else {
        console.log(`⏭️ [EXTERNE] Mot-clé "${keyword}" non trouvé dans le contenu principal`);
      }
    }
    
    return null;
  }

  /**
   * Insérer un seul lien externe (structure simple)
   */
  insertSingleExternalLink(htmlContent, anchorText, url, title, keyword, position) {
    const linkHtml = this.createLink(anchorText, url, title);
    const insertionPoint = position.position + (position.keywordLength || keyword.length);
    const beforeText = htmlContent.substring(0, insertionPoint);
    const afterText = htmlContent.substring(insertionPoint);
    
    // CORRECTION: Vérifier qu'il y a suffisamment de contexte avant le mot-clé
    // Si le mot-clé est au début de l'article ou sans contexte, ne pas insérer
    const plainBefore = beforeText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const contextBefore = plainBefore.substring(Math.max(0, plainBefore.length - 100));
    
    // Vérifier qu'il y a au moins 20 caractères de contexte avant le mot-clé
    if (plainBefore.length < 20) {
      console.log(`⏭️ [EXTERNE] Pas assez de contexte avant "${keyword}" (${plainBefore.length} chars) - Ignoré`);
      return { inserted: false, content: htmlContent };
    }
    
    // Vérifier que ce n'est pas au début d'un paragraphe (après <p> ou <strong>)
    const htmlBefore = htmlContent.substring(0, insertionPoint);
    const isAtParagraphStart = /<p[^>]*>\s*$/i.test(htmlBefore) || /<strong[^>]*>\s*$/i.test(htmlBefore);
    
    if (isAtParagraphStart) {
      console.log(`⏭️ [EXTERNE] Mot-clé "${keyword}" au début d'un paragraphe - Ignoré`);
      return { inserted: false, content: htmlContent };
    }
    
    // Vérifier le contexte avant pour déterminer la meilleure structure
    const contextBeforeShort = contextBefore.substring(Math.max(0, contextBefore.length - 50));
    
    // Si le contexte avant contient "à", "en", "dans", utiliser une structure avec parenthèses
    if (contextBeforeShort.match(/\b(à|en|dans|sur)\s+$/i)) {
      // Structure: "[mot-clé] (comme [lien])"
      const separator = ' (comme ';
      const closing = ')';
      const newContent = beforeText + separator + linkHtml + closing + afterText;
      
      return {
        inserted: true,
        content: newContent
      };
    } else {
      // Structure: "[mot-clé], notamment [lien]"
      const separator = ', notamment ';
      const newContent = beforeText + separator + linkHtml + afterText;
      
      return {
        inserted: true,
        content: newContent
      };
    }
  }

  /**
   * Insérer plusieurs liens externes avec une phrase structurée générée par LLM
   */
  async insertMultipleExternalLinks(htmlContent, links, keyword, position) {
    if (!this.useLLM || !this.openai) {
      // Fallback sans LLM : structure simple
      return this.insertMultipleExternalLinksFallback(htmlContent, links, keyword, position);
    }

    try {
      // Extraire le contexte autour du mot-clé
      const insertionPoint = position.position + (position.keywordLength || keyword.length);
      const beforeText = htmlContent.substring(0, insertionPoint);
      const afterText = htmlContent.substring(insertionPoint);
      const contextBefore = beforeText.replace(/<[^>]*>/g, ' ').trim().substring(Math.max(0, beforeText.length - 200));
      const contextAfter = afterText.replace(/<[^>]*>/g, ' ').trim().substring(0, 100);
      
      // Construire les ancres des liens
      const linkAnchors = links.map(link => link.anchor);
      
      // Générer la phrase de transition avec le LLM
      const systemPrompt = `Tu es un rédacteur pour Flash Voyage, un site sur le nomadisme digital.
      
TON: Editorial, professionnel, vouvoiement, utiliser "nous" pour parler de Flash Voyage.

MISSION: Générer une phrase de transition naturelle pour insérer plusieurs liens externes dans un article.

RÈGLES:
- Utiliser le vouvoiement (pas de "je")
- Parler en tant que "nous" (Flash Voyage)
- La phrase doit être naturelle et fluide
- La phrase doit introduire les liens de manière contextuelle
- Maximum 2 phrases
- Ton professionnel et éditorial

EXEMPLE:
"Si vous êtes à la recherche d'espaces de coworking ou de communautés de nomades digitaux, nous vous recommandons de découvrir [lien1], [lien2] et [lien3] pour rencontrer d'autres expatriés."

RÉPONDS UNIQUEMENT avec la phrase de transition (sans les balises HTML des liens, juste le texte).`;

      const userPrompt = `Contexte avant le mot-clé "${keyword}": "${contextBefore}"

Contexte après le mot-clé "${keyword}": "${contextAfter}"

Liens à insérer (dans l'ordre):
${links.map((link, i) => `${i + 1}. ${link.anchor} (${link.title})`).join('\n')}

Génère une phrase de transition naturelle qui introduit ces liens de manière contextuelle.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      let transitionText = response.choices[0].message.content.trim();
      
      // Nettoyer la réponse (enlever guillemets si présents)
      transitionText = transitionText.replace(/^["']|["']$/g, '');
      
      // Remplacer les références aux liens par les ancres réelles
      // Ex: "Dojo Bali, Hubud Bali et Digital Nomads Bali"
      const linkHtmls = links.map(link => this.createLink(link.anchor, link.url, link.title));
      
      // Construire la phrase avec les liens
      let finalText = transitionText;
      
      // Si la phrase contient des références numérotées ou des placeholders, les remplacer
      // Sinon, simplement ajouter les liens à la fin de la phrase
      if (links.length === 2) {
        finalText = finalText.replace(/\s*$/, ' ') + linkHtmls[0] + ' et ' + linkHtmls[1] + '.';
      } else if (links.length === 3) {
        finalText = finalText.replace(/\s*$/, ' ') + linkHtmls[0] + ', ' + linkHtmls[1] + ' et ' + linkHtmls[2] + '.';
      } else {
        // Plus de 3 liens : utiliser des virgules et "et" pour le dernier
        const lastLink = linkHtmls.pop();
        finalText = finalText.replace(/\s*$/, ' ') + linkHtmls.join(', ') + ' et ' + lastLink + '.';
      }
      
      // Insérer la phrase après le mot-clé (réutiliser beforeText et afterText calculés plus haut)
      // Ajouter un point après le mot-clé si nécessaire, puis la phrase
      const newContent = beforeText + '. ' + finalText + ' ' + afterText;
      
      return {
        inserted: true,
        content: newContent
      };
      
    } catch (error) {
      console.warn('⚠️ Erreur génération LLM pour phrase de transition, fallback:', error.message);
      return this.insertMultipleExternalLinksFallback(htmlContent, links, keyword, position);
    }
  }

  /**
   * Fallback pour insérer plusieurs liens sans LLM
   */
  insertMultipleExternalLinksFallback(htmlContent, links, keyword, position) {
    const insertionPoint = position.position + (position.keywordLength || keyword.length);
    const beforeText = htmlContent.substring(0, insertionPoint);
    const afterText = htmlContent.substring(insertionPoint);
    
    // Construire les liens HTML
    const linkHtmls = links.map(link => this.createLink(link.anchor, link.url, link.title));
    
    // Structure simple : "Si vous êtes à la recherche de..., nous vous recommandons..."
    let transitionText = 'Si vous êtes à la recherche d\'espaces de coworking ou de communautés de nomades digitaux, nous vous recommandons de découvrir ';
    
    if (links.length === 2) {
      transitionText += linkHtmls[0] + ' et ' + linkHtmls[1] + '.';
    } else if (links.length === 3) {
      transitionText += linkHtmls[0] + ', ' + linkHtmls[1] + ' et ' + linkHtmls[2] + '.';
    } else {
      const lastLink = linkHtmls.pop();
      transitionText += linkHtmls.join(', ') + ' et ' + lastLink + '.';
    }
    
    const newContent = beforeText + '. ' + transitionText + ' ' + afterText;
    
    return {
      inserted: true,
      content: newContent
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
    // "Reddit Digital Nomad" → ["Reddit", "Portugal"] (si Portugal dans le titre)
    // "Digital Nomads Portugal" → ["Portugal"]
    
    const keywords = [];
    const words = anchorText.split(/\s+/);
    
    // Mots interdits (trop génériques ou courts)
    const forbiddenWords = ['the', 'les', 'des', 'une', 'pour', 'dans', 'avec', 'spaces', 'groups', 
                           'digital', 'nomads', 'nomad', 'group', 'a', 'de', 'du', 'la', 'le', 
                           'un', 'et', 'ou', 'à', 'sur', 'par', 'sous', 'vers', 'pour'];
    
    // CORRECTION: Pour les liens Reddit, extraire "Reddit" même s'il est court
    // Pour les liens Facebook, extraire le nom de destination (Portugal, Thailand, etc.)
    const isRedditLink = anchorText.toLowerCase().includes('reddit') || anchorText.toLowerCase().includes('r/');
    const isFacebookLink = anchorText.toLowerCase().includes('facebook') || anchorText.toLowerCase().includes('groups');
    
    // CORRECTION: Pour "r/digitalnomad", extraire "reddit" et "communauté" comme mots-clés
    // car ces mots sont plus susceptibles d'être présents dans le contenu
    if (isRedditLink) {
      // Toujours ajouter "reddit" comme mot-clé principal (plus générique que "digitalnomad")
      keywords.push('reddit');
      
      // Ajouter aussi "communauté" si présent dans l'ancre ou le titre
      if (anchorText.toLowerCase().includes('communauté') || anchorText.toLowerCase().includes('community')) {
        keywords.push('communauté');
      }
    }
    
    // Chercher les destinations/villes (mots propres, minimum 4 caractères)
    const destinations = words.filter(w => {
      const clean = w.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ]/g, '');
      return clean.length >= 4 &&  // Minimum 4 caractères pour éviter les matches partiels
             !forbiddenWords.includes(clean) &&
             !keywords.includes(clean); // Ne pas ajouter si déjà dans keywords
    });
    
    keywords.push(...destinations);
    
    // CORRECTION: Pour les liens Facebook, ajouter des mots-clés génériques même si destination trouvée
    // car ces mots sont plus susceptibles d'être présents dans le contenu
    if (isFacebookLink) {
      // Ajouter "communauté" ou "groupe" comme mots-clés génériques
      const genericWords = ['communauté', 'community', 'groupe', 'group'];
      for (const generic of genericWords) {
        if (anchorText.toLowerCase().includes(generic)) {
          keywords.push(generic);
          break;
        }
      }
      
      // Si pas de mots génériques trouvés, ajouter "communauté" comme fallback
      if (!genericWords.some(g => keywords.includes(g))) {
        keywords.push('communauté');
      }
    }
    
    // Si pas de destination, chercher d'autres mots-clés pertinents (minimum 5 caractères)
    // MAIS: pour les liens Facebook/Reddit, accepter les mots de 4+ caractères même s'ils sont dans forbiddenWords
    if (keywords.length === 0) {
      const cleanWords = words
        .map(w => w.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ]/g, ''))
        .filter(w => {
          if (isRedditLink || isFacebookLink) {
            // Pour Reddit/Facebook, accepter les mots de 4+ caractères même s'ils sont dans forbiddenWords
            return w.length >= 4;
          }
          return w.length >= 5 && !forbiddenWords.includes(w);
        });
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
    
    // CORRECTION: Exclure les titres de paragraphes (h2, h3, h4, etc.) comme ancres
    // Extraire le texte de tous les titres pour les exclure
    const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
    const headingTexts = new Set();
    let match;
    while ((match = headingRegex.exec(htmlContent)) !== null) {
      const headingText = match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (headingText) {
        headingTexts.add(headingText);
      }
    }
    
    // Vérifier si l'ancre correspond exactement à un titre
    const anchorNormalized = anchorText.trim().toLowerCase();
    if (headingTexts.has(anchorNormalized)) {
      // Si l'ancre est un titre, chercher dans le contenu du paragraphe suivant
      // Pour l'instant, on ignore cette ancre et on continue
      console.log(`⏭️ [INTERNE] Ancre "${anchorText}" est un titre - Recherche alternative...`);
    }
    
    // Essai 1: Recherche exacte (case-insensitive)
    const exactRegex = new RegExp(`\\b${this.escapeRegex(anchorText)}\\b`, 'gi');
    const exactMatches = [...plainContent.matchAll(exactRegex)];
    
    // Chercher la première occurrence qui n'est pas dans un titre
    for (const match of exactMatches) {
      const index = match.index;
      
      // Vérifier si cette occurrence correspond à un titre
      // Pour cela, chercher dans le HTML autour de cette position
      const beforeMatch = plainContent.substring(0, index);
      // Estimer la position HTML approximative
      const htmlBeforeLength = htmlContent.substring(0, index * 2).length; // Approximation
      const htmlAround = htmlContent.substring(Math.max(0, htmlBeforeLength - 100), htmlBeforeLength + 100);
      
      // Vérifier si on est dans un titre
      const isInHeadingTag = /<h[1-6][^>]*>.*?<\/h[1-6]>/i.test(htmlAround);
      
      if (!isInHeadingTag) {
        return {
          fullMatch: match[0],
          index: index,
          method: 'exact'
        };
      }
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
        // Trouver une zone du texte qui contient ces mots proches (hors titres)
        for (let i = 0; i <= matches.length - minWords; i++) {
          const firstMatch = matches[i];
          const lastMatch = matches[i + minWords - 1];
          const distance = lastMatch.index - firstMatch.index;
          
          // Si les mots sont dans un rayon de 100 caractères
          if (distance < 100) {
            // CORRECTION: S'assurer que start et end sont aux limites de mots complets
            let start = Math.max(0, firstMatch.index - 20);
            let end = Math.min(plainContent.length, lastMatch.index + lastMatch[0].length + 20);
            
            // Ajuster start au début du mot le plus proche
            while (start > 0 && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(plainContent[start - 1])) {
              start--;
            }
            // Ajuster end à la fin du mot le plus proche
            while (end < plainContent.length && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(plainContent[end])) {
              end++;
            }
            
            // Vérifier si cette zone n'est pas dans un titre
            const beforeMatch = plainContent.substring(0, start);
            const htmlBeforeLength = htmlContent.substring(0, start * 2).length;
            const htmlAround = htmlContent.substring(Math.max(0, htmlBeforeLength - 100), htmlBeforeLength + 100);
            const isInHeadingTag = /<h[1-6][^>]*>.*?<\/h[1-6]>/i.test(htmlAround);
            
            if (!isInHeadingTag) {
              // Vérifier que l'extraction ne commence pas au milieu d'un mot
              const firstCharBeforeStart = plainContent[start - 1] || '';
              if (start > 0 && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(firstCharBeforeStart)) {
                continue; // Essayer la prochaine occurrence
              }
              
              // Vérifier que l'extraction ne finit pas au milieu d'un mot
              const firstCharAfterEnd = plainContent[end] || '';
              if (end < plainContent.length && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(firstCharAfterEnd)) {
                continue; // Essayer la prochaine occurrence
              }
              
              const extractedText = plainContent.substring(start, end).trim();
              
              // Vérifier que l'extraction ne coupe pas une phrase de manière inappropriée
              // Rejeter si l'extraction commence ou finit par un mot incomplet
              const extractedWords = extractedText.split(/\s+/);
              if (extractedWords.length === 0) {
                continue; // Extraction vide
              }
              
              // Vérifier que le premier et dernier mot de l'extraction sont complets
              const firstWord = extractedWords[0];
              const lastWord = extractedWords[extractedWords.length - 1];
              
              // Si le premier ou dernier mot est trop court (probablement tronqué), rejeter
              if (firstWord.length < 2 || lastWord.length < 2) {
                continue;
              }
              
              return {
                fullMatch: extractedText,
                index: start,
                method: 'flexible'
              };
            }
          }
        }
      }
    }
    
    // Essai 3: Recherche partielle (sans mots courts)
    const significantWords = anchorWords.filter(w => w.length > 4);
    if (significantWords.length > 0) {
      const significantPattern = significantWords.map(w => this.escapeRegex(w)).join('|');
      const partialRegex = new RegExp(`\\b(?:${significantPattern})\\b`, 'gi');
      const partialMatches = [...plainContent.matchAll(partialRegex)];
      
      // Chercher la première occurrence qui n'est pas dans un titre
      for (const partialMatch of partialMatches) {
        const index = partialMatch.index;
        
        // Vérifier si ce n'est pas dans un titre
        const beforeMatch = plainContent.substring(0, index);
        const htmlBeforeLength = htmlContent.substring(0, index * 2).length;
        const htmlAround = htmlContent.substring(Math.max(0, htmlBeforeLength - 100), htmlBeforeLength + 100);
        const isInHeadingTag = /<h[1-6][^>]*>.*?<\/h[1-6]>/i.test(htmlAround);
        
        if (!isInHeadingTag) {
          // CORRECTION: S'assurer que start et end sont aux limites de mots complets
          let start = Math.max(0, index - 10);
          let end = Math.min(plainContent.length, index + partialMatch[0].length + 30);
          
          // Ajuster start au début du mot le plus proche
          while (start > 0 && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(plainContent[start - 1])) {
            start--;
          }
          // Ajuster end à la fin du mot le plus proche
          while (end < plainContent.length && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(plainContent[end])) {
            end++;
          }
          
          // Vérifier que l'extraction ne commence pas au milieu d'un mot
          const firstCharBeforeStart = plainContent[start - 1] || '';
          if (start > 0 && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(firstCharBeforeStart)) {
            continue; // Essayer la prochaine occurrence
          }
          
          const extractedText = plainContent.substring(start, end).trim();
          
          return {
            fullMatch: extractedText,
            index: start,
            method: 'partial'
          };
        }
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
      // CORRECTION: S'assurer que l'ancre commence au début d'un mot complet
      // Si l'ancre commence en milieu de mot, prendre le mot complet depuis le début
      const words = plainContent.split(/\s+/);
      const anchorWords = finalAnchor.trim().split(/\s+/);
      
      // Trouver où commence l'ancre dans le contenu
      const anchorLower = finalAnchor.toLowerCase().trim();
      const plainLower = plainContent.toLowerCase();
      let anchorStartInPlain = plainLower.indexOf(anchorLower);
      
      if (anchorStartInPlain !== -1) {
        // Vérifier si on commence en milieu de mot
        // Si le caractère avant l'ancre est une lettre, on commence en milieu de mot
        if (anchorStartInPlain > 0 && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(plainContent[anchorStartInPlain - 1])) {
          // Trouver le début du mot précédent
          let wordStart = anchorStartInPlain;
          while (wordStart > 0 && /[a-zàâäéèêëïîôùûüÿçœæ]/i.test(plainContent[wordStart - 1])) {
            wordStart--;
          }
          
          // Trouver où commence le mot complet dans plainContent
          const beforeAnchor = plainContent.substring(Math.max(0, wordStart - 50), anchorStartInPlain);
          const firstWordMatch = beforeAnchor.match(/([a-zàâäéèêëïîôùûüÿçœæ]+(?:\s+[a-zàâäéèêëïîôùûüÿçœæ]+)*)\s*$/i);
          
          if (firstWordMatch) {
            // Prendre le mot complet + l'ancre
            const wordStartIndex = wordStart - firstWordMatch[1].length;
            const extendedAnchor = plainContent.substring(wordStartIndex, anchorStartInPlain + anchorLower.length);
            finalAnchor = extendedAnchor.trim();
          }
        }
      }
      
      // S'assurer que l'ancre ne commence pas en milieu de mot (vérification finale)
      const trimmedStart = finalAnchor.replace(/^[^a-zàâäéèêëïîôùûüÿçœæ]*/i, '');
      if (trimmedStart !== finalAnchor) {
        const firstWordMatch = trimmedStart.match(/^([a-zàâäéèêëïîôùûüÿçœæ]+(?:\s+[a-zàâäéèêëïîôùûüÿçœæ]+)*)/i);
        if (firstWordMatch) {
          const firstWordIndex = finalAnchor.indexOf(firstWordMatch[1]);
          finalAnchor = finalAnchor.substring(firstWordIndex);
        }
      }
      
      // S'assurer que l'ancre ne finit pas en milieu de mot
      const trimmedEnd = finalAnchor.replace(/[^a-zàâäéèêëïîôùûüÿçœæ]*$/i, '');
      if (trimmedEnd !== finalAnchor) {
        const lastWordMatch = trimmedEnd.match(/([a-zàâäéèêëïîôùûüÿçœæ]+(?:\s+[a-zàâäéèêëïîôùûüÿçœæ]+)*)[^a-zàâäéèêëïîôùûüÿçœæ]*$/i);
        if (lastWordMatch) {
          const lastWordEnd = finalAnchor.lastIndexOf(lastWordMatch[1]) + lastWordMatch[1].length;
          finalAnchor = finalAnchor.substring(0, lastWordEnd);
        }
      }
    }
    
    // Trouver la position de l'ancre dans le contenu HTML
    const htmlLower = htmlContent.toLowerCase();
    const anchorLower = finalAnchor.toLowerCase().trim();
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
    
    // CORRECTION: Vérifier que l'ancre trouvée ne coupe pas une phrase de manière inappropriée
    // Si l'ancre commence ou finit au milieu d'un mot, rejeter
    if (plainAnchorIndex !== -1) {
      const beforeChar = plainAnchorIndex > 0 ? plainContent[plainAnchorIndex - 1] : '';
      const afterChar = plainAnchorIndex + finalAnchor.length < plainContent.length 
        ? plainContent[plainAnchorIndex + finalAnchor.length] : '';
      
      // Vérifier que c'est bien une limite de mot (pas au milieu d'un mot)
      const isWordBoundaryBefore = !beforeChar || !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(beforeChar);
      const isWordBoundaryAfter = !afterChar || !/[a-zàâäéèêëïîôùûüÿçœæ]/i.test(afterChar);
      
      if (!isWordBoundaryBefore || !isWordBoundaryAfter) {
        // L'ancre ne respecte pas les limites de mots → rejeter
        return {
          valid: false,
          reason: 'Ancre coupée au milieu d\'un mot',
          anchor: '',
          position: 0,
          context: { before: '', after: '' }
        };
      }
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
