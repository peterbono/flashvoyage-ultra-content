#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import { Buffer } from 'buffer';
import fs from 'fs';
import { FORCE_OFFLINE, DRY_RUN } from './config.js';

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
    // UNIQUEMENT les destinations officielles: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
    keywords: [
      // Indonésie
      'indonesia', 'indonésie', 'bali', 'jakarta', 'yogyakarta', 'bandung', 'surabaya', 'medan', 'ubud', 'seminyak', 'canggu', 'lombok',
      // Vietnam
      'vietnam', 'viet nam', 'ho chi minh', 'hanoi', 'hồ chí minh', 'hà nội', 'da nang', 'đà nẵng', 'hue', 'huế', 'hoi an', 'hội an', 'nha trang', 'sapa', 'sa pa',
      // Thaïlande
      'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'chiangmai', 'phuket', 'krabi', 'pattaya', 'koh samui', 'koh phangan', 'koh tao', 'pai', 'ayutthaya', 'sukhothai',
      // Japon
      'japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'hokkaido', 'hokkaidō', 'hiroshima', 'nara', 'sapporo', 'fukuoka', 'okinawa', 'yokohama', 'nagoya', 'sendai',
      // Corée du Sud
      'korea', 'corée', 'south korea', 'corée du sud', 'seoul', 'séoul', 'busan', 'pusan', 'jeju', 'jeju island', 'incheon', 'daegu', 'gwangju', 'ulsan',
      // Philippines
      'philippines', 'philippine', 'manila', 'cebu', 'boracay', 'palawan', 'el nido', 'coron', 'siargao', 'bohol', 'davao', 'baguio', 'makati',
      // Singapour
      'singapore', 'singapour'
    ],
    working: true
  },
  reddit_nomad: {
    name: 'Reddit Digital Nomad',
    url: 'https://www.reddit.com/r/digitalnomad/new.json',
    type: 'nomade',
    // UNIQUEMENT les destinations officielles: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
    keywords: [
      // Mots-clés nomades génériques
      'digital nomad', 'nomade numérique', 'coliving', 'visa',
      // Indonésie
      'indonesia', 'indonésie', 'bali', 'jakarta', 'yogyakarta', 'bandung', 'surabaya', 'medan', 'ubud', 'seminyak', 'canggu', 'lombok',
      // Vietnam
      'vietnam', 'viet nam', 'ho chi minh', 'hanoi', 'hồ chí minh', 'hà nội', 'da nang', 'đà nẵng', 'hue', 'huế', 'hoi an', 'hội an', 'nha trang', 'sapa', 'sa pa',
      // Thaïlande
      'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'chiangmai', 'phuket', 'krabi', 'pattaya', 'koh samui', 'koh phangan', 'koh tao', 'pai', 'ayutthaya', 'sukhothai',
      // Japon
      'japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'hokkaido', 'hokkaidō', 'hiroshima', 'nara', 'sapporo', 'fukuoka', 'okinawa', 'yokohama', 'nagoya', 'sendai',
      // Corée du Sud
      'korea', 'corée', 'south korea', 'corée du sud', 'seoul', 'séoul', 'busan', 'pusan', 'jeju', 'jeju island', 'incheon', 'daegu', 'gwangju', 'ulsan',
      // Philippines
      'philippines', 'philippine', 'manila', 'cebu', 'boracay', 'palawan', 'el nido', 'coron', 'siargao', 'bohol', 'davao', 'baguio', 'makati',
      // Singapour
      'singapore', 'singapour'
    ],
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


// Headers réalistes pour Reddit (FIX 1)
function getRealisticRedditHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.reddit.com/',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
}

// Classe principale
class UltraFreshComplete {
  constructor() {
    this.articles = [];
    this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  }
  
