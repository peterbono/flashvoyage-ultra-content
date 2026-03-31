/**
 * Versus Script Generator — FlashVoyage Reels v2
 *
 * Generates "VERSUS" comparison content from article data.
 * Uses Claude Haiku to extract two destinations and comparison categories.
 *
 * Output structure:
 * {
 *   type: 'versus',
 *   destA: { name: string, flag: string, pexelsQuery: string },
 *   destB: { name: string, flag: string, pexelsQuery: string },
 *   rows: Array<{ label: string, left: string, right: string }>,
 *   caption: string,
 *   hashtags: string[]
 * }
 */

import { createTrackedClient } from '../../tracked-anthropic.js';

// ── Lazy Anthropic client ───────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('versus-generator');
  return _client;
}

// ── Country flag mapping (common SE Asia + popular destinations) ─────────

const FLAG_MAP = {
  'thailande': '🇹🇭', 'thailand': '🇹🇭', 'thai': '🇹🇭', 'bangkok': '🇹🇭', 'chiang mai': '🇹🇭', 'phuket': '🇹🇭',
  'vietnam': '🇻🇳', 'viet nam': '🇻🇳', 'hanoi': '🇻🇳', 'ho chi minh': '🇻🇳',
  'indonesie': '🇮🇩', 'indonesia': '🇮🇩', 'bali': '🇮🇩', 'jakarta': '🇮🇩', 'lombok': '🇮🇩',
  'cambodge': '🇰🇭', 'cambodia': '🇰🇭', 'siem reap': '🇰🇭', 'phnom penh': '🇰🇭',
  'laos': '🇱🇦', 'luang prabang': '🇱🇦', 'vientiane': '🇱🇦',
  'myanmar': '🇲🇲', 'birmanie': '🇲🇲',
  'malaisie': '🇲🇾', 'malaysia': '🇲🇾', 'kuala lumpur': '🇲🇾',
  'singapour': '🇸🇬', 'singapore': '🇸🇬',
  'philippines': '🇵🇭', 'manille': '🇵🇭', 'cebu': '🇵🇭', 'palawan': '🇵🇭',
  'japon': '🇯🇵', 'japan': '🇯🇵', 'tokyo': '🇯🇵', 'kyoto': '🇯🇵', 'osaka': '🇯🇵',
  'coree': '🇰🇷', 'korea': '🇰🇷', 'coree du sud': '🇰🇷', 'seoul': '🇰🇷',
  'inde': '🇮🇳', 'india': '🇮🇳', 'goa': '🇮🇳', 'delhi': '🇮🇳', 'mumbai': '🇮🇳',
  'sri lanka': '🇱🇰',
  'nepal': '🇳🇵', 'népal': '🇳🇵', 'katmandou': '🇳🇵',
  'maldives': '🇲🇻',
  'chine': '🇨🇳', 'china': '🇨🇳', 'pekin': '🇨🇳', 'shanghai': '🇨🇳',
  'taiwan': '🇹🇼', 'taipei': '🇹🇼',
  'hong kong': '🇭🇰',
  'australie': '🇦🇺', 'australia': '🇦🇺', 'sydney': '🇦🇺', 'melbourne': '🇦🇺',
  'nouvelle-zelande': '🇳🇿', 'new zealand': '🇳🇿',
  'turquie': '🇹🇷', 'turkey': '🇹🇷', 'türkiye': '🇹🇷', 'istanbul': '🇹🇷',
  'grece': '🇬🇷', 'greece': '🇬🇷', 'grèce': '🇬🇷', 'athenes': '🇬🇷', 'santorin': '🇬🇷',
  'italie': '🇮🇹', 'italy': '🇮🇹', 'rome': '🇮🇹', 'venise': '🇮🇹',
  'espagne': '🇪🇸', 'spain': '🇪🇸', 'barcelone': '🇪🇸', 'madrid': '🇪🇸',
  'portugal': '🇵🇹', 'lisbonne': '🇵🇹',
  'maroc': '🇲🇦', 'morocco': '🇲🇦', 'marrakech': '🇲🇦',
  'mexique': '🇲🇽', 'mexico': '🇲🇽', 'cancun': '🇲🇽',
  'colombie': '🇨🇴', 'colombia': '🇨🇴', 'bogota': '🇨🇴', 'medellin': '🇨🇴',
  'perou': '🇵🇪', 'peru': '🇵🇪', 'pérou': '🇵🇪', 'lima': '🇵🇪', 'cusco': '🇵🇪',
  'egypte': '🇪🇬', 'egypt': '🇪🇬', 'égypte': '🇪🇬', 'le caire': '🇪🇬',
  'dubai': '🇦🇪', 'emirats': '🇦🇪', 'abu dhabi': '🇦🇪',
  'costa rica': '🇨🇷',
  'cuba': '🇨🇺', 'la havane': '🇨🇺',
  'croatie': '🇭🇷', 'croatia': '🇭🇷', 'dubrovnik': '🇭🇷',
  'tanzanie': '🇹🇿', 'zanzibar': '🇹🇿',
};

