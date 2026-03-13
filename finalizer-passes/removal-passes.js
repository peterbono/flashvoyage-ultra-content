/**
 * FINALIZER PASSES - Removal and cleanup passes
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */

import { DRY_RUN } from '../config.js';
import { isKnownLocation, getAllLocationNames } from '../airport-lookup.js';

export function stripNonAsiaSentences(html, finalDestination = null) {
  const NON_ASIA = [
    'portugal','spain','espagne','lisbon','lisbonne','barcelona','barcelone','madrid','porto',
    'france','paris','italy','italie','rome','greece','grèce','turkey','turquie','istanbul',
    'europe','america','usa','brazil','brésil','mexico','mexique'
  ];
  
  // FIX 2: Whitelist pour éviter faux positifs
  const WHITELIST = ['from', 'arome', 'chrome', 'chromosome', 'promote', 'promotion', 'promoteur'];
  
  const isDryRun = DRY_RUN;
  const removedParagraphs = [];
  const triggerTerms = new Set();
  
  // Normaliser la destination finale pour exclusion
  const finalDestLower = finalDestination ? finalDestination.toLowerCase() : null;
  
  // Split par paragraphes HTML — utiliser un split capturant pour préserver les délimiteurs
  // Chaque élément pair est le contenu, chaque élément impair est le délimiteur (</p> ou </div>)
  const parts = html.split(/(<\/p>|<\/div>)/i);
  
  // Reconstruire des segments [contenu + délimiteur] pour le filtrage
  const segments = [];
  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i] || '';
    const delimiter = parts[i + 1] || '';
    segments.push({ content, delimiter, full: content + delimiter });
  }
  
  const filtered = segments.filter(segment => {
    const paraText = segment.content.replace(/<[^>]*>/g, ' ').toLowerCase();
    
    // Ne jamais supprimer les titres
    if (/<h[1-6][^>]*>/.test(segment.content)) {
      return true;
    }
    
    // Ne jamais supprimer si le segment contient la destination finale validée
    if (finalDestLower && paraText.includes(finalDestLower)) {
      return true;
    }
    
    // Match uniquement sur mots entiers avec word boundaries
    const foundTerms = NON_ASIA.filter(term => {
      if (WHITELIST.some(w => paraText.includes(w))) {
        return false;
      }
      const wordBoundaryRegex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return wordBoundaryRegex.test(paraText);
    });
    
    if (foundTerms.length > 0) {
      foundTerms.forEach(term => triggerTerms.add(term));
      
      if (isDryRun) {
        const fullText = segment.content.replace(/<[^>]*>/g, ' ').trim();
        const excerpt = fullText.substring(0, 200);
        removedParagraphs.push({
          term: foundTerms[0],
          excerpt: excerpt + (excerpt.length >= 200 ? '...' : '')
        });
      }
      
      return false;
    }
    
    return true;
  });
  
  // Logs détaillés en DRY_RUN uniquement
  if (isDryRun && removedParagraphs.length > 0) {
    console.log(`🧹 Sanitizer: ${removedParagraphs.length} paragraphe(s) supprimé(s)`);
    console.log(`   Termes déclencheurs: ${Array.from(triggerTerms).join(', ')}`);
    removedParagraphs.slice(0, 3).forEach((item, i) => {
      console.log(`   [${i+1}] term="${item.term}" phrase="...${item.excerpt}..."`);
    });
  } else if (!isDryRun && removedParagraphs.length > 0) {
    console.log(`🧹 Sanitizer: ${removedParagraphs.length} paragraphe(s) supprimé(s)`);
  }
  
  // Reconstruire le HTML en préservant les délimiteurs
  return filtered.map(s => s.full).join('');
}


export function detectRegionalScopeDrift(html, title = '', finalDestination = null) {
  const text = String(html || '').replace(/<[^>]*>/g, ' ').toLowerCase();
  const titleLower = String(title || '').toLowerCase();
  const isSeaScope = /asie\s+du\s+sud-?est|sud-?est\s+asiat/.test(titleLower) ||
    ['thaïlande', 'thailande', 'vietnam', 'indonésie', 'indonesie', 'malaisie', 'singapour', 'philippines', 'cambodge', 'laos', 'myanmar']
      .includes(String(finalDestination || '').toLowerCase());
  if (!isSeaScope) return [];

  const outliers = [
    { label: 'chine', aliases: ['chine', 'china', 'pekin', 'beijing', 'shanghai'] },
    { label: 'japon', aliases: ['japon', 'japan', 'tokyo', 'osaka', 'kyoto'] },
    { label: 'corée', aliases: ['corée', 'coree', 'korea', 'seoul', 'busan'] }
  ];
  const warnings = [];
  for (const item of outliers) {
    let count = 0;
    for (const alias of item.aliases) {
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(re);
      count += matches ? matches.length : 0;
    }
    if (count >= 2) {
      warnings.push(`scope_drift:${item.label}:${count}`);
    }
  }
  return warnings;
}

/**
 * Finalise l'article complet
 * PATCH 1: Accepte pipelineContext pour propagation final_destination
 */

export function removeTrailingOrphans(html) {
  // Detect logical end markers
  const endMarkers = [
    /<h[23][^>]*>\s*Articles connexes/i,
    /<h[23][^>]*>\s*À lire également/i,
    /<div[^>]*class="[^"]*jeg_post_related/i,
    /<p[^>]*class="[^"]*reddit-source-discrete/i
  ];
  
  let endIndex = -1;
  for (const marker of endMarkers) {
    const match = html.match(marker);
    if (match && (endIndex === -1 || match.index < endIndex)) {
      endIndex = match.index;
    }
  }
  
  if (endIndex === -1) return html; // No end marker found
  
  const beforeEnd = html.substring(0, endIndex);
  const afterEnd = html.substring(endIndex);
  
  // Check for orphan affiliate blocks or paragraphs after the end marker
  // Keep source citations and related articles, remove orphan content
  const orphanPattern = /<div data-fv-segment="affiliate">[\s\S]*?<\/div>/gi;
  const cleanedAfter = afterEnd.replace(orphanPattern, (match) => {
    console.log(`🧹 removeTrailingOrphans: Bloc affilié orphelin supprimé après fin logique`);
    return '';
  });
  
  // Also remove orphan <p> and <h2>/<h3> that don't belong
  // But keep the end marker itself and source citations
  const result = beforeEnd + cleanedAfter;
  
  // Count removals
  if (result.length < html.length) {
    console.log(`✅ removeTrailingOrphans: ${html.length - result.length} chars orphelins supprimés`);
  }
  
  return result;
}

/**
 * PATCH 2: Déduplique les widgets (max 1 par type)
 * Garde le premier, supprime les suivants
 * Utilise detectRenderedWidgets() pour le comptage (cohérence avec FINAL)
 */

