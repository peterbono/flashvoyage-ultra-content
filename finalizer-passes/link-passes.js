/**
 * FINALIZER PASSES - Link fixing and validation
 * FV-115: Extracted from article-finalizer.js
 * Each function is bound to the ArticleFinalizer instance at runtime.
 */

export function replaceDeadLinks(html) {
  let cleanedHtml = html;
  let replacedCount = 0;
  
  // Pattern 1: "Voir les forfaits" → Airalo eSIM
  const pattern1 = /<a href="#"([^>]*)>Voir les forfaits<\/a>/gi;
  const matches1 = cleanedHtml.match(pattern1);
  if (matches1) {
    cleanedHtml = cleanedHtml.replace(pattern1, '<a href="https://www.airalo.com/" target="_blank" rel="nofollow"$1>Voir les forfaits</a>');
    replacedCount += matches1.length;
    console.log(`   🔗 ${matches1.length} lien(s) "Voir les forfaits" corrigé(s) → Airalo`);
  }
  
  // Pattern 2: "Comparer les prix" → Kiwi.com
  const pattern2 = /<a href="#"([^>]*)>Comparer les prix<\/a>/gi;
  const matches2 = cleanedHtml.match(pattern2);
  if (matches2) {
    cleanedHtml = cleanedHtml.replace(pattern2, '<a href="https://www.kiwi.com/fr/" target="_blank" rel="nofollow"$1>Comparer les prix</a>');
    replacedCount += matches2.length;
    console.log(`   🔗 ${matches2.length} lien(s) "Comparer les prix" corrigé(s) → Kiwi.com`);
  }
  
  // Pattern 3: "En savoir plus" → Booking.com
  const pattern3 = /<a href="#"([^>]*)>En savoir plus<\/a>/gi;
  const matches3 = cleanedHtml.match(pattern3);
  if (matches3) {
    cleanedHtml = cleanedHtml.replace(pattern3, '<a href="https://www.booking.com/" target="_blank" rel="nofollow"$1>En savoir plus</a>');
    replacedCount += matches3.length;
    console.log(`   🔗 ${matches3.length} lien(s) "En savoir plus" corrigé(s) → Booking.com`);
  }
  
  if (replacedCount > 0) {
    console.log(`   ✅ ${replacedCount} lien(s) mort(s) corrigé(s)`);
  }
  
  return cleanedHtml;
}

/**
 * PHASE 6.2.4.1: Détecter et corriger les liens mal formés (href contenant du HTML ou mal fermé)
 * @param {string} html - HTML de l'article
 * @returns {string} HTML avec liens corrigés
 */