/**
 * Look up a country flag emoji from a destination string.
 * @param {string} destination
 * @returns {string} Flag emoji or generic globe
 */
function getFlag(destination) {
  const lower = (destination || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, flag] of Object.entries(FLAG_MAP)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalizedKey)) return flag;
  }
  return '🌍';
}

// ── Haiku prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un créateur de Reels voyage pour le média FlashVoyage (Instagram).
Tu génères du contenu "VERSUS" : comparaison visuelle de 2 destinations voyage.
Ton style est éditorial, factuel, concis. Accents français obligatoires (é, è, ê, à, ç, ù).
CRITIQUE : les données doivent être RÉALISTES et EXTRAITES de l'article, jamais inventées.
Les valeurs doivent être COURTES (max 25 caractères par cellule) pour tenir dans une infographie.`;

function buildUserPrompt(article) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 4000);
  const hook = article.hook || '';

  return `Depuis cet article, identifie les 2 destinations comparées et extrais les données de comparaison.

ARTICLE : ${title}
ACCROCHE : ${hook}
TEXTE : ${rawText}

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de texte avant/après) :
{
  "destA": {
    "name": "Nom destination A (FR, avec accents)",
    "pexelsQuery": "english pexels query for destination A travel footage"
  },
  "destB": {
    "name": "Nom destination B (FR, avec accents)",
    "pexelsQuery": "english pexels query for destination B travel footage"
  },
  "rows": [
    { "label": "BUDGET", "left": "1 200 €/2 sem", "right": "800 €/2 sem" },
    { "label": "VISA", "left": "Visa on arrival 30$", "right": "Exempt 30 jours" },
    { "label": "PÉRIODE", "left": "Avr-Oct", "right": "Nov-Mars" },
    { "label": "TOP SPOTS", "left": "Ubud, Uluwatu, Nusa", "right": "Bangkok, Chiang Mai" },
    { "label": "ACTIVITÉS", "left": "Surf, temples", "right": "Street food, muay thai" }
  ],
  "caption": "Destination A vs Destination B : tu choisis quoi ? 👇",
  "hashtags": ["#FlashVoyage", "#VsVoyage", "#Voyage", "..."]
}

RÈGLES :
- Exactement 5 lignes de comparaison dans "rows"
- Les 5 labels DOIVENT être (dans cet ordre) : "BUDGET", "VISA", "PÉRIODE", "TOP SPOTS", "ACTIVITÉS"
- CHAQUE valeur "left" et "right" : MAX 25 caractères, abrège si nécessaire
- Les prix en EUR avec "€"
- Les données DOIVENT être RÉALISTES, extraites ou déduites de l'article
- "pexelsQuery" : en anglais, vue pittoresque de la destination (ex: "bali temple rice terraces", "bangkok night market skyline")
- "caption" : format "[A] vs [B] : tu choisis quoi ? 👇" + détails comparatifs + "Commente ton choix !"
- "hashtags" : 6-7 hashtags dont #FlashVoyage et #VsVoyage en premier
- Accents français obligatoires partout (sauf les noms propres qui restent en langue originale)
- Si l'article ne compare pas 2 destinations clairement, identifie les 2 plus proéminentes`;
}

