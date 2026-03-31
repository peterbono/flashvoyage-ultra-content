/**
 * Budget Jour Script Generator — FlashVoyage Reels v2
 *
 * Generates "BUDGET VOYAGE" daily breakdown content from article data.
 * Uses Claude Haiku to extract realistic per-day budget from article.
 *
 * Output structure:
 * {
 *   type: 'budget_jour',
 *   destination: string,
 *   durationLabel: string,
 *   categories: Array<{ emoji: string, label: string, price: string }>,
 *   totalPrice: string,
 *   pexelsQuery: string,
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
  _client = createTrackedClient('budget-generator');
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
Tu génères du contenu "BUDGET JOUR" : le budget quotidien réaliste pour un voyageur dans une destination.
Ton style est éditorial, factuel, concis. Accents français obligatoires (é, è, ê, à, ç, ù).
CRITIQUE : les prix doivent être RÉALISTES et EXTRAITS de l'article, jamais inventés.`;

function buildUserPrompt(article) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 4000);
  const hook = article.hook || '';

  return `Depuis cet article, extrais le budget journalier réaliste pour cette destination.

ARTICLE : ${title}
ACCROCHE : ${hook}
TEXTE : ${rawText}

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de texte avant/après) :
{
  "destination": "Nom de la destination (en français, avec accents)",
  "durationLabel": "Durée du séjour type (ex: 2 SEMAINES, 10 JOURS, 1 MOIS)",
  "categories": [
    { "emoji": "🏠", "label": "Hébergement", "price": "XX €/nuit" },
    { "emoji": "🍜", "label": "Nourriture", "price": "XX €/jour" },
    { "emoji": "🛵", "label": "Transport", "price": "XX €/jour" },
    { "emoji": "🎯", "label": "Activités", "price": "XX €/jour" }
  ],
  "totalPrice": "XX €/jour",
  "pexelsQuery": "english pexels query for aerial drone shot of this destination",
  "caption": "Budget journalier à [DESTINATION] [EMOJI_DRAPEAU]\\n\\n🏠 Hébergement : XX €\\n🍜 Nourriture : XX €\\n🛵 Transport : XX €\\n🎯 Activités : XX €\\n💰 Total : XX €/jour\\n\\nEnregistre ce Reel pour ton voyage 💰",
  "hashtags": ["#FlashVoyage", "#BudgetVoyage", "#Voyage", "...4-5 hashtags pertinents"]
}

RÈGLES :
- Exactement 4 catégories : Hébergement, Nourriture, Transport, Activités
- Les emojis DOIVENT être : 🏠 🍜 🛵 🎯 (dans cet ordre)
- Les prix DOIVENT être en EUR avec le symbole "€" (ex: "12 €/nuit", "8 €/jour")
- Les prix DOIVENT être RÉALISTES, extraits ou déduits de l'article — JAMAIS inventés
- "totalPrice" = somme réaliste des 4 catégories par jour
- "durationLabel" : en MAJUSCULES (ex: "2 SEMAINES", "10 JOURS")
- "pexelsQuery" : en anglais, vue aérienne/drone de la destination (ex: "bali aerial rice terraces drone")
- "caption" : inclure le drapeau emoji du pays + détail du budget + "Enregistre ce Reel pour ton voyage 💰"
- "hashtags" : 6-7 hashtags dont #FlashVoyage et #BudgetVoyage en premier
- Accents français obligatoires partout`;
}

// ── Main generation function ────────────────────────────────────────────────

/**
 * Generate a Budget Jour script from article data using Haiku.
 *
 * @param {Object} article - Article data { title, hook, rawText, keyStats, ... }
 * @returns {Promise<Object>} Budget Jour script
 */
