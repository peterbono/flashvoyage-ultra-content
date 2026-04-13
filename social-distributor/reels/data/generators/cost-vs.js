/**
 * Cost-vs Script Generator — FlashVoyage Reels v2
 *
 * Generates cost-comparison Reel content. Historically this was locked on
 * "Cost in [X] vs France" — the Haiku system prompt hardcoded that pair.
 *
 * ANGLE DIVERSITY (2026-04-13 rewrite):
 *   Now driven by versus-angles.json (18 angles). An angle is picked per
 *   run (rotation, no repeat within last 6), and the generator resolves the
 *   second side via pickComparisonDestination(). The historic France
 *   reference is still one of the 18 angles (destination-vs-france), so the
 *   old behavior is preserved whenever that angle is picked.
 *
 * ARCHITECTURE (anti-hallucination — unchanged):
 *
 *   Haiku does ONLY 1 thing: pick 1 PRIMARY destination from the
 *   item-prices.js whitelist, based on what the article is about.
 *
 *   All prices (8 items + monthly total) come STRAIGHT from item-prices.js
 *   — never from the LLM. The comparison side (destination B) comes from
 *   the angle: it may be France, another item-prices country, or a
 *   "virtual" label (no real prices — in that case we keep using France
 *   prices as the numeric reference and only change the overlay framing).
 *
 * Output structure:
 * {
 *   type: 'cost-vs',
 *   angle: { id, label, tone },
 *   destination: { key, displayName, flag, pexelsQuery }, // legacy, = destinationA
 *   destinationA: { key, displayName, flag, pexelsQuery },
 *   destinationB: { key, displayName, flag, pexelsQuery },
 *   rows: Array<{ key, label, emoji, destPrice, francePrice }>, // legacy keys kept
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
import { pickAngle, pickComparisonDestination } from '../angles/picker.js';

// ── Lazy Anthropic client ───────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('cost-vs-generator');
  return _client;
}

// ── Haiku prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(angle) {
  return `Tu es un créateur de Reels voyage pour FlashVoyage (Instagram).
Tu identifies la destination PRINCIPALE d'un article pour un reel de comparaison de coûts.

ANGLE IMPOSÉ POUR CE REEL : ${angle.label} (${angle.id})
- Scénario : ${angle.scenarioDirection}
- Cadrage : ${angle.framingHint}
- Ton attendu : ${angle.tone}

Il existe 18 angles possibles. Tu DOIS respecter l'angle imposé ci-dessus. NE REVIENS PAS au cliché "destination vs France" si ce n'est pas l'angle choisi.

RÈGLE ABSOLUE : tu DOIS choisir la destination PRINCIPALE UNIQUEMENT dans la liste fournie de pays supportés. Jamais d'autres pays. Les prix sont gérés par le système — tu ne les génères PAS.`;
}

function buildUserPrompt(article, angle) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 3000);
  const known = getKnownPriceCountries()
    .map((k) => getCountryFacts(k)?.displayName || k)
    .filter(Boolean)
    .join(', ');

  return `Depuis cet article, identifie LE pays PRINCIPAL du reel.

ARTICLE : ${title}
TEXTE : ${rawText}

ANGLE IMPOSÉ : ${angle.label}
- Scénario : ${angle.scenarioDirection}
- Cadrage : ${angle.framingHint}

LISTE DES PAYS SUPPORTÉS (tu DOIS choisir un nom EXACTEMENT dans cette liste) :
${known}

Réponds UNIQUEMENT en JSON valide :
{
  "destination": "Nom exact depuis la liste",
  "caption": "Une phrase accroche courte pour le reel, ton FlashVoyage (direct, anti-bullshit), cohérente avec l'angle imposé",
  "hashtags": ["#FlashVoyage", "#PrixVoyage", "#Voyage", "..."]
}

RÈGLES :
- "destination" DOIT être une valeur EXACTE de la liste (copie-colle)
- Si l'article ne mentionne aucun pays de la liste, choisis la destination SEA la plus proche du sujet (Thaïlande par défaut)
- Si l'article est explicitement sur la France ou sur l'Europe, choisis la destination SEA la plus contrastée
- "caption" : format court (140 chars max), ton direct, cohérent avec l'angle (pas de "vs France" forcé si l'angle n'est pas destination-vs-france)
- "hashtags" : 6-7, #FlashVoyage et #PrixVoyage en premier`;
}

// ── Row assembly (prices ALWAYS come from item-prices.js) ──────────────────

function buildRows(destPrices, comparisonPrices) {
  return ITEM_KEYS.map((key) => {
    const meta = ITEM_METADATA[key];
    return {
      key,
      label: meta.label,
      emoji: meta.emoji,
      destPrice: formatPrice(destPrices[key], key),
      // Legacy field name: "francePrice" is kept so older composer code that
      // still references it keeps working. The value is whatever comparison
      // reference was chosen (France or another country's prices).
      francePrice: formatPrice(comparisonPrices[key], key),
      comparisonPrice: formatPrice(comparisonPrices[key], key),
    };
  });
}

function buildTotals(destPrices, comparisonPrices) {
  const destTotal = computeMonthlyTotal(destPrices);
  const comparisonTotal = computeMonthlyTotal(comparisonPrices);
  return {
    dest: destTotal,
    france: comparisonTotal,         // legacy key
    comparison: comparisonTotal,     // new, explicit
    destFormatted: formatMonthlyTotal(destTotal),
    franceFormatted: formatMonthlyTotal(comparisonTotal),     // legacy key
    comparisonFormatted: formatMonthlyTotal(comparisonTotal),
  };
}

function buildDestinationObject(key, fallbackLabel) {
  // Real country with full facts in country-facts.js
  const facts = key ? getCountryFacts(key) : null;
  if (facts) {
    return {
      key: facts.key,
      displayName: facts.displayName,
      flag: facts.flag,
      pexelsQuery: facts.pexels_query || `${facts.displayName.toLowerCase()} travel landscape aerial`,
    };
  }
  // Virtual destination (e.g. "Version luxe", "Saison pluies") — no facts.
  return {
    key: null,
    displayName: fallbackLabel || 'Autre',
    flag: '📊',
    pexelsQuery: `travel lifestyle generic`,
  };
}

// ── Main generation function ────────────────────────────────────────────────

export async function generateCostVsScript(article) {
  const angle = pickAngle('versus');
  console.log(
    `[REEL/COST-VS] Angle: ${angle.id} (tone: ${angle.tone}) — item-prices lastVerified: ${ITEM_PRICES_LAST_VERIFIED}`
  );
  console.log(`[REEL/COST-VS] Generating script for: "${(article.title || '').slice(0, 60)}..."`);

  const client = getClient();

  let destinationAKey = null;
  let caption = null;
  let hashtags = null;

  if (client) {
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: buildSystemPrompt(angle),
        messages: [{ role: 'user', content: buildUserPrompt(article, angle) }],
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
          destinationAKey = prices.key;
          caption = parsed.caption;
          hashtags = parsed.hashtags;
          console.log(`[REEL/COST-VS] Haiku picked primary: "${parsed.destination}" → ${destinationAKey}`);
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
  if (!destinationAKey) {
    const titlePrices = getItemPrices(article.title || '');
    destinationAKey = titlePrices?.key || 'thailande';
    console.warn(`[REEL/COST-VS] Fallback primary destination: ${destinationAKey}`);
  }

  // ── Resolve destination B from angle ───────────────────────────────────
  const { destinationBKey, destinationBLabel } = pickComparisonDestination(
    destinationAKey,
    angle
  );

  // Price table for B: if B is a real country with item-prices, use those.
  // Otherwise (virtual B — "Version luxe", "Saison pluies", etc.) we use
  // France as the numeric reference (safe default that keeps the legacy
  // "vs France" numbers until a per-axis pricing model is added).
  const destAPrices = { ...ITEM_PRICES[destinationAKey], key: destinationAKey };
  const destBPrices =
    destinationBKey && ITEM_PRICES[destinationBKey]
      ? { ...ITEM_PRICES[destinationBKey], key: destinationBKey }
      : { ...ITEM_PRICES.france, key: 'france' };

  const destinationA = buildDestinationObject(destinationAKey);
  const destinationB = destinationBKey
    ? buildDestinationObject(destinationBKey, destinationBLabel)
    : buildDestinationObject(null, destinationBLabel);

  const rows = buildRows(destAPrices, destBPrices);
  const totals = buildTotals(destAPrices, destBPrices);
  const diff = totals.comparison - totals.dest;
  const diffFormatted = formatMonthlyTotal(Math.abs(diff));

  if (!caption) {
    caption = diff > 0
      ? `${destinationA.displayName} vs ${destinationB.displayName} : ${diffFormatted} d'écart chaque mois. Tu fais quoi avec ça ? 👇`
      : `${destinationA.displayName} vs ${destinationB.displayName} : même ${destinationB.displayName} est moins cher. Surprenant 👀`;
  }

  if (!hashtags || !Array.isArray(hashtags) || hashtags.length < 3) {
    hashtags = ['#FlashVoyage', '#PrixVoyage', '#Voyage', '#VieAlEtranger', '#BudgetVoyage'];
  }

  console.log(
    `[REEL/COST-VS] Ready: ${destinationA.displayName} ${totals.destFormatted}/mois vs ` +
    `${destinationB.displayName} ${totals.comparisonFormatted}/mois ` +
    `(${diff > 0 ? '-' : '+'}${diffFormatted})`
  );

  return {
    type: 'cost-vs',
    angle: { id: angle.id, label: angle.label, tone: angle.tone },
    // Legacy field — kept so older composer / publisher code still works.
    destination: destinationA,
    destinationA,
    destinationB,
    rows,
    totals,
    caption,
    hashtags,
  };
}