  // FIX 2: Cascade JSON -> RSS -> fixtures pour Reddit
  async fetchRedditWithCascade(subreddit, keywords, extractGeoMeta, computeSmartScore, calculateRelevance, generateWidgetPlan, loadSubredditStats, writeSmartAudit) {
    // 1) FORCE_OFFLINE doit forcer Reddit en fixtures
    const forceOffline = FORCE_OFFLINE;
    const forceFixtures = process.env.FLASHVOYAGE_FORCE_FIXTURES === '1';
    const fixtureFile = subreddit === 'travel' 
      ? './data/fixtures/reddit-travel.json'
      : './data/fixtures/reddit-digitalnomad.json';
    
    // Si FORCE_OFFLINE=1, retourner directement les fixtures (aucun fetch réseau)
    if (forceOffline) {
      console.log(`🔒 FORCE_OFFLINE=1: utilisation fixtures Reddit pour r/${subreddit}`);
      return this.loadRedditFixtures(fixtureFile, subreddit, keywords, extractGeoMeta, generateWidgetPlan);
    }
    
    // A. Tenter endpoint JSON
    if (!forceFixtures) {
      try {
        const jsonUrl = `https://www.reddit.com/r/${subreddit}/hot.json?limit=25&raw_json=1`;
        const response = await axios.get(jsonUrl, {
          headers: getRealisticRedditHeaders(),
          timeout: 20000
        });
        
        const posts = response.data.data?.children || [];
        const relevantPosts = [];
        
        posts.forEach(post => {
          const data = post.data;
          const title = data.title.toLowerCase();
          const selftext = (data.selftext || '').toLowerCase();
          
          // FILTRE: Ignorer les posts sans contenu substantiel (images, liens, questions courtes)
          // Minimum 400 mots pour garantir un VRAI témoignage riche et détaillé
          // Les posts < 400 mots sont souvent de simples questions sans profondeur
          const wordCount = selftext.split(/\s+/).filter(w => w.length > 0).length;
          const hasContent = data.is_self && wordCount >= 400;
          if (!hasContent) {
            return; // Skip ce post (trop court pour un témoignage de qualité - minimum 400 mots)
          }
          
          const isRelevant = keywords.some(keyword => 
            title.includes(keyword) || selftext.includes(keyword)
          );
          
          if (isRelevant) {
            const smart = computeSmartScore(data, loadSubredditStats(`r/${subreddit}`));
            const audit = {
              post_id: data.id,
              subreddit: `r/${subreddit}`,
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
            writeSmartAudit(audit);
            
            // Construire source_text
            const selftext = data.selftext || '';
            const source_text = `${data.title}\n\n${selftext}`;
            
            relevantPosts.push({
              id: data.id,
              subreddit: `r/${subreddit}`,
              title: data.title,
              link: 'https://reddit.com' + data.permalink,
              content: selftext,
              source_text: source_text,
              date: new Date(data.created_utc * 1000).toISOString(),
              source: `Reddit r/${subreddit}`,
              type: subreddit === 'travel' ? 'community' : 'nomade',
              relevance: Math.min(90, (calculateRelevance(data.title, selftext, keywords) + 30)),
              upvotes: data.ups,
              comments: data.num_comments,
              author: data.author,
              created_utc: data.created_utc,
              smartScore: Math.round(smart.total),
              smartDecision: smart.decision,
              smartScores: smart.scores,
              affiliateSlots: smart.affiliate_slots || [],
              geo: extractGeoMeta(data.title),
              widget_plan: generateWidgetPlan(smart.affiliate_slots || [], extractGeoMeta(data.title)),
              source_reliability: 1.0, // JSON live = fiable
              is_degraded_source: false
            });
          }
        });
        
        if (relevantPosts.length > 0) {
          console.log(`✅ REDDIT_OK: mode=json count=${relevantPosts.length} sub=r/${subreddit}`);
          return relevantPosts;
        }
      } catch (error) {
        const status = error.response?.status || 'unknown';
        console.log(`⚠️ REDDIT_FETCH_FAIL: status=${status} sub=r/${subreddit} reason=${error.message}`);
        
        // Si 403/429/5xx, passer à RSS
        if (status === 403 || status === 429 || (status >= 500 && status < 600)) {
          console.log(`   → REDDIT_FALLBACK: mode=rss sub=r/${subreddit}`);
        } else {
          // Autre erreur, passer directement aux fixtures
          console.log(`   → REDDIT_FALLBACK: mode=fixtures sub=r/${subreddit} reason=network_error`);
          return this.loadRedditFixtures(fixtureFile, subreddit, keywords, extractGeoMeta, generateWidgetPlan);
        }
      }
    }
    
    // B. Fallback RSS
    if (!forceFixtures) {
      try {
        const rssUrl = `https://www.reddit.com/r/${subreddit}/.rss`;
        const response = await axios.get(rssUrl, {
          headers: getRealisticRedditHeaders(),
          timeout: 20000
        });
        
        const xmlText = response.data;
        const relevantPosts = [];
        
        // Parser RSS simple
        const titleMatches = xmlText.match(/<title>(.*?)<\/title>/g) || [];
        const linkMatches = xmlText.match(/<link>(.*?)<\/link>/g) || [];
        const authorMatches = xmlText.match(/<dc:creator>(.*?)<\/dc:creator>/g) || [];
        
        for (let i = 1; i < Math.min(titleMatches.length, 25); i++) { // Skip first (feed title)
          const title = titleMatches[i]?.replace(/<title>(.*?)<\/title>/, '$1') || '';
          const link = linkMatches[i]?.replace(/<link>(.*?)<\/link>/, '$1') || '';
          const author = authorMatches[i]?.replace(/<dc:creator>(.*?)<\/dc:creator>/, '$1') || 'unknown';
          
          if (title && link) {
            const titleLower = title.toLowerCase();
            const isRelevant = keywords.some(keyword => titleLower.includes(keyword));
            
            if (isRelevant) {
              // RSS n'a souvent pas de selftext, donc source_text minimal
              const source_text = `${title}\n\n${title}`; // Fallback minimal
              
              relevantPosts.push({
                title: title,
                link: link,
                content: '',
                source_text: source_text,
                date: new Date().toISOString(),
                source: `Reddit r/${subreddit}`,
                type: subreddit === 'travel' ? 'community' : 'nomade',
                relevance: 75,
                upvotes: 0,
                comments: 0,
                author: author,
                smartScore: 50,
                smartDecision: 'secondary_source',
                smartScores: {},
                affiliateSlots: [],
                geo: extractGeoMeta(title),
                widget_plan: generateWidgetPlan([], extractGeoMeta(title)),
                source_reliability: 0.6, // RSS = moins fiable (pas de selftext)
                is_degraded_source: true // RSS sans contenu = dégradé
              });
            }
          }
        }
        
        if (relevantPosts.length > 0) {
          console.log(`✅ REDDIT_OK: mode=rss count=${relevantPosts.length} sub=r/${subreddit}`);
          return relevantPosts;
        }
      } catch (error) {
        console.log(`⚠️ REDDIT_FALLBACK: mode=rss failed, reason=${error.message}`);
      }
    }
    
    // C. Fallback fixtures
    console.log(`⚠️ REDDIT_FALLBACK_FIXTURES: reason=${forceFixtures ? 'forced' : 'network_failed'} sub=r/${subreddit}`);
    return this.loadRedditFixtures(fixtureFile, subreddit, keywords, extractGeoMeta, generateWidgetPlan);
  }
  
  // Charger fixtures Reddit
  loadRedditFixtures(fixtureFile, subreddit, keywords, extractGeoMeta, generateWidgetPlan) {
    try {
      const fixtures = JSON.parse(fs.readFileSync(fixtureFile, 'utf-8'));
      
      // B) Validation source_text et enrichissement + garantie url + geo
      const validFixtures = fixtures.filter(item => {
        // B) Construire url standard si manquant
        if (!item.url && item.id) {
          item.url = `https://reddit.com/r/${subreddit}/comments/${item.id}/`;
        }
        
        // Construire source_text si manquant
        if (!item.source_text) {
          const selftext = item.selftext || item.content || '';
          const title = item.title || '';
          const comments = (item.comments_snippets || []).join('\n\n');
          item.source_text = `${title}\n\n${selftext}${comments ? '\n\n---\n\n' + comments : ''}`;
        }
        
        // Valider longueur minimale
        if (!item.source_text || item.source_text.length < 200) {
          console.log(`⚠️ FIXTURE_INVALID: missing source_text id=${item.id || 'unknown'} sub=r/${subreddit}`);
          return false;
        }
        
        // B) Garantir geo existe
        if (!item.geo) {
          item.geo = extractGeoMeta(item.title);
        }
        
        // Ajouter source_reliability si manquant
        if (item.source_reliability === undefined) {
          item.source_reliability = 1.0; // Fixtures = fiables
        }
        
        // Ajouter is_degraded_source si manquant
        if (item.is_degraded_source === undefined) {
          item.is_degraded_source = false;
        }
        
        return true;
      });
      
      console.log(`✅ REDDIT_OK: mode=fixtures count=${validFixtures.length} sub=r/${subreddit}`);
      return validFixtures;
    } catch (error) {
      console.error(`❌ Erreur chargement fixtures: ${error.message}`);
      return [];
    }
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
      const countryCount = mem.countries[country] || 0;

      // Max 2 articles par ville / semaine
      if (city !== 'unknown' && cityCount >= 2) continue;
      
      // Exemple de règle douce: viser au moins 3 pays distincts sur la semaine.
      // Ici on n'impose pas un hard block, mais on peut sauter un 3e/4e article d'un même pays
      if (country !== 'unknown' && countryCount >= 3) {
        continue; // saute les surplus pays
      }

      pick.push(a);
      mem.cities[city] = (mem.cities[city] || 0) + 1;
      mem.countries[country] = (mem.countries[country] || 0) + 1;
    }
    this.saveRecentTitles(mem);
    return pick;
  }