export function fixMalformedLinks(html) {    
  let cleanedHtml = html;
  let fixedCount = 0;
  
  // Détecter tous les liens <a> dans le HTML
  const linkRegex = /<a\s+([^>]*)>(.*?)<\/a>/gis;
  const allLinks = [...cleanedHtml.matchAll(linkRegex)];    
  for (const linkMatch of allLinks) {
    const fullMatch = linkMatch[0];
    const attributes = linkMatch[1];
    const linkText = linkMatch[2];
    
    // Extraire le href
    const hrefMatch = attributes.match(/href=["']([^"']*)["']/i);
    if (!hrefMatch) continue;
    
    const href = hrefMatch[1];      
    // Détecter si le href contient du HTML (balises < >) ou des caractères invalides
    if (/<[^>]+>/.test(href) || /[<>]/.test(href)) {
      console.log(`   ⚠️ Lien mal formé détecté: href="${href.substring(0, 100)}..."`);
      
      // Extraire le texte du lien pour déterminer le type de lien attendu
      const linkTextLower = linkText.toLowerCase();
      let correctUrl = null;
      
      if (linkTextLower.includes('esim') || linkTextLower.includes('sim') || linkTextLower.includes('connexion') || linkTextLower.includes('fiable')) {
        correctUrl = 'https://www.airalo.com/';
      } else if (linkTextLower.includes('vol') || linkTextLower.includes('avion') || linkTextLower.includes('prix')) {
        correctUrl = 'https://www.kiwi.com/fr/';
      } else if (linkTextLower.includes('logement') || linkTextLower.includes('hôtel') || linkTextLower.includes('hébergement') || linkTextLower.includes('booking')) {
        correctUrl = 'https://www.booking.com/';
      }
      
      if (correctUrl) {
        // Remplacer le lien mal formé par un lien correct
        const newLink = `<a href="${correctUrl}" target="_blank" rel="nofollow">${linkText}</a>`;
        cleanedHtml = cleanedHtml.replace(fullMatch, newLink);
        fixedCount++;
        console.log(`   ✅ Lien corrigé: "${linkText.substring(0, 40)}..." → ${correctUrl}`);        } else {
        // Si on ne peut pas déterminer le type, supprimer le lien et garder juste le texte
        cleanedHtml = cleanedHtml.replace(fullMatch, linkText);
        fixedCount++;
        console.log(`   ⚠️ Lien mal formé supprimé (texte conservé): "${linkText.substring(0, 40)}..."`);        }
    }
  }
  
  // Détecter aussi les liens non fermés (<a href="..." sans </a>)
  const unclosedLinkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)(?=<a|$)/gis;
  const unclosedMatches = [...cleanedHtml.matchAll(unclosedLinkRegex)];    
  for (const unclosedMatch of unclosedMatches) {
    const fullMatch = unclosedMatch[0];
    const href = unclosedMatch[1];
    const linkText = unclosedMatch[2];
    
    // FIX: Si le linkText contient déjà </a>, le lien est correctement fermé — skip
    if (linkText.includes('</a>')) {
      continue;
    }
    
    // Vérifier si le lien est vraiment non fermé (pas de </a> dans les 500 caractères suivants)
    const afterMatch = cleanedHtml.substring(cleanedHtml.indexOf(fullMatch) + fullMatch.length, cleanedHtml.indexOf(fullMatch) + fullMatch.length + 500);
    if (!afterMatch.includes('</a>')) {
      console.log(`   ⚠️ Lien non fermé détecté: href="${href.substring(0, 100)}..." texte="${linkText.substring(0, 50)}..."`);
      
      // Trouver où fermer le lien (avant le prochain <a> ou à la fin du contenu)
      const nextLinkIndex = cleanedHtml.indexOf('<a', cleanedHtml.indexOf(fullMatch) + fullMatch.length);
      const closeIndex = nextLinkIndex > -1 ? nextLinkIndex : cleanedHtml.length;
      
      // Fermer le lien avant le prochain élément HTML ou à la fin
      const beforeClose = cleanedHtml.substring(0, closeIndex);
      const afterClose = cleanedHtml.substring(closeIndex);
      
      // Trouver la fin du texte du lien (avant un <h2>, <p>, </ul>, etc.)
      const textEndMatch = beforeClose.match(/(.*?)(?=<h[23]|<p|<ul|<\/ul|<\/li|$)/s);
      if (textEndMatch) {
        const textEnd = textEndMatch[1].lastIndexOf(linkText) + linkText.length;
        const fixedHtml = beforeClose.substring(0, textEnd) + '</a>' + beforeClose.substring(textEnd) + afterClose;
        cleanedHtml = fixedHtml;
        fixedCount++;
        console.log(`   ✅ Lien non fermé corrigé`);        }
    }
  }
  
  if (fixedCount > 0) {
    console.log(`   ✅ ${fixedCount} lien(s) mal formé(s) corrigé(s)`);
  }    
  return cleanedHtml;
}

/**
 * PHASE SÉCURITÉ HTML: Fermer les liens <a> non fermés
 * Scanne le HTML et ferme les <a> avant tout </li>, </p>, <h2>, <h3>, </section>
 * @param {string} html - HTML de l'article
 * @returns {string} HTML avec liens correctement fermés
 */

