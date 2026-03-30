/**
 * Trip Pick Script Generator — FlashVoyage Reels v2
 *
 * Generates "X SPOTS A NE PAS RATER" content from article data.
 * Uses Claude Haiku to extract 5 must-see spots per country/region.
 *
 * Output structure:
 * {
 *   type: 'trip_pick',
 *   country: string,
 *   spots: Array<{ name: string, detail: string, pexelsQuery: string }>,
 *   caption: string,
 *   hashtags: string[]
 * }
 */

import Anthropic from '@anthropic-ai/sdk';

// ── Lazy Anthropic client ───────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ── Country flag mapping (common SE Asia + popular destinations) ─────────

const FLAG_MAP = {
  'thailande': '🇹🇭', 'thailand': '🇹🇭', 'thai': '🇹🇭',
  'vietnam': '🇻🇳', 'viet nam': '🇻🇳',
  'indonesie': '🇮🇩', 'indonesia': '🇮🇩', 'bali': '🇮🇩',
  'cambodge': '🇰🇭', 'cambodia': '🇰🇭',
  'laos': '🇱🇦',
  'myanmar': '🇲🇲', 'birmanie': '🇲🇲',
  'malaisie': '🇲🇾', 'malaysia': '🇲🇾',
  'singapour': '🇸🇬', 'singapore': '🇸🇬',
  'philippines': '🇵🇭',
  'japon': '🇯🇵', 'japan': '🇯🇵',
  'coree': '🇰🇷', 'korea': '🇰🇷', 'coree du sud': '🇰🇷',
  'inde': '🇮🇳', 'india': '🇮🇳',
  'sri lanka': '🇱🇰',
  'nepal': '🇳🇵', 'népal': '🇳🇵',
  'maldives': '🇲🇻',
  'chine': '🇨🇳', 'china': '🇨🇳',
  'taiwan': '🇹🇼',
  'hong kong': '🇭🇰',
  'australie': '🇦🇺', 'australia': '🇦🇺',
  'nouvelle-zelande': '🇳🇿', 'new zealand': '🇳🇿',
  'turquie': '🇹🇷', 'turkey': '🇹🇷', 'türkiye': '🇹🇷',
  'grece': '🇬🇷', 'greece': '🇬🇷', 'grèce': '🇬🇷',
  'italie': '🇮🇹', 'italy': '🇮🇹',
  'espagne': '🇪🇸', 'spain': '🇪🇸',
  'portugal': '🇵🇹',
  'maroc': '🇲🇦', 'morocco': '🇲🇦',
  'mexique': '🇲🇽', 'mexico': '🇲🇽',
  'colombie': '🇨🇴', 'colombia': '🇨🇴',
  'perou': '🇵🇪', 'peru': '🇵🇪', 'pérou': '🇵🇪',
  'egypte': '🇪🇬', 'egypt': '🇪🇬', 'égypte': '🇪🇬',
  'dubai': '🇦🇪', 'emirats': '🇦🇪',
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
Tu génères du contenu "TRIP PICK" : 5 spots incontournables dans un pays ou une région.
Ton style est éditorial, factuel, concis. Accents français obligatoires (é, è, ê, à, ç, ù).`;

function buildUserPrompt(article) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 4000);
  const hook = article.hook || '';

  return `Depuis cet article, extrais les 5 spots/lieux incontournables.

ARTICLE : ${title}
ACCROCHE : ${hook}
TEXTE : ${rawText}

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de texte avant/après) :
{
  "country": "Nom du pays ou de la région (en français, avec accents)",
  "spots": [
    {
      "name": "NOM DU SPOT EN MAJUSCULES (max 25 caractères)",
      "detail": "Description courte (max 30 caractères, ex: Temple historique)",
      "pexelsQuery": "english pexels search query for this specific spot"
    }
  ],
  "caption": "5 spots à ne pas rater à [DESTINATION] [EMOJI_DRAPEAU]\\n\\nLequel tu visites en premier ? 👇",
  "hashtags": ["#FlashVoyage", "#TripPick", "#Voyage", "...4-5 hashtags pertinents"]
}

RÈGLES :
- Exactement 5 spots, le plus spectaculaire EN PREMIER
- "name" : EN MAJUSCULES, max 25 caractères, spécifique (pas générique)
- "detail" : première lettre majuscule, max 30 caractères, en français avec accents
- "pexelsQuery" : en anglais, spécifique au spot (ex: "angkor wat temple sunrise")
- "caption" : inclure le drapeau emoji du pays et un appel à l'action
- "hashtags" : 6-7 hashtags dont #FlashVoyage et #TripPick en premier`;
}

// ── Main generation function ────────────────────────────────────────────────

/**
 * Generate a Trip Pick script from article data using Haiku.
 *
 * @param {Object} article - Article data { title, hook, rawText, keyStats, ... }
 * @returns {Promise<Object>} Trip Pick script
 */
