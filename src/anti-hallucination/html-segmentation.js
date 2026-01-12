#!/usr/bin/env node

/**
 * HTML SEGMENTATION - Extraction texte éditorial (exclusions strictes)
 * =====================================================================
 * 
 * Ce module extrait le texte éditorial du HTML en excluant strictement
 * les segments non-éditoriaux (affiliate, CTA, related, boilerplate).
 * 
 * OBJECTIF: Éviter les faux positifs venant des modules marketing/affiliation
 * lors de la détection d'hallucinations.
 * 
 * RÈGLES D'EXCLUSION:
 * - Nœuds avec data-fv-segment="affiliate|cta|related|boilerplate"
 * - Modules affiliate (class="affiliate-module", data-placement-id)
 * - Blocs CTA (h2/h3 contenant "Passer à l'action", "Réserver", etc.)
 * - Section "Articles connexes" (h2/h3 contenant "Articles connexes")
 * - Scripts, styles, meta tags
 * - Wrappers premium avec data-fv-block (optionnel, selon besoin)
 * 
 * USAGE:
 *   import { extractEditorialText } from './src/anti-hallucination/html-segmentation.js';
 *   const { included_text, excluded_debug } = extractEditorialText(html);
 */

/**
 * Décode les entités HTML basiques
 */
function decodeHtmlEntities(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&#[0-9]+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
}

/**
 * Extrait le texte visible depuis un nœud HTML (strip tags, decode entities)
 */