export function closeUnclosedAnchors(html) {
  let fixedCount = 0;
  // Stratégie: trouver chaque <a ...> et vérifier qu'il a un </a> avant le prochain tag structurel
  let result = html;
  const openAnchorRegex = /<a\s[^>]*>/gi;
  let anchorMatch;
  // Collecter toutes les positions de <a> et </a>
  const opens = [];
  const closes = [];
  const openRe = /<a\s[^>]*>/gi;
  const closeRe = /<\/a>/gi;
  while ((anchorMatch = openRe.exec(html)) !== null) {
    opens.push({ index: anchorMatch.index, end: anchorMatch.index + anchorMatch[0].length });
  }
  while ((anchorMatch = closeRe.exec(html)) !== null) {
    closes.push({ index: anchorMatch.index });
  }
  
  // Pour chaque <a>, vérifier qu'il a un </a> avant le prochain <a> ou tag structurel fermant
  // Travailler en reverse pour ne pas casser les indices
  const structuralCloseTags = /<\/li>|<\/p>|<h[23][^>]*>|<\/section>|<\/ul>|<\/ol>/gi;
  
  for (let i = opens.length - 1; i >= 0; i--) {
    const open = opens[i];
    const nextOpen = opens[i + 1];
    const endBound = nextOpen ? nextOpen.index : result.length;
    
    // Chercher un </a> entre cette ouverture et la borne
    const segment = result.substring(open.end, endBound);
    const hasClose = /<\/a>/i.test(segment);
    
    if (!hasClose) {
      // Trouver le premier tag structurel fermant dans le segment
      const structMatch = segment.match(/<\/li>|<\/p>|<h[23][^>]*>|<\/section>|<\/ul>|<\/ol>/i);
      if (structMatch) {
        const insertPos = open.end + structMatch.index;
        result = result.substring(0, insertPos) + '</a>' + result.substring(insertPos);
        fixedCount++;
      } else {
        // Fermer à la fin du segment
        result = result.substring(0, open.end + segment.length) + '</a>' + result.substring(open.end + segment.length);
        fixedCount++;
      }
    }
  }
  
  if (fixedCount > 0) {
    console.log(`   🔧 closeUnclosedAnchors: ${fixedCount} lien(s) non fermé(s) corrigé(s)`);
  }
  
  return result;
}

/**
 * PHASE NETTOYAGE H3 ANGLAIS: Supprimer les H3 contenant du texte majoritairement anglais
 * Ces H3 viennent de questions Reddit qui se glissent dans le body
 * @param {string} html - HTML de l'article
 * @returns {string} HTML nettoyé
 */

export function deduplicateNestedLinks(html) {
  let fixedCount = 0;
  let result = html;
  
  // Pattern: <a ...>...<a ...>text</a>...suffix...</a>
  // On garde le lien intérieur et le suffixe comme texte
  const nestedPattern = /<a\s[^>]*>([^<]*)<a\s([^>]*)>([\s\S]*?)<\/a>([^<]*)<\/a>/gi;
  
  result = result.replace(nestedPattern, (match, prefixText, innerAttrs, innerText, suffixText) => {
    fixedCount++;
    // Garder le lien intérieur, mettre prefix/suffix comme texte nu
    return `${prefixText}<a ${innerAttrs}>${innerText}</a>${suffixText}`;
  });
  
  if (fixedCount > 0) {
    console.log(`   🔧 deduplicateNestedLinks: ${fixedCount} lien(s) imbriqué(s) corrigé(s)`);
  }
  
  return result;
}

/**
 * PHASE 6.2.4.1: Extraire les H2/H3 imbriqués dans des <p> tags
 * Les éléments block (h2, h3, etc.) ne doivent jamais être à l'intérieur d'un <p>
 * @param {string} html - HTML de l'article
 * @returns {string} HTML corrigé
 */

/**
 * Auto-fix broken internal links pointing to non-existent FlashVoyage URLs.
 * Detects fabricated slugs (LLM hallucinations) and either fixes or removes them.
 * @param {string} html - HTML content
 * @returns {string} HTML with broken internal links fixed
 */
