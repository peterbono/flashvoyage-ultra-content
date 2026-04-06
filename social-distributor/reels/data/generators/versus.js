/**
 * Versus Script Generator — FlashVoyage Reels v2
 *
 * Generates "VERSUS" comparison content from article data.
 *
 * ARCHITECTURE (since 2026-04-06 anti-hallucination rewrite):
 *
 *   Haiku does ONLY 2 things:
 *     1. Pick 2 destinations from a constrained whitelist (country-facts.js).
 *     2. Optionally suggest 2-3 spots/activities mentioned in the article
 *        for each destination (used as overrides for the defaults).
 *
 *   All numerical / factual fields (BUDGET, VISA, PÉRIODE) come STRAIGHT
 *   from country-facts.js — never from the LLM. This is the same
 *   anti-hallucination pattern used by the main article pipeline.
 *
 *   If Haiku picks a country that is not in the whitelist, the generator
 *   refuses and the caller gets null / a fallback. No invented visa rules,
 *   no made-up budgets.
 *
 * Output structure (unchanged):
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
import {
  getCountryFacts,
  getKnownCountryNames,
  COUNTRY_FACTS_LAST_VERIFIED,
} from '../country-facts.js';

// ── Lazy Anthropic client ───────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('versus-generator');
  return _client;
}

// ── Haiku prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un créateur de Reels voyage pour le média FlashVoyage (Instagram).
Tu identifies les 2 destinations d'un article voyage pour un reel de comparaison VERSUS.

RÈGLE ABSOLUE : tu DOIS choisir destA et destB UNIQUEMENT dans la liste fournie de pays supportés. Jamais d'autres pays. Les budgets, visas et périodes sont gérés par le système — tu ne les génères PAS.

Tu peux optionnellement suggérer 2-3 spots ou activités mentionnés explicitement dans l'article, qui serviront à contextualiser la comparaison.`;

function buildUserPrompt(article) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 4000);
  const hook = article.hook || '';
  const knownList = getKnownCountryNames().join(', ');

  return `Depuis cet article, identifie les 2 destinations à comparer.

ARTICLE : ${title}
ACCROCHE : ${hook}
TEXTE : ${rawText}

LISTE DES PAYS SUPPORTÉS (tu DOIS choisir destA et destB dans cette liste, aucune exception) :
${knownList}

Si l'article ne compare qu'un seul pays clairement, choisis-en un 2e dans la liste qui soit une comparaison voyage pertinente (SE Asia ↔ SE Asia de préférence, sinon budget/saison opposée).

Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de texte avant/après) :
{
  "destA": "Nom exact depuis la liste",
  "destB": "Nom exact depuis la liste",
  "articleSpotsA": "Ubud, Canggu",
  "articleSpotsB": "Bangkok, Koh Lanta",
  "articleActivitiesA": "Surf, temples",
  "articleActivitiesB": "Street food, îles",
  "caption": "Destination A vs Destination B : tu choisis quoi ? 👇",
  "hashtags": ["#FlashVoyage", "#VsVoyage", "#Voyage", "..."]
}

RÈGLES :
- "destA" et "destB" DOIVENT être des valeurs EXACTES de la liste ci-dessus (copie-colle)
- "articleSpotsA/B" et "articleActivitiesA/B" : OPTIONNELS. Mets une chaîne vide "" si l'article ne mentionne pas de spots/activités concrets pour ce pays. MAX 25 caractères par champ.
- N'invente JAMAIS de spots ou d'activités qui ne sont pas dans l'article
- "caption" : format "[A] vs [B] : tu choisis quoi ? 👇\\nCommente ton choix !"
- "hashtags" : 6-7 hashtags dont #FlashVoyage et #VsVoyage en premier
- Accents français obligatoires partout (sauf noms propres)`;
}

// ── Row assembly (data comes from country-facts, NOT from Haiku) ────────────

/**
 * Build the 5 comparison rows from two country-facts records, optionally
 * letting article-sourced overrides replace the default top_spots and
 * activities strings.
 *
 * @param {Object} factsA - getCountryFacts() result for destination A
 * @param {Object} factsB - getCountryFacts() result for destination B
 * @param {Object} overrides - { spotsA, spotsB, activitiesA, activitiesB }
 */
