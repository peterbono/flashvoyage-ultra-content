/**
 * Leaderboard Script Generator — FlashVoyage Reels v2
 *
 * Generates top-10 country ranking content. Zero hallucination:
 *   - All country data comes from item-prices.js + country-facts.js
 *   - Haiku's only job is picking ONE leaderboard config from a fixed list
 *     based on what the article is about, then writing the caption/hashtags
 *   - If Haiku is unavailable or returns an unknown config id, the generator
 *     falls back to a deterministic rotation (day-of-year based)
 *
 * Output structure:
 * {
 *   type: 'leaderboard',
 *   configId: string,
 *   title: string,          // title with \n
 *   hook: string,           // 1-line hook text
 *   metricLabel: string,    // unit label for display
 *   items: Array<{ rank, key, displayName, flag, display }>,
 *   caption: string,
 *   hashtags: string[]
 * }
 */

import { createTrackedClient } from '../../tracked-anthropic.js';
import {
  LEADERBOARD_CONFIGS,
  getLeaderboardConfig,
  buildLeaderboard,
} from '../leaderboards.js';

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('leaderboard-generator');
  return _client;
}

const SYSTEM_PROMPT = `Tu es un créateur de Reels voyage pour FlashVoyage.
Tu choisis parmi une liste fixe de classements "Top 10 pays" lequel est le
plus pertinent pour un article donné, puis tu écris la caption du reel.

RÈGLE ABSOLUE : tu DOIS choisir un id de classement EXACTEMENT dans la
liste fournie. Tu ne génères pas de données chiffrées — celles-ci sont
gérées par le système.`;

function buildUserPrompt(article) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 2500);
  const list = LEADERBOARD_CONFIGS.map(
    (c) => `- ${c.id} → "${c.title.replace('\n', ' ')}"`
  ).join('\n');

  return `Depuis cet article, choisis LE classement le plus pertinent.

ARTICLE : ${title}
TEXTE : ${rawText}

CLASSEMENTS DISPONIBLES (choisis un id EXACT) :
${list}

Réponds UNIQUEMENT en JSON valide :
{
  "configId": "un id exact de la liste",
  "caption": "Caption Instagram courte (140 chars max), ton FlashVoyage direct, mentionne le thème du classement",
  "hashtags": ["#FlashVoyage", "#Top10Voyage", "#Voyage", "..."]
}

RÈGLES :
- "configId" DOIT être un id exact de la liste ci-dessus
- Si l'article n'est pas directement sur un thème de coût, choisis "cheapest-living" par défaut
- "caption" : format court, direct, anti-bullshit
- "hashtags" : 6-7, #FlashVoyage et #Top10Voyage en premier`;
}

/**
 * Deterministic fallback rotation based on day-of-year.
 * Ensures that if Haiku is unavailable, different leaderboards are still
 * shown across days (avoids always falling to the first config).
 */
function pickFallbackConfig() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const config = LEADERBOARD_CONFIGS[dayOfYear % LEADERBOARD_CONFIGS.length];
  console.warn(`[REEL/LEADERBOARD] Fallback config (day ${dayOfYear}): ${config.id}`);
  return config;
}

export async function generateLeaderboardScript(article) {
  console.log(`[REEL/LEADERBOARD] Generating script for: "${(article.title || '').slice(0, 60)}..."`);

  const client = getClient();
  let config = null;
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
        const jsonStr = jsonMatch[0]
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"');
        const parsed = JSON.parse(jsonStr);
        config = getLeaderboardConfig(parsed.configId);
        if (config) {
          caption = parsed.caption;
          hashtags = parsed.hashtags;
          console.log(`[REEL/LEADERBOARD] Haiku picked config: ${config.id}`);
        } else {
          console.warn(`[REEL/LEADERBOARD] Haiku picked unknown configId "${parsed.configId}", falling back`);
        }
      }
    } catch (err) {
      console.warn(`[REEL/LEADERBOARD] Haiku failed (${err.message}), falling back`);
    }
  } else {
    console.warn('[REEL/LEADERBOARD] ANTHROPIC_API_KEY not set — using fallback');
  }

  if (!config) {
    config = pickFallbackConfig();
  }

  const rawItems = buildLeaderboard(config);
  if (rawItems.length === 0) {
    throw new Error(`[REEL/LEADERBOARD] No items returned for config "${config.id}"`);
  }

  // Pad to 10 if fewer (in case of filters)
  const items = rawItems.map((item, i) => ({
    rank: i + 1,
    ...item,
  }));

  if (!caption) {
    caption = `${config.title.replace('\n', ' ')} 👇\n\nTu en as visité combien ?`;
  }
  if (!hashtags || !Array.isArray(hashtags) || hashtags.length < 3) {
    hashtags = ['#FlashVoyage', '#Top10Voyage', '#Voyage', '#VoyagePasCher', '#BudgetVoyage'];
  }

  console.log(`[REEL/LEADERBOARD] Ready: ${config.id} — top ${items.length}: ${items.map((i) => `${i.rank}.${i.displayName} ${i.display}`).slice(0, 3).join(', ')}...`);

  return {
    type: 'leaderboard',
    configId: config.id,
    title: config.title,
    hook: config.hook,
    metricLabel: config.metricLabel,
    items,
    caption,
    hashtags,
  };
}