export function fixBrokenInternalLinks(html) {
  if (!html || typeof html !== 'string') return html;

  let fixedCount = 0;
  let removedCount = 0;

  // Known valid URL patterns for flashvoyage.com
  const VALID_PATH_PATTERNS = [
    /^\/$/,                                    // Homepage
    /^\/destination\/[a-z-]+\/?$/,              // /destination/thailand/
    /^\/category\/[a-z-]+\/?$/,                 // /category/nomade-digital/
    /^\/[a-z0-9-]{5,120}\/?$/,                   // /slug-article/ (valid article slug)
    /^\/tag\/[a-z-]+\/?$/,                      // /tag/bangkok/
    /^\/author\/[a-z-]+\/?$/,                   // /author/name/
  ];

  // Known broken URL patterns (LLM hallucinations)
  const BROKEN_PATTERNS = [
    /flashvoyage\.com\/[a-z]{2}\//, // /fr/, /en/ - no localization
    /flashvoyage\.com\/blog\//,     // /blog/ prefix doesn't exist
    /flashvoyage\.com\/articles?\//,// /article(s)/ prefix doesn't exist
    /flashvoyage\.com\/guide\//,    // /guide/ prefix doesn't exist
    /flashvoyage\.com\/page\//,     // /page/ prefix doesn't exist
    /flashvoyage\.com\/post\//,     // /post/ prefix doesn't exist
    /flashvoyage\.com\/[^"]*\s/,    // URL containing spaces
    /flashvoyage\.com\/[^"]*[A-Z]/, // URL with uppercase (WordPress uses lowercase slugs)
    /flashvoyage\.com\/#/,           // Anchor-only links
    /flashvoyage\.com\/wp-content/,  // Direct file links
    /flashvoyage\.com\/wp-admin/,    // Admin links
    /flashvoyage\.com\/[^/"]*\.[a-z]+$/, // File extensions (not slug)
  ];

  const linkRegex = /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  const result = html.replace(linkRegex, (fullMatch, pre, href, post, innerContent) => {
    // Only process internal FlashVoyage links
    const isInternal = /flashvoyage/i.test(href);
    if (!isInternal) return fullMatch;

    // Check against known broken patterns
    const isBroken = BROKEN_PATTERNS.some(p => p.test(href));

    if (isBroken) {
      // Extract the anchor text (strip HTML)
      const anchorText = innerContent.replace(/<[^>]*>/g, '').trim();

      if (anchorText && anchorText.length > 2) {
        // Replace broken link with plain text (keep the anchor text, remove the link)
        removedCount++;
        console.log('   BROKEN_LINK_FIX: removed broken link "' + href.substring(0, 80) + '" (kept text: "' + anchorText.substring(0, 50) + '")');
        return anchorText;
      } else {
        // No useful anchor text — remove entirely
        removedCount++;
        return '';
      }
    }

    // Additional check: href="#" or empty (already handled by replaceDeadLinks but safety net)
    if (href === '#' || href === '' || href === 'https://flashvoyage.com/#' || href === 'https://flashvoyage.com') {
      const anchorText = innerContent.replace(/<[^>]*>/g, '').trim();
      if (anchorText && anchorText.length > 2) {
        removedCount++;
        return anchorText;
      }
      removedCount++;
      return '';
    }

    return fullMatch;
  });

  if (removedCount > 0) {
    console.log('   ' + removedCount + ' broken internal link(s) fixed');
  }

  return result;
}

export function validateInternalLinks(html) {
  const errors = [];
  if (!html || typeof html !== 'string') return { valid: true, errors: [] };
  // Liens internes: href contient flashvoyage ou commence par /
  const linkRegex = /<a\s+([^>]*?)href\s*=\s*["']([^"']*)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = (m[2] || '').trim();
    const inner = (m[4] || '').replace(/<[^>]*>/g, '').trim();
    const isInternal = /flashvoyage|^\//i.test(href);
    if (!isInternal) continue;
    if (!href || href === '#' || href === '') {
      errors.push(`Lien interne sans href valide (ancre: "${inner.slice(0, 50)}...")`);
      continue;
    }
    if (!inner || inner === ':' || /^\s*:\s*$/.test(inner) || inner.endsWith(' :') || inner.endsWith(' : ')) {
      errors.push(`Lien interne sans ancre valide (href: ${href.slice(0, 60)}...)`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Quality gate étendue : ouverture immersive, H2 blacklist conditionnelle, quotes, hook sans Reddit.
 * @param {string} html - HTML à vérifier
 * @param {Object} [pipelineContext] - Contexte du pipeline (story, evidence) pour les fallbacks
 * @returns {{ noForbiddenH2: boolean, hasImmersiveOpening: boolean, noGenericH2: boolean, hasMinQuotes: boolean, hookWithoutReddit: boolean, warnings: string[] }}
 */

