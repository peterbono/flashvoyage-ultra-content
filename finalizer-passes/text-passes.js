/**
 * FINALIZER PASSES - Text normalization, spacing, accents
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */

export function normalizeTextForComparison(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Décoder les entités HTML
  let normalized = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  // Supprimer les balises HTML
  normalized = normalized.replace(/<[^>]*>/g, '');
  
  // Normaliser les espaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Supprimer la ponctuation finale
  normalized = normalized.replace(/[.,;:!?]+$/, '');
  
  return normalized.toLowerCase();
}

/**
 * PHASE 6.2: Calcule la similarité Jaccard entre deux textes (tokens)
 * @param {string} text1 - Premier texte
 * @param {string} text2 - Deuxième texte
 * @returns {number} Similarité entre 0 et 1
 */

export function jaccardSimilarity(text1, text2) {
  const normalize = (t) => {
    return t.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2); // Filtrer les mots trop courts
  };
  
  const tokens1 = new Set(normalize(text1));
  const tokens2 = new Set(normalize(text2));
  
  if (tokens1.size === 0 && tokens2.size === 0) return 1;
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

/**
 * PHASE 6.1: Supprime les paragraphes dupliqués exacts
 * PHASE 6.2: Amélioré avec normalisation agressive et détection quasi-doublons
 * @param {string} html - HTML à nettoyer
 * @param {Object} report - Rapport QA pour enregistrer les actions
 * @returns {string} HTML sans doublons
 */

