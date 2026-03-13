/**
 * FINALIZER PASSES - Deduplication passes
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */

export function removeDuplicateParagraphs(html, report) {
  const paragraphRegex = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  const matches = [...html.matchAll(paragraphRegex)];

  if (matches.length < 2) return html;

  // AMÉLIORATION: Identifier la section H2 contenant chaque paragraphe
  const h2Pattern = /<h2[^>]*>([^<]+)<\/h2>/gi;
  const h2Matches = [...html.matchAll(h2Pattern)];
  
  // Créer une map des sections (index H2 -> titre)
  const sections = new Map();
  h2Matches.forEach((h2, index) => {
    const h2Index = h2.index ?? -1;
    const nextH2Index = index < h2Matches.length - 1 ? (h2Matches[index + 1].index ?? html.length) : html.length;
    sections.set(h2Index, {
      title: h2[1].trim(),
      start: h2Index,
      end: nextH2Index
    });
  });

  const seen = new Map();
  const toRemove = [];
  const sectionDuplicates = new Map(); // Pour tracker les duplications par section

  for (const m of matches) {
    const raw = m[0];
    const start = m.index ?? -1;
    if (start < 0) continue;

    // Identifier la section contenant ce paragraphe
    let currentSection = null;
    for (const [h2Index, section] of sections.entries()) {
      if (start >= section.start && start < section.end) {
        currentSection = section.title;
        break;
      }
    }

    // PHASE 6.2: Normalisation agressive
    const normalized = this.normalizeTextForComparison(raw);
    
    if (!normalized || normalized.length < 20) continue;

    // Vérifier doublons exacts
    if (seen.has(normalized)) {
      toRemove.push({ start, end: start + raw.length, type: 'exact', section: currentSection });
      if (currentSection) {
        const count = sectionDuplicates.get(currentSection) || 0;
        sectionDuplicates.set(currentSection, count + 1);
      }
    } else {
      // Vérifier quasi-doublons (similarité Jaccard > 0.85 pour être plus sensible)
      let isQuasiDuplicate = false;
      for (const [seenNormalized, seenStart] of seen.entries()) {
        const similarity = this.jaccardSimilarity(normalized, seenNormalized);
        // Seuil a 0.75 pour capturer aussi les reformulations
        if (similarity > 0.75) {
          toRemove.push({ start, end: start + raw.length, type: 'quasi', similarity, section: currentSection });
          if (currentSection) {
            const count = sectionDuplicates.get(currentSection) || 0;
            sectionDuplicates.set(currentSection, count + 1);
          }
          isQuasiDuplicate = true;
          break;
        }
      }
      if (!isQuasiDuplicate) {
        seen.set(normalized, start);
      }
    }
  }

  if (toRemove.length === 0) return html;

  toRemove.sort((a, b) => b.start - a.start);

  let output = html;
  for (const r of toRemove) {
    output = output.slice(0, r.start) + output.slice(r.end);
  }

  const exactCount = toRemove.filter(r => r.type === 'exact').length;
  const quasiCount = toRemove.filter(r => r.type === 'quasi').length;
  
  // AMÉLIORATION: Log des duplications par section
  if (sectionDuplicates.size > 0) {
    console.log('   🔍 Duplications détectées par section:');
    sectionDuplicates.forEach((count, section) => {
      console.log(`      - "${section}": ${count} duplication(s)`);
    });
  }
  
  report.actions.push({ 
    type: 'removed_duplicate_paragraphs', 
    details: `count=${toRemove.length} (exact=${exactCount}, quasi=${quasiCount})` 
  });
  report.metrics.removed_duplicates_count = (report.metrics.removed_duplicates_count || 0) + toRemove.length;

  return output;
}

/**
 * Détecte et supprime les duplications dans une section H2 spécifique
 * Spécialement pour "Ce que la communauté apporte" qui peut contenir des blocs similaires
 * @param {string} html - HTML à analyser
 * @param {string} sectionTitle - Titre de la section H2 à analyser (pattern flexible)
 * @param {Object} report - Rapport QA
 * @returns {string} HTML sans duplications dans la section spécifiée
 */