function buildRowsFromFacts(factsA, factsB, overrides = {}) {
  const spotsA = truncateValue(overrides.spotsA || factsA.top_spots, 25);
  const spotsB = truncateValue(overrides.spotsB || factsB.top_spots, 25);
  const activitiesA = truncateValue(overrides.activitiesA || factsA.activities, 25);
  const activitiesB = truncateValue(overrides.activitiesB || factsB.activities, 25);

  return [
    { label: 'BUDGET', left: factsA.budget_2weeks, right: factsB.budget_2weeks },
    { label: 'VISA', left: factsA.visa_fr, right: factsB.visa_fr },
    { label: 'PÉRIODE', left: factsA.best_period, right: factsB.best_period },
    { label: 'TOP SPOTS', left: spotsA, right: spotsB },
    { label: 'ACTIVITÉS', left: activitiesA, right: activitiesB },
  ];
}

// ── Main generation function ────────────────────────────────────────────────

/**
 * Generate a Versus script from article data using Haiku + country-facts.
 *
 * @param {Object} article - Article data { title, hook, rawText, keyStats, ... }
 * @returns {Promise<Object>} Versus script
 */
export async function generateVersusScript(article) {
  console.log(`[REEL/VERSUS] Generating script for: "${(article.title || '').slice(0, 60)}..."`);
  console.log(`[REEL/VERSUS] country-facts lastVerified: ${COUNTRY_FACTS_LAST_VERIFIED}`);

  const client = getClient();
  if (!client) {
    console.warn('[REEL/VERSUS] ANTHROPIC_API_KEY not set — using title-based fallback');
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
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
    jsonStr = jsonStr.replace(/[\u201c\u201d\u00ab\u00bb]/g, '"');

    const parsed = JSON.parse(jsonStr);

    // ── Validate: both destinations must be in the whitelist ───────────────
    const factsA = getCountryFacts(parsed.destA);
    const factsB = getCountryFacts(parsed.destB);

    if (!factsA || !factsB) {
      console.warn(
        `[REEL/VERSUS] Haiku picked unknown country — destA="${parsed.destA}" (${factsA ? 'ok' : 'UNKNOWN'}), destB="${parsed.destB}" (${factsB ? 'ok' : 'UNKNOWN'}). Falling back.`
      );
      return getFallbackScript(article);
    }

    if (factsA.key === factsB.key) {
      console.warn(`[REEL/VERSUS] Haiku picked the same country for both sides (${factsA.key}). Falling back.`);
      return getFallbackScript(article);
    }

    // ── Assemble rows from facts, not from Haiku ───────────────────────────
    const rows = buildRowsFromFacts(factsA, factsB, {
      spotsA: parsed.articleSpotsA?.trim() || null,
      spotsB: parsed.articleSpotsB?.trim() || null,
      activitiesA: parsed.articleActivitiesA?.trim() || null,
      activitiesB: parsed.articleActivitiesB?.trim() || null,
    });

    const destA = {
      name: factsA.displayName,
      flag: factsA.flag,
      pexelsQuery: factsA.pexels_query,
    };
    const destB = {
      name: factsB.displayName,
      flag: factsB.flag,
      pexelsQuery: factsB.pexels_query,
    };

    const defaultTags = ['#FlashVoyage', '#VsVoyage', '#Voyage', '#ComparaisonVoyage'];
    const hashtags = Array.isArray(parsed.hashtags) && parsed.hashtags.length >= 3
      ? parsed.hashtags
      : defaultTags;

    const caption = parsed.caption
      || `${destA.name} vs ${destB.name} : tu choisis quoi ? 👇\n\nCommente ton choix !`;

    console.log(
      `[REEL/VERSUS] Generated: "${destA.name}" vs "${destB.name}" — facts from whitelist, ` +
      `${parsed.articleSpotsA || parsed.articleSpotsB ? 'article-sourced spot overrides' : 'default spots'}`
    );

    return {
      type: 'versus',
      destA,
      destB,
      rows,
      caption,
      hashtags,
    };
  } catch (err) {
    console.error(`[REEL/VERSUS] Generation failed: ${err.message}`);
    return getFallbackScript(article);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncateValue(value, maxLen) {
  if (!value) return '—';
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1) + '…';
}

// ── Fallback when Haiku unavailable OR picks an unknown country ─────────────
// Uses only country-facts data — NO hardcoded values. If the article title
// explicitly compares two known destinations, we use those. Otherwise we
// pick a sensible SEA default (Thaïlande vs Vietnam).

function getFallbackScript(article) {
  const title = article.title || '';

  // Try to extract two destination names from the title
  const vsMatch = title.match(/(.+?)\s*(?:vs\.?|versus|ou|contre)\s*(.+)/i);
  let factsA = null;
  let factsB = null;

  if (vsMatch) {
    const nameA = vsMatch[1].trim().replace(/^(comparer|comparaison)\s*/i, '');
    const nameB = vsMatch[2].trim().replace(/[?!.:,;]+$/, '').split(/[?!.:,;]/)[0].trim();
    factsA = getCountryFacts(nameA);
    factsB = getCountryFacts(nameB);
  }

  // Secondary attempt: scan the title for any known countries/aliases
  if (!factsA || !factsB) {
    const scanned = scanForKnownCountries(title);
    if (scanned.length >= 2) {
      factsA = factsA || getCountryFacts(scanned[0]);
      factsB = factsB || getCountryFacts(scanned[1]);
    }
  }

  // Last resort: default to a safe SE Asia comparison
  if (!factsA) factsA = getCountryFacts('thailande');
  if (!factsB || factsB.key === factsA.key) factsB = getCountryFacts('vietnam');

  console.warn(
    `[REEL/VERSUS] Fallback chose: "${factsA.displayName}" vs "${factsB.displayName}" ` +
    `(from ${vsMatch ? 'title vs-pattern' : 'title scan/default'})`
  );

  const rows = buildRowsFromFacts(factsA, factsB);

  return {
    type: 'versus',
    destA: {
      name: factsA.displayName,
      flag: factsA.flag,
      pexelsQuery: factsA.pexels_query,
    },
    destB: {
      name: factsB.displayName,
      flag: factsB.flag,
      pexelsQuery: factsB.pexels_query,
    },
    rows,
    caption: `${factsA.displayName} vs ${factsB.displayName} : tu choisis quoi ? 👇\n\nCommente ton choix !`,
    hashtags: ['#FlashVoyage', '#VsVoyage', '#Voyage', '#ComparaisonVoyage', '#VoyageFR'],
  };
}

/**
 * Scan a string for known country names / aliases and return canonical keys
 * in order of appearance.
 */
function scanForKnownCountries(text) {
  if (!text) return [];
  const found = [];
  const seen = new Set();
  // Split on whitespace and punctuation, try each token and pair as a lookup
  const words = text.toLowerCase().split(/[\s,\-:;!?()[\]{}"'/]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    // Try 2-word phrase first (e.g. "sri lanka", "new zealand")
    if (i + 1 < words.length) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      const facts = getCountryFacts(phrase);
      if (facts && !seen.has(facts.key)) {
        found.push(phrase);
        seen.add(facts.key);
        i++; // skip next
        continue;
      }
    }
    const facts = getCountryFacts(words[i]);
    if (facts && !seen.has(facts.key)) {
      found.push(words[i]);
      seen.add(facts.key);
    }
  }
  return found;
}