// ── Main generation function ────────────────────────────────────────────────

/**
 * Generate a Versus script from article data using Haiku.
 *
 * @param {Object} article - Article data { title, hook, rawText, keyStats, ... }
 * @returns {Promise<Object>} Versus script
 */
export async function generateVersusScript(article) {
  console.log(`[REEL/VERSUS] Generating script for: "${(article.title || '').slice(0, 60)}..."`);

  const client = getClient();
  if (!client) {
    console.warn('[REEL/VERSUS] ANTHROPIC_API_KEY not set — using fallback');
    return getFallbackScript(article);
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(article) }],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Haiku');

    // ── Parse JSON ──────────────────────────────────────────────────────────
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Haiku response');

    let jsonStr = jsonMatch[0];
    // Clean common LLM JSON issues
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');           // trailing commas
    jsonStr = jsonStr.replace(/,?\s*"\.\.\."\s*,?/g, '');      // "..." placeholders
    jsonStr = jsonStr.replace(/[\u201c\u201d\u00ab\u00bb]/g, '"'); // smart quotes

    let script;
    try {
      script = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn('[REEL/VERSUS] JSON parse failed, trying regex extraction...');
      script = extractManually(jsonStr);
    }

    // ── Validate & normalize ────────────────────────────────────────────────

    if (!script.destA || !script.destB || !script.rows || !Array.isArray(script.rows)) {
      throw new Error('Invalid script: missing destA, destB, or rows');
    }

    // Normalize destination objects
    const destA = {
      name: script.destA.name || script.destA || 'Destination A',
      flag: getFlag(script.destA.name || script.destA || ''),
      pexelsQuery: script.destA.pexelsQuery || `${script.destA.name || 'travel'} aerial landscape`,
    };

    const destB = {
      name: script.destB.name || script.destB || 'Destination B',
      flag: getFlag(script.destB.name || script.destB || ''),
      pexelsQuery: script.destB.pexelsQuery || `${script.destB.name || 'travel'} aerial landscape`,
    };

    // Expected row labels
    const expectedLabels = ['BUDGET', 'VISA', 'PÉRIODE', 'TOP SPOTS', 'ACTIVITÉS'];

    // Normalize rows: keep up to 5, enforce labels, truncate values
    const rows = script.rows.slice(0, 5).map((row, i) => ({
      label: expectedLabels[i] || row.label || `CRITÈRE ${i + 1}`,
      left: truncateValue(row.left || '—', 25),
      right: truncateValue(row.right || '—', 25),
    }));

    // Pad to 5 rows if fewer
    while (rows.length < 5) {
      const idx = rows.length;
      rows.push({
        label: expectedLabels[idx] || `CRITÈRE ${idx + 1}`,
        left: '—',
        right: '—',
      });
    }

    // Ensure hashtags
    const defaultTags = ['#FlashVoyage', '#VsVoyage', '#Voyage', '#ComparaisonVoyage'];
    const hashtags = Array.isArray(script.hashtags) && script.hashtags.length >= 3
      ? script.hashtags
      : defaultTags;

    // Ensure caption
    const caption = script.caption
      || `${destA.name} vs ${destB.name} : tu choisis quoi ? 👇\n\nCommente ton choix !`;

    // Final structure
    const result = {
      type: 'versus',
      destA,
      destB,
      rows,
      caption,
      hashtags,
    };

    console.log(`[REEL/VERSUS] Generated: "${destA.name}" vs "${destB.name}" — ${rows.length} comparison rows`);
    return result;

  } catch (err) {
    console.error(`[REEL/VERSUS] Generation failed: ${err.message}`);
    return getFallbackScript(article);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Truncate a value string to maxLen characters, adding ellipsis if needed.
 * @param {string} value
 * @param {number} maxLen
 * @returns {string}
 */
function truncateValue(value, maxLen) {
  if (!value) return '—';
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1) + '…';
}

