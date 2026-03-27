/**
 * FlashVoyage RSS News Scraper
 *
 * Scrapes travel/Asia news from RSS feeds and reformulates them
 * as viral French social media hooks using Claude Haiku.
 *
 * Dependencies (already in project): @anthropic-ai/sdk, xml2js
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXml = promisify(parseString);

// ─── RSS Sources (all verified working as of 2026-03-24) ───────────────────

const RSS_SOURCES = [
  {
    name: 'The Thaiger',
    url: 'https://thethaiger.com/feed',
    region: 'thailand',
    lang: 'en',
  },
  {
    name: 'Coconuts',
    url: 'https://coconuts.co/feed/',
    region: 'southeast-asia',
    lang: 'en',
  },
  {
    name: 'VnExpress International',
    url: 'https://e.vnexpress.net/rss/news.rss',
    region: 'vietnam',
    lang: 'en',
  },
  {
    name: 'Nikkei Asia',
    url: 'https://asia.nikkei.com/rss/feed/nar',
    region: 'asia',
    lang: 'en',
  },
  {
    name: 'Straits Times Asia',
    url: 'https://www.straitstimes.com/news/asia/rss.xml',
    region: 'southeast-asia',
    lang: 'en',
  },
  {
    name: 'Rappler',
    url: 'https://www.rappler.com/feed/',
    region: 'philippines',
    lang: 'en',
  },
  {
    name: 'Bali Discovery',
    url: 'https://www.balidiscovery.com/feed/',
    region: 'indonesia',
    lang: 'en',
  },
  {
    name: 'Channel News Asia',
    url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511',
    region: 'southeast-asia',
    lang: 'en',
  },
  {
    name: 'Bangkok Post',
    url: 'https://www.bangkokpost.com/rss/data/most-recent.xml',
    region: 'thailand',
    lang: 'en',
  },
  {
    name: 'SCMP Asia',
    url: 'https://www.scmp.com/rss/5/feed',
    region: 'asia',
    lang: 'en',
  },
];

// ─── Travel relevance keywords (for filtering) ─────────────────────────────

const TRAVEL_PRIORITY_KEYWORDS = [
  'visa', 'passport', 'flight', 'airline', 'airport', 'tourism', 'tourist',
  'hotel', 'resort', 'travel', 'backpack', 'border', 'immigration',
  'regulation', 'festival', 'temple', 'beach', 'island', 'route',
  'price', 'cost', 'budget', 'cheap', 'expensive', 'fare',
  'safety', 'warning', 'advisory', 'flood', 'earthquake', 'typhoon',
  'volcano', 'storm', 'evacuation', 'scam', 'danger',
  'new law', 'regulation', 'ban', 'permit', 'digital nomad',
  'train', 'railway', 'bus', 'ferry', 'cruise',
  'food', 'street food', 'restaurant', 'nightlife',
  'reopening', 'closure', 'landmark', 'heritage', 'UNESCO',
  'e-visa', 'visa-free', 'overstay', 'fine', 'deportation',
  'currency', 'exchange rate', 'atm', 'payment',
];

const SKIP_KEYWORDS = [
  'murder', 'rape', 'corruption', 'election', 'politician', 'senate',
  'parliament', 'lawsuit', 'court ruling', 'verdict', 'prosecution',
  'military coup', 'armed conflict', 'genocide', 'death penalty',
  'stock market', 'GDP', 'central bank', 'interest rate', 'bond yield',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return stripHtml(node);
  if (node._) return stripHtml(node._);
  if (Array.isArray(node)) return stripHtml(node[0]?._  || node[0] || '');
  return '';
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function hoursAgo(date) {
  if (!date) return Infinity;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60);
}

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
}

function isTravelRelevant(title, description) {
  const text = `${title} ${description}`.toLowerCase();

  // Check skip keywords first
  const hasSkipWord = SKIP_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
  if (hasSkipWord) {
    // Allow if it also has travel keywords (e.g. "court ruling on visa policy")
    const hasTravelWord = TRAVEL_PRIORITY_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
    if (!hasTravelWord) return { relevant: false, priority: 0 };
  }

  // Count travel keyword matches for priority scoring
  const matchCount = TRAVEL_PRIORITY_KEYWORDS.filter(kw =>
    text.includes(kw.toLowerCase())
  ).length;

  // Items with travel keywords get higher priority
  // Items with no travel keywords are still included but low priority
  return { relevant: true, priority: matchCount };
}

// ─── RSS Fetching ───────────────────────────────────────────────────────────

async function fetchSingleFeed(source) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FlashVoyage-Bot/1.0 (travel content aggregator)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[RSS] ${source.name}: HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const parsed = await parseXml(xml, { explicitArray: false, trim: true });

    // Handle both RSS 2.0 and Atom feeds
    let items = [];

    if (parsed.rss?.channel?.item) {
      // RSS 2.0
      const raw = parsed.rss.channel.item;
      items = Array.isArray(raw) ? raw : [raw];
    } else if (parsed.feed?.entry) {
      // Atom
      const raw = parsed.feed.entry;
      items = Array.isArray(raw) ? raw : [raw];
    } else if (parsed.rss?.channel) {
      // RSS with no items
      return [];
    }

    return items.map(item => {
      // RSS 2.0 fields
      let title = extractText(item.title);
      let description = extractText(item.description || item.summary || item['content:encoded']);
      let link = extractText(item.link);
      let pubDate = parseDate(extractText(item.pubDate || item.published || item.updated));

      // Atom: link might be an object with href attribute
      if (!link && item.link) {
        if (typeof item.link === 'object' && item.link.$ && item.link.$.href) {
          link = item.link.$.href;
        } else if (Array.isArray(item.link)) {
          const alt = item.link.find(l => l.$?.rel === 'alternate');
          link = alt?.$?.href || item.link[0]?.$?.href || '';
        }
      }

      // Truncate description to ~300 chars for the LLM
      if (description.length > 300) {
        description = description.substring(0, 300) + '...';
      }

      return {
        title,
        description,
        link,
        pubDate,
        source: source.name,
        region: source.region,
      };
    }).filter(item => item.title && item.link);

  } catch (err) {
    console.warn(`[RSS] ${source.name}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch all RSS feeds and return recent items (default: last 24h).
 * @param {number} maxAge - Maximum age in hours
 * @returns {Promise<Array>} Sorted, deduplicated news items
 */
