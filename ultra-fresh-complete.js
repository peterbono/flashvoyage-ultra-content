#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import { Buffer } from 'buffer';
import fs from 'fs';

dotenv.config();

console.log('🚀 ULTRA-FRESH COMPLETE - Système de sources ultra-fraîches\n');

// Sources accessibles confirmées
const WORKING_SOURCES = {
  thailand_tourism: {
    name: 'Thailand Tourism Authority',
    url: 'https://www.tatnews.org/',
    type: 'tourism',
    keywords: ['thailand', 'thailande', 'bangkok', 'phuket', 'chiang mai', 'krabi'],
    working: true
  },
  korea_tourism: {
    name: 'Korea Tourism Organization',
    url: 'https://kto.visitkorea.or.kr/eng/news/',
    type: 'tourism',
    keywords: ['korea', 'coree', 'seoul', 'busan', 'jeju', 'incheon'],
    working: true
  },
  france_diplomatie: {
    name: 'France Diplomatie',
    url: 'https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/',
    type: 'safety',
    keywords: ['thailand', 'japan', 'korea', 'singapore', 'vietnam', 'asie'],
    working: true
  }
};

// Sources nomades spécialisées
const NOMADE_SOURCES = {
  nomadlist: {
    name: 'NomadList Blog',
    url: 'https://nomadlist.com/blog/rss',
    type: 'nomade',
    keywords: ['digital nomad', 'nomade numérique', 'coliving', 'visa', 'asie', 'asia'],
    working: true
  },
  remoteyear: {
    name: 'Remote Year Blog',
    url: 'https://remoteyear.com/blog/rss',
    type: 'nomade',
    keywords: ['digital nomad', 'nomade numérique', 'coliving', 'visa', 'asie', 'asia'],
    working: true
  },
  coliving: {
    name: 'Coliving.com Blog',
    url: 'https://coliving.com/blog/rss',
    type: 'nomade',
    keywords: ['coliving', 'coworking', 'nomade', 'asie', 'asia'],
    working: true
  },
  digitalnomad: {
    name: 'The Digital Nomad Asia',
    url: 'https://thedigitalnomad.asia/rss',
    type: 'nomade',
    keywords: ['digital nomad', 'nomade numérique', 'asie', 'asia', 'visa', 'coliving'],
    working: true
  }
};

// Sources alternatives (APIs)
const ALTERNATIVE_SOURCES = {
  reddit: {
    name: 'Reddit Travel',
    url: 'https://www.reddit.com/r/travel/new.json',
    type: 'community',
    keywords: ['asia', 'thailand', 'japan', 'korea', 'singapore', 'vietnam'],
    working: true
  },
  reddit_nomad: {
    name: 'Reddit Digital Nomad',
    url: 'https://www.reddit.com/r/digitalnomad/new.json',
    type: 'nomade',
    keywords: ['digital nomad', 'nomade numérique', 'coliving', 'visa', 'asie', 'asia'],
    working: true
  },
  reddit_expats: {
    name: 'Reddit Expats',
    url: 'https://www.reddit.com/r/expats/new.json',
    type: 'nomade',
    keywords: ['expat', 'expatrié', 'visa', 'asie', 'asia', 'nomade'],
    working: true
  },
  google_news: {
    name: 'Google News Asia',
    url: 'https://news.google.com/rss/search?q=travel+asia&hl=en&gl=US&ceid=US:en',
    type: 'news',
    keywords: ['asia', 'travel', 'thailand', 'japan', 'korea', 'singapore'],
    working: true
  },
  google_news_nomad: {
    name: 'Google News Digital Nomad',
    url: 'https://news.google.com/rss/search?q=digital+nomad+asia&hl=en&gl=US&ceid=US:en',
    type: 'nomade',
    keywords: ['digital nomad', 'nomade numérique', 'coliving', 'visa', 'asie', 'asia'],
    working: true
  }
};

// Configuration Reddit API
const REDDIT_API_CONFIG = {
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  userAgent: 'FlashVoyagesBot/1.0 (Travel Content Generator; +https://flashvoyage.com)',
  username: process.env.REDDIT_USERNAME || '',
  password: process.env.REDDIT_PASSWORD || ''
};

// Cache pour les tokens Reddit
let redditTokenCache = {
  token: null,
  expires: 0,
  refreshTime: 0
};

