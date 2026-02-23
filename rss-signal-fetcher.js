#!/usr/bin/env node

/**
 * RSS SIGNAL FETCHER
 * Fetche 4 feeds RSS voyage, filtre par pertinence, et cross-reference avec Reddit.
 *
 * Strategie : RSS = SIGNAL (detecte un sujet chaud), Reddit = SOURCE (angle terrain).
 * On ne publie jamais un article RSS seul — il faut un thread Reddit associe.
 *
 * Sources :
 * 1. Travel Off Path — alertes visa, advisories, destinations trending
 * 2. View from the Wing — disruptions aeriennes, programmes fidelite
 * 3. Simple Flying — news aviation
 * 4. Nomadic Matt — guides, digital nomad
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import xml2js from 'xml2js';
import { ASIA_DESTINATIONS } from './destinations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_FILE = path.join(__dirname, 'data', 'rss-processed.json');

const RSS_FEEDS = [
  { name: 'TravelOffPath', url: 'https://www.traveloffpath.com/feed/', weight: 1.0 },
  { name: 'ViewFromTheWing', url: 'https://viewfromthewing.com/feed/', weight: 0.8 },
  { name: 'SimpleFlying', url: 'https://simpleflying.com/feed/', weight: 0.6 },
  { name: 'NomadicMatt', url: 'https://www.nomadicmatt.com/travel-blog/feed/', weight: 0.7 },
];

const NEWS_KEYWORDS = [
  'visa', 'advisory', 'warning', 'alert', 'closed', 'reopened', 'ban',
  'new route', 'new rule', 'regulation', 'policy', 'requirement',
  'strike', 'cancelled', 'disruption', 'delay', 'airport',
  'digital nomad', 'remote work', 'co-working',
  'budget', 'cheap', 'deal', 'price drop', 'fee', 'tax',
  'schengen', 'passport', 'border', 'immigration', 'entry',
  'safety', 'danger', 'crime', 'scam', 'tourist trap',
];

const DESTINATION_KEYWORDS = ASIA_DESTINATIONS.map(d => d.toLowerCase());

class RssSignalFetcher {
  constructor() {
    this.processedItems = this._loadProcessed();
  }

  _loadProcessed() {
    try {
      if (fs.existsSync(PROCESSED_FILE)) {
        return JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return { items: [], lastFetch: null };
  }

  _saveProcessed() {
    try {
      fs.writeFileSync(PROCESSED_FILE, JSON.stringify(this.processedItems, null, 2));
    } catch (e) {
      console.warn(`⚠️ RSS: Failed to save processed items: ${e.message}`);
    }
  }

  _isAlreadyProcessed(guid) {
    return this.processedItems.items.includes(guid);
  }

  _markProcessed(guid) {
    if (!this.processedItems.items.includes(guid)) {
      this.processedItems.items.push(guid);
      if (this.processedItems.items.length > 500) {
        this.processedItems.items = this.processedItems.items.slice(-300);
      }
    }
  }

  // --- Fetch a single RSS feed ---

  async fetchFeed(feed) {
    try {
      const resp = await axios.get(feed.url, {
        timeout: 10000,
        headers: { 'User-Agent': 'FlashVoyage-Bot/1.0 (travel content)' },
      });
      const parser = new xml2js.Parser({ explicitArray: false, trim: true });
      const result = await parser.parseStringPromise(resp.data);

      const channel = result?.rss?.channel;
      if (!channel?.item) return [];

      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      return items.map(item => ({
        title: item.title || '',
        link: item.link || '',
        description: (item.description || '').replace(/<[^>]+>/g, '').substring(0, 500),
        pubDate: item.pubDate || '',
        guid: item.guid?._ || item.guid || item.link || '',
        categories: Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []),
        source: feed.name,
        weight: feed.weight,
      }));
    } catch (e) {
      console.warn(`⚠️ RSS: Failed to fetch ${feed.name}: ${e.message}`);
      return [];
    }
  }

  // --- Score an RSS item for relevance ---

  scoreItem(item) {
    const text = `${item.title} ${item.description}`.toLowerCase();
    let score = 0;
    const matchedKeywords = [];

    for (const kw of NEWS_KEYWORDS) {
      if (text.includes(kw)) {
        score += 10;
        matchedKeywords.push(kw);
      }
    }

    let hasDestination = false;
    const matchedDestinations = [];
    for (const dest of DESTINATION_KEYWORDS) {
      if (text.includes(dest)) {
        score += 15;
        hasDestination = true;
        matchedDestinations.push(dest);
      }
    }

    // Recency boost
    if (item.pubDate) {
      const pubDate = new Date(item.pubDate);
      const ageDays = (Date.now() - pubDate.getTime()) / 86400000;
      if (ageDays < 2) score += 20;
      else if (ageDays < 5) score += 10;
      else if (ageDays < 10) score += 5;
    }

    score *= item.weight;

    return {
      ...item,
      score: Math.round(score),
      matchedKeywords,
      matchedDestinations,
      hasDestination,
    };
  }

  // --- Fetch all feeds and filter ---

  async fetchAllFeeds(minScore = 15) {
    console.log('📡 RSS: Fetching travel news feeds...');
    const allItems = [];

    const feedResults = await Promise.all(RSS_FEEDS.map(f => this.fetchFeed(f)));
    for (const items of feedResults) {
      allItems.push(...items);
    }

    console.log(`📡 RSS: ${allItems.length} items total across ${RSS_FEEDS.length} feeds`);

    const scored = allItems
      .filter(item => !this._isAlreadyProcessed(item.guid))
      .map(item => this.scoreItem(item))
      .filter(item => item.score >= minScore)
      .sort((a, b) => b.score - a.score);

    console.log(`📡 RSS: ${scored.length} items with score >= ${minScore} (after dedup)`);
    for (const item of scored.slice(0, 5)) {
      console.log(`   ${item.score}pts | ${item.source} | ${item.title.substring(0, 80)}`);
    }

    return scored;
  }

  // --- Cross-reference with Reddit ---

  async crossRefReddit(rssItem, redditToken) {
    const searchTerms = [];

    if (rssItem.matchedDestinations.length > 0) {
      searchTerms.push(rssItem.matchedDestinations[0]);
    }

    const titleWords = rssItem.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'have', 'been', 'will', 'your', 'about'].includes(w));

    if (rssItem.matchedKeywords.length > 0) {
      searchTerms.push(rssItem.matchedKeywords[0]);
    }
    searchTerms.push(...titleWords.slice(0, 3));

    const query = [...new Set(searchTerms)].slice(0, 4).join(' ');
    if (!query) return null;

    const subreddits = ['travel', 'digitalnomad', 'solotravel'];

    for (const sub of subreddits) {
      try {
        const headers = redditToken
          ? { Authorization: `Bearer ${redditToken}`, 'User-Agent': 'FlashVoyage/1.0' }
          : { 'User-Agent': 'FlashVoyage/1.0' };

        const baseUrl = redditToken
          ? `https://oauth.reddit.com/r/${sub}/search.json`
          : `https://www.reddit.com/r/${sub}/search.json`;

        const resp = await axios.get(baseUrl, {
          params: { q: query, sort: 'relevance', t: 'month', limit: 5, restrict_sr: 'on' },
          headers,
          timeout: 10000,
        });

        const posts = resp.data?.data?.children || [];
        const validPosts = posts.filter(p => {
          const d = p.data;
          if (!d || d.removed_by_category) return false;
          if ((d.num_comments || 0) < 3) return false;
          if ((d.selftext || '').length < 50) return false;

          // Relevance check: Reddit post must share at least 1 keyword or destination with the RSS item
          const redditText = `${d.title} ${d.selftext}`.toLowerCase();
          const hasSharedKeyword = rssItem.matchedKeywords.some(kw => redditText.includes(kw));
          const hasSharedDest = rssItem.matchedDestinations.some(dest => redditText.includes(dest));
          if (!hasSharedKeyword && !hasSharedDest) return false;

          return true;
        });

        if (validPosts.length > 0) {
          const best = validPosts[0].data;
          console.log(`   ✅ RSS-Reddit match: r/${sub} "${best.title?.substring(0, 60)}..." (${best.num_comments} comments)`);
          return {
            subreddit: sub,
            title: best.title,
            url: `https://reddit.com${best.permalink}`,
            selftext: best.selftext,
            num_comments: best.num_comments,
            score: best.score,
            created_utc: best.created_utc,
            author: best.author,
          };
        }
      } catch (e) {
        if (e.response?.status === 429) {
          console.warn(`   ⚠️ Reddit rate limited on r/${sub}, skipping`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    return null;
  }

  // --- Main entry: find best RSS+Reddit match ---

  async findBestSignal(redditToken = null) {
    const rssItems = await this.fetchAllFeeds();
    if (rssItems.length === 0) {
      console.log('📡 RSS: No relevant news items found');
      return null;
    }

    console.log(`\n🔗 RSS: Cross-referencing top ${Math.min(rssItems.length, 8)} items with Reddit...`);

    for (const item of rssItems.slice(0, 8)) {
      console.log(`\n   Searching Reddit for: "${item.title.substring(0, 60)}..."`);
      const redditMatch = await this.crossRefReddit(item, redditToken);

      if (redditMatch) {
        this._markProcessed(item.guid);
        this._saveProcessed();

        return {
          source: 'rss+reddit',
          rssItem: {
            title: item.title,
            link: item.link,
            description: item.description,
            source: item.source,
            score: item.score,
            matchedKeywords: item.matchedKeywords,
            matchedDestinations: item.matchedDestinations,
          },
          redditPost: redditMatch,
          article: {
            title: redditMatch.title,
            link: redditMatch.url,
            source: `rss+reddit (${item.source})`,
            source_text: redditMatch.selftext,
            author: redditMatch.author,
            created_utc: redditMatch.created_utc,
            num_comments: redditMatch.num_comments,
            _rss_signal: item.title,
            _rss_source: item.source,
            _rss_keywords: item.matchedKeywords,
            _editorial_hint: 'news',
          },
        };
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log('📡 RSS: No RSS+Reddit cross-match found');

    // Mark top items as processed to avoid re-checking
    for (const item of rssItems.slice(0, 5)) {
      this._markProcessed(item.guid);
    }
    this._saveProcessed();

    return null;
  }
}

export default RssSignalFetcher;