export function detectSectionDuplications(html, sectionTitle, report) {
  console.log(`🔍 detectSectionDuplications: Analyse de la section "${sectionTitle}"...`);
  
  // Trouver la section H2 correspondante
  const sectionPattern = new RegExp(`<h2[^>]*>.*?${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?<\/h2>`, 'i');
  const sectionMatch = html.match(sectionPattern);
  
  if (!sectionMatch) {
    console.log(`   ℹ️ Section "${sectionTitle}" non trouvée`);
    return html;
  }
  
  const sectionStart = sectionMatch.index ?? -1;
  if (sectionStart < 0) return html;
  
  // Trouver la fin de la section (prochain H2 ou fin du document)
  const afterSection = html.substring(sectionStart + sectionMatch[0].length);
  const nextH2Match = afterSection.match(/<h2[^>]*>/i);
  const sectionEnd = nextH2Match 
    ? sectionStart + sectionMatch[0].length + (nextH2Match.index ?? 0)
    : html.length;
  
  const sectionContent = html.substring(sectionStart, sectionEnd);
  
  // Extraire tous les paragraphes de cette section
  const paragraphRegex = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  const paragraphs = [];
  let match;
  
  while ((match = paragraphRegex.exec(sectionContent)) !== null) {
    const raw = match[0];
    const relativeStart = match.index ?? -1;
    const absoluteStart = sectionStart + relativeStart;
    
    const normalized = this.normalizeTextForComparison(raw);
    if (!normalized || normalized.length < 30) continue;
    
    paragraphs.push({
      raw,
      normalized,
      absoluteStart,
      absoluteEnd: absoluteStart + raw.length,
      relativeStart
    });
  }
  
  if (paragraphs.length < 2) {
    console.log(`   ✅ Section "${sectionTitle}" : pas assez de paragraphes pour détecter des duplications`);
    return html;
  }
  
  // Détecter les blocs similaires (groupes de paragraphes consécutifs)
  // AMÉLIORATION: Détecter aussi les blocs de 2-3 paragraphes consécutifs similaires
  const seenBlocks = new Map();
  const toRemove = [];
  
  // D'abord, détecter les paragraphes individuels similaires
  paragraphs.forEach((para, i) => {
    let isDuplicate = false;
    for (const [seenNormalized, seenIndex] of seenBlocks.entries()) {
      const similarity = this.jaccardSimilarity(para.normalized, seenNormalized);
      if (similarity > 0.85) {
        // Paragraphe similaire trouvé, garder le premier, supprimer celui-ci
        toRemove.push({
          start: para.absoluteStart,
          end: para.absoluteEnd,
          type: 'similar',
          similarity: similarity.toFixed(2)
        });
        isDuplicate = true;
        console.log(`   🔄 Duplication détectée dans "${sectionTitle}" (${Math.round(similarity * 100)}% similaire)`);
        break;
      }
    }
    if (!isDuplicate) {
      seenBlocks.set(para.normalized, i);
    }
  });
  
  // Ensuite, détecter les blocs de 2-3 paragraphes consécutifs similaires
  for (let blockSize = 2; blockSize <= 3; blockSize++) {
    for (let i = 0; i <= paragraphs.length - blockSize; i++) {
      const block1 = paragraphs.slice(i, i + blockSize);
      const block1Text = block1.map(p => p.normalized).join(' ');
      
      for (let j = i + blockSize; j <= paragraphs.length - blockSize; j++) {
        const block2 = paragraphs.slice(j, j + blockSize);
        const block2Text = block2.map(p => p.normalized).join(' ');
        
        const similarity = this.jaccardSimilarity(block1Text, block2Text);
        if (similarity > 0.85) {
          // Bloc similaire trouvé, supprimer le second bloc
          const block2Start = block2[0].absoluteStart;
          const block2End = block2[block2.length - 1].absoluteEnd;
          toRemove.push({
            start: block2Start,
            end: block2End,
            type: `block_${blockSize}`,
            similarity: similarity.toFixed(2)
          });
          console.log(`   🔄 Bloc de ${blockSize} paragraphe(s) dupliqué détecté dans "${sectionTitle}" (${Math.round(similarity * 100)}% similaire)`);
        }
      }
    }
  }
  
  if (toRemove.length === 0) {
    console.log(`   ✅ Section "${sectionTitle}" : aucune duplication détectée`);
    return html;
  }
  
  // Supprimer les duplications en ordre inverse pour préserver les indices
  toRemove.sort((a, b) => b.start - a.start);
  
  let output = html;
  for (const r of toRemove) {
    output = output.slice(0, r.start) + output.slice(r.end);
  }
  
  report.actions.push({
    type: 'removed_section_duplications',
    details: `section="${sectionTitle}" count=${toRemove.length}`
  });
  console.log(`   ✅ ${toRemove.length} duplication(s) supprimée(s) dans "${sectionTitle}"`);
  
  return output;
}