export async function generateBudgetJourScript(article) {
  console.log(`[REEL/BUDGET-JOUR] Generating script for: "${(article.title || '').slice(0, 60)}..."`);

  const client = getClient();
  if (!client) {
    console.warn('[REEL/BUDGET-JOUR] ANTHROPIC_API_KEY not set — using fallback');
    return getFallbackScript(article);
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
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
      console.warn('[REEL/BUDGET-JOUR] JSON parse failed, trying regex extraction...');
      script = extractManually(jsonStr);
    }

    // ── Validate & normalize ────────────────────────────────────────────────

    if (!script.destination || !script.categories || !Array.isArray(script.categories)) {
      throw new Error('Invalid script: missing destination or categories');
    }

    // Enforce exactly 4 categories with correct emojis
    const defaultCategories = [
      { emoji: '🏠', label: 'Hébergement', price: '? €/nuit' },
      { emoji: '🍜', label: 'Nourriture', price: '? €/jour' },
      { emoji: '🛵', label: 'Transport', price: '? €/jour' },
      { emoji: '🎯', label: 'Activités', price: '? €/jour' },
    ];

    const expectedEmojis = ['🏠', '🍜', '🛵', '🎯'];

    // Normalize categories: keep up to 4, fix emojis
    script.categories = script.categories.slice(0, 4).map((cat, i) => ({
      emoji: expectedEmojis[i] || cat.emoji || defaultCategories[i]?.emoji || '📌',
      label: cat.label || defaultCategories[i]?.label || `Catégorie ${i + 1}`,
      price: cat.price || defaultCategories[i]?.price || '? €',
    }));

    // Pad to 4 if fewer
    while (script.categories.length < 4) {
      script.categories.push(defaultCategories[script.categories.length]);
    }

    // Ensure totalPrice
    if (!script.totalPrice) {
      script.totalPrice = '? €/jour';
    }

    // Ensure durationLabel
    if (!script.durationLabel) {
      script.durationLabel = '2 SEMAINES';
    }
    script.durationLabel = script.durationLabel.toUpperCase();

    // Ensure pexelsQuery
    if (!script.pexelsQuery) {
      script.pexelsQuery = `${script.destination} aerial drone landscape`;
    }

    // Ensure hashtags
    const defaultTags = ['#FlashVoyage', '#BudgetVoyage', '#Voyage', '#BudgetTravel'];
    script.hashtags = Array.isArray(script.hashtags) && script.hashtags.length >= 3
      ? script.hashtags
      : defaultTags;

    // Ensure caption
    const flag = getFlag(script.destination);
    if (!script.caption) {
      const lines = script.categories.map(c => `${c.emoji} ${c.label} : ${c.price}`);
      script.caption = `Budget journalier à ${script.destination} ${flag}\n\n${lines.join('\n')}\n💰 Total : ${script.totalPrice}\n\nEnregistre ce Reel pour ton voyage 💰`;
    }

    // Final structure
    const result = {
      type: 'budget_jour',
      destination: script.destination,
      durationLabel: script.durationLabel,
      categories: script.categories,
      totalPrice: script.totalPrice,
      pexelsQuery: script.pexelsQuery,
      caption: script.caption,
      hashtags: script.hashtags,
    };

    console.log(`[REEL/BUDGET-JOUR] Generated: ${result.categories.length} categories for "${result.destination}" — total ${result.totalPrice}`);
    return result;

  } catch (err) {
    console.error(`[REEL/BUDGET-JOUR] Generation failed: ${err.message}`);
    return getFallbackScript(article);
  }
}

// ── Regex fallback extraction ───────────────────────────────────────────────

function extractManually(jsonStr) {
  const destMatch = jsonStr.match(/"destination"\s*:\s*"([^"]+)"/);
  const durationMatch = jsonStr.match(/"durationLabel"\s*:\s*"([^"]+)"/);
  const totalMatch = jsonStr.match(/"totalPrice"\s*:\s*"([^"]+)"/);
  const pexelsMatch = jsonStr.match(/"pexelsQuery"\s*:\s*"([^"]+)"/);
  const captionMatch = jsonStr.match(/"caption"\s*:\s*"([^"]+)"/);

  const emojiMatches = [...jsonStr.matchAll(/"emoji"\s*:\s*"([^"]+)"/g)];
  const labelMatches = [...jsonStr.matchAll(/"label"\s*:\s*"([^"]+)"/g)];
  const priceMatches = [...jsonStr.matchAll(/"price"\s*:\s*"([^"]+)"/g)];

  if (!destMatch && emojiMatches.length === 0) {
    throw new Error('Could not extract any content from malformed JSON');
  }

  const destination = destMatch ? destMatch[1] : 'Destination';
  const categories = emojiMatches.map((m, i) => ({
    emoji: m[1],
    label: labelMatches[i] ? labelMatches[i][1] : '',
    price: priceMatches[i] ? priceMatches[i][1] : '? €',
  }));

  return {
    destination,
    durationLabel: durationMatch ? durationMatch[1] : '2 SEMAINES',
    categories,
    totalPrice: totalMatch ? totalMatch[1] : '? €/jour',
    pexelsQuery: pexelsMatch ? pexelsMatch[1] : `${destination} aerial drone`,
    caption: captionMatch ? captionMatch[1] : '',
    hashtags: ['#FlashVoyage', '#BudgetVoyage', '#Voyage'],
  };
}

// ── Fallback when Haiku unavailable ─────────────────────────────────────────

function getFallbackScript(article) {
  const title = article.title || 'Destination Voyage';
  // Try to extract a destination from the title
  const destination = title
    .replace(/budget\s*(jour(nalier)?|quotidien|voyage)?/i, '')
    .replace(/combien\s*coûte/i, '')
    .replace(/par\s*jour/i, '')
    .trim()
    || 'Asie du Sud-Est';

  console.warn(`[REEL/BUDGET-JOUR] Using fallback script for: "${destination}"`);

  return {
    type: 'budget_jour',
    destination,
    durationLabel: '2 SEMAINES',
    categories: [
      { emoji: '🏠', label: 'Hébergement', price: '15 €/nuit' },
      { emoji: '🍜', label: 'Nourriture', price: '10 €/jour' },
      { emoji: '🛵', label: 'Transport', price: '5 €/jour' },
      { emoji: '🎯', label: 'Activités', price: '8 €/jour' },
    ],
    totalPrice: '38 €/jour',
    pexelsQuery: `${destination} aerial drone landscape`,
    caption: `Budget journalier 🌍\n\n🏠 Hébergement : 15 €\n🍜 Nourriture : 10 €\n🛵 Transport : 5 €\n🎯 Activités : 8 €\n💰 Total : 38 €/jour\n\nEnregistre ce Reel pour ton voyage 💰`,
    hashtags: ['#FlashVoyage', '#BudgetVoyage', '#Voyage', '#BudgetTravel', '#VoyagePasCher'],
  };
}
