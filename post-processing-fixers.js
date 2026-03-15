/**
 * Post-processing fixers for FlashVoyage articles
 * Shared module: encoding, ghost links, dedup, FAQ, formatting
 */

// Repairs words split with erroneous spaces around accented characters
// e.g. "a éroport" → "aéroport", "cons équent" → "conséquent"
export function fixEncodingBreaks(html) {
  let out = html;
  let fixCount = 0;
  
  // Known broken words (deterministic dictionary)
  const knownFixes = [
    [/\bma îtris/g, 'maîtris'],
    [/\ba éroport/g, 'aéroport'],
    [/\bcons équent/g, 'conséquent'],
    [/\bdégag é/g, 'dégagé'],
    [/\bs avoir/g, 'savoir'],
    [/\bl à/g, 'là'],
    [/\bpeut- être/g, 'peut-être'],
    [/\bé tranger/g, 'étranger'],
    [/\bé conomis/g, 'économis'],
    [/\bé puisé/g, 'épuisé'],
    [/\bé vit/g, 'évit'],
    [/\bà  /g, 'à '],
    [/\bcoût é/g, 'coûté'],
    [/\bd' avoir/g, "d'avoir"],
    [/\bd' un/g, "d'un"],
    [/\bd' une/g, "d'une"],
    [/\bl' é/g, "l'é"],
    [/\bl' a/g, "l'a"],
    [/\bl' h/g, "l'h"],
    [/\bl' i/g, "l'i"],
    [/\bl' o/g, "l'o"],
    [/\bn' a/g, "n'a"],
    [/\bn' est/g, "n'est"],
    [/\bqu' /g, "qu'"],
    [/\bs' /g, "s'"],
  ];
  
  for (const [pattern, replacement] of knownFixes) {
    const before = out;
    out = out.replace(pattern, replacement);
    if (out !== before) fixCount++;
  }
  
  // Generic pattern: letter + space + accented letter that should be joined
  // Only in text nodes (not HTML tags/attributes)
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    // Fix: consonant + space + accented vowel that forms a French word
    let fixed = text;
    // Pattern: word-internal space before accented char
    fixed = fixed.replace(/(\w) ([éèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ])(\w{2,})/g, (m, before, accent, after) => {
      // Only merge if it looks like one word was split
      const merged = before + accent + after;
      // Simple heuristic: if the merged form is longer than 3 chars and starts/ends with common French patterns
      if (merged.length >= 4) {
        return merged;
      }
      return m;
    });
    return fixed;
  });
  
  // Fix JSON-LD "main Entity" → "mainEntity"
  out = out.replace(/"main Entity"/g, '"mainEntity"');
  out = out.replace(/"accepted Answer"/g, '"acceptedAnswer"');
  

  
  // ── PART 1b: Fix spaces after apostrophes ──
  // "c’ est" -> "c’est", "d’ une" -> "d’une"
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    let fixed = text;
    // Smart apostrophe (U+2019) or regular apostrophe + space + lowercase
    fixed = fixed.replace(/([’‘'])\s+([a-zà-ÿ])/g, '$1$2');
    // HTML entity &#8217; or &#039; + space + lowercase
    fixed = fixed.replace(/(&#8217;|&#039;|&#x27;)\s+([a-zà-ÿ])/g, '$1$2');
    if (fixed !== text) fixCount++;
    return fixed;
  });


  // ── PART 2: Fix missing spaces (joined words) ──
  // Words that got concatenated without space, typically around accented chars or HTML entities
  const joinFixes = [
    [/paraîtévident/g, 'paraît évident'],
    [/coucheémotionnelle/g, 'couche émotionnelle'],
    [/tempséconomisé/g, 'temps économisé'],
    [/3étapes/g, '3 étapes'],
    [/2étapes/g, '2 étapes'],
    [/4étapes/g, '4 étapes'],
    [/5étapes/g, '5 étapes'],
    [/peutêtre/g, 'peut être'],
    [/peuventêtre/g, 'peuvent être'],
    [/trèsélevé/g, 'très élevé'],
    [/humiditéélevée/g, 'humidité élevée'],
    [/parétape/g, 'par étape'],
    [/quatreétape/g, 'quatre étape'],
    [/lesétape/g, 'les étape'],
    [/desétape/g, 'des étape'],
    [/uneétape/g, 'une étape'],
    [/chaqueétape/g, 'chaque étape'],
    [/unéchec/g, 'un échec'],
    [/unîle/g, 'une île'],
    [/deuxîle/g, 'deux île'],
    [/étaient/g, 'étaient'],  // This one is correct as-is, skip
    [/ellesétaient/g, 'elles étaient'],
    [/quiétaient/g, 'qui étaient'],
  ];
  
  for (const [pattern, replacement] of joinFixes) {
    const before = out;
    out = out.replace(pattern, replacement);
    if (out !== before) fixCount++;
  }
  
  // Generic pattern: detect missing spaces before accented chars in text nodes
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    let fixed = text;
    // Common French word endings + accented char that starts next word
    fixed = fixed.replace(/\b(cette|encore|une|par|les|des|ses|mes|tes|nos|vos|leurs|chaque|entre|quatre|notre|votre|autre|contre|toute|grande|elle|elles|ils|que|qui|mais|puis|sans|avec|dans|sous|sur|vers|pour|dont|tout|bien|très|plus|aussi|même|comme|quand|après|avant|en|tu|un|le|la|de|se|ne|ce|je|te|me|son|mon|ton|ou|où|du|au|si|sa|ma|ta|et|réservoir|littéralement)(é|è|ê|à|â|î|ô|û)([a-zà-ÿ])/gi, '$1 $2$3');
    // Fix: "nt" + "être" pattern
    fixed = fixed.replace(/ntêtre/g, 'nt être');
    // Fix: "t" + "é" patterns (peutêtre, doitêtre, etc.)
    fixed = fixed.replace(/(peu|doi|fai|soi|veu)tê/g, '$1t ê');
    return fixed;
  });


  // SMART JOIN: Detect words joined to common French word-starts with accented chars
  // e.g. "chocémotionnel" → "choc émotionnel", "repaséconomique" → "repas économique"
  const accentedWordStarts = [
    'émotionnel', 'émotionnelle', 'émotion', 'économique', 'économie',
    'évaluer', 'évaluation', 'éviter', 'épuisant', 'épuisé', 'épuisée', 'épuisement',
    'élevé', 'élevée', 'élevés', 'état', 'étape', 'étaient', 'était',
    'étranger', 'étrangère', 'échange', 'échec', 'édition',
    'énergie', 'énergétique', 'énorme',
  ];
  
  for (const wordStart of accentedWordStarts) {
    // Match: any word char + this accented word start (without space)
    const regex = new RegExp('([a-zA-ZÀ-ÿ]{2,})(' + wordStart + ')', 'gi');
    const before = out;
    out = out.replace(regex, (match, prefix, suffix) => {
      // Don't split if prefix is just an accent modifier (like "r" + "éel" = réel)
      // Check: is prefix a known French word by itself?
      const prefixLower = prefix.toLowerCase();
      // Skip if the full match is a known valid word
      const fullWord = (prefix + suffix).toLowerCase();
      const validWords = ['réellement', 'référence', 'réfléchir', 'préparation', 'prépare', 'prévue', 'prévois', 'prévoir', 'prévient', 'récupération', 'différence', 'différente', 'différemment', 'irrégulière', 'supplémentaire', 'supplémentaires', 'immédiate', 'fréquente', 'fréquentes', 'anesthésique', 'anesthésiques', 'anesthésiant', 'thérapeute', 'thérapie', 'scénarios', 'scénario', 'crédit', 'itinéraire', 'intérieure', 'privilégie', 'transférables'];
      if (validWords.some(v => fullWord.startsWith(v) || fullWord === v)) return match;
      
      // If prefix ends naturally (not mid-syllable), split
      if (prefixLower.length >= 3) {
        return prefix + ' ' + suffix;
      }
      return match;
    });
    if (out !== before) fixCount++;
  }

  if (fixCount > 0) {
    console.log(`🔧 ENCODING_FIXER: ${fixCount} encoding break(s) repaired`);
  }
  return out;
}

// ─── GHOST LINKS FIXER ──────────────────────────────────────
// Removes <p class="internal-link-transition"> that have no actual <a href> inside
// Also removes standalone transition phrases with article titles but no links
export function fixGhostLinks(html) {
  let out = html;
  let fixCount = 0;
  
  // Remove ALL <p class="internal-link-transition"> paragraphs — they break the narrative flow
  // Internal links should be woven inline within regular paragraphs (TPG style), not in standalone blocks
  out = out.replace(/<p\s+class="internal-link-transition"[^>]*>[\s\S]*?<\/p>/gi, () => {
    fixCount++;
    return '';
  });
  
  // Remove orphan transition phrases: "Pour aller plus loin, Article Title."
  // These are standalone text references without links
  out = out.replace(/<p[^>]*>\s*(?:Pour aller plus loin|Côté budget|Si tu hésites|Sur la question)[^<]*(?!<a\s)[^<]*\.\s*<\/p>/gi, (match) => {
    // Only remove if there's no <a> inside
    if (/<a\s/i.test(match)) return match;
    fixCount++;
    return '';
  });
  

  // Remove internal-link-transition <p> tags that ended up INSIDE blockquotes
  out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, inner) => {
    const cleaned = inner.replace(/<p\s+class="internal-link-transition"[^>]*>[\s\S]*?<\/p>/gi, '');
    if (cleaned !== inner) {
      fixCount++;
      return match.replace(inner, cleaned);
    }
    return match;
  });
  
  if (fixCount > 0) {
    console.log(`🔧 GHOST_LINKS_FIXER: ${fixCount} ghost link(s) removed`);
  }
  return out;
}

// ─── DUPLICATE CITATIONS FIXER ──────────────────────────────
// Deduplicates blockquote content (same quote appearing multiple times)
// Also fixes quotes where the same sentence is repeated inside one blockquote
export function fixDuplicateCitations(html) {
  // First: deduplicate identical paragraphs across the whole article
  {
    let tempOut = html;
    const pRegex = /<p[^>]*>([^<]{50,})<\/p>/g;
    const allParas = [...tempOut.matchAll(pRegex)];
    const seenParas = new Map();
    const toRemove = [];
    for (const pm of allParas) {
      const normalized = pm[1].replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 200);
      if (normalized.length < 50) continue;
      if (seenParas.has(normalized)) {
        toRemove.push(pm[0]);
      } else {
        seenParas.set(normalized, pm.index);
      }
    }
    for (const dup of toRemove) {
      // Remove only the LAST occurrence (keep the first)
      const lastIdx = tempOut.lastIndexOf(dup);
      if (lastIdx !== tempOut.indexOf(dup)) {
        tempOut = tempOut.slice(0, lastIdx) + tempOut.slice(lastIdx + dup.length);
        console.log('🔧 DEDUP_PARA: removed duplicate paragraph');
      }
    }
    html = tempOut;
  }

  let out = html;
  let fixCount = 0;
  
  // Fix 1: Same sentence repeated within a single blockquote <p>
  out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, inner) => {
    let newInner = inner;
    // Check each <p> for repeated sentences
    newInner = newInner.replace(/<p>([^<]+)<\/p>/g, (pMatch, pText) => {
      // Split into sentences and deduplicate
      const sentences = pText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
      if (sentences.length >= 2) {
        const seen = new Set();
        const unique = [];
        for (const s of sentences) {
          const normalized = s.trim().toLowerCase().replace(/[.,!?;:]+$/, '');
          if (!seen.has(normalized)) {
            seen.add(normalized);
            unique.push(s);
          } else {
            fixCount++;
          }
        }
        if (unique.length < sentences.length) {
          return '<p>' + unique.join(' ') + '</p>';
        }
      }
      return pMatch;
    });
    if (newInner !== inner) {
      return match.replace(inner, newInner);
    }
    return match;
  });

  // Fix 2: Remove duplicate blockquotes (same content appearing twice in article)
  const blockquotes = [...out.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi)];
  const seen = new Set();
  for (const bq of blockquotes) {
    const normalized = bq[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.length < 20) continue;
    if (seen.has(normalized)) {
      // Duplicate - remove this one
      out = out.replace(bq[0], '');
      fixCount++;
    } else {
      seen.add(normalized);
    }
  }
  
  if (fixCount > 0) {
    console.log(`🔧 DEDUP_CITATIONS: ${fixCount} duplicate citation(s) fixed`);
  }
  return out;
}

// ─── EMPTY FAQ FIXER ────────────────────────────────────────
// Removes <details> FAQ entries that have no answer (empty or whitespace-only)
export function fixEmptyFaqEntries(html) {
  let out = html;
  let fixCount = 0;
  
  // Match <details> that only contain a <summary> with no <p> answer, or empty <p>
  out = out.replace(/<details[^>]*>\s*<summary[^>]*>[\s\S]*?<\/summary>\s*(?:<p[^>]*>\s*<\/p>\s*)?<\/details>/gi, (match) => {
    // Check if there's actual answer content
    const answerMatch = match.match(/<\/summary>([\s\S]*)<\/details>/i);
    if (answerMatch) {
      const answerContent = answerMatch[1].replace(/<[^>]+>/g, '').trim();
      if (answerContent.length < 5) {
        fixCount++;
        return ''; // Remove empty FAQ entry
      }
    }
    return match;
  });
  
  // Also remove from JSON-LD schema any questions without answers
  out = out.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi, (match, json) => {
    try {
      const data = JSON.parse(json);
      if (data['@type'] === 'FAQPage' && data.mainEntity) {
        data.mainEntity = data.mainEntity.filter(q => 
          q.acceptedAnswer && q.acceptedAnswer.text && q.acceptedAnswer.text.trim().length >= 5
        );
        return '<script type="application/ld+json">' + JSON.stringify(data) + '</script>';
      }
    } catch(e) {}
    return match;
  });
  
  if (fixCount > 0) {
    console.log(`🔧 EMPTY_FAQ_FIXER: ${fixCount} empty FAQ entry/entries removed`);
  }
  return out;
}



// ─── WALL-OF-TEXT SPLITTER ──────────────────────────────────
// Splits paragraphs that exceed 200 words into smaller ones at sentence boundaries
export function splitWallParagraphs(html) {
  let out = html;
  let fixCount = 0;
  const MAX_WORDS = 150;
  
  out = out.replace(/<p(?:\s[^>]*)?>([^<]{500,})<\/p>/g, (match, text) => {
    const wordCount = text.split(/\s+/).length;
    if (wordCount <= MAX_WORDS) return match;
    
    // Split at sentence boundaries
    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length <= 2) return match; // Can't split meaningful
    
    const paragraphs = [];
    let current = [];
    let currentWords = 0;
    
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).length;
      if (currentWords + words > MAX_WORDS && current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [sentence];
        currentWords = words;
      } else {
        current.push(sentence);
        currentWords += words;
      }
    }
    if (current.length > 0) paragraphs.push(current.join(' '));
    
    if (paragraphs.length > 1) {
      fixCount++;
      return paragraphs.map(p => `<p>${p}</p>`).join('\n');
    }
    return match;
  });
  
  if (fixCount > 0) {
    console.log(`🔧 WALL_SPLITTER: ${fixCount} wall paragraph(s) split`);
  }
  return out;
}



// ─── SLUG ANCHOR FIXER ──────────────────────────────────────
// Detects and fixes <a> tags where the anchor text is a raw URL slug
export function fixSlugAnchors(html) {
  let out = html;
  let fixCount = 0;

  // Pattern 1: lowercase slugs
  out = out.replace(/<a\s+href="([^"]*)"[^>]*>([a-z0-9][a-z0-9- ]{15,})<\/a>/g, (match, href, text) => {
    if (/[A-Z]/.test(text)) return match;
    if (/^[a-z0-9]+[- ][a-z0-9- ]+$/.test(text) && text.length > 20) {
      const readable = text.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      fixCount++;
      return `<a href="${href}">${readable}</a>`;
    }
    return match;
  });

  // Pattern 2: Title Case slugs — accent-free capitalized words matching URL slug
  // Catches: "Indonesie Solo 4 Semaines Les 5 Pieges Que Les Guides Oublient"
  const destFr = {
    'thailande': 'Thaïlande', 'japon': 'Japon', 'indonesie': 'Indonésie',
    'vietnam': 'Vietnam', 'bali': 'Bali', 'tokyo': 'Tokyo', 'bangkok': 'Bangkok',
    'chiang': 'Chiang Mai', 'seoul': 'Séoul', 'singapour': 'Singapour',
    'cambodge': 'Cambodge', 'laos': 'Laos', 'philippines': 'Philippines'
  };
  const accentMap = {
    'indonesie': 'Indonésie', 'pieges': 'pièges', 'itineraire': 'itinéraire',
    'equilibre': 'équilibre', 'securite': 'sécurité', 'caches': 'cachés',
    'frequentes': 'fréquentes', 'methode': 'méthode', 'thailande': 'Thaïlande',
    'etapes': 'étapes', 'verifier': 'vérifier', 'reserver': 'réserver'
  };

  out = out.replace(/<a\s+href="(https?:\/\/flashvoyage\.com\/([^\/]+)\/?)"[^>]*>([^<]{20,})<\/a>/g, (match, href, slug, text) => {
    // Convert slug to title case for comparison
    const slugTitle = slug.replace(/-/g, ' ').toLowerCase();
    const textLower = text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const slugNorm = slugTitle.replace(/[^a-z0-9\s]/g, '');

    // Check if text matches the slug (is essentially the slug as title)
    if (textLower !== slugNorm && !slugNorm.startsWith(textLower) && !textLower.startsWith(slugNorm)) {
      return match; // Not a slug-as-anchor
    }

    // Verify: real titles have French accents, slugs don't
    if (/[àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ]/.test(text)) {
      return match; // Has accents = probably a real title, not a slug
    }

    // Build natural anchor text
    const parts = slug.split('-').filter(p => p.length > 2);
    const destinations = Object.keys(destFr);
    const dest = parts.find(p => destinations.includes(p.toLowerCase()));
    const destName = dest ? destFr[dest.toLowerCase()] : null;

    let naturalAnchor;
    if (destName) {
      // Include a topic word if possible
      const topics = {'budget': 'budget', 'visa': 'visa', 'itineraire': 'itinéraire',
        'pieges': 'pièges', 'erreurs': 'erreurs', 'conseils': 'conseils',
        'guide': 'guide', 'arbitrages': 'arbitrages', 'secrets': 'secrets',
        'choix': 'choix', 'dilemme': 'dilemme'};
      const topicPart = parts.find(p => Object.keys(topics).includes(p.toLowerCase()));
      if (topicPart) {
        naturalAnchor = `notre guide ${topics[topicPart.toLowerCase()]} ${destName}`;
      } else {
        naturalAnchor = `notre article sur ${destName}`;
      }
    } else {
      // Generic: clean up slug words
      const stopwords = new Set(['les', 'des', 'que', 'qui', 'pour', 'sans', 'avec', 'entre', 'sur', 'ton', 'en', 'et', 'ou', 'un', 'une', 'du', 'au']);
      let meaningful = parts.filter(p => !stopwords.has(p.toLowerCase()));
      let anchor = meaningful.slice(0, 5).join(' ').toLowerCase();
      for (const [plain, accented] of Object.entries(accentMap)) {
        anchor = anchor.replace(new RegExp('\\b' + plain + '\\b', 'gi'), accented);
      }
      naturalAnchor = anchor.charAt(0).toUpperCase() + anchor.slice(1);
    }

    fixCount++;
    return `<a href="${href}">${naturalAnchor}</a>`;
  });

  if (fixCount > 0) {
    console.log(`🔧 SLUG_ANCHOR_FIXER: ${fixCount} slug anchor(s) humanized`);
  }
  return out;
}