function extractTextFromHtml(html) {
  if (!html || typeof html !== 'string') return '';
  
  // 1. Retirer scripts et styles
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  
  // 2. Retirer tous les tags HTML
  text = text.replace(/<[^>]*>/g, ' ');
  
  // 3. Decoder entités HTML
  text = decodeHtmlEntities(text);
  
  // 4. Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Exclut les segments non-éditoriaux via regex (fallback si cheerio indisponible)
 */
function excludeSegmentsRegex(html) {
  let result = html;
  const excluded = {
    affiliate: 0,
    cta: 0,
    related: 0,
    other: 0
  };
  
  // 1. Exclure nœuds avec data-fv-segment
  // Pattern amélioré pour gérer les balises imbriquées : cherche la balise ouvrante et ferme jusqu'à la balise fermante correspondante
  const fvSegmentPattern = /<([^>]*)\s+data-fv-segment=["'](affiliate|cta|related|boilerplate)["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = fvSegmentPattern.exec(result)) !== null) {
    const segmentType = match[2] || 'other';
    if (segmentType === 'affiliate') excluded.affiliate++;
    else if (segmentType === 'cta') excluded.cta++;
    else if (segmentType === 'related') excluded.related++;
    else excluded.other++;
    result = result.replace(match[0], '');
  }
  
  // Pattern alternatif pour les cas où le nom de la balise n'est pas capturé correctement
  const fvSegmentPatternAlt = /<div[^>]*data-fv-segment=["'](affiliate|cta|related|boilerplate)["'][^>]*>[\s\S]*?<\/div>/gi;
  while ((match = fvSegmentPatternAlt.exec(result)) !== null) {
    const segmentType = match[1] || 'other';
    if (segmentType === 'affiliate') excluded.affiliate++;
    else if (segmentType === 'cta') excluded.cta++;
    else if (segmentType === 'related') excluded.related++;
    else excluded.other++;
    result = result.replace(match[0], '');
  }
  
  // 2. Exclure modules affiliate (class="affiliate-module" ou data-placement-id)
  const affiliatePattern = /<div[^>]*(?:class=["'][^"']*affiliate-module[^"']*["']|data-placement-id)[^>]*>[\s\S]*?<\/div>/gi;
  while ((match = affiliatePattern.exec(result)) !== null) {
    excluded.affiliate++;
    result = result.replace(match[0], '');
  }
  
  // 3. Exclure blocs CTA (h2/h3 contenant "Passer à l'action", "Réserver", "Réservez", etc.)
  const ctaTitles = [
    'passer à l\'action',
    'réserver',
    'réservez',
    'book now',
    'reserve now',
    'cta',
    'call to action'
  ];
  const ctaPattern = new RegExp(
    `<h[2-3][^>]*>(?:${ctaTitles.join('|')})[^<]*</h[2-3]>[\\s\\S]*?(?=<h[2-3]|$)`,
    'gi'
  );
  while ((match = ctaPattern.exec(result)) !== null) {
    excluded.cta++;
    result = result.replace(match[0], '');
  }
  
  // 4. Exclure section "Articles connexes"
  const relatedPattern = /<h[2-3][^>]*>Articles connexes[^<]*<\/h[2-3]>[\s\S]*?(?=<h[2-3]|$)/gi;
  while ((match = relatedPattern.exec(result)) !== null) {
    excluded.related++;
    result = result.replace(match[0], '');
  }
  
  // 5. Exclure scripts et styles (déjà fait dans extractTextFromHtml, mais on les compte ici)
  const scriptPattern = /<script[^>]*>[\s\S]*?<\/script>/gi;
  const stylePattern = /<style[^>]*>[\s\S]*?<\/style>/gi;
  const scriptMatches = result.match(scriptPattern);
  const styleMatches = result.match(stylePattern);
  if (scriptMatches) excluded.other += scriptMatches.length;
  if (styleMatches) excluded.other += styleMatches.length;
  
  return { html: result, excluded };
}

/**
 * Exclut les segments non-éditoriaux via cheerio (méthode DOM)
 */
function excludeSegmentsCheerio(html, cheerioLib) {
  const $ = cheerioLib.load(html, { decodeEntities: false });
  const excluded = {
    affiliate: 0,
    cta: 0,
    related: 0,
    other: 0
  };
  
  // 1. Exclure nœuds avec data-fv-segment="affiliate|cta|related|boilerplate"
  $('[data-fv-segment="affiliate"]').each((i, el) => {
    excluded.affiliate++;
    $(el).remove();
  });
  $('[data-fv-segment="cta"]').each((i, el) => {
    excluded.cta++;
    $(el).remove();
  });
  $('[data-fv-segment="related"]').each((i, el) => {
    excluded.related++;
    $(el).remove();
  });
  $('[data-fv-segment="boilerplate"]').each((i, el) => {
    excluded.other++;
    $(el).remove();
  });
  
  // 2. Exclure modules affiliate (class="affiliate-module" ou data-placement-id)
  $('.affiliate-module, [data-placement-id]').each((i, el) => {
    excluded.affiliate++;
    $(el).remove();
  });
  
  // 3. Exclure blocs CTA (h2/h3 contenant "Passer à l'action", "Réserver", etc.)
  const ctaTitles = [
    'passer à l\'action',
    'réserver',
    'réservez',
    'book now',
    'reserve now',
    'cta',
    'call to action'
  ];
  $('h2, h3').each((i, el) => {
    const text = $(el).text().toLowerCase().trim();
    if (ctaTitles.some(title => text.includes(title))) {
      excluded.cta++;
      // Supprimer le h2/h3 et tout le contenu jusqu'au prochain h2/h3 ou fin
      let current = $(el).nextUntil('h2, h3');
      $(el).remove();
      current.remove();
    }
  });
  
  // 4. Exclure section "Articles connexes"
  $('h2, h3').each((i, el) => {
    const text = $(el).text().toLowerCase().trim();
    if (text.includes('articles connexes') || text.includes('articles similaires') || text.includes('voir aussi')) {
      excluded.related++;
      // Supprimer le h2/h3 et tout le contenu jusqu'au prochain h2/h3 ou fin
      let current = $(el).nextUntil('h2, h3');
      $(el).remove();
      current.remove();
    }
  });
  
  // 5. Exclure scripts et styles
  $('script, style').each((i, el) => {
    excluded.other++;
    $(el).remove();
  });
  
  // Retourner le HTML nettoyé
  return { html: $.html(), excluded };
}

/**
 * Extrait le texte éditorial du HTML en excluant les segments non-éditoriaux
 * 
 * @param {string} html - HTML à analyser
 * @returns {Object} { included_text: string, excluded_debug: { affiliate, cta, related, other } }
 */
export async function extractEditorialText(html) {
  if (!html || typeof html !== 'string') {
    return {
      included_text: '',
      excluded_debug: {
        affiliate: 0,
        cta: 0,
        related: 0,
        other: 0
      }
    };
  }
  
  // Essayer d'utiliser cheerio si disponible (méthode DOM plus robuste)
  let cleanedHtml = html;
  let excluded = {
    affiliate: 0,
    cta: 0,
    related: 0,
    other: 0
  };
  
  // Import dynamique de cheerio (avec fallback)
  let cheerioLib = null;
  try {
    const cheerioModule = await import('cheerio');
    cheerioLib = cheerioModule.default || cheerioModule;
  } catch (e) {
    // Cheerio non disponible, utiliser regex
  }
  
  if (cheerioLib) {
    try {
      const result = excludeSegmentsCheerio(html, cheerioLib);
      cleanedHtml = result.html;
      excluded = result.excluded;
    } catch (error) {
      // En cas d'erreur cheerio, fallback regex
      console.warn('⚠️ Erreur cheerio dans html-segmentation, fallback regex:', error.message);
      const result = excludeSegmentsRegex(html);
      cleanedHtml = result.html;
      excluded = result.excluded;
    }
  } else {
    // Fallback: regex
    const result = excludeSegmentsRegex(html);
    cleanedHtml = result.html;
    excluded = result.excluded;
  }
  
  // Extraire le texte visible depuis le HTML nettoyé
  const included_text = extractTextFromHtml(cleanedHtml);
  
  return {
    included_text,
    excluded_debug: excluded
  };
}