export function removeParasiticText(html) {
  console.log('🧹 removeParasiticText: Nettoyage du texte parasite...');
  
  let cleanedHtml = html;
  let removedCount = 0;
  
  // Pattern 1: "est également un point important à considérer" (répétitif)
  const parasiticPattern1 = /\s+est également un point important à considérer\./gi;
  const matches1 = cleanedHtml.match(parasiticPattern1);
  if (matches1) {
    cleanedHtml = cleanedHtml.replace(parasiticPattern1, '');
    removedCount += matches1.length;
    console.log(`   🧹 ${matches1.length} occurrence(s) de "est également un point important à considérer" supprimée(s)`);
  }
  
  // Pattern 2: "est également un point important à considérer" avec variations
  const parasiticPattern2 = /\s+(est|sont)\s+également\s+un\s+point\s+important\s+à\s+considérer[\.\s]*/gi;
  const matches2 = cleanedHtml.match(parasiticPattern2);
  if (matches2 && matches2.length > removedCount) {
    cleanedHtml = cleanedHtml.replace(parasiticPattern2, '');
    const additionalRemoved = matches2.length - removedCount;
    removedCount = matches2.length;
    console.log(`   🧹 ${additionalRemoved} occurrence(s) supplémentaire(s) supprimée(s)`);
  }
  
  // Pattern 3: Répétitions de mots isolés (ex: "Indonesia est également... health est également...")
  const parasiticPattern3 = /\s+(\w+)\s+est également un point important à considérer\.\s+(\w+)\s+est également un point important à considérer\./gi;
  const matches3 = cleanedHtml.match(parasiticPattern3);
  if (matches3) {
    cleanedHtml = cleanedHtml.replace(parasiticPattern3, '');
    removedCount += matches3.length;
    console.log(`   🧹 ${matches3.length} répétition(s) de mots isolés supprimée(s)`);
  }
  
  // Pattern 4: Meta-commentaires d'affiliation qui fuient du prompt LLM
  // Ex: "C'est précisément là que des produits d'affiliation bien choisis deviennent utiles"
  const affiliateMetaPatterns = [
    /[^.]*produits?\s+d['']affiliation\s+bien\s+choisis\s+deviennent\s+utiles[^.]*\./gi,
    /[^.]*produits?\s+d['']affiliation[^.]*lecteur\s+se\s+sent\s+vuln[eé]rable[^.]*\./gi,
    /[^.]*outils?\s+d['']affiliation\s+bien\s+choisis[^.]*\./gi,
  ];
  for (const pattern of affiliateMetaPatterns) {
    const matches4 = cleanedHtml.match(pattern);
    if (matches4) {
      cleanedHtml = cleanedHtml.replace(pattern, '');
      removedCount += matches4.length;
      console.log(`   🧹 ${matches4.length} meta-commentaire(s) d'affiliation supprimé(s)`);
    }
  }

  // Pattern 5: Paragraphes vides résultant des suppressions
  cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*<\/p>/gi, '');

  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} texte(s) parasite(s) supprimé(s)`);
  } else {
    console.log('   ✅ Aucun texte parasite détecté');
  }
  
  return cleanedHtml;
}

/**
 * PHASE 6.0.9b: Corriger la cohérence géographique des H2 avec le titre
 * Deux cas gérés :
 * 1) Titre single-country ("Thaïlande") + H2 avec un autre pays → remplacer
 * 2) Titre régional ("Asie du Sud-Est") + H2 conclusion avec un seul pays → remplacer par la région
 */

export function removeEmptySections(html) {
  console.log('🧹 removeEmptySections: Nettoyage des sections vides...');    
  let cleanedHtml = html;
  let removedCount = 0;
  
  // Pattern 1: Paragraphes avec emoji + label + ":" suivis de rien ou d'un paragraphe vide
  // Ex: <p>🧠 Ce que le voyageur a ressenti :</p>\n<p></p>
  const emptyLabelPattern1 = /<p[^>]*>[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*[^<]{0,80}:\s*<\/p>\s*(<p[^>]*>\s*<\/p>)?/gu;
  const matches1 = cleanedHtml.match(emptyLabelPattern1);
  if (matches1) {
    cleanedHtml = cleanedHtml.replace(emptyLabelPattern1, '');
    removedCount += matches1.length;
    console.log(`   🧹 ${matches1.length} label(s) emoji vide(s) supprimé(s)`);
  }
  
  // Pattern 2: Paragraphes complètement vides (sans contenu du tout)
  // Pattern amélioré pour capturer même collés à d'autres balises
  const completelyEmptyPattern = /<p[^>]*>\s*<\/p>/gi;
  let emptyMatches = cleanedHtml.match(completelyEmptyPattern);
  if (emptyMatches) {
    // Supprimer même s'ils sont collés à d'autres balises (ex: <p></p><ul>)
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*<\/p>\s*/gi, '');
    removedCount += emptyMatches.length;
    console.log(`   🧹 ${emptyMatches.length} paragraphe(s) complètement vide(s) supprimé(s)`);
  }
  
  // Pattern 2b: Paragraphes vides consécutifs (après suppression des vides individuels)
  const emptyParagraphsPattern = /(<p[^>]*>\s*<\/p>\s*){2,}/g;
  const matches2 = cleanedHtml.match(emptyParagraphsPattern);
  if (matches2) {
    cleanedHtml = cleanedHtml.replace(emptyParagraphsPattern, '');
    removedCount += matches2.length;
    console.log(`   🧹 ${matches2.length} groupe(s) de paragraphes vides consolidé(s)`);
  }
  
  // CORRECTION: Supprimer les paragraphes avec juste un point ou des points/espaces
  const dotOnlyParagraphs = cleanedHtml.match(/<p[^>]*>\s*[.\s]+\s*<\/p>/gi);
  if (dotOnlyParagraphs) {
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*[.\s]+\s*<\/p>/gi, '');
    removedCount += dotOnlyParagraphs.length;
    console.log(`   🧹 ${dotOnlyParagraphs.length} paragraphe(s) avec juste un point/espaces supprimé(s)`);
  }
  // Paragraphes triviaux : uniquement tiret long (—) ou tiret + espaces
  const dashOnlyParagraphs = cleanedHtml.match(/<p[^>]*>\s*[—–-]\s*<\/p>/gi);
  if (dashOnlyParagraphs) {
    cleanedHtml = cleanedHtml.replace(/<p[^>]*>\s*[—–-]\s*<\/p>/gi, '');
    removedCount += dashOnlyParagraphs.length;
    console.log(`   🧹 ${dashOnlyParagraphs.length} paragraphe(s) triviaux (—) supprimé(s)`);
  }
  
  // CORRECTION AMÉLIORÉE: Supprimer les paragraphes avec juste un point isolé (ex: <p>.</p>)
  // Pattern plus robuste pour capturer toutes les variantes
  const singleDotPatterns = [
    /<p[^>]*>\s*\.\s*<\/p>/gi,  // <p>.</p>
    /<p[^>]*>\s*\.\s*<\/p>/gi,  // <p> . </p>
    /<p[^>]*>\.<\/p>/gi,        // <p>.</p> sans espaces
    /<p[^>]*>\s*\.\s*<\/p>/gi   // Avec attributs <p class="...">.</p>
  ];
  
  let totalRemoved = 0;
  singleDotPatterns.forEach((pattern, idx) => {
    const matches = cleanedHtml.match(pattern);
    if (matches) {
      cleanedHtml = cleanedHtml.replace(pattern, '');
      totalRemoved += matches.length;
    }
  });
  
  if (totalRemoved > 0) {
    removedCount += totalRemoved;
    console.log(`   🧹 ${totalRemoved} paragraphe(s) avec juste un point supprimé(s)`);    }
  
  // Pattern 3: Labels "Cross-cutting lesson" ou "Leçon transversale" sans contenu
  const crossCuttingPattern = /<p[^>]*>\s*(Cross-cutting lesson|Leçon transversale)\s*:?\s*<\/p>/gi;
  const matches3 = cleanedHtml.match(crossCuttingPattern);
  if (matches3) {
    cleanedHtml = cleanedHtml.replace(crossCuttingPattern, '');
    removedCount += matches3.length;
    console.log(`   🧹 ${matches3.length} label(s) "Cross-cutting lesson" vide(s) supprimé(s)`);
  }
  
  // AMÉLIORATION: Pattern 4: H2/H3 suivi directement d'un autre H2/H3 (sans contenu intermédiaire)
  // AMÉLIORATION: Protéger les sections SERP critiques
  const protectedSerpPatterns = [
    /ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement)/i,
    /limites?\s*(et\s*)?biais/i,
    /erreurs?\s*(fréquentes?|courantes?|à\s*éviter)/i,
    /faq\b|questions?\s*(fréquentes?|courantes?|que\s+(tu|vous|se\s+posent))/i,
    /nos\s+recommandations/i,
    /ce\s+qu.il\s+faut\s+retenir/i
  ];
  
  // AMÉLIORATION: Pattern amélioré pour détecter H2/H3 suivis uniquement d'espaces, sauts de ligne, ou paragraphes vides
  // Pattern 1: H2/H3 suivi directement d'un autre H2/H3 (sans contenu, ou avec uniquement espaces/sauts de ligne)
  // Pattern amélioré pour capturer aussi les espaces et sauts de ligne entre les H2
  const emptyH2H3Pattern = /<(h[23])[^>]*>([^<]*)<\/h[23]>\s*(?:\s|<p[^>]*>\s*<\/p>\s*)*(?=<h[23]|$)/gi;
  let match;
  const emptySections = [];
  while ((match = emptyH2H3Pattern.exec(cleanedHtml)) !== null) {
    const h2Text = match[2];
    // Vérifier si c'est une section SERP protégée
    const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
    
    if (!isProtected) {
      emptySections.push({
        fullMatch: match[0],
        index: match.index,
        tag: match[1],
        text: h2Text
      });
    } else {
      // AMÉLIORATION: Au lieu de juste protéger, signaler pour remplissage dans ensureSerpSections
      console.log(`   🛡️ Section SERP protégée (vide, sera remplie par ensureSerpSections): "${h2Text.substring(0, 50)}..."`);
    }
  }
  
  // AMÉLIORATION: Pattern 2: H2/H3 suivi uniquement d'espaces, sauts de ligne, ou paragraphes vides (même avec plusieurs lignes)
  // Ex: <h2>Ce que dit le témoignage</h2>\n    \n    \n<h2>Moment critique</h2>
  const h2h3WithOnlyWhitespace = /<(h[23])[^>]*>([^<]*)<\/h[23]>\s*(?:\s|<p[^>]*>\s*<\/p>\s*)*(?=<h[23]|$)/gi;
  let matchWhitespace;
  while ((matchWhitespace = h2h3WithOnlyWhitespace.exec(cleanedHtml)) !== null) {
    const h2Text = matchWhitespace[2];
    const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
    
    if (!isProtected) {
      // Vérifier que cette section n'a pas déjà été ajoutée
      const alreadyAdded = emptySections.some(s => s.index === matchWhitespace.index);
      if (!alreadyAdded) {
        // Extraire la section complète (du H2 jusqu'au prochain H2 ou fin)
        const startIndex = matchWhitespace.index;
        const afterH2 = cleanedHtml.substring(startIndex + matchWhitespace[0].length);
        const nextH2Match = afterH2.match(/<(h[23])[^>]*>/i);
        const sectionEnd = nextH2Match ? startIndex + matchWhitespace[0].length + nextH2Match.index : cleanedHtml.length;
        const fullSection = cleanedHtml.substring(startIndex, sectionEnd);
        
        // Vérifier que le contenu entre le H2 et le prochain H2 est vraiment vide ou trivial (. , —, ponctuation seule)
        const contentBetween = fullSection.replace(/<h[23][^>]*>.*?<\/h[23]>/i, '').replace(/<[^>]+>/g, ' ').trim();
        const isTrivial = contentBetween.length <= 15 || /^[\s.\-—–]+$/.test(contentBetween);
        if (contentBetween.length <= 10 || isTrivial) {
          emptySections.push({
            fullMatch: fullSection,
            index: startIndex,
            tag: matchWhitespace[1],
            text: h2Text
          });
        }
      }
    }
  }
  
  // Supprimer les sections vides détectées (en ordre inverse pour préserver les indices)
  for (let i = emptySections.length - 1; i >= 0; i--) {
    const section = emptySections[i];
    // AMÉLIORATION: Extraire la section complète jusqu'au prochain H2 pour s'assurer de tout supprimer
    const afterMatch = cleanedHtml.substring(section.index + section.fullMatch.length);
    const nextH2Match = afterMatch.match(/<(h[23])[^>]*>/i);
    const sectionEnd = nextH2Match ? section.index + section.fullMatch.length + nextH2Match.index : section.index + section.fullMatch.length;
    const fullSectionToRemove = cleanedHtml.substring(section.index, sectionEnd);
    
    // Vérifier que le contenu est vide ou trivial (. , —, ponctuation seule)
    const contentBetween = fullSectionToRemove.replace(/<h[23][^>]*>.*?<\/h[23]>/i, '').replace(/<[^>]+>/g, ' ').trim();
    const isTrivial = contentBetween.length <= 15 || /^[\s.\-—–]+$/.test(contentBetween);
    if (contentBetween.length <= 10 || isTrivial) {
      cleanedHtml = cleanedHtml.substring(0, section.index) + cleanedHtml.substring(sectionEnd);
      removedCount++;
      console.log(`   🧹 ${section.tag.toUpperCase()} vide/trivial supprimé: "${section.text.substring(0, 50)}..."`);
    }
  }
  
  // AMÉLIORATION: Pattern 5: H2/H3 suivi uniquement de paragraphes vides (<p></p>)
  // Réutiliser protectedSerpPatterns déclaré plus haut
  const h2h3WithOnlyEmptyParas = /<(h[23])[^>]*>([^<]*)<\/h[23]>\s*(<p[^>]*>\s*<\/p>\s*)+(?=<h[23]|$)/gi;
  let match2;
  const sectionsWithEmptyParas = [];
  while ((match2 = h2h3WithOnlyEmptyParas.exec(cleanedHtml)) !== null) {
    const h2Text = match2[2];
    // Vérifier si c'est une section SERP protégée
    const isProtected = protectedSerpPatterns.some(pattern => pattern.test(h2Text));
    
    if (!isProtected) {
      sectionsWithEmptyParas.push({
        fullMatch: match2[0],
        index: match2.index,
        tag: match2[1]
      });
    } else {
      // AMÉLIORATION: Ne pas supprimer, mais signaler pour remplissage dans fillEmptySections
      console.log(`   🛡️ Section SERP protégée (vide, sera remplie par fillEmptySections): "${h2Text.substring(0, 50)}..."`);
    }
  }
  
  // Supprimer les sections avec uniquement des paragraphes vides (sauf SERP protégées)
  for (let i = sectionsWithEmptyParas.length - 1; i >= 0; i--) {
    const section = sectionsWithEmptyParas[i];
    cleanedHtml = cleanedHtml.substring(0, section.index) + cleanedHtml.substring(section.index + section.fullMatch.length);
    removedCount++;
    console.log(`   🧹 ${section.tag.toUpperCase()} avec uniquement paragraphes vides supprimé`);
  }
  
  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} section(s) vide(s) supprimée(s)`);
  } else {
    console.log('   ✅ Aucune section vide détectée');
  }    
  return cleanedHtml;
}

