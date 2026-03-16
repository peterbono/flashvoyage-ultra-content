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
    [/(?<=\s|>)aépousé/g, 'a épousé'],
    [/(?<=\s|>)aévolué/g, 'a évolué'],
    [/(?<=\s|>)aémergé/g, 'a émergé'],
    [/(?<=\s|>)aéchoué/g, 'a échoué'],
    [/(?<=\s|>)aétabli/g, 'a établi'],
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
    [/int\s+ègre/g, 'intègre'],
    [/sépar\s+ément/g, 'séparément'],
    [/complèt\s+ement/g, 'complètement'],
    [/immédiat\s+ement/g, 'immédiatement'],
    [/particulièr\s+ement/g, 'particulièrement'],
    [/précis\s+ément/g, 'précisément'],
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

/**
 * Fix sentences that are actually article slugs/titles wrapped around internal links.
 * Pattern: "tu arrives budget 2 200 e en <a>Thailande 5 Arbitrages Caches</a> qui peuvent te ruiner"
 */
export function fixSlugSentenceLinks(html) {
  let out = html;
  out = out.replace(/([ >])([^<]{5,80})<a\s+href="(https?:\/\/flashvoyage\.com\/[^"]+)"[^>]*>([^<]+)<\/a>([^<]{0,80}[.!?])/g, (match, pre, before, href, linkText, after) => {
    const slug = href.replace(/https?:\/\/flashvoyage\.com\//, "").replace(/\//g, "");
    const fullText = (before + linkText + after).toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    const slugText = slug.replace(/-/g, " ").trim();
    const slugWords = slugText.split(" ").filter(w => w.length > 2);
    const overlap = slugWords.filter(w => fullText.includes(w)).length;
    if (overlap >= slugWords.length * 0.6) {
      return pre + "consulte " + '<a href="' + href + '">cet article</a>.';
    }
    return match;
  });
  return out;
}

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

  // Step 1: Remove entire generic filler sections
  const genericH2Patterns = [
    /<h2[^>]*>\s*Limites?\s*(et\s*)?biais[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
    /<h2[^>]*>\s*Comparatif\s*des\s*destinations?[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
    /<h2[^>]*>\s*Ce\s*qui\s*change\s*concr[\u00e8e]tement[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
    /<h2[^>]*>\s*Que\s*faire\s*maintenant[^<]*<\/h2>[\s\S]*?(?=<h2|$)/i,
  ];

  for (const pattern of genericH2Patterns) {
    if ((out.match(/<h2[^>]*>/gi) || []).length <= 8) break;
    out = out.replace(pattern, '');
  }

  // Step 2: If still > 8 H2s, downgrade less important ones to H3
  if ((out.match(/<h2[^>]*>/gi) || []).length > 8) {
    const downgradePatterns = [
      /Questions ouvertes/i,
      /Ce que les guides ne disent pas explicitement/i,
      /Ce que dit le t[\u00e9e]moignage/i,
      /Ce que les blogs/i,
    ];
    for (const pat of downgradePatterns) {
      if ((out.match(/<h2[^>]*>/gi) || []).length <= 8) break;
      out = out.replace(new RegExp('<h2([^>]*)>([^<]*?' + pat.source + '[^<]*?)</h2>', 'i'), '<h3$1>$2</h3>');
    }
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
    [/jours([éèêàâîôû])/gi, 'jours $1'],
    [/jour([éèêàâîôû])/gi, 'jour $1'],
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
    'rs', 'ns', 'ts', 'ds', 'ps', 'bs', 'gs', 'ks', 'ls', 'ms', 'fs', 'xs',
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

/**
 * Remove untranslated English fragments from article body.
 * Detects English sentences (>3 words) that leaked from Reddit.
 */

/**
 * Fix H2s that are truncated mid-phrase.
 * e.g., "l'illusion du " with nothing after "du"
 */
export function fixTruncatedH2s(html) {
  let out = html;
  // Detect H2s ending with a preposition/article (incomplete phrase)
  out = out.replace(/<h2([^>]*)>(.*?)\s+(du|de|des|le|la|les|un|une|l’|l')\s*<\/h2>/gi, (match, attrs, text, prep) => {
    // Remove the dangling preposition
    return '<h2' + attrs + '>' + text.trim() + '</h2>';
  });
  return out;
}

export function removeEnglishLeaks(html) {
  let out = html;
  // Remove common English leak patterns
  out = out.replace(/No problem!/g, '');
  out = out.replace(/advice on what needs tweaking/gi, '');
  // Remove list items that are pure English
  out = out.replace(/<li[^>]*>\s*No problem!\s*<\/li>/gi, '');
  // Remove paragraphs that are >70% English words
  out = out.replace(/(?<=>)([^<]{20,})(?=<)/g, (match, text) => {
    const words = text.trim().split(/\s+/);
    if (words.length < 4) return match;
    const engWords = words.filter(w => /^(the|is|are|was|were|have|has|had|will|would|could|should|can|do|does|did|not|but|and|or|for|with|from|this|that|what|how|you|your|my|our|their|its|it|he|she|we|they|I|a|an|of|to|in|on|at|by|as|if|so|no|up|out|just|about|really|very|also|too|even|still|already|always|never|often|sometimes|actually|basically|honestly|literally|need|want|help|trip|travel|solo|first|time|day|night|get|go|come|take|make|know|think|see|find|try|use|tell|ask|look|feel|give|work|call|keep|let|say|mean|put|run|move|live|stay|play|read|pay|buy|eat|drink|sleep|walk|drive|fly)$/i.test(w));
    if (engWords.length / words.length > 0.6) return ''; // >60% English = remove
    return match;
  });
  // Clean empty elements
  out = out.replace(/<p[^>]*>\s*<\/p>/g, '');
  out = out.replace(/<li[^>]*>\s*<\/li>/g, '');
  return out;
}

export function limitSiTuSentences(html) {
  let out = html;
  // Count ALL "Si tu" in the document (not just paragraph starts)
  const allSiTu = (out.match(/Si tu [a-z\u00e0-\u00ff]/gi) || []).length;
  if (allSiTu <= 4) return out; // Under threshold, nothing to do

  // Strategy: simply REMOVE excess "Si tu" sentences (4th+ occurrence)
  // Previous approach tried grammatical rewrites that produced broken French
  // Safest approach: keep first 4, delete the rest entirely
  let kept = 0;

  // Process all text, removing excess "Si tu" sentences
  // Match "Si tu [verb phrase]" up to the next period/comma/end of tag
  out = out.replace(/Si tu ([a-z\u00e0-\u00ff][^<]*?)([.!?])/gi, (match, rest, punct) => {
    kept++;
    if (kept <= 4) return match; // Keep first 4 as-is
    // For excess occurrences, just remove the "Si tu" clause
    // This is safer than trying to rewrite grammar
    return '';
  });

  // Clean up empty paragraphs left behind
  out = out.replace(/<p[^>]*>\s*<\/p>/g, '');

  return out;
}

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
    const hasSentenceBreak = /co[ûu]te environ [a-z]+ [A-Z]/.test(clean) || /co[ûu]te environ utilise/.test(clean);
    const hasIncoherent = /scooter \(es /.test(clean) || /co[\u00fbu]te [a-z]+ [a-z]+ au lieu/.test(clean);
    const tooShort = clean.length < 20;
    if (!hasGarbage && !hasBodyLeak && !hasSentenceBreak && !hasIncoherent && !tooShort) return match;
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
    return '<div class="fv-faq-item" style="margin-bottom:0.5rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"><details style="padding:0;"><summary style="padding:1rem 1.2rem;cursor:pointer;font-weight:600;font-size:1rem;background:#f9fafb;list-style:none;display:flex;align-items:center;justify-content:space-between;"><span>' + question + '</span><svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="transition:transform 0.2s;flex-shrink:0;margin-left:0.5rem;"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><div style="padding:0 1.2rem 1rem;font-size:0.95rem;line-height:1.6;color:#374151;"><p>' + a + '</p></div></details></div>';
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


/**
 * Clean the "Questions ouvertes" section which often contains raw Reddit text.
 * Decode HTML entities and remove duplicate/raw content.
 */
export function cleanQuestionsOuvertes(html) {
  let out = html;
  // Decode common HTML entities in the whole document
  out = out.replace(/&quot;/g, '"');
  out = out.replace(/&#039;/g, "'");
  out = out.replace(/&#8217;/g, "\u2019");
  out = out.replace(/&#8211;/g, "\u2013");
  // Remove duplicate question items in "Questions ouvertes" section
  const qoMatch = out.match(/(<h2[^>]*>Questions ouvertes<\/h2>)(.*?)(?=<h2|<\/div|$)/s);
  if (qoMatch) {
    let qoSection = qoMatch[2];
    // Remove exact duplicate <li> items
    const seen = new Set();
    qoSection = qoSection.replace(/<li[^>]*>(.*?)<\/li>/gs, (match, content) => {
      const clean = content.replace(/<[^>]+>/g, "").trim().toLowerCase().substring(0, 100);
      if (seen.has(clean)) return "";
      seen.add(clean);
      return match;
    });
    // Remove items that are just "? text" (raw Reddit fragments)
    qoSection = qoSection.replace(/<li[^>]*>\s*\?[^<]*<\/li>/g, "");
    out = out.replace(qoMatch[2], qoSection);
  }
  return out;
}


/**
 * Replace em dashes (—) with appropriate punctuation.
 * Em dashes are an AI writing tell that readers spot instantly.
 */

/**
 * Remove Reddit/r/xxx mentions from article body.
 * Keep them only in byline (fv-byline div) and source box (À propos).
 */
export function stripRedditFromBody(html) {
  let out = html;
  // Replace "Extrait Reddit" with "Extrait de témoignage"
  out = out.replace(/Extrait Reddit/gi, "Extrait de témoignage");
  // Replace "témoignage Reddit" with "témoignage en ligne"
  out = out.replace(/témoignage(?:s)? Reddit/gi, "témoignage en ligne");
  // Replace "sur Reddit" with "sur les forums"
  out = out.replace(/sur Reddit/gi, "sur les forums");
  // Replace "r/Thailand" etc in body text (but not in hrefs)
  // Only replace r/xxx when NOT inside an href attribute
  out = out.replace(/(?<!href="[^"]*?)\br\/[A-Za-z_]+/g, "les forums de voyageurs");
  // Replace standalone "Reddit" (not in hrefs or byline class)
  // We do this carefully: only in text nodes
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    return text
      .replace(/\bReddit\b/g, "les forums")
      .replace(/\br\/[A-Za-z_]+/g, "les forums de voyageurs");
  });
  return out;
}
export function replaceEmDashes(html) {
  let out = html;
  // Em dash between two clauses: replace with comma or period
  // Pattern: "word — word" => "word, word" (or ". Word" if after a complete thought)
  out = out.replace(/ — /g, ", ");
  // Also catch without spaces
  out = out.replace(/—/g, ", ");
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


// ─── CURRENCY CONVERSION (EUR) ─────────────────────────────
// Converts GBP/USD amounts to EUR in text nodes only (not in hrefs)
// Rates: 1 GBP ≈ 1.16 EUR, 1 USD ≈ 0.92 EUR
function roundToNearest5or10(n) {
  if (n <= 50) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}

export function convertToEuros(html) {
  let out = html;
  let fixCount = 0;

  // Only process text nodes (between > and <)
  out = out.replace(/(?<=>)([^<]+)(?=<)/g, (match, text) => {
    let fixed = text;

    // Pattern 1: "250 livres sterling" or "250 livres"
    fixed = fixed.replace(/(\d[\d.,]*)\s*livres?\s*(?:sterling)?/gi, (m, amount) => {
      const num = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      if (isNaN(num) || num <= 0) return m;
      const eur = roundToNearest5or10(num * 1.16);
      fixCount++;
      return "environ " + eur + " \u20ac";
    });

    // Pattern 2: "\u00a3250" or "\u00a3 250"
    fixed = fixed.replace(/\u00a3\s*(\d[\d.,]*)/g, (m, amount) => {
      const num = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      if (isNaN(num) || num <= 0) return m;
      const eur = roundToNearest5or10(num * 1.16);
      fixCount++;
      return "environ " + eur + " \u20ac";
    });

    // Pattern 3: "$300" or "$ 300" (but not CSS vars)
    fixed = fixed.replace(/\$\s*(\d[\d.,]*)/g, (m, amount) => {
      const num = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      if (isNaN(num) || num <= 0) return m;
      const eur = roundToNearest5or10(num * 0.92);
      fixCount++;
      return "environ " + eur + " \u20ac";
    });

    // Pattern 4: "300 USD" or "300 dollars"
    fixed = fixed.replace(/(\d[\d.,]*)\s*(?:USD|dollars?\s*(?:am\u00e9ricains?)?)/gi, (m, amount) => {
      const num = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      if (isNaN(num) || num <= 0) return m;
      const eur = roundToNearest5or10(num * 0.92);
      fixCount++;
      return "environ " + eur + " \u20ac";
    });

    // Pattern 5: "300 GBP"
    fixed = fixed.replace(/(\d[\d.,]*)\s*GBP/gi, (m, amount) => {
      const num = parseFloat(amount.replace(/\s/g, "").replace(",", "."));
      if (isNaN(num) || num <= 0) return m;
      const eur = roundToNearest5or10(num * 1.16);
      fixCount++;
      return "environ " + eur + " \u20ac";
    });

    return fixed;
  });

  if (fixCount > 0) {
    console.log("\ud83d\udcb1 CURRENCY_FIXER: " + fixCount + " amount(s) converted to EUR");
  }
  return out;
}

// ─── PARTNER BLOCK DESTINATION MISMATCH ────────────────────
// Detects partner/CTA blocks mentioning wrong destinations and removes them
export function fixPartnerDestinationMismatch(html) {
  let out = html;
  let fixCount = 0;

  // Extract article destination from title or first H2
  const titleMatch = out.match(/<h1[^>]*>([^<]+)<\/h1>/i) || out.match(/<h2[^>]*>([^<]+)<\/h2>/i);
  if (!titleMatch) return out;

  const titleText = titleMatch[1].replace(/<[^>]+>/g, "").toLowerCase();

  // Known destinations to detect
  const destinations = [
    "tha\u00eflande", "thailande", "vietnam", "cambodge", "laos",
    "indon\u00e9sie", "indonesie", "bali", "japon", "philippines",
    "malaisie", "singapour", "myanmar", "sri lanka", "inde",
    "bangkok", "tokyo", "hanoi", "ho chi minh", "chiang mai",
    "amsterdam", "paris", "londres", "london", "new york",
    "barcelone", "rome", "berlin", "lisbonne", "madrid"
  ];

  // Find which destination the article is about
  const articleDest = destinations.find(d => titleText.includes(d));
  if (!articleDest) return out; // Cannot determine destination

  // Check partner blocks (class="fv-" or "Liens partenaires" sections or widget divs)
  const partnerBlockPatterns = [
    /(<div[^>]*class="[^"]*fv-(?:partner|cta|affiliate|widget)[^"]*"[^>]*>[\s\S]*?<\/div>)/gi,
    /(<div[^>]*class="[^"]*(?:partner|affiliate|sponsor)[^"]*"[^>]*>[\s\S]*?<\/div>)/gi,
    /((?:<h[23][^>]*>\s*Liens?\s*partenaires?[^<]*<\/h[23]>)[\s\S]*?(?=<h[23]|$))/gi,
  ];

  for (const pattern of partnerBlockPatterns) {
    out = out.replace(pattern, (block) => {
      const blockText = block.replace(/<[^>]+>/g, " ").toLowerCase();
      // Check if the block mentions a DIFFERENT destination than the article
      const blockDests = destinations.filter(d => blockText.includes(d) && d !== articleDest);
      // Only remove if block mentions other destinations but NOT the article destination
      if (blockDests.length > 0 && !blockText.includes(articleDest)) {
        fixCount++;
        console.log("\ud83d\udea9 PARTNER_MISMATCH: removed block mentioning " + blockDests.join(", ") + " in " + articleDest + " article");
        return "";
      }
      return block;
    });
  }

  if (fixCount > 0) {
    console.log("\ud83d\udea9 PARTNER_DEST_FIXER: " + fixCount + " mismatched partner block(s) removed");
  }
  return out;
}

// ─── PARAGRAPH DEDUPLICATION (NEAR-DUPLICATE) ──────────────
// Detects near-duplicate paragraphs (>80% word overlap) and removes second occurrence
export function deduplicateParagraphs(html) {
  let out = html;
  let fixCount = 0;

  // Extract all paragraphs
  const paraRegex = /<p[^>]*>((?:(?!<\/p>)[\s\S])+)<\/p>/gi;
  const allParas = [...out.matchAll(paraRegex)];

  // Normalize text for comparison
  function normalize(text) {
    return text
      .replace(/<[^>]+>/g, " ")
      .toLowerCase()
      .replace(/[^a-z\u00e0-\u00ff0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getWords(text) {
    return text.split(" ").filter(w => w.length > 2);
  }

  function similarity(words1, words2) {
    if (words1.length === 0 || words2.length === 0) return 0;
    const set2 = new Set(words2);
    const common = words1.filter(w => set2.has(w)).length;
    return common / Math.max(words1.length, words2.length);
  }

  const seen = [];
  const toRemove = new Set();

  for (const para of allParas) {
    const norm = normalize(para[1]);
    if (norm.length < 40) continue; // Skip very short paragraphs
    const words = getWords(norm);
    if (words.length < 5) continue;

    for (const prev of seen) {
      if (similarity(words, prev.words) > 0.8) {
        toRemove.add(para[0]);
        fixCount++;
        break;
      }
    }
    seen.push({ text: norm, words });
  }

  // Remove duplicate paragraphs (second occurrence)
  for (const dup of toRemove) {
    const lastIdx = out.lastIndexOf(dup);
    const firstIdx = out.indexOf(dup);
    if (lastIdx !== firstIdx) {
      out = out.slice(0, lastIdx) + out.slice(lastIdx + dup.length);
    } else {
      // Only one occurrence — matched by similarity with a previous one
      out = out.replace(dup, "");
    }
  }

  // Also detect repeated phrases like "Voici ce que synthétise" appearing twice
  const repeatedPhrases = [
    "Voici ce que synth\u00e9tise",
    "Voici ce qui ressort",
    "Voici les points cl\u00e9s",
    "Ce qu.il faut retenir",
  ];

  for (const phrase of repeatedPhrases) {
    const re = new RegExp(phrase, "gi");
    const matches = [...out.matchAll(re)];
    if (matches.length > 1) {
      // Remove the paragraph containing the second occurrence
      let count = 0;
      out = out.replace(new RegExp("<p[^>]*>[^<]*" + phrase + "[^<]*<\/p>", "gi"), (m) => {
        count++;
        if (count > 1) {
          fixCount++;
          return "";
        }
        return m;
      });
    }
  }

  if (fixCount > 0) {
    console.log("\ud83d\udd04 DEDUP_PARAGRAPHS: " + fixCount + " near-duplicate paragraph(s) removed");
  }
  return out;
}

// ─── SOURCE BANNER INJECTION ───────────────────────────────
// Inserts a credibility banner after the byline div and before the first H2
export function injectSourceBanner(html) {
  let out = html;

  // Don't inject if already present
  if (out.includes("fv-source-anchor")) return out;

  // Extract N from byline text ("retours de X contributions" or "X contributions")
  const bylineMatch = out.match(/retours?\s+de\s+(?:<[^>]+>)*(\d+)\s*contributions?/i)
    || out.match(/(\d+)\s*contributions?/i);
  let N = bylineMatch ? parseInt(bylineMatch[1], 10) : 'plusieurs';
  if (typeof N === 'number' && N <= 2) N = 8;

  // Find insertion point: after fv-byline div, before first H2
  const bylineIdx = out.indexOf("fv-byline");
  const bylineEnd = bylineIdx > 0 ? out.indexOf("</div>", bylineIdx) : -1;
  const firstH2 = out.indexOf("<h2");

  let insertPos;
  if (bylineEnd > 0 && firstH2 > bylineEnd) {
    insertPos = bylineEnd + 6; // after </div>
  } else if (firstH2 > 0) {
    insertPos = firstH2;
  } else {
    return out; // No suitable insertion point
  }

  const banner = '\n<div class="fv-source-anchor" style="margin:1.5rem 0;padding:0.8rem 1rem;background:#f0f7ff;border-left:3px solid #2563eb;border-radius:4px;font-size:0.88rem;color:#4b5563;">\n\ud83d\udcca <strong>Synth\u00e8se de ' + N + ' ' + (N === 1 ? 't\u00e9moignage' : 't\u00e9moignages') + '</strong> de voyageurs et expatri\u00e9s | Sources : forums de voyageurs francophones et internationaux\n</div>\n';

  out = out.slice(0, insertPos) + banner + out.slice(insertPos);
  console.log("\ud83c\udff7\ufe0f SOURCE_BANNER: credibility banner injected (N=" + N + ")");
  return out;
}


// ─── PARTNER/CTA TRANSITION INJECTOR ────────────────────────
// Adds a narrative transition before CTA/partner blocks that appear abruptly
export function addPartnerTransitions(html) {
  let out = html;
  let fixCount = 0;

  const transitionHtml = '<p style="font-size:0.9rem;color:#6b7280;margin-bottom:0.5rem;">🔗 <em>Avant de continuer, un outil qui peut t\u2019aider :</em></p>';

  // Match partner/CTA blocks by class
  const classPattern = /(<(?:div|section)[^>]*class="[^"]*fv-(?:partner|cta|affiliate|widget)[^"]*"[^>]*>)/gi;
  out = out.replace(classPattern, (match) => {
    const idx = out.indexOf(match);
    if (idx > 0) {
      const before = out.slice(Math.max(0, idx - 300), idx);
      if (/(?:outil|avant de continuer|peut t.aider|en parallèle|côté pratique)[^<]{0,50}$/i.test(before)) {
        return match;
      }
    }
    fixCount++;
    return transitionHtml + '\n' + match;
  });

  // Match H3 with partner text
  const h3Pattern = /(<h3[^>]*>\s*(?:Comparer les vols|Utile si tu|Liens? partenaires?)[^<]*<\/h3>)/gi;
  out = out.replace(h3Pattern, (match) => {
    const idx = out.indexOf(match);
    if (idx > 0) {
      const before = out.slice(Math.max(0, idx - 300), idx);
      if (/(?:outil|avant de continuer|peut t.aider|en parallèle|côté pratique)[^<]{0,50}$/i.test(before)) {
        return match;
      }
    }
    fixCount++;
    return transitionHtml + '\n' + match;
  });

  // Also handle "Liens partenaires" as H2 headings
  const h2Pattern = /(<h2[^>]*>\s*Liens?\s*partenaires?[^<]*<\/h2>)/gi;
  out = out.replace(h2Pattern, (match) => {
    const idx = out.indexOf(match);
    if (idx > 0) {
      const before = out.slice(Math.max(0, idx - 300), idx);
      if (/(?:outil|avant de continuer|peut t.aider|en parallèle|côté pratique)[^<]{0,50}$/i.test(before)) {
        return match;
      }
    }
    fixCount++;
    return transitionHtml + '\n' + match;
  });

  if (fixCount > 0) {
    console.log(`🔗 PARTNER_TRANSITIONS: ${fixCount} transition(s) added before CTA/partner blocks`);
  }
  return out;
}

// ─── BLOCKQUOTE DUPLICATE TITLE CLEANER ─────────────────────
// Fixes Reddit blockquotes where the post title is duplicated at the start
export function cleanBlockquoteDuplicates(html) {
  let out = html;
  let fixCount = 0;

  out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, inner) => {
    let cleaned = inner;

    cleaned = cleaned.replace(/<p>([^<]+)<\/p>/g, (pMatch, pText) => {
      const trimmed = pText.trim();
      if (trimmed.length < 30) return pMatch;

      // Check if first ~50 chars repeat later in the same text
      const first50 = trimmed.slice(0, 50).replace(/[^a-zA-Z\u00c0-\u017f0-9\s]/g, '').trim().toLowerCase();
      if (first50.length < 15) return pMatch;

      const rest = trimmed.slice(50).toLowerCase();
      const searchStr = first50.slice(0, 30);
      const repeatIdx = rest.indexOf(searchStr);

      if (repeatIdx >= 0 && repeatIdx < 100) {
        const dupStart = 50 + repeatIdx;
        const fixedText = trimmed.slice(dupStart).trim();
        fixCount++;
        return '<p>' + fixedText.charAt(0).toUpperCase() + fixedText.slice(1) + '</p>';
      }

      // Also check: Title Case text followed by same text in lower case
      const words = trimmed.split(/\s+/);
      if (words.length >= 8) {
        const halfLen = Math.floor(words.length / 2);
        const firstHalf = words.slice(0, halfLen).join(' ').toLowerCase().replace(/[^a-z\u00e0-\u017f0-9\s]/g, '');
        const secondHalf = words.slice(halfLen, halfLen * 2).join(' ').toLowerCase().replace(/[^a-z\u00e0-\u017f0-9\s]/g, '');

        if (firstHalf.length > 15 && secondHalf.length > 15) {
          const common = firstHalf.split(' ').filter(w => secondHalf.includes(w)).length;
          const total = firstHalf.split(' ').length;
          if (common / total > 0.7) {
            const remaining = words.slice(halfLen).join(' ');
            fixCount++;
            return '<p>' + remaining.charAt(0).toUpperCase() + remaining.slice(1) + '</p>';
          }
        }
      }

      return pMatch;
    });

    if (cleaned !== inner) {
      return match.replace(inner, cleaned);
    }
    return match;
  });

  if (fixCount > 0) {
    console.log(`🧹 BLOCKQUOTE_DEDUP: ${fixCount} duplicated title(s) cleaned in blockquotes`);
  }
  return out;
}

// ─── FAQ UI UPGRADER ────────────────────────────────────────
// Converts old-style <details><summary>Q</summary><p>A</p></details> to new fv-faq-item format
export function upgradeFaqUI(html) {
  let out = html;
  let fixCount = 0;

  // Match bare <details> NOT already inside fv-faq-item
  out = out.replace(/<details(?:\s+class="wp-block-details")?\s*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*(?:<div[^>]*>)?\s*<p[^>]*>([\s\S]*?)<\/p>\s*(?:<\/div>)?\s*<\/details>/gi, (match, question, answer, offset) => {
    // Skip if already wrapped in fv-faq-item
    const before = out.slice(Math.max(0, offset - 100), offset);
    if (before.includes('fv-faq-item')) return match;

    // Strip strong/em from question
    const cleanQ = question.replace(/<(?:strong|em|b|i)[^>]*>(.*?)<\/(?:strong|em|b|i)>/gi, '$1').trim();
    const cleanA = answer.trim();

    fixCount++;
    return '<div class="fv-faq-item" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:0.75rem;overflow:hidden;">\n' +
      '  <details style="padding:0;">\n' +
      '    <summary style="padding:1rem 1.2rem;cursor:pointer;font-weight:600;font-size:1rem;list-style:none;display:flex;justify-content:space-between;align-items:center;">\n' +
      '      ' + cleanQ + '\n' +
      '      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink:0;transition:transform 0.2s;"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6b7280" stroke-width="2" stroke-linecap="round"/></svg>\n' +
      '    </summary>\n' +
      '    <div style="padding:0 1.2rem 1rem;color:#4b5563;line-height:1.6;">' + cleanA + '</div>\n' +
      '  </details>\n' +
      '</div>';
  });

  // Inject FAQ CSS if we upgraded any items and CSS not already present
  if (fixCount > 0 && !out.includes('.fv-faq-item details[open] summary svg')) {
    const faqCss = '<style>\n.fv-faq-item details[open] summary svg { transform: rotate(180deg); }\n.fv-faq-item summary::-webkit-details-marker { display: none; }\n.fv-faq-item summary::marker { display: none; }\n</style>\n';
    const firstIdx = out.indexOf('fv-faq-item');
    if (firstIdx > 0) {
      const insertBefore = out.lastIndexOf('<', firstIdx);
      if (insertBefore > 0) {
        out = out.slice(0, insertBefore) + faqCss + out.slice(insertBefore);
      }
    }
    console.log(`🆙 FAQ_UI_UPGRADE: ${fixCount} FAQ item(s) upgraded to new accordion UI`);
  }

  return out;
}

// ─── EDITORIAL CONTRACT INJECTOR ────────────────────────────
// Injects a short editorial contract paragraph if missing from the intro
export function injectEditorialContract(html) {
  let out = html;

  // Check if editorial contract already present in intro (before first H2)
  const introZone = (out.match(/^[\s\S]*?<h2/i) || [''])[0];
  if (/(?:recoup|analys|pluch|synth)/i.test(introZone) && /(?:témoignage|voyageur|retour|forum)/i.test(introZone)) {
    return out; // Editorial contract already present
  }

  // Extract N from byline
  const bylineMatch = out.match(/retours?\s+de\s+(?:<[^>]+>)*(\d+)\s*contributions?/i)
    || out.match(/(\d+)\s*contributions?/i);
  let N = bylineMatch ? parseInt(bylineMatch[1], 10) : 8;
  if (N <= 1) N = 8;

  // Find the 3rd or 4th </p> tag before the first H2
  const firstH2Pos = out.indexOf('<h2');
  if (firstH2Pos < 0) return out;

  let pCount = 0;
  let insertPos = -1;
  const pEndRegex = /<\/p>/gi;
  let pMatch;
  while ((pMatch = pEndRegex.exec(out)) !== null) {
    if (pMatch.index > firstH2Pos) break;
    pCount++;
    if (pCount === 3 || pCount === 4) {
      insertPos = pMatch.index + pMatch[0].length;
    }
  }

  if (insertPos < 0) return out;

  const contract = '\n<p><strong>Pour cet article, on a recoupé les retours de ' + N + ' voyageurs et expatriés sur les forums.</strong> Le but\u00a0: extraire les galères réelles, les vrais chiffres, et les solutions qui marchent.</p>\n';

  out = out.slice(0, insertPos) + contract + out.slice(insertPos);
  console.log('📝 EDITORIAL_CONTRACT: injected after paragraph ' + pCount);
  return out;
}



// --- FIX v3: DEDUPLICATE CTA INTROS IN AFFILIATE MODULES ---
export function deduplicateCtaIntros(html) {
  let out = html;
  let fixCount = 0;
  // Extract all <p>...</p> blocks with their positions
  const pRegex = /<p[^>]*>(?:(?!<\/p>)[\s\S])*<\/p>/gi;
  const blocks = [];
  let m;
  while ((m = pRegex.exec(out)) !== null) {
    blocks.push({ html: m[0], index: m.index, len: m[0].length });
  }
  // Compare adjacent blocks
  const toRemove = [];
  for (let i = 1; i < blocks.length; i++) {
    const norm1 = blocks[i-1].html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const norm2 = blocks[i].html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (norm1 === norm2 && norm1.length > 10) {
      // Check they are truly adjacent (only whitespace between them)
      const gap = out.slice(blocks[i-1].index + blocks[i-1].len, blocks[i].index);
      if (/^\s*$/.test(gap)) {
        toRemove.push(blocks[i]);
        fixCount++;
      }
    }
  }
  // Remove from end to start to preserve indices
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const b = toRemove[i];
    out = out.slice(0, b.index) + out.slice(b.index + b.len);
  }
  if (fixCount > 0) console.log('\ud83d\udd01 DEDUP_CTA: ' + fixCount + ' duplicate CTA intro(s) removed');
  return out;
}

// --- FIX v3: REMOVE ENGLISH PHRASES IN FRENCH QUOTES ---
export function removeEnglishInQuotes(html) {
  let out = html;
  let fixCount = 0;
  // Match "Celui qui a X" where X is a quoted English phrase
  out = out.replace(/Celui qui a\s*[\u00ab\u201c"][^\u00bb\u201d"]{5,}[\u00bb\u201d"]/gi, (m) => {
    const inner = m.replace(/^[^\u00ab\u201c"]*[\u00ab\u201c"]|[\u00bb\u201d"]$/g, '');
    const words = inner.trim().split(/\s+/);
    const eng = /^(the|is|are|was|were|have|has|had|been|will|would|could|should|can|do|does|did|not|but|and|or|for|with|from|this|that|what|how|you|your|my|I|a|an|of|to|in|on|at|by|as|if|so|no|up|out|just|about|also|too|even|still|already|now|need|want|help|trip|travel|solo|first|time|day|night|get|go|come|take|make|know|think|see|find|try|along|over|all|way|years?|anything|been|epic|motorcycle|border|nomad|nomading|me|ask|run|its|it|he|she|we|they|move|live|stay)$/i;
    const engCount = words.filter(w => eng.test(w)).length;
    if (engCount / words.length > 0.4) { fixCount++; return ''; }
    return m;
  });
  // Also remove raw English long phrases inside guillemets
  out = out.replace(/[\u00ab\u201c"]([A-Z][a-zA-Z\s',-]{20,})[\u00bb\u201d"]/g, (m, inner) => {
    const frChars = (inner.match(/[\u00e0-\u00ff]/g) || []).length;
    if (frChars < 2 && inner.split(/\s+/).length > 4) { fixCount++; return ''; }
    return m;
  });
  // Clean orphaned "sait que" after removing the subject
  out = out.replace(/<p[^>]*>\s*sait que\b[^<]*<\/p>/gi, '');
  out = out.replace(/<p[^>]*>\s*<\/p>/g, '');
  if (fixCount > 0) console.log('\ud83c\uddec\ud83c\udde7 ENGLISH_QUOTES: ' + fixCount + ' English quote(s) removed');
  return out;
}

// --- FIX v3: REPAIR BROKEN HTML ---
export function repairBrokenHtml(html) {
  let out = html;
  let fixCount = 0;
  // Fix common encoding breaks
  out = out.replace(/irrempla\s+[\u00e7c]able/gi, () => { fixCount++; return 'irremplaçable'; });
  // Fix view Box -> viewBox in SVG attributes
  out = out.replace(/view Box/g, () => { fixCount++; return 'viewBox'; });
  // Remove <p> containing just "< " or similar truncated HTML
  out = out.replace(/<p[^>]*>\s*<\s*\n?/g, () => { fixCount++; return ''; });
  // Remove <li> with broken content like <p>< 
  out = out.replace(/<li[^>]*>[\s\S]*?<p[^>]*>\s*<\s*<\/li>/gi, () => { fixCount++; return ''; });
  // Remove <li> that are clearly incomplete (end without punctuation, short content)
  out = out.replace(/<li>([^<]*)<\/li>/g, (match, content) => {
    const trimmed = content.trim();
    // If it's just whitespace or very short non-sentence
    if (trimmed.length < 5 && !/[.!?:]$/.test(trimmed)) { fixCount++; return ''; }
    return match;
  });
  // Ensure unclosed ul/ol get closed
  const openUl = (out.match(/<ul[^>]*>/gi) || []).length;
  const closeUl = (out.match(/<\/ul>/gi) || []).length;
  if (openUl > closeUl) {
    const lastLi = out.lastIndexOf('</li>');
    if (lastLi > 0) {
      const after = out.slice(lastLi + 5, lastLi + 50);
      if (!after.includes('</ul>') && !after.includes('</ol>')) {
        out = out.slice(0, lastLi + 5) + '\n</ul>' + out.slice(lastLi + 5);
        fixCount++;
      }
    }
  }
  // Ensure unclosed ol
  const openOl = (out.match(/<ol[^>]*>/gi) || []).length;
  const closeOl = (out.match(/<\/ol>/gi) || []).length;
  if (openOl > closeOl) {
    const lastLi = out.lastIndexOf('</li>');
    if (lastLi > 0) {
      out = out.slice(0, lastLi + 5) + '\n</ol>' + out.slice(lastLi + 5);
      fixCount++;
    }
  }
  if (fixCount > 0) console.log('\ud83d\udd27 HTML_REPAIR: ' + fixCount + ' broken element(s) fixed');
  return out;
}

// --- FIX v3: NORMALIZE TESTIMONIAL COUNT ---
export function normalizeTestimonialCount(html) {
  let out = html;
  const bannerMatch = out.match(/Synth[e\u00e8]se de (\d+) t[e\u00e9]moignages?/i);
  const bylineMatch = out.match(/retours?\s+de\s+(?:<[^>]+>)*(\d+)\s*contributions?/i);
  const bannerN = bannerMatch ? parseInt(bannerMatch[1], 10) : null;
  const bylineN = bylineMatch ? parseInt(bylineMatch[1], 10) : null;
  let realN = Math.max(bannerN || 0, bylineN || 0);
  if (realN < 5) realN = 8;
  if (bylineN && bylineN !== realN) {
    out = out.replace(
      /retours?\s+de\s+(?:<[^>]+>)*\d+\s*contributions?/i,
      'retours de <strong>' + realN + ' contributions</strong>'
    );
    console.log('\ud83d\udcca TESTIMONIAL_COUNT: byline updated ' + bylineN + ' -> ' + realN);
  }
  if (bannerN && bannerN !== realN) {
    out = out.replace(
      /Synth[e\u00e8]se de \d+ t[e\u00e9]moignages?/i,
      'Synth\u00e8se de ' + realN + ' t\u00e9moignages'
    );
  }
  return out;
}

// --- FIX v3: REPAIR TRUNCATED FAQ ANSWERS ---
export function repairTruncatedFaqAnswers(html) {
  let out = html;
  let fixCount = 0;
  // Match FAQ answer divs and check for truncation signs
  out = out.replace(/(<div[^>]*style="[^"]*padding[^"]*color[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*<\/details>)/gi, (match, prefix, answer, suffix) => {
    const text = answer.replace(/<[^>]+>/g, '').trim();
    if (text.length < 20) return match;
    const truncated = /\([^)]*$/.test(text) ||
      /[a-z\u00e9\u00e8\u00ea\u00e0\u00f9],?\s*$/.test(text) ||
      /(le |la |les |de |du |des |un |une )\s*$/.test(text);
    if (truncated) {
      fixCount++;
      let fixed = answer;
      fixed = fixed.replace(/\s*\([^)]*$/, '.');
      fixed = fixed.replace(/\s+(le|la|les|de|du|des|un|une)\s*$/i, '.');
      if (!/[.!?]\s*(<\/p>)?\s*$/.test(fixed)) {
        fixed = fixed.replace(/\s*$/, '.');
      }
      return prefix + fixed + suffix;
    }
    return match;
  });
  if (fixCount > 0) console.log('\ud83d\udcdd FAQ_TRUNCATION: ' + fixCount + ' truncated answer(s) repaired');
  return out;
}


// --- FIX v4: REPAIR MISSING OPENING TAGS ---
// LLM sometimes generates "cite>" instead of "<cite>", "small>" instead of "<small>", etc.
export function repairMissingOpenTags(html) {
  let out = html;
  let fixCount = 0;
  // Fix missing < in opening tags: "cite>" -> "<cite>", "small>" -> "<small>", "strong>" -> "<strong>"
  // Only match when preceded by whitespace, newline, or > (not part of another tag)
  const tags = ['cite', 'small', 'strong', 'em', 'b', 'i', 'a'];
  for (const tag of tags) {
    // Match "tag>" at start of content (after > or whitespace), not already preceded by <
    const re = new RegExp('(?<=[>\\s])(' + tag + '>)', 'g');
    out = out.replace(re, (match) => {
      fixCount++;
      return '<' + match;
    });
    // Also fix the closing variant: "/tag>" -> "</tag>"
    const reClose = new RegExp('(?<=[>\\s])/' + tag + '>', 'g');
    out = out.replace(reClose, (match) => {
      fixCount++;
      return '<' + match;
    });
  }
  // Fix "p>" at start of line
  out = out.replace(/^p>/gm, () => { fixCount++; return '<p>'; });
  // Fix broken </svg> like ">/svg>" or "/svg>"
  out = out.replace(/>\s*\/svg>/gi, () => { fixCount++; return '</svg>'; });
  out = out.replace(/(?<![<])\/svg>/gi, () => { fixCount++; return '</svg>'; });
  if (fixCount > 0) console.log('\ud83c\udff7\ufe0f OPEN_TAGS: ' + fixCount + ' missing opening tag(s) repaired');
  return out;
}

// --- FIX v4: STRIP HTML COMMENT DIRECTIVES ---
// Remove internal pipeline comments like <!-- FV: DIFF_ANGLE -->, <!-- FV: CTA_SLOT ... -->
export function stripHtmlComments(html) {
  let out = html;
  let fixCount = 0;
  // Remove FV pipeline comments
  out = out.replace(/<!--\s*FV:[^>]*-->/gi, () => { fixCount++; return ''; });
  // Remove empty paragraphs containing only whitespace or comments
  out = out.replace(/<p[^>]*>\s*<\/p>/g, '');
  if (fixCount > 0) console.log('\ud83e\uddf9 HTML_COMMENTS: ' + fixCount + ' pipeline comment(s) stripped');
  return out;
}

// --- FIX v4: FIX WORD COLLISIONS FROM WORD_GLUE ---
export function fixWordCollisions(html) {
  let out = html;
  let fixCount = 0;
  
  // Strategy: Find consonant directly followed by accented vowel starting a new word
  // This is the universal pattern for word_glue collisions
  // Safe pattern: only split between known word-ending consonants and accent-starting words
  
  // Common French word endings that collide with accent-starting words
  // dois+é, des+é, ton+é, son+é, mon+é, un+é, Il+é, sont+é, ont+é, est+é, pas+é, plus+é, très+é
  // et+ê, pour+ê, tout+à, mais+à, pas+à
  
  const splits = [
    // consonant or s/t/n ending + \u00e9 (é)
    [/\bdois(\u00e9)/gi, 'dois $1'],
    [/\bdes(\u00e9)/gi, 'des $1'],
    [/\bton(\u00e9)/gi, 'ton $1'],
    [/\bson(\u00e9)/gi, 'son $1'],
    [/\bmon(\u00e9)/gi, 'mon $1'],
    [/\bun(\u00e9)/gi, 'un $1'],
    [/\bIl(\u00e9)/gi, 'Il $1'],
    [/\bsont(\u00e9)/gi, 'sont $1'],
    [/\bont(\u00e9)/gi, 'ont $1'],
    [/\best(\u00e9)/gi, 'est $1'],
    [/\bpas(\u00e9)/gi, 'pas $1'],
    [/\bplus(\u00e9)/gi, 'plus $1'],
    [/\btr\u00e8s(\u00e9)/gi, 'tr\u00e8s $1'],
    [/\bces(\u00e9)/gi, 'ces $1'],
    [/\bles(\u00e9)/gi, 'les $1'],
    // + \u00ea (ê)
    [/\bet(\u00ea)/gi, 'et $1'],
    [/\bpour(\u00ea)/gi, 'pour $1'],
    // + \u00e0 (à)
    [/\btout(\u00e0)/gi, 'tout $1'],
    [/\bmais(\u00e0)/gi, 'mais $1'],
    [/\bpas(\u00e0)/gi, 'pas $1'],
    // Specific known words
    [/bien-\s+\u00eatre/gi, 'bien-\u00eatre'],
    [/pers\s+\u00e9v\u00e9rance/gi, 'pers\u00e9v\u00e9rance'],
    [/peut\s?\u00eatre/gi, 'peut-\u00eatre'],
    [/peut\u00eatre/gi, 'peut-\u00eatre'],
    [/cet\u00e2ge/gi, 'cet \u00e2ge'],
  ];
  
  for (const [pattern, replacement] of splits) {
    const before = out;
    out = out.replace(pattern, replacement);
    if (out !== before) fixCount++;
  }
  
  // Fix double </strong>
  out = out.replace(/<\/strong><\/strong>/g, () => { fixCount++; return '</strong>'; });
  // Fix "forums de voyageurs Nam" in body
  out = out.replace(/forums de voyageurs Nam/g, () => { fixCount++; return 'forums de voyageurs'; });
  
  if (fixCount > 0) console.log('\ud83e\udde9 WORD_COLLISIONS: ' + fixCount + ' collision(s) fixed');
  return out;
}

// --- FIX v4: REMOVE EMPTY FAQ ENTRIES ---
// Catches FAQ items with empty or near-empty answers, including bare <details> without answer div
export function removeEmptyFaqItems(html) {
  let out = html;
  let fixCount = 0;
  // Remove fv-faq-item wrappers with empty answer
  out = out.replace(/<div class="fv-faq-item"[^>]*>[\s\S]*?<\/details>\s*<\/div>/gi, (match) => {
    // Extract answer content
    const answerMatch = match.match(/<div[^>]*>([\s\S]*?)<\/div>\s*<\/details>/);
    if (answerMatch) {
      const text = answerMatch[1].replace(/<[^>]+>/g, '').trim();
      if (text.length < 10) { fixCount++; return ''; }
    }
    return match;
  });
  // Remove bare <details> with no answer content
  out = out.replace(/<details>\s*<summary>[^<]*<\/summary>\s*<\/details>/gi, () => {
    fixCount++;
    return '';
  });
  if (fixCount > 0) console.log('\ud83d\uddd1\ufe0f EMPTY_FAQ: ' + fixCount + ' empty FAQ item(s) removed');
  return out;
}

// --- FIX v4: REPAIR BROKEN AUTHOR BOX LINKS ---
export function repairAuthorBoxLinks(html) {
  let out = html;
  let fixCount = 0;
  // Fix "a href=" without opening < (multiple contexts)
  out = out.replace(/([>\s])a href=/g, (m, pre) => { fixCount++; return pre + '<a href='; });
  // Fix HTML entities in attributes: &#8221; -> "
  out = out.replace(/&#8221;/g, () => { fixCount++; return '"'; });
  // Fix &#8220; -> "
  out = out.replace(/&#8220;/g, () => { fixCount++; return '"'; });
  if (fixCount > 0) console.log('\ud83d\udd17 AUTHOR_BOX: ' + fixCount + ' broken link(s) repaired');
  return out;
}

// --- FIX v5: EXTENDED ENCODING BREAK DICTIONARY ---
export function fixExtendedEncodingBreaks(html) {
  let out = html;
  let fixCount = 0;
  // Common French words that get split by tokenizer
  const dict = [
    [/ant\s+[\u00e9e]c[\u00e9e]dents?/gi, m => { fixCount++; return m.replace(/ant\s+/, 'ant'); }],
    [/mon\s+[\u00e9e]taires?/gi, m => { fixCount++; return m.replace(/mon\s+/, 'mon'); }],
    [/cet\s*[\u00e2a]ge/gi, m => { fixCount++; return m.replace(/cet\s*/, 'cet '); }],
    [/exp[\u00e9e]riment[\u00e9e]s[\u00e9e]noncent/gi, () => { fixCount++; return 'exp\u00e9riment\u00e9s \u00e9noncent'; }],
    [/pers\s+[\u00e9e]v[\u00e9e]rance/gi, () => { fixCount++; return 'pers\u00e9v\u00e9rance'; }],
    [/bien-\s+[\u00ea]tre/gi, () => { fixCount++; return 'bien-\u00eatre'; }],
    [/inqu\s*i[\u00e9e]tude/gi, () => { fixCount++; return 'inqui\u00e9tude'; }],
    [/int\s*[\u00e9e]rioriser/gi, () => { fixCount++; return 'int\u00e9rioriser'; }],
    [/d\s*[\u00e9e]sagr[\u00e9e]able/gi, () => { fixCount++; return 'd\u00e9sagr\u00e9able'; }],
    [/r\s*[\u00e9e]cup[\u00e9e]rer/gi, () => { fixCount++; return 'r\u00e9cup\u00e9rer'; }],
    [/s\s*[\u00e9e]curit[\u00e9e]/gi, () => { fixCount++; return 's\u00e9curit\u00e9'; }],
    [/n\s*[\u00e9e]cessaire/gi, () => { fixCount++; return 'n\u00e9cessaire'; }],
    [/pr\s*[\u00e9e]voir/gi, () => { fixCount++; return 'pr\u00e9voir'; }],
  ];
  for (const [pattern, replacer] of dict) {
    out = out.replace(pattern, replacer);
  }
  // Generic: fix "X \u00e9Y" patterns where X is 2-4 chars (common prefix before accented vowel)
  out = out.replace(/\b([a-z]{2,4})\s+([\u00e9\u00e8\u00ea\u00e0\u00f9\u00ee\u00f4\u00fb\u00e7][a-z\u00e0-\u00ff]{3,})/gi, (m, prefix, rest) => {
    // Check if joined form is a plausible French word (no double vowels at junction)
    const joined = prefix + rest;
    // Allow only if the prefix ends with a consonant
    if (/[bcdfghjklmnpqrstvwxyz]$/i.test(prefix)) {
      fixCount++;
      return joined;
    }
    return m;
  });
  if (fixCount > 0) console.log('\ud83d\udd24 EXT_ENCODING: ' + fixCount + ' extended encoding break(s) fixed');
  return out;
}

// --- FIX v5: CLEAN EM DASH HTML ENTITIES ---
export function cleanEmDashEntities(html) {
  let out = html;
  let fixCount = 0;
  // Remove standalone &#8212; (em dash) paragraphs
  out = out.replace(/<p[^>]*>\s*&#8212;\s*<\/p>/gi, () => { fixCount++; return ''; });
  out = out.replace(/<p[^>]*>\s*\u2014\s*<\/p>/gi, () => { fixCount++; return ''; });
  // Replace inline &#8212; with : or nothing
  out = out.replace(/\s*&#8212;\s*/g, () => { fixCount++; return ' '; });
  if (fixCount > 0) console.log('\u2014 EM_DASH_ENTITIES: ' + fixCount + ' em dash entit(ies) cleaned');
  return out;
}

// --- FIX v5: REPAIR FAQ SVG TAGS ---
// LLM generates broken SVG in FAQ: missing <path>, broken closing tags, unclosed opening tag
export function repairFaqSvg(html) {
  let out = html;
  let fixCount = 0;
  const goodSvg = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink:0;transition:transform 0.2s;"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Pattern 1: <svg ...view Box..."</svg> (unclosed opening tag, no path)
  out = out.replace(/<svg[^]*?view\s*Box[^]*?"<\/svg>/gi, () => {
    fixCount++;
    return goodSvg;
  });
  // Pattern 2: <svg ...viewBox...></svg> (closed but no path)
  out = out.replace(/<svg[^>]*viewBox[^>]*>\s*<\/svg>/gi, () => {
    fixCount++;
    return goodSvg;
  });
  // Pattern 3: <svg ...>/svg> (broken close)
  out = out.replace(/<svg[^>]*view\s*Box[^>]*>[^<]*\/svg>/gi, () => {
    fixCount++;
    return goodSvg;
  });
  if (fixCount > 0) console.log('\ud83c\udfa8 FAQ_SVG: ' + fixCount + ' broken SVG(s) repaired');
  return out;
}

// --- FIX v5: CLEAN FV-AUTHORITY-MOVE DIVS ---
// These are internal pipeline markers that should not appear in final output
export function cleanAuthorityMoves(html) {
  let out = html;
  let fixCount = 0;
  out = out.replace(/<div[^>]*class="fv-authority-move"[^>]*>[\s\S]*?<\/div>/gi, () => {
    fixCount++;
    return '';
  });
  if (fixCount > 0) console.log('\ud83e\uddf9 AUTHORITY_MOVES: ' + fixCount + ' internal marker(s) removed');
  return out;
}

// --- FIX v5: FIX BROKEN REDDIT URL IN AUTHOR BOX ---
export function fixBrokenRedditUrls(html) {
  let out = html;
  let fixCount = 0;
  // Fix URLs where "r/VietNam" was replaced by "les forums de voyageurs Nam" in URLs
  out = out.replace(/reddit\.com\/les forums de voyageurs([^"\s]*)/gi, (m, rest) => {
    fixCount++;
    return 'reddit.com/r/vietnam' + rest;
  });
  // Fix "Viet Nam" in URLs
  out = out.replace(/reddit\.com\/r\/Viet\s+Nam/gi, () => {
    fixCount++;
    return 'reddit.com/r/Vietnam';
  });
  if (fixCount > 0) console.log('\ud83d\udd17 REDDIT_URL: ' + fixCount + ' broken Reddit URL(s) fixed');
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
  c = fixSlugSentenceLinks(c);
  c = fixSlugAnchors(c);
  c = fixNestedLinks(c);
  c = cleanBlockquoteContent(c);
  c = smartenFrenchApostrophes(c);
  c = fixFaqCountryGrammar(c);
  c = fixSmartQuoteSpaces(c);
  c = capExcessiveH2s(c);
  c = cleanAiTells(c);
  c = fixTruncatedH2s(c);
  c = removeEnglishLeaks(c);
  c = limitSiTuSentences(c);
  c = fixTruncatedSentences(c);
  c = fixBrokenInternalLinkText(c);
  c = validateFaqAnswers(c);
  c = fixFaqFormatting(c);
  c = fixDestinationPlaceholders(c);
  c = deduplicateRedditAttributions(c);
  c = cleanConclusionSlugs(c);
  c = fixSlugLeaksInQuotes(c);
  c = cleanQuestionsOuvertes(c);
  c = fixTruncatedFragments(c);
  c = stripRedditFromBody(c);
  c = replaceEmDashes(c);
  c = fixBrandNames(c);
  // v2 fixers
  c = convertToEuros(c);
  c = fixPartnerDestinationMismatch(c);
  c = deduplicateParagraphs(c);
  c = injectSourceBanner(c);
  c = injectEditorialContract(c);
  c = addPartnerTransitions(c);
  c = cleanBlockquoteDuplicates(c);
  c = upgradeFaqUI(c);
  // v3 fixers
  c = deduplicateCtaIntros(c);
  c = removeEnglishInQuotes(c);
  c = repairBrokenHtml(c);
  c = normalizeTestimonialCount(c);
  c = repairTruncatedFaqAnswers(c);
  // v4 fixers
  c = repairMissingOpenTags(c);
  c = stripHtmlComments(c);
  c = removeEmptyFaqItems(c);
  c = repairAuthorBoxLinks(c);
  // v5 fixers
  c = fixExtendedEncodingBreaks(c);
  c = fixWordCollisions(c); // must run AFTER encoding fixes
  c = cleanEmDashEntities(c);
  c = repairFaqSvg(c);
  c = cleanAuthorityMoves(c);
  c = fixBrokenRedditUrls(c);
  // Clean data-fv attributes from remaining elements
  c = c.replace(/<p[^>]*data-fv-[^>]*class="fv-authority-move"[^>]*>[\s\S]*?<\/p>/gi, "");
  c = c.replace(/ data-fv-(?:proof|move)="[^"]*"/gi, "");
  return c;
}