/**
 * PHASE 6.1: QA Report déterministe
 * @param {string} html - HTML final de l'article
 * @param {Object} pipelineContext - Contexte du pipeline
 * @param {Object} analysis - Analyse de l'article
 * @returns {Object} Rapport QA avec checks, actions, issues, metrics
 */

export function removeDuplicateSections(html) {
  console.log('🧹 removeDuplicateSections: Début du nettoyage...');
  console.log(`   HTML length: ${html.length} caractères`);
  
  // Debug: Compter les H2 "Ce que la communauté apporte"
  const allH2Community = html.match(/<h2[^>]*>Ce que la communauté apporte[^<]*<\/h2>/gi);
  console.log(`   H2 "Ce que la communauté apporte" trouvés: ${allH2Community ? allH2Community.length : 0}`);
  if (allH2Community) {
    allH2Community.forEach((h2, i) => console.log(`     ${i+1}. ${h2}`));
  }
  
  let cleanedHtml = html;
  let duplicatesFound = 0;
  
  // Pattern 1: Supprimer "Ce que la communauté apporte (suite)" si suivi de "Ce que la communauté apporte"
  const pattern1 = /<h2[^>]*>Ce que la communauté apporte \(suite\)<\/h2>\s*<h2[^>]*>Ce que la communauté apporte<\/h2>/gi;
  const matches1 = cleanedHtml.match(pattern1);
  if (matches1) {
    cleanedHtml = cleanedHtml.replace(pattern1, '<h2>Ce que la communauté apporte</h2>');
    duplicatesFound += matches1.length;
    console.log(`   🧹 Duplication H2 supprimée: "Ce que la communauté apporte (suite)" + "Ce que la communauté apporte" (${matches1.length} occurrence(s))`);
  }
  
  // Pattern 2: Supprimer "Ce que la communauté apporte" si précédé de "Ce que la communauté apporte (suite)"
  const pattern2 = /<h2[^>]*>Ce que la communauté apporte<\/h2>\s*<h2[^>]*>Ce que la communauté apporte \(suite\)<\/h2>/gi;
  const matches2 = cleanedHtml.match(pattern2);
  if (matches2) {
    cleanedHtml = cleanedHtml.replace(pattern2, '<h2>Ce que la communauté apporte</h2>');
    duplicatesFound += matches2.length;
    console.log(`   🧹 Duplication H2 supprimée: "Ce que la communauté apporte" + "Ce que la communauté apporte (suite)" (${matches2.length} occurrence(s))`);
  }
  
  // Pattern 3: Supprimer toute occurrence isolée de "(suite)" dans les H2
  const pattern3 = /<h2[^>]*>([^<]+)\s*\(suite\)<\/h2>/gi;
  const matches3 = cleanedHtml.match(pattern3);
  if (matches3) {
    cleanedHtml = cleanedHtml.replace(pattern3, (match, title) => {
      console.log(`   🧹 Nettoyage H2: "${title} (suite)" → "${title}"`);
      return `<h2>${title.trim()}</h2>`;
    });
    duplicatesFound += matches3.length;
  }
  
  if (duplicatesFound > 0) {
    console.log(`   ✅ ${duplicatesFound} duplication(s) de sections nettoyée(s)`);
  }
  
  return cleanedHtml;
}

/**
 * Supprime les blockquotes dupliqués
 * @param {string} html - HTML de l'article
 * @returns {string} HTML nettoyé
 */