// Sources RSS alternatives fiables pour GitHub Actions
const FALLBACK_RSS_SOURCES = {
  travel_blogs: [
    {
      name: 'Google News Asia Travel',
      url: 'https://news.google.com/rss/search?q=asia+travel&hl=en&gl=US&ceid=US:en',
      keywords: ['asia', 'travel', 'tourism', 'destination', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Google News Digital Nomad',
      url: 'https://news.google.com/rss/search?q=digital+nomad+asia&hl=en&gl=US&ceid=US:en',
      keywords: ['digital nomad', 'remote work', 'nomad', 'coliving', 'coworking', 'visa', 'residence', 'tax', 'fiscal', 'budget', 'cost', 'living', 'accommodation', 'food', 'transport', 'internet', 'wifi', 'weather', 'season', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    }
  ],
  nomad_sources: [
    {
      name: 'Google News Coliving Asia',
      url: 'https://news.google.com/rss/search?q=coliving+asia&hl=en&gl=US&ceid=US:en',
      keywords: ['coliving', 'coworking', 'nomad', 'digital nomad', 'remote work', 'visa', 'residence', 'tax', 'fiscal', 'budget', 'cost', 'living', 'accommodation', 'food', 'transport', 'internet', 'wifi', 'weather', 'season', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Google News Visa Asia',
      url: 'https://news.google.com/rss/search?q=visa+asia+digital+nomad&hl=en&gl=US&ceid=US:en',
      keywords: ['visa', 'residence', 'tax', 'fiscal', 'nomad', 'digital nomad', 'remote work', 'coliving', 'coworking', 'budget', 'cost', 'living', 'accommodation', 'food', 'transport', 'internet', 'wifi', 'weather', 'season', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Google News Nomad Budget',
      url: 'https://news.google.com/rss/search?q=digital+nomad+budget+asia&hl=en&gl=US&ceid=US:en',
      keywords: ['digital nomad', 'budget', 'cost', 'living', 'asia', 'nomad', 'remote work', 'cheap', 'affordable', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Google News Nomad Community',
      url: 'https://news.google.com/rss/search?q=digital+nomad+community+asia&hl=en&gl=US&ceid=US:en',
      keywords: ['digital nomad', 'community', 'meetup', 'coworking', 'coliving', 'asia', 'nomad', 'remote work', 'networking', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Google News Vietnam Travel',
      url: 'https://news.google.com/rss/search?q=vietnam+travel+digital+nomad&hl=en&gl=US&ceid=US:en',
      keywords: ['vietnam', 'travel', 'nomad', 'digital nomad', 'ho chi minh', 'hanoi', 'da nang', 'visa', 'coliving', 'coworking', 'budget', 'cost', 'living']
    },
    {
      name: 'Google News Thailand Travel',
      url: 'https://news.google.com/rss/search?q=thailand+travel+digital+nomad&hl=en&gl=US&ceid=US:en',
      keywords: ['thailand', 'travel', 'nomad', 'digital nomad', 'bangkok', 'chiang mai', 'phuket', 'visa', 'coliving', 'coworking', 'budget', 'cost', 'living']
    },
    {
      name: 'Google News Japan Travel',
      url: 'https://news.google.com/rss/search?q=japan+travel+digital+nomad&hl=en&gl=US&ceid=US:en',
      keywords: ['japan', 'travel', 'nomad', 'digital nomad', 'tokyo', 'osaka', 'kyoto', 'visa', 'coliving', 'coworking', 'budget', 'cost', 'living']
    }
  ]
};

// Service proxy pour Reddit (API tierce)
const REDDIT_PROXY_SERVICES = [
  {
    name: 'Reddit API Proxy',
    url: 'https://api.reddit.com/r/travel/hot.json?limit=10',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    }
  },
  {
    name: 'Reddit JSON Proxy',
    url: 'https://www.reddit.com/r/travel/hot.json?limit=10&raw_json=1',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    }
  }
];


// Classe principale
class UltraFreshComplete {
  constructor() {
    this.articles = [];
    this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  }

  // -- SmartScore helpers --
  loadSubredditStats(subreddit) {
    // Minimal rolling stats stub; improve by persisting medians per subreddit.
    try {
      const raw = fs.readFileSync('./subreddit_stats.json', 'utf-8');
      const db = JSON.parse(raw);
      return db[subreddit] || { medianEngagement: 12 };
    } catch {
      return { medianEngagement: 12 };
    }
  }

  writeSmartAudit(entry) {
    try {
      fs.appendFileSync('./smartscore_audit.jsonl', JSON.stringify(entry) + '\n', 'utf-8');
    } catch (e) {
      console.warn('⚠️ Audit write failed:', e.message);
    }
  }

  consolidateSecondarySources(primaryCandidate, pool) {
    // Very lightweight consolidation: look for 1-2 articles in the pool sharing at least one Asia keyword.
    const asiaKeywords = ['thailand','vietnam','philippines','indonesia','japan','singapore','malaysia','taiwan','hong kong','chiang mai','bangkok','ho chi minh','bali','asia'];
    const title = (primaryCandidate.title || '').toLowerCase();
    const matches = pool.filter(a => {
      const t = (a.title || '').toLowerCase();
      return asiaKeywords.some(k => title.includes(k) && t.includes(k)) && a.link !== primaryCandidate.link;
    }).slice(0, 2);

    const consolidation = {
      secondary_count: matches.length,
      secondary_links: matches.map(m => m.link)
    };

    // Heuristic: bump actionability/credibility if we found corroboration.
    if (matches.length > 0 && primaryCandidate.smartScores) {
      primaryCandidate.smartScores.actionability = Math.min(
        15,
        (primaryCandidate.smartScores.actionability || 0) + 2 * matches.length
      );
      primaryCandidate.smartScores.credibility = Math.min(
        5,
        (primaryCandidate.smartScores.credibility || 0) + 1
      );
      // Recompute total using weights already defined globally
      const recomputedTotal = Object.entries(SMART_SCORE_WEIGHTS)
        .reduce((sum, [key, weight]) => sum + ((primaryCandidate.smartScores[key] || 0) * (weight / 10)), 0)
        + (primaryCandidate.smartScores.penalties || 0);
      primaryCandidate.smartScore = Math.round(recomputedTotal);
      primaryCandidate.smartDecision =
        recomputedTotal >= SMART_SCORE_THRESHOLDS.publish_primary
          ? 'primary_source'
          : recomputedTotal >= SMART_SCORE_THRESHOLDS.require_secondary
          ? 'secondary_source'
          : 'reject';
      primaryCandidate.consolidation = consolidation;
    }

    return primaryCandidate;
  }

  // -- Memory helpers for uniqueness & diversity --
  loadRecentTitles() {
    try {
      const raw = fs.readFileSync('./recent_titles.json', 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { titles: [], countries: {}, cities: {}, weekStamp: this.getWeekStamp() };
    }
  }

  saveRecentTitles(db) {
    try {
      fs.writeFileSync('./recent_titles.json', JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      console.warn('⚠️ Save recent_titles failed:', e.message);
    }
  }

  getWeekStamp() {
    const d = new Date();
    const onejan = new Date(d.getFullYear(), 0, 1);
    return `${d.getFullYear()}-W${Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7)}`;
  }

  // Simple bigram Jaccard similarity
  similarityBigram(a, b) {
    const grams = s => {
      const tokens = (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      const res = new Set();
      for (let i = 0; i < tokens.length - 1; i++) res.add(tokens[i] + ' ' + tokens[i + 1]);
      return res;
    };
    const A = grams(a), B = grams(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const g of A) if (B.has(g)) inter++;
    return inter / (A.size + B.size - inter);
  }

  // Diversity governance: enforce per-week caps (max 2 posts per city)
  applyDiversityQuotas(sortedArticles) {
    const mem = this.loadRecentTitles();
    const week = this.getWeekStamp();
    if (mem.weekStamp !== week) {
      mem.countries = {};
      mem.cities = {};
      mem.weekStamp = week;
    }
    const pick = [];
    for (const a of sortedArticles) {
      const meta = this.extractGeoMeta(a.title);
      const country = meta.country || 'unknown';
      const city = meta.city || 'unknown';
      const cityCount = mem.cities[city] || 0;

      // Max 2 articles par ville / semaine
      if (city !== 'unknown' && cityCount >= 2) continue;

      pick.push(a);
      mem.cities[city] = (mem.cities[city] || 0) + 1;
      mem.countries[country] = (mem.countries[country] || 0) + 1;
    }
    this.saveRecentTitles(mem);
    return pick;
  }

  // Extract simple geo entities from title for diversity (very lightweight)
  extractGeoMeta(title) {
    const t = (title || '').toLowerCase();
    const countries = ['thailand','vietnam','philippines','indonesia','japan','singapore','malaysia','taiwan','hong kong'];
    const cities = ['bangkok','chiang mai','phuket','krabi','pattaya','ho chi minh','hanoi','da nang','bali','jakarta','manila','cebu','tokyo','osaka','kyoto','singapore'];
    const foundCountry = countries.find(c => t.includes(c)) || null;
    const foundCity = cities.find(c => t.includes(c)) || null;
    return { country: foundCountry, city: foundCity };
  }

  // Map content signals to affiliate slots (for the generator downstream)
  mapAffiliateSlots(text) {
    const slots = [];
    const add = (slot, score) => slots.push({ slot, score });
    const s = (text || '').toLowerCase();
    if (/(flight|airport|airline|visa run|cheap flight)/.test(s)) add('flights', 8);
    if (/(hotel|hostel|airbnb|guesthouse|resort)/.test(s)) add('hotels', 8);
    if (/(sim|esim|wifi|internet|4g|5g)/.test(s)) add('esim', 7);
    if (/(coworking|coliving|workspace|wework)/.test(s)) add('coworking', 7);
    if (/(insurance|health|medical|travel insurance)/.test(s)) add('insurance', 6);
    if (/(bus|train|ferry|taxi|grab|bolt|metro|bts|mrt)/.test(s)) add('transport', 7);
    if (/(tour|activity|ticket|attraction|temple|island tour)/.test(s)) add('activities', 6);
    return slots.sort((a,b)=>b.score-a.score).slice(0,4);
  }

  // After final pick, update titles memory (for future uniqueness)
  updateRecentTitlesMemory(finalArticles) {
    const mem = this.loadRecentTitles();
    const titles = mem.titles || [];
    finalArticles.slice(0, 20).forEach(a => {
      const t = (a.title || '').trim();
      if (t && !titles.includes(t)) titles.push(t);
    });
    mem.titles = titles.slice(-200); // keep last 200
    this.saveRecentTitles(mem);
  }

  // Scraper Reddit
  async scrapeReddit() {
    try {
      console.log('🔍 Scraping Reddit r/travel...');
      
      // Délai pour respecter les rate limits Reddit
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await axios.get(ALTERNATIVE_SOURCES.reddit.url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0'
        },
        timeout: 20000
      });

      const posts = response.data.data?.children || [];
      const relevantPosts = [];

      posts.forEach(post => {
        const data = post.data;
        const title = data.title.toLowerCase();
        const selftext = (data.selftext || '').toLowerCase();
        
        // Vérifier la pertinence Asie
        const isRelevant = ALTERNATIVE_SOURCES.reddit.keywords.some(keyword =>
          title.includes(keyword) || selftext.includes(keyword)
        );

        if (isRelevant) {
          // Compute SmartScore
          const smart = this.computeSmartScore(data, this.loadSubredditStats('r/travel'));
          const audit = {
            post_id: data.id,
            subreddit: 'r/travel',
            title: data.title,
            url: 'https://reddit.com' + data.permalink,
            created_utc: data.created_utc,
            age_hours: Math.round((Date.now() - data.created_utc * 1000) / 3600000),
            scores: smart.scores,
            total: Math.round(smart.total),
            decision: smart.decision,
            contextual: smart.contextual || false,
            reasons: smart.reasons || []
          };
          this.writeSmartAudit(audit);

          relevantPosts.push({
            title: data.title,
            link: 'https://reddit.com' + data.permalink,
            content: data.selftext || '',
            date: new Date(data.created_utc * 1000).toISOString(),
            source: 'Reddit r/travel',
            type: 'community',
            relevance: Math.min(90, (this.calculateRelevance(data.title, data.selftext, ALTERNATIVE_SOURCES.reddit.keywords) + 30)),
            upvotes: data.ups,
            comments: data.num_comments,
            smartScore: Math.round(smart.total),
            smartDecision: smart.decision,
            smartScores: smart.scores,
            affiliateSlots: smart.affiliate_slots || [],
            geo: this.extractGeoMeta(data.title)
          });
        }
      });

      console.log(`✅ Reddit: ${relevantPosts.length} posts pertinents trouvés`);
      return relevantPosts;

    } catch (error) {
      console.error('❌ Erreur Reddit:', error.message);
      return [];
    }
  }

  // Scraper Google News
  async scrapeGoogleNews() {
    try {
      console.log('🔍 Scraping Google News Asia...');
      
      const response = await axios.get(ALTERNATIVE_SOURCES.google_news.url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 20000
      });

      // Parser le RSS XML
      const xmlText = response.data;
      const articles = [];
      
      // Extraction simple des articles (sans parser XML complet)
      const titleMatches = xmlText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || [];
      const linkMatches = xmlText.match(/<link>(.*?)<\/link>/g) || [];
      const pubDateMatches = xmlText.match(/<pubDate>(.*?)<\/pubDate>/g) || [];

      for (let i = 0; i < Math.min(titleMatches.length, 10); i++) {
        const title = titleMatches[i]?.replace(/<title><!\[CDATA\[(.*?)\]\]><\/title>/, '$1') || '';
        const link = linkMatches[i]?.replace(/<link>(.*?)<\/link>/, '$1') || '';
        const pubDate = pubDateMatches[i]?.replace(/<pubDate>(.*?)<\/pubDate>/, '$1') || '';

        if (title && link) {
          articles.push({
            title,
            link,
            content: '',
            date: pubDate,
            source: 'Google News Asia',
            type: 'news',
            relevance: this.calculateRelevance(title, '', ALTERNATIVE_SOURCES.google_news.keywords)
          });
        }
      }

      console.log(`✅ Google News: ${articles.length} articles trouvés`);
      return articles;

    } catch (error) {
      console.error('❌ Erreur Google News:', error.message);
      return [];
    }
  }

  // Scraper Reddit Nomade
  async scrapeRedditNomad() {
    try {
      console.log('🔍 Scraping Reddit Digital Nomad...');
      
      // Délai pour respecter les rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await axios.get(ALTERNATIVE_SOURCES.reddit_nomad.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0'
        },
        timeout: 20000
      });

      const posts = response.data.data.children;
      const relevantPosts = [];

      posts.forEach(post => {
        const data = post.data;
        const text = `${data.title} ${data.selftext || ''}`.toLowerCase();
        
        // Vérifier si le post contient des mots-clés nomades
        const hasNomadeKeywords = ALTERNATIVE_SOURCES.reddit_nomad.keywords.some(keyword =>
          text.includes(keyword.toLowerCase())
        );
        
        if (hasNomadeKeywords && data.ups > 2) { // Réduire le seuil d'upvotes
          // Compute SmartScore
          const smart = this.computeSmartScore(data, this.loadSubredditStats('r/digitalnomad'));
          const audit = {
            post_id: data.id,
            subreddit: 'r/digitalnomad',
            title: data.title,
            url: `https://reddit.com${data.permalink}`,
            created_utc: data.created_utc,
            age_hours: Math.round((Date.now() - data.created_utc * 1000) / 3600000),
            scores: smart.scores,
            total: Math.round(smart.total),
            decision: smart.decision,
            contextual: smart.contextual || false,
            reasons: smart.reasons || []
          };
          this.writeSmartAudit(audit);

          relevantPosts.push({
            title: data.title,
            link: `https://reddit.com${data.permalink}`,
            content: data.selftext || '',
            date: new Date(data.created_utc * 1000).toISOString(),
            source: 'Reddit Digital Nomad',
            type: 'nomade',
            relevance: Math.min(95, (this.calculateRelevance(data.title, data.selftext, ALTERNATIVE_SOURCES.reddit_nomad.keywords) + 40)),
            upvotes: data.ups,
            comments: data.num_comments,
            smartScore: Math.round(smart.total),
            smartDecision: smart.decision,
            smartScores: smart.scores,
            affiliateSlots: smart.affiliate_slots || [],
            geo: this.extractGeoMeta(data.title)
          });
        }
      });

      console.log(`✅ Reddit Nomade: ${relevantPosts.length} posts pertinents trouvés`);
      return relevantPosts;

    } catch (error) {
      console.error('❌ Erreur Reddit Nomade:', error.message);
      return [];
    }
  }

  // Scraper Google News Nomade
  async scrapeGoogleNewsNomad() {
    try {
      console.log('🔍 Scraping Google News Digital Nomad...');
      
      const response = await axios.get(ALTERNATIVE_SOURCES.google_news_nomad.url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 20000
      });

      // Parser le RSS XML
      const xmlText = response.data;
      const articles = [];
      
      // Extraction simple des articles (sans parser XML complet)
      const titleMatches = xmlText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || [];
      const linkMatches = xmlText.match(/<link>(.*?)<\/link>/g) || [];
      const pubDateMatches = xmlText.match(/<pubDate>(.*?)<\/pubDate>/g) || [];

      for (let i = 0; i < Math.min(titleMatches.length, 10); i++) {
        const title = titleMatches[i]?.replace(/<title><!\[CDATA\[(.*?)\]\]><\/title>/, '$1') || '';
        const link = linkMatches[i]?.replace(/<link>(.*?)<\/link>/, '$1') || '';
        const pubDate = pubDateMatches[i]?.replace(/<pubDate>(.*?)<\/pubDate>/, '$1') || '';

        if (title && link) {
          articles.push({
            title,
            link,
            content: '',
            date: pubDate,
            source: 'Google News Digital Nomad',
            type: 'nomade',
            relevance: this.calculateRelevance(title, '', ALTERNATIVE_SOURCES.google_news_nomad.keywords)
          });
        }
      }

      console.log(`✅ Google News Nomade: ${articles.length} articles trouvés`);
    return articles;

    } catch (error) {
      console.error('❌ Erreur Google News Nomade:', error.message);
      return [];
    }
  }

  // Fonctions de contenu simulé supprimées - utilisation uniquement de vrais flux RSS

  // Calculer la pertinence
  calculateRelevance(title, content, keywords) {
    const text = `${title} ${content}`.toLowerCase();
    let score = 0;
    
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (text.includes(keywordLower)) {
        score += 10;
        if (title.toLowerCase().includes(keywordLower)) {
          score += 5;
        }
      }
    });

    return Math.min(score, 100);
  }

  // Scraper toutes les sources
  async scrapeAllSources() {
    console.log('🚀 Démarrage du scraping ultra-fraîche...\n');
    
    const allArticles = [];
    const isGitHubActions = this.isGitHubActions();

    if (isGitHubActions) {
      console.log('⚠️ GitHub Actions détecté - Utilisation des sources alternatives\n');
      
      // Sources alternatives pour GitHub Actions
      const fallbackRSSArticles = await this.scrapeFallbackRSS();
      allArticles.push(...fallbackRSSArticles);

      // Tentative Reddit via API officielle (priorité)
      const redditOfficialArticles = await this.scrapeRedditOfficial();
      allArticles.push(...redditOfficialArticles);
      
      // Si pas d'articles via API, essayer le proxy
      if (redditOfficialArticles.length === 0) {
        console.log('⚠️ Reddit API échoué, tentative via proxy...');
        const redditProxyArticles = await this.scrapeRedditViaProxy();
        allArticles.push(...redditProxyArticles);
      }

      // Google News (fonctionne généralement)
      const googleArticles = await this.scrapeGoogleNews();
      allArticles.push(...googleArticles);

      const googleNomadArticles = await this.scrapeGoogleNewsNomad();
      allArticles.push(...googleNomadArticles);

      // Si aucune source ne fonctionne, on continue avec 0 articles
      if (allArticles.length === 0) {
        console.log('⚠️ Aucune source ne fonctionne - Aucun article généré');
      }
    } else {
      console.log('💻 Mode local - Utilisation de toutes les sources\n');
      
      // Scraper Reddit (mode local)
    const redditArticles = await this.scrapeReddit();
    allArticles.push(...redditArticles);

      // Scraper Reddit Nomade (mode local)
      const redditNomadArticles = await this.scrapeRedditNomad();
      allArticles.push(...redditNomadArticles);

    // Scraper Google News
    const googleArticles = await this.scrapeGoogleNews();
    allArticles.push(...googleArticles);

      // Scraper Google News Nomade
      const googleNomadArticles = await this.scrapeGoogleNewsNomad();
      allArticles.push(...googleNomadArticles);
    }

    // Contenu simulé supprimé - utilisation uniquement de vrais flux RSS

    // Trier avec priorité au SmartScore puis date
    allArticles.sort((a, b) => {
      const as = typeof a.smartScore === 'number' ? a.smartScore : -1;
      const bs = typeof b.smartScore === 'number' ? b.smartScore : -1;
      if (bs !== as) return bs - as;
      if (b.relevance !== a.relevance) return (b.relevance || 0) - (a.relevance || 0);
      return new Date(b.date) - new Date(a.date);
    });

    // Si le meilleur candidat est "secondary_source", tenter une consolidation rapide
    if (allArticles.length > 0 && allArticles[0].smartDecision === 'secondary_source') {
      const improved = this.consolidateSecondarySources(allArticles[0], allArticles.slice(1, 20));
      allArticles[0] = improved;
    }

    // Appliquer les quotas de diversité (max 2 par ville/semaine)
    const diversified = this.applyDiversityQuotas(allArticles);
    // Mettre à jour la mémoire des titres après sélection
    this.updateRecentTitlesMemory(diversified);

    console.log(`\n🎯 Total: ${diversified.length} articles ultra-fraîches trouvés (après quotas)`);
    return diversified;
  }

  // Afficher les résultats
  displayResults(articles) {
    console.log('\n📊 ARTICLES ULTRA-FRAÎCHES:\n');
    
    articles.slice(0, 8).forEach((article, index) => {
      const timeAgo = this.getTimeAgo(article.date);
      const fomoIcon = article.fomo ? '🔥' : '📰';
      const urgencyIcon = article.urgency === 'high' ? '🚨' : 
                         article.urgency === 'medium' ? '⚠️' : 'ℹ️';
      
      console.log(`${index + 1}. ${fomoIcon} ${urgencyIcon} ${article.title}`);
      console.log(`   Source: ${article.source}`);
      console.log(`   Type: ${article.type}`);
      console.log(`   Pertinence: ${article.relevance}/100`);
      console.log(`   Il y a: ${timeAgo}`);
      console.log(`   Lien: ${article.link}`);
      console.log(`   Widgets: ${(article.affiliateSlots||[]).map(s=>s.slot+':'+s.score).join(', ')}`);
      console.log('');
    });
  }

  // Calculer le temps écoulé
  getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffHours < 1) {
      return `${diffMinutes} minutes`;
    } else if (diffHours < 24) {
      return `${diffHours} heures`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} jours`;
    }
  }

  // Obtenir un token Reddit valide (avec cache et refresh)
  async getValidRedditToken() {
    const now = Date.now();
    
    // Vérifier si le token est encore valide (avec marge de 5 minutes)
    if (redditTokenCache.token && now < redditTokenCache.expires - 300000) {
      console.log('🔄 Utilisation du token Reddit en cache');
      return redditTokenCache.token;
    }
    
    console.log('🔑 Génération d\'un nouveau token Reddit...');
    
    // Délai avant authentification Reddit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Authentification Reddit avec password flow (correct pour script personnel)
    const credentials = Buffer.from(`${REDDIT_API_CONFIG.clientId}:${REDDIT_API_CONFIG.clientSecret}`).toString('base64');
    const form = new URLSearchParams();
    form.append('grant_type', 'password');
    form.append('username', REDDIT_API_CONFIG.username);
    form.append('password', REDDIT_API_CONFIG.password);
    form.append('scope', 'read');
    
    const authResponse = await axios.post('https://www.reddit.com/api/v1/access_token', 
      form.toString(),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'User-Agent': REDDIT_API_CONFIG.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      }
    );
    
    const accessToken = authResponse.data.access_token;
    const expiresIn = authResponse.data.expires_in || 3600; // 1 heure par défaut
    
    // Mettre en cache le token (sécurisé)
    redditTokenCache = {
      token: accessToken,
      expires: now + (expiresIn * 1000),
      refreshTime: now
    };
    
    // Vérification de sécurité : ne jamais logger le token
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_REDDIT_TOKEN) {
      console.warn('⚠️ ATTENTION: Token Reddit exposé en mode debug uniquement');
    }
    
    console.log(`✅ Token Reddit généré, expire dans ${expiresIn}s`);
    console.log('🔒 Token sécurisé - non exposé dans les logs');
    return accessToken;
  }

  // Scraper Reddit via API officielle
  async scrapeRedditOfficial() {
  try {
    console.log('🔍 Scraping Reddit via API officielle...');
    
    // Vérifier que tous les credentials sont présents (password flow)
    if (!REDDIT_API_CONFIG.clientId || !REDDIT_API_CONFIG.clientSecret || !REDDIT_API_CONFIG.username || !REDDIT_API_CONFIG.password) {
      console.log('❌ Credentials Reddit manquants - Passage aux sources alternatives');
      return [];
    }
    
    // Debug pour GitHub Actions
    console.log('🔍 Debug Reddit credentials:');
    console.log('Client ID présent:', !!REDDIT_API_CONFIG.clientId);
    console.log('Client Secret présent:', !!REDDIT_API_CONFIG.clientSecret);
    console.log('Username présent:', !!REDDIT_API_CONFIG.username);
    console.log('Password présent:', !!REDDIT_API_CONFIG.password);
    console.log('User-Agent:', REDDIT_API_CONFIG.userAgent);
    
    // Vérifier et rafraîchir le token si nécessaire
    const accessToken = await this.getValidRedditToken();
      
    // Scraper r/travel avec retry
    let travelResponse;
    let retries = 3;
    while (retries > 0) {
      try {
        travelResponse = await axios.get('https://oauth.reddit.com/r/travel/hot.json?limit=10', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': REDDIT_API_CONFIG.userAgent
          },
          timeout: 15000
        });
        break;
      } catch (error) {
        retries--;
        if (retries > 0) {
          console.log(`⚠️ Retry Reddit r/travel (${3 - retries}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw error;
        }
      }
    }
    
    // Délai entre les requêtes pour éviter le rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
      
    // Scraper r/digitalnomad avec retry
    let nomadResponse;
    retries = 3;
    while (retries > 0) {
      try {
        nomadResponse = await axios.get('https://oauth.reddit.com/r/digitalnomad/hot.json?limit=10', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': REDDIT_API_CONFIG.userAgent
          },
          timeout: 15000
        });
        break;
      } catch (error) {
        retries--;
        if (retries > 0) {
          console.log(`⚠️ Retry Reddit r/digitalnomad (${3 - retries}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw error;
        }
      }
    }
      
      const allArticles = [];
      
      // Traiter r/travel
      if (travelResponse.data?.data?.children) {
        travelResponse.data.data.children.forEach(post => {
          const data = post.data;
          const relevance = this.calculateRelevance(data.title, data.selftext, ALTERNATIVE_SOURCES.reddit.keywords);
          
          if (relevance >= 30) {
            allArticles.push({
              title: data.title,
              link: `https://reddit.com${data.permalink}`,
              content: data.selftext || '',
              date: new Date(data.created_utc * 1000).toISOString(),
              source: 'Reddit r/travel (API)',
              type: 'community',
              relevance: relevance
            });
          }
        });
      }
      
      // Traiter r/digitalnomad
      if (nomadResponse.data?.data?.children) {
        nomadResponse.data.data.children.forEach(post => {
          const data = post.data;
          const relevance = this.calculateRelevance(data.title, data.selftext, ALTERNATIVE_SOURCES.reddit.keywords);
          
          if (relevance >= 30) {
            allArticles.push({
              title: data.title,
              link: `https://reddit.com${data.permalink}`,
              content: data.selftext || '',
              date: new Date(data.created_utc * 1000).toISOString(),
              source: 'Reddit Digital Nomad (API)',
              type: 'nomade',
              relevance: relevance
            });
          }
        });
      }
      
      console.log(`✅ Reddit API: ${allArticles.length} articles trouvés`);
      return allArticles;
      
  } catch (error) {
    console.log(`❌ Erreur Reddit API: ${error.message}`);
    
    if (error.response?.status === 401) {
      console.log('🔑 Erreur d\'authentification Reddit - Vérifiez REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET');
      console.log('💡 Note: Reddit bloque souvent les requêtes automatisées sur GitHub Actions');
      console.log('✅ Le système bascule automatiquement sur les sources alternatives');
    } else if (error.code === 'ECONNRESET') {
      console.log('🌐 Connexion fermée par Reddit - Rate limiting possible');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('⏰ Timeout - Reddit trop lent');
    } else if (error.response?.status === 429) {
      console.log('⏰ Rate limit Reddit - Attendez avant de réessayer');
    } else if (error.response?.status === 403) {
      console.log('🚫 Accès refusé Reddit - Vérifiez les permissions');
    }
    
    return [];
  }
  }

  // Scraper Reddit via proxy (pour contourner GitHub Actions)
  async scrapeRedditViaProxy() {
    try {
      console.log('🔍 Scraping Reddit via proxy...');
      
      for (const proxy of REDDIT_PROXY_SERVICES) {
        try {
          console.log(`   Tentative via ${proxy.name}...`);
          
          const response = await axios.get(proxy.url, {
            headers: proxy.headers,
            timeout: 15000
          });

          if (response.data && response.data.data && response.data.data.children) {
            const articles = response.data.data.children.map(post => ({
              title: post.data.title,
              link: `https://reddit.com${post.data.permalink}`,
              content: post.data.selftext || '',
              date: new Date(post.data.created_utc * 1000).toISOString(),
              source: 'Reddit r/travel (Proxy)',
              type: 'community',
              relevance: this.calculateRelevance(post.data.title, post.data.selftext, ALTERNATIVE_SOURCES.reddit.keywords)
            }));

            console.log(`✅ Reddit Proxy: ${articles.length} articles trouvés via ${proxy.name}`);
            return articles;
          }
        } catch (proxyError) {
          console.log(`   ❌ ${proxy.name} échoué: ${proxyError.message}`);
          continue;
        }
      }

      console.log('⚠️ Reddit bloqué - Utilisation des sources alternatives uniquement');
      return [];
    } catch (error) {
      console.error('❌ Erreur Reddit Proxy:', error.message);
      return [];
    }
  }

  // Scraper sources RSS alternatives
  async scrapeFallbackRSS() {
    try {
      console.log('🔍 Scraping sources RSS alternatives...');
      
      const allArticles = [];
      
      // Scraper blogs de voyage
      for (const source of FALLBACK_RSS_SOURCES.travel_blogs) {
        try {
          console.log(`   Scraping ${source.name}...`);
          const articles = await this.scrapeRSSFeed(source.url, source.name, source.keywords);
          allArticles.push(...articles);
        } catch (error) {
          console.log(`   ❌ ${source.name} échoué: ${error.message}`);
        }
      }

      // Scraper sources nomades
      for (const source of FALLBACK_RSS_SOURCES.nomad_sources) {
        try {
          console.log(`   Scraping ${source.name}...`);
          const articles = await this.scrapeRSSFeed(source.url, source.name, source.keywords);
          allArticles.push(...articles);
        } catch (error) {
          console.log(`   ❌ ${source.name} échoué: ${error.message}`);
        }
      }

      console.log(`✅ Sources RSS alternatives: ${allArticles.length} articles trouvés`);
      return allArticles;
    } catch (error) {
      console.error('❌ Erreur sources RSS alternatives:', error.message);
      return [];
    }
  }

  // Scraper RSS feed générique
  async scrapeRSSFeed(url, sourceName, keywords) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/rss+xml, application/xml, text/xml'
        },
        timeout: 10000
      });

      const xmlText = response.data;
      const articles = [];
      
      // Extraction simple des articles
      const titleMatches = xmlText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || xmlText.match(/<title>(.*?)<\/title>/g) || [];
      const linkMatches = xmlText.match(/<link>(.*?)<\/link>/g) || [];
      const pubDateMatches = xmlText.match(/<pubDate>(.*?)<\/pubDate>/g) || [];

      for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
        const title = titleMatches[i]?.replace(/<title><!\[CDATA\[(.*?)\]\]><\/title>/, '$1') || 
                     titleMatches[i]?.replace(/<title>(.*?)<\/title>/, '$1') || '';
        const link = linkMatches[i]?.replace(/<link>(.*?)<\/link>/, '$1') || '';
        const pubDate = pubDateMatches[i]?.replace(/<pubDate>(.*?)<\/pubDate>/, '$1') || '';

        if (title && link) {
          articles.push({
            title: title.trim(),
            link: link.trim(),
            content: '',
            date: pubDate || new Date().toISOString(),
            source: sourceName,
            type: 'rss',
            relevance: this.calculateRelevance(title, '', keywords)
          });
        }
      }

      return articles;
    } catch (error) {
      throw new Error(`Erreur scraping ${sourceName}: ${error.message}`);
    }
  }


  // Détecter si on est sur GitHub Actions
  isGitHubActions() {
    return process.env.GITHUB_ACTIONS === 'true';
  }
}

