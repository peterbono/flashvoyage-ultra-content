#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

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

// Sources RSS alternatives fiables pour GitHub Actions
const FALLBACK_RSS_SOURCES = {
  travel_blogs: [
    {
      name: 'BBC Travel',
      url: 'https://www.bbc.com/travel/rss.xml',
      keywords: ['travel', 'tourism', 'destination', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Lonely Planet News',
      url: 'https://www.lonelyplanet.com/news/rss',
      keywords: ['travel', 'tourism', 'destination', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Travel + Leisure',
      url: 'https://www.travelandleisure.com/rss',
      keywords: ['travel', 'tourism', 'destination', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    }
  ],
  nomad_sources: [
    {
      name: 'Nomad List Blog',
      url: 'https://nomadlist.com/blog/rss',
      keywords: ['nomad', 'digital nomad', 'remote work', 'coliving', 'coworking', 'visa', 'residence', 'tax', 'fiscal', 'budget', 'cost', 'living', 'accommodation', 'food', 'transport', 'internet', 'wifi', 'weather', 'season', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Remote Year Blog',
      url: 'https://remoteyear.com/blog/rss',
      keywords: ['nomad', 'digital nomad', 'remote work', 'coliving', 'coworking', 'visa', 'residence', 'tax', 'fiscal', 'budget', 'cost', 'living', 'accommodation', 'food', 'transport', 'internet', 'wifi', 'weather', 'season', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    },
    {
      name: 'Coliving.com Blog',
      url: 'https://coliving.com/blog/rss',
      keywords: ['coliving', 'coworking', 'nomad', 'digital nomad', 'remote work', 'visa', 'residence', 'tax', 'fiscal', 'budget', 'cost', 'living', 'accommodation', 'food', 'transport', 'internet', 'wifi', 'weather', 'season', 'asia', 'vietnam', 'thailand', 'japan', 'korea', 'singapore', 'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong']
    }
  ]
};

// Service proxy pour Reddit (API tierce)
const REDDIT_PROXY_SERVICES = [
  {
    name: 'Reddit API Proxy',
    url: 'https://api.reddit.com/r/travel/hot.json?limit=10',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  },
  {
    name: 'Reddit JSON Proxy',
    url: 'https://www.reddit.com/r/travel/hot.json?limit=10&raw_json=1',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    }
  }
];


// Classe principale
class UltraFreshComplete {
  constructor() {
    this.articles = [];
    this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
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
          const relevance = this.calculateRelevance(data.title, data.selftext, ALTERNATIVE_SOURCES.reddit.keywords);
          // Boost de pertinence pour les posts r/travel
          const boostedRelevance = Math.min(90, relevance + 30);
          
          relevantPosts.push({
            title: data.title,
            link: 'https://reddit.com' + data.permalink,
            content: data.selftext || '',
            date: new Date(data.created_utc * 1000).toISOString(),
            source: 'Reddit r/travel',
            type: 'community',
            relevance: boostedRelevance,
            upvotes: data.ups,
            comments: data.num_comments
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
          const relevance = this.calculateRelevance(data.title, data.selftext, ALTERNATIVE_SOURCES.reddit_nomad.keywords);
          // Boost de pertinence pour les posts Reddit nomades
          const boostedRelevance = Math.min(95, relevance + 40);
          
          relevantPosts.push({
            title: data.title,
            link: `https://reddit.com${data.permalink}`,
            content: data.selftext || '',
            date: new Date(data.created_utc * 1000).toISOString(),
            source: 'Reddit Digital Nomad',
            type: 'nomade',
            relevance: boostedRelevance,
            upvotes: data.ups,
            comments: data.num_comments
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

      // Tentative Reddit via proxy
      const redditProxyArticles = await this.scrapeRedditViaProxy();
      allArticles.push(...redditProxyArticles);

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

    // Trier par pertinence et date
    allArticles.sort((a, b) => {
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      return new Date(b.date) - new Date(a.date);
    });

    console.log(`\n🎯 Total: ${allArticles.length} articles ultra-fraîches trouvés`);
    return allArticles;
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

      console.log('❌ Tous les proxies Reddit ont échoué');
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

export default UltraFreshComplete;
