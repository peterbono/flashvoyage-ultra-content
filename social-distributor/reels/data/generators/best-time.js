/**
 * Best-time Script Generator — FlashVoyage Reels v2
 *
 * Generates "Best time to visit [region]" content. Zero hallucination:
 *   - Seasonal data comes from seasonal-data.js
 *   - Haiku's only job is picking ONE region id from a fixed list based on
 *     the article subject
 *   - Falls back to the SEA default if unavailable
 *
 * Output structure:
 * {
 *   type: 'best-time',
 *   regionId: string,
 *   title: string (with \n),
 *   hook: string,
 *   items: Array<{ key, displayName, flag, best_period, avoid_period, avoid_why, sweet_spot, sweet_spot_why }>,
 *   caption: string,
 *   hashtags: string[]
 * }
 */

import { createTrackedClient } from '../../tracked-anthropic.js';
import {
  REGIONS,
  getRegion,
  getAllRegionIds,
  getSeasonalData,
  buildMonthlyTimeline,
  SEASONAL_DATA_LAST_VERIFIED,
} from '../seasonal-data.js';
import { getCountryFacts } from '../country-facts.js';

let _client = null;
function getClient() {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = createTrackedClient('best-time-generator');
  return _client;
}

const SYSTEM_PROMPT = `Tu es un créateur de Reels voyage pour FlashVoyage.
Tu choisis parmi une liste fixe de "zones saisonnières" laquelle est la plus
pertinente pour un article donné. Les données saisonnières sont gérées par
le système — tu ne les génères PAS.`;

function buildUserPrompt(article) {
  const title = article.title || '';
  const rawText = (article.rawText || '').slice(0, 2500);
  const list = Object.values(REGIONS)
    .map((r) => `- ${r.id} → "${r.title.replace('\n', ' ')}" (${r.countries.length} pays)`)
    .join('\n');

  return `Depuis cet article, choisis LA zone saisonnière la plus pertinente.

ARTICLE : ${title}
TEXTE : ${rawText}

ZONES DISPONIBLES (choisis un id EXACT) :
${list}

Réponds UNIQUEMENT en JSON valide :
{
  "regionId": "un id exact de la liste",
  "caption": "Caption Instagram courte (140 chars max), ton FlashVoyage direct, mentionne la zone",
  "hashtags": ["#FlashVoyage", "#BestTime", "#Voyage", "..."]
}

RÈGLES :
- "regionId" DOIT être un id exact de la liste
- Si pas de match clair, choisis "sea" par défaut (Asie du Sud-Est)
- "caption" : direct, anti-bullshit, max 140 chars
- "hashtags" : 6-7, #FlashVoyage et #BestTime en premier`;
}

export async function generateBestTimeScript(article) {
  console.log(`[REEL/BEST-TIME] Generating script for: "${(article.title || '').slice(0, 60)}..."`);
  console.log(`[REEL/BEST-TIME] seasonal-data lastVerified: ${SEASONAL_DATA_LAST_VERIFIED}`);

  const client = getClient();
  let regionId = null;
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
        if (getRegion(parsed.regionId)) {
          regionId = parsed.regionId;
          caption = parsed.caption;
          hashtags = parsed.hashtags;
          console.log(`[REEL/BEST-TIME] Haiku picked region: ${regionId}`);
        } else {
          console.warn(`[REEL/BEST-TIME] Haiku picked unknown regionId "${parsed.regionId}", falling back`);
        }
      }
    } catch (err) {
      console.warn(`[REEL/BEST-TIME] Haiku failed (${err.message}), falling back`);
    }
  } else {
    console.warn('[REEL/BEST-TIME] ANTHROPIC_API_KEY not set — using fallback');
  }

  if (!regionId) regionId = 'sea';

  const region = getRegion(regionId);
  if (!region) {
    throw new Error(`[REEL/BEST-TIME] Unknown region "${regionId}"`);
  }

  const items = region.countries.map((key) => {
    const facts = getCountryFacts(key);
    const seasonal = getSeasonalData(key) || {};
    return {
      key,
      displayName: facts?.displayName || key,
      flag: facts?.flag || '🌍',
      best_period: seasonal.best_period || facts?.best_period || '—',
      avoid_period: seasonal.avoid_period || null,
      avoid_why: seasonal.avoid_why || null,
      sweet_spot: seasonal.sweet_spot || null,
      sweet_spot_why: seasonal.sweet_spot_why || null,
      // 12-slot timeline for the Gantt-style calendar reel
      timeline: buildMonthlyTimeline(seasonal),
    };
  });

  if (!caption) {
    caption = `${region.title.replace('\n', ' ')} — le vrai calendrier, sans bullshit. 👇`;
  }
  if (!hashtags || !Array.isArray(hashtags) || hashtags.length < 3) {
    hashtags = ['#FlashVoyage', '#BestTime', '#Voyage', '#AsieDuSudEst', '#GuideVoyage'];
  }

  console.log(
    `[REEL/BEST-TIME] Ready: ${regionId} — ${items.length} countries`
  );

  return {
    type: 'best-time',
    regionId,
    title: region.title,
    hook: region.hook,
    items,
    caption,
    hashtags,
  };
}