// Fonction principale
async function main() {
  const scraper = new UltraFreshComplete();
  
  try {
    const articles = await scraper.scrapeAllSources();
    scraper.displayResults(articles);
    
    console.log('✅ Scraping ultra-fraîche terminé avec succès !');
    console.log(`📈 ${articles.length} articles pertinents trouvés`);
    console.log('\n🎯 PROCHAINES ÉTAPES:');
    console.log('1. Intégrer avec le système IA hybride');
    console.log('2. Configurer la publication automatique');
    console.log('3. Mettre en place le monitoring');
    
  } catch (error) {
    console.error('❌ Erreur lors du scraping:', error.message);
  }
}

// Exécution
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}


// === SMART REDDIT SOURCE SCORING v2 ===
// Nouveau moteur d'évaluation de posts Reddit pour FlashVoyages Asie

// Pondérations des sous-scores
const SMART_SCORE_WEIGHTS = {
  relevance_asia_nomad: 20,
  actionability: 15,
  engagement: 15,
  quality: 10,
  comments_value: 10,
  freshness_momentum: 10,
  credibility: 5,
  monetization_fit: 10,
  uniqueness: 5
};

// Seuils de décision
const SMART_SCORE_THRESHOLDS = {
  publish_primary: 70,
  require_secondary: 60
};