/**
 * Supprime explicitement la section interdite "Ce que dit le témoignage" (H2 + contenu jusqu'au prochain H2).
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML sans cette section
 */

export function removeForbiddenH2Section(html) {
  if (!html || typeof html !== 'string') return html;
  const forbiddenPattern = /<h2[^>]*>\s*Ce que dit le témoignage\s*\.{0,3}\s*<\/h2>/i;
  let cleaned = html;
  let count = 0;
  let match;
  while ((match = cleaned.match(forbiddenPattern)) !== null) {
    const startIndex = cleaned.indexOf(match[0]);
    const afterH2 = cleaned.substring(startIndex + match[0].length);
    const nextH2 = afterH2.match(/<h2[^>]*>/i);
    const endIndex = nextH2
      ? startIndex + match[0].length + nextH2.index
      : cleaned.length;
    cleaned = cleaned.substring(0, startIndex) + cleaned.substring(endIndex);
    count++;
  }
  if (count > 0) console.log(`   🧹 ${count} section(s) interdite(s) "Ce que dit le témoignage" supprimée(s)`);
  return cleaned;
}

/**
 * Supprime les sections parasites de l'ancienne structure (Contexte, Événement central, Moment critique, Résolution)
 * quand l'article est en format Option B (verdict + recommandations + corps substantiel).
 * Ces sections sont supprimées si elles ont un contenu minimal (<= 500 caractères jusqu'au prochain H2).
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML nettoyé
 */

export function removeParasiticSections(html) {
  if (!html || typeof html !== 'string') return html;
  
  // TOUJOURS supprimer les H2 template de l'ancienne structure (Option A),
  // quel que soit le format détecté. Le contenu devrait être dans le développement narratif.
  const parasiticTitles = [
    { pattern: /<h2[^>]*>\s*Contexte\s*\.{0,3}\s*<\/h2>/i, name: 'Contexte' },
    { pattern: /<h2[^>]*>\s*Événement central\s*\.{0,3}\s*<\/h2>/i, name: 'Événement central' },
    { pattern: /<h2[^>]*>\s*Moment critique\s*\.{0,3}\s*<\/h2>/i, name: 'Moment critique' },
    { pattern: /<h2[^>]*>\s*Résolution\s*\.{0,3}\s*<\/h2>/i, name: 'Résolution' },
    { pattern: /<h2[^>]*>\s*Ce que l'auteur retient\s*<\/h2>/i, name: 'Ce que l\'auteur retient' },
    { pattern: /<h2[^>]*>\s*Ce que la communauté apporte\s*<\/h2>/i, name: 'Ce que la communauté apporte' },
    { pattern: /<h2[^>]*>\s*Chronologie de l'expérience\s*<\/h2>/i, name: 'Chronologie de l\'expérience' },
    { pattern: /<h2[^>]*>\s*Risques et pièges réels\s*<\/h2>/i, name: 'Risques et pièges réels' }
  ];
  
  let cleaned = html;
  let totalRemoved = 0;
  
  for (const { pattern, name } of parasiticTitles) {
    let match;
    while ((match = cleaned.match(pattern)) !== null) {
      const startIndex = cleaned.indexOf(match[0]);
      const afterH2 = cleaned.substring(startIndex + match[0].length);
      
      // Trouver le prochain H2 ou la fin du document
      const nextH2Match = afterH2.match(/<h2[^>]*>/i);
      const endIndex = nextH2Match
        ? startIndex + match[0].length + nextH2Match.index
        : startIndex + match[0].length + Math.min(afterH2.length, 500);
      
      // Supprimer le H2 template et son contenu (le contenu est déjà dans le développement)
      cleaned = cleaned.substring(0, startIndex) + cleaned.substring(endIndex);
      totalRemoved++;
      console.log(`   🧹 Section template "${name}" supprimée`);
    }
  }
  
  if (totalRemoved > 0) {
    console.log(`   ✅ ${totalRemoved} section(s) template supprimée(s)`);
  }
  
  return cleaned;
}

/**
 * Supprime les sections résiduelles de l'ancienne structure en Option B
 * - "Ce que la communauté apporte" (résidu de l'ancienne structure)
 * - "Conseils pratiques" (résidu de l'ancienne structure)
 * - Listes `<ul>` mal formées (contenant du texte brut au lieu de `<li>`)
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML nettoyé
 */