// ── Regex fallback extraction ───────────────────────────────────────────────

function extractManually(jsonStr) {
  // Try to extract destination names
  const destANameMatch = jsonStr.match(/"destA"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
  const destBNameMatch = jsonStr.match(/"destB"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
  const destAPexelsMatch = jsonStr.match(/"destA"\s*:\s*\{[^}]*"pexelsQuery"\s*:\s*"([^"]+)"/);
  const destBPexelsMatch = jsonStr.match(/"destB"\s*:\s*\{[^}]*"pexelsQuery"\s*:\s*"([^"]+)"/);
  const captionMatch = jsonStr.match(/"caption"\s*:\s*"([^"]+)"/);

  const labelMatches = [...jsonStr.matchAll(/"label"\s*:\s*"([^"]+)"/g)];
  const leftMatches = [...jsonStr.matchAll(/"left"\s*:\s*"([^"]+)"/g)];
  const rightMatches = [...jsonStr.matchAll(/"right"\s*:\s*"([^"]+)"/g)];

  const destAName = destANameMatch ? destANameMatch[1] : 'Destination A';
  const destBName = destBNameMatch ? destBNameMatch[1] : 'Destination B';

  const rows = labelMatches.map((m, i) => ({
    label: m[1],
    left: leftMatches[i] ? leftMatches[i][1] : '—',
    right: rightMatches[i] ? rightMatches[i][1] : '—',
  }));

  return {
    destA: {
      name: destAName,
      pexelsQuery: destAPexelsMatch ? destAPexelsMatch[1] : `${destAName} aerial landscape`,
    },
    destB: {
      name: destBName,
      pexelsQuery: destBPexelsMatch ? destBPexelsMatch[1] : `${destBName} aerial landscape`,
    },
    rows,
    caption: captionMatch ? captionMatch[1] : `${destAName} vs ${destBName} : tu choisis quoi ? 👇`,
    hashtags: ['#FlashVoyage', '#VsVoyage', '#Voyage'],
  };
}

// ── Fallback when Haiku unavailable ─────────────────────────────────────────

function getFallbackScript(article) {
  const title = article.title || 'Bali vs Thaïlande';

  // Try to extract two destination names from title (common patterns: "X vs Y", "X ou Y")
  const vsMatch = title.match(/(.+?)\s*(?:vs\.?|versus|ou|contre)\s*(.+)/i);
  let destAName = 'Bali';
  let destBName = 'Thaïlande';

  if (vsMatch) {
    destAName = vsMatch[1].trim().replace(/^(comparer|comparaison)\s*/i, '');
    destBName = vsMatch[2].trim().replace(/[?!.:]+$/, '');
  }

  console.warn(`[REEL/VERSUS] Using fallback script: "${destAName}" vs "${destBName}"`);

  return {
    type: 'versus',
    destA: {
      name: destAName,
      flag: getFlag(destAName),
      pexelsQuery: `${destAName} travel landscape aerial`,
    },
    destB: {
      name: destBName,
      flag: getFlag(destBName),
      pexelsQuery: `${destBName} travel landscape aerial`,
    },
    rows: [
      { label: 'BUDGET', left: '1 200 €/2 sem', right: '800 €/2 sem' },
      { label: 'VISA', left: 'Visa on arrival', right: 'Exempt 30 jours' },
      { label: 'PÉRIODE', left: 'Avr-Oct', right: 'Nov-Mars' },
      { label: 'TOP SPOTS', left: 'Ubud, Uluwatu, Nusa', right: 'Bangkok, Chiang Mai' },
      { label: 'ACTIVITÉS', left: 'Surf, temples', right: 'Street food, îles' },
    ],
    caption: `${destAName} vs ${destBName} : tu choisis quoi ? 👇\n\nCommente ton choix !`,
    hashtags: ['#FlashVoyage', '#VsVoyage', '#Voyage', '#ComparaisonVoyage', '#TravelVs'],
  };
}