export async function fetchLatestNews(maxAge = 24) {
  console.log(`[RSS] Fetching from ${RSS_SOURCES.length} sources (max ${maxAge}h)...`);

  const results = await Promise.allSettled(
    RSS_SOURCES.map(source => fetchSingleFeed(source))
  );

  let allItems = [];
  let sourceStats = {};

  for (let i = 0; i < results.length; i++) {
    const sourceName = RSS_SOURCES[i].name;
    if (results[i].status === 'fulfilled') {
      const items = results[i].value;
      sourceStats[sourceName] = items.length;
      allItems.push(...items);
    } else {
      sourceStats[sourceName] = 0;
      console.warn(`[RSS] ${sourceName}: failed - ${results[i].reason?.message}`);
    }
  }

  console.log(`[RSS] Raw items: ${allItems.length}`, sourceStats);

  // Filter by age
  const now = new Date();
  let recent = allItems.filter(item => {
    if (!item.pubDate) return true; // include items without date (might be recent)
    return hoursAgo(item.pubDate) <= maxAge;
  });

  // If we get very few items within maxAge, extend to 48h
  if (recent.length < 5) {
    console.log(`[RSS] Only ${recent.length} items in ${maxAge}h, extending to 48h...`);
    recent = allItems.filter(item => {
      if (!item.pubDate) return true;
      return hoursAgo(item.pubDate) <= 48;
    });
  }

  // Deduplicate by normalized title similarity
  const seen = new Set();
  const deduped = recent.filter(item => {
    const key = normalizeTitle(item.title);
    if (seen.has(key)) return false;
    // Also check for partial matches (70% overlap)
    for (const existing of seen) {
      if (key.length > 20 && existing.length > 20) {
        const shorter = key.length < existing.length ? key : existing;
        const longer = key.length >= existing.length ? key : existing;
        if (longer.includes(shorter.substring(0, Math.floor(shorter.length * 0.7)))) {
          return false;
        }
      }
    }
    seen.add(key);
    return true;
  });

  // Score and filter by travel relevance
  const scored = deduped.map(item => {
    const { relevant, priority } = isTravelRelevant(item.title, item.description);
    return { ...item, relevant, priority };
  }).filter(item => item.relevant);

  // Sort: highest priority first, then most recent
  scored.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.pubDate && b.pubDate) return b.pubDate - a.pubDate;
    return 0;
  });

  console.log(`[RSS] After filtering: ${scored.length} items (from ${recent.length} recent, ${deduped.length} deduped)`);

  return scored;
}