export function removeDuplicateBlockquotes(html) {
  console.log('🧹 removeDuplicateBlockquotes: Début du nettoyage...');
  
  // Extraire tous les blockquotes avec leur position
  const blockquoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  const blockquotes = [];
  let match;
  const allMatches = [];
  
  // Collecter tous les matches d'abord
  while ((match = blockquoteRegex.exec(html)) !== null) {
    allMatches.push({
      fullMatch: match[0],
      content: match[1].replace(/<[^>]+>/g, '').trim(), // Texte sans HTML
      index: match.index
    });
  }
  
  if (allMatches.length <= 1) {
    return html; // Pas de duplication possible
  }
  
  // Normaliser pour comparaison (plus robuste)
  const normalize = (text) => {
    // Nettoyer le texte plus agressivement
    return text
      .toLowerCase()
      .replace(/<[^>]+>/g, '') // Supprimer HTML
      .replace(/[^\w\s]/g, '') // Supprimer ponctuation
      .replace(/\s+/g, ' ') // Normaliser espaces
      .trim()
      .substring(0, 200); // Prendre les 200 premiers caractères pour meilleure détection
  };
  
  // Trouver les doublons (garder le premier, marquer les suivants)
  const seen = new Map();
  const duplicates = [];
  
  for (let i = 0; i < allMatches.length; i++) {
    const normalized = normalize(allMatches[i].content);
    if (normalized.length < 20) continue; // Ignorer blockquotes trop courts
    
    if (seen.has(normalized)) {
      duplicates.push(allMatches[i]);
    } else {
      seen.set(normalized, allMatches[i]);
    }
  }
  
  if (duplicates.length === 0) {
    console.log('   ✅ Aucun blockquote dupliqué détecté');
    return html; // Pas de doublons
  }
  
  // Supprimer les doublons (du plus récent au plus ancien pour préserver les indices)
  let cleanedHtml = html;
  let removedCount = 0;
  
  // Trier par index décroissant pour supprimer du plus récent au plus ancien
  duplicates.sort((a, b) => b.index - a.index);
  
  for (const duplicate of duplicates) {
    // Échapper les caractères spéciaux regex
    const escapedMatch = duplicate.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Remplacer par chaîne vide (supprimer)
    cleanedHtml = cleanedHtml.replace(escapedMatch, '');
    removedCount++;
    console.log(`   🧹 Blockquote dupliqué supprimé: "${duplicate.content.substring(0, 60)}..."`);
  }
  
  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} blockquote(s) dupliqué(s) supprimé(s)`);
  }
  
  return cleanedHtml;
}

/**
 * Supprime le texte parasite ajouté par le renforcement SEO
 * @param {string} html - HTML de l'article
 * @returns {string} HTML nettoyé
 */

export function deduplicateBlockquotes(html) {
  if (!html || typeof html !== 'string') return html;
  
  // Extraire tous les blockquotes
  const blockquoteRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  const seen = new Set();
  let dedupCount = 0;
  
  // NOUVEAU : Extraire le texte de l'intro (paragraphes avant le premier H2)
  // pour détecter si un blockquote répète le contenu de l'intro
  const firstH2Idx = html.search(/<h2[\s>]/i);
  let introText = '';
  if (firstH2Idx > 0) {
    introText = html.substring(0, firstH2Idx)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  
  const result = html.replace(blockquoteRegex, (fullMatch, innerContent) => {
    // Normaliser le contenu pour la comparaison (retirer HTML, espaces multiples)
    const normalized = innerContent.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Si le contenu est trop court (< 20 chars), le garder (pas une vraie citation)
    if (normalized.length < 20) return fullMatch;
    
    // NOUVEAU : Vérifier si le blockquote répète le contenu de l'intro
    if (introText.length > 50 && normalized.length > 30) {
      const bqWords = new Set(normalized.split(/\s+/).filter(w => w.length > 3));
      const introWords = new Set(introText.split(/\s+/).filter(w => w.length > 3));
      const intersection = [...bqWords].filter(w => introWords.has(w)).length;
      const jaccard = bqWords.size > 0 ? intersection / bqWords.size : 0;
      if (jaccard >= 0.50) {
        dedupCount++;
        console.log(`   🔍 BLOCKQUOTE_DEDUP: blockquote répète l'intro (Jaccard=${jaccard.toFixed(2)} ≥ 0.50), supprimé`);
        return ''; // Supprimer le blockquote qui répète l'intro
      }
    }
    
    // Vérifier si une citation similaire existe déjà (substring ou Jaccard ≥ 60%)
    for (const seenText of seen) {
      if (normalized === seenText || normalized.includes(seenText) || seenText.includes(normalized)) {
        dedupCount++;
        console.log(`   🔍 BLOCKQUOTE_DEDUP: exact/substring match`);
        return ''; // Supprimer le doublon
      }
      // Check substring overlap (80%)
      const shorter = normalized.length < seenText.length ? normalized : seenText;
      const longer = normalized.length >= seenText.length ? normalized : seenText;
      if (shorter.length > 30 && longer.includes(shorter.substring(0, Math.floor(shorter.length * 0.8)))) {
        dedupCount++;
        return ''; // Supprimer le quasi-doublon
      }
      // Check Jaccard word similarity (≥ 60% des mots en commun)
      if (shorter.length > 30) {
        const wordsA = new Set(normalized.split(/\s+/).filter(w => w.length > 3));
        const wordsB = new Set(seenText.split(/\s+/).filter(w => w.length > 3));
        const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
        const union = new Set([...wordsA, ...wordsB]).size;
        const jaccard = union > 0 ? intersection / union : 0;
        if (jaccard >= 0.6) {
          dedupCount++;
          console.log(`   🔍 BLOCKQUOTE_DEDUP: Jaccard=${jaccard.toFixed(2)} ≥ 0.60`);
          return ''; // Supprimer le quasi-doublon
        }
      }
    }
    
    seen.add(normalized);
    return fullMatch;
  });
  
  if (dedupCount > 0) {
    console.log(`   🧹 ${dedupCount} blockquote(s) dupliquée(s) supprimée(s)`);
  }
  
  return result;
}