export function fixNestedLinks(html) {
  let out = html;
  let fixCount = 0;
  
  // Pattern: <a href="...">...<a href="...">...</a>...</a>
  // Fix by removing inner <a> tags and keeping their text
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/<a\s+href="([^"]*)"[^>]*>((?:(?!<\/a>)[\s\S])*?)<a\s+href="[^"]*"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<\/a>/gi, 
      (match, outerHref, before, innerText, after) => {
        fixCount++;
        return `<a href="${outerHref}">${before}${innerText}${after}</a>`;
      }
    );
  }
  
  if (fixCount > 0) {
    console.log(`🔧 NESTED_LINK_FIXER: ${fixCount} nested link(s) flattened`);
  }
  return out;
}



// ─── BLOCKQUOTE CONTENT CLEANER ─────────────────────────────
// Cleans blockquote content: removes slugified link text, fixes broken translations
export function cleanBlockquoteContent(html) {
  let out = html;
  let fixCount = 0;
  
  out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, inner) => {
    let cleaned = inner;
    
    // Fix: link with slug as anchor text inside blockquote
    // <a href="...">slug-text-like-this</a> → just keep the text without slugified anchor
    cleaned = cleaned.replace(/<a\s+href="[^"]*"[^>]*>([a-z0-9]+(?:-[a-z0-9]+){3,})<\/a>/gi, (linkMatch, slugText) => {
      fixCount++;
      return ''; // Remove slugified links from blockquotes entirely
    });
    
    // Fix: remove "internal-link-transition" paragraphs from inside blockquotes
    cleaned = cleaned.replace(/<p\s+class="internal-link-transition"[^>]*>[\s\S]*?<\/p>/gi, () => {
      fixCount++;
      return '';
    });
    
    // Fix: remove empty <p></p> left after cleaning
    cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');
    
    if (cleaned !== inner) {
      return match.replace(inner, cleaned);
    }
    return match;
  });
  
  if (fixCount > 0) {
    console.log(`🔧 BLOCKQUOTE_CLEANER: ${fixCount} issue(s) cleaned in blockquotes`);
  }
  return out;
}