// ─── Haiku Reformulation ────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const REFORMULATION_PROMPT = `Tu es un rédacteur social media expert pour FlashVoyage, un média voyage Asie en français.

Transforme cette actualité anglophone en accroche virale pour les réseaux sociaux en français.

RÈGLES STRICTES :
- TOUT le texte en français avec accents corrects
- Ligne 1 = ACCROCHE CHOC/CURIOSITÉ en MAJUSCULES (max 60 caractères)
- Ligne 2 = contexte factuel (max 80 caractères)
- Ligne 3 = pourquoi ça intéresse les voyageurs français
- N'invente AUCUN fait, reformule uniquement ce qui est dans la source
- Ton : dynamique, informatif, pas clickbait mensonger
- Catégorise : visa | transport | prix | sécurité | insolite | festival | réglementation | destination

Réponds UNIQUEMENT en JSON valide, sans markdown :
{"headline1": "...", "headline2": "...", "subtext": "...", "category": "..."}`;

/**
 * Reformulate a news item as a viral French hook using Claude Haiku.
 * @param {Object} newsItem - { title, description, link, source, region }
 * @returns {Promise<Object>} { headline1, headline2, subtext, category, sourceUrl, sourceName, region }
 */
export async function reformulateAsHook(newsItem) {
  const userMessage = `Source: ${newsItem.source} (${newsItem.region})
Titre: ${newsItem.title}
Résumé: ${newsItem.description}
URL: ${newsItem.link}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        { role: 'user', content: `${REFORMULATION_PROMPT}\n\n---\n\n${userMessage}` }
      ],
    });

    const text = response.content[0]?.text?.trim();
    if (!text) throw new Error('Empty response from Haiku');

    // Parse JSON (handle potential markdown wrapping)
    let jsonStr = text;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr);

    return {
      headline1: parsed.headline1 || '',
      headline2: parsed.headline2 || '',
      subtext: parsed.subtext || '',
      category: parsed.category || 'destination',
      sourceUrl: newsItem.link,
      sourceName: newsItem.source,
      region: newsItem.region,
      originalTitle: newsItem.title,
      pubDate: newsItem.pubDate,
    };
  } catch (err) {
    console.warn(`[RSS] Reformulation failed for "${newsItem.title.substring(0, 50)}": ${err.message}`);
    return null;
  }
}

// ─── Full Pipeline ──────────────────────────────────────────────────────────

/**
 * Full pipeline: fetch -> filter -> reformulate -> return ready-to-publish items.
 * @param {number} limit - Maximum number of items to return (default 8)
 * @returns {Promise<Array>} Ready-to-publish news hooks
 */
export async function getNewsForToday(limit = 8) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[FlashVoyage RSS] Starting news pipeline (limit: ${limit})`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Fetch and filter
  const news = await fetchLatestNews(24);

  if (news.length === 0) {
    console.log('[RSS] No relevant news found.');
    return [];
  }

  // Take top N candidates (fetch more than limit to account for reformulation failures)
  const candidates = news.slice(0, Math.min(limit + 4, news.length));

  console.log(`[RSS] Reformulating ${candidates.length} items with Haiku...`);

  // Step 2: Reformulate in parallel (batches of 3 to avoid rate limits)
  const hooks = [];
  for (let i = 0; i < candidates.length && hooks.length < limit; i += 3) {
    const batch = candidates.slice(i, i + 3);
    const results = await Promise.allSettled(
      batch.map(item => reformulateAsHook(item))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        hooks.push(result.value);
      }
    }
  }

  const final = hooks.slice(0, limit);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[FlashVoyage RSS] Pipeline complete: ${final.length} hooks ready`);
  console.log(`${'='.repeat(60)}\n`);

  return final;
}

// ─── Exports ────────────────────────────────────────────────────────────────

export { RSS_SOURCES };