export function removeDuplicateH2Sections(html) {
  console.log('🧹 removeDuplicateH2Sections: Détection des sections H2 dupliquées...');
  
  let cleanedHtml = html;
  let removedCount = 0;
  
  // Extraire tous les H2 avec leur contenu jusqu'au prochain H2
  const h2Pattern = /<h2[^>]*>([^<]+)<\/h2>/gi;
  const h2Matches = [];
  let match;
  
  while ((match = h2Pattern.exec(html)) !== null) {
    h2Matches.push({
      fullMatch: match[0],
      title: match[1].trim(),
      index: match.index,
      normalizedTitle: match[1].trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
    });
  }
  
  // Détecter les duplications (normaliser les titres pour comparaison)
  const seenTitles = new Map();
  const duplicates = [];
  let firstLimitesIndex = -1;
  let firstLimitesIsFR = false;
  
  h2Matches.forEach((h2, index) => {
    const normalized = h2.normalizedTitle;
    
    // Patterns spéciaux pour "Limites et biais" (variations: Limites, Limitations, Limits)
    const limitesPatternFR = /limites?\s*(et\s*)?biais/i;
    const limitesPatternFR2 = /limitations?\s*(et\s*)?biais/i;
    const limitesPatternEN = /limits?\s*(and\s*)?bias(es)?/i;
    const isLimitesFR = limitesPatternFR.test(h2.title) || limitesPatternFR2.test(h2.title);
    const isLimitesEN = limitesPatternEN.test(h2.title);
    const isLimites = isLimitesFR || isLimitesEN;
    
    // Clé normalisée pour "Limites et biais" (gère français et anglais)
    const limitesKey = 'limites et biais';
    
    // Si c'est une section "Limites et biais" (FR ou EN) et qu'on en a déjà vu une, c'est une duplication
    let isDuplicate = seenTitles.has(normalized) || (isLimites && seenTitles.has(limitesKey));
    
    // Détection par préfixe commun : "Ce que les autres ne disent pas" vs
    // "Ce que les autres ne disent pas: l'inertie du choix" sont des doublons
    let prefixDupOf = null;
    if (!isDuplicate && !isLimites) {
      for (const [seenNorm, seenIdx] of seenTitles.entries()) {
        if (seenNorm === limitesKey) continue;
        const shorter = normalized.length <= seenNorm.length ? normalized : seenNorm;
        const longer  = normalized.length >  seenNorm.length ? normalized : seenNorm;
        if (shorter.length >= 15 && longer.startsWith(shorter)) {
          isDuplicate = true;
          prefixDupOf = { seenNorm, seenIdx, shorter, longer, currentIsLonger: normalized.length > seenNorm.length };
          console.log(`   🔍 H2_PREFIX_DUP: "${normalized.substring(0, 50)}" ≈ "${seenNorm.substring(0, 50)}"`);
          break;
        }
      }
    }
    
    // AMÉLIORATION: Toujours privilégier la version FR, supprimer l'EN
    if (isLimites && firstLimitesIndex >= 0) {
      // On a déjà vu une section "Limites et biais"
      if (isLimitesEN) {
        // Toujours supprimer la version EN si on a déjà vu une section (FR ou EN)
        const startIndex = h2.index;
        const nextH2Index = index < h2Matches.length - 1 ? h2Matches[index + 1].index : html.length;
        const sectionContent = html.substring(startIndex, nextH2Index);
        
        duplicates.push({
          fullMatch: sectionContent,
          index: startIndex,
          title: h2.title,
          isLimites: true,
          isLimitesFR: false,
          isLimitesEN: true
        });
      } else if (isLimitesFR && !firstLimitesIsFR) {
        // On a vu EN d'abord, maintenant FR: supprimer l'EN précédente
        const prevH2 = h2Matches[firstLimitesIndex];
        const prevStartIndex = prevH2.index;
        const prevNextH2Index = firstLimitesIndex < h2Matches.length - 1 ? h2Matches[firstLimitesIndex + 1].index : html.length;
        const prevSectionContent = html.substring(prevStartIndex, prevNextH2Index);
        
        duplicates.push({
          fullMatch: prevSectionContent,
          index: prevStartIndex,
          title: prevH2.title,
          isLimites: true,
          isLimitesFR: false,
          isLimitesEN: true
        });
        
        // Mettre à jour pour garder le FR
        firstLimitesIsFR = true;
        firstLimitesIndex = index;
      }
    } else if (isDuplicate && prefixDupOf) {
      // Duplication par préfixe : garder la section la plus longue (plus de contenu)
      const currentStart = h2.index;
      const currentEnd = index < h2Matches.length - 1 ? h2Matches[index + 1].index : html.length;
      const currentSection = html.substring(currentStart, currentEnd);
      
      const prevH2Idx = typeof prefixDupOf.seenIdx === 'number' ? prefixDupOf.seenIdx : -1;
      const prevH2 = prevH2Idx >= 0 ? h2Matches[prevH2Idx] : null;
      
      if (prevH2) {
        const prevStart = prevH2.index;
        const prevEnd = prevH2Idx < h2Matches.length - 1 ? h2Matches[prevH2Idx + 1].index : html.length;
        const prevSection = html.substring(prevStart, prevEnd);
        
        if (currentSection.length >= prevSection.length) {
          // Section actuelle plus longue : supprimer la précédente
          duplicates.push({ fullMatch: prevSection, index: prevStart, title: prevH2.title, isLimites: false });
          // Remplacer l'entrée seenTitles par la section actuelle
          seenTitles.delete(prefixDupOf.seenNorm);
          seenTitles.set(normalized, index);
        } else {
          // Section précédente plus longue : supprimer la section actuelle
          duplicates.push({ fullMatch: currentSection, index: currentStart, title: h2.title, isLimites: false });
        }
      } else {
        // Fallback : supprimer la section actuelle
        duplicates.push({ fullMatch: currentSection, index: currentStart, title: h2.title, isLimites: false });
      }
    } else if (isDuplicate) {
      // Duplication classique (même titre exact)
      const startIndex = h2.index;
      const nextH2Index = index < h2Matches.length - 1 ? h2Matches[index + 1].index : html.length;
      const sectionContent = html.substring(startIndex, nextH2Index);
      
      duplicates.push({
        fullMatch: sectionContent,
        index: startIndex,
        title: h2.title,
        isLimites
      });
    } else {
      seenTitles.set(normalized, index);
      if (isLimites) {
        seenTitles.set(limitesKey, index);
        if (firstLimitesIndex < 0) {
          firstLimitesIndex = index;
          firstLimitesIsFR = isLimitesFR;
        }
      }
    }
  });
  
  // Supprimer les duplications (en ordre inverse pour préserver les indices)
  if (duplicates.length > 0) {
    duplicates.reverse().forEach(dup => {
      cleanedHtml = cleanedHtml.substring(0, dup.index) + cleanedHtml.substring(dup.index + dup.fullMatch.length);
      removedCount++;
      console.log(`   🧹 Section H2 dupliquée supprimée: "${dup.title.substring(0, 50)}..."`);
    });
  }
  
  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} section(s) H2 dupliquée(s) supprimée(s)`);
  } else {
    console.log('   ✅ Aucune section H2 dupliquée détectée');
  }
  
  return cleanedHtml;
}

/**
 * Normalise les espaces et sauts de ligne dans le HTML
 * Corrige les phrases collées, les espaces multiples, et les sauts de ligne bizarres
 * @param {string} html - HTML à normaliser
 * @param {Object} report - Rapport QA
 * @returns {string} HTML normalisé
 */