export function removeOldStructureResidues(html) {
  if (!html || typeof html !== 'string') return html;
  
  // Vérifier si l'article est en format Option B
  const isOptionB = this.isOptionBFormat(html);
  console.log(`🔍 removeOldStructureResidues: isOptionB=${isOptionB}, htmlLength=${html.length}`);
  
  // AMÉLIORATION: Toujours supprimer ces sections résiduelles si elles existent, même si Option B n'est pas détecté
  // Car ces sections ne devraient jamais être présentes dans la nouvelle structure
  let cleaned = html;
  let removedCount = 0;
  
  // 1. Supprimer "Ce que la communauté apporte" (section résiduelle)
  // Pattern très flexible pour détecter même avec variations d'espacement, attributs HTML, etc.
  // Chercher d'abord tous les H2 qui contiennent ce texte (insensible à la casse)
  const communityH2Pattern = /<h2[^>]*>[\s\S]*?ce\s+que\s+la\s+communauté\s+apporte[\s\S]*?<\/h2>/gi;
  const communityH2Matches = [...cleaned.matchAll(communityH2Pattern)];
  
  // Pattern alternatif pour détecter même avec des variations (espaces multiples, tirets, etc.)
  if (communityH2Matches.length === 0) {
    const altPattern = /<h2[^>]*>.*?(?:communauté|community).*?(?:apporte|brings).*?<\/h2>/gi;
    const altMatches = [...cleaned.matchAll(altPattern)];
    if (altMatches.length > 0) {
      communityH2Matches.push(...altMatches);
      console.log(`   🔍 Détecté ${altMatches.length} H2 alternatif(s) contenant "communauté apporte"`);
    }
  }
  
  if (communityH2Matches.length > 0) {
    console.log(`   🔍 Détecté ${communityH2Matches.length} H2 "Ce que la communauté apporte"`);
    
    // Traiter en ordre inverse pour éviter les problèmes d'index lors de la suppression
    const sortedMatches = communityH2Matches.sort((a, b) => b.index - a.index);
    
    // Pour chaque H2 trouvé, supprimer seulement cette section jusqu'au prochain H2/H3
    // FIX BUG: Ne JAMAIS supprimer jusqu'à la fin du document si pas de H2/H3 après
    for (const h2Match of sortedMatches) {
      const h2Index = h2Match.index;
      const afterH2 = cleaned.substring(h2Index + h2Match[0].length);
      const nextHeadingMatch = afterH2.match(/<h[23][^>]*>/i);
      
      // FIX CRITIQUE: Si pas de H2/H3 après, supprimer seulement le H2 lui-même + quelques paragraphes
      if (nextHeadingMatch) {
        const sectionEndIndex = h2Index + h2Match[0].length + nextHeadingMatch.index;
        cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
        removedCount++;
      } else {
        // Pas de H2/H3 après : supprimer seulement le H2 et jusqu'à 500 chars de contenu maximum
        const sectionContentMatch = afterH2.match(/^([\s\S]*?)(?=<(?:div|section|footer|p class="reddit)|$)/i);
        const sectionContent = sectionContentMatch ? sectionContentMatch[1] : '';
        const safeEndIndex = Math.min(sectionContent.length, 500);
        const sectionEndIndex = h2Index + h2Match[0].length + safeEndIndex;
        cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
        removedCount++;
        console.log(`   ⚠️ Section "Ce que la communauté apporte" supprimée avec limite de sécurité (${safeEndIndex} chars)`);
      }
    }
    
    console.log(`   🧹 Section résiduelle "Ce que la communauté apporte" supprimée (${communityH2Matches.length} occurrence(s))`);    } else {
    console.log(`   ℹ️ Aucune occurrence de "Ce que la communauté apporte" trouvée`);
  }
  
  // 2. DÉSACTIVÉ: "Conseils pratiques" n'est PLUS un résidu - c'est une section valide
  // Cette suppression causait la perte de contenu éditorial important
  // Pattern très flexible pour détecter même avec variations d'espacement, attributs HTML, etc.
  // const conseilsH2Pattern = /<h2[^>]*>[\s\S]*?conseils\s+pratiques[\s\S]*?<\/h2>/gi;
  // const conseilsH2Matches = [...cleaned.matchAll(conseilsH2Pattern)];
  const conseilsH2Matches = []; // DÉSACTIVÉ - section maintenant valide
  
  if (conseilsH2Matches.length > 0) {
    console.log(`   🔍 Détecté ${conseilsH2Matches.length} H2 "Conseils pratiques"`);
    
    // Traiter en ordre inverse pour éviter les problèmes d'index lors de la suppression
    const sortedMatches = conseilsH2Matches.sort((a, b) => b.index - a.index);
    
    // Pour chaque H2 trouvé, supprimer seulement cette section jusqu'au prochain H2/H3
    // FIX BUG: Ne JAMAIS supprimer jusqu'à la fin du document si pas de H2/H3 après
    for (const h2Match of sortedMatches) {
      const h2Index = h2Match.index;
      const afterH2 = cleaned.substring(h2Index + h2Match[0].length);
      const nextHeadingMatch = afterH2.match(/<h[23][^>]*>/i);
      
      // FIX CRITIQUE: Si pas de H2/H3 après, supprimer seulement le H2 lui-même + quelques paragraphes
      // mais PAS tout le reste du document (qui contient les widgets, source Reddit, etc.)
      if (nextHeadingMatch) {
        const sectionEndIndex = h2Index + h2Match[0].length + nextHeadingMatch.index;
        cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
        removedCount++;
      } else {
        // Pas de H2/H3 après : supprimer seulement le H2 et jusqu'à 500 chars de contenu maximum
        // Chercher la fin logique de la section (fin de liste, paragraphe, etc.)
        const sectionContentMatch = afterH2.match(/^([\s\S]*?)(?=<(?:div|section|footer|p class="reddit)|$)/i);
        const sectionContent = sectionContentMatch ? sectionContentMatch[1] : '';
        const safeEndIndex = Math.min(sectionContent.length, 500);
        const sectionEndIndex = h2Index + h2Match[0].length + safeEndIndex;
        cleaned = cleaned.substring(0, h2Index) + cleaned.substring(sectionEndIndex);
        removedCount++;
        console.log(`   ⚠️ Section "Conseils pratiques" supprimée avec limite de sécurité (${safeEndIndex} chars)`);
      }
    }
    
    console.log(`   🧹 Section résiduelle "Conseils pratiques" supprimée (${conseilsH2Matches.length} occurrence(s))`);    } else {
    console.log(`   ℹ️ Aucune occurrence de "Conseils pratiques" trouvée`);
  }
  
  // 3. Supprimer les modules d'affiliation isolés APRÈS avoir supprimé les sections résiduelles
  // Pattern amélioré pour détecter les modules d'affiliation même avec des attributs variés
  // Utiliser une approche qui gère les div imbriquées en comptant les balises ouvrantes/fermantes
  const findAffiliateModules = (html) => {
    const modules = [];
    const pattern = /<(?:div|aside)[^>]*(?:class=["'][^"']*affiliate-module[^"']*["']|data-placement-id[^>]*)[^>]*>/gi;
    let match;
    
    while ((match = pattern.exec(html)) !== null) {
      const startIndex = match.index;
      const startTag = match[0];
      let depth = 1;
      let currentIndex = startIndex + startTag.length;
      
      // Trouver la balise fermante correspondante en gérant les div imbriquées
      while (depth > 0 && currentIndex < html.length) {
        const nextOpen = html.indexOf('<div', currentIndex);
        const nextClose = html.indexOf('</div>', currentIndex);
        
        if (nextClose === -1) break; // Pas de fermeture trouvée
        
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          currentIndex = nextOpen + 4;
        } else {
          depth--;
          if (depth === 0) {
            const endIndex = nextClose + 6;
            modules.push({
              index: startIndex,
              fullMatch: html.substring(startIndex, endIndex)
            });
          }
          currentIndex = nextClose + 6;
        }
      }
    }
    
    return modules;
  };
  
  const affiliateModules = findAffiliateModules(cleaned);
  
  console.log(`   🔍 Détecté ${affiliateModules.length} module(s) d'affiliation`);    
  // Vérifier si des modules d'affiliation sont isolés (peu de contenu avant, pas de H2 valide après)
  // Traiter en ordre inverse pour éviter les problèmes d'index lors de la suppression
  for (let i = affiliateModules.length - 1; i >= 0; i--) {
    const module = affiliateModules[i];
    const moduleIndex = module.index;
    const moduleLength = module.fullMatch.length;
    const beforeModule = cleaned.substring(0, moduleIndex).trim();
    const afterModule = cleaned.substring(moduleIndex + moduleLength).trim();
    
    // Chercher le dernier H2 avant le module
    const lastH2Matches = beforeModule.match(/<h2[^>]*>[\s\S]*?<\/h2>/gi);
    const contentBefore = lastH2Matches && lastH2Matches.length > 0
      ? beforeModule.substring(beforeModule.lastIndexOf(lastH2Matches[lastH2Matches.length - 1]) + lastH2Matches[lastH2Matches.length - 1].length)
      : beforeModule;
    const textBefore = contentBefore.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Chercher le prochain H2 après le module
    const nextH2Match = afterModule.match(/<h2[^>]*>/i);
    const contentAfter = nextH2Match ? afterModule.substring(0, nextH2Match.index) : afterModule;
    const textAfter = contentAfter.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Si peu de contenu avant (< 50 chars) et peu de contenu après (< 100 chars), considérer comme isolé
    // Ou si le dernier H2 avant était une section résiduelle (même si déjà supprimée, vérifier le contexte)
    const isIsolated = textBefore.length < 50 && textAfter.length < 100;
    const wasAfterResidualSection = lastH2Matches && lastH2Matches.length > 0 && (
      textBefore.length < 100 // Peu de contenu après le dernier H2
    );
    
    if (isIsolated || wasAfterResidualSection) {
      cleaned = cleaned.substring(0, moduleIndex) + cleaned.substring(moduleIndex + moduleLength);
      removedCount++;
      console.log(`   🧹 Module d'affiliation isolé supprimé (contenu avant: ${textBefore.length} chars, après: ${textAfter.length} chars)`);      }
  }
  
  // 4. Corriger les listes `<ul>` mal formées (contenant du texte brut au lieu de `<li>`)
  // Détecter les `<ul>` qui contiennent du texte directement sans `<li>`
  const malformedUlPattern = /<ul[^>]*>([^<]+(?:<[^>]+>[^<]*)*)<\/ul>/gi;
  const malformedUls = [...cleaned.matchAll(malformedUlPattern)];    
  for (const ulMatch of malformedUls) {
    const fullMatch = ulMatch[0];
    const ulContent = ulMatch[1];
    
    // Vérifier si le contenu ne contient pas de `<li>` (liste mal formée)
    if (!/<li[^>]*>/i.test(ulContent)) {
      // Convertir le texte brut en paragraphe ou supprimer si trop court
      const textContent = ulContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      if (textContent.length > 50) {
        // Convertir en paragraphe si le contenu est substantiel
        cleaned = cleaned.replace(fullMatch, `<p>${textContent}</p>`);
        removedCount++;
        console.log(`   🧹 Liste mal formée convertie en paragraphe (${textContent.substring(0, 50)}...)`);        } else {
        // Supprimer si le contenu est trop court
        cleaned = cleaned.replace(fullMatch, '');
        removedCount++;
        console.log(`   🧹 Liste mal formée supprimée (contenu trop court)`);        }
    }
  }
  
  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} résidu(s) de l'ancienne structure supprimé(s)`);
  } else {
    console.log(`   ℹ️ Aucun résidu de l'ancienne structure détecté`);
  }    
  return cleaned;
}

/**
 * Supprime la phrase générique interdite dans "Ce qu'il faut retenir" (Pendant que vous... / Chez Flash Voyages nous avons sélectionné).
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML nettoyé
 */

export function removeGenericVerdictPhrase(html) {
  if (!html || typeof html !== 'string') return html;
  const verdictH2 = /<h2[^>]*>\s*Ce qu'il faut retenir\s*\.{0,3}\s*<\/h2>/i;
  const match = html.match(verdictH2);
  if (!match) return html;
  const startIdx = html.indexOf(match[0]) + match[0].length;
  const afterVerdict = html.substring(startIdx);
  const nextH2 = afterVerdict.match(/<h[23][^>]*>/i);
  const endIdx = nextH2 ? startIdx + nextH2.index : html.length;
  let sectionContent = html.substring(startIdx, endIdx);
  const beforeLen = sectionContent.length;
  // Supprimer tout paragraphe contenant la phrase interdite (même avec balises internes)
  const genericInParagraph = /<p[^>]*>(?:(?!<\/p>).)*?(?:Pendant que vous|nous avons sélectionné ce témoignage Reddit pour vous inspirer)(?:(?!<\/p>).)*?<\/p>/gis;
  sectionContent = sectionContent.replace(genericInParagraph, '');
  // Supprimer paragraphe "Comparez les prix et réservez :" seul
  sectionContent = sectionContent.replace(/<p[^>]*>\s*Comparez les prix et réservez\s*:?\s*\.?\s*<\/p>/gi, '');
  if (sectionContent.length < beforeLen) {
    console.log('   🧹 Verdict générique supprimé (Pendant que vous / Chez Flash Voyages)');
  }
  return html.substring(0, startIdx) + sectionContent + html.substring(endIdx);
}

/**
 * Supprime les placeholders connus ("Pourquoi money ?", etc.) et les paragraphes de citation vides (» — auteur (Reddit) sans texte).
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML nettoyé
 */
/**
 * Déduplique les blockquotes identiques ou quasi-identiques
 * Empêche la même citation Reddit d'apparaître plusieurs fois
 */

export function removePlaceholdersAndEmptyCitations(html) {
  if (!html || typeof html !== 'string') return html;
  let cleaned = html;
  // Placeholders: H2/H3 ou paragraphes contenant "Pourquoi money ?", "Why money?", "?." seuls, "Comment xxx ?" mal formés
  const placeholderPatterns = [
    /<h[23][^>]*>\s*Pourquoi money \?\s*<\/h[23]>\s*(?:<p[^>]*>[^<]*<\/p>\s*)*/gi,
    /<h[23][^>]*>\s*Why money \?\s*<\/h[23]>\s*(?:<p[^>]*>[^<]*<\/p>\s*)*/gi,
    /<p[^>]*>\s*Pourquoi money \?\s*<\/p>/gi,
    /<p[^>]*>\s*Why money \?\s*<\/p>/gi,
    /<p[^>]*>\s*\?\.\s*<\/p>/gi,
    // H3 widget mal formés type "Comment esim_connectivity ?"
    /<h3[^>]*>\s*Comment\s+[a-z_]+\s*\?\s*<\/h3>/gi
  ];
  placeholderPatterns.forEach(pattern => {
    const m = cleaned.match(pattern);
    if (m) {
      cleaned = cleaned.replace(pattern, '');
      console.log(`   🧹 ${m.length} placeholder(s) supprimé(s)`);
    }
  });
  // Citations vides: » — auteur (Reddit) sans texte avant les guillemets (ou juste guillemets + tiret)
  const emptyCitationPattern = /<p[^>]*>\s*[«»"]\s*[—–-]\s*[^<]+\(Reddit\)\s*<\/p>/gi;
  const citations = cleaned.match(emptyCitationPattern);
  if (citations) {
    cleaned = cleaned.replace(emptyCitationPattern, '');
    console.log(`   🧹 ${citations.length} citation(s) vide(s) supprimée(s)`);
  }
  return cleaned;
}

/**
 * Valide les liens internes (href non vide, ancre cohérente).
 * Détecte les liens tronqués du type "Consultez notre article sur [titre] :" sans href ou ancre vide.
 * @param {string} html - HTML à vérifier
 * @returns {{ valid: boolean, errors: string[] }}
 */

export function removeRepetitions(html) {
  console.log('🔄 removeRepetitions: Détection des répétitions...');
  
  let cleanedHtml = html;
  let removedCount = 0;
  
  // AMÉLIORATION: Protéger les sections SERP critiques (ne pas les supprimer comme répétitions)
  const protectedSections = [
    /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i,
    /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/i,
    /<h2[^>]*>.*?erreurs?\s*(fréquentes?|courantes?|à\s*éviter).*?<\/h2>/i
  ];
  
  // Extraire toutes les phrases (contenu des paragraphes)
  const paragraphPattern = /<p[^>]*>([^<]+)<\/p>/gi;
  const paragraphs = [];
  let match;
  
  while ((match = paragraphPattern.exec(html)) !== null) {
    const text = match[1].trim();
    if (text.length > 30) { // Ignorer les phrases très courtes
      paragraphs.push({
        fullMatch: match[0],
        text: text,
        normalized: text.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim()
      });
    }
  }
  
  // Détecter les duplicatas
  const seen = new Map();
  const duplicates = [];
  
  paragraphs.forEach((p, index) => {
    if (seen.has(p.normalized)) {
      duplicates.push(p);
      console.log(`   🔄 Répétition détectée: "${p.text.substring(0, 50)}..."`);
    } else {
      seen.set(p.normalized, index);
    }
  });
  
  // AMÉLIORATION: Détecter aussi les répétitions similaires (similarité Jaccard améliorée)
  paragraphs.forEach((p1, i) => {
    paragraphs.forEach((p2, j) => {
      if (i !== j && !seen.has(p1.normalized) && !seen.has(p2.normalized)) {
        // Similarité Jaccard améliorée (prend en compte l'ordre partiel)
        const words1 = p1.normalized.split(/\s+/);
        const words2 = p2.normalized.split(/\s+/);
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        
        // Intersection
        const intersection = [...set1].filter(w => set2.has(w));
        // Union
        const union = new Set([...set1, ...set2]);
        
        // Similarité Jaccard classique
        const jaccardSimilarity = union.size > 0 ? intersection.length / union.size : 0;
        
        // Bonus pour l'ordre des mots (si les premiers mots sont identiques)
        let orderBonus = 0;
        const minLength = Math.min(words1.length, words2.length);
        if (minLength >= 5) {
          const firstWords1 = words1.slice(0, 5).join(' ');
          const firstWords2 = words2.slice(0, 5).join(' ');
          if (firstWords1 === firstWords2) {
            orderBonus = 0.1; // Bonus de 10% si les 5 premiers mots sont identiques
          }
        }
        
        const similarity = jaccardSimilarity + orderBonus;
        
        const similarityThreshold = 0.75;
        
        if (similarity > similarityThreshold && p1.normalized.length > 50) {
          duplicates.push(p2);
          console.log(`   🔄 Répétition similaire détectée (${Math.round(similarity * 100)}%): "${p2.text.substring(0, 50)}..."`);
        }

        // Détection paraphrase : mêmes mots significatifs (sans stop words)
        const STOP_WORDS = new Set(['le','la','les','un','une','des','du','de','et','ou','en','à','tu','ton','ta','tes','te','est','es','ce','se','ne','pas','qui','que','il','elle','son','sa','ses','nous','vous','ils','sur','dans','par','pour','avec','plus','sans','mais','aussi','très','bien','cette','cet','ces','tout','même','peut','être','avoir','faire','dire','comme','dont','où','si','car']);
        if (i < j && p1.normalized.length > 80 && p2.normalized.length > 80) {
          const sig1 = new Set(words1.filter(w => w.length > 3 && !STOP_WORDS.has(w)));
          const sig2 = new Set(words2.filter(w => w.length > 3 && !STOP_WORDS.has(w)));
          const sigInter = [...sig1].filter(w => sig2.has(w));
          const sigOverlap = Math.min(sig1.size, sig2.size) > 0
            ? sigInter.length / Math.min(sig1.size, sig2.size)
            : 0;
          if (sigOverlap > 0.65 && sigInter.length >= 4 && !duplicates.includes(p2)) {
            duplicates.push(p2);
            console.log(`   🔄 Paraphrase détectée (${Math.round(sigOverlap * 100)}% mots-clés communs): "${p2.text.substring(0, 50)}..."`);
          }
        }
      }
    });
  });
  
  // Supprimer les duplicatas (garder la première occurrence)
  // AMÉLIORATION: Trier par longueur décroissante pour traiter les plus longs en premier
  duplicates.sort((a, b) => b.text.length - a.text.length);
  
  duplicates.forEach(dup => {
    // AMÉLIORATION: Vérifier si c'est une section SERP protégée (amélioré)
    const dupIndex = cleanedHtml.indexOf(dup.fullMatch);
    let isProtected = false;
    let protectedSectionName = '';
    
    protectedSections.forEach(pattern => {
      const match = cleanedHtml.match(pattern);
      if (match) {
        const sectionStart = match.index;
        // Trouver la fin de la section protégée (prochain H2 ou fin)
        const afterSection = cleanedHtml.substring(sectionStart + match[0].length);
        const nextH2Match = afterSection.match(/<h2[^>]*>/i);
        const sectionEnd = nextH2Match 
          ? sectionStart + match[0].length + (nextH2Match.index ?? 0)
          : cleanedHtml.length;
        
        // Vérifier si le duplicata est dans la section protégée
        if (dupIndex >= sectionStart && dupIndex < sectionEnd) {
          isProtected = true;
          protectedSectionName = match[0].replace(/<[^>]+>/g, '').trim();
        }
      }
    });
    
    if (isProtected) {
      console.log(`   🛡️ Section SERP protégée "${protectedSectionName}", non supprimée: "${dup.text.substring(0, 50)}..."`);
      return; // Ne pas supprimer cette section
    }
    
    // AMÉLIORATION: Supprimer toutes les occurrences sauf la première (plus agressif)
    const allOccurrences = [];
    let searchIndex = 0;
    while (true) {
      const index = cleanedHtml.indexOf(dup.fullMatch, searchIndex);
      if (index === -1) break;
      allOccurrences.push(index);
      searchIndex = index + 1;
    }
    
    // Supprimer toutes sauf la première (en ordre inverse pour préserver les indices)
    if (allOccurrences.length > 1) {
      for (let i = allOccurrences.length - 1; i >= 1; i--) {
        cleanedHtml = cleanedHtml.substring(0, allOccurrences[i]) + cleanedHtml.substring(allOccurrences[i] + dup.fullMatch.length);
        removedCount++;
      }
    }
  });
  
  // AMÉLIORATION: Détecter les répétitions au niveau phrase (aligné avec quality-analyzer.js)
  // Utiliser la même méthode que quality-analyzer.js : n-grams de 8 mots dans les phrases
  const allText = cleanedHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
  
  // AMÉLIORATION: Extraire les phrases d'abord (comme quality-analyzer.js)
  const sentences = allText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
  const sentenceNgrams = new Map();
  const sentenceToNgrams = new Map(); // Map phrase -> n-grams qu'elle contient
  
  // Pour chaque phrase, créer des n-grams de 8 mots (exactement comme quality-analyzer.js)
  sentences.forEach((sentence, sentenceIndex) => {
    const words = sentence.split(/\s+/).filter(w => w.length > 2);
    const sentenceNgramsList = [];
    
    if (words.length >= 8) {
      for (let i = 0; i <= words.length - 8; i++) {
        const ngram = words.slice(i, i + 8).join(' ');
        sentenceNgrams.set(ngram, (sentenceNgrams.get(ngram) || 0) + 1);
        sentenceNgramsList.push(ngram);
      }
    }
    
    sentenceToNgrams.set(sentenceIndex, { sentence, ngrams: sentenceNgramsList });
  });
  
  // Garder aussi les n-grams globaux pour compatibilité
  const words = allText.split(/\s+/).filter(w => w.length > 2);
  const ngrams = new Map();
  for (let i = 0; i <= words.length - 8; i++) {
    const ngram = words.slice(i, i + 8).join(' ');
    ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
  }
  
  let repetitiveNgrams = 0;
  const repetitivePhrases = [];
  // AMÉLIORATION: Détecter toutes les répétitions (même si count = 2)
  ngrams.forEach((count, ngram) => {
    if (count > 1) {
      repetitiveNgrams++;
      // AMÉLIORATION: Traiter toutes les répétitions (pas seulement count > 2)
      repetitivePhrases.push({ ngram, count });
      // Logger chaque n-gram répétitif détecté
      console.log(`   🔍 N-gram répétitif détecté (${count}x): "${ngram.substring(0, 60)}${ngram.length > 60 ? '...' : ''}"`);
    }
  });
  
  // AMÉLIORATION: Supprimer les phrases répétitives détectées (plus agressif)
  // AMÉLIORATION: Trier par count décroissant pour traiter les plus répétitifs en premier
  const sortedSentenceNgrams = Array.from(sentenceNgrams.entries()).sort((a, b) => b[1] - a[1]);
  
  sortedSentenceNgrams.forEach(([ngram, count]) => {
    if (count > 1) {
      // Trouver et supprimer les occurrences répétées de ce n-gram
      const escapedNgram = ngram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // AMÉLIORATION: Chercher dans tout le texte (pas seulement paragraphes) pour plus de précision
      const allMatches = cleanedHtml.toLowerCase().match(new RegExp(escapedNgram, 'gi'));
      if (allMatches && allMatches.length > 1) {
        // Trouver les paragraphes contenant ce n-gram
        const paraMatches = cleanedHtml.match(new RegExp(`<p[^>]*>.*?${escapedNgram}.*?<\/p>`, 'gi'));
        if (paraMatches && paraMatches.length > 1) {
          // AMÉLIORATION: Supprimer toutes les occurrences sauf la première (en ordre inverse pour préserver les indices)
          const allOccurrences = [];
          let searchIndex = 0;
          while (true) {
            const index = cleanedHtml.toLowerCase().indexOf(ngram.toLowerCase(), searchIndex);
            if (index === -1) break;
            // Vérifier si c'est dans un paragraphe
            const beforeMatch = cleanedHtml.substring(Math.max(0, index - 200), index);
            const afterMatch = cleanedHtml.substring(index, Math.min(cleanedHtml.length, index + ngram.length + 200));
            if (beforeMatch.includes('<p') && afterMatch.includes('</p>')) {
              allOccurrences.push(index);
            }
            searchIndex = index + 1;
          }
          
          // Supprimer toutes sauf la première (en ordre inverse)
          if (allOccurrences.length > 1) {
            for (let i = allOccurrences.length - 1; i >= 1; i--) {
              const startIndex = allOccurrences[i];
              // Trouver le paragraphe complet contenant cette occurrence
              const beforePara = cleanedHtml.lastIndexOf('<p', startIndex);
              const afterPara = cleanedHtml.indexOf('</p>', startIndex);
              if (beforePara !== -1 && afterPara !== -1) {
                const paraMatch = cleanedHtml.substring(beforePara, afterPara + 4);
                // Vérifier si c'est protégé (amélioré)
                let isProtected = false;
                let protectedSectionName = '';
                
                protectedSections.forEach(pattern => {
                  const protMatch = cleanedHtml.match(pattern);
                  if (protMatch) {
                    const sectionStart = protMatch.index;
                    const afterSection = cleanedHtml.substring(sectionStart + protMatch[0].length);
                    const nextH2Match = afterSection.match(/<h2[^>]*>/i);
                    const sectionEnd = nextH2Match 
                      ? sectionStart + protMatch[0].length + (nextH2Match.index ?? 0)
                      : cleanedHtml.length;
                    
                    if (beforePara >= sectionStart && beforePara < sectionEnd) {
                      isProtected = true;
                      protectedSectionName = protMatch[0].replace(/<[^>]+>/g, '').trim();
                    }
                  }
                });
                
                if (!isProtected) {
                  const removedPara = cleanedHtml.substring(beforePara, afterPara + 4);
                  const paraText = removedPara.replace(/<[^>]+>/g, ' ').trim().substring(0, 60);
                  cleanedHtml = cleanedHtml.substring(0, beforePara) + cleanedHtml.substring(afterPara + 4);
                  removedCount++;
                  console.log(`   ✂️ Paragraphe répétitif supprimé: "${paraText}..."`);
                } else {
                  console.log(`   🛡️ Paragraphe répétitif protégé (section SERP "${protectedSectionName}"): "${cleanedHtml.substring(beforePara, Math.min(beforePara + 60, afterPara)).replace(/<[^>]+>/g, ' ').trim()}..."`);
                }
              }
            }
          }
        }
      }
    }
  });
  
  // AMÉLIORATION: Supprimer aussi les n-grams répétitifs détectés (plus agressif)
  // AMÉLIORATION: Trier par count décroissant pour traiter les plus répétitifs en premier
  const sortedNgrams = Array.from(ngrams.entries()).sort((a, b) => b[1] - a[1]);
  
  sortedNgrams.forEach(([ngram, count]) => {
    if (count > 1) { // AMÉLIORATION: Supprimer même si répété seulement 2 fois
      const escapedNgram = ngram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Chercher dans les paragraphes
      const paraMatches = cleanedHtml.match(new RegExp(`<p[^>]*>.*?${escapedNgram}.*?<\/p>`, 'gi'));
      if (paraMatches && paraMatches.length > 1) {
        // Supprimer toutes les occurrences sauf la première
        let firstFound = false;
        cleanedHtml = cleanedHtml.replace(new RegExp(`<p[^>]*>.*?${escapedNgram}.*?<\/p>`, 'gi'), (match) => {
          // AMÉLIORATION: Vérifier si cette occurrence est dans une section protégée (amélioré)
          const matchIndex = cleanedHtml.indexOf(match);
          let isProtected = false;
          let protectedSectionName = '';
          
          protectedSections.forEach(pattern => {
            const protMatch = cleanedHtml.match(pattern);
            if (protMatch) {
              const sectionStart = protMatch.index;
              const afterSection = cleanedHtml.substring(sectionStart + protMatch[0].length);
              const nextH2Match = afterSection.match(/<h2[^>]*>/i);
              const sectionEnd = nextH2Match 
                ? sectionStart + protMatch[0].length + (nextH2Match.index ?? 0)
                : cleanedHtml.length;
              
              if (matchIndex >= sectionStart && matchIndex < sectionEnd) {
                isProtected = true;
                protectedSectionName = protMatch[0].replace(/<[^>]+>/g, '').trim();
              }
            }
          });
          
          if (isProtected && !firstFound) {
            firstFound = true;
            console.log(`   🛡️ Paragraphe répétitif protégé (section SERP "${protectedSectionName}"), première occurrence conservée`);
            return match; // Garder la première occurrence même si protégée
          }
          
          if (!firstFound) {
            firstFound = true;
            return match;
          }
          
          removedCount++;
          const paraText = match.replace(/<[^>]+>/g, ' ').trim().substring(0, 60);
          console.log(`   ✂️ Paragraphe répétitif supprimé (n-gram "${ngram.substring(0, 40)}..."): "${paraText}..."`);
          return '';
        });
      }
    }
  });
  
  // AMÉLIORATION: Détecter et supprimer les répétitions dans les titres H2/H3 en boucle jusqu'à ce qu'il n'y en ait plus
  let iterations = 0;
  const maxIterations = 10; // Sécurité pour éviter boucle infinie
  let totalDuplicateTitles = 0; // Compteur total de titres dupliqués
  
  while (iterations < maxIterations) {
    const h2h3Pattern = /<(h[23])[^>]*>([^<]+)<\/h[23]>/gi;
    const titles = [];
    let titleMatch;
    while ((titleMatch = h2h3Pattern.exec(cleanedHtml)) !== null) {
      const titleText = titleMatch[2].trim().toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
      if (titleText.length > 10) {
        titles.push({
          fullMatch: titleMatch[0],
          text: titleText,
          normalized: titleText,
          index: titleMatch.index
        });
      }
    }
    
    if (titles.length === 0) break;
    
    const seenTitles = new Map();
    const duplicatesToRemove = [];
    
    // Trier par index pour traiter dans l'ordre
    titles.sort((a, b) => a.index - b.index);
    
    titles.forEach((title, index) => {
      const titleText = title.normalized;
      const isSerpTitle = /ce\s*que.*ne\s*disent?\s*(pas|explicitement)/i.test(titleText) ||
                         /limites?.*biais/i.test(titleText) ||
                         /erreurs?.*(fréquentes?|courantes?|éviter)/i.test(titleText);
      
      // Même pour les sections SERP, on ne garde que la PREMIÈRE occurrence
      if (seenTitles.has(title.normalized)) {
        duplicatesToRemove.push({ title, isSerpTitle });
        totalDuplicateTitles++;
      } else {
        seenTitles.set(title.normalized, index);
        if (isSerpTitle && iterations === 0) {
          console.log(`   🛡️ Titre SERP (première occurrence, conservée): "${title.fullMatch.substring(0, 60)}..."`);
        }
      }
    });
    
    if (duplicatesToRemove.length === 0) break; // Plus de répétitions
    
    // Supprimer les duplicatas en ordre inverse pour préserver les indices
    duplicatesToRemove.sort((a, b) => b.title.index - a.title.index);
    
    let removedThisIteration = 0;
    duplicatesToRemove.forEach(({ title, isSerpTitle }, idx) => {
      // Recalculer l'index actuel dans le HTML modifié
      const currentTitleIndex = cleanedHtml.indexOf(title.fullMatch);
      
      if (currentTitleIndex !== -1) {
        // Trouver la fin de la section (prochain H2/H3 ou fin)
        const afterTitle = cleanedHtml.substring(currentTitleIndex + title.fullMatch.length);
        const nextH2Match = afterTitle.match(/<(h[23])[^>]*>/i);
        
        if (nextH2Match) {
          const sectionEnd = currentTitleIndex + title.fullMatch.length + nextH2Match.index;
          cleanedHtml = cleanedHtml.substring(0, currentTitleIndex) + cleanedHtml.substring(sectionEnd);
          removedCount++;
          removedThisIteration++;
        } else {
          // Pas de H2 suivant, supprimer jusqu'à la fin
          cleanedHtml = cleanedHtml.substring(0, currentTitleIndex);
          removedCount++;
          removedThisIteration++;
        }
      }
    });
    
    if (removedThisIteration > 0) {
      if (iterations === 0) {
        console.log(`   ✅ ${removedThisIteration} section(s) dupliquée(s) supprimée(s) (itération ${iterations + 1})`);
      }
    } else {
      break; // Aucune suppression, on peut arrêter
    }
    
    iterations++;
  }
  
  if (iterations > 1) {
    console.log(`   ✅ Nettoyage terminé après ${iterations} itération(s)`);
  }
  
  if (repetitiveNgrams > 5) {
    console.log(`   ⚠️ ${repetitiveNgrams} n-grams répétitifs détectés (contenu potentiellement redondant)`);
  }
  
  // Compter les titres dupliqués supprimés (depuis la boucle de suppression)
  let duplicateTitlesCount = 0;
  if (typeof iterations !== 'undefined' && iterations > 0) {
    duplicateTitlesCount = iterations; // Nombre d'itérations = nombre de passes de nettoyage
  }
  
  if (duplicateTitlesCount > 0) {
    console.log(`   ⚠️ ${duplicateTitlesCount} passe(s) de nettoyage de titres dupliqués effectuée(s)`);
  }
  
  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} élément(s) dupliqué(s) supprimé(s)`);
  } else {
    console.log('   ✅ Aucune répétition exacte détectée');
  }
  
  return cleanedHtml;
}

/**
 * PHASE 6.0.11.7: Suppression des phrases répétitives (aligné avec quality-analyzer.js)
 * Utilise exactement la même méthode de détection que quality-analyzer.js pour éliminer
 * les répétitions restantes après removeRepetitions()
 * @param {string} html - HTML à nettoyer
 * @param {Object} report - Rapport pour logging
 * @returns {string} HTML sans phrases répétitives
 */

export function removeRepetitivePhrases(html, report) {
  console.log('🔍 removeRepetitivePhrases: Détection finale des répétitions (méthode quality-analyzer)...');
  
  let cleanedHtml = html;
  let removedCount = 0;
  const removedPhrases = [];
  
  // Protéger les sections SERP critiques
  const protectedSections = [
    /<h2[^>]*>.*?ce\s*que\s*(les\s*(autres|témoignages|reddit)\s*)?ne\s*disent?\s*(pas|explicitement).*?<\/h2>/i,
    /<h2[^>]*>.*?limites?\s*(et\s*)?biais.*?<\/h2>/i,
    /<h2[^>]*>.*?erreurs?\s*(fréquentes?|courantes?|à\s*éviter).*?<\/h2>/i
  ];
  
  // Extraire le texte brut (sans HTML)
  const text = cleanedHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
  
  // Utiliser EXACTEMENT la même méthode que quality-analyzer.js
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
  const ngrams = new Map();
  
  // Créer les n-grams de 8 mots pour chaque phrase (comme quality-analyzer.js)
  sentences.forEach(sentence => {
    const words = sentence.split(/\s+/).filter(w => w.length > 2);
    for (let i = 0; i <= words.length - 8; i++) {
      const ngram = words.slice(i, i + 8).join(' ');
      ngrams.set(ngram, (ngrams.get(ngram) || 0) + 1);
    }
  });
  
  // Détecter les n-grams répétitifs
  const repetitiveNgrams = [];
  ngrams.forEach((count, ngram) => {
    if (count > 1) {
      repetitiveNgrams.push({ ngram, count });
    }
  });
  
  if (repetitiveNgrams.length === 0) {
    console.log('   ✅ Aucune répétition détectée (méthode quality-analyzer)');
    return cleanedHtml;
  }
  
  console.log(`   🔍 ${repetitiveNgrams.length} n-gram(s) répétitif(s) détecté(s)`);
  
  // Trier par nombre d'occurrences décroissant
  repetitiveNgrams.sort((a, b) => b.count - a.count);
  
  // Pour chaque n-gram répétitif, trouver et supprimer les phrases qui le contiennent
  const processedSentences = new Set();
  
  repetitiveNgrams.forEach(({ ngram, count }) => {
    if (count <= 1) return;
    
    // Logger le n-gram détecté
    console.log(`   🔄 N-gram répétitif (${count}x): "${ngram.substring(0, 60)}${ngram.length > 60 ? '...' : ''}"`);
    
    // AMÉLIORATION: Chercher directement les n-grams répétitifs dans le HTML (paragraphes ET listes)
    // au lieu de chercher des phrases complètes, ce qui est plus efficace pour les listes avec texte collé
    // IMPORTANT: Normaliser le texte pour la recherche (gérer entités HTML, espaces, etc.)
    const normalizeForSearch = (text) => {
      return text
        .replace(/&#8220;/g, '"')
        .replace(/&#8221;/g, '"')
        .replace(/&#8217;/g, "'")
        .replace(/&#8216;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/<[^>]+>/g, ' ') // Supprimer tags HTML restants
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };
    
    // Le n-gram vient du texte brut (déjà sans HTML), donc juste normaliser espaces et case
    const ngramNormalized = ngram
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    
    // Extraire tous les éléments (p et li) et chercher le n-gram dans leur contenu normalisé
    const ngramOccurrences = [];
    const elementRegex = /<(p|li)\b[^>]*>([\s\S]*?)<\/(p|li)>/gi;
    let elementMatch;
    let totalElements = 0;
    
    while ((elementMatch = elementRegex.exec(cleanedHtml)) !== null) {
      totalElements++;
      const elementTag = elementMatch[1].toLowerCase();
      const elementContent = elementMatch[2];
      const elementNormalized = normalizeForSearch(elementContent);
      
      // Chercher le n-gram dans le contenu normalisé (substring match flexible)
      // Le n-gram peut être tronqué, donc chercher les premiers mots du n-gram
      const ngramWords = ngramNormalized.split(/\s+/);
      if (ngramWords.length >= 5) {
        // Chercher au moins les 5 premiers mots du n-gram (plus robuste)
        const ngramPrefix = ngramWords.slice(0, 5).join(' ');
        if (elementNormalized.includes(ngramPrefix)) {
          ngramOccurrences.push({
            index: elementMatch.index,
            elementTag: elementTag,
            elementFullMatch: elementMatch[0],
            elementContent: elementContent
          });
        }
      } else if (elementNormalized.includes(ngramNormalized)) {
        // Si le n-gram est court, chercher la correspondance exacte
        ngramOccurrences.push({
          index: elementMatch.index,
          elementTag: elementTag,
          elementFullMatch: elementMatch[0],
          elementContent: elementContent
        });
      }
    }
    
    if (ngramOccurrences.length <= 1) {
      // Pas de répétition, passer au n-gram suivant
      if (ngramOccurrences.length === 0 && totalElements > 0 && repetitiveNgrams.length <= 3) {
        // Debug: vérifier si le n-gram est proche d'un élément (seulement pour les 3 premiers n-grams)
        console.log(`   ⚠️ N-gram "${ngramNormalized.substring(0, 50)}..." non trouvé dans ${totalElements} élément(s) HTML`);
      }
      return;
    }
    
    console.log(`   📋 ${ngramOccurrences.length} occurrence(s) du n-gram trouvée(s) dans le HTML`);
    
    // Garder la première occurrence, supprimer les autres
    // Trier par index pour traiter dans l'ordre (du plus bas au plus haut)
    ngramOccurrences.sort((a, b) => a.index - b.index);
    
    for (let i = 1; i < ngramOccurrences.length; i++) {
      const occurrence = ngramOccurrences[i];
      const elementStart = occurrence.index;
      const elementFullMatch = occurrence.elementFullMatch;
      const elementTag = occurrence.elementTag;
      
      // Vérifier si c'est dans une section protégée
      // IMPORTANT: Ne protéger que les sections SERP critiques, pas "Ce que la communauté apporte"
      
      // D'abord vérifier si l'élément est dans "Ce que la communauté apporte" (non protégée)
      const communauteMatch = cleanedHtml.match(/<h2[^>]*>.*?ce\s*que\s*la\s*communauté\s*apporte.*?<\/h2>/i);
      let isInCommunaute = false;
      if (communauteMatch) {
        const communauteStart = communauteMatch.index;
        const afterCommunaute = cleanedHtml.substring(communauteStart + communauteMatch[0].length);
        const nextH2AfterCommunaute = afterCommunaute.match(/<h2[^>]*>/i);
        const communauteEnd = nextH2AfterCommunaute 
          ? communauteStart + communauteMatch[0].length + (nextH2AfterCommunaute.index ?? 0)
          : cleanedHtml.length;
        
        isInCommunaute = (elementStart >= communauteStart && elementStart < communauteEnd);
      }
      
      // Si dans "Ce que la communauté apporte", ne PAS protéger - continuer à la suppression
      if (!isInCommunaute) {
        // Vérifier si c'est dans une autre section SERP protégée
        let isProtected = false;
        let protectedSectionName = '';
        
        // Vérifier si l'élément est dans une section SERP protégée
        // IMPORTANT: Utiliser matchAll pour trouver TOUTES les sections H2 et leurs limites précises
        const allH2Matches = [...cleanedHtml.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)];
        
        // Trouver la section H2 qui contient cet élément
        let containingSection = null;
        for (let i = 0; i < allH2Matches.length; i++) {
          const h2Match = allH2Matches[i];
          const h2Start = h2Match.index;
          const h2End = h2Start + h2Match[0].length;
          const nextH2Start = i < allH2Matches.length - 1 ? allH2Matches[i + 1].index : cleanedHtml.length;
          
          // Vérifier si l'élément est dans cette section H2
          if (elementStart >= h2End && elementStart < nextH2Start) {
            const h2Title = h2Match[1].trim();
            
            // Vérifier si cette section H2 est une section SERP protégée
            // IMPORTANT: "Événement central", "Résolution", etc. ne sont PAS des sections SERP protégées
            // Seules "Limites et biais", "Ce que les autres ne disent pas", "Erreurs à éviter" sont protégées
            const isProtectedSection = protectedSections.some(pattern => {
              return pattern.test(h2Match[0]);
            });
            
            if (isProtectedSection) {
              isProtected = true;
              protectedSectionName = h2Title;
              break;
            }
            
            // Si la section est "Ce que la communauté apporte", ne PAS protéger (déjà vérifié plus haut, mais double vérification)
            if (h2Title.toLowerCase().includes('communauté') && h2Title.toLowerCase().includes('apporte')) {
              // Ne pas protéger, cette section peut avoir des répétitions supprimées
              break;
            }
          }
        }
        
        if (isProtected) {
          console.log(`   🛡️ ${elementTag.toUpperCase()} répétitif protégé (section SERP "${protectedSectionName}"): "${elementFullMatch.replace(/<[^>]+>/g, ' ').trim().substring(0, 50)}..."`);
          continue;
        }
      }
      
      // Supprimer cet élément (occurrence répétitive du n-gram)
      // On garde la première occurrence (index 0), on supprime celle-ci (index i)
      const elementEnd = elementStart + elementFullMatch.length;
      cleanedHtml = cleanedHtml.substring(0, elementStart) + cleanedHtml.substring(elementEnd);
      removedCount++;
      removedPhrases.push({
        ngram: ngram.substring(0, 60),
        element: elementTag,
        count: count
      });
      
      const elementText = elementFullMatch.replace(/<[^>]+>/g, ' ').trim().substring(0, 60);
      console.log(`   ✂️ ${elementTag.toUpperCase()} répétitif supprimé (${count}x, n-gram: "${ngram.substring(0, 40)}..."): "${elementText}..."`);
      
      // Réinitialiser le regex pour la prochaine itération (les indices ont changé)
      // On doit recalculer les occurrences pour les n-grams suivants
      break;
    }
    
  });
  
  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} phrase(s) répétitive(s) supprimée(s)`);
    if (report && report.actions) {
      report.actions.push({
        type: 'removed_repetitive_phrases',
        details: `count=${removedCount} ngrams=${repetitiveNgrams.length}`
      });
    }
  } else {
    console.log('   ✅ Aucune phrase répétitive supprimée (toutes protégées ou déjà uniques)');
  }
  
  return cleanedHtml;
}

/**
 * PHASE 6.3: Story Alignment + Quality Gate avec auto-fix
 * Vérifie la présence/ordre des sections et auto-corrige si possible
 * @param {string} html - HTML de l'article
 * @param {Object} pipelineContext - Contexte du pipeline
 * @param {Object} report - Rapport QA
 * @returns {string} HTML corrigé
 */

export function removeEnglishH3(html) {
  const ENGLISH_WORDS_RE = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|in|on|at|to|for|of|with|from|by|as|if|do|does|did|I|you|he|she|it|we|they|my|your|his|her|our|their|what|how|why|when|where|who|which|there|here|about|not|no|but|or|and|all|any|some|just|only|also|too|very|much|more|most|so|than|then|now|out|up|down|into|over|after|before|between|under|run|running|money|find|cheap|best|worst|getting|going|coming|leaving|moving|living|working|paying|cost|costs|budget|visa|stay|month|year|week|day|travel|trip|city|country)\b/gi;
  
  let removedCount = 0;
  let result = html;
  
  // Trouver tous les H3 et vérifier s'ils sont en anglais
  const h3Pattern = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const toRemove = [];
  let h3Match;
  
  while ((h3Match = h3Pattern.exec(html)) !== null) {
    const h3Text = h3Match[1].replace(/<[^>]+>/g, '').trim();
    const words = h3Text.split(/\s+/).filter(w => w.length > 1);
    if (words.length < 3) continue; // trop court pour juger
    
    const englishWords = (h3Text.match(ENGLISH_WORDS_RE) || []).length;
    const ratio = words.length > 0 ? englishWords / words.length : 0;
    
    if (ratio > 0.40) {
      toRemove.push({
        fullMatch: h3Match[0],
        text: h3Text,
        ratio: ratio.toFixed(2)
      });
    }
  }
  
  // Supprimer en reverse pour préserver les indices
  for (const item of toRemove.reverse()) {
    // Supprimer le H3 et le paragraphe qui suit immédiatement (souvent du contexte Reddit)
    const h3Pos = result.indexOf(item.fullMatch);
    if (h3Pos === -1) continue;
    
    let removeEnd = h3Pos + item.fullMatch.length;
    // Vérifier si un <p> suit immédiatement
    const afterH3 = result.substring(removeEnd);
    const nextPMatch = afterH3.match(/^\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    if (nextPMatch) {
      // Vérifier si ce paragraphe est aussi en anglais
      const pText = nextPMatch[1].replace(/<[^>]+>/g, '').trim();
      const pEnglishWords = (pText.match(ENGLISH_WORDS_RE) || []).length;
      const pWords = pText.split(/\s+/).filter(w => w.length > 1).length;
      if (pWords > 0 && pEnglishWords / pWords > 0.40) {
        removeEnd += nextPMatch[0].length;
      }
    }
    
    result = result.substring(0, h3Pos) + result.substring(removeEnd);
    removedCount++;
  }
  
  if (removedCount > 0) {
    console.log(`   🔧 removeEnglishH3: ${removedCount} H3 anglais supprimé(s)`);
  }
  
  return result;
}

/**
 * PHASE NETTOYAGE LIENS IMBRIQUÉS: Dé-imbriquer les <a> dans <a>
 * Détecte <a href="X"><a href="Y">text</a>suffix</a> et garde le lien intérieur
 * @param {string} html - HTML
 * @returns {string} HTML nettoyé
 */

export function removeEmojisFromH2(html) {
  console.log('🧹 removeEmojisFromH2: Nettoyage des emojis dans les H2...');
  
  let cleanedHtml = html;
  let removedCount = 0;
  
  // Regex pour détecter les emojis (plages Unicode courantes + variation selectors)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}]/gu;
  
  // Trouver tous les H2 et nettoyer les emojis
  cleanedHtml = cleanedHtml.replace(/<h2([^>]*)>([^<]*)<\/h2>/gi, (match, attrs, content) => {
    const originalContent = content;
    const cleanedContent = content.replace(emojiRegex, '').trim();
    
    if (originalContent !== cleanedContent) {
      removedCount++;
      console.log(`   🧹 H2 nettoyé: "${originalContent.substring(0, 50)}..." → "${cleanedContent.substring(0, 50)}..."`);
    }
    
    return `<h2${attrs}>${cleanedContent}</h2>`;
  });
  
  if (removedCount > 0) {
    console.log(`   ✅ ${removedCount} emoji(s) supprimé(s) des H2`);
  } else {
    console.log('   ✅ Aucun emoji détecté dans les H2');
  }
  
  return cleanedHtml;
}

/**
 * PHASE 6.0.10: Supprimer les sections vides (labels emoji sans contenu)
 * Ex: "<p>🧠 Ce que le voyageur a ressenti :</p>" suivi de rien
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML sans sections vides
 */

export function removeGenericPhrasesV1(html, report) {
  let fixCount = 0;

  const patterns = [
    // "il est important de + infinitif" -> imperatif 2e pers
    { regex: /[Ii]l est important de\s+/g, replacement: '' },
    { regex: /[Ii]l est essentiel de\s+/g, replacement: '' },
    { regex: /[Ii]l est recommandé de\s+/g, replacement: '' },
    { regex: /[Ii]l est crucial de\s+/g, replacement: '' },
    { regex: /[Ii]l est conseillé de\s+/g, replacement: '' },
    { regex: /[Ii]l convient de\s+/g, replacement: '' },
    { regex: /[Nn]'hésite pas à\s+/g, replacement: '' },
    { regex: /[Nn]'hésitez pas à\s+/g, replacement: '' }
  ];

  let cleaned = html;
  for (const { regex, replacement } of patterns) {
    cleaned = cleaned.replace(regex, (match) => {
      fixCount++;
      return replacement;
    });
  }

  // Capitaliser la premiere lettre apres suppression si elle suit un tag d'ouverture ou un debut de phrase
  cleaned = cleaned.replace(/>(\s*)([a-zàâäéèêëïîôùûüÿç])/g, (m, space, letter) => {
    return '>' + space + letter.toUpperCase();
  });

  if (fixCount > 0) {
    console.log(`   🧹 GENERIC_PHRASES_FIX: ${fixCount} tournure(s) plate(s) supprimée(s)`);
    if (report) {
      report.checks.push({
        name: 'generic_phrases_fix',
        status: 'pass',
        details: `${fixCount} tournure(s) plate(s) nettoyée(s)`
      });
    }
  }
  return cleaned;
}

/**
 * PHASE 2 FIX: Nettoyage deterministe des phrases plates LLM.
 * Remplace les tournures generiques par des formulations directes.
 */

export function removeGenericPhrases(html, report) {
  const replacements = [
    // "il est important de + verbe" -> "verbe" (imperatif tu)
    [/[Ii]l est important de\s+/g, ''],
    [/[Ii]l est essentiel de\s+/g, ''],
    [/[Ii]l est recommandé de\s+/g, ''],
    [/[Ii]l est crucial de\s+/g, ''],
    [/[Ii]l est conseillé de\s+/g, ''],
    [/[Ii]l convient de\s+/g, ''],
    [/[Nn]'hésite pas à\s+/g, ''],
    [/[Nn]'hésitez pas à\s+/g, ''],
    // Variantes avec "que"
    [/[Ii]l est important que\s+/g, ''],
    [/[Ii]l est essentiel que\s+/g, ''],
  ];

  let fixCount = 0;
  let cleaned = html;
  for (const [pattern, replacement] of replacements) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, replacement);
    if (cleaned !== before) {
      const matches = before.match(pattern);
      fixCount += matches ? matches.length : 0;
    }
  }

  if (fixCount > 0) {
    console.log(`   🧹 GENERIC_PHRASE_FIX: ${fixCount} tournure(s) plate(s) supprimée(s)`);
    if (report) {
      report.checks.push({
        name: 'generic_phrase_fix',
        status: 'pass',
        details: `${fixCount} tournure(s) plate(s) nettoyée(s)`
      });
    }
  }
  return cleaned;
}

/**
 * PHASE 3 FIX: Capitalise les noms propres geographiques dans tout le HTML
 * Corrige "vietnam" → "Vietnam", "japon" → "Japon", etc.
 */
