/**
 * Cost-vs Script Generator — FlashVoyage Reels v2
 *
 * Generates "Cost in [X] vs France" content from article data.
 *
 * ARCHITECTURE (anti-hallucination):
 *
 *   Haiku does ONLY 1 thing: pick 1 destination from the item-prices.js
 *   whitelist, based on what the article is about. Falls back to the
 *   article's main destination if identifiable, otherwise to a sensible
 *   SEA default.
 *
 *   All prices (8 items + monthly total) come STRAIGHT from
 *   item-prices.js — never from the LLM. France is the fixed reference.
 *
 * Output structure:
 * {
 *   type: 'cost-vs',
 *   destination: { key, displayName, flag, pexelsQuery },
 *   rows: Array<{ key, label, emoji, destPrice, francePrice }>,
 *   totals: { dest: number, france: number, destFormatted, franceFormatted },
 *   caption: string,
 *   hashtags: string[]
 * }
 */

import { createTrackedClient } from '../../tracked-anthropic.js';
import {
  ITEM_PRICES,
  ITEM_KEYS,
  ITEM_METADATA,
  formatPrice,
  computeMonthlyTotal,
  formatMonthlyTotal,
  getItemPrices,
  getKnownPriceCountries,
  ITEM_PRICES_LAST_VERIFIED,
} from '../item-prices.js';
import { getCountryFacts } from '../country-facts.js';

// ── Lazy Anthropic client ───────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('cost-vs-generator');
  return _client;
}

// ── Haiku prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un créateur de Reels voyage pour FlashVoyage (Instagram).
Tu identifies la destination d'un article pour un reel "Coût en [pays] vs France".

RÈGLE ABSOLUE : tu DOIS choisir la destination UNIQUEMENT dans la liste fournie de pays supportés. Jamais d'autres pays. Les prix sont gérés par le système — tu ne les génères PAS.`;

function buildUserPrompt(article) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 3000);
  const known = getKnownPriceCountries()
    .map((k) => getCountryFacts(k)?.displayName || k)
    .filter(Boolean)
    .join(', ');

  return `Depuis cet article, identifie LE pays principal à comparer à la France.

ARTICLE : ${title}
TEXTE : ${rawText}

LISTE DES PAYS SUPPORTÉS (tu DOIS choisir un nom EXACTEMENT dans cette liste) :
${known}

Réponds UNIQUEMENT en JSON valide :
{
  "destination": "Nom exact depuis la liste",
  "caption": "Une phrase accroche courte pour le reel, ton FlashVoyage (direct, anti-bullshit), mentionnant le pays choisi et la France",
  "hashtags": ["#FlashVoyage", "#PrixVoyage", "#Voyage", "..."]
}

RÈGLES :
- "destination" DOIT être une valeur EXACTE de la liste (copie-colle)
- Si l'article ne mentionne aucun pays de la liste, choisis la destination SEA la plus proche du sujet (Thaïlande par défaut)
- Si l'article est explicitement sur la France ou sur l'Europe, choisis la destination SEA la plus contrastée
- "caption" : format court (140 chars max), ton direct, mentionne la différence de prix visible en France/[pays]
- "hashtags" : 6-7, #FlashVoyage et #PrixVoyage en premier`;
}

// ── Row assembly (prices ALWAYS come from item-prices.js) ──────────────────

function buildRows(destPrices, francePrices) {
  return ITEM_KEYS.map((key) => {
    const meta = ITEM_METADATA[key];
    return {
      key,
      label: meta.label,
      emoji: meta.emoji,
      destPrice: formatPrice(destPrices[key], key),
      francePrice: formatPrice(francePrices[key], key),
    };
  });
}

function buildTotals(destPrices, francePrices) {
  const destTotal = computeMonthlyTotal(destPrices);
  const franceTotal = computeMonthlyTotal(francePrices);
  return {
    dest: destTotal,
    france: franceTotal,
    destFormatted: formatMonthlyTotal(destTotal),
    franceFormatted: formatMonthlyTotal(franceTotal),
  };
}

// ── Main generation function ────────────────────────────────────────────────

export async function generateCostVsScript(article) {
  console.log(`[REEL/COST-VS] Generating script for: "${(article.title || '').slice(0, 60)}..."`);
  console.log(`[REEL/COST-VS] item-prices lastVerified: ${ITEM_PRICES_LAST_VERIFIED}`);

  const francePrices = ITEM_PRICES.france;
  const client = getClient();

  let destinationKey = null;
  let caption = null;
  let hashtags = null;

  if (client) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(article) }],
      });
      const text = response.content[0]?.text?.trim();
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0]
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"');
        const parsed = JSON.parse(jsonStr);
        const prices = getItemPrices(parsed.destination);
        if (prices) {
          destinationKey = prices.key;
          caption = parsed.caption;
          hashtags = parsed.hashtags;
          console.log(`[REEL/COST-VS] Haiku picked: "${parsed.destination}" → ${destinationKey}`);
        } else {
          console.warn(`[REEL/COST-VS] Haiku picked unknown country "${parsed.destination}", falling back`);
        }
      }
    } catch (err) {
      console.warn(`[REEL/COST-VS] Haiku failed (${err.message}), falling back`);
    }
  } else {
    console.warn('[REEL/COST-VS] ANTHROPIC_API_KEY not set — using fallback');
  }

  // Fallback: extract destination from title, else default Thaïlande
  if (!destinationKey) {
    const titlePrices = getItemPrices(article.title || '');
    destinationKey = titlePrices?.key || 'thailande';
    console.warn(`[REEL/COST-VS] Fallback destination: ${destinationKey}`);
  }

  const destPrices = { ...ITEM_PRICES[destinationKey], key: destinationKey };
  const facts = getCountryFacts(destinationKey);
  const displayName = facts?.displayName || destinationKey;
  const flag = facts?.flag || '🌍';
  const pexelsQuery = facts?.pexels_query || `${displayName} travel landscape aerial`;

  const rows = buildRows(destPrices, francePrices);
  const totals = buildTotals(destPrices, francePrices);
  const diff = totals.france - totals.dest;
  const diffFormatted = formatMonthlyTotal(Math.abs(diff));

  if (!caption) {
    caption = diff > 0
      ? `${displayName} vs France : ${diffFormatted} d'écart chaque mois. Tu fais quoi avec ça ? 👇`
      : `${displayName} vs France : même la France est moins chère. Surprenant 👀`;
  }

  if (!hashtags || !Array.isArray(hashtags) || hashtags.length < 3) {
    hashtags = ['#FlashVoyage', '#PrixVoyage', '#Voyage', '#VieAlEtranger', '#BudgetVoyage'];
  }

  console.log(
    `[REEL/COST-VS] Ready: ${displayName} ${totals.destFormatted}/mois vs France ${totals.franceFormatted}/mois ` +
    `(${diff > 0 ? '-' : '+'}${diffFormatted})`
  );

  return {
    type: 'cost-vs',
    destination: { key: destinationKey, displayName, flag, pexelsQuery },
    rows,
    totals,
    caption,
    hashtags,
  };
}