// ─── UNICODE CONTENT SCRUBBER ───────────────────────────────
// Cleans common Unicode artifacts that appear in LLM-generated content
export function scrubUnicodeArtifacts(html) {
  let out = html;
  let fixCount = 0;
  
  const replacements = [
    // Smart quotes normalization
    [/\u201C|\u201D/g, '"'],      // Left/right double quotes → standard
    [/\u2018|\u2019/g, "'"],      // Left/right single quotes → apostrophe
    [/\u2013/g, '–'],             // En dash (keep as-is, it's valid)
    [/\u2014/g, '—'],             // Em dash (keep as-is)
    // Zero-width characters
    [/\u200B/g, ''],              // Zero-width space
    [/\u200C/g, ''],              // Zero-width non-joiner
    [/\u200D/g, ''],              // Zero-width joiner
    [/\uFEFF/g, ''],              // BOM
    // Common LLM artifacts
    [/\u00A0/g, ' '],             // Non-breaking space → regular space
    [/\u2026/g, '...'],           // Ellipsis → three dots
    // Double spaces
    [/  +/g, ' '],                // Multiple spaces → single
    // Fix common HTML entity issues
    [/&amp;#8217;/g, "'"],        // Double-encoded apostrophe
    [/&amp;#8211;/g, '–'],        // Double-encoded en-dash
    [/&amp;#8212;/g, '—'],        // Double-encoded em-dash
  ];
  
  for (const [pattern, replacement] of replacements) {
    const before = out;
    out = out.replace(pattern, replacement);
    if (out !== before) fixCount++;
  }
  
  if (fixCount > 0) {
    console.log(`🔧 UNICODE_SCRUBBER: ${fixCount} artifact type(s) cleaned`);
  }
  return out;
}

/**
 * Convert straight apostrophes in French contractions to Unicode smart quotes.
 * Prevents WordPress wptexturize from breaking "l'autoroute" into "l' autoroute".
 */
export function smartenFrenchApostrophes(html) {
  let out = html;
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    return text.replace(/([ldcnsjmt]|qu|jusqu|lorsqu|puisqu|quelqu)'([a-z\u00e0-\u00ff])/gi, '$1\u2019$2');
  });
  // Also handle apostrophes NOT inside tags (like at the very start of content)
  out = out.replace(/([ldcnsjmt]|qu|jusqu|lorsqu|puisqu|quelqu)'([a-z\u00e0-\u00ff])/gi, '$1\u2019$2');
  return out;
}

export function applyPostProcessingFixers(html) {
  let c = html;
  c = scrubUnicodeArtifacts(c);
  c = fixEncodingBreaks(c);
  c = fixGhostLinks(c);
  c = fixDuplicateCitations(c);
  c = fixEmptyFaqEntries(c);
  c = splitWallParagraphs(c);
  c = fixSlugAnchors(c);
  c = fixNestedLinks(c);
  c = cleanBlockquoteContent(c);
  c = smartenFrenchApostrophes(c);
  return c;
}