// Liste contextuelle sensible (non blacklist)
const CONTEXTUAL_TOPICS = ['politics', 'relationships', 'safety', 'scam', 'corruption', 'housing'];

// Calcul du SmartScore complet d’un post Reddit
UltraFreshComplete.prototype.computeSmartScore = function(postData, subredditStats) {
  const { title, selftext, ups, num_comments, created_utc, author, permalink } = postData;
  const text = `${title} ${selftext || ''}`.toLowerCase();

  const reasons = [];
  const contextual = (CONTEXTUAL_TOPICS || []).some(t => text.includes(t));

  const scores = {
    relevance_asia_nomad: 0,
    actionability: 0,
    engagement: 0,
    quality: 0,
    comments_value: 0,
    freshness_momentum: 0,
    credibility: 0,
    monetization_fit: 0,
    uniqueness: 0,
    penalties: 0
  };

  // 1. Pertinence Asie / Nomad
  const asiaKeywords = ['asia','thailand','vietnam','philippines','indonesia','japan','singapore','malaysia','taiwan','hong kong','chiang mai','bangkok','ho chi minh','bali'];
  if (asiaKeywords.some(k => text.includes(k))) scores.relevance_asia_nomad += 10;
  if (text.includes('nomad') || text.includes('visa') || text.includes('coworking') || text.includes('coliving')) scores.relevance_asia_nomad += 10;
  if (scores.relevance_asia_nomad >= 10) reasons.push('Asie détectée');
  if (scores.relevance_asia_nomad >= 20) reasons.push('Nomad/visa/coworking détecté');

  // 2. Actionnabilité
  if (/(price|cost|guide|visa|how to|where|address|recommend|tips|avoid)/i.test(text)) scores.actionability += 10;
  if (/(http|www|\.com)/i.test(text)) scores.actionability += 5;
  if (scores.actionability >= 10) reasons.push('Signaux actionnables (prix/guide/tips)');

  // 3. Engagement normalisé
  const hoursSince = (Date.now() - created_utc * 1000) / 3600000;
  const engagementVelocity = (ups + num_comments) / Math.max(hoursSince, 1);
  const subNorm = subredditStats?.medianEngagement || 10;
  scores.engagement = Math.min(15, (engagementVelocity / subNorm) * 10);

  // 4. Qualité linguistique
  const wordCount = selftext ? selftext.split(/\s+/).length : 0;
  if (wordCount > 120) scores.quality += 5;
  if (!/(fuck|hate|stupid|idiot)/i.test(text)) scores.quality += 5;

  // 5. Valeur commentaires (placeholder)
  scores.comments_value = Math.min(10, Math.log1p(num_comments) * 2);

  // 6. Fraîcheur
  if (hoursSince < 48) scores.freshness_momentum += 10;
  else if (hoursSince < 168) scores.freshness_momentum += 5;
  if (scores.freshness_momentum >= 10) reasons.push('Fraîcheur <48h');

  // 7. Crédibilité
  if (author && author.length > 2) scores.credibility += 3;
  if (ups > 10) scores.credibility += 2;

  // 8. Fit monétisation
  if (/(flight|hotel|insurance|coworking|coliving|wifi|sim|transport|taxi|bus|ferry)/i.test(text)) scores.monetization_fit += 10;

  // 9. Unicité vs mémoire récente (30 jours glissants approximés)
  let uniqueness = 5;
  try {
    const mem = this.loadRecentTitles();
    const maxSim = (mem.titles || []).reduce((m, t) => Math.max(m, this.similarityBigram(title, t)), 0);
    if (maxSim >= 0.5) uniqueness = 1;
    else if (maxSim >= 0.35) uniqueness = 3;
    else uniqueness = 5;
  } catch { /* keep default */ }
  scores.uniqueness = uniqueness;

  // 8bis. Affiliate slots mapping (for downstream generator)
  const affiliateSlots = this.mapAffiliateSlots(text);

  // 10. Pénalités
  if (!asiaKeywords.some(k => text.includes(k))) {
    // Si travel terms présents → malus léger, sinon malus fort
    scores.penalties -= /(travel|visa|cost|coworking|coliving|flight|hotel)/.test(text) ? 5 : 10;
  }
  if (/(politics|relationship|religion)/i.test(text) && !/(travel|visa|safety|culture|dating|coliving)/i.test(text))
    scores.penalties -= 15;

  // Règle contextualisée: si topic sensible détecté, exiger un minimum d'actionnabilité
  if (contextual && scores.actionability < 8) {
    scores.penalties -= 10;
    reasons.push('Contexte sensible sans actionnabilité suffisante (-10)');
  }

  // Calcul du total pondéré
  const total = Object.entries(SMART_SCORE_WEIGHTS)
    .reduce((sum, [key, weight]) => sum + (scores[key] * (weight / 10)), 0) + scores.penalties;

  return {
    title,
    url: `https://reddit.com${permalink}`,
    scores,
    total,
    decision:
      total >= SMART_SCORE_THRESHOLDS.publish_primary
        ? 'primary_source'
        : total >= SMART_SCORE_THRESHOLDS.require_secondary
        ? 'secondary_source'
        : 'reject',
    contextual,
    reasons,
    affiliate_slots: affiliateSlots
  };
};

// Exemple d'utilisation future :
// const smartResult = this.computeSmartScore(post.data, { medianEngagement: 12 });
// console.log(smartResult);

export default UltraFreshComplete;
