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
  
  // Generic pattern: single letter + space + accented letter (broken encoding)
  // Only merge when the prefix is 1-2 chars (likely a broken word, not a real word boundary)
  // e.g. "ma îtrisable" → "maîtrisable", "a éroport" → "aéroport"
  // BUT NOT "routine établie" (routine is a real complete word)
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    let fixed = text;
    // Only merge if the character before the space is preceded by a non-word char or start of text
    // i.e., the "word" before the space is very short (1-2 chars = likely a broken syllable)
    fixed = fixed.replace(/(?:^|[\s>])([a-zA-ZÀ-ÿ]{1,2}) ([éèêëàâäùûüôöîïçÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ])([a-zA-ZÀ-ÿ]{2,})/g, (m, before, accent, after) => {
      // Don't merge common French short words: le, la, de, ne, se, ce, je, te, me, un, en, tu, du, au, si, sa, ma, ta, et, ou
      const shortWords = ['le','la','de','ne','se','ce','je','te','me','un','en','tu','du','au','si','sa','ma','ta','et','ou','il','on','où','ni','ça','as','va','ai','es','eu','a','y','à'];
      if (shortWords.includes(before.toLowerCase())) return m;
      // Merge: likely a broken encoding
      return m.charAt(0) === ' ' || m.charAt(0) === '>' ? m.charAt(0) + before + accent + after : before + accent + after;
    });
    return fixed;
  });
  
  // Pattern 2: Longer prefix + space + accented SUFFIX that is NEVER a standalone word
  // e.g. "para ît" → "paraît", "organis és" → "organisés", "bient ôt" → "bientôt"
  // These suffixes cannot exist as standalone French words, so they MUST be part of the preceding word
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    let fixed = text;
    // Accent-starting suffixes that are NEVER standalone words
    const neverStandalone = [
      // circumflex suffixes
      /([a-zA-ZÀ-ÿ]{2,})\s+(î[a-z]+)/gi,        // paraît, connaître, maître
      /([a-zA-ZÀ-ÿ]{2,})\s+(ô[a-z]+)/gi,         // bientôt, plutôt, côté (when split)
      // common verb/adj suffixes starting with é
      /([a-zA-ZÀ-ÿ]{3,})\s+(és\b)/gi,            // organisés, modifiés
      /([a-zA-ZÀ-ÿ]{3,})\s+(ée\b)/gi,            // organisée, modifiée
      /([a-zA-ZÀ-ÿ]{3,})\s+(ées\b)/gi,           // organisées
      /([a-zA-ZÀ-ÿ]{2,})\s+(érieur[es]?\b)/gi,   // intérieur, extérieur
      /([a-zA-ZÀ-ÿ]{2,})\s+(èbre[s]?\b)/gi,      // célèbre
      /([a-zA-ZÀ-ÿ]{2,})\s+(ème[s]?\b)/gi,       // problème, thème
      /([a-zA-ZÀ-ÿ]{2,})\s+(ère[s]?\b)/gi,       // manière, matière (but NOT "ère" alone)
      /([a-zA-ZÀ-ÿ]{2,})\s+(ète[s]?\b)/gi,       // complète, secrète
      /([a-zA-ZÀ-ÿ]{2,})\s+(ège[s]?\b)/gi,       // piège, collège
      /([a-zA-ZÀ-ÿ]{2,})\s+(ément\b)/gi,          // précisément, exactement
      /([a-zA-ZÀ-ÿ]{2,})\s+(éress[eéa][a-z]*)/gi,  // intéressé, intéressant
      /([a-zA-ZÀ-ÿ]{2,})\s+(égal[eés]*\b)/gi,      // illégales, inégalité
      /([a-zA-ZÀ-ÿ]{2,})\s+(édit[eéa][a-z]*)/gi,   // inédit, accrédité
      /([a-zA-ZÀ-ÿ]{2,})\s+(éfici[a-z]*)/gi,       // bénéficier, déficit
      /([a-zA-ZÀ-ÿ]{2,})\s+(ésit[a-z]*)/gi,        // hésiter, hésitant
      /([a-zA-ZÀ-ÿ]{2,})\s+(écess[a-z]*)/gi,       // nécessaire, accessible
      /([a-zA-ZÀ-ÿ]{2,})\s+(ésent[a-z]*)/gi,       // représenter, présenté
      /([a-zA-ZÀ-ÿ]{2,})\s+(ûr[es]?\b)/gi,         // sûr, sûre, sûres
      /([a-zA-ZÀ-ÿ]{2,})\s+(égr[eéa][a-zé]*)/gi,     // intégré, intégrés, intégrées
      /([a-zA-ZÀ-ÿ]{2,})\s+(épar[a-z]*)/gi,           // préparé, séparé
      /([a-zA-ZÀ-ÿ]{2,})\s+(écipit[a-z]*)/gi,         // précipité
      /([a-zA-ZÀ-ÿ]{2,})\s+(évis[a-z]*)/gi,           // imprévisible
      /([a-zA-ZÀ-ÿ]{2,})\s+(ècle[s]?\b)/gi,           // siècle (handled by joinFixes but belt+suspenders)
    ];
    for (const rx of neverStandalone) {
      fixed = fixed.replace(rx, (m, prefix, suffix) => {
        // Safety: don't merge if result would be > 25 chars
        if (prefix.length + suffix.length > 25) return m;
        return prefix + suffix;
      });
    }
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
    [/fant\s+ôme/g, 'fantôme'],
    [/si\s+ège/g, 'siège'],
    [/pi\s+ège/g, 'piège'],
    [/coll\s+ège/g, 'collège'],
    [/prot\s+ège/g, 'protège'],
    [/man\s+ège/g, 'manège'],
    [/strat\s+égi/g, 'stratégi'],
    [/privil\s+égi/g, 'privilégi'],
    [/exig\s+é/g, 'exigé'],
    [/rési\s+dence/g, 'résidence'],
    [/expéri\s+ence/g, 'expérience'],
    [/itiné\s+raire/g, 'itinéraire'],
    [/réser\s+vation/g, 'réservation'],
    [/réfé\s+rence/g, 'référence'],
    [/diffé\s+rence/g, 'différence'],

    [/aprèsavoir/g, 'après avoir'],
    [/aprèsêtre/g, 'après être'],
    [/aprèsun/g, 'après un'],
    [/aprèsune/g, 'après une'],
    [/aprèsle/g, 'après le'],
    [/aprèsla/g, 'après la'],
    [/aprèsdes/g, 'après des'],
    [/aprèsles/g, 'après les'],
    [/aprèsce/g, 'après ce'],
    [/depuisavoir/g, 'depuis avoir'],
    [/(?<=\s|>)aété(?=\s|<|[.,;:!?])/g, 'a été'],
    [/(?<=\s|>)avaitété(?=\s|<|[.,;:!?])/g, 'avait été'],
    [/(?<=\s|>)auraété(?=\s|<|[.,;:!?])/g, 'aura été'],
    [/ontété/g, 'ont été'],
    [/sontété/g, 'sont été'],
    [/si\s+ècle/g, 'siècle'],
    [/ma\s+îtris/g, 'maîtris'],
    [/ma\s+ître/g, 'maître'],
    [/ma\s+în/g, 'maîn'],
    [/le\s+çon/g, 'leçon'],
    [/le\s+çons/g, 'leçons'],
    [/fa\s+çon/g, 'façon'],
    [/fa\s+çons/g, 'façons'],
    [/gar\s+çon/g, 'garçon'],
    [/gar\s+çons/g, 'garçons'],
    [/re\s+çu/g, 'reçu'],
    [/re\s+çue/g, 'reçue'],
    [/dé\s+çu/g, 'déçu'],
    [/dé\s+çue/g, 'déçue'],
    [/puêtre/g, 'pu être'],
    [/épuis\s+ées/g, 'épuisées'],
    [/épuis\s+és/g, 'épuisés'],
    [/épuis\s+ée/g, 'épuisée'],
    [/épuis\s+é\b/g, 'épuisé'],
    [/int\s+érioris/g, 'intérioris'],
    [/inqui\s+étude/g, 'inquiétude'],
    [/inqui\s+études/g, 'inquiétudes'],
    [/int\s+érieur/g, 'intérieur'],
    [/int\s+érieure/g, 'intérieure'],
    [/int\s+érêt/g, 'intérêt'],
    [/int\s+éress/g, 'intéress'],
    [/int\s+égr/g, 'intégr'],
    [/int\s+égral/g, 'intégral'],
    [/si\s+ècles/g, 'siècles'],

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
    'étudiant', 'étudiante', 'étudiants', 'étudiantes', 'études', 'étude',
    'également', 'égal', 'égale', 'égalité',
    'événement', 'événements', 'évolution', 'évidence',
    'écriture', 'écrit', 'école', 'écologique',
    'édifice', 'éducation', 'éduqué',
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
      const validWords = [
        'réellement', 'référence', 'réfléchir', 'préparation', 'prépare', 'prévue', 'prévois', 'prévoir', 'prévient',
        'récupération', 'différence', 'différente', 'différemment', 'irrégulière', 'irrégulier',
        'supplémentaire', 'supplémentaires', 'immédiate', 'fréquente', 'fréquentes',
        'anesthésique', 'anesthésiques', 'anesthésiant', 'thérapeute', 'thérapie',
        'scénarios', 'scénario', 'crédit', 'itinéraire', 'intérieure', 'privilégie', 'transférables',
        // ill-/in-/ir- prefix compounds
        'illégal', 'illégale', 'illégales', 'illégalement',
        'inégal', 'inégale', 'inégales', 'inégalité', 'inégalités',
        'irréel', 'irréelle', 'irréaliste', 'irrégulières',
        'inédit', 'inédite', 'inédits', 'inédites',
        'inévitable', 'inévitables', 'inévitablement',
        'inéfficace', 'inefficace', 'inefficaces',
        // dé-/pré- compounds
        'déséquilibre', 'déséquilibré', 'déséquilibrée',
        'précisément', 'antérieurement', 'intérieurement', 'extérieurement',
        'intéressant', 'intéressante', 'intéressé', 'intéressée', 'intéresser',
        'désintéressé', 'désintéressée',
        // Other common compounds
        'nécessaire', 'nécessaires', 'nécessairement', 'nécessité',
        'bénéficier', 'bénéfique', 'bénéfiques', 'bénéficiaire',
        'représenter', 'représenté', 'représentée', 'représentation',
        'hésiter', 'hésitant', 'hésitante', 'hésitation',
      ];
      if (validWords.some(v => fullWord.startsWith(v) || fullWord === v)) return match;
      
      // If prefix ends naturally (not mid-syllable), split
      if (prefixLower.length >= 3) {
        return prefix + ' ' + suffix;
      }
      return match;
    });
    if (out !== before) fixCount++;
  }


  // SECOND PASS: Re-apply joinFixes to undo any re-splits by generic patterns
  for (const [pattern, replacement] of joinFixes) {
    out = out.replace(pattern, replacement);
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

/**
 * Fix FAQ questions that use bare country names without articles/prepositions.
 * "à Thaïlande" → "en Thaïlande", "pour Thaïlande" → "pour la Thaïlande"
 */
export function fixFaqCountryGrammar(html) {
  const countryFixes = [
    [/(?:à|au) Tha[ïi]lande/g, 'en Thaïlande'],
    [/pour Tha[ïi]lande/g, 'pour la Thaïlande'],
    [/pour visiter Tha[ïi]lande/g, 'pour visiter la Thaïlande'],
    [/visiter Tha[ïi]lande/g, 'visiter la Thaïlande'],
    [/visiter Vietnam/g, 'visiter le Vietnam'],
    [/visiter Japon/g, 'visiter le Japon'],
    [/visiter Cambodge/g, 'visiter le Cambodge'],
    [/visiter Laos/g, 'visiter le Laos'],
    [/visiter Indon[ée]sie/g, "visiter l'Indonésie"],
    [/visiter Philippines/g, 'visiter les Philippines'],
    [/visiter Malaisie/g, 'visiter la Malaisie'],
    [/visiter Inde/g, "visiter l'Inde"],
    [/sur place (?:à|en) Tha[ïi]lande/g, 'sur place en Thaïlande'],
    [/sur place Tha[ïi]lande/g, 'sur place en Thaïlande'],
    [/(?:à|au) Japon\b/g, 'au Japon'],
    [/pour Japon\b/g, 'pour le Japon'],
    [/(?:à|au) Vietnam\b/g, 'au Vietnam'],
    [/pour Vietnam\b/g, 'pour le Vietnam'],
    [/(?:à|au) Cambodge\b/g, 'au Cambodge'],
    [/pour Cambodge\b/g, 'pour le Cambodge'],
    [/(?:à|au) Laos\b/g, 'au Laos'],
    [/pour Laos\b/g, 'pour le Laos'],
    [/(?:à|au|en) Indon[ée]sie\b/g, 'en Indonésie'],
    [/pour Indon[ée]sie\b/g, "pour l'Indonésie"],
    [/(?:à|au|en) Philippines\b/g, 'aux Philippines'],
    [/pour Philippines\b/g, 'pour les Philippines'],
    [/(?:à|au|en) Malaisie\b/g, 'en Malaisie'],
    [/pour Malaisie\b/g, 'pour la Malaisie'],
    [/(?:à|au) Bali\b/g, 'à Bali'],
    [/pour Bali\b/g, 'pour Bali'],
    [/(?:à|au|en) Inde\b/g, 'en Inde'],
    [/pour Inde\b/g, "pour l'Inde"],
    // Fix "au Thailand" English leak
    [/au Thailand\b/gi, 'en Thaïlande'],
    [/(?:à|en|au) Thailand\b/gi, 'en Thaïlande'],
  ];
  let out = html;
  for (const [pattern, replacement] of countryFixes) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Fix smart quote apostrophes followed by a space in French contractions.
 * Catches "’ é" → "’é" patterns that WP texturize creates.
 */
export function fixSmartQuoteSpaces(html) {
  let out = html;
  // Fix ’ + space + lowercase letter in French text
  out = out.replace(/\u2019\s+([a-z\u00e0-\u00ff])/g, '\u2019$1');
  // Fix &#8217; + space patterns (HTML entity form)
  out = out.replace(/&#8217;\s+([a-z\u00e0-\u00ff])/g, '\u2019$1');
  return out;
}

/**
 * Remove generic padding H2 sections when total H2 count exceeds 8.
 * Targets: "Limites et biais", "Comparatif des destinations", 
 * "Ce que les autres ne disent pas" (when generic), "Ce qui change concrètement"
 */
export function capExcessiveH2s(html) {
  const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
  if (h2Count <= 8) return html;
  
  let out = html;
  const genericH2Patterns = [
    // "Limites et biais" with its content until next H2 or end
    /<h2[^>]*>\s*Limites?\s*(et\s*)?biais[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
    // "Comparatif des destinations" table section
    /<h2[^>]*>\s*Comparatif\s*des\s*destinations?[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
    // "Ce qui change concrètement" impact block (generic filler)
    /<h2[^>]*>\s*Ce\s*qui\s*change\s*concr[èe]tement[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
    // "Que faire maintenant" action block (generic)
    /<h2[^>]*>\s*Que\s*faire\s*maintenant[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
  ];
  
  for (const pattern of genericH2Patterns) {
    const currentH2Count = (out.match(/<h2[^>]*>/gi) || []).length;
    if (currentH2Count <= 8) break;
    out = out.replace(pattern, '');
  }
  
  return out;
}

/**
 * Fix generic word joins around accented characters.
 * Catches patterns like "sécuritéémotionnel" → "sécurité émotionnel"
 * by detecting two accented vowels touching (word boundary missing).
 */
export function fixGenericAccentJoins(html) {
  let out = html;
  
  // Known French words that end with 'e' followed by accented start
  // These are the most common joins the LLM creates
  const knownJoins = [
    [/routine[ée]tabli/gi, 'routine établi'],
    [/cens[ée][eê]tre/gi, 'censé être'],
    [/Prochaine[ée]tape/gi, 'Prochaine étape'],
    [/prochaine[ée]tape/gi, 'prochaine étape'],
    [/sécurité[ée]motionn/gi, 'sécurité émotionn'],
    [/coût[ée]motionn/gi, 'coût émotionn'],
    [/sociét[ée]/gi, (m) => m.length > 8 ? m.slice(0, 7) + ' ' + m.slice(7) : m],
    [/difficult[ée]norme/gi, 'difficulté énorme'],
    [/qualit[ée]lev/gi, 'qualité élev'],
    [/activit[ée]conomiq/gi, 'activité économiq'],
    [/libert[ée]conomiq/gi, 'liberté économiq'],
    [/communaut[ée]xpat/gi, 'communauté expat'],
    [/expérienc[ée]xception/gi, 'expérience exception'],
    [/personn[ée]trang/gi, 'personne étrang'],
    [/voyag[ée]xtrême/gi, 'voyage extrême'],
    [/ville[ée]loign/gi, 'ville éloigné'],
    [/duré[ée]stim/gi, 'durée estim'],
    [/via[éèê]cran/gi, 'via écran'],
    [/via[éèê]([a-z])/gi, 'via é$1'],
  ];
  
  for (const [pattern, replacement] of knownJoins) {
    out = out.replace(pattern, replacement);
  }
  
  // Generic pattern: two accented chars touching = likely missing space
  const accentedVowels = 'éèêëàâäîïôùûüÿç';
  out = out.replace(new RegExp('([a-z\\u00e0-\\u00ff])([' + accentedVowels + '])([' + accentedVowels + '])([a-z])', 'gi'), (match, pre, end, start, post) => {
    if ((end === 'é' && start === 'e') || (end === 'e' && start === 'é')) return match;
    return pre + end + ' ' + start + post;
  });
  
  // Generic: detect word joins based on common French word endings
  // Common endings that are ALWAYS word-final: -tion, -ment, -ence, -ure, -ique, -ise, -igue, -ude, -age, -ade, -ère, -ète, -ite, -ote, -ute, -ine, -ane, -one, -une
  const wordEndings = [
    'tion', 'ment', 'ence', 'ance', 'ure', 'ique', 'ise', 'igue', 'ude', 'age', 'ade',
    'ère', 'ète', 'ite', 'ote', 'ute', 'ine', 'ane', 'one', 'une',
    'igue', 'ogue', 'gue', 'que', 'ble', 'ple', 'gle', 'fle', 'cle',
    'tre', 'dre', 'vre', 'pre', 'bre', 'gre', 'cre', 'fre',
    'ste', 'nce', 'nse', 'rse', 'lse',
    'ais', 'ait', 'ant', 'ent', 'ont', 'int',
    'eur', 'oir', 'air', 'our',
    'ès', 'as', 'is', 'us', 'os', 'sa', 'ra', 'na', 'ta', 'la', 'va', 'da', 'pa', 'ga', 'ba', 'ma', 'fa', 'ca',
  ];
  
  for (const ending of wordEndings) {
    // Match: word ending in this suffix + accented vowel starting next word (no space)
    const regex = new RegExp('(' + ending + ')([éèêëàâäîïôùûüç])([a-zà-ÿ])', 'gi');
    out = out.replace(regex, (match, end, accent, next) => {
      // Don't split known valid French words that span this boundary
      const fullMatch = end + accent + next;
      const validPrefixes = ['éta', 'étr', 'éch', 'éne', 'émo', 'épi', 'équ', 'éle', 'éva', 'évo', 'éco', 'édu'];
      // Check if the accented part starts a valid word
      const accentPart = accent + next;
      if (validPrefixes.some(p => accentPart.startsWith(p.slice(0, 2)))) {
        return end + ' ' + accent + next;
      }
      // For other accented vowels, also split
      return end + ' ' + accent + next;
    });
  }
  
  // Also catch: common verb/pronoun + accented word joins
  const verbJoins = [
    [/\bva([éèêà])([a-z])/gi, 'va $1$2'],
    [/\bas([éèêà])([a-z])/gi, 'as $1$2'],
    [/\btu([éèêà])([a-z])/gi, 'tu $1$2'],
    [/\bje([éèêà])([a-z])/gi, 'je $1$2'],
    [/\baprès([a-z])/gi, 'après $1'],
  ];
  for (const [pattern, replacement] of verbJoins) {
    out = out.replace(pattern, replacement);
  }
  
  return out;
}

/**
 * Remove common AI tell phrases from the article.
 */
export function cleanAiTells(html) {
  let out = html;
  const aiTells = [
    [/il est essentiel de /gi, ''],
    [/il est crucial de /gi, ''],
    [/Il est important de noter que /gi, ''],
    [/Il convient de souligner que /gi, ''],
    [/Force est de constater que /gi, ''],
    [/N'hésitez pas à /gi, ''],
    [/il est essentiel que /gi, ''],
    [/il est crucial que /gi, ''],
  ];
  for (const [pattern, replacement] of aiTells) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Limit "Si tu..." sentences to max 3 in the entire article.
 * Rewrites excess occurrences to imperative form.
 */
export function limitSiTuSentences(html) {
  let out = html;
  // Count "Si tu" occurrences in text (not in HTML attributes)
  const siTuPattern = /Si tu ([a-zéèêàâîôûç]+)/gi;
  let count = 0;
  out = out.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (pTag, content) => {
    // Check if this paragraph starts with or contains "Si tu"
    const hasSiTu = /Si tu [a-zéèêàâîôûç]/i.test(content);
    if (!hasSiTu) return pTag;
    
    count++;
    if (count <= 3) return pTag; // Keep first 3
    
    // For excess: try to rewrite "Si tu [verbe], [conseil]" → "[Conseil]"
    let rewritten = content;
    // Pattern: "Si tu [verbe...], [privilégie/évite/opte/choisis/pars] [reste]"
    rewritten = rewritten.replace(
      /Si tu [^,]+,\s*(privil[eé]gie|[eé]vite|opte pour|choisis|pars sur)\s+/gi,
      (m, verb) => {
        // Capitalize the verb
        return verb.charAt(0).toUpperCase() + verb.slice(1) + ' ';
      }
    );
    // If no comma pattern, try: "Si tu [verbe...], [reste de phrase]" or "Si tu [verbe...]: [reste]"
    rewritten = rewritten.replace(
      /Si tu [^,:]+[,:]+\s*/gi,
      ''
    );
    // Last resort: strip "Si tu" and capitalize
    if (/Si tu/i.test(rewritten)) {
      rewritten = rewritten.replace(/Si tu /gi, '');
    }
    
    return pTag.replace(content, rewritten);
  });
  
  return out;
}

/**
 * Fix truncated sentences ending with just a period after short text.
 * Detects patterns like "tu es constamment ." and removes the orphan period.
 */
export function fixTruncatedSentences(html) {
  let out = html;
  // Remove sentences that end abruptly with just ". " after a short word
  // e.g., "tu es constamment ." → remove the whole sentence or the orphan period
  out = out.replace(/ \./g, '.');
  // Fix double periods
  out = out.replace(/\.\./g, '.');
  // Remove paragraphs that are clearly truncated (less than 20 chars of actual text)
  out = out.replace(/<p[^>]*>\s*([^<]{1,15})\s*<\/p>/g, (match, text) => {
    const trimmed = text.trim();
    // Keep if it's a complete short sentence or a number/date
    if (/[.!?]$/.test(trimmed) && trimmed.length > 5) return match;
    if (/^\d/.test(trimmed)) return match;
    // Remove if it's clearly truncated
    if (trimmed.length < 10 && !/[.!?]$/.test(trimmed)) return '';
    return match;
  });
  return out;
}

/**
 * Merge consecutive short paragraphs to improve reading rhythm.
 * Two consecutive <p> tags with <100 chars each get merged into one.
 */
export function mergeShortParagraphs(html) {
  let out = html;
  // Find consecutive short paragraphs and merge them
  // Handles paragraphs with inline HTML tags (a, strong, em, etc.)
  let changed = true;
  let iterations = 0;
  
  function stripTags(s) { return s.replace(/<[^>]+>/g, '').trim(); }
  
  while (changed && iterations < 15) {
    changed = false;
    iterations++;
    out = out.replace(
      /<p([^>]*)>((?:(?!<\/p>)[\s\S])+)<\/p>[\s]*<p([^>]*)>((?:(?!<\/p>)[\s\S])+)<\/p>/g,
      (match, attrs1, content1, attrs2, content2) => {
        // Don't merge if either has special classes (widget, blockquote-wrapper, etc.)
        if (attrs1.includes('class=') || attrs2.includes('class=')) return match;
        // Don't merge if content has block-level elements
        if (/<(div|table|ul|ol|h[1-6]|blockquote|details)/i.test(content1 + content2)) return match;
        
        const text1 = stripTags(content1);
        const text2 = stripTags(content2);
        
        // Skip very short content (likely labels or markers)
        if (text1.length < 5 || text2.length < 5) return match;
        // Don't merge if second paragraph starts with a list marker
        if (/^[•\-\d]/.test(text2)) return match;
        // Don't merge if combined text would be too long (>500 chars)
        if (text1.length + text2.length > 500) return match;
        // Don't merge if first paragraph ends with : (introducing something)
        if (/:\s*$/.test(text1)) return match;
        // Don't merge if second paragraph starts with a capital after a sentence end
        // (new topic) — but DO merge if first ends without period
        if (/[.!?]\s*$/.test(text1) && text1.length > 120) return match;
        
        // Merge if either is short (<100 chars text) or combined is moderate
        const len1 = text1.length;
        const len2 = text2.length;
        if (len1 < 100 || len2 < 100 || (len1 + len2 < 300)) {
          changed = true;
          return '<p' + attrs1 + '>' + content1.trim() + ' ' + content2.trim() + '</p>';
        }
        return match;
      }
    );
  }
  return out;
}

/**
 * Fix broken internal link text insertions like "Les notre article sur Laos te vendent"
 */
export function fixBrokenInternalLinkText(html) {
  let out = html;
  // Remove orphan internal link reference text (when link text leaks without <a> wrapper)
  // Patterns: "notre guide X Y", "notre article sur X"
  out = out.replace(/Les notre (guide|article)[^.]{0,50}(?=[.!?,])/gi, '');
  out = out.replace(/notre (guide|article) [a-zéèêàâîôûçA-ZÉÈÊÀÂÎÔÛÇ]+ [a-zéèêàâîôûçA-ZÉÈÊÀÂÎÔÛÇ]+(?= )/gi, '');
  // Remove orphan "En déménageant notre guide..." type patterns
  out = out.replace(/En déménageant notre (guide|article)[^.]{0,50}/gi, '');
  // "comme si c'était une simple affaire de choisir" orphan intro
  out = out.replace(/parlent de comme si/gi, 'parlent de cette question comme si');
  return out;
}

/**
 * Fix brand names and compound words that were incorrectly split by encoding fixers.
 * Must run as the VERY LAST fixer.
 */

/**
 * Remove obviously truncated sentence fragments like 'de en.', 'du de.', 'la le.'
 */

/**
 * Remove slug-like text that leaks into article body or quotes.
 * Patterns like 'notre guide visa Thaïlande', 'notre guide arbitrages Thaïlande'
 */

/**
 * Validate FAQ answers - detect and fix obviously corrupted FAQ responses.
 */

/**
 * Remove slug-like article titles that leaked into conclusion/body text.
 */

/**
 * Reduce repetitive "Un voyageur explique :" attributions.
 * Keep first 2 occurrences, vary the rest.
 */
export function deduplicateRedditAttributions(html) {
  let out = html;
  const pats = [
    "Un voyageur explique",
    "Un expat formule",
    "Un expat pose",
    "Un expat r\u00e9sume",
    "Un expat le formule",
    "Un expat le reconna\u00eet",
    "La communaut\u00e9 confirme",
  ];
  const alts = [
    "Comme le note un membre",
    "Selon un t\u00e9moignage",
    "Un retour terrain",
    "D\u2019apr\u00e8s un expat",
    "Un habitu\u00e9 confirme",
  ];
  for (const pat of pats) {
    const re = new RegExp(pat + "\\s*:\\s*", "g");
    const matches = [...out.matchAll(re)];
    if (matches.length > 2) {
      let idx = 0;
      out = out.replace(re, (m) => {
        idx++;
        if (idx <= 2) return m;
        return alts[(idx - 3) % alts.length] + " : ";
      });
    }
  }
  // Fix nested attributions: "Un expat dit : \u00ab Un voyageur explique : \u00ab"
  out = out.replace(/Un (?:expat|voyageur|membre)[^«»:]{0,30}:\s*«\s*Un (?:voyageur|expat|membre) explique\s*:\s*«/g, "«");
  return out;
}

export function cleanConclusionSlugs(html) {
  let out = html;
  // Remove slug fragments: "budget 2 200 e en Thailande 5 Arbitrages..."
  out = out.replace(/budget\s+\d[\d\s]*e\s+en\s+Tha[i\u00ee]land[e]?\s+\d[^.!?<]{10,}(?:ruiner|sacrifier|budget|\u00e9conomiser|\u00e9viter|sauver)/gi, "");
  // Remove "combiner travail a distance et muay thai sans sacrifier ton budget"
  out = out.replace(/combiner\s+travail\s+[\u00e0a]\s+distance[^.!?<]{5,}(?:budget|sacrifier)/gi, "");
  // Remove "optimiser son itin\u00e9raire sans sacrifier" slug patterns
  out = out.replace(/optimiser\s+son\s+itin[\u00e9e]raire[^.!?<]{5,}(?:sacrifier|budget)/gi, "");
  // Clean double spaces and empty paragraphs
  out = out.replace(/\s{2,}/g, " ");
  out = out.replace(/<p[^>]*>\s*[.,;:!?]?\s*<\/p>/g, "");
  return out;
}

export function validateFaqAnswers(html) {
  let out = html;
  out = out.replace(/<details[^>]*>\s*<summary[^>]*>(.*?)<\/summary>\s*<p[^>]*>(.*?)<\/p>\s*<\/details>/gs, (match, question, answer) => {
    const clean = answer.replace(/<[^>]+>/g, "").trim();
    const hasGarbage = /co[\u00fbu]te (ta|ton|sa|ses|leur) /.test(clean) && !/co[\u00fbu]te (environ|entre|autour|en moyenne)/.test(clean);
    const hasBodyLeak = /co[\u00fbu]te [a-z]+ [a-z]+ [a-z]+ en tant que/.test(clean);
    const tooShort = clean.length < 20;
    if (!hasGarbage && !hasBodyLeak && !tooShort) return match;
    const q = question.replace(/<[^>]+>/g, "").toLowerCase();
    let a;
    if (q.includes("vol") || q.includes("avion")) {
      a = "En moyenne, un vol aller-retour Paris-Asie du Sud-Est co\u00fbte entre 400\u20ac et 700\u20ac selon la saison. R\u00e9serve 2-3 mois \u00e0 l\u2019avance et compare sur Google Flights ou Skyscanner.";
    } else if (q.includes("budget") || q.includes("combien")) {
      a = "Compte 30-50\u20ac/jour en mode backpacker, 70-100\u20ac/jour en mode confort. Les repas locaux co\u00fbtent 2-5\u20ac, les h\u00f4tels budget 10-25\u20ac/nuit.";
    } else if (q.includes("transport") || q.includes("d\u00e9placer")) {
      a = "Utilise Grab pour les trajets urbains (prix fixe). Les bus locaux co\u00fbtent 1-3\u20ac. Pour les inter-villes, compare sur 12go.asia.";
    } else if (q.includes("p\u00e9riode") || q.includes("saison") || q.includes("quand")) {
      a = "La meilleure p\u00e9riode est novembre-f\u00e9vrier (saison s\u00e8che). \u00c9vite mars-mai (chaleur extr\u00eame). La mousson (juin-octobre) peut compliquer les d\u00e9placements.";
    } else if (clean.length > 50 && !hasBodyLeak) {
      return match;
    } else {
      return "";
    }
    return "<details><summary>" + question + "</summary><p>" + a + "</p></details>";
  });
  return out;
}

export function fixSlugLeaksInQuotes(html) {
  let out = html;
  // Remove 'notre guide [word] [destination]' patterns that are slug text
  out = out.replace(/notre guide [a-zà-ÿ-]+ (Thaïlande|Japon|Indonésie|Vietnam|Cambodge|Laos|Philippines|Malaisie|Bali|Inde|Myanmar|Sri Lanka)/gi, '');
  // Remove English fragments that are clearly not translated
  out = out.replace(/<blockquote[^>]*>\s*<p[^>]*>\s*You[\u2019']re[^<]*<\/p>\s*<\/blockquote>/gi, '');
  return out;
}

export function fixTruncatedFragments(html) {
  let out = html;
  // Remove fragments that are just prepositions/articles: 'de en.', 'du de la.'
  out = out.replace(/ (?:de|du|des|le|la|les|en|au|aux) (?:de|du|des|le|la|les|en|au|aux)[.,]/g, '.');
  // Remove lone preposition at end of sentence: 'du thaï de en.'
  out = out.replace(/ (?:de|du|des|en|au|aux) (?:en|de|du)[.]/g, '.');
  return out;
}

export function fixBrandNames(html) {
  let out = html;
  const brandFixes = [
    [/i Phone/g, 'iPhone'],
    [/i Phones/g, 'iPhones'],
    [/i Pad/g, 'iPad'],
    [/i Pads/g, 'iPads'],
    [/Pay Pal/g, 'PayPal'],
    [/Whats App/g, 'WhatsApp'],
    [/Wi Fi/g, 'WiFi'],
    [/wi fi/gi, 'WiFi'],
    [/You Tube/g, 'YouTube'],
    [/Face Book/g, 'Facebook'],
    [/Insta gram/g, 'Instagram'],
    [/Air Bnb/g, 'Airbnb'],
    [/e SIM/g, 'eSIM'],
    [/e Sim/g, 'eSIM'],
    [/E Sim/g, 'eSIM'],
    [/Air Asia/g, 'AirAsia'],
    [/Trip Advisor/g, 'TripAdvisor'],
    [/Booking Com/g, 'Booking.com'],
    [/Grab Car/g, 'GrabCar'],
    [/Google Fi/g, 'Google Fi'], // This one is correct as-is
    // Common French words that get split
    [/expériment és/g, 'expérimentés'],
    [/expérienc és/g, 'expériencés'],
    [/supplément aire/g, 'supplémentaire'],
    [/complèt ement/g, 'complètement'],
    [/immédi atement/g, 'immédiatement'],
    [/différ emment/g, 'différemment'],
    [/particuli èrement/g, 'particulièrement'],
    [/enti èrement/g, 'entièrement'],
    [/premi ère/g, 'première'],
    [/derni ère/g, 'dernière'],
    [/financi ère/g, 'financière'],
    [/réserv ation/g, 'réservation'],
  ];
  for (const [pattern, replacement] of brandFixes) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/**
 * Fix broken destination placeholders in templates.
 * "en la destination" → remove or replace with actual destination from context.
 */
export function fixDestinationPlaceholders(html) {
  let out = html;
  // Remove "en la destination" or "à la destination" from H2s and text
  out = out.replace(/en la destination/gi, 'sur place');
  out = out.replace(/à la destination/gi, 'sur place');
  out = out.replace(/de la destination/gi, 'du voyage');
  out = out.replace(/la destination/gi, 'ta destination');
  // Fix "en the destination" English leaks
  out = out.replace(/en the destination/gi, 'sur place');
  return out;
}

/**
 * Clean up FAQ formatting issues like <strong> inside <summary>.
 */
export function fixFaqFormatting(html) {
  let out = html;
  // Remove <strong> tags from inside <summary> tags
  out = out.replace(/<summary>\s*<strong>(.*?)<\/strong>\s*<\/summary>/gi, '<summary>$1</summary>');
  // Remove <em> tags from inside <summary> tags
  out = out.replace(/<summary>\s*<em>(.*?)<\/em>\s*<\/summary>/gi, '<summary>$1</summary>');
  return out;
}

export function applyPostProcessingFixers(html) {
  let c = html;
  c = scrubUnicodeArtifacts(c);
  c = fixGenericAccentJoins(c);
  c = fixEncodingBreaks(c);
  c = fixGhostLinks(c);
  c = fixDuplicateCitations(c);
  c = fixEmptyFaqEntries(c);
  c = splitWallParagraphs(c);
  c = mergeShortParagraphs(c);
  c = fixSlugAnchors(c);
  c = fixNestedLinks(c);
  c = cleanBlockquoteContent(c);
  c = smartenFrenchApostrophes(c);
  c = fixFaqCountryGrammar(c);
  c = fixSmartQuoteSpaces(c);
  c = capExcessiveH2s(c);
  c = cleanAiTells(c);
  c = limitSiTuSentences(c);
  c = fixTruncatedSentences(c);
  c = fixBrokenInternalLinkText(c);
  c = validateFaqAnswers(c);
  c = fixFaqFormatting(c);
  c = fixDestinationPlaceholders(c);
  c = deduplicateRedditAttributions(c);
  c = cleanConclusionSlugs(c);
  c = fixSlugLeaksInQuotes(c);
  c = fixTruncatedFragments(c);
  c = fixBrandNames(c);
  return c;
}