export async function generateTripPickScript(article) {
  console.log(`[REEL/TRIP-PICK] Generating script for: "${(article.title || '').slice(0, 60)}..."`);

  const client = getClient();
  if (!client) {
    console.warn('[REEL/TRIP-PICK] ANTHROPIC_API_KEY not set — using fallback');
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
      console.warn('[REEL/TRIP-PICK] JSON parse failed, trying regex extraction...');
      script = extractManually(jsonStr);
    }

    // ── Validate & normalize ────────────────────────────────────────────────

    if (!script.country || !script.spots || !Array.isArray(script.spots)) {
      throw new Error('Invalid script: missing country or spots');
    }

    // Enforce exactly 5 spots
    if (script.spots.length > 5) {
      script.spots = script.spots.slice(0, 5);
    }
    while (script.spots.length < 5) {
      script.spots.push({
        name: `SPOT ${script.spots.length + 1}`,
        detail: 'Lieu à découvrir',
        pexelsQuery: `${script.country} tourism landmark`,
      });
    }

    // Enforce name constraints
    script.spots = script.spots.map(spot => ({
      name: (spot.name || 'SPOT').toUpperCase().slice(0, 25),
      detail: (spot.detail || '').slice(0, 30),
      pexelsQuery: spot.pexelsQuery || `${script.country} travel`,
    }));

    // Ensure hashtags
    const defaultTags = ['#FlashVoyage', '#TripPick', '#Voyage'];
    script.hashtags = Array.isArray(script.hashtags) && script.hashtags.length >= 3
      ? script.hashtags
      : defaultTags;

    // Ensure caption
    const flag = getFlag(script.country);
    if (!script.caption) {
      script.caption = `5 spots à ne pas rater à ${script.country} ${flag}\n\nLequel tu visites en premier ? 👇`;
    }

    // Final structure
    const result = {
      type: 'trip_pick',
      country: script.country,
      spots: script.spots,
      caption: script.caption,
      hashtags: script.hashtags,
    };

    console.log(`[REEL/TRIP-PICK] Generated: ${result.spots.length} spots for "${result.country}"`);
    return result;

  } catch (err) {
    console.error(`[REEL/TRIP-PICK] Generation failed: ${err.message}`);
    return getFallbackScript(article);
  }
}

// ── Regex fallback extraction ───────────────────────────────────────────────

function extractManually(jsonStr) {
  const countryMatch = jsonStr.match(/"country"\s*:\s*"([^"]+)"/);
  const nameMatches = [...jsonStr.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
  const detailMatches = [...jsonStr.matchAll(/"detail"\s*:\s*"([^"]+)"/g)];
  const queryMatches = [...jsonStr.matchAll(/"pexelsQuery"\s*:\s*"([^"]+)"/g)];
  const captionMatch = jsonStr.match(/"caption"\s*:\s*"([^"]+)"/);

  if (!countryMatch && nameMatches.length === 0) {
    throw new Error('Could not extract any content from malformed JSON');
  }

  const country = countryMatch ? countryMatch[1] : 'Destination';
  const spots = nameMatches.map((m, i) => ({
    name: m[1],
    detail: detailMatches[i] ? detailMatches[i][1] : '',
    pexelsQuery: queryMatches[i] ? queryMatches[i][1] : `${country} travel`,
  }));

  return {
    country,
    spots,
    caption: captionMatch ? captionMatch[1] : '',
    hashtags: ['#FlashVoyage', '#TripPick', '#Voyage'],
  };
}

// ── Fallback when Haiku unavailable ─────────────────────────────────────────

function getFallbackScript(article) {
  const title = article.title || 'Destination Voyage';
  // Try to extract a country/destination from the title
  const country = title
    .replace(/top\s*\d+/i, '')
    .replace(/spots?\s*(à|a)\s*ne\s*pas\s*rater/i, '')
    .replace(/meilleur(e?s?)/i, '')
    .replace(/incontournable(s?)/i, '')
    .trim()
    || 'Asie du Sud-Est';

  console.warn(`[REEL/TRIP-PICK] Using fallback script for: "${country}"`);

  return {
    type: 'trip_pick',
    country,
    spots: [
      { name: 'SPOT PRINCIPAL', detail: 'Lieu emblématique', pexelsQuery: `${country} landmark` },
      { name: 'TEMPLE ANCIEN', detail: 'Temple historique', pexelsQuery: `${country} temple` },
      { name: 'MARCHÉ LOCAL', detail: 'Marché traditionnel', pexelsQuery: `${country} market` },
      { name: 'PLAGE SECRÈTE', detail: 'Plage paradisiaque', pexelsQuery: `${country} beach` },
      { name: 'VUE PANORAMIQUE', detail: 'Point de vue', pexelsQuery: `${country} viewpoint` },
    ],
    caption: `5 spots à ne pas rater 🌍\n\nLequel tu visites en premier ? 👇`,
    hashtags: ['#FlashVoyage', '#TripPick', '#Voyage', '#Travel', '#SpotsVoyage'],
  };
}