  // Extract simple geo entities from title for diversity (very lightweight)
  // UNIQUEMENT les destinations de la liste officielle: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
  extractGeoMeta(title) {
    const t = (title || '').toLowerCase();
    const countries = ['thailand','thaïlande','vietnam','philippines','indonesia','indonésie','japan','japon','korea','corée','singapore','singapour'];
    const cities = [
      // Thaïlande
      'bangkok','chiang mai','chiangmai','phuket','krabi','pattaya','koh samui','koh phangan','koh tao','pai',
      // Vietnam
      'ho chi minh','hanoi','hồ chí minh','hà nội','da nang','đà nẵng','hue','huế','hoi an','hội an','nha trang','sapa','sa pa',
      // Indonésie
      'bali','jakarta','yogyakarta','bandung','surabaya','medan','ubud','seminyak','canggu','lombok',
      // Philippines
      'manila','cebu','boracay','palawan','el nido','coron','siargao','bohol','davao','baguio','makati',
      // Japon
      'tokyo','kyoto','osaka','hokkaido','hokkaidō','hiroshima','nara','sapporo','fukuoka','okinawa','yokohama','nagoya','sendai',
      // Corée du Sud
      'seoul','séoul','busan','pusan','jeju','jeju island','incheon','daegu','gwangju','ulsan',
      // Singapour
      'singapore','singapour'
    ];
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

  // Build a provider-agnostic widget brief for the LLM (no positions decided here)
  generateWidgetPlan(affiliateSlots, geo) {
    const intents = Array.isArray(affiliateSlots) ? affiliateSlots.slice(0, 4) : [];
    const geo_defaults = geo || { country: null, city: null };
    return {
      intents, // [{slot, score}]
      providers: {
        flights: "Travelpayouts-Aviasales",
        hotels: "Travelpayouts-Hotels",
        transport: "12Go",
        activities: "Klook",
        esim: "Airalo",
        insurance: "SafetyWing",
        coworking: "Curated"
      },
      presets: {
        flights: "search_bar",
        hotels: "search_bar",
        transport: "route_tiles",
        activities: "route_tiles",
        esim: "compact_card",
        insurance: "compact_card",
        coworking: "compact_card"
      },
      caps: { desktop_max: 3, mobile_max: 2, min_paragraph_gap: 3, allow_above_fold: false },
      constraints: { disclosure_required: true, nofollow_sponsored: true, sensitive_page_soft_limit: true, visa_pages_max_widgets: 1 },
      geo_defaults,
      tracking: {
        utm_source: "flashvoyages",
        utm_medium: "affiliate",
        utm_campaign: `${geo_defaults.country || 'asia'}_${geo_defaults.city || 'general'}`,
        sub_id_schema: "{articleId}|{slot}|{country}_{city}"
      },
      inventory: { flights: "unknown", hotels: "unknown", transport: "ok", activities: "ok", esim: "ok", insurance: "ok" },
      hints: []
    };
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

  // Scraper Reddit (FIX 2: cascade JSON -> RSS -> fixtures)
  async scrapeReddit() {
      console.log('🔍 Scraping Reddit r/travel...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    return await this.fetchRedditWithCascade(
      'travel',
      ALTERNATIVE_SOURCES.reddit.keywords,
      (title) => this.extractGeoMeta(title),
      (data, stats) => this.computeSmartScore(data, stats),
      (title, text, keywords) => this.calculateRelevance(title, text, keywords),
      (slots, geo) => this.generateWidgetPlan(slots, geo),
      (sub) => this.loadSubredditStats(sub),
      (audit) => this.writeSmartAudit(audit)
    );
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
            relevance: this.calculateRelevance(title, '', ALTERNATIVE_SOURCES.google_news.keywords),
            affiliateSlots: this.mapAffiliateSlots(title),
            geo: this.extractGeoMeta(title),
            widget_plan: this.generateWidgetPlan(this.mapAffiliateSlots(title), this.extractGeoMeta(title))
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
  // Scraper Reddit Nomad (FIX 2: cascade JSON -> RSS -> fixtures)
  async scrapeRedditNomad() {
      console.log('🔍 Scraping Reddit Digital Nomad...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    return await this.fetchRedditWithCascade(
      'digitalnomad',
      ALTERNATIVE_SOURCES.reddit_nomad.keywords,
      (title) => this.extractGeoMeta(title),
      (data, stats) => this.computeSmartScore(data, stats),
      (title, text, keywords) => this.calculateRelevance(title, text, keywords),
      (slots, geo) => this.generateWidgetPlan(slots, geo),
      (sub) => this.loadSubredditStats(sub),
      (audit) => this.writeSmartAudit(audit)
    );
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
            relevance: this.calculateRelevance(title, '', ALTERNATIVE_SOURCES.google_news_nomad.keywords),
            affiliateSlots: this.mapAffiliateSlots(title),
            geo: this.extractGeoMeta(title),
            widget_plan: this.generateWidgetPlan(this.mapAffiliateSlots(title), this.extractGeoMeta(title))
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
    
    // NOUVEAU: Bonus pour contenu riche (favorise les témoignages détaillés)
    const contentLength = content.length;
    if (contentLength > 500) score += 15;
    if (contentLength > 1000) score += 10;
    if (contentLength > 2000) score += 10;

    return Math.min(score, 100);
  }

  // Scraper toutes les sources
  async scrapeAllSources(requireCommunityTestimonial = false) {
    console.log('🚀 Démarrage du scraping ultra-fraîche...\n');
    
    // FIX 5: Désactiver scraping news si format témoignage requis
    if (requireCommunityTestimonial) {
      console.log('💬 Format témoignage requis - Désactivation des sources news (CNN, Skift, Google News)\n');
    }
    
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

      // FIX 5: Google News uniquement si format témoignage non requis
      if (!requireCommunityTestimonial) {
      const googleArticles = await this.scrapeGoogleNews();
      allArticles.push(...googleArticles);

      const googleNomadArticles = await this.scrapeGoogleNewsNomad();
      allArticles.push(...googleNomadArticles);
      }

      // Si aucune source ne fonctionne, on continue avec 0 articles
      if (allArticles.length === 0) {
        console.log('⚠️ Aucune source ne fonctionne - Aucun article généré');
      }
    } else {
      console.log('💻 Mode local - Utilisation de toutes les sources\n');
      
      // FIX 5: Sources professionnelles d'actualités uniquement si format témoignage non requis
      if (!requireCommunityTestimonial) {
      // PRIORITÉ 1: Sources professionnelles d'actualités (CNN, Skift)
      console.log('📰 Scraping sources professionnelles d\'actualités...');
      try {
        // CNN Travel RSS
        const cnnArticles = await this.scrapeRSSFeed(
          'http://rss.cnn.com/rss/edition_travel.rss',
          'CNN Travel',
          ['asia', 'travel', 'thailand', 'japan', 'korea', 'singapore', 'vietnam', 'philippines', 'indonesia', 'visa', 'nomad']
        );
        allArticles.push(...cnnArticles);
        console.log(`✅ CNN Travel: ${cnnArticles.length} articles trouvés`);
      } catch (error) {
        console.log(`⚠️ CNN Travel échoué: ${error.message}`);
      }

      try {
        // Skift RSS
        const skiftArticles = await this.scrapeRSSFeed(
          'https://skift.com/feed/',
          'Skift',
          ['asia', 'travel', 'tourism', 'hotel', 'airline', 'visa', 'nomad', 'digital nomad', 'remote work']
        );
        allArticles.push(...skiftArticles);
        console.log(`✅ Skift: ${skiftArticles.length} articles trouvés`);
      } catch (error) {
        console.log(`⚠️ Skift échoué: ${error.message}`);
      }

      // PRIORITÉ 3: Google News
      const googleArticles = await this.scrapeGoogleNews();
      allArticles.push(...googleArticles);

      // Scraper Google News Nomade
      const googleNomadArticles = await this.scrapeGoogleNewsNomad();
      allArticles.push(...googleNomadArticles);
      }

      // PRIORITÉ 2: Reddit (mode local) - TOUJOURS activé (source principale pour témoignages)
      console.log('🔍 Scraping Reddit (source principale pour témoignages)...');
      try {
        const redditArticles = await this.scrapeReddit();
        allArticles.push(...redditArticles);
        console.log(`✅ Reddit: ${redditArticles.length} articles trouvés`);
      } catch (error) {
        console.log(`⚠️ Reddit échoué: ${error.message}`);
      }

      try {
        // Scraper Reddit Nomade (mode local) - TOUJOURS activé
        const redditNomadArticles = await this.scrapeRedditNomad();
        allArticles.push(...redditNomadArticles);
        console.log(`✅ Reddit Nomade: ${redditNomadArticles.length} articles trouvés`);
      } catch (error) {
        console.log(`⚠️ Reddit Nomade échoué: ${error.message}`);
      }
    }

    // Contenu simulé supprimé - utilisation uniquement de vrais flux RSS

    // Calculer l'urgence pour chaque article (AVANT le tri)
    allArticles.forEach(article => {
      article.urgencyScore = this.calculateUrgencyScore(article);
    });

    // Trier avec priorité ABSOLUE à l'urgence, puis SmartScore puis date
    allArticles.sort((a, b) => {
      // PRIORITÉ 1: Urgence (high = 3, medium = 2, low = 1)
      const urgencyOrder = { 'high': 3, 'medium': 2, 'low': 1, undefined: 0 };
      const aUrgency = urgencyOrder[a.urgencyScore] || 0;
      const bUrgency = urgencyOrder[b.urgencyScore] || 0;
      if (bUrgency !== aUrgency) return bUrgency - aUrgency;
      
      // PRIORITÉ 2: SmartScore (pour Reddit)
      const as = typeof a.smartScore === 'number' ? a.smartScore : -1;
      const bs = typeof b.smartScore === 'number' ? b.smartScore : -1;
      if (bs !== as) return bs - as;
      
      // PRIORITÉ 3: Relevance
      if (b.relevance !== a.relevance) return (b.relevance || 0) - (a.relevance || 0);
      
      // PRIORITÉ 4: Date (plus récent en premier)
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
      console.log(`   Plan: ${(article.widget_plan?.intents||[]).map(i=>i.slot+':'+i.score).join(', ')}`);
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
            // ✅ Calculer SmartScore ici aussi
            const smart = this.computeSmartScore(data, this.loadSubredditStats('r/travel'));
            const audit = {
              post_id: data.id,
              subreddit: 'r/travel',
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

            allArticles.push({
              title: data.title,
              link: `https://reddit.com${data.permalink}`,
              content: data.selftext || '',
              date: new Date(data.created_utc * 1000).toISOString(),
              source: 'Reddit r/travel (API)',
              type: 'community',
              relevance: relevance,
              smartScore: Math.round(smart.total),
              smartDecision: smart.decision,
              smartScores: smart.scores,
              affiliateSlots: smart.affiliate_slots || [],
              geo: this.extractGeoMeta(data.title),
              widget_plan: this.generateWidgetPlan(smart.affiliate_slots || [], this.extractGeoMeta(data.title))
            });
          }
        });
      }
      
      // Traiter r/digitalnomad
      if (nomadResponse.data?.data?.children) {
        nomadResponse.data.data.children.forEach(post => {
          const data = post.data;
          // ⚠️ utiliser le bon dictionnaire
          const relevance = this.calculateRelevance(
            data.title, 
            data.selftext, 
            ALTERNATIVE_SOURCES.reddit_nomad.keywords
          );

          if (relevance >= 30) {
            // ✅ Calculer SmartScore ici aussi
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

            allArticles.push({
              title: data.title,
              link: `https://reddit.com${data.permalink}`,
              content: data.selftext || '',
              date: new Date(data.created_utc * 1000).toISOString(),
              source: 'Reddit Digital Nomad (API)',
              type: 'nomade',
              relevance: relevance,
              smartScore: Math.round(smart.total),
              smartDecision: smart.decision,
              smartScores: smart.scores,
              affiliateSlots: smart.affiliate_slots || [],
              geo: this.extractGeoMeta(data.title),
              widget_plan: this.generateWidgetPlan(smart.affiliate_slots || [], this.extractGeoMeta(data.title))
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
            const children = response.data.data.children;
            const articles = [];
            for (const post of children) {
              const data = post.data;
              const relevance = this.calculateRelevance(data.title, data.selftext, ALTERNATIVE_SOURCES.reddit.keywords);
              // Calculate SmartScore for proxy results as well
              const smart = this.computeSmartScore(data, this.loadSubredditStats('r/travel'));
              
              if (relevance >= 30) {
                const audit = {
                  post_id: data.id,
                  subreddit: 'r/travel',
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

                const geo = this.extractGeoMeta(data.title);
                articles.push({
                  title: data.title,
                  link: `https://reddit.com${data.permalink}`,
                  content: data.selftext || '',
                  date: new Date(data.created_utc * 1000).toISOString(),
                  source: 'Reddit r/travel (Proxy)',
                  type: 'community',
                  relevance: relevance,
                  smartScore: Math.round(smart.total),
                  smartDecision: smart.decision,
                  smartScores: smart.scores,
                  affiliateSlots: smart.affiliate_slots || [],
                  geo,
                  widget_plan: this.generateWidgetPlan(smart.affiliate_slots || [], geo)
                });
              }
            }

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
      
      // Détecter si c'est une source d'actualité professionnelle
      const isProfessionalNews = sourceName && 
        (sourceName.toLowerCase().includes('cnn') || 
         sourceName.toLowerCase().includes('skift') || 
         sourceName.toLowerCase().includes('travel news'));
      
      // Extraction simple des articles
      const titleMatches = xmlText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || xmlText.match(/<title>(.*?)<\/title>/g) || [];
      const linkMatches = xmlText.match(/<link>(.*?)<\/link>/g) || [];
      const pubDateMatches = xmlText.match(/<pubDate>(.*?)<\/pubDate>/g) || [];
      const descriptionMatches = xmlText.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/g) || 
                                 xmlText.match(/<description>(.*?)<\/description>/g) || [];

      for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
        const title = titleMatches[i]?.replace(/<title><!\[CDATA\[(.*?)\]\]><\/title>/, '$1') || 
                     titleMatches[i]?.replace(/<title>(.*?)<\/title>/, '$1') || '';
        const link = linkMatches[i]?.replace(/<link>(.*?)<\/link>/, '$1') || '';
        const pubDate = pubDateMatches[i]?.replace(/<pubDate>(.*?)<\/pubDate>/, '$1') || '';
        const description = descriptionMatches[i]?.replace(/<description><!\[CDATA\[(.*?)\]\]><\/description>/, '$1') || 
                           descriptionMatches[i]?.replace(/<description>(.*?)<\/description>/, '$1') || '';

        // CORRECTION: Filtrer les titres de flux RSS (ex: "Skift", "CNN Travel")
        // Ce sont des entrées qui ne sont pas des articles mais des métadonnées du flux
        const titleLower = title.toLowerCase().trim();
        const isFeedTitle = titleLower === sourceName.toLowerCase() || 
                           titleLower === 'feed' ||
                           titleLower === 'rss feed' ||
                           (link && (link === 'https://skift.com/' || link === 'https://skift.com' || link.includes('skift.com/feed'))) ||
                           (link && (link === 'http://rss.cnn.com/rss/edition_travel.rss' || link.includes('cnn.com/rss')));
        
        if (title && link && !isFeedTitle) {
          articles.push({
            title: title.trim(),
            link: link.trim(),
            content: description ? description.trim().substring(0, 500) : '',
            date: pubDate || new Date().toISOString(),
            source: sourceName,
            type: isProfessionalNews ? 'news' : 'rss', // Type 'news' pour CNN/Skift
            relevance: this.calculateRelevance(title, description || '', keywords),
            affiliateSlots: this.mapAffiliateSlots(title),
            geo: this.extractGeoMeta(title),
            widget_plan: this.generateWidgetPlan(this.mapAffiliateSlots(title), this.extractGeoMeta(title))
          });
        }
      }

      return articles;
    } catch (error) {
      throw new Error(`Erreur scraping ${sourceName}: ${error.message}`);
    }
  }


  // Calculer le score d'urgence d'un article
  // CORRECTION: Ne pas donner boost automatique aux sources pro sans mots-clés urgents
  calculateUrgencyScore(article) {
    const text = `${article.title} ${article.content || ''}`.toLowerCase();
    const source = article.source ? article.source.toLowerCase() : '';
    
    // Mots-clés urgents
    const urgentKeywords = [
      'visa', 'nouveau visa', 'changement visa', 'réglementation',
      'alerte', 'important', 'urgent', 'immédiat', 'breaking',
      'nouveau', 'changement', 'mise à jour', 'announcement',
      'fermeture', 'réouverture', 'restriction', 'interdiction'
    ];
    
    // Source professionnelle
    const isProfessionalNews = source.includes('cnn') ||
                                source.includes('skift') ||
                                source.includes('travel news') ||
                                article.type === 'news';
    
    // Fraîcheur (< 24h = boost)
    const hoursSince = article.date ? 
      (Date.now() - new Date(article.date).getTime()) / 3600000 : 999;
    const isFresh = hoursSince < 24;
    
    // Détecter mots-clés urgents
    const hasUrgentKeyword = urgentKeywords.some(keyword => text.includes(keyword));
    
    // Calculer le score d'urgence
    // CORRECTION: Source pro sans mots-clés urgents = low (pas medium automatique)
    if (hasUrgentKeyword && isProfessionalNews && isFresh) {
      return 'high'; // Actualité urgente + source pro + fraîche
    } else if (hasUrgentKeyword && isFresh) {
      return 'medium'; // Actualité importante + fraîche
    } else if (hasUrgentKeyword) {
      return 'medium'; // Actualité importante
    }
    
    // Source pro sans mots-clés urgents = low (pas de boost automatique)
    // Cela permet à Reddit d'être sélectionné si son SmartScore est meilleur
    return 'low'; // Pas d'urgence (news pro sans mots-clés urgents inclus)
  }

  // Détecter si on est sur GitHub Actions
  isGitHubActions() {
    return process.env.GITHUB_ACTIONS === 'true';
  }
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

  // 1. Pertinence Asie / Nomad - UNIQUEMENT les destinations de la liste officielle
  // Liste officielle: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
  const asiaKeywords = [
    // Indonésie
    'indonesia', 'indonésie', 'bali', 'jakarta', 'yogyakarta', 'bandung', 'surabaya', 'medan', 'ubud', 'seminyak', 'canggu', 'lombok',
    // Vietnam
    'vietnam', 'viet nam', 'ho chi minh', 'hanoi', 'hồ chí minh', 'hà nội', 'da nang', 'đà nẵng', 'hue', 'huế', 'hoi an', 'hội an', 'nha trang', 'sapa', 'sa pa',
    // Thaïlande
    'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'chiangmai', 'phuket', 'krabi', 'pattaya', 'koh samui', 'koh phangan', 'koh tao', 'pai', 'ayutthaya', 'sukhothai',
    // Japon
    'japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'hokkaido', 'hokkaidō', 'hiroshima', 'nara', 'sapporo', 'fukuoka', 'okinawa', 'yokohama', 'nagoya', 'sendai',
    // Corée du Sud
    'korea', 'corée', 'south korea', 'corée du sud', 'seoul', 'séoul', 'busan', 'pusan', 'jeju', 'jeju island', 'incheon', 'daegu', 'gwangju', 'ulsan',
    // Philippines
    'philippines', 'philippine', 'manila', 'cebu', 'boracay', 'palawan', 'el nido', 'coron', 'siargao', 'bohol', 'davao', 'baguio', 'makati',
    // Singapour
    'singapore', 'singapour'
  ];
  const nonAsiaDestinations = ['istanbul','turkey','turquie','portugal','spain','espagne','lisbon','lisbonne','barcelona','barcelone','greece','grèce','cyprus','france','paris','london','londres','italy','italie','rome','europe','america','usa','brazil','brésil','rio','mexico','mexique','malaysia','malaisie','taiwan','hong kong'];
  
  // Vérifier d'abord si une destination non-asiatique est mentionnée
  const hasNonAsiaDestination = nonAsiaDestinations.some(dest => text.includes(dest));
  
  // Si une destination non-asiatique est mentionnée ET qu'aucune destination asiatique n'est mentionnée, pénaliser FORTEMENT
  if (hasNonAsiaDestination && !asiaKeywords.some(k => text.includes(k))) {
    scores.relevance_asia_nomad = 0;
    scores.penalties -= 50; // Pénalité TRÈS forte pour destinations hors Asie (rejet automatique)
    reasons.push('Destination hors Asie détectée - REJET');
  } else {
    // Sinon, appliquer le scoring normal
    if (asiaKeywords.some(k => text.includes(k))) {
      scores.relevance_asia_nomad += 10;
      reasons.push('Asie détectée');
    }
    // Les mots-clés nomades ne donnent des points QUE si une destination asiatique est aussi mentionnée
    if ((text.includes('nomad') || text.includes('visa') || text.includes('coworking') || text.includes('coliving')) && asiaKeywords.some(k => text.includes(k))) {
      scores.relevance_asia_nomad += 10;
      reasons.push('Nomad/visa/coworking détecté');
    }
    // BONUS pour les articles Reddit sur les destinations asiatiques : donner des points supplémentaires pour l'actionnabilité
    if (asiaKeywords.some(k => text.includes(k)) && scores.actionability === 0) {
      // Si c'est une destination asiatique mais pas d'actionnabilité, donner un bonus plus important
      scores.actionability += 10;
      reasons.push('Bonus actionnabilité (destination Asie)');
    }
  }

  // 2. Actionnabilité
  if (/(price|cost|guide|visa|how to|where|address|recommend|tips|avoid)/i.test(text)) scores.actionability += 10;
  if (/(http|www|\.com)/i.test(text)) scores.actionability += 5;
  if (scores.actionability >= 10) reasons.push('Signaux actionnables (prix/guide/tips)');

  // 3. Engagement normalisé
  const hoursSince = (Date.now() - created_utc * 1000) / 3600000;
  const engagementVelocity = (ups + num_comments) / Math.max(hoursSince, 1);
  const subNorm = subredditStats?.medianEngagement || 12;
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
  const hasAsiaKeyword = asiaKeywords.some(k => text.includes(k));
  if (!hasAsiaKeyword) {
    // Si travel terms présents → malus léger, sinon malus fort
    scores.penalties -= /(travel|visa|cost|coworking|coliving|flight|hotel)/.test(text) ? 5 : 10;
  } else {
    // BONUS pour les articles sur les destinations asiatiques : réduire les pénalités si pas de monétisation
    // Les articles Reddit sur les destinations asiatiques sont acceptables même sans mots-clés affiliables
    if ((scores.monetization_fit || 0) === 0) {
      // Pas de pénalité supplémentaire si c'est une destination asiatique
      // (la pénalité de -10 est déjà appliquée plus bas, mais on ne l'augmente pas)
    }
  }
  if (/(politics|relationship|relationships|religion)/i.test(text) && !/(travel|visa|safety|culture|dating|coliving)/i.test(text)) {
    scores.penalties -= 15;
  }

  // 11. Détection de sujets sensibles/identitaires
  const contextualSensitive = /(dark|black|skin|race|racism|discrimination|ethnicity|minority)/i.test(text);
  if (contextualSensitive) {
    reasons.push('Sujet identitaire/sensible détecté');
  }

  // 12. Rejet des contenus problématiques
  if (contextualSensitive && (scores.monetization_fit || 0) < 1 && scores.actionability < 5) {
    scores.penalties -= 25;
    reasons.push('Sujet identitaire sans valeur pratique → rejet');
  }

  // 13. Interdiction primary_source si pas de monétisation
  // MAIS : Réduire la pénalité pour les articles Reddit sur les destinations asiatiques
  if ((scores.monetization_fit || 0) === 0) {
    if (hasAsiaKeyword) {
      // Pénalité très réduite pour les articles Reddit sur les destinations asiatiques
      // Les articles Reddit sur les destinations asiatiques sont acceptables même sans mots-clés affiliables
      scores.penalties -= 2;
      reasons.push('Aucun mot affiliable détecté → pénalité très réduite (destination Asie)');
    } else {
      scores.penalties -= 10;
      reasons.push('Aucun mot affiliable détecté → limites monétisation');
    }
  }

  // Règle contextualisée: si topic sensible détecté, exiger un minimum d'actionnabilité
  if (contextual && scores.actionability < 8) {
    scores.penalties -= 10;
    reasons.push('Contexte sensible sans actionnabilité suffisante (-10)');
  }

  // Calcul du total pondéré
  const total = Object.entries(SMART_SCORE_WEIGHTS)
    .reduce((sum, [key, weight]) => sum + (scores[key] * (weight / 10)), 0) + scores.penalties;

  // 14. Rejet final des contenus problématiques
  let finalDecision = 'reject';
  
  // REJET AUTOMATIQUE pour destinations non-asiatiques (spécialisation Asie)
  if (hasNonAsiaDestination && !asiaKeywords.some(k => text.includes(k))) {
    finalDecision = 'reject';
    reasons.push('Destination hors Asie → REJET AUTOMATIQUE (spécialisation Asie)');
  } else if (contextualSensitive && (scores.monetization_fit || 0) === 0) {
    finalDecision = 'reject';
    reasons.push('Sujet sensible + pas de monétisation → rejet définitif');
  } else if (total >= SMART_SCORE_THRESHOLDS.publish_primary) {
    finalDecision = 'primary_source';
  } else if (total >= SMART_SCORE_THRESHOLDS.require_secondary) {
    finalDecision = 'secondary_source';
  }

  return {
    title,
    url: `https://reddit.com${permalink}`,
    scores,
    total,
    decision: finalDecision,
    contextual,
    reasons,
    affiliate_slots: affiliateSlots
  };
};

// Exemple d'utilisation future :
// const smartResult = this.computeSmartScore(post.data, { medianEngagement: 12 });
// console.log(smartResult);


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

export default UltraFreshComplete;