export function normalizeSpacing(html, report) {
  console.log('🔧 normalizeSpacing: Normalisation des espaces et sauts de ligne...');
  
  let cleanedHtml = html;
  let fixesCount = 0;
  // CORRECTION CRITIQUE: Protéger les widgets (script/form) AVANT tout traitement pour éviter qu'ils soient modifiés
  const widgetPlaceholders = new Map();
  let widgetCounter = 0;
  
  // Protéger les scripts de widgets (travelpayouts, kiwi, airalo, etc.)
  cleanedHtml = cleanedHtml.replace(/<script[^>]*(?:src|data-widget-type|travelpayouts|kiwi|airalo|trpwdg)[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    const placeholder = `__WIDGET_SCRIPT_${widgetCounter++}__`;
    widgetPlaceholders.set(placeholder, match);
    return placeholder;
  });
  
  // Protéger les forms de widgets (kiwi, travelpayouts, etc.)
  cleanedHtml = cleanedHtml.replace(/<form[^>]*(?:class|data-widget-type|kiwi|travelpayouts)[^>]*>[\s\S]*?<\/form>/gi, (match) => {
    const placeholder = `__WIDGET_FORM_${widgetCounter++}__`;
    widgetPlaceholders.set(placeholder, match);
    return placeholder;
  });
  
  // Protéger les divs de widgets (airalo, esim, etc.)
  cleanedHtml = cleanedHtml.replace(/<div[^>]*(?:class|data-widget-type|airalo|esim)[^>]*>[\s\S]*?<\/div>/gi, (match) => {
    const placeholder = `__WIDGET_DIV_${widgetCounter++}__`;
    widgetPlaceholders.set(placeholder, match);
    return placeholder;
  });
  
  // Protéger les shortcodes WordPress [fv_widget ...]
  cleanedHtml = cleanedHtml.replace(/\[fv_widget[^\]]*\]/gi, (match) => {
    const placeholder = `__WIDGET_SHORTCODE_${widgetCounter++}__`;
    widgetPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Protéger les commentaires Gutenberg (wp:details, wp:heading, wp:paragraph, etc.)
  // normalizeSpacing corrompt les ":" dans "wp:details" en ajoutant un espace
  cleanedHtml = cleanedHtml.replace(/<!-- \/?(wp:[a-z]+[^>]*) -->/g, (match) => {
    const placeholder = `__GUTENBERG_COMMENT_${widgetCounter++}__`;
    widgetPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Protéger les blocs <style>...</style> (CSS FAQ, etc.)
  // normalizeSpacing ajoute des espaces dans les sélecteurs CSS (.class → . class, ::after → :: after)
  cleanedHtml = cleanedHtml.replace(/<style[\s\S]*?<\/style>/gi, (match) => {
    const placeholder = `__WIDGET_STYLE_${widgetCounter++}__`;
    widgetPlaceholders.set(placeholder, match);
    return placeholder;
  });

  // Protéger les éléments avec attributs data-fv-* (authority booster moves)
  // normalizeSpacing ajoute des espaces dans les valeurs d'attributs (post.evidence → post. evidence)
  // Backreference \1 pour que le tag fermant corresponde au tag ouvrant (évite que </p> interne stoppe le match avant </div>)
  cleanedHtml = cleanedHtml.replace(/<(div|p|span)([^>]*data-fv-(?:proof|move)[^>]*)>[\s\S]*?<\/\1>/gi, (match) => {
    const placeholder = `__WIDGET_FVMOVE_${widgetCounter++}__`;
    widgetPlaceholders.set(placeholder, match);
    return placeholder;
  });
  
  // DEBUG: Vérifier combien de widgets ont été protégés
  console.log(`🔍 DEBUG normalizeSpacing: ${widgetPlaceholders.size} widget(s) protégé(s) avant traitement`);
  
  // CORRECTION CRITIQUE: Protéger TOUTES les entités HTML dès le début pour éviter qu'elles soient traitées comme du texte normal
  // Cela empêche les espaces d'être insérés autour des entités HTML
  const globalEntityPlaceholders = new Map();
  let globalEntityCounter = 0;
  
  cleanedHtml = cleanedHtml.replace(/&#\d+;|&[a-z]+;/gi, (match) => {
    const placeholder = `__ENTITY_GLOBAL_${globalEntityCounter++}__`;
    globalEntityPlaceholders.set(placeholder, match);
    return placeholder;
  });
  
  // 1. Normaliser les sauts de ligne entre paragraphes (un seul \n\n)
  cleanedHtml = cleanedHtml.replace(/(<\/p>)\s*\n\s*\n\s*\n+(<p[^>]*>)/g, '$1\n\n$2');
  cleanedHtml = cleanedHtml.replace(/(<\/p>)\s*\n\s*\n\s*\n+/g, '$1\n\n');
  
  // 2. Corriger les phrases collées sans espace après ponctuation
  // Détecter les cas où une ponctuation est suivie directement d'une lettre (sans espace)
  // Les entités HTML sont déjà protégées par globalEntityPlaceholders
  const beforeFix = cleanedHtml;
  cleanedHtml = cleanedHtml.replace(/([.!?;:])([a-zA-ZÀ-ÿ])/g, '$1 $2');
  
  const afterFix = cleanedHtml.match(/([.!?;:])([a-zA-ZÀ-ÿ])/g) || [];
  fixesCount += (beforeFix.match(/([.!?;:])([a-zA-ZÀ-ÿ])/g) || []).length - afterFix.length;
  
  // 3. Supprimer les espaces avant les ponctuations
  cleanedHtml = cleanedHtml.replace(/\s+([.!?;:,])/g, '$1');
  
  // 4. Normaliser les espaces multiples dans le texte (garder un seul espace)
  // Mais préserver les espaces dans les balises HTML
  // Les entités HTML sont déjà protégées par globalEntityPlaceholders
  const textParts = cleanedHtml.split(/(<[^>]+>)/);
  for (let i = 0; i < textParts.length; i += 2) {
    // Traiter seulement les parties texte (indices pairs)
    if (textParts[i]) {
      // Remplacer les espaces multiples par un seul espace
      textParts[i] = textParts[i].replace(/[ \t]+/g, ' ');
      // Supprimer les espaces en début et fin de ligne UNIQUEMENT si la partie adjacente
      // est une balise block (pas inline comme <a>, <strong>, <em>, etc.)
      // Cela préserve l'espace entre "sur " et "<a href=...>"
      const prevPart = i > 0 ? textParts[i - 1] : '';
      const nextPart = i + 1 < textParts.length ? textParts[i + 1] : '';
      const inlineTags = /^<\/?(a|strong|em|b|i|span|abbr|cite|code|mark|small|sub|sup|time)\b/i;
      
      // Ne supprimer l'espace de début que si le tag précédent est un tag block (pas inline)
      if (!inlineTags.test(prevPart)) {
        textParts[i] = textParts[i].replace(/^[ \t]+/gm, '');
      }
      // Ne supprimer l'espace de fin que si le tag suivant est un tag block (pas inline)
      if (!inlineTags.test(nextPart)) {
        textParts[i] = textParts[i].replace(/[ \t]+$/gm, '');
      }
    }
  }
  cleanedHtml = textParts.join('');
  
  // 5. Corriger les cas où deux paragraphes sont collés sans espace entre eux
  // Détecter </p><p> sans espace/saut de ligne
  cleanedHtml = cleanedHtml.replace(/(<\/p>)(<p[^>]*>)/g, '$1\n\n$2');
  
  // 6. Normaliser les espaces entre les balises BLOCK uniquement
  // CORRECTION: Ne PAS supprimer les espaces autour des balises INLINE (a, strong, em, span, etc.)
  // car cela cause "surVoyager" (pas d'espace) et "prot éger" (accents cassés)
  const blockTags = 'p|div|h[1-6]|section|article|header|footer|nav|ul|ol|li|blockquote|table|tr|td|th|thead|tbody|figure|figcaption|hr|br';
  // Supprimer les espaces/sauts de ligne entre deux balises block adjacentes
  cleanedHtml = cleanedHtml.replace(new RegExp(`(<\\/(?:${blockTags})>)\\s+(<(?:${blockTags})[\\s>])`, 'gi'), '$1\n$2');
  // Supprimer les espaces après une balise block ouvrante (avant le contenu)
  cleanedHtml = cleanedHtml.replace(new RegExp(`(<(?:${blockTags})(?:\\s[^>]*)?>)\\s+`, 'gi'), '$1');
  // Supprimer les espaces avant une balise block fermante (après le contenu)
  cleanedHtml = cleanedHtml.replace(new RegExp(`\\s+(<\\/(?:${blockTags})>)`, 'gi'), '$1');
  
  // 6.5bis. Garantir un espace entre une balise inline fermante et le mot suivant
  // SEULEMENT si ce n'est pas à l'intérieur d'un même mot (vérifier qu'il y avait un espace avant la balise ouvrante)
  // Ex: "<strong>Budget:</strong>Environ" → "<strong>Budget:</strong> Environ"
  // Mais PAS: "cons<em>é</em>quences" → ne pas ajouter d'espace
  cleanedHtml = cleanedHtml.replace(/(:)(<\/(?:strong|em|b|i)>)([a-zA-ZÀ-ÿ])/gi, '$1$2 $3');
  
  // 7. Réinsérer les espaces nécessaires après les balises de fermeture de paragraphe
  cleanedHtml = cleanedHtml.replace(/(<\/p>)([a-zA-ZÀ-ÿ])/g, '$1 $2');
  
  // 8. Corriger les cas où un mot se termine et le suivant commence sans espace dans le même paragraphe
  // Détecter les patterns comme "mot1.mot2" ou "mot1mot2" dans le contenu des paragraphes
  // AMÉLIORATION: Protéger les entités HTML avant traitement
  // CORRECTION: Vérifier d'abord s'il y a déjà des placeholders d'entités (éviter double traitement)
  const hasExistingPlaceholders = /__ENTITY\d+_\d+__/.test(cleanedHtml);
  
  const entityPlaceholders2 = new Map();
  let entityCounter2 = 0;
  
  // CORRECTION: Ne créer des placeholders que si les entités HTML existent ET qu'il n'y a pas déjà de placeholders
  if (!hasExistingPlaceholders) {
    cleanedHtml = cleanedHtml.replace(/&#\d+;|&[a-z]+;/gi, (match) => {
      const placeholder = `__ENTITY2_${entityCounter2++}__`;
      entityPlaceholders2.set(placeholder, match);
      return placeholder;
    });
  }
  
  // CORRECTION: Utiliser un regex qui capture le contenu même avec des placeholders ou balises HTML imbriquées
  // Utiliser [\s\S]*? pour capturer tout le contenu jusqu'à </p>
  cleanedHtml = cleanedHtml.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, (match, openTag, content, closeTag) => {
    // CORRECTION CRITIQUE: Protéger les balises HTML imbriquées (h2, h3, a, strong, em, etc.)
    // pour éviter que les regex digit-letter transforment <h2> en <h 2>
    const tagPlaceholders = new Map();
    let tagCounter = 0;
    
    let protectedContent = content.replace(/<[^>]+>/g, (tag) => {
      const key = `__TAG_${tagCounter++}__`;
      tagPlaceholders.set(key, tag);
      return key;
    });
    
    // Protéger les placeholders d'entités HTML
    const placeholderPattern = /(__ENTITY\d+_\d+__)/g;
    const protectedPlaceholders = new Map();
    let placeholderCounter = 0;
    
    protectedContent = protectedContent.replace(placeholderPattern, (ph) => {
      const key = `__PROTECTED_${placeholderCounter++}__`;
      protectedPlaceholders.set(key, ph);
      return key;
    });
    
    // Corriger les cas où une lettre minuscule est suivie d'une majuscule sans espace
    // MAIS exclure les cas où c'est après une apostrophe/guillemet (ex: "l'Expérience")
    let fixedContent = protectedContent.replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, (m, before, after) => {
      // Ne pas insérer d'espace si le caractère précédent est une apostrophe ou un guillemet
      const beforeMatch = protectedContent.substring(0, protectedContent.indexOf(m));
      if (/['"']$/.test(beforeMatch)) {
        return m; // Garder tel quel
      }
      return before + ' ' + after;
    });
    
    // Corriger les cas où un chiffre est suivi d'une lettre sans espace (si ce n'est pas une date/heure)
    fixedContent = fixedContent.replace(/(\d)([A-Za-zÀ-ÿ])/g, '$1 $2');
    // Corriger les cas où une lettre est suivie d'un chiffre sans espace (si ce n'est pas une unité)
    fixedContent = fixedContent.replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2');
    
    // Restaurer les placeholders protégés (ordre: entités d'abord, puis tags)
    protectedPlaceholders.forEach((placeholder, key) => {
      fixedContent = fixedContent.replace(key, placeholder);
    });
    tagPlaceholders.forEach((tag, key) => {
      fixedContent = fixedContent.replace(key, tag);
    });
    
    return openTag + fixedContent + closeTag;
  });
  
  // CORRECTION: Restaurer les entités HTML UNIQUEMENT si on en a créé
  // Mais d'abord restaurer les placeholders globaux
  if (!hasExistingPlaceholders && entityPlaceholders2.size > 0) {
    entityPlaceholders2.forEach((entity, placeholder) => {
      cleanedHtml = cleanedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), entity);
    });
  }
  
  // CORRECTION CRITIQUE: Restaurer TOUTES les entités HTML protégées globalement à la fin
  globalEntityPlaceholders.forEach((entity, placeholder) => {
    cleanedHtml = cleanedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), entity);
  });
  
  // CORRECTION CRITIQUE: Restaurer les placeholders d'entités HTML restants (venant d'étapes précédentes)
  // Pattern générique pour capturer tous les formats de placeholders: __ENTITY2_16__, __ENTITY 2_16__, etc.
  // Ces placeholders doivent être remplacés par l'entité HTML correspondante ou supprimés s'ils sont orphelins
  cleanedHtml = cleanedHtml.replace(/__ENTITY\s*\d+_\d+__/g, (match) => {
    // Si on a l'entité correspondante dans globalEntityPlaceholders, la restaurer
    // Sinon, supprimer le placeholder (il est orphelin)
    // Pour l'instant, on supprime les placeholders orphelins car on ne peut pas les restaurer sans connaître l'entité originale
    return ''; // Supprimer les placeholders orphelins
  });
  
  // CORRECTION FINALE: Nettoyage agressif des espaces dans les mots (dernière passe après toutes les restaurations)
  // Cette passe finale capture les cas qui ont pu échapper aux passes précédentes
  // APPROCHE INTELLIGENTE: Capturer le mot ENTIER avant l'espace pour distinguer
  // les mots cassés (itin éraire → itinéraire) des mots séparés (ou équilibre → garder)
  const _knownMerged = new Set(['voilà', 'déjà', 'holà']);
  // Mots français autonomes commençant par accent/cédille — JAMAIS fusionnés avec le mot précédent
  const _ACCENTED_STANDALONE = new Set([
    'économique','économiques','économie','économies','économiser',
    'également','égal','égale','égaux','égalité',
    'élevé','élevée','élevés','élevées','élever',
    'échanger','échange','échanges','échappé','échapper',
    'événement','événements','éventuel','éventuellement',
    'étranger','étrangère','étrangers','étrangères',
    'étude','études','étudiant','étudiants',
    'énergie','énergies','énergique','énorme','énormes','énormément',
    'équilibre','équipe','équipé','équipement',
    'éviter','évité','évitez','évite',
    'écrire','écrit','écriture',
    'élection','élections','élu','élus',
    'émission','émissions','émotion','émotions',
    'époque','époques',
    'être','état','états',
    'île','îles','îlot',
    'ôter','ôté',
    'ûrement',
    'à','où',
  ]);
  const _commonWords = new Set([
    'le','la','les','de','des','du','un','une','ou','et','en','au','aux',
    'ce','se','ne','me','te','je','tu','il','on','ma','sa','ta',
    'par','sur','pour','dans','avec','sous','plus','mais','tout','bien',
    'est','pas','que','qui','ont','été','peu','car','sans','vers',
    'chez','donc','puis','si','ni','mon','ton','son','mes','tes','ses',
    'nos','vos','leur','leurs','cette','ces','quel','dont','comme','quand',
    'alors','aussi','même','après','entre','notre','votre','encore','trop',
    'très','non','oui','peut','fait','dit','mis','pris','tous','ici',
    'option','lire','coûts','coût','prix','peuvent','doit','être',
    'avoir','faire','voir','dire','aller','venir','mettre','prendre',
    'part','haut','bout','pays','type','mode','base','zone','site',
    'plan','idée','avis','nord','effet','offre','accès','guide'
  ]);
  cleanedHtml = cleanedHtml.replace(/([a-zà-ÿ]+)\s+([àâäéèêëïîôùûüÿ][a-zà-ÿ]*)/gi, (m, part1, part2) => {
    const combined = (part1 + part2).toLowerCase();
    // Mots connus qui doivent être fusionnés (voilà, déjà...)
    if (_knownMerged.has(combined)) return part1 + part2;
    // "à" seul est TOUJOURS la préposition française — garder l'espace
    if (part2.toLowerCase() === 'à') return m;
    // Mot accentué autonome (économique, également, élevé...) — JAMAIS fusionner
    if (_ACCENTED_STANDALONE.has(part2.toLowerCase())) return m;
    // Si part1 est un mot français autonome courant, garder l'espace
    if (_commonWords.has(part1.toLowerCase())) return m;
    // Sinon fusionner (mot cassé par espace parasite)
    return part1 + part2;
  });

  // Nettoyage final pour les mots complets avec espace avant lettre accentuée finale
  // Exclure les cas où le mot avant l'espace est un mot français valide (ex: "Numériques à" → garder séparé)
  cleanedHtml = cleanedHtml.replace(/\b([a-zà-ÿ]{4,}[bcdfghjklmnpqrstvwxz])\s+([àâäéèêëïîôùûüÿ])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
    // Mots connus à fusionner malgré accent "à"
    if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
    // "à" seul est la préposition — garder l'espace
    if (accent.toLowerCase() === 'à') return m;
    if (word.endsWith('s') && accent === 'é') return m;
    return word + accent;
  });
  
  // CORRECTION CRITIQUE: Nettoyer les espaces incorrects dans les mots (problème venant de WordPress ou étape précédente)
  // Pattern: lettre + espace + lettre accentuée (signe de mot coupé par entité HTML mal gérée)
  // Exemples: "r éel" → "réel", "s éjour" → "séjour", "n écessaires" → "nécessaires"
  // AMÉLIORATION: Traiter aussi les blockquotes et autres conteneurs de texte
  // Note: blockquote peut contenir des <p> à l'intérieur, donc on traite d'abord les blockquotes complets
  cleanedHtml = cleanedHtml.replace(/(<blockquote[^>]*>)([\s\S]*?)(<\/blockquote>)/g, (match, openTag, content, closeTag) => {
    // Traiter le contenu du blockquote (qui peut contenir des <p>)
    let fixedBlockquote = content;
    
    // Protéger les balises HTML imbriquées
    const tagPlaceholdersBlockquote = new Map();
    let tagCounterBlockquote = 0;
    let protectedBlockquote = fixedBlockquote.replace(/<[^>]+>/g, (tag) => {
      const key = `__TAG_BQ_${tagCounterBlockquote++}__`;
      tagPlaceholdersBlockquote.set(key, tag);
      return key;
    });
    
    // Protéger les entités HTML
    const entityPlaceholdersBlockquote = new Map();
    let entityCounterBlockquote = 0;
    protectedBlockquote = protectedBlockquote.replace(/&#\d+;|&[a-z]+;/gi, (entity) => {
      const key = `__ENTITY_BQ_${entityCounterBlockquote++}__`;
      entityPlaceholdersBlockquote.set(key, entity);
      return key;
    });
    
    // Appliquer les corrections pour les mots avec espaces
    // Pattern: Mot français (3+ lettres) + espace + lettre accentuée isolée
    protectedBlockquote = protectedBlockquote.replace(/\b([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿ])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
      // Mots connus à fusionner (voilà, déjà...)
      if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
      if (accent.toLowerCase() === 'à') return m;
      const combined = word + accent;
      if (combined.length >= 4 && !(word.endsWith('s') && accent === 'é' && word.length > 6)) {
        return combined;
      }
      return m;
    });
    
    // Restaurer les placeholders
    entityPlaceholdersBlockquote.forEach((entity, key) => {
      protectedBlockquote = protectedBlockquote.replace(key, entity);
    });
    tagPlaceholdersBlockquote.forEach((tag, key) => {
      protectedBlockquote = protectedBlockquote.replace(key, tag);
    });
    
    return openTag + protectedBlockquote + closeTag;
  });
  
  cleanedHtml = cleanedHtml.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, (match, openTag, content, closeTag) => {
    // Protéger les balises HTML imbriquées
    const tagPlaceholders = new Map();
    let tagCounter = 0;
    let protectedContent = content.replace(/<[^>]+>/g, (tag) => {
      const key = `__TAG_${tagCounter++}__`;
      tagPlaceholders.set(key, tag);
      return key;
    });
    
    // Protéger les entités HTML restantes
    const entityPlaceholdersCleanup = new Map();
    let entityCounterCleanup = 0;
    protectedContent = protectedContent.replace(/&#\d+;|&[a-z]+;/gi, (entity) => {
      const key = `__ENTITY_CLEANUP_${entityCounterCleanup++}__`;
      entityPlaceholdersCleanup.set(key, entity);
      return key;
    });
    
    // CORRECTION: Fusionner les mots coupés (approche générique et robuste)
    // Pattern amélioré pour capturer tous les cas de mots coupés par des espaces
    // Exemples: "g énéralement", "r évèle", "recommand é", "détaill é", "subjectivit é"
    let fixedContent = protectedContent;
    
    // Pattern 1: 1-2 lettres + espace + lettre accentuée + reste du mot (ex: "g énéralement" → "généralement")
    // AMÉLIORATION: Détecter aussi les cas avec apostrophe/entité mal placée (ex: "pass' é" → "passé", "pay' é" → "payé")
    const beforePattern1 = fixedContent;
    
    // Pattern 1a: Mot + apostrophe + espace + lettre accentuée (ex: "pass' é" → "passé")
    // FIX H1: replaced \b with French-aware boundary
    fixedContent = fixedContent.replace(/([a-zà-ÿ]{3,})[''`]\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{1,})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
      const combined = part1 + part2;
      // Vérifier que c'est un mot français valide (au moins 4 lettres)
      if (combined.length >= 4) {
        return combined;
      }
      return m;
    });
    
    // Pattern 1b: 1-2 lettres + espace + lettre accentuée + reste du mot (ex: "g énéralement" → "généralement")
    // FIX H1: replaced \b with French-aware boundary; added ç
    fixedContent = fixedContent.replace(/([a-zà-ÿ]{1,2})\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{2,})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
      const combined = part1 + part2;
      // Vérifier que ce n'est pas une préposition valide séparée
      const commonPrepositions = ['de', 'en', 'le', 'la', 'les', 'un', 'une', 'du', 'des', 'ce', 'se', 'ne', 'me', 'te', 'à', 'ou', 'et', 'si'];
      if (!commonPrepositions.includes(part1.toLowerCase()) && combined.length >= 4) {
        return combined;
      }
      return m;
    });
    
    // Pattern 1c: Mot français (3+ lettres) + espace + lettre accentuée/ç isolée (ex: "pass é" → "passé", "per ç" → "perç")
    // FIX H1: replaced \b with French-aware boundary
    fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
      if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
      if (accent.toLowerCase() === 'à') return m;
      const combined = word + accent;
      if (combined.length >= 4 && !(word.endsWith('s') && accent === 'é' && word.length > 6)) {
        return combined;
      }
      return m;
    });
    
    // Pattern 1d: Mot français (4+ lettres, PAS un mot courant) + espace + suffixe accentué (1-8 lettres)
    // Ex: "anim ées" → "animées", "financi ère" → "financière", "comp étitifs" → "compétitifs"
    // Cible les suffixes typiques cassés, pas les vrais mots indépendants
    const COMMON_WORDS = new Set(['dans','avec','pour','plus','sous','sans','chez','tout','mais','très','bien','font','sont','nous','vous','leur','elle','cela','cette','entre','après','avant','comme','aussi','autre','faire','avoir','être','même','dont','vers','quel','ceux','ceci','hors','dès','lors','près']);
    // FIX H4: Added ç-related suffixes + éré/éri/éris missing suffixes
    const KNOWN_ACCENTED_SUFFIXES = /^(ée|ées|és|éré|érée|érées|ère|ères|ière|ières|èrement|ément|éments|étaire|étaires|étude|érence|érences|érieur|érieure|érieurs|érable|érables|émie|érité|érite|ètement|ériaux|érial|ériel|étique|étiques|èse|èses|èbre|èbres|ôle|ôles|ôt|ôts|ûre|ûres|ûté|ûtés|ître|îtres|érente|érentes|étitif|étitifs|étitive|étitives|érés|érément|ènement|ènements|çue|çues|çu|çus|çant|çants|çon|çons|çais|çaise|çaises)$/i;
    let p1dRepairs = [];
    let p1dSkipped = [];
    // FIX H4: Added ç to detection pattern for "per çue" cases
    // FIX H1: replaced \b with French-aware boundaries (?<![a-zà-ÿ]) / (?![a-zà-ÿ])
    fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{1,8})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
      if (COMMON_WORDS.has(part1.toLowerCase())) { p1dSkipped.push({m, reason:'common'}); return m; }
      // Mot accentué autonome — ne JAMAIS fusionner
      if (_ACCENTED_STANDALONE.has(part2.toLowerCase())) { p1dSkipped.push({m, reason:'standalone_word', part2}); return m; }
      if (KNOWN_ACCENTED_SUFFIXES.test(part2)) {
        p1dRepairs.push({from:m, to:part1+part2});
        return part1 + part2;
      }
      p1dSkipped.push({m, reason:'not_suffix', part2});
      return m;
    });
    
    // Pattern 2: Mot français (3+ lettres) + espace + lettre accentuée isolée (ex: "pass é" → "passé", "pay é" → "payé", "bas é" → "basé")
    // FIX H1: replaced \b with French-aware boundary; added ç
    fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç])(?=\s|$|[.,;:!?<])/gi, (m, word, accent) => {
      if (_knownMerged.has((word + accent).toLowerCase())) return word + accent;
      if (accent.toLowerCase() === 'à') return m;
      const combined = word + accent;
      if (combined.length >= 4) {
        if (word.endsWith('s') && accent === 'é' && word.length > 6) {
          const afterMatch = protectedContent.substring(protectedContent.indexOf(m) + m.length);
          if (afterMatch.match(/^\s+[a-zà-ÿ]{3,}/)) {
            return m;
          }
        }
        return combined;
      }
      return m;
    });
    
    // Log si des corrections ont été faites
    if (fixedContent !== beforePattern1) {
      console.log(`   🔧 Nettoyage espaces dans mots: ${(beforePattern1.match(/\b[a-zà-ÿ]{1,2}\s+[àâäéèêëïîôùûüÿ]/gi) || []).length} → ${(fixedContent.match(/\b[a-zà-ÿ]{1,2}\s+[àâäéèêëïîôùûüÿ]/gi) || []).length}`);
    }
    
    // Restaurer les éléments protégés
    entityPlaceholdersCleanup.forEach((entity, key) => {
      fixedContent = fixedContent.replace(key, entity);
    });
    tagPlaceholders.forEach((tag, key) => {
      fixedContent = fixedContent.replace(key, tag);
    });
    
    return openTag + fixedContent + closeTag;
  });

  // CORRECTION FINALE: Détecter et corriger les mots français collés sans espace
  // Pattern: mot français (4+ lettres) + mot français (4+ lettres) collés ensemble
  // Exemples: "tempsétait" → "temps était", "Resterà" → "Rester à", "échapperà" → "échapper à"
  // On cherche les transitions: minuscule→majuscule ou lettre→lettre accentuée
  cleanedHtml = cleanedHtml.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/g, (match, openTag, content, closeTag) => {
    // Protéger les balises HTML imbriquées
    const tagPlaceholders = new Map();
    let tagCounter = 0;
    let protectedContent = content.replace(/<[^>]+>/g, (tag) => {
      const key = `__TAG_FINAL_${tagCounter++}__`;
      tagPlaceholders.set(key, tag);
      return key;
    });
    
    // Protéger les entités HTML
    const entityPlaceholdersFinal = new Map();
    let entityCounterFinal = 0;
    protectedContent = protectedContent.replace(/&#\d+;|&[a-z]+;/gi, (entity) => {
      const key = `__ENTITY_FINAL_${entityCounterFinal++}__`;
      entityPlaceholdersFinal.set(key, entity);
      return key;
    });
    
    // Pattern 1: Mot français (4+ lettres) suivi d'une VRAIE majuscule (ex: "tempsÉtait" → "temps Était")
    // FIX: [A-ZÀ-Ÿ] incluait les accents minuscules (é=U+00E9 est dans U+00C0-U+0178)
    // On utilise maintenant [A-ZÀÂÄÇÈÉÊËÎÏÔÙÛÜ] pour ne matcher QUE les majuscules
    // FIX H1: replaced \b with French-aware boundaries
    let fixedContent = protectedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{4,})([A-ZÀÂÄÇÈÉÊËÎÏÔÙÛÜ][a-zà-ÿ]{2,})(?![a-zà-ÿ])/g, (m, word1, word2) => {
      const beforeMatch = protectedContent.substring(0, protectedContent.indexOf(m));
      if (/['"']$/.test(beforeMatch)) {
        return m;
      }
      return word1 + ' ' + word2;
    });
    
    // Pattern 2: Mot français suivi de "à" collé (ex: "Resterà" → "Rester à", "échapperà" → "échapper à")
    // FIX H1: replaced \b with French-aware boundaries
    fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{4,})(à)([a-zà-ÿ]{2,})(?![a-zà-ÿ])/gi, (m, word, preposition, rest) => {
      // Vérifier que "à" est bien une préposition et non partie du mot suivant
      // Ex: "Resterà" → "Rester à" (si "à" est suivi d'un mot)
      return word + ' ' + preposition + ' ' + rest;
    });
    
    // Pattern 1b: Mots collés à une frontière d'accent minuscule (ex: "prixélevé" → "prix élevé")
    // Condition: la partie APRÈS l'accent doit être un mot français courant (whitelist)
    // FIX H1: \b fails near placeholders (__TAG_FINAL_X__) because _ is a word char
    //   → Use (?<![a-zà-ÿ]) / (?![a-zà-ÿ]) instead of \b for French-aware boundaries
    // FIX H3: Group 1 min reduced from {3,} to {2,} to handle "les" + "échanges"
    //   Whitelist expanded with missing common accented words
    const COMMON_ACCENTED_WORDS = /^(être|état|était|étaient|étant|également|économique|économiques|économiser|économies|élevé|élevés|élevée|élevées|éventuelles?|éventuels?|éventuel|échanges?|échanger|écrire|énergie|énormes?|équilibre|équilibré|équilibrés|équilibrée|équilibrées|équipé|équipés|équipées?|évaluer|éviter|évoluer|évolution|étape|étapes|étranger|étrangers|étrangère|étrangères|étude|études|évidemment|éventail|échapper|époque|épaules|écran|éléments?|émission|émotion|édition|êtes|être)$/i;
    
    let p1bMatches = [];
    let p1bSkipped = [];
    fixedContent = fixedContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{2,}[bcdfghjklmnpqrstvwxz])([àâäéèêëïîôùûüÿç][a-zà-ÿ]{3,})(?![a-zà-ÿ])/gi, (m, word1, word2) => {
      if (m.length < 7) return m;
      if (COMMON_ACCENTED_WORDS.test(word2)) {
        p1bMatches.push({from: m, to: word1 + ' ' + word2});
        return word1 + ' ' + word2;
      }
      p1bSkipped.push({word: m, word2});
      return m;
    });

    // Restaurer les placeholders
    entityPlaceholdersFinal.forEach((entity, key) => {
      fixedContent = fixedContent.replace(key, entity);
    });
    tagPlaceholders.forEach((tag, key) => {
      fixedContent = fixedContent.replace(key, tag);
    });
    
    return openTag + fixedContent + closeTag;
  });
  
  // CORRECTION CRITIQUE: Restaurer les widgets APRÈS tous les traitements
  let restoredCount = 0;
  widgetPlaceholders.forEach((widget, placeholder) => {
    const beforeRestore = cleanedHtml;
    cleanedHtml = cleanedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), widget);
    if (cleanedHtml !== beforeRestore) {
      restoredCount++;
    }
  });
  
  // DEBUG: Vérifier que les widgets ont été restaurés
  const widgetsAfterRestore = this.detectRenderedWidgets(cleanedHtml);
  const hasPlaceholdersRemaining = /__WIDGET_(SCRIPT|FORM|DIV|SHORTCODE)_\d+__/.test(cleanedHtml);
  console.log(`🔍 DEBUG normalizeSpacing: ${restoredCount}/${widgetPlaceholders.size} widget(s) restauré(s), ${widgetsAfterRestore.count} détecté(s) APRÈS restauration, placeholders restants: ${hasPlaceholdersRemaining}`);
  
  // Si des placeholders restent, les restaurer manuellement
  if (hasPlaceholdersRemaining) {
    widgetPlaceholders.forEach((widget, placeholder) => {
      cleanedHtml = cleanedHtml.replace(placeholder, widget);
    });
    const widgetsAfterManualRestore = this.detectRenderedWidgets(cleanedHtml);
    console.log(`🔍 DEBUG normalizeSpacing: Après restauration manuelle: ${widgetsAfterManualRestore.count} widget(s) détecté(s)`);
  }    
  if (fixesCount > 0 || cleanedHtml !== html) {
    report.actions.push({
      type: 'normalized_spacing',
      details: `Espaces et sauts de ligne normalisés`
    });
    console.log(`   ✅ Espaces et sauts de ligne normalisés`);
  }
  
  // PASSE GLOBALE: Réparer les accents cassés dans TOUT le HTML (h2, h3, li, td, etc.)
  // Les passes précédentes ne traitent que les <p>, ceci couvre le reste
  const GLOBAL_COMMON_WORDS = new Set(['dans','avec','pour','plus','sous','sans','chez','tout','mais','très','bien','font','sont','nous','vous','leur','elle','cela','cette','entre','après','avant','comme','aussi','autre','faire','avoir','être','même','dont','vers','quel','ceux','ceci','hors','dès','lors','près','les','des','mes','ses','ces','une','par','sur','son','mon','ton','aux','pas','car','que','qui','est','ont']);
  // FIX H4: Added ç suffixes, ç detection, éré missing suffix
  const GLOBAL_SUFFIXES = /^(ée|ées|és|éré|érée|érées|ère|ères|èrement|ément|éments|étaire|étaires|étude|érence|érences|érieur|érieure|érieurs|érable|érables|émie|érité|érite|ètement|ériaux|érial|ériel|étique|étiques|èse|èses|èbre|èbres|ôle|ôles|ôt|ôts|ûre|ûres|ûté|ûtés|ître|îtres|érente|érentes|étitif|étitifs|étitive|étitives|érés|érément|ènement|ènements|ière|ières|çue|çues|çu|çus|çant|çants|çon|çons|çais|çaise|çaises)$/i;
  let globalPassRepairs = [];
  let globalPassSkipped = [];
  // FIX H1: replaced \b with French-aware boundaries; FIX H4: added ç to detection
  cleanedHtml = cleanedHtml.replace(/(?<=>)([^<]+)(?=<)/g, (match, textContent) => {
    return textContent.replace(/(?<![a-zà-ÿ])([a-zà-ÿ]{3,})\s+([àâäéèêëïîôùûüÿç][a-zà-ÿ]{1,8})(?![a-zà-ÿ])/gi, (m, part1, part2) => {
      if (GLOBAL_COMMON_WORDS.has(part1.toLowerCase())) { globalPassSkipped.push({m, reason:'common_word', part1}); return m; }
      // Mot accentué autonome — ne JAMAIS fusionner
      if (_ACCENTED_STANDALONE.has(part2.toLowerCase())) { globalPassSkipped.push({m, reason:'standalone_word', part2}); return m; }
      if (GLOBAL_SUFFIXES.test(part2)) { globalPassRepairs.push({from:m, to:part1+part2}); return part1 + part2; }
      globalPassSkipped.push({m, reason:'not_suffix', part2});
      return m;
    });
  });
  
  return cleanedHtml;
}

/**
 * PHASE 6.0.11: Suppression des répétitions de phrases
 * Détecte et supprime les phrases identiques ou très similaires qui apparaissent plusieurs fois
 * @param {string} html - HTML à nettoyer
 * @returns {string} HTML sans répétitions
 */

export function capitalizeProperNouns(html) {
  const PROPER_NOUNS = {
    'vietnam': 'Vietnam', 'thaïlande': 'Thaïlande', 'thailande': 'Thaïlande',
    'indonésie': 'Indonésie', 'indonesie': 'Indonésie', 'singapour': 'Singapour',
    'japon': 'Japon', 'cambodge': 'Cambodge', 'malaisie': 'Malaisie',
    'philippines': 'Philippines', 'myanmar': 'Myanmar', 'laos': 'Laos',
    'taïwan': 'Taïwan', 'taiwan': 'Taïwan',
    'bangkok': 'Bangkok', 'hanoi': 'Hanoi', 'hanoï': 'Hanoï',
    'tokyo': 'Tokyo', 'kyoto': 'Kyoto', 'osaka': 'Osaka',
    'bali': 'Bali', 'lombok': 'Lombok', 'phuket': 'Phuket',
    'chiang mai': 'Chiang Mai', 'ho chi minh': 'Ho Chi Minh',
    'kuala lumpur': 'Kuala Lumpur', 'phnom penh': 'Phnom Penh',
    'siem reap': 'Siem Reap', 'da nang': 'Da Nang',
    'angkor wat': 'Angkor Wat', 'angkor': 'Angkor',
    'hong kong': 'Hong Kong', 'séoul': 'Séoul', 'seoul': 'Séoul',
    'manille': 'Manille', 'jakarta': 'Jakarta', 'cebu': 'Cebu',
    'ubud': 'Ubud', 'canggu': 'Canggu', 'seminyak': 'Seminyak',
  };

  let result = html;
  let fixes = 0;

  // Traiter d'abord les noms multi-mots (pour eviter des remplacements partiels)
  const sorted = Object.entries(PROPER_NOUNS).sort((a, b) => b[0].length - a[0].length);

  for (const [lower, proper] of sorted) {
    if (lower === proper.toLowerCase() && lower === proper) continue;
    const escaped = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Ne remplacer que dans le contenu texte (pas dans les attributs/URLs)
    const pattern = new RegExp(`(>[^<]*?)\\b${escaped}\\b`, 'gi');
    const before = result;
    result = result.replace(pattern, (match, prefix) => {
      // Verifier que le mot n'est pas deja bien capitalise
      const wordInMatch = match.substring(prefix.length);
      if (wordInMatch === proper) return match;
      return prefix + proper;
    });
    if (result !== before) {
      fixes++;
    }
  }

  if (fixes > 0) {
    console.log(`   ✏️ PROPER_NOUNS: ${fixes} nom(s) propre(s) capitalisé(s)`);
  }
  return result;
}

/**
 * PHASE 2.3b: Corrige les mots colles (ex: "alternativeeconomique" -> "alternative economique")
 * Module dedie, separe du detecteur d'anglais.
 * Regles: >14 chars, segments >=4 chars, pas de split si tiret/apostrophe, whitelist mots valides.
 */

export function fixWordGlue(html, report) {
  const VALID_LONG_WORDS = new Set([
    'déséquilibrer', 'rééquilibrer', 'réorganiser', 'préexistant', 'interethnique',
    'réélection', 'réévaluer', 'préétabli', 'réexaminer', 'réorienter',
    'préinscription', 'réintroduire', 'réinventer', 'réinitialiser',
    'réaménager', 'réapprendre', 'réapprovisionnement', 'préavis',
    'coéquipier', 'autoévaluation', 'néanmoins', 'dorénavant',
    'conséquemment', 'subséquemment', 'simultanément', 'antérieurement',
    'postérieurement', 'extérieurement', 'intérieurement', 'ultérieurement',
    'inévitablement', 'considérablement', 'préalablement', 'éventuellement',
    'particulièrement', 'régulièrement', 'dernièrement', 'premièrement',
    'deuxièmement', 'troisièmement', 'entièrement', 'sincèrement',
    'conséquence', 'différemment', 'référence', 'préférence',
    'expérience', 'compétence', 'fréquence', 'séquence',
    'précédent', 'indépendant', 'présentation', 'préparation',
    'génération', 'opération', 'réservation', 'célébration'
  ]);

  let fixCount = 0;

  // Pre-pass: split 2-char common French words glued to accented words (not caught by main regex {3,})
  const SHORT_GLUE_WORDS = new Set(['tu', 'où', 'il', 'on', 'ou', 'au', 'du', 'un', 'je', 'ce', 'se', 'ne', 'te', 'me', 'le', 'la', 'de', 'en', 'ni', 'si']);
  const preClean = html.replace(/\b([a-zàâäéèêëïîôùûüÿçœ]{2})(é|è|ê|à|â|ù|û|ô|î|œ)([a-zàâäéèêëïîôùûüÿçœ]{3,})\b/gi, (match, left, accent, right) => {
    if (SHORT_GLUE_WORDS.has(left.toLowerCase())) {
      fixCount++;
      return left + ' ' + accent + right;
    }
    return match;
  });

  // PHASE 3 FIX: Seuil abaisse de 15 a 7 chars pour attraper "fautêtre" (8), "doitêtre" (8), etc.
  const cleaned = preClean.replace(/\b([a-zàâäéèêëïîôùûüÿç]{3,})(é|è|ê|à|â|ù|û|ô|î)([a-zàâäéèêëïîôùûüÿç]{3,})\b/gi, (match, left, accent, right) => {
    if (match.length < 7) return match;
    if (match.includes('-') || match.includes("'") || match.includes('\u2019')) return match;
    const lower = match.toLowerCase();
    if (VALID_LONG_WORDS.has(lower)) return match;
    if (left.length < 3 || right.length < 3) return match;
    fixCount++;
    return left + ' ' + accent + right;
  });

  // PHASE 3 FIX ADDENDUM: Collages connus sans accent (LLM artefacts frequents)
  const KNOWN_GLUE_FIXES = [
    [/repas(e|é)conomiques?/gi, 'Repas $1conomique'],
    [/nuit(s?)hotel/gi, 'nuit$1 hotel'],
    [/ticket(s?)bus/gi, 'ticket$1 bus'],
    [/visa(s?)touristiques?/gi, 'visa$1 touristique'],
  ];

  // Nom propre (majuscule) collé à un mot accentué (Tokyoépuisé → Tokyo épuisé)
  const PROPER_NOUN_GLUE = /([A-ZÀÂÉÈÊËÏÎÔÙÛÜŸÇ][a-zàâäéèêëïîôùûüÿçœ]{2,})(é|è|ê|à|â|ù|û|ô|î)([a-zàâäéèêëïîôùûüÿçœ]{2,})/g;
  let camelCleaned = cleaned.replace(PROPER_NOUN_GLUE, (match, left, accent, right) => {
    const lower = match.toLowerCase();
    if (VALID_LONG_WORDS.has(lower)) return match;
    fixCount++;
    return left + ' ' + accent + right;
  });
  for (const [regex, replacement] of KNOWN_GLUE_FIXES) {
    const before = camelCleaned;
    camelCleaned = camelCleaned.replace(regex, replacement);
    if (camelCleaned !== before) fixCount++;
  }

  // PHASE 3 FIX: Reparer les espaces parasites a l'interieur des mots (artefact tokenisation LLM)
  let spaceFixes = 0;
  const COMMON_SPLIT_WORDS = {
    'suppl émentaires': 'supplémentaires',
    'suppl émentaire': 'supplémentaire',
    'compl ètement': 'complètement',
    'compl émentaire': 'complémentaire',
    'compl émentaires': 'complémentaires',
    'particuli èrement': 'particulièrement',
    'consid érablement': 'considérablement',
    'r éellement': 'réellement',
    'g énéralement': 'généralement',
    'imm édiatement': 'immédiatement',
    'r égulièrement': 'régulièrement',
    'pr écédemment': 'précédemment',
    'enti èrement': 'entièrement',
    'derni èrement': 'dernièrement',
    'é normément': 'énormément',
    'v éritablement': 'véritablement',
    'n écessairement': 'nécessairement',
    'pr éalablement': 'préalablement',
    'c œur': 'cœur',
    'intér êt': 'intérêt',
    'intér êts': 'intérêts',
    'entr être': 'entretenir',
    'man œuvre': 'manœuvre',
    'man œuvres': 'manœuvres',
    'œ uvre': 'œuvre',
    'œ uvres': 'œuvres',
    'au-del à': 'au-delà',
    'peut- être': 'peut-être',
    'peut -être': 'peut-être',
    'c\' est': "c'est",
    'l\' on': "l'on",
    'd\' un': "d'un",
    'd\' une': "d'une",
    'qu\' il': "qu'il",
    'qu\' elle': "qu'elle",
    'n\' est': "n'est",
    'j\' ai': "j'ai",
    's\' est': "s'est",
  };

  let cleanedWithSpaces = camelCleaned;
  for (const [broken, fixed] of Object.entries(COMMON_SPLIT_WORDS)) {
    const regex = new RegExp(broken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const before = cleanedWithSpaces;
    cleanedWithSpaces = cleanedWithSpaces.replace(regex, fixed);
    if (cleanedWithSpaces !== before) {
      spaceFixes++;
    }
  }

  // Pattern generique: lettre(s) + espace + accent + lettres (artefact tokenisation)
  // Ex: "suppl émentaires" → "supplémentaires" (espace parasite dans un mot)
  // IMPORTANT: Ne PAS rejoindre si left est un mot français autonome (sinon on recolle "peuvent être" → "peuventêtre")
  // Deux garde-fous : (1) liste de mots courants, (2) heuristique suffixe verbes/adverbes/noms
  const DO_NOT_JOIN_LEFT = new Set([
    'des', 'les', 'une', 'un', 'du', 'au', 'aux', 'ces', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs',
    'de', 'le', 'la', 'ce', 'ma', 'ta', 'sa', 'mon', 'ton', 'son',
    'peut', 'sont', 'font', 'fait', 'doit', 'faut', 'vont', 'veut', 'ont', 'est', 'fut', 'soit',
    'pense', 'doivent', 'peuvent', 'seront', 'auraient', 'avaient', 'feront', 'aurais',
    'pour', 'dans', 'par', 'sur', 'sous', 'sans', 'vers', 'chez', 'entre', 'avec',
    'que', 'qui', 'elle', 'elles', 'lui', 'leur', 'nous', 'vous', 'ils',
    'comment', 'tout', 'toute', 'cette', 'chaque', 'notre', 'votre',
    'choix', 'transport', 'mode', 'prix', 'prise', 'prend', 'cet',
    'comme', 'quand', 'mais', 'donc', 'aussi', 'bien', 'tant', 'trop', 'fort', 'quel', 'quelle',
    'très', 'après', 'avant', 'depuis', 'même', 'encore', 'assez', 'moins', 'peu',
    'ou', 'et', 'ni', 'si', 'car', 'plus', 'pas', 'bon', 'bel', 'mal', 'vif', 'bas', 'gros', 'long', 'fin',
    'voyage', 'peux', 'faire', 'seulement', 'sembler', 'pourrait', 'pourraient',
    'devrait', 'devraient', 'serait', 'seraient', 'aurait', 'semble', 'reste',
    'confort', 'alors', 'jamais', 'souvent', 'parfois', 'toujours', 'vraiment',
    'certains', 'certaines', 'certain', 'certaine', 'quelques', 'plusieurs', 'chacun', 'chacune',
    'aucun', 'aucune', 'autres', 'autre', 'nombreux', 'nombreuses',
    'tu', 'il', 'je', 'on', 'où', 'se', 'ne', 'te', 'me', 'en',
    'repas',
  ]);
  const WORD_SUFFIX_RE = /(?:er|ir|re|oir|ais|ait|aient|ons|ent|ant|ment|eux|oux|age|tion|eur|ard|ois|ais|ence|ance|ure|ble|que|ise|ose|ude|es|ez|ing|ns|ts)$/i;
  cleanedWithSpaces = cleanedWithSpaces.replace(/\b([a-zàâäéèêëïîôùûüÿçœ]{1,})\s(é|è|ê|à|â|ù|û|ô|î|œ)([a-zàâäéèêëïîôùûüÿçœ]{1,})\b/gi, (match, left, accent, right) => {
    if (match.includes('-') || match.includes("'")) return match;
    const joined = left + accent + right;
    if (joined.length > 20) return match;
    if (joined.length < 3) return match;
    const leftLower = left.toLowerCase();
    const isKnownWord = DO_NOT_JOIN_LEFT.has(leftLower);
    const hasSuffix = left.length >= 4 && WORD_SUFFIX_RE.test(leftLower);
    if (isKnownWord || hasSuffix) {
      return match;
    }
    spaceFixes++;
    return joined;
  });

  const totalFixes = fixCount + spaceFixes;
  if (totalFixes > 0) {
    console.log(`   🔧 WORD_GLUE_FIX: ${fixCount} collage(s) + ${spaceFixes} espace(s) parasite(s) corrigé(s)`);
    if (report) {
      report.checks.push({
        name: 'word_glue_fix',
        status: 'pass',
        details: `${fixCount} collage(s) + ${spaceFixes} espace(s) parasite(s) corrigé(s)`
      });
    }
  }
  return cleanedWithSpaces;
}

/**
 * Nettoyage déterministe final (ponctuation/phrases tronquées/résidus typographiques).
 */

export function applyDeterministicFinalTextCleanup(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html;

  // Corriger ponctuation cassée en début de paragraphe
  out = out.replace(/<p[^>]*>\s*[?.!,:;]\s*/gi, '<p>');

  // Supprimer les paragraphes quasi-vides ou tronqués
  out = out.replace(/<p[^>]*>\s*(?:\.\s*|»\s*|\?\s*|:\s*)<\/p>/gi, '');

  // Réparer espaces autour des apostrophes et caractères accentués éclatés
  out = out
    .replace(/\s+([’'])/g, '$1')
    .replace(/([’'])\s+/g, '$1');

  // Supprimer les fragments CSS orphelins parfois injectés dans le contenu
  out = out
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/<p[^>]*>\s*\.?entry-content\s+\.?wp-block-details[\s\S]*?<\/p>/gi, '')
    .replace(/^\s*\.?entry-content\s+\.?wp-block-details.*$/gmi, '');

  // Corriger explicitement les artefacts vus en prod (sans regex destructrices)
  const TYPO_FIXES = [
    [/\bbudg\s+et\b/gi, 'budget'],
    [/\bbi\s+en\b/gi, 'bien'],
    [/\bfuse\s+au\b/gi, 'fuseau'],
    [/\by\s+en\b/gi, 'yen'],
    [/\bmoy\s+en\b/gi, 'moyen'],
    [/\bitin\s+éraire\b/gi, 'itinéraire'],
    [/\bpr\s+éparé\b/gi, 'préparé'],
    [/\bpr\s+éparer\b/gi, 'préparer'],
    [/\btemps\s*à\b/gi, 'temps à'],
    [/\bbonjour\s*à\b/gi, 'bonjour à'],
    [/\bmarathon\s*épuisant\b/gi, 'marathon épuisant'],
    [/\brepaséconomique\b/gi, 'repas économique'],
    [/\brepas\s*économique\b/gi, 'repas économique'],
    [/\bbi\s+en\s+préparé\b/gi, 'bien préparé'],
    [/\bbi\s+en\s+organiser\b/gi, 'bien organiser']
  ];
  for (const [pattern, replacement] of TYPO_FIXES) {
    out = out.replace(pattern, replacement);
  }

  // Fermer les guillemets français ouverts sans fermeture
  out = out.replace(/«([^»]{10,300})(?=<\/p>|<\/li>|<\/blockquote>)/g, (match, content) => {
    if (content.includes('»')) return match;
    return '«' + content.trim() + ' »';
  });

  // Supprimer les formulations vagues typiques de l'IA
  out = out.replace(/\bquelques\s+euros\b/gi, 'un coût non négligeable');
  out = out.replace(/\bplusieurs\s+dizaines\s+d['']euros\b/gi, 'un surcoût significatif');
  out = out.replace(/\bun\s+budget\s+modeste\b/gi, 'un budget raisonnable');

  // Ajouter espaces après ponctuation manquants uniquement dans les noeuds texte
  // (évite de casser les URLs dans les attributs HTML, ex: trpwdg.com/content?trs=...)
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (m, text) => {
    return text
      .replace(/([;!?])([A-Za-zÀ-ÖØ-öø-ÿ0-9])/g, '$1 $2')
      .replace(/:([A-Za-zÀ-ÖØ-öø-ÿ])/g, ': $1')
      .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])\s*:\s*([0-9])/g, '$1 : $2')
      .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])\(/g, '$1 (');
  });

  // Nettoyage d'espaces multiples intra-texte (sans casser les balises)
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (m, text) => text.replace(/\s{2,}/g, ' '));

  // Corriger des collages résiduels observés en production
  out = out
    .replace(/\bcuisineépicée\b/gi, 'cuisine épicée')
    .replace(/(&euro;|€)\s*en\b/gi, '$1 en')
    .replace(/UTC([+-]\d{2}):\s*(\d{2})/g, 'UTC$1:$2')
    .replace(/<\/strong>(?=[A-Za-zÀ-ÖØ-öø-ÿ0-9])/g, '</strong> ');

  return out;
}

/**
 * En mode NEWS, garantit un socle SERP minimal (K9) si le LLM n'a pas produit
 * les sections indispensables.
 */

export async function detectAndFixIncompleteSentences(html, report) {
  console.log('🔍 Détection phrases incomplètes (warning only - pas de suppression)...');
  
  const suspectSentences = [];
  
  // Pattern 1: DÉSACTIVÉ COMPLÈTEMENT - causait suppression de contenu valide
  // Paragraphes sans ponctuation finale sont souvent du contenu éditorial valide
  
  // Pattern 2: Phrases qui se terminent par des mots très courts (< 3 caractères)
  // WARNING ONLY - ne supprime plus, juste signale
  const incompleteWords = html.match(/<p[^>]*>([^<]*\s[a-z]{1,2})<\/p>/gi);
  if (incompleteWords) {
    incompleteWords.forEach(match => {
      const text = match.replace(/<[^>]+>/g, '').trim();
      const lastWord = text.split(/\s+/).pop();
      if (lastWord && lastWord.length < 3 && text.length > 20) {
        suspectSentences.push({
          text: text.substring(0, 100),
          reason: 'mot_incomplet'
        });
      }
    });
  }
  
  // Pattern 3: Paragraphes qui se terminent brutalement
  // WARNING ONLY - ne supprime plus
  const unclosedParagraphs = html.match(/<p[^>]*>([^<]{50,})(?!<\/p>)/gi);
  if (unclosedParagraphs) {
    unclosedParagraphs.forEach(match => {
      const text = match.replace(/<[^>]+>/g, '').trim();
      const lastWord = text.split(/\s+/).pop();
      if (lastWord && lastWord.length < 3 && text.length > 50) {
        suspectSentences.push({
          text: match.substring(0, 100),
          reason: 'paragraphe_non_ferme'
        });
      }
    });
  }
  
  // Ajouter au rapport (WARNING ONLY - pas de suppression)
  if (suspectSentences.length > 0) {
    report.checks.push({
      name: 'incomplete_sentences',
      status: 'warn', // Warning, pas fail - la passe 2 LLM devrait avoir corrigé
      details: `${suspectSentences.length} phrase(s) suspecte(s) détectée(s) (non supprimées)`
    });
    
    // Log les warnings pour diagnostic
    suspectSentences.forEach(item => {
      console.log(`   ⚠️ Phrase suspecte (${item.reason}): "${item.text}..."`);
    });
  } else {
    report.checks.push({
      name: 'incomplete_sentences',
      status: 'pass',
      details: 'Aucune phrase suspecte détectée'
    });
  }
  
  console.log(`✅ Phrases incomplètes: ${suspectSentences.length} warning(s), 0 supprimée(s) (passe 2 LLM gère les corrections)`);
  
  // RETOURNE HTML INCHANGÉ - plus de suppression
  return html;
}

/**
 * PHASE 2 FIX: Nettoyage deterministe des tournures plates recurrentes du LLM.
 * Remplace "il est important de [verbe]" par le verbe directement a l'imperatif (tutoiement).
 */

export function escapeHtml(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * PHASE 6.2: Extrait les tokens d'un texte (normalisé, sans stopwords)
 */

export function extractTokens(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Stopwords FR/EN courants
  const stopwords = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'mais', 'donc', 'car', 'ne', 'pas', 'plus', 'très', 'tout', 'tous', 'toute', 'toutes',
    'the', 'a', 'an', 'and', 'or', 'but', 'so', 'because', 'not', 'no', 'very', 'all', 'every', 'each',
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'ce', 'cette', 'ces', 'son', 'sa', 'ses',
    'i', 'you', 'he', 'she', 'we', 'they', 'it', 'this', 'that', 'these', 'those', 'his', 'her', 'its',
    'être', 'avoir', 'faire', 'dire', 'aller', 'voir', 'savoir', 'vouloir', 'pouvoir', 'devoir',
    'be', 'have', 'do', 'say', 'go', 'see', 'know', 'want', 'can', 'must', 'should', 'will', 'would'
  ]);
  
  // Normaliser: lowercase, strip accents basique, remove punctuation
  let normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
  
  // Split en tokens et filtrer stopwords + tokens trop courts
  const tokens = normalized
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopwords.has(t));
  
  return tokens;
}

/**
 * Trouve une position d'insertion contextuelle pour un widget (après le premier bloc qui mentionne des mots-clés liés au type).
 */

export function convertTitleUSDToEUR(title) {
  if (!title) return title;
  const rate = 0.92;
  let result = title;
  result = result.replace(/\$\s?(\d[\d,]*)/g, (_, amt) => {
    const n = parseFloat(amt.replace(/,/g, ''));
    if (isNaN(n) || n <= 0) return _;
    return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
  });
  result = result.replace(/(\d[\d\s,.]*\d|\d)\s*(?:USD|dollars?)\b/gi, (_, amt) => {
    const n = parseFloat(amt.replace(/[\s.]/g, '').replace(',', '.'));
    if (isNaN(n) || n <= 0) return _;
    return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
  });
  result = result.replace(/(\d[\d,]*)\$/g, (_, amt) => {
    const n = parseFloat(amt.replace(/,/g, ''));
    if (isNaN(n) || n <= 0) return _;
    return `${Math.round(n * rate).toLocaleString('fr-FR')} €`;
  });
  if (result !== title) {
    console.log(`💶 TITLE_USD_TO_EUR: "${title}" → "${result}"`);
  }
  return result;
}


export function convertCurrencyToEUR(html) {
  if (!html) return html;

  const USD_TO_EUR_RATE = 0.92;
  let converted = 0;

  // Protéger les blocs <script> (JSON-LD, etc.)
  const scriptPlaceholders = new Map();
  let scriptIdx = 0;
  let safeHtml = html.replace(/<script[\s\S]*?<\/script>/gi, (match) => {
    const ph = `__CURRENCY_SCRIPT_${scriptIdx++}__`;
    scriptPlaceholders.set(ph, match);
    return ph;
  });

  // Pattern 1: $1,000 or $1000 or $50 (dollar sign prefix)
  // Exclude if already followed by euros/EUR or inside existing "(N USD)"
  safeHtml = safeHtml.replace(
    /\$\s?([\d,]+(?:\.\d{1,2})?)\b(?!\s*(?:euros?|EUR))/g,
    (match, amountStr, offset) => {
      // Skip if this is inside an existing "(X USD)" parenthetical
      const before = safeHtml.substring(Math.max(0, offset - 5), offset);
      if (/\(~?\s*$/.test(before)) return match;

      const amount = parseFloat(amountStr.replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) return match;
      const eur = Math.round(amount * USD_TO_EUR_RATE);
      converted++;
      return `~${eur.toLocaleString('fr-FR')} euros`;
    }
  );

  // Pattern 2: N USD or N dollars (suffix patterns)
  safeHtml = safeHtml.replace(
    /(\d[\d\s.,]*(?:\.\d{1,2})?)\s*(?:USD|dollars?)\b(?!\s*\))/gi,
    (match, amountStr, offset) => {
      // Skip if already converted
      const before = safeHtml.substring(Math.max(0, offset - 10), offset);
      if (/euros?\s*\(\s*$/.test(before)) return match;
      if (/\(\s*$/.test(before)) return match;

      const cleaned = amountStr.replace(/[\s.]/g, '').replace(',', '.');
      const amount = parseFloat(cleaned);
      if (isNaN(amount) || amount <= 0) return match;
      const eur = Math.round(amount * USD_TO_EUR_RATE);
      converted++;
      return `~${eur.toLocaleString('fr-FR')} euros`;
    }
  );

  // Pattern 3: N$ (number followed by dollar sign, common in informal writing)
  safeHtml = safeHtml.replace(
    /([\d,]+(?:\.\d{1,2})?)\$(?!\s*(?:euros?|EUR))/g,
    (match, amountStr, offset) => {
      const before = safeHtml.substring(Math.max(0, offset - 5), offset);
      if (/\(~?\s*$/.test(before)) return match;

      const amount = parseFloat(amountStr.replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) return match;
      const eur = Math.round(amount * USD_TO_EUR_RATE);
      converted++;
      return `~${eur.toLocaleString('fr-FR')} euros`;
    }
  );

  // Pattern 4: Nettoyer les parenthèses USD résiduelles générées par le LLM
  // Ex: "~920 euros (1 000 USD)" → "~920 euros", "~184 à 276 euros (~200 à 300 USD)" → "~184 à 276 euros"
  safeHtml = safeHtml.replace(/\s*\(~?[\d\s,.]+\s*(?:USD|dollars?)\)/gi, '');

  // Pattern 5: N $ ou N à/- N $ (nombre + espace + dollar sign, ou range)
  // Ex: "500 $" → "~460 euros", "500 à 700 $" → "~460 à ~644 euros"
  safeHtml = safeHtml.replace(
    /([\d\s,.]+?)\s*(?:à|-)\s*([\d\s,.]+?)\s*\$(?!\s*(?:euros?|EUR))/g,
    (match, startStr, endStr) => {
      const startAmount = parseFloat(startStr.replace(/[\s.]/g, '').replace(',', '.'));
      const endAmount = parseFloat(endStr.replace(/[\s.]/g, '').replace(',', '.'));
      if (isNaN(startAmount) || isNaN(endAmount) || startAmount <= 0 || endAmount <= 0) return match;
      const startEur = Math.round(startAmount * USD_TO_EUR_RATE);
      const endEur = Math.round(endAmount * USD_TO_EUR_RATE);
      converted++;
      return `~${startEur} à ~${endEur} euros`;
    }
  );
  // Pattern 5b: Single number + space + $ (not part of a range)
  safeHtml = safeHtml.replace(
    /(\d[\d\s,.]*)\s+\$(?!\s*(?:euros?|EUR))/g,
    (match, amountStr, offset) => {
      const before = safeHtml.substring(Math.max(0, offset - 5), offset);
      if (/\(~?\s*$/.test(before)) return match;
      if (/~\d/.test(before)) return match;
      const amount = parseFloat(amountStr.replace(/[\s.]/g, '').replace(',', '.'));
      if (isNaN(amount) || amount <= 0) return match;
      const eur = Math.round(amount * USD_TO_EUR_RATE);
      converted++;
      return `~${eur} euros`;
    }
  );

  // Restaurer les blocs <script>
  for (const [ph, original] of scriptPlaceholders) {
    safeHtml = safeHtml.replace(ph, original);
  }

  if (converted > 0) {
    console.log(`💶 CURRENCY_CONVERT: ${converted} montant(s) USD → EUR convertis`);
  }

  return safeHtml;
}
