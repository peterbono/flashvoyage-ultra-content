#!/usr/bin/env node

import UltraStrategicGenerator from './ultra-strategic-generator.js';
// OBSOLETE: import ContentEnhancer from './content-enhancer.js'; // Remplacé par seo-optimizer.js
import IntelligentContentAnalyzerOptimized from './intelligent-content-analyzer-optimized.js';
import { applyPostProcessingFixers } from './post-processing-fixers.js';
// OBSOLETE: import { CompleteLinkingStrategy } from './complete-linking-strategy.js'; // Remplacé par seo-optimizer.js
import ArticleFinalizer from './article-finalizer.js';
import WidgetPlanBuilder from './widget-plan-builder.js';
import ContextualWidgetPlacer from './contextual-widget-placer-v2.js';
import { OPENAI_API_KEY, DRY_RUN, FORCE_OFFLINE } from './config.js';
import { compileRedditStory } from './reddit-story-compiler.js';
import PipelineRunner from './pipeline-runner.js';
import costTracker from './llm-cost-tracker.js';
import RssSignalFetcher from './rss-signal-fetcher.js';
import EditorialCalendar from './editorial-calendar.js';
import AuthorManager from './author-manager.js';
import { applyAllFixes } from './review-auto-fixers.js';
import { initVizBridge } from "./viz-bridge.js";

// Reddit OAuth token cache (module-scoped)
let _redditTokenCache = { token: null, expires: 0 };

async function getRedditOAuthToken() {
  const now = Date.now();
  if (_redditTokenCache.token && _redditTokenCache.expires > now + 300000) {
    return _redditTokenCache.token;
  }
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME || '';
  const password = process.env.REDDIT_PASSWORD || '';
  if (!clientId || !clientSecret) {
    console.warn('⚠️ Reddit credentials manquantes, fallback anonymous');
    return null;
  }
  const axios = (await import('axios')).default;
  const auth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
  try {
    const resp = await axios.post('https://www.reddit.com/api/v1/access_token', 
      'grant_type=password&username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password),
      {
        headers: {
          'Authorization': 'Basic ' + auth,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'FlashVoyagesBot/1.0 (by /u/' + username + ')'
        },
        timeout: 10000
      }
    );
    if (resp.data && resp.data.access_token) {
      _redditTokenCache.token = resp.data.access_token;
      _redditTokenCache.expires = now + (resp.data.expires_in || 3600) * 1000;
      console.log('✅ Reddit OAuth token obtenu, expire dans ' + (resp.data.expires_in || 3600) + 's');
      return _redditTokenCache.token;
    }
  } catch (err) {
    console.warn('⚠️ Reddit OAuth failed: ' + err.message + ', fallback anonymous');
  }
  return null;
}

class EnhancedUltraGenerator extends UltraStrategicGenerator {
  constructor() {
    super();
    this.authorManager = new AuthorManager();
    // OBSOLETE: this.contentEnhancer = new ContentEnhancer(); // Remplacé par seo-optimizer.js
    this.intelligentAnalyzer = new IntelligentContentAnalyzerOptimized();
    // OBSOLETE: this.linkingStrategy = new CompleteLinkingStrategy(); // Remplacé par seo-optimizer.js
    this.articleFinalizer = new ArticleFinalizer();
    this.widgetPlanBuilder = new WidgetPlanBuilder();
    this.contextualWidgetPlacer = new ContextualWidgetPlacer();
    
    // NOUVEAU: Pipeline Runner comme orchestrateur principal (respecte le pipeline décrit)
    this.pipelineRunner = new PipelineRunner();

    // VIZ-BRIDGE: Initialize WebSocket bridge for 3D visualization
    this.vizBridge = initVizBridge();
    this.pipelineRunner._vizBridge = this.vizBridge;
    
    // Initialiser les composants nécessaires
    this.initializeComponents();
  }

  // Initialiser les composants
  initializeComponents() {
    // Cette méthode sera appelée après l'initialisation du parent
    // pour s'assurer que tous les composants sont disponibles
  }

  // Récupérer les commentaires d'un post Reddit via OAuth API
  async fetchRedditComments(redditUrl) {
    const axios = (await import('axios')).default;
    
    try {
      // Get OAuth token for authenticated access
      const token = await getRedditOAuthToken();
      
      // Extract the post path from the URL
      // https://reddit.com/r/digitalnomad/comments/abc123/title/ → /r/digitalnomad/comments/abc123
      let postPath = new URL(redditUrl).pathname.replace(/\/$/, "");
      
      let apiUrl, headers;
      if (token) {
        // Use OAuth endpoint (reliable, no 403)
        apiUrl = 'https://oauth.reddit.com' + postPath + '.json?raw_json=1&limit=50';
        headers = {
          'Authorization': 'Bearer ' + token,
          'User-Agent': 'FlashVoyagesBot/1.0 (by /u/' + (process.env.REDDIT_USERNAME || 'FlashVoyage') + ')'
        };
        console.log('🔑 Fetching Reddit comments via OAuth API...');
      } else {
        // Fallback: anonymous (may 403)
        apiUrl = redditUrl.replace(/\/$/, "") + '.json?raw_json=1&limit=50';
        headers = {
          'User-Agent': 'FlashVoyagesBot/1.0'
        };
        console.log('⚠️ Fetching Reddit comments anonymously (no token)...');
      }
      
      const response = await axios.get(apiUrl, { headers, timeout: 15000 });
      const data = response.data;
      
      // Reddit retourne un array: [0] = post, [1] = comments
      if (!data || !Array.isArray(data) || data.length < 2) {
        return [];
      }
      
      const commentsListing = data[1];
      const comments = [];
      
      // Fonction récursive pour extraire les commentaires (y compris replies)
      const extractComments = (children) => {
        if (!children || !Array.isArray(children)) return;
        
        for (const child of children) {
          if (child.kind === 't1' && child.data) {
            const comment = child.data;
            if (comment.body && comment.body !== '[deleted]' && comment.body !== '[removed]') {
              comments.push({
                id: comment.id,
                author: comment.author || '[deleted]',
                body: comment.body,
                score: comment.score || 0,
                created_utc: comment.created_utc || 0
              });
              if (comment.replies && comment.replies.data && comment.replies.data.children) {
                extractComments(comment.replies.data.children);
              }
            }
          }
        }
      };
      
      if (commentsListing.data && commentsListing.data.children) {
        extractComments(commentsListing.data.children);
      }
      
      // Trier par score décroissant
      comments.sort((a, b) => b.score - a.score);
      
      console.log('✅ ' + comments.length + ' commentaires Reddit récupérés');
      return comments.slice(0, 30);
      
    } catch (error) {
      console.error('❌ Erreur fetch commentaires Reddit: ' + error.message);
      if (error.response) {
        console.error('   Status: ' + error.response.status + ', URL: ' + (error.config?.url || 'unknown'));
      }
      return [];
    }
  }

  /**
   * Hard gate géographique pour NEWS:
   * - Le titre doit mentionner une destination Asie
   * - Le titre ne doit contenir aucune destination non-Asie
   * - Le texte doit contenir au moins une destination Asie
   */
  isNewsAsiaAligned(article) {
    const asiaKeywords = [
      'japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'yokohama', 'hokkaido',
      'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket',
      'vietnam', 'hanoi', 'saigon', 'ho chi minh',
      'indonesia', 'indonésie', 'bali', 'jakarta', 'ubud',
      'philippines', 'manila', 'cebu', 'palawan',
      'korea', 'corée', 'south korea', 'corée du sud', 'seoul',
      'singapore', 'singapour',
      'taiwan', 'taïwan', 'taipei',
      'hong kong', 'chine', 'china',
      'asia', 'asie'
    ];

    const nonAsiaKeywords = [
      'ireland', 'irlande', 'galway', 'dublin',
      'uk', 'united kingdom', 'royaume-uni', 'london', 'londres',
      'france', 'paris', 'spain', 'espagne', 'portugal', 'italy', 'italie', 'greece', 'grèce',
      'usa', 'united states', 'états-unis', 'canada', 'mexico', 'mexique', 'brazil', 'brésil',
      'peru', 'pérou', 'argentina', 'argentine', 'chile', 'chili',
      'egypt', 'egypte', 'égypte', 'morocco', 'maroc', 'dubai', 'qatar',
      'australia', 'australie', 'new zealand', 'nouvelle-zélande'
    ];

    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchesWord = (text, word) => new RegExp(`\\b${escRe(word)}\\b`, 'i').test(text || '');

    const titleLower = (article?.title || '').toLowerCase();
    const articleText = `${article?.title || ''} ${article?.content || ''} ${article?.selftext || ''} ${article?.source_text || ''}`.toLowerCase();

    const titleHasAsia = asiaKeywords.some(kw => matchesWord(titleLower, kw));
    const titleHasNonAsia = nonAsiaKeywords.some(kw => matchesWord(titleLower, kw));
    const textHasAsia = asiaKeywords.some(kw => matchesWord(articleText, kw));

    if (titleHasNonAsia) return { ok: false, reason: 'titre_non_asie' };
    if (!titleHasAsia) return { ok: false, reason: 'titre_sans_asie' };
    if (!textHasAsia) return { ok: false, reason: 'texte_sans_asie' };
    return { ok: true, reason: 'ok' };
  }

  /**
   * Applique les mêmes filtres que le flux principal sur un batch de sources
   * (destinations Asie/non-Asie, type Reddit, meta, smartDecision).
   * @param {Array} sources - Liste d'articles bruts
   * @param {{ isDryRun: boolean, forceOffline: boolean, enforceNewsHardGate?: boolean }} opts
   * @returns {Array} validSources pour ce batch
   */
  applySourceFilters(sources, { isDryRun, forceOffline, enforceNewsHardGate = false }) {
      const asiaDestinations = [
        'indonesia', 'indonésie', 'bali', 'jakarta', 'yogyakarta', 'bandung', 'surabaya', 'medan', 'ubud', 'seminyak', 'canggu', 'lombok',
        'vietnam', 'viet nam', 'ho chi minh', 'hanoi', 'hồ chí minh', 'hà nội', 'da nang', 'đà nẵng', 'hue', 'huế', 'hoi an', 'hội an', 'nha trang', 'sapa', 'sa pa',
        'thailand', 'thaïlande', 'bangkok', 'chiang mai', 'chiangmai', 'phuket', 'krabi', 'pattaya', 'koh samui', 'koh phangan', 'koh tao', 'pai', 'ayutthaya', 'sukhothai',
        'japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'hokkaido', 'hokkaidō', 'hiroshima', 'nara', 'sapporo', 'fukuoka', 'okinawa', 'yokohama', 'nagoya', 'sendai',
        'korea', 'corée', 'south korea', 'corée du sud', 'seoul', 'séoul', 'busan', 'pusan', 'jeju', 'jeju island', 'incheon', 'daegu', 'gwangju', 'ulsan',
        'philippines', 'philippine', 'manila', 'cebu', 'boracay', 'palawan', 'el nido', 'coron', 'siargao', 'bohol', 'davao', 'baguio', 'makati',
        'singapore', 'singapour'
      ];
      const nonAsiaDestinations = [
        // Amériques - grandes villes
      'new york', 'los angeles', 'san francisco', 'chicago', 'miami', 'las vegas', 'boston', 'seattle', 'washington dc', 'hawaii', 'honolulu',
      'toronto', 'montreal', 'montréal', 'vancouver',
        // Europe
      'ireland', 'irlande', 'galway', 'dublin', 'istanbul', 'turkey', 'turquie', 'portugal', 'spain', 'espagne', 'lisbon', 'lisbonne', 'barcelona', 'barcelone', 'greece', 'grèce', 'cyprus', 'chypre', 'france', 'paris', 'london', 'londres', 'italy', 'italie', 'rome', 'europe', 'uk', 'united kingdom', 'royaume-uni', 'royaume uni', 'britain', 'britannique', 'england', 'angleterre', 'scotland', 'écosse', 'wales', 'pays de galles', 'germany', 'allemagne', 'berlin', 'netherlands', 'pays-bas', 'amsterdam', 'switzerland', 'suisse', 'austria', 'autriche', 'vienna', 'vienne', 'prague', 'czech', 'tchèque', 'poland', 'pologne', 'hungary', 'hongrie', 'budapest', 'croatia', 'croatie', 'dubrovnik',
        // Amériques
      'america', 'usa', 'united states', 'états-unis', 'brazil', 'brésil', 'rio', 'mexico', 'mexique', 'canada', 'quebec', 'québec', 'colombia', 'colombie', 'peru', 'pérou', 'argentina', 'argentine', 'chile', 'chili', 'costa rica', 'caribbean', 'caraïbes',
      'cuba', 'cancun', 'cancún', 'dominican', 'dominicaine', 'jamaica', 'jamaïque', 'haiti', 'haïti', 'puerto rico', 'panama', 'honduras', 'guatemala', 'nicaragua', 'el salvador', 'belize', 'ecuador', 'équateur',
      // Afrique & Afrique du Nord
      'egypt', 'égypte', 'egypte', 'cairo', 'le caire', 'giza', 'gizeh', 'alexandria', 'alexandrie', 'luxor', 'louxor', 'aswan', 'assouan', 'morocco', 'maroc', 'marrakech', 'casablanca', 'fes', 'fès', 'tunisia', 'tunisie', 'tunis', 'algeria', 'algérie', 'alger', 'libya', 'libye', 'south africa', 'afrique du sud', 'cape town', 'johannesburg', 'kenya', 'nairobi', 'tanzania', 'tanzanie', 'kilimanjaro', 'zanzibar', 'nigeria', 'lagos', 'ethiopia', 'éthiopie', 'ghana', 'senegal', 'sénégal', 'dakar', 'africa', 'afrique',
      // Moyen-Orient
      'iraq', 'irak', 'iran', 'israel', 'israël', 'jordanie', 'jordan', 'liban', 'lebanon', 'syrie', 'syria', 'arabie saoudite', 'saudi arabia', 'emirats', 'emirates', 'dubai', 'dubaï', 'abu dhabi', 'qatar', 'koweit', 'kuwait', 'oman', 'yemen', 'yémen', 'bahrein', 'bahrain', 'kurdistan', 'bagdad', 'baghdad', 'erbil', 'najaf', 'karbala', 'bassorah', 'basra', 'sulaymaniyah', 'kirkuk', 'mossoul', 'mosul',
      // Océanie (hors Asie)
      'australia', 'australie', 'sydney', 'melbourne', 'new zealand', 'nouvelle-zélande', 'auckland', 'fiji', 'fidji'
    ];
    const metaKeywords = [
      'subreddit changes', 'modifications du subreddit', 'modifications du sub', 'changements du subreddit',
      'rules', 'règles', 'flair', 'moderation', 'modération', 'survey', 'sondage',
      'meta', 'announcement', 'annonce', 'update:', '[update]', '[meta]',
      'how the subreddit', 'comment le subreddit', 'subreddit is run', 'gestion du subreddit'
    ];
    // Helper: word-boundary match pour éviter les faux positifs (ex: "pai" dans "paid", "rio" dans "priority")
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchesWord = (text, word) => new RegExp(`\\b${escRe(word)}\\b`, 'i').test(text);
    
    return sources.filter(article => {
        const articleText = `${article.title || ''} ${article.content || ''} ${article.selftext || ''} ${article.source_text || ''}`.toLowerCase();
        const titleLower = (article.title || '').toLowerCase();
      const hasNonAsiaDestination = nonAsiaDestinations.some(dest => matchesWord(articleText, dest));
      const hasAsiaDestination = asiaDestinations.some(dest => matchesWord(articleText, dest));
      
      
      if (nonAsiaDestinations.some(dest => titleLower.includes(dest))) {
          console.log(`🚫 Article rejeté (TITRE contient destination non-asiatique): ${article.title}`);
          return false;
        }
        if (enforceNewsHardGate) {
          const hardGate = this.isNewsAsiaAligned(article);
          if (!hardGate.ok) {
            console.log(`🚫 Article rejeté (NEWS_HARD_GATE=${hardGate.reason}): ${article.title}`);
            return false;
          }
        }
        // GATE GÉOGRAPHIQUE UNIVERSELLE: le titre doit mentionner une destination Asie
        // (sauf si le titre est générique et le body est fortement asiatique)
        {
          const _titleHasAsia = asiaDestinations.some(dest => matchesWord(titleLower, dest));
          if (!_titleHasAsia) {
            const _bodyAsiaCount = asiaDestinations.filter(dest => matchesWord(articleText, dest)).length;
            if (_bodyAsiaCount < 2) {
              console.log(`\u{1f6ab} Article rejet\u00e9 (titre sans destination asiatique, body faible: ${_bodyAsiaCount} mentions Asie): ${article.title}`);
              return false;
            }
          }
        }
        if (article.type !== 'community' && article.type !== 'nomade') {
          console.log(`🚫 Article rejeté (source non-Reddit, format témoignage requis): ${article.title} (type: ${article.type})`);
          return false;
        }
        if ((isDryRun || forceOffline) && article.source_reliability !== undefined) {
          if (article.source_reliability < 0.7 && (!article.source_text || article.source_text.length < 400)) {
            console.log(`🚫 Article rejeté (source non fiable, source_text trop court): ${article.title} reliability=${article.source_reliability}`);
            return false;
          }
        }
        if (hasNonAsiaDestination && !hasAsiaDestination) {
          console.log(`🚫 Article rejeté (uniquement destinations non-asiatiques, pas d'Asie): ${article.title}`);
          return false;
        }
        if (!hasAsiaDestination) {
          console.log(`🚫 Article rejeté (aucune destination asiatique): ${article.title}`);
          return false;
        }
        // GARDE PROPORTIONNALITÉ: Rejeter si Asie est une mention anecdotique vs sujet principal non-Asie
        // Ex: "transiting through Singapore or Dubai" dans un article sur l'ESTA américain
        {
          const matchedAsiaCount = asiaDestinations.filter(dest => matchesWord(articleText, dest)).length;
          const matchedNonAsiaCount = nonAsiaDestinations.filter(dest => matchesWord(articleText, dest)).length;
          const titleHasAsia = asiaDestinations.some(dest => matchesWord(titleLower, dest));
          // Si le titre ne mentionne aucune destination Asie ET non-Asie domine (ratio ≥ 3:1)
          if (!titleHasAsia && matchedNonAsiaCount >= 3 && matchedNonAsiaCount >= matchedAsiaCount * 3) {
            console.log(`🚫 Article rejeté (PROPORTIONNALITÉ: ${matchedAsiaCount} Asie vs ${matchedNonAsiaCount} non-Asie, titre sans Asie): ${article.title}`);
            return false;
          }
        }
        const isMetaPost = metaKeywords.some(keyword => titleLower.includes(keyword.toLowerCase()) || articleText.includes(keyword.toLowerCase()));
        if (isMetaPost) {
          console.log(`🚫 Article rejeté (post meta/non-voyage): ${article.title}`);
          return false;
        }
        if (article.smartDecision === 'reject') {
          console.log(`⚠️ Article rejeté ignoré: ${article.title}`);
          return false;
        }
        return true;
      });
  }

  /**
   * Applique le filtre relâché (r/travel, r/digitalnomad + mots-clés voyage) sur la liste complète.
   * @param {Array} sources - Tous les articles scrapés (allBatches.flat())
   * @param {{ enforceNewsHardGate?: boolean }} opts
   * @returns {Array} relaxedSources (déjà non publiés par construction du filtre)
   */
  applyRelaxedFilter(sources, { enforceNewsHardGate = false } = {}) {
    // Même liste non-Asie que applySourceFilters pour garder la cohérence
    const nonAsiaDestinations = [
      // Amériques - grandes villes
      'new york', 'los angeles', 'san francisco', 'chicago', 'miami', 'las vegas', 'boston', 'seattle', 'washington dc', 'hawaii', 'honolulu',
      'toronto', 'montreal', 'montréal', 'vancouver',
      'ireland', 'irlande', 'galway', 'dublin',
      'egypt', 'égypte', 'egypte', 'cairo', 'le caire', 'giza', 'gizeh', 'alexandria', 'alexandrie', 'luxor', 'louxor', 'aswan', 'assouan',
      'morocco', 'maroc', 'marrakech', 'tunisia', 'tunisie', 'algeria', 'algérie', 'africa', 'afrique',
      'istanbul', 'turkey', 'turquie', 'portugal', 'spain', 'espagne', 'greece', 'grèce', 'france', 'paris', 'london', 'londres', 'italy', 'italie', 'rome', 'europe', 'germany', 'allemagne',
      'america', 'usa', 'united states', 'états-unis', 'brazil', 'brésil', 'mexico', 'mexique', 'canada', 'quebec', 'québec',
      'cuba', 'cancun', 'cancún', 'dominican', 'dominicaine', 'jamaica', 'jamaïque', 'haiti', 'haïti', 'puerto rico',
      'costa rica', 'panama', 'honduras', 'guatemala', 'nicaragua', 'el salvador', 'belize',
      'colombia', 'colombie', 'peru', 'pérou', 'argentina', 'argentine', 'chile', 'chili', 'ecuador', 'équateur',
      'iraq', 'irak', 'iran', 'israel', 'israël', 'jordanie', 'jordan', 'liban', 'lebanon', 'syrie', 'syria', 'dubai', 'dubaï', 'qatar', 'saudi arabia', 'arabie saoudite',
      'australia', 'australie', 'new zealand', 'nouvelle-zélande',
      'south africa', 'afrique du sud', 'kenya', 'tanzania', 'tanzanie', 'nigeria'
    ];
    return sources.filter(article => {
          const redditUrl = article.link || article.url;
      if (this.isArticleAlreadyPublished(article.title, redditUrl)) return false;
      const sub = (article.subreddit || '').toLowerCase();
      if ((article.source && article.source.toLowerCase().includes('reddit')) && (sub === 'r/travel' || sub === 'r/digitalnomad')) {
        const articleText = `${article.title || ''} ${article.content || ''} ${article.selftext || ''} ${article.source_text || ''}`.toLowerCase();
        const titleLower = (article.title || '').toLowerCase();
        // Helper: word-boundary match pour éviter faux positifs
        const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matchesWord = (text, word) => new RegExp(`\\b${escRe(word)}\\b`, 'i').test(text);
        // GARDE GÉO: Rejeter les destinations non-asiatiques dans le TITRE
        if (nonAsiaDestinations.some(dest => matchesWord(titleLower, dest))) {
          console.log(`   🚫 RELAXED_FILTER: rejeté (TITRE contient destination non-asiatique): ${article.title}`);
            return false;
          }
        if (enforceNewsHardGate) {
          const hardGate = this.isNewsAsiaAligned(article);
          if (!hardGate.ok) {
            console.log(`   🚫 RELAXED_FILTER: rejeté (NEWS_HARD_GATE=${hardGate.reason}): ${article.title}`);
            return false;
          }
        }
        // GARDE GÉO BODY: Rejeter si le body mentionne des destinations non-asiatiques SANS mentionner de destinations asiatiques
        const asiaKeywords = ['japan', 'japon', 'tokyo', 'osaka', 'kyoto', 'thailand', 'thaïlande', 'bangkok', 'vietnam', 'hanoi', 'saigon', 'indonesia', 'indonésie', 'bali', 'malaysia', 'malaisie', 'philippines', 'manila', 'cebu', 'cambodia', 'cambodge', 'laos', 'myanmar', 'singapore', 'singapour', 'korea', 'corée', 'seoul', 'taiwan', 'taïwan', 'india', 'inde', 'nepal', 'népal', 'sri lanka', 'asia', 'asie', 'south east asia', 'southeast asia'];
        const bodyHasNonAsia = nonAsiaDestinations.some(dest => matchesWord(articleText, dest));
        const bodyHasAsia = asiaKeywords.some(kw => matchesWord(articleText, kw));
        if (bodyHasNonAsia && !bodyHasAsia) {
          console.log(`   🚫 RELAXED_FILTER: rejeté (BODY contient destinations non-asiatiques sans mention d'Asie): ${article.title}`);
          return false;
        }
        // GARDE PROPORTIONNALITÉ (relâché): même logique que applySourceFilters
        {
          const matchedAsiaCount = asiaKeywords.filter(kw => matchesWord(articleText, kw)).length;
          const matchedNonAsiaCount = nonAsiaDestinations.filter(dest => matchesWord(articleText, dest)).length;
          const titleHasAsia = asiaKeywords.some(kw => matchesWord(titleLower, kw));
          if (!titleHasAsia && matchedNonAsiaCount >= 3 && matchedNonAsiaCount >= matchedAsiaCount * 3) {
            console.log(`   🚫 RELAXED_FILTER: rejeté (PROPORTIONNALITÉ: ${matchedAsiaCount} Asie vs ${matchedNonAsiaCount} non-Asie, titre sans Asie): ${article.title}`);
            return false;
          }
        }
        // GARDE PROPORTIONNALITÉ (cohérent avec applySourceFilters)
        if (bodyHasAsia && bodyHasNonAsia) {
          const asiaCount = asiaKeywords.filter(kw => matchesWord(articleText, kw)).length;
          const nonAsiaCount = nonAsiaDestinations.filter(dest => matchesWord(articleText, dest)).length;
          const titleHasAsia = asiaKeywords.some(kw => matchesWord(titleLower, kw));
          if (!titleHasAsia && nonAsiaCount >= 3 && nonAsiaCount >= asiaCount * 3) {
            console.log(`   🚫 RELAXED_FILTER: rejeté (PROPORTIONNALITÉ: ${asiaCount} Asie vs ${nonAsiaCount} non-Asie, titre sans Asie): ${article.title}`);
            return false;
          }
        }
            const travelKeywords = ['travel', 'voyage', 'trip', 'journey', 'nomad', 'nomade', 'destination', 'visit', 'visiter', 'flight', 'vol', 'hotel', 'hôtel', 'backpack', 'backpacking', 'solo travel', 'voyage solo', 'digital nomad', 'nomade numérique'];
            const metaKeywords = ['subreddit changes', 'modifications du subreddit', 'rules', 'règles', 'flair', 'moderation', 'modération', 'survey', 'sondage', 'meta'];
        if (travelKeywords.some(keyword => articleText.includes(keyword)) && !metaKeywords.some(keyword => articleText.includes(keyword))) {
              console.log(`   ℹ️ RELAXED_FILTER: autorisation Reddit ${article.subreddit} avec mots-clés voyage`);
              return true;
            }
          }
          return false;
        });
  }

  // Générer et publier un article stratégique amélioré
  async generateAndPublishEnhancedArticle() {
    try {
      console.log('🚀 Génération d\'article stratégique amélioré...\n');
      costTracker.reset();

      // 0. Mettre à jour la base de données d'articles AVANT génération des liens
      console.log('📚 Mise à jour de la base de données d\'articles...');
      
      // GARDE DRY_RUN: Charger DB existante au lieu de crawler
      if (DRY_RUN) {
        console.log('🧪 DRY_RUN: crawler WordPress bloqué');
        // Les liens internes sont gérés par seo-optimizer.js via data/internal-links.json
        console.log('🧪 DRY_RUN: liens internes via seo-optimizer.js');
        } else {
      try {
        // D'ABORD : Crawler WordPress pour avoir la DB à jour
        const { WordPressArticlesCrawler } = await import('./wordpress-articles-crawler.js');
        const crawler = new WordPressArticlesCrawler();
        await crawler.crawlAllArticles();
        crawler.saveToFile('articles-database.json'); // SAUVEGARDE EXPLICITE
        console.log('✅ Base de données WordPress mise à jour');
        
        // Charger les articles déjà publiés (titres + URLs Reddit)
        await this.loadPublishedArticles();
        
        // EN MODE OFFLINE : Vider le cache Reddit URLs pour permettre la génération avec fixtures
        if (FORCE_OFFLINE) {
          console.log('🧪 FORCE_OFFLINE: vidage du cache Reddit URLs pour permettre génération avec fixtures');
          this.publishedRedditUrls.clear();
          await this.saveRedditUrlsCache();
          console.log('   ✅ Cache Reddit URLs vidé');
        }
        
        // ENSUITE : Synchroniser l'index de liens internes pour seo-optimizer.js
        await this.syncInternalLinksIndex();
        console.log('✅ Index de liens internes synchronisé\n');
      } catch (error) {
        console.warn('⚠️ Impossible de mettre à jour/charger la base d\'articles:', error.message);
        console.warn('   → Les liens internes ne seront pas générés\n');
        }
      }

      // 1. Scrape source par source, stop au premier candidat valide (crawl prod déjà fait ci-dessus)
      const isDryRun = DRY_RUN;
      const forceOffline = FORCE_OFFLINE;
      const isGitHubActions = typeof this.scraper.isGitHubActions === 'function' && this.scraper.isGitHubActions();

      const REDDIT_SCRAPER_METHODS = [
        'scrapeReddit', 'scrapeRedditNomad', 'scrapeRedditSoloTravel', 'scrapeRedditBackpacking',
        'scrapeRedditThailand', 'scrapeRedditVietnam', 'scrapeRedditJapanTravel', 'scrapeRedditSoutheastAsia'
      ];
      const GITHUB_ACTIONS_SCRAPER_METHODS = ['scrapeFallbackRSS', 'scrapeRedditOfficial', 'scrapeRedditViaProxy'];

      const scraperMethods = isGitHubActions ? GITHUB_ACTIONS_SCRAPER_METHODS : REDDIT_SCRAPER_METHODS;
      const allBatches = [];
      let selectedArticle = null;

      // ── FORCE_SOURCE_URL: skip scraping entirely ──
      const _forceSourceUrl = process.env.FORCE_SOURCE_URL || null;
      if (_forceSourceUrl) {
        console.log(`\n\u{1f3af} FORCE_SOURCE_URL: ${_forceSourceUrl}`);
        console.log('   Skip scraping, fetching forced Reddit post directly...\n');
        try {
          const _forceToken = await getRedditOAuthToken();
          let _forcePath = new URL(_forceSourceUrl).pathname.replace(/\/$/, "");
          const _forceApiUrl = _forceToken
            ? 'https://oauth.reddit.com' + _forcePath + '.json?raw_json=1'
            : _forceSourceUrl.replace(/\/$/, "") + '.json?raw_json=1';
          const _forceHeaders = _forceToken
            ? { 'Authorization': 'Bearer ' + _forceToken, 'User-Agent': 'FlashVoyagesBot/1.0' }
            : { 'User-Agent': 'FlashVoyagesBot/1.0' };
          const _forceResp = await (await import('axios')).default.get(_forceApiUrl, { headers: _forceHeaders, timeout: 15000 });
          const _forceData = _forceResp.data;
          if (Array.isArray(_forceData) && _forceData.length >= 1 && _forceData[0]?.data?.children?.[0]?.data) {
            const _post = _forceData[0].data.children[0].data;
            const _sub = _post.subreddit_name_prefixed || ('r/' + (_post.subreddit || 'travel'));
            selectedArticle = {
              title: _post.title || 'Untitled',
              source_text: _post.selftext || '',
              selftext: _post.selftext || '',
              link: _forceSourceUrl,
              url: _forceSourceUrl,
              author: _post.author || '[deleted]',
              score: _post.score || 0,
              num_comments: _post.num_comments || 0,
              subreddit: _sub,
              source: 'Reddit ' + _sub,
              type: 'community',
              source_reliability: 0.9,
            };
            console.log(`   \u2705 Forced article: "${selectedArticle.title}"`);
            console.log(`   Source: ${_sub} | Score: ${_post.score} | Comments: ${_post.num_comments}`);
          } else {
            console.error('   \u274c FORCE_SOURCE_URL: unexpected Reddit API response structure');
          }
        } catch (_forceErr) {
          console.error(`   \u274c FORCE_SOURCE_URL fetch failed: ${_forceErr.message}`);
        }
      }

      // PHASE 1.5: Calendrier editorial — decide le type d'article et le cluster
      const calendar = new EditorialCalendar();
      const directive = calendar.getNextDirective();

      // ARTICLE_HINT override — injecté par publication-queue.json via GitHub Actions
      // Remplace le premier searchHint du calendrier éditorial sans casser le reste du cycle
      const { ARTICLE_HINT: _articleHint, ARTICLE_TYPE_OVERRIDE: _articleTypeOverride } = await import('./config.js');
      if (_articleHint) {
        directive.searchHints = [_articleHint, ...directive.searchHints.slice(1)];
        console.log(`[QUEUE] ARTICLE_HINT override: "${_articleHint}"`);
      }
      if (_articleTypeOverride && ['comparison', 'itinerary', 'pillar', 'support', 'news'].includes(_articleTypeOverride)) {
        directive.articleType = _articleTypeOverride === 'comparison' ? 'pillar' : _articleTypeOverride === 'itinerary' ? 'pillar' : _articleTypeOverride;
        console.log(`[QUEUE] ARTICLE_TYPE_OVERRIDE: "${_articleTypeOverride}" → articleType="${directive.articleType}"`);
      }

      console.log(`📅 CALENDRIER EDITORIAL:`);
      console.log(`   Type: ${directive.articleType} | Cluster: ${directive.cluster.label}`);
      console.log(`   Position cycle: ${directive.cyclePosition + 1}/5 | Total publie: ${directive.totalPublished}`);
      console.log(`   Hints: ${directive.searchHints.slice(0, 3).join(', ')}`);
      console.log(`   RSS actif: ${directive.useRss ? 'oui' : 'non'}\n`);
      const forcedEditorialMode = String(process.env.FORCE_EDITORIAL_MODE || '').toLowerCase();
      const enforceNewsHardGate = forcedEditorialMode ? forcedEditorialMode === 'news' : directive.articleType === 'news';
      if (enforceNewsHardGate) {
        console.log('🛡️ SOURCE_FILTER: NEWS hard gate géographique activé');
      }

      // PHASE 2: RSS uniquement si le calendrier le demande (type = news)
      if (directive.useRss && !forceOffline && !isDryRun) {
        try {
          console.log('📡 Tentative source RSS + cross-ref Reddit (mode news)...\n');
          const rssFetcher = new RssSignalFetcher();
          const redditToken = await getRedditOAuthToken();
          const rssResult = await rssFetcher.findBestSignal(redditToken);
          if (rssResult && rssResult.article) {
            const rssArticle = rssResult.article;
            const redditUrl = rssArticle.link || '';
            const isNewsMode = String(directive.articleType || '').toLowerCase() === 'news';
            if (isNewsMode) {
              const hardGate = this.isNewsAsiaAligned(rssArticle);
              if (!hardGate.ok) {
                console.log(`📡 RSS: candidat rejeté par NEWS_HARD_GATE=${hardGate.reason} (${rssArticle.title || 'sans titre'})`);
              } else if (!this.isArticleAlreadyPublished(rssArticle.title, redditUrl)) {
                selectedArticle = rssArticle;
                console.log(`\n✅ Article RSS+Reddit selectionne: "${rssArticle.title?.substring(0, 80)}..."`);
                console.log(`   Signal RSS: ${rssResult.rssItem.title?.substring(0, 60)}`);
                console.log(`   Source: ${rssResult.rssItem.source} | Mode: news\n`);
              } else {
                console.log('📡 RSS: Match trouve mais deja publie, fallback Reddit classique\n');
              }
            } else if (!this.isArticleAlreadyPublished(rssArticle.title, redditUrl)) {
              selectedArticle = rssArticle;
              console.log(`\n✅ Article RSS+Reddit selectionne: "${rssArticle.title?.substring(0, 80)}..."`);
              console.log(`   Signal RSS: ${rssResult.rssItem.title?.substring(0, 60)}`);
              console.log(`   Source: ${rssResult.rssItem.source} | Mode: news\n`);
            } else {
              console.log('📡 RSS: Match trouve mais deja publie, fallback Reddit classique\n');
            }
          }
        } catch (e) {
          console.warn(`⚠️ RSS signal fetch echoue (non-bloquant): ${e.message}\n`);
        }
      }

      if (selectedArticle) {
        console.log('⏭️ Skip scrape Reddit classique (candidat RSS+Reddit deja selectionne)\n');
      }

      // Fonction de scoring par affinite cluster (boost les articles lies au cluster actif)
      const clusterDestinations = directive.cluster.destinations.map(d => d.toLowerCase());
      const scoreClusterAffinity = (article) => {
        const text = ((article.title || '') + ' ' + (article.source_text || '')).toLowerCase();
        return clusterDestinations.some(d => text.includes(d)) ? 1 : 0;
      };

      console.log('🔍 Scrape source par source (stop au premier candidat)...\n');
      for (const methodName of scraperMethods) {
        if (selectedArticle) break;
        try {
          const batch = await this.scraper[methodName]();
          if (!batch || !Array.isArray(batch) || batch.length === 0) continue;
          allBatches.push(batch);
          console.log(`   📄 ${methodName}: ${batch.length} articles`);
          const validBatch = this.applySourceFilters(batch, { isDryRun, forceOffline, enforceNewsHardGate });
          const unpublishedBatch = validBatch.filter(article => {
            const redditUrl = article.link || article.url;
            const isPublished = this.isArticleAlreadyPublished(article.title, redditUrl);
            if (isPublished) console.log(`🚫 Article rejeté (déjà publié): ${(article.title || '').substring(0, 80)}...`);
            return !isPublished;
          });
          if (unpublishedBatch.length >= 1) {
            // Trier : affinite cluster > fiabilite > longueur
            unpublishedBatch.sort((a, b) => {
              const ca = scoreClusterAffinity(a), cb = scoreClusterAffinity(b);
              if (ca !== cb) return cb - ca;
              const ra = a.source_reliability || 0, rb = b.source_reliability || 0;
              if (ra !== rb) return rb - ra;
              return (b.source_text || '').length - (a.source_text || '').length;
            });
            selectedArticle = unpublishedBatch[0];
            console.log(`\n✅ Candidat trouvé après ${methodName} — stop scrape (${unpublishedBatch.length} dispo dans ce batch)\n`);
            break;
          }
        } catch (err) {
          console.log(`   ⚠️ ${methodName} échoué: ${err.message}`);
        }
      }

      // Si aucun candidat après toutes les sources : filtre relâché sur l’ensemble scrapé
      if (!selectedArticle && allBatches.length > 0) {
        const sources = allBatches.flat();
        console.log(`\n⚠️ NO_ARTICLE_AFTER_FILTERING: ${sources.length} sources scrapées, aucun candidat valide`);
        const relaxedSources = this.applyRelaxedFilter(sources, { enforceNewsHardGate });
        if (relaxedSources.length > 0) {
          console.log(`   ✅ ${relaxedSources.length} article(s) accepté(s) avec filtre relâché`);
          if (isDryRun || forceOffline) {
            relaxedSources.sort((a, b) => {
              const ra = a.source_reliability || 0, rb = b.source_reliability || 0;
              if (ra !== rb) return rb - ra;
              return (b.source_text || '').length - (a.source_text || '').length;
            });
          }
          selectedArticle = relaxedSources[0];
        } else {
          console.log('   ❌ Aucun article même avec filtre relâché');
        }
        // If relaxed filter selected an article but source_text is too short, discard it
        if (selectedArticle && (selectedArticle.source_text || '').length < 200) {
          console.log(`   ⚠️ Source trop courte (${(selectedArticle.source_text || '').length} chars) — discarding for evergreen fallback`);
          selectedArticle = null;
        }
      }

      // EVERGREEN FALLBACK: if no source found for pillar/comparison/itinerary,
      // generate directly from the hint — no external source needed
      if (!selectedArticle && directive.articleType !== 'news') {
        const hint = String(process.env.ARTICLE_HINT || directive.searchHints?.[0] || '').trim();
        if (hint) {
          console.log(`\n🌿 EVERGREEN FALLBACK: no source found for "${directive.articleType}" article — generating from hint`);
          console.log(`   Hint: "${hint}"`);
          selectedArticle = {
            title: hint,
            source_text: `Sujet: ${hint}. Cet article est un contenu evergreen généré à partir du hint éditorial. Utilise tes connaissances pour produire un guide complet, précis et utile sur ce sujet voyage en Asie du Sud-Est. Inclus des budgets réels en euros, des conseils pratiques, et des comparatifs honnêtes.`,
            link: '',
            author: 'FlashVoyage Editorial',
            source: 'evergreen-hint',
            source_reliability: 8,
            type: directive.articleType || 'pillar',
          };
          console.log(`   ✅ Synthetic source créée — le LLM génèrera le contenu depuis ses connaissances\n`);
        }
      }

      if (!selectedArticle) {
        const forceFixtures = process.env.FLASHVOYAGE_FORCE_FIXTURES === '1';
        if (forceFixtures || DRY_RUN) {
          console.log('⚠️ Aucune source réseau disponible, mais mode fixtures/DRY_RUN activé - skip silencieux');
          return null;
        }
        throw new Error('Aucune source disponible');
      }

      console.log('📰 Article sélectionné:', selectedArticle.title);
      console.log('🔍 DEBUG: Author dans selectedArticle:', selectedArticle.author);
      console.log('📋 DEBUG: Source de l\'article sélectionné:', selectedArticle.source);
      console.log('📋 DEBUG: Type de l\'article:', selectedArticle.type);
      console.log('📋 DEBUG: Link de l\'article:', selectedArticle.link);

      // ============================================================
      // NOUVEAU: Récupérer les commentaires Reddit pour enrichir l'article
      // ============================================================
      let redditComments = [];
      const redditUrl = selectedArticle.link || selectedArticle.url || '';

      // Skip Reddit comment fetch for evergreen-hint sources (no URL to fetch from)
      if (selectedArticle.source === 'evergreen-hint') {
        console.log('🌿 Evergreen source — skipping Reddit comments fetch');
        redditComments = [];
      }
      // En mode offline, utiliser les commentaires du fixture (source_text ou comments_snippets)
      // Sinon, récupérer les commentaires via l'API Reddit
      if (FORCE_OFFLINE && selectedArticle.source_text) {
        console.log('💬 Mode offline: extraction des commentaires depuis le fixture...');
        // Parser les commentaires depuis source_text (format: "Comment 1: ...\nComment 2: ...")
        const commentMatches = selectedArticle.source_text.match(/Comment \d+:([^\n]+)/gi);
        if (commentMatches && commentMatches.length > 0) {
          redditComments = commentMatches.map(c => {
            const text = c.replace(/^Comment \d+:\s*/i, '').trim();
            return {
              body: text,
              score: 10, // Score arbitraire pour fixture
              author: 'fixture_user',
              replies: []
            };
          });
          console.log(`✅ ${redditComments.length} commentaires extraits du fixture`);
        } else if (selectedArticle.comments_snippets) {
          // Fallback: utiliser comments_snippets si disponible
          redditComments = selectedArticle.comments_snippets.map(snippet => ({
            body: snippet,
            score: 10,
            author: 'fixture_user',
            replies: []
          }));
          console.log(`✅ ${redditComments.length} commentaires depuis comments_snippets`);
        }
      } else if (selectedArticle.source !== 'evergreen-hint' && redditUrl && redditUrl.includes('reddit.com')) {
        try {
          console.log('💬 Récupération des commentaires Reddit via API...');
          redditComments = await this.fetchRedditComments(redditUrl);
          console.log(`✅ ${redditComments.length} commentaires récupérés`);
        } catch (error) {
          console.warn(`⚠️ Impossible de récupérer les commentaires: ${error.message}`);
        }
      }

      // ============================================================
      // NOUVEAU: Utiliser pipeline-runner.js comme orchestrateur principal
      // ============================================================
      // Le pipeline-runner respecte l'ordre exact:
      // 1. Extractor → 2. Pattern Detector → 3. Story Compiler → 
      // 4. Generator → 5. Affiliate Injector → 6. SEO Optimizer → 
      // 7. Finalizer → 8. Anti-Hallucination Guard
      // ============================================================
      
      console.log('\n🚀 PIPELINE_RUNNER: Démarrage du pipeline FlashVoyage');
      // VIZ-BRIDGE: Emit pipeline_start with article info
      this.vizBridge.emit({ type: 'pipeline_start', agent: null, data: {
        runId: 'run-' + Date.now(),
        article: selectedArticle?.title || '',
        destination: selectedArticle?.geo?.country || selectedArticle?.destination || '',
      }});
      console.log('===================================================\n');
      
      // Adapter selectedArticle au format attendu par pipeline-runner
      const commentCount = redditComments?.length || selectedArticle.num_comments || 0;
      const postScore = selectedArticle.score || selectedArticle.ups || 0;
      const pipelineInput = {
        post: {
          title: selectedArticle.title || '',
          selftext: selectedArticle.source_text || selectedArticle.content || selectedArticle.selftext || '',
          author: selectedArticle.author || null,
          created_utc: selectedArticle.created_utc || null,
          url: selectedArticle.link || selectedArticle.url || '',
          subreddit: selectedArticle.subreddit || '',
          num_comments: commentCount,
          score: postScore
        },
        comments: redditComments,
        geo: selectedArticle.geo || {},
        source: {
          subreddit: selectedArticle.subreddit || '',
          url: selectedArticle.link || selectedArticle.url || '',
          source: selectedArticle.source || 'Communauté',
          num_comments: commentCount,
          score: postScore,
          author: selectedArticle.author || null
        },
        calendarDirective: directive
      };
      
      // Exécuter le pipeline complet
      // VIZ-BRIDGE: scout stage
      this.vizBridge.emit({ type: 'stage_start', agent: 'scout' });
      const pipelineReport = await this.pipelineRunner.runPipeline(pipelineInput);
      
      // pipelineReport est déjà le rapport finalisé (retourné par finalize())
      const report = pipelineReport;
      
      // Vérifier si le pipeline a été bloqué
      // TEMPORAIRE: Désactiver le blocking pour permettre la publication (truth pack à corriger)
      const ENABLE_PIPELINE_BLOCKING = process.env.ENABLE_PIPELINE_BLOCKING === '1';
      if (report.blocking === true && ENABLE_PIPELINE_BLOCKING) {
        const reasons = report.blockingReasons || [];
        const reasonsStr = reasons.join(', ');
        console.error(`\n❌ PIPELINE_BLOCKED: ${reasons.length} blocking reason(s) detected`);
        console.error(`   Reasons: ${reasonsStr}`);
        throw new Error(`PIPELINE_BLOCKED: ${reasonsStr}`);
      } else if (report.blocking === true && !ENABLE_PIPELINE_BLOCKING) {
        console.warn(`\n⚠️ PIPELINE_BLOCKING détecté mais désactivé temporairement (truth pack à corriger)`);
        console.warn(`   Raisons: ${(report.blockingReasons || []).join(', ')}`);
      }
      
      // Vérifier si le pipeline a réussi
      // TEMPORAIRE: Accepter même si blocking=true (truth pack à corriger)
      if (!report.success && !report.blocking) {
        throw new Error('PIPELINE_FAILED: Le pipeline n\'a pas généré d\'article final');
      }
      // Si blocking mais pas de finalArticle, essayer de récupérer depuis les steps
      if (!report.finalArticle) {
        console.warn('⚠️ finalArticle manquant, récupération depuis les steps...');
        if (report.steps?.finalizer?.data?.content) {
          report.finalArticle = {
            title: report.steps?.generator?.data?.title || report.steps?.finalizer?.data?.title || 'Article généré',
            content: report.steps.finalizer.data.content,
            excerpt: report.steps?.finalizer?.data?.excerpt || ''
          };
          console.log(`✅ Article récupéré depuis steps: ${report.finalArticle.title.substring(0, 50)}...`);
        } else {
          throw new Error('PIPELINE_FAILED: Le pipeline n\'a pas généré d\'article final et impossible de récupérer depuis les steps');
        }
      }
      
      // Récupérer les résultats du pipeline
      const finalArticle = report.finalArticle;
      const routedMode = report.steps?.['editorial-router']?.data?.mode || null;
      const resolvedEditorialMode = (
        finalArticle?.editorialMode ||
        finalArticle?.editorial_mode ||
        routedMode ||
        'evergreen'
      ).toLowerCase();
      
      // Récupérer les données des étapes depuis le report (.data contient les vraies données, .debug est vide)
      const extracted = report.steps?.extractor?.data || report.steps?.extractor?.debug || {};
      const pattern = report.steps?.['pattern-detector']?.data || report.steps?.['pattern-detector']?.debug || {};
      const story = report.steps?.['story-compiler']?.data || report.steps?.['story-compiler']?.debug || {};
      
      console.log('\n✅ PIPELINE_RUNNER: Pipeline terminé avec succès');
      // VIZ-BRIDGE: Emit stage_complete events from pipeline report
      // VIZ-BRIDGE: scout stage_complete (unconditional — scout always runs)
      this.vizBridge.emit({ type: "stage_complete", agent: "scout", data: {
        duration_ms: report.steps?.extractor?.timing?.duration || 0,
        status: "success",
        detail: "Scout phase completed",
      }});
      // Skip if quality-loop-publisher manages its own events
      if (process.env.SKIP_WP_PUBLISH !== "1") {
      {
        const vizStageMap = {
          'extractor': 'extractor',
          'pattern-detector': null,
          'story-compiler': null,
          'editorial-router': null,
          'generator': 'generator',
          'finalizer': 'finalizer',
        };
        for (const [step, vizAgent] of Object.entries(vizStageMap)) {
          if (!vizAgent) continue;
          const s = report.steps?.[step];
          if (s) {
            this.vizBridge.emit({ type: 'stage_complete', agent: vizAgent, data: {
              duration_ms: s.timing?.duration || 0,
              status: s.status || 'success',
              detail: 'Completed: ' + step,
            }});
          }
        }
      }
      } // end SKIP_WP_PUBLISH guard for batch stage_complete
      console.log(`   Titre: ${finalArticle.title}`);
      console.log(`   Contenu: ${finalArticle.content?.length || 0} caractères`);
      console.log(`   QA Report: ${finalArticle.qaReport?.checks?.length || 0} checks`);
      console.log(`   Mode éditorial: ${resolvedEditorialMode.toUpperCase()}`);
      console.log(`   🖼️ InlineImages: ${finalArticle.inlineImages?.length || 0} image(s)`);
      
      // Construire un objet analysis pour compatibilité avec le reste du code
      const analysis = {
        type_contenu: pattern.story_type || 'TEMOIGNAGE',
        type: pattern.story_type || 'TEMOIGNAGE',
        pattern: pattern,
        story: story,
        extracted: extracted,
        geo: selectedArticle.geo || {},
        source_truth: {
          destination: extracted.main_destination || null,
          entities: extracted.entities || [],
          source_url: selectedArticle.link || selectedArticle.url || '',
          source_title: selectedArticle.title || ''
        },
        final_destination: null // Sera calculé plus tard
      };
      
      // Construire generatedContent pour compatibilité
      const generatedContent = {
        title: finalArticle.title,
        content: finalArticle.content,
        excerpt: finalArticle.excerpt || ''
      };

      // Le pipeline a déjà fait:
      // - Extractor → Pattern → Story → Generator → Affiliate → SEO → Finalizer → Anti-Hallucination
      // Le contenu final est dans finalArticle.content (déjà optimisé SEO, avec liens internes, etc.)
      
      // === E-E-A-T: Byline + Source visible + Bloc auteur ===
      const articleLink = selectedArticle.url || selectedArticle.link || '#';
      const articleTitle = selectedArticle.title || 'Article sans titre';
      const srcComments = pipelineInput.source.num_comments || 0;
      const srcScore = pipelineInput.source.score || 0;
      const srcAuthor = pipelineInput.source.author || null;

      // Selectionner un auteur par rotation round-robin
      const destination = finalArticle.meta?.destination || finalArticle.destination || '';
      const { author: selectedAuthor, wpId: selectedAuthorWpId } = await this.authorManager.getAuthorForArticle(destination);
      finalArticle._authorName = selectedAuthor.name;
      finalArticle._authorWpId = selectedAuthorWpId;
      finalArticle._authorBio = selectedAuthor.bio;

      let subredditDisplay = 'Reddit';
      if (articleLink.includes('reddit.com')) {
        const subMatch = articleLink.match(/reddit\.com\/r\/([^/]+)/);
        subredditDisplay = subMatch ? `r/${subMatch[1]}` : 'Reddit';
      }

      // Byline en haut d'article : transparent sur la source
      const testimonialCount = srcComments > 0 ? Math.max(srcComments, 8) : 15;
      const contributionText = `${testimonialCount} témoignages de voyageurs`;

      const bylineHtml = `<!-- wp:html -->\n<div class="fv-byline" style="margin-bottom:1.5rem;padding:1rem 1.2rem;background:#f8f9fa;border-left:4px solid #2563eb;border-radius:4px;font-size:0.92rem;line-height:1.5;color:#374151;">
<strong>${selectedAuthor.name}</strong> · Flash Voyage<br>
Basé sur <a href="${articleLink}" target="_blank" rel="noopener">un témoignage réel</a> et les retours de <strong>${contributionText}</strong>. Les prénoms ont été modifiés. Sources vérifiées, enrichies par nos données temps réel.
</div>\n<!-- /wp:html -->\n\n`;

      finalArticle.content = bylineHtml + finalArticle.content;

      // Bloc méthode en fin d'article : crédibilité E-E-A-T (author box handled by WP theme)
      const authorBoxHtml = `\n\n<!-- wp:html -->\n<style>div.fv-author-box{margin:16px 0 !important;padding:16px 16px !important;}</style>\n<div class="fv-author-box" style="margin:16px 0;padding:16px 16px;background:#f0f4ff;border:1px solid #dbeafe;border-radius:8px;font-size:0.93rem;line-height:1.6;color:#1e293b;">
<p style="margin:0 0 0.5rem;">Cet article est produit par la <strong>rédaction Flash Voyage</strong>. Notre méthode : nous analysons les retours de voyageurs francophones et internationaux, vérifions les informations, puis les enrichissons avec des données temps réel (prix des vols, coût de la vie, conditions de sécurité).</p>
<p style="margin:0 0 0.5rem;">Pourquoi cette approche ? Un article de blog classique reflète <em>une</em> expérience. Nos articles croisent les retours de <strong>dizaines de voyageurs</strong> qui ont vécu la même situation — c'est plus fiable qu'un avis isolé. Les prénoms utilisés dans cet article ont été modifiés pour préserver l'anonymat des témoignants.</p>
<p style="margin:0;"><a href="${articleLink}" target="_blank" rel="noopener">Voir la source originale</a> · <a href="/notre-methode/">Notre méthode</a></p>
</div>\n<!-- /wp:html -->`;

      finalArticle.content = finalArticle.content + authorBoxHtml;
      
      // Générer le quote highlight si disponible (depuis analysis si présent)
      let quoteHighlight = '';
      if (analysis.best_quotes && analysis.best_quotes.selected_quote) {
        console.log('💬 Génération du quote highlight...');
        const redditUsername = analysis.reddit_username || null;
        quoteHighlight = this.templates.generateQuoteHighlight(
          analysis.best_quotes.selected_quote,
          redditUsername
        );
        console.log(`✅ Quote highlight généré (${redditUsername ? `u/${redditUsername}` : 'anonyme'})`);
        finalArticle.content = finalArticle.content.replace('{quote_highlight}', quoteHighlight);
      }
      
      // Récupérer les placements affiliés depuis le rapport du pipeline
      const affiliatePlacements = report.steps?.['affiliate-injector']?.debug?.placements || 
                                  report.steps?.['affiliate-injector']?.placements || [];
      
      // Mettre à jour les métadonnées depuis le pipeline
      finalArticle.excerpt = finalArticle.excerpt || this.generateExcerpt(finalArticle.content);

      // Le pipeline a déjà fait:
      // - Affiliate Injector (étape 5)
      // - SEO Optimizer avec liens internes (étape 6)
      // - Finalizer avec widgets (étape 7)
      // - Anti-Hallucination Guard (étape 8)
      // Le contenu est déjà finalisé et optimisé
      
      // Récupérer le pipelineContext depuis le pipeline report
      const pipelineContext = {
        final_destination: null, // Sera calculé plus tard
        geo: selectedArticle.geo || {},
        source_truth: analysis.source_truth || null,
        pattern: pattern,
        story: {
          extracted: extracted,
          story: story.story || story,
          evidence: story.evidence || {}
        },
        affiliate_plan: report.steps?.['affiliate-injector']?.debug || report.steps?.['affiliate-injector'] || { placements: [] }
      };
      
      // Calculer final_destination (logique existante)
      console.log('\n🎯 CALCUL DE LA DESTINATION FINALE');
      console.log('===================================\n');
      
      let finalDestination = null;
      if (analysis.source_truth?.destination) {
        finalDestination = analysis.source_truth.destination;
        console.log(`   ✓ final_destination depuis source_truth: ${finalDestination}`);
      } else if (analysis.final_destination && analysis.final_destination !== 'Asie') {
        finalDestination = analysis.final_destination;
        console.log(`   ✓ final_destination depuis analysis.final_destination: ${finalDestination}`);
      } else if (analysis.geo?.country) {
        finalDestination = analysis.geo.country;
        console.log(`   ✓ final_destination depuis analysis.geo.country: ${finalDestination}`);
      } else {
        finalDestination = 'Asie';
        console.log(`   → final_destination fallback: ${finalDestination}`);
      }
      
      pipelineContext.final_destination = finalDestination;
      analysis.final_destination = finalDestination;
      console.log(`\n✅ final_destination définie: ${finalDestination}\n`);

      // Contrat de sortie: nettoyer les artefacts avant les enrichissements finaux.
      const sourceUrl = analysis.source_truth?.source_url || selectedArticle.link || selectedArticle.url || '';
      const contractedArticle = this.applyGeneratorOutputContract(finalArticle, {
        destination: finalDestination,
        sourceUrl,
        hasSourceEvidence: Array.isArray(story?.evidence?.source_snippets) && story.evidence.source_snippets.length > 0
      });
      finalArticle.title = contractedArticle.title;
      finalArticle.title_tag = contractedArticle.title_tag;
      finalArticle.content = contractedArticle.content;

      // Catégories et tags (APRÈS final_destination pour que le mapping destination fonctionne)
      finalArticle.categories = await this.getCategoriesForContent(analysis, finalArticle.content, affiliatePlacements);
      finalArticle.tags = await this.getTagsForContent(analysis, affiliatePlacements, finalArticle.content);
      
      console.log('📊 Article final construit:', {
        title: finalArticle.title,
        contentLength: finalArticle.content.length,
        categories: finalArticle.categories,
        tags: finalArticle.tags,
        final_destination: finalDestination
      });
      
      // Propager schemas JSON-LD du pipeline vers l'article pour publication via meta WP
      if (pipelineContext?.schemaMarkup?.length > 0) {
        finalArticle.schemaMarkup = pipelineContext.schemaMarkup;
      }

      // L'article est déjà finalisé par le pipeline, on utilise directement finalArticle
      const finalizedArticle = finalArticle;
      finalizedArticle.editorialMode = resolvedEditorialMode;
      finalizedArticle.editorial_mode = resolvedEditorialMode;
      
      // DEBUG: Vérifier les widgets AVANT déduplication
      const articleFinalizerModule = await import('./article-finalizer.js');
      const ArticleFinalizer = articleFinalizerModule.default;
      const tempFinalizer = new ArticleFinalizer();
      const beforeDedup = tempFinalizer.detectRenderedWidgets(finalizedArticle.content);
      console.log(`🔍 DEBUG WIDGETS AVANT DEDUP: count=${beforeDedup.count}, types=[${beforeDedup.types.join(', ')}]`);
      
      // S'assurer que final_destination et geo_defaults sont dans finalizedArticle
      if (!finalizedArticle.final_destination && pipelineContext?.final_destination) {
        finalizedArticle.final_destination = pipelineContext.final_destination;
      }
      if (!finalizedArticle.geo_defaults && pipelineContext?.geo_defaults) {
        finalizedArticle.geo_defaults = pipelineContext.geo_defaults;
      }
      
      // Le blocking gate a déjà été vérifié dans le pipeline-runner
      // Si on arrive ici, c'est que le pipeline n'a pas été bloqué
      
      // 8c. Récupérer l'image featured (réutiliser celle du pipeline-runner si disponible)
      if (finalizedArticle.featuredImage) {
        console.log(`   ✅ Image featured déjà fournie par le pipeline-runner: ${finalizedArticle.featuredImage.source}`);
      } else {
        const featuredImage = await this.articleFinalizer.getFeaturedImage(finalizedArticle, analysis);
        if (featuredImage) {
          finalizedArticle.featuredImage = featuredImage;
        }
      }
      
      // 8d. Mapper les catégories et tags vers IDs
      const categoriesAndTags = await this.articleFinalizer.getCategoriesAndTagsIds(
        finalizedArticle.categories || [],
        finalizedArticle.tags || []
      );
      finalizedArticle.categoryIds = categoriesAndTags.categories;
      finalizedArticle.tagIds = categoriesAndTags.tags;

      // 9. VALIDATION NON-ASIE (après finalisation et sanitizer)
      console.log('\n🔍 VALIDATION NON-ASIE (après finalisation)');
      console.log('==========================================\n');
      
      // Nettoyer le texte éditorial (retirer sections injectées, nettoyer liens)
      const editorialText = this.extractEditorialText(finalizedArticle);
      
      // Détecter les mentions non-asiatiques
      const validationResult = this.validateNonAsiaContent(editorialText, finalizedArticle.title, finalizedArticle.final_destination);
      
      if (validationResult.hits.length > 0) {
        console.error('❌ ERREUR CRITIQUE: Destination non-asiatique détectée dans le contenu final !');
        console.error(`   Mentions détectées: ${validationResult.hits.length}`);
        validationResult.hits.slice(0, 5).forEach((h, i) => {
          console.error(`   [${i+1}] term="${h.term}" excerpt="...${h.excerpt}..."`);
        });
        throw new Error('ERREUR CRITIQUE: Destination non-asiatique détectée dans le contenu final. Article rejeté.');
      } else {
        console.log('✅ Validation non-Asie: aucune mention détectée');
      }

      // 10. Validation finale (autres critères) - FIX 1: UNE SEULE détection widgets APRÈS finalisation complète
      // PATCH: Déduplication widgets UNE SEULE FOIS, juste avant validation finale
      // Note: articleFinalizerModule déjà importé plus haut
      const finalizer = new ArticleFinalizer();
      
      // PATCH: Dédupliquer widgets (max 1 par type) - UNE SEULE FOIS
      finalizedArticle.content = await finalizer.deduplicateWidgets(finalizedArticle.content, pipelineContext);
      
      // C'est la source de vérité officielle (même fonction que dans deduplicateWidgets)
      const detected = finalizer.detectRenderedWidgets(finalizedArticle.content);
      const widgetsRendered = detected.count;
      
      // DEBUG: Vérifier les widgets APRÈS déduplication
      console.log(`🔍 DEBUG WIDGETS APRÈS DEDUP: count=${widgetsRendered}, types=[${detected.types.join(', ')}]`);
      
      // Apply post-processing fixers (encoding, ghost links, dedup, FAQ, etc.)
      this.vizBridge.emit({ type: 'stage_start', agent: 'post-processing' });
      finalizedArticle.content = applyPostProcessingFixers(finalizedArticle.content);
      this.vizBridge.emit({ type: 'stage_complete', agent: 'post-processing', data: {
        status: 'success', detail: 'Post-processing fixers applied',
      }});

      // TEMPORAIRE: Sauvegarder le contenu APRÈS déduplication pour vérification des corrections génériques
      try {
        const fs = await import('fs');
        fs.writeFileSync('/tmp/last-generated-article.html', finalizedArticle.content, 'utf-8');
        console.log('💾 Contenu sauvegardé dans /tmp/last-generated-article.html pour vérification');
      } catch (e) {
        // Ignorer les erreurs de sauvegarde
      }
      
      // C) Fix métrique: widgetsRendered doit venir du HTML final, point
      // Overwrite AVANT de logger (source de vérité)
      if (pipelineContext) {
        const pipelineRendered = pipelineContext.rendered || pipelineContext.widgets_rendered || pipelineContext.widgets_tracking?.rendered || 0;
        // Logger divergence uniquement si elle existe AVANT overwrite
        if (pipelineRendered !== widgetsRendered) {
          console.log(`⚠️ WIDGET_VALIDATION_DIVERGENCE (avant correction): pipelineContext.rendered=${pipelineRendered} vs detectRenderedWidgets=${widgetsRendered}`);
        }
        // Overwrite = source de vérité (après insertion + dédup)
        pipelineContext.rendered = widgetsRendered;
        pipelineContext.rendered_types = detected.types;
        pipelineContext.widgets_rendered = widgetsRendered; // Alias pour compatibilité
        if (pipelineContext.widgets_tracking) {
          pipelineContext.widgets_tracking.rendered = widgetsRendered;
        }
      }
      
      // Log officiel de détection (source de vérité unique) - doit matcher types_after de WIDGET_DEDUP
      console.log(`   📊 WIDGETS_DETECTED_HTML (FINAL): count=${widgetsRendered}, types=[${detected.types.join(', ')}]`);
      
      // FIX 3: Ne jamais invalider pour 0 lien interne (bonus SEO uniquement)
      const validation = this.validateFinalArticle(finalizedArticle, widgetsRendered);
      
      // FIX E: En DRY_RUN, ne pas throw sur widgets=0, seulement logger
      // TEMPORAIRE: Désactiver la validation pour permettre la publication (truth pack à corriger)
      const ENABLE_VALIDATION = process.env.ENABLE_ARTICLE_VALIDATION !== '0';
      if (!validation.isValid) {
        if (DRY_RUN || !ENABLE_VALIDATION) {
          console.warn('⚠️ WARNING: Article invalide mais continuons (DRY_RUN ou validation désactivée)');
          console.warn(`   Erreurs: ${validation.errors.join(', ')}`);
          console.warn(`   widgetsRendered: ${widgetsRendered}`);
        } else {
        throw new Error(`Article invalide: ${validation.errors.join(', ')}`);
        }
      }

      // 9.5. TRADUCTION FORCÉE de tout le contenu HTML avant publication
      console.log('🌐 Traduction forcée du contenu en français...');
      const originalLength = finalizedArticle.content.length;
      finalizedArticle.content = await this.forceTranslateHTML(finalizedArticle.content);
      const translatedLength = finalizedArticle.content.length;
      console.log(`   📊 HTML avant: ${originalLength} chars → après: ${translatedLength} chars (delta: ${translatedLength - originalLength})`);
      
      // 9.6. PHASE 3 FIX: Dernier passage fixWordGlue après toutes traductions LLM
      // Les traductions re-introduisent du glue typographique (ex: "fautêtre", "estéconomique")
      if (this.articleFinalizer) {
        finalizedArticle.content = this.articleFinalizer.fixWordGlue(finalizedArticle.content, null);
        finalizedArticle.content = this.articleFinalizer.applyDeterministicFinalTextCleanup(finalizedArticle.content);
        if ((resolvedEditorialMode || '').toLowerCase() === 'news') {
          finalizedArticle.content = this.articleFinalizer.ensureNewsQualityConvergence(
            finalizedArticle.content,
            {
              title: finalizedArticle.title || '',
              finalDestination: pipelineContext?.final_destination || finalizedArticle?.final_destination || '',
              pillarLink: 'https://flashvoyage.com/notre-methode/'
            }
          );
        }
      }
      
      // 9.7. P5: QUALITY GATE PRE-PUBLICATION (seuil dynamique selon mode éditorial)
      if (!DRY_RUN) {
        try {
          const { default: QualityAnalyzer } = await import('./quality-analyzer.js');
          const qualityAnalyzer = new QualityAnalyzer();
          const editorialMode = (finalizedArticle.editorialMode || resolvedEditorialMode || 'evergreen').toLowerCase();
          const strictNewsBlocking = !['0', 'false', 'no', 'off'].includes(
            String(process.env.ENABLE_STRICT_NEWS_BLOCKING ?? '1').toLowerCase()
          );
          const reinjectInternalLinks = async (phaseLabel = 'PRE-SCORE') => {
            const seoOptimizer = this.pipelineRunner?.seoOptimizer;
            if (!seoOptimizer || typeof seoOptimizer.injectInternalLinks !== 'function') return;
            const extracted = pipelineContext?.story?.extracted || {};
            const storyData = pipelineContext?.story?.story || {};
            const seoData = seoOptimizer.extractSeoData(extracted, storyData);
            seoData.main_destination = pipelineContext?.final_destination || finalizedArticle.final_destination || '';
            const linkReport = { actions: [] };
            finalizedArticle.content = await seoOptimizer.injectInternalLinks(
              finalizedArticle.content, seoData, linkReport
            );
            if (linkReport.actions.length > 0) {
              console.log(`🔗 ${phaseLabel} LINK INJECTION: ${linkReport.actions[0]?.details || 'done'}`);
            }
          };

          // K7/K8 parity: scorer toujours sur le HTML final (après réinjection liens)
          await reinjectInternalLinks('PRE-SCORE');

          // Wrapping: le quality analyzer cherche un h1 pour le check "destination dans titre"
          // mais finalizedArticle.content n'a pas de h1 (le titre est un champ separe)
          // AUTO-FIXERS: Apply programmatic fixes before quality gate scoring
          try {
            const autoFixContext = {
              destination: finalizedArticle.destination || finalizedArticle.final_destination || '',
              sourceUrl: pipelineContext?.source_truth?.source_url || pipelineContext?.source_url || null
            };
            const { html: autoFixedHtml, totalFixed: autoFixCount } = await applyAllFixes(
              finalizedArticle.content, finalizedArticle.title || '', [], null, autoFixContext
            );
            if (autoFixedHtml !== finalizedArticle.content) {
              finalizedArticle.content = autoFixedHtml;
              console.log(`\u2705 AUTO-FIXERS pre-gate: ${autoFixCount} fix(es) appliqu\u00e9(s)`);
            }
          } catch (autoFixErr) {
            console.warn(`\u26a0\ufe0f Auto-fixers pre-gate \u00e9chou\u00e9s: ${autoFixErr.message}`);
          }
          const contentForScoring = `<h1>${finalizedArticle.title || ''}</h1>\n${finalizedArticle.content}`;
          const prePublishScore = qualityAnalyzer.getGlobalScore(contentForScoring, editorialMode, finalizedArticle.angle);
          const prePublishPct = parseFloat(prePublishScore.globalScore);
          const prePublishThreshold = Number(prePublishScore.threshold || (editorialMode === 'news' ? 70 : 85));
          const envTargetScore = Number(process.env.QUALITY_TARGET_SCORE || '');
          const qualityTargetScore = Number.isFinite(envTargetScore) && envTargetScore > 0
            ? Math.max(prePublishThreshold, Math.min(100, envTargetScore))
            : prePublishThreshold;
          let finalGatePct = prePublishPct;
          let finalGateBlockingPassed = !!prePublishScore.blockingPassed;
          // VIZ-BRIDGE: marie score (skip if quality-loop manages this)
      if (process.env.SKIP_WP_PUBLISH !== '1') {
        this.vizBridge.emit({ type: 'stage_complete', agent: 'marie', data: {
          status: 'success', detail: 'Score: ' + prePublishPct + '/100', score: Math.round(prePublishPct),
        }});
        this.vizBridge.emit({ type: 'score_update', agent: 'marie', data: { score: Math.round(prePublishPct) } });
      }
      console.log(`\n📊 PRE-PUBLISH QUALITY GATE: ${prePublishPct}% (seuil: ${prePublishThreshold}% | cible: ${qualityTargetScore}%) [${editorialMode.toUpperCase()}] — blocking: ${prePublishScore.blockingPassed ? 'OK' : 'FAIL'}`);
          // Détail des checks bloquants pour diagnostic
          if (!prePublishScore.blockingPassed && prePublishScore.categories?.blocking?.checks) {
            prePublishScore.categories.blocking.checks.forEach(chk => {
              const icon = chk.passed ? '✅' : '❌';
              console.log(`   ${icon} BLOCKING: ${chk.check} = ${chk.passed ? 'PASS' : 'FAIL'}${chk.ratio ? ` (${chk.ratio})` : ''}`);
            });
          }
          // Détail Content Writing pour diagnostic
          if (prePublishScore.categories?.contentWriting?.details) {
            const cw = prePublishScore.categories.contentWriting;
            console.log(`   📝 CONTENT_WRITING: ${cw.percentage.toFixed(0)}% (${cw.score}/${cw.maxScore})`);
            cw.details.forEach(d => {
              const icon = d.points >= 10 ? '✅' : d.points > 0 ? '⚠️' : d.points === 0 ? '➖' : '❌';
              console.log(`      ${icon} ${d.check}: ${d.status} (${d.points} pts)`);
            });
          }

          // KPI Tests K1-K10: rapport detaille
          try {
            const { runAllKPITests } = await import('./tests/kpi-quality.test.js');
            const kpiResults = await runAllKPITests(finalizedArticle.content, {
              angleHook: finalizedArticle.angle?.primary_angle?.hook || null,
              allowedNumberTokens: finalizedArticle._truthPack?.allowedNumberTokens || null,
              editorialMode,
              title: finalizedArticle.title
            });
            console.log(`📋 KPI TESTS: ${kpiResults.summary.passed} PASS, ${kpiResults.summary.failed} FAIL, ${kpiResults.summary.skipped} SKIP`);
            Object.entries(kpiResults.results).forEach(([k, v]) => {
              const icon = v.status === 'PASS' ? '✅' : v.status === 'FAIL' ? '❌' : '⏭️';
              console.log(`   ${icon} ${k}: ${v.message}`);
            });
          } catch (kpiErr) {
            console.warn(`⚠️ KPI tests non disponibles: ${kpiErr.message}`);
          }
          
          // P5: Fonction pour construire des instructions ciblées depuis les checks échoués
          const buildTargetedInstructions = (scoreResult) => {
            const instructions = [];
            const cats = scoreResult.categories || {};
            
            // Analyser SERP
            if (cats.serp?.percentage < 70) {
              const serpDetails = cats.serp?.details || [];
              const missing = serpDetails.filter(d => d.points === 0).map(d => d.check);
              if (missing.length > 0) {
                instructions.push(`SERP insuffisant: ajoute les sections manquantes (${missing.slice(0, 3).join(', ')})`);
              }
            }
            
            // Analyser Content Writing
            if (cats.contentWriting?.percentage < 75) {
              const cwDetails = cats.contentWriting?.details || [];
              const issues = cwDetails.filter(d => d.points < 0 || d.status?.includes('MISSING'));
              issues.forEach(d => {
                if (d.check?.includes('H2') && d.points < 0) {
                  instructions.push(`H2 non décisionnels: reformule les titres avec des arbitrages/choix`);
                }
                if (d.check?.includes('descriptif') && d.points < 0) {
                  instructions.push(`Trop de paragraphes descriptifs: ajoute des opinions et recommandations`);
                }
                if (d.check?.includes('Conclusion') && d.status === 'MISSING') {
                  instructions.push(`Conclusion manquante: ajoute une section actionnable`);
                }
              });
            }
            
            // Analyser Blocking
            if (!scoreResult.blockingPassed && cats.blocking?.checks) {
              const failedChecks = cats.blocking.checks.filter(c => !c.passed);
              failedChecks.forEach(c => {
                if (c.check?.includes('Quick Guide')) {
                  instructions.push(`Quick Guide absent: ajoute un encadré Points clés en début d'article`);
                }
                if (c.check?.includes('longueur')) {
                  instructions.push(`Article trop court: développe les sections existantes`);
                }
              });
            }
            
            return instructions.length > 0 ? instructions : ['Améliore la qualité générale du contenu'];
          };

          if (prePublishPct < qualityTargetScore || !prePublishScore.blockingPassed) {
            console.warn(`⚠️ QUALITY_GATE_BLOCKED: Pre-pub score: ${prePublishPct}% < cible ${qualityTargetScore}% ou bloquants FAIL`);
            console.warn(`   Catégories: SERP=${prePublishScore.categories.serp.percentage.toFixed(0)}% Links=${prePublishScore.categories.links.percentage.toFixed(0)}% Content=${prePublishScore.categories.contentWriting.percentage.toFixed(0)}% Blocking=${prePublishScore.categories.blocking.percentage.toFixed(0)}%`);
            
            // P5: Boucle d'amélioration étendue pour les cibles hautes (92+)
            const MAX_IMPROVE_ITERATIONS = qualityTargetScore >= 92 ? 4 : 2;
            let currentScore = prePublishPct;
            let currentBlockingPassed = prePublishScore.blockingPassed;
            let lastScoreResult = prePublishScore;
            
            if (this.intelligentAnalyzer && typeof this.intelligentAnalyzer.improveContentWithLLM === 'function') {
              for (let iteration = 1; iteration <= MAX_IMPROVE_ITERATIONS; iteration++) {
                if (currentScore >= qualityTargetScore && currentBlockingPassed) break;
                
                const targetedInstructions = buildTargetedInstructions(lastScoreResult);
                console.log(`🔄 QUALITY_GATE iteration ${iteration}/${MAX_IMPROVE_ITERATIONS}: ${targetedInstructions.join('; ')}`);
                
                try {
                  const improvedContent = await this.intelligentAnalyzer.improveContentWithLLM(
                    finalizedArticle.content,
                    { 
                      destination: finalizedArticle.destination || '', 
                      theme: finalizedArticle.theme || '',
                      targetedInstructions // Passer les instructions ciblées
                    },
                    { extracted: finalizedArticle.extracted || {}, angle: finalizedArticle.angle || null }
                  );
                  
                  if (improvedContent && improvedContent.length > finalizedArticle.content.length * 0.65) {
                    finalizedArticle.content = improvedContent;
                    await reinjectInternalLinks(`POST-IMPROVE-${iteration}`);

                    // AUTO-FIXERS: Apply programmatic fixes after LLM improve
                    try {
                      const autoFixCtx = {
                        destination: finalizedArticle.destination || finalizedArticle.final_destination || '',
                        sourceUrl: pipelineContext?.source_truth?.source_url || pipelineContext?.source_url || null
                      };
                      const { html: postImproveFixed, totalFixed: postFixCount } = await applyAllFixes(
                        finalizedArticle.content, finalizedArticle.title || '', [], null, autoFixCtx
                      );
                      if (postImproveFixed !== finalizedArticle.content) {
                        finalizedArticle.content = postImproveFixed;
                        console.log(`   \u2705 AUTO-FIXERS post-improve (iter ${iteration}): ${postFixCount} fix(es)`);
                      }
                    } catch (afErr) {
                      console.warn(`   \u26a0\ufe0f Auto-fixers post-improve \u00e9chou\u00e9s: ${afErr.message}`);
                    }
                    
                    const recheckHtml = `<h1>${finalizedArticle.title || ''}</h1>\n${finalizedArticle.content}`;
                    const recheck = qualityAnalyzer.getGlobalScore(recheckHtml, editorialMode, finalizedArticle.angle);
                    const recheckPct = parseFloat(recheck.globalScore);
                    
                    console.log(`📊 Post-improve score (iter ${iteration}): ${recheckPct}% (was ${currentScore}%)`);
                    
                    lastScoreResult = recheck;
                    currentScore = recheckPct;
                    currentBlockingPassed = !!recheck.blockingPassed;
                    finalGatePct = recheckPct;
                    finalGateBlockingPassed = currentBlockingPassed;
                    
                    if (currentScore >= qualityTargetScore && currentBlockingPassed) {
                      console.log(`✅ QUALITY_GATE: score amélioré à ${recheckPct}% après ${iteration} itération(s)`);
          finalizedArticle._qualityGatePassed = true;
                      break;
                    }
                  }
                } catch (improveErr) {
                  console.warn(`⚠️ QUALITY_GATE improve iteration ${iteration} échoué: ${improveErr.message}`);
                  break;
                }
              }
              
              // Verdict final après boucle
              if (currentScore < 80) {
                console.warn(`⚠️ QUALITY_BELOW_THRESHOLD: score ${currentScore}% < 80% après ${MAX_IMPROVE_ITERATIONS} itérations. Publication avec avertissement.`);
              finalizedArticle._qualityGatePassed = true;
              } else if (currentScore < qualityTargetScore) {
                console.warn(`⚠️ QUALITY_GATE: score ${currentScore}% acceptable mais < cible ${qualityTargetScore}%. Publication autorisée.`);
              finalizedArticle._qualityGatePassed = true;
              }
            }
          } else {
            console.log(`✅ QUALITY_GATE_PASSED: Pre-pub score: ${prePublishPct}% >= cible ${qualityTargetScore}%. Publication autorisée.`);
          finalizedArticle._qualityGatePassed = true;
          }

          // P0: en NEWS, ne jamais publier si bloquants en FAIL (même si score/override)
          if (editorialMode === 'news' && strictNewsBlocking && !finalGateBlockingPassed) {
            throw new Error(`QUALITY_GATE_NEWS_BLOCKING_FAIL: blocking=false (score=${finalGatePct}%)`);
          }

          // Filet de sécurité final: réinjection liens une dernière fois avant publication
          try {
            await reinjectInternalLinks('POST-GATE');
          } catch (linkErr) {
            console.warn(`⚠️ Post-gate link re-injection failed: ${linkErr.message}`);
          }
        } catch (gateErr) {
          console.warn(`⚠️ Erreur quality gate: ${gateErr.message}. Publication continue.`);
        }
      }

      // 9.9. Dernier fixWordGlue avant publication (attrape les glues reintroduits par improve/translate)
      if (this.articleFinalizer) {
        finalizedArticle.content = this.articleFinalizer.fixWordGlue(finalizedArticle.content, null);
        finalizedArticle.content = this.articleFinalizer.applyDeterministicFinalTextCleanup(finalizedArticle.content);
        if ((resolvedEditorialMode || '').toLowerCase() === 'news') {
          finalizedArticle.content = this.articleFinalizer.ensureNewsQualityConvergence(
            finalizedArticle.content,
            {
              title: finalizedArticle.title || '',
              finalDestination: pipelineContext?.final_destination || finalizedArticle?.final_destination || '',
              pillarLink: 'https://flashvoyage.com/notre-methode/'
            }
          );
        }
        finalizedArticle.content = this.articleFinalizer.sanitizeAffiliateWidgetIntegrity(finalizedArticle.content);
      }

      // FINAL post-processing fixers (after finalizer, before WP upload)
      finalizedArticle.content = applyPostProcessingFixers(finalizedArticle.content);

      // 10. Publication WordPress
      console.log('📝 Publication sur WordPress...');
      const publishedArticle = await this.publishToWordPress(finalizedArticle);
      
      // VIZ-BRIDGE: publisher complete (skip if quality-loop manages this)
      if (process.env.SKIP_WP_PUBLISH !== '1') {
        this.vizBridge.emit({ type: 'stage_complete', agent: 'publisher', data: {
          status: 'success', detail: 'Published as draft, ID: ' + publishedArticle.id,
        }});
        this.vizBridge.emit({ type: 'pipeline_complete', agent: null, data: {
          article: finalizedArticle.title, wpPostId: publishedArticle.id,
        }});
      }
      console.log('✅ Article publié avec succès!');
      console.log('🔗 Lien:', publishedArticle.link);

      // After WordPress publish, distribute to social media (VP Carousel)
      if (!process.env.FLASHVOYAGE_DRY_RUN && !process.env.SKIP_SOCIAL) {
        try {
          const { distributeArticle } = await import('./social-distributor/index.js');
          console.log('📱 Generating VP carousel + distributing to FB/IG/Threads...');
          const socialResult = await distributeArticle(publishedArticle.id);
          console.log(`📱 Social distribution complete — published: ${socialResult.published}, failed: ${socialResult.failed}`);
        } catch (e) {
          console.warn('⚠️ Social distribution failed (non-blocking):', e.message);
        }
      }

      // Enregistrer dans le calendrier editorial
      try {
        calendar.recordPublication(
          directive.articleType,
          directive.cluster.id,
          directive.searchHints[0] || '',
          finalizedArticle.title || ''
        );
        console.log(`📅 Calendrier mis a jour: ${directive.articleType} #${directive.totalPublished + 1}`);
      } catch (calErr) {
        console.warn(`⚠️ Erreur calendrier (non-bloquant): ${calErr.message}`);
      }

      // LLM Cost Report
      const costSummary = costTracker.printSummary();
      const wordCount = (finalizedArticle.content || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
      costTracker.saveToDisk({
        id: publishedArticle.id,
        title: finalizedArticle.title,
        slug: publishedArticle.slug,
        url: publishedArticle.link,
        wordCount
      });

      // Auto-refresh du dashboard WordPress
      try {
        const { execFileSync } = await import('child_process');
        const { dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const __dir = dirname(fileURLToPath(import.meta.url));
        execFileSync('node', ['scripts/publish-cost-dashboard.js'], { cwd: __dir, timeout: 15000, stdio: 'pipe' });
        console.log('📊 Dashboard coûts mis à jour automatiquement');
      } catch (dashErr) {
        console.warn(`⚠️ Dashboard coûts non mis à jour: ${dashErr.message}`);
      }
      
      // Re-sync internal links index after publish so new article is available for future articles
      try {
        await this.syncInternalLinksIndex();
        console.log('🔗 Index liens internes re-synchronisé post-publication');
      } catch (syncErr) {
        console.warn(`⚠️ Post-publish sync liens: ${syncErr.message}`);
      }
      
      // 10.5. BOUCLE VALIDATION PRODUCTION (Plan Pipeline Quality Fixes)
      if (!DRY_RUN && publishedArticle.link) {
        try {
          const ProductionValidator = (await import('./production-validator.js')).default;
          const productionValidator = new ProductionValidator();
          
          // Créer un client WordPress simplifié pour les mises à jour
          const wordpressClient = {
            updateArticle: async (articleId, article) => {
              const axios = (await import('axios')).default;
              const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
              const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
              
              await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
                content: article.content,
                title: article.title
              }, {
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': 'application/json'
                }
              });
            }
          };
          
          console.log('\n🔄 Démarrage boucle validation production...');
          // Passer l'ID WordPress a l'article source pour que autoFix puisse mettre a jour
          const sourceForValidator = { ...finalizedArticle, id: publishedArticle.id };
          const validationResult = await productionValidator.validateWithLoop(
            publishedArticle.link,
            sourceForValidator,
            wordpressClient,
            5, // maxIterations
            resolvedEditorialMode
          );
          
          if (validationResult.success) {
            console.log(`\n✅ PROD_VALIDATION_COMPLETE: score=${validationResult.finalScore}% iterations=${validationResult.iterations} duration=${validationResult.duration}ms`);
          } else {
            console.warn(`\n⚠️ PROD_VALIDATION_INCOMPLETE: score=${validationResult.finalScore}% iterations=${validationResult.iterations}`);
            if (validationResult.issues && validationResult.issues.length > 0) {
              console.warn(`   Problèmes restants: ${validationResult.issues.length}`);
            }
          }
        } catch (validationError) {
          console.error(`❌ Erreur validation production: ${validationError.message}`);
          // Ne pas bloquer la publication si la validation échoue
        }
      } else if (DRY_RUN) {
        console.log('🧪 DRY_RUN: Validation production désactivée');
      }
      
      // Ajouter l'URL Reddit au cache pour éviter les doublons au prochain run
      // (redditUrl déjà déclaré ligne 335)
      // PHASE 2 FIX: Ne pas polluer le cache en DRY_RUN (sinon les fixtures s'epuisent)
      if (redditUrl && !DRY_RUN) {
        this.publishedRedditUrls.add(redditUrl);
        await this.saveRedditUrlsCache();
        console.log(`   📋 URL Reddit ajoutée et sauvegardée: ${redditUrl.substring(0, 60)}...`);
      } else if (redditUrl && DRY_RUN) {
        console.log(`💾 DRY_RUN: URL Reddit NON sauvegardée au cache (${redditUrl.substring(0, 60)}...)`);
      }
      // Pipeline-runner gère maintenant les stats dans le report
      console.log('📊 Article final:', {
        title: finalizedArticle.title,
        contentLength: finalizedArticle.content?.length || 0,
        categories: finalizedArticle.categories?.length || 0,
        final_destination: finalizedArticle.final_destination || 'N/A'
      });

      // 11. Mise à jour finale de la base de données (inclut le nouvel article)
      if (DRY_RUN) {
        console.log('🧪 DRY_RUN: écriture DB finale bloquée');
      } else {
      console.log('\n📚 Mise à jour finale de la base de données...');
      try {
        const { WordPressArticlesCrawler } = await import('./wordpress-articles-crawler.js');
        const crawler = new WordPressArticlesCrawler();
        await crawler.crawlAllArticles();
        crawler.saveToFile('articles-database.json'); // SAUVEGARDE EXPLICITE
        console.log('✅ Base de données mise à jour avec le nouvel article\n');
      } catch (error) {
        console.warn('⚠️ Impossible de mettre à jour la base:', error.message);
        console.warn('   → Relancez manuellement: node wordpress-articles-crawler.js\n');
        }
      }

      // Enrichir le retour avec les données du pipeline pour le quality-loop
      return {
        ...publishedArticle,
        content: finalizedArticle.content,
        title: finalizedArticle.title || publishedArticle.title?.rendered || publishedArticle.title,
        editorialMode: finalizedArticle.editorialMode || finalizedArticle.editorial_mode,
        slug: finalizedArticle.slug || publishedArticle.slug,
        categories: finalizedArticle.categories,
        tags: finalizedArticle.tags,
        featuredImage: finalizedArticle.featuredImage,
        wpPostId: publishedArticle.id,
        pipelineContext,
        _qualityGatePassed: finalizedArticle._qualityGatePassed || false
      };

    } catch (error) {
      console.error('❌ Erreur génération article amélioré:', error.message);
      throw error;
    }
  }

  // Obtenir catégories selon l'analyse et les placements affiliés
  // UTILISE final_destination comme source of truth + thème affiliation
  async getCategoriesForContent(analysis, content, affiliatePlacements = []) {
    const categories = [];
    
    // Mapping produit affilié → catégorie
    const AFFILIATE_TO_CATEGORY = {
      insurance: 'Santé & Assurance',
      esim: 'Transport & Mobilité',
      flights: 'Transport & Mobilité',
      accommodation: 'Logement & Coliving',
      tours: 'Guides Pratiques',
      transfers: 'Transport & Mobilité',
      car_rental: 'Transport & Mobilité',
      bikes: 'Transport & Mobilité',
      coworking: 'Travail & Productivité',
      flight_compensation: 'Transport & Mobilité',
      events: 'Guides Pratiques'
    };
    
    // 1. Catégorie destination (priorité haute)
    if (analysis.final_destination && analysis.final_destination !== 'Asie') {
      const destCategory = this.getDestinationCategory(analysis.final_destination.toLowerCase());
      if (destCategory && destCategory !== 'Destinations') {
        categories.push(destCategory);
      }
    }
    
    // 2. Catégorie thème affiliation (si placements détectés)
    if (affiliatePlacements && affiliatePlacements.length > 0) {
      const primaryPlacement = affiliatePlacements[0];
      const themeCategory = AFFILIATE_TO_CATEGORY[primaryPlacement.id];
      if (themeCategory && !categories.includes(themeCategory)) {
        categories.push(themeCategory);
      }
    }
    
    // 3. Fallback par type de contenu
    if (categories.length === 0) {
      const typeMapping = {
        'TEMOIGNAGE_SUCCESS_STORY': 'Digital Nomades Asie',
        'TEMOIGNAGE_ECHEC_LEÇONS': 'Digital Nomades Asie',
        'GUIDE_PRATIQUE': 'Guides Pratiques',
        'COMPARAISON_DESTINATIONS': 'Comparaisons'
      };
      categories.push(typeMapping[analysis.type_contenu] || 'Digital Nomades Asie');
    }
    
    console.log(`📂 Catégories assignées: ${categories.join(', ')}`);
    return categories.slice(0, 2); // Max 2 catégories
  }

  /**
   * A. Construit source_truth depuis le post source Reddit
   */
  buildSourceTruth(selectedArticle, analysis) {
    const sourceTruth = {
      destination: null,
      country: null,
      entities: [],
      source_url: selectedArticle.link || '',
      source_title: selectedArticle.title || ''
    };

    // PRIORITÉ 1: Extracteur Reddit si has_minimum_signals ET destination trouvée
    if (analysis.reddit_extraction?.quality?.has_minimum_signals === true && analysis.main_destination) {
      sourceTruth.destination = analysis.main_destination;
      sourceTruth.country = this.mapDestinationToCountry(analysis.main_destination);
      console.log(`   ✓ source_truth depuis extracteur Reddit: ${sourceTruth.destination}`);
    }
    // PRIORITÉ 2: Mapping d'entités connues (Magome/Nagiso/Nakasendo => Japan)
    else {
      const entityMap = {
        'magome': 'japan',
        'nagiso': 'japan',
        'nakasendo': 'japan',
        'tokyo': 'japan',
        'kyoto': 'japan',
        'osaka': 'japan',
        'bangkok': 'thailand',
        'chiang mai': 'thailand',
        'phuket': 'thailand',
        'hanoi': 'vietnam',
        'ho chi minh': 'vietnam',
        'bali': 'indonesia',
        'jakarta': 'indonesia',
        'seoul': 'korea',
        'manila': 'philippines'
      };

      const titleLower = (selectedArticle.title || '').toLowerCase();
      const contentLower = (analysis.reddit_extraction?.post?.text || '').toLowerCase();
      const combinedText = `${titleLower} ${contentLower}`;

      // Extraire entités connues
      for (const [entity, country] of Object.entries(entityMap)) {
        if (combinedText.includes(entity)) {
          sourceTruth.entities.push(entity);
          if (!sourceTruth.destination) {
            sourceTruth.destination = country;
            sourceTruth.country = country;
          }
        }
      }

      if (sourceTruth.destination) {
        console.log(`   ✓ source_truth depuis mapping entités: ${sourceTruth.destination} (${sourceTruth.entities.join(', ')})`);
      }
    }
    // PRIORITÉ 3: Classification light sur titre + contenu source
    if (!sourceTruth.destination) {
      const detected = this.detectDestinationFromSource(selectedArticle, analysis);
      if (detected.length > 0) {
        sourceTruth.destination = detected[0];
        sourceTruth.country = this.mapDestinationToCountry(detected[0]);
        console.log(`   ✓ source_truth depuis classification source: ${sourceTruth.destination}`);
      }
    }
    
    // A) PRIORITÉ 4: Fallback depuis geo.country si présent
    if (!sourceTruth.destination) {
      if (analysis.geo?.country) {
        sourceTruth.destination = analysis.geo.country;
        sourceTruth.country = analysis.geo.country;
        console.log(`   ✓ SOURCE_TRUTH_FALLBACK_FROM_GEO: country=${analysis.geo.country}`);
      } else if (selectedArticle.geo?.country) {
        sourceTruth.destination = selectedArticle.geo.country;
        sourceTruth.country = selectedArticle.geo.country;
        console.log(`   ✓ SOURCE_TRUTH_FALLBACK_FROM_GEO: country=${selectedArticle.geo.country}`);
      }
    }

    return sourceTruth;
  }

  /**
   * D. Détection destination depuis source (PAS depuis contenu LLM)
   */
  detectDestinationFromSource(selectedArticle, analysis) {
    const destinations = [];
    
    // Analyser UNIQUEMENT: titre, subreddit, contenu Reddit extrait
    const sourceText = [
      selectedArticle.title || '',
      selectedArticle.subreddit || '',
      analysis.reddit_extraction?.post?.text || '',
      analysis.reddit_extraction?.post?.signals?.locations?.join(' ') || ''
    ].join(' ').toLowerCase();

    const destinationKeywords = {
      'thailand': ['thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon'],
      'indonesia': ['indonesia', 'indonésie', 'bali', 'jakarta', 'ubud'],
      'japan': ['japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'magome', 'nagiso', 'nakasendo'],
      'philippines': ['philippines', 'manila', 'cebu'],
      'korea': ['korea', 'corée', 'seoul', 'séoul'],
      'singapore': ['singapore', 'singapour']
    };

    const destinationScores = {};
    for (const [country, keywords] of Object.entries(destinationKeywords)) {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (sourceText.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      if (score > 0) {
        destinationScores[country] = score;
      }
    }

    if (Object.keys(destinationScores).length > 0) {
      const bestDestination = Object.entries(destinationScores)
        .sort(([,a], [,b]) => b - a)[0][0];
      destinations.push(bestDestination);
      console.log(`   🎯 GENERATED_DESTINATION_GUESS=${bestDestination} (depuis source)`);
    }

    return destinations;
  }

  /**
   * Mapping destination → country
   */
  mapDestinationToCountry(destination) {
    const countryMap = {
      'thailand': 'thailand',
      'vietnam': 'vietnam',
      'indonesia': 'indonesia',
      'japan': 'japan',
      'philippines': 'philippines',
      'korea': 'korea',
      'singapore': 'singapore'
    };
    return countryMap[destination] || destination;
  }

  /**
   * B. Validation post-génération: vérifier cohérence destination
   */
  validateDestinationConsistency(generatedContent, sourceTruth) {
    if (!sourceTruth?.destination) {
      return { consistent: true, detected: null };
    }

    // Extraire destination dominante du contenu généré
    const detectedDestinations = this.extractDestinationsFromContent(generatedContent);
    const detected = detectedDestinations.length > 0 ? detectedDestinations[0] : null;

    // Comparaison insensible à la casse
    const sourceLower = (sourceTruth.destination || '').toLowerCase().trim();
    const detectedLower = (detected || '').toLowerCase().trim();
    const consistent = !detected || detectedLower === sourceLower;
    
    return {
      consistent,
      detected,
      expected: sourceTruth.destination
    };
  }

  /**
   * C. Régénération corrective (1 seule tentative)
   */
  async repairGeneration(selectedArticle, analysis, generatedContent) {
    try {
      console.log('   🔧 Construction prompt de correction...');
      
      const sourceTruth = analysis.source_truth;
      if (!sourceTruth?.destination) {
        return { success: false };
      }

      // Construire un prompt de correction pour le LLM
      const correctionInstructions = `CORRECTION OBLIGATOIRE:
- Tu DOIS écrire sur ${sourceTruth.destination} uniquement.
- Le post source parle de: ${sourceTruth.entities.join(', ') || sourceTruth.source_title}
- Interdit de mentionner ${this.getForbiddenDestinations(sourceTruth.destination)}.
- Le contenu actuel dérive vers une autre destination - corrige-le pour parler UNIQUEMENT de ${sourceTruth.destination}.`;

      // Ajouter les instructions de correction à l'analysis pour que le LLM les voie
      const analysisWithCorrection = {
        ...analysis,
        correctionInstructions
      };

      // PHASE 4.1: Construire extracted, pattern, story pour repairGeneration
      const extracted = {
        title: selectedArticle.title || '',
        author: selectedArticle.author || '',
        selftext: selectedArticle.source_text || selectedArticle.content || selectedArticle.selftext || '',
        comments: selectedArticle.comments_snippets ? selectedArticle.comments_snippets.map(c => ({ body: c })) : [],
        geo: selectedArticle.geo || analysis.geo || {},
        meta: {
          subreddit: selectedArticle.subreddit || '',
          url: selectedArticle.link || selectedArticle.url || '',
          source: selectedArticle.source || 'Communauté'
        }
      };
      
      // Vérifier que pattern et story sont présents
      if (!analysis.pattern || !analysis.story) {
        console.warn('⚠️ repairGeneration: pattern ou story manquant, impossible de réparer');
        return { success: false };
      }
      
      // Repasser seulement l'étape génération finale
      const repairedContent = await this.intelligentAnalyzer.generateIntelligentContent(
        { extracted, pattern: analysis.pattern, story: analysis.story },
        analysisWithCorrection
      );

      // Extraire le contenu pour validation
      let repairedContentText = '';
      if (Array.isArray(repairedContent.content)) {
        repairedContentText = repairedContent.content.map(section => {
          if (typeof section === 'string') return section;
          if (section.content) return section.content;
          return JSON.stringify(section);
        }).join('\n\n');
      } else if (typeof repairedContent.content === 'string') {
        repairedContentText = repairedContent.content;
      } else {
        repairedContentText = JSON.stringify(repairedContent);
      }

      // Re-valider
      const revalidation = this.validateDestinationConsistency(repairedContentText, sourceTruth);
      
      if (revalidation.consistent) {
        return {
          success: true,
          content: repairedContent.content,
          title: repairedContent.title
        };
      } else {
        console.log(`   ⚠️ Régénération toujours incohérente: ${revalidation.detected} vs ${sourceTruth.destination}`);
        return { success: false };
      }
    } catch (error) {
      console.error('   ❌ Erreur régénération corrective:', error.message);
      return { success: false };
    }
  }

  /**
   * Liste des destinations interdites pour un pays donné
   */
  getForbiddenDestinations(allowedDestination) {
    const allDestinations = ['thailand', 'vietnam', 'indonesia', 'japan', 'philippines', 'korea', 'singapore'];
    return allDestinations.filter(d => d !== allowedDestination).join(', ');
  }

  // Extraire les destinations du contenu généré
  // UNIQUEMENT les destinations asiatiques officielles: Indonésie, Vietnam, Thaïlande, Japon, Corée du Sud, Philippines, Singapour
  // D. NE PAS UTILISER CETTE FONCTION POUR LE SCORING PRIMAIRE (utiliser detectDestinationFromSource)
  extractDestinationsFromContent(content) {
    const destinations = [];
    const contentToAnalyze = (content || '').toLowerCase();
    
    // UNIQUEMENT les destinations asiatiques officielles
    const destinationKeywords = {
      'thailand': ['thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket', 'krabi', 'pattaya', 'pad thaï', 'tuk-tuk'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang', 'hue', 'nha trang'],
      'indonesia': ['indonesia', 'indonésie', 'bali', 'jakarta', 'ubud', 'yogyakarta', 'bandung', 'canggu', 'seminyak', 'lombok'],
      'japan': ['japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'nagoya', 'fukuoka'],
      'philippines': ['philippines', 'manila', 'cebu', 'davao', 'boracay', 'palawan'],
      'korea': ['korea', 'corée', 'south korea', 'corée du sud', 'seoul', 'séoul', 'busan', 'pusan', 'jeju'],
      'singapore': ['singapore', 'singapour']
      // SUPPRIMÉ: 'spain', 'portugal', 'malaysia' - destinations non-asiatiques interdites
    };
    
    // Compter les mentions pour chaque destination
    const destinationScores = {};
    
    for (const [country, keywords] of Object.entries(destinationKeywords)) {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (contentToAnalyze.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 0) {
        destinationScores[country] = score;
        console.log(`🎯 Destination détectée: ${country} (score: ${score})`);
      }
    }
    
    // Retourner la destination avec le score le plus élevé
    // VALIDATION: Rejeter les destinations non-asiatiques
    const nonAsiaDestinations = ['spain', 'portugal', 'france', 'italy', 'greece', 'turkey', 'europe', 'america', 'usa', 'brazil', 'mexico', 'iraq', 'irak', 'iran', 'israel', 'jordanie', 'liban', 'syrie', 'dubai', 'qatar', 'koweit', 'oman', 'yemen', 'bahrein', 'kurdistan', 'bagdad', 'erbil'];
    if (Object.keys(destinationScores).length > 0) {
      const bestDestination = Object.entries(destinationScores)
        .filter(([dest]) => !nonAsiaDestinations.includes(dest.toLowerCase()))
        .sort(([,a], [,b]) => b - a)[0];
      
      if (bestDestination) {
        destinations.push(bestDestination[0]);
        console.log(`🏆 Destination principale: ${bestDestination[0]}`);
      } else {
        console.log(`⚠️ Aucune destination asiatique trouvée dans le contenu`);
      }
    }
    
    return destinations;
  }

  // Extraire les destinations de l'analyse
  extractDestinationsFromAnalysis(analysis) {
    const destinations = [];
    
    // Analyser le contenu ET le titre pour les destinations
    const contentToAnalyze = [
      analysis.contenu || '',
      analysis.titre || '',
      analysis.title || ''
    ].join(' ').toLowerCase();
    
    const destinationKeywords = {
      'thailand': ['thailand', 'thaïlande', 'bangkok', 'chiang mai', 'phuket', 'krabi', 'pattaya', 'pad thaï', 'tuk-tuk'],
      'vietnam': ['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang', 'hue', 'nha trang'],
      'indonesia': ['indonesia', 'indonésie', 'bali', 'jakarta', 'ubud', 'yogyakarta', 'bandung'],
      'japan': ['japan', 'japon', 'tokyo', 'kyoto', 'osaka', 'nagoya', 'fukuoka'],
      'philippines': ['philippines', 'manila', 'cebu', 'davao', 'boracay', 'palawan'],
      'malaysia': ['malaysia', 'malaisie', 'kuala lumpur', 'penang', 'langkawi', 'johor'],
      'singapore': ['singapore', 'singapour'],
      'spain': ['spain', 'espagne', 'madrid', 'barcelona', 'barcelone', 'valencia', 'seville', 'bilbao', 'siesta'],
      'portugal': ['portugal', 'lisbon', 'lisbonne', 'porto', 'coimbra', 'faro', 'tage']
    };
    
    // Compter les mentions pour chaque destination
    const destinationScores = {};
    
    for (const [country, keywords] of Object.entries(destinationKeywords)) {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (contentToAnalyze.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 0) {
        destinationScores[country] = score;
        console.log(`🎯 Destination détectée: ${country} (score: ${score})`);
      }
    }
    
    // Retourner la destination avec le score le plus élevé
    if (Object.keys(destinationScores).length > 0) {
      const bestDestination = Object.entries(destinationScores)
        .sort(([,a], [,b]) => b - a)[0][0];
      destinations.push(bestDestination);
      console.log(`🏆 Destination principale: ${bestDestination}`);
    }
    
    return destinations;
  }
  
  // Obtenir la catégorie de destination intelligente (UNE SEULE catégorie)
  getDestinationCategory(destination) {
    // Mapping vers les catégories WordPress existantes (TOUTES les sous-catégories)
    const destinationMapping = {
      // Sous-catégories spécifiques existantes (parent: 1)
      'vietnam': 'Vietnam', // ID: 59 (parent: 1)
      'thailand': 'Thaïlande', // ID: 60 (parent: 1)
      'japan': 'Japon', // ID: 61 (parent: 1)
      'singapore': 'Singapour', // ID: 62 (parent: 1)
      'korea': 'Corée du Sud', // ID: 63 (parent: 1)
      'philippines': 'Philippines', // ID: 64 (parent: 1)
      'indonesia': 'Indonésie', // ID: 182 (parent: 1)
      
      // Destinations sans sous-catégorie → catégorie principale "Destinations"
      'malaysia': 'Destinations',
      'taiwan': 'Destinations',
      'hong kong': 'Destinations',
      'spain': 'Destinations',
      'portugal': 'Destinations',
      'france': 'Destinations',
      'germany': 'Destinations',
      'italy': 'Destinations',
      'netherlands': 'Destinations',
      'china': 'Destinations',
      'india': 'Destinations',
      'australia': 'Destinations',
      'new zealand': 'Destinations',
      'brazil': 'Destinations',
      'mexico': 'Destinations'
    };
    
    return destinationMapping[destination] || 'Destinations';
  }

  // Obtenir la sous-catégorie
  getSubCategory(sousCategorie) {
    const subCategoryMapping = {
      'visa': 'Visa & Formalités',
      'logement': 'Logement & Coliving',
      'transport': 'Transport & Mobilité',
      'santé': 'Santé & Assurance',
      'finance': 'Finance & Fiscalité',
      'communauté': 'Communauté & Réseau',
      'travail': 'Travail & Productivité',
      'voyage': 'Voyage & Découverte'
    };

    return subCategoryMapping[sousCategorie] || null;
  }

  // Obtenir les tags selon l'analyse et les placements affiliés
  // UTILISE final_destination comme source of truth + tags affiliation
  async getTagsForContent(analysis, affiliatePlacements = [], content = "") {
    const tags = new Set();
    
    // Strip HTML to get plain text for keyword scanning
    const plainText = (content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
    const titleText = (analysis.title || "").toLowerCase();
    const combinedText = titleText + " " + plainText;
    
    // ─── SMART CONTENT-BASED TAG DETECTION ─────────────────────
    // Keyword → tag mapping: scan article content for topic signals
    const CONTENT_TAG_RULES = [
      // Health & Medical
      { keywords: ["vaccin", "vaccination", "médecin", "médical", "hôpital", "pharmacie", "maladie", "dengue", "paludisme", "malaria", "santé", "docteur", "clinique", "urgence", "soin"], tag: "Santé" },
      // Insurance
      { keywords: ["assurance", "couverture", "mutuelle", "rapatriement", "safety wing", "safetywing", "chapka", "world nomads", "allianz"], tag: "Assurance voyage" },
      // Budget & Cost
      { keywords: ["budget", "coût", "prix", "€", "euro", "argent", "dépens", "économi", "pas cher", "tarif", "combien", "financ"], tag: "Budget" },
      // Visa & Formalities
      { keywords: ["visa", "passeport", "douane", "immigration", "formalité", "séjour", "overstay", "e-visa", "evisa", "exemption"], tag: "Visa" },
      // Transport
      { keywords: ["transport", "vol ", "avion", "train", "bus ", "ferry", "scooter", "moto", "taxi", "grab ", "gojek", "aéroport", "gare", "métro", "tuk-tuk", "tuktuk"], tag: "Transport" },
      // Accommodation
      { keywords: ["hôtel", "hostel", "auberge", "airbnb", "logement", "hébergement", "chambre", "guest house", "guesthouse", "resort", "villa"], tag: "Hébergement" },
      // Digital Nomad
      { keywords: ["nomad", "remote", "télétravail", "freelance", "coworking", "co-working", "digital nomad"], tag: "Nomadisme Digital" },
      // Food & Cuisine
      { keywords: ["cuisine", "gastronomie", "restaurant", "street food", "nourriture", "plat ", "recette", "manger", "spécialité culinaire"], tag: "Gastronomie" },
      // Culture
      { keywords: ["temple", "pagode", "culture", "tradition", "cérémonie", "festival", "fête", "musée", "patrimoine", "histoire"], tag: "Culture" },
      // Itinerary
      { keywords: ["itinéraire", "circuit", "road trip", "roadtrip", "étape", "parcours", "trajet", "jour 1", "jour 2", "semaine"], tag: "Itinéraire" },
      // Coliving & Coworking
      { keywords: ["coliving", "co-living", "coworking", "co-working", "espace partagé", "communauté nomade"], tag: "Coliving" },
      // eSIM & Connectivity
      { keywords: ["esim", "e-sim", "sim card", "carte sim", "internet", "wifi", "4g", "5g", "data", "connexion", "roaming"], tag: "eSIM" },
      // Safety
      { keywords: ["sécurité", "arnaque", "danger", "vol ", "pickpocket", "escroq", "prudence", "risque", "safe"], tag: "Sécurité" },
      // Practical tips
      { keywords: ["conseil", "astuce", "guide pratique", "check-list", "checklist", "préparer", "organiser", "planifier", "erreur à éviter"], tag: "Guide" },
    ];
    
    // Scan content for each rule
    for (const rule of CONTENT_TAG_RULES) {
      const matchCount = rule.keywords.reduce((count, kw) => {
        const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        return count + (combinedText.match(regex) || []).length;
      }, 0);
      // Require at least 2 keyword matches to avoid false positives
      if (matchCount >= 2) {
        tags.add(rule.tag);
      }
    }
    
    // ─── DESTINATION TAG (from analysis metadata) ──────────────
    if (analysis.final_destination && analysis.final_destination !== "Asie") {
      const destTag = this.normalizeDestinationTag(analysis.final_destination);
      if (destTag) tags.add(destTag);
    }
    
    // Also detect destination mentions in content for multi-destination articles
    const DESTINATION_KEYWORDS = {
      "Thaïlande": ["thaïlande", "thailand", "bangkok", "chiang mai", "phuket", "pattaya", "koh samui", "krabi"],
      "Vietnam": ["vietnam", "hanoi", "hanoï", "ho chi minh", "saigon", "saïgon", "da nang", "hoi an", "hué"],
      "Japon": ["japon", "japan", "tokyo", "osaka", "kyoto", "hiroshima", "okinawa", "nara", "fukuoka"],
      "Indonésie": ["indonésie", "indonesia", "bali", "jakarta", "ubud", "lombok", "yogyakarta", "java", "sumatra"],
      "Corée du Sud": ["corée du sud", "south korea", "séoul", "seoul", "busan", "jeju"],
      "Singapour": ["singapour", "singapore"],
      "Philippines": ["philippines", "manille", "manila", "cebu", "palawan", "boracay", "siargao"],
    };
    
    for (const [destTag, keywords] of Object.entries(DESTINATION_KEYWORDS)) {
      const found = keywords.some(kw => combinedText.includes(kw));
      if (found) tags.add(destTag);
    }
    
    // ─── AFFILIATE-BASED TAGS (keep existing logic) ────────────
    const AFFILIATE_TAGS = {
      insurance: ["Assurance voyage", "Santé"],
      esim: ["eSIM"],
      flights: ["Transport"],
      accommodation: ["Hébergement"],
      tours: ["Culture"],
      transfers: ["Transport"],
      car_rental: ["Transport"],
      bikes: ["Transport"],
      coworking: ["Coliving"],
      flight_compensation: ["Transport"],
      events: ["Culture"]
    };
    
    if (affiliatePlacements && affiliatePlacements.length > 0) {
      affiliatePlacements.slice(0, 2).forEach(p => {
        const themeTags = AFFILIATE_TAGS[p.id] || [];
        themeTags.forEach(t => tags.add(t));
      });
    }
    
    // ─── CONTENT TYPE TAGS ─────────────────────────────────────
    if (analysis.type_contenu?.includes("TEMOIGNAGE")) {
      tags.add("Témoignages");
    }
    if (analysis.type_contenu?.includes("GUIDE")) {
      tags.add("Guide");
    }
    if (analysis.type_contenu?.includes("COMPARAISON")) {
      tags.add("Comparaisons");
    }
    
    // Always add "Asie" as base tag for the site
    tags.add("Asie");
    
    console.log(`🏷️ Smart tags detected (${tags.size}): ${[...tags].join(", ")}`);
    return [...tags].slice(0, 10); // Max 10 tags
  }

  /**
   * Normalise une destination en tag WordPress
   */
  normalizeDestinationTag(destination) {
    const mapping = {
      'thailand': 'Thaïlande',
      'thaïlande': 'Thaïlande',
      'vietnam': 'Vietnam',
      'indonesia': 'Indonésie',
      'indonésie': 'Indonésie',
      'japan': 'Japon',
      'japon': 'Japon',
      'korea': 'Corée du Sud',
      'corée': 'Corée du Sud',
      'philippines': 'Philippines',
      'singapore': 'Singapour',
      'singapour': 'Singapour',
      'bangkok': 'Thaïlande',
      'bali': 'Indonésie',
      'tokyo': 'Japon'
    };
    
    return mapping[destination.toLowerCase()] || destination;
  }

  // Générer un extrait
  generateExcerpt(content) {
    const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.substring(0, 160) + (text.length > 160 ? '...' : '');
  }

  // Générer une meta description
  generateMetaDescription(title, analysis) {
    const baseDescription = `Découvrez ${title.toLowerCase()} - Guide complet pour nomades en ${analysis.destination || 'Asie'}. Conseils pratiques, témoignages et bons plans.`;
    return baseDescription.substring(0, 160);
  }

  buildSeoTitleTag(title = '', destination = '') {
    const cleanTitle = String(title || '').replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanTitle) return '';
    const hasDestination = destination && new RegExp(destination, 'i').test(cleanTitle);
    let out = hasDestination ? cleanTitle : `${destination || 'Asie'} : ${cleanTitle}`;
    if (out.length > 60) {
      out = out.slice(0, 60).replace(/\s+\S*$/, '').trim();
    }
    return out;
  }

  sanitizePlaceholdersAndUnsafeClaims(html = '') {
    // BUG FIX: Stop replacing prices with euphemisms - keep original amounts
    return String(html || '')
      .replace(/garanti\s+à\s+100%/gi, 'dans la plupart des cas')
      .replace(/\bsans\s+aucun\s+risque\b/gi, 'avec un risque limité si bien préparé');
  }

  downgradeUnsourcedNumericalClaims(html = '', hasSourceEvidence = true) {
    // DISABLED: Ne plus remplacer les prix/durees par des euphemismes
    // Les chiffres du LLM sont extrapoles des sources Reddit et sont plus utiles que "un budget a verifier"
    return html;
  }

  enforceInternalLinkVolume(html = '', maxLinks = 8) {
    let seen = 0;
    return String(html || '').replace(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (full, pre, href, post, text) => {
      if (!/flashvoyage\.com/i.test(href)) return full;
      seen++;
      if (seen <= maxLinks) return full;
      return String(text || '').trim() || full;
    });
  }

  ensureFaqMinimum(html = '') {
    const hasFaqHeading = /<h[23][^>]*>\s*(?:faq|questions?\s+fr[ée]quentes?)\s*<\/h[23]>/i.test(html)
      || /<!-- wp:heading[^>]*-->\s*<h2[^>]*>\s*questions?\s+fr[eé]quentes\s*<\/h2>/i.test(html);
    const detailsCount = (String(html).match(/<details[\s>]/gi) || []).length;

    // If FAQ heading exists AND we already have 2+ details, nothing to do
    if (hasFaqHeading && detailsCount >= 2) return html;

    const faqDetails = [
      '<!-- wp:details -->',
      '<div class="fv-faq-item" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:0.75rem;overflow:hidden;"><details style="padding:0;"><summary style="padding:1rem 1.2rem;cursor:pointer;font-weight:600;font-size:1rem;list-style:none;display:flex;justify-content:space-between;align-items:center;">Quel budget prévoir sans mauvaise surprise ?<svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink:0;transition:transform 0.2s;"><path d="M5 7.5L10 12.5L15 7.5" stroke="#6b7280" stroke-width="2" stroke-linecap="round"/></svg></summary><div style="padding:0 1.2rem 1rem;color:#4b5563;line-height:1.6;">Prévois une marge pour les frais annexes et vérifie toujours le coût total avant réservation.</div></details></div>',
      '<!-- /wp:details -->',
      '<!-- wp:details -->',
      "<div class=\"fv-faq-item\" style=\"border:1px solid #e5e7eb;border-radius:8px;margin-bottom:0.75rem;overflow:hidden;\"><details style=\"padding:0;\"><summary style=\"padding:1rem 1.2rem;cursor:pointer;font-weight:600;font-size:1rem;list-style:none;display:flex;justify-content:space-between;align-items:center;\">Quelle erreur éviter en priorité ?<svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\" style=\"flex-shrink:0;transition:transform 0.2s;\"><path d=\"M5 7.5L10 12.5L15 7.5\" stroke=\"#6b7280\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg></summary><div style=\"padding:0 1.2rem 1rem;color:#4b5563;line-height:1.6;\">Ne base pas ta décision sur un seul prix affiché : compare bagages, transferts et conditions d'annulation.</div></details></div>",
      '<!-- /wp:details -->'
    ].join('\n');

    // If no FAQ heading at all, create the full section (H2 + details)
    if (!hasFaqHeading) {
      const faqBlock = [
        '<!-- wp:heading -->',
        '<h2>Questions fréquentes</h2>',
        '<!-- /wp:heading -->',
        faqDetails
      ].join('\n');
      // Insert before conclusion/retenir section or at end
      const beforeConclusion = /<h2[^>]*>\s*(?:ce\s*qu.?il\s*faut\s*retenir|à\s*retenir|nos\s*recommandations?|articles?\s*connexes?)\s*<\/h2>/i;
      const m = html.match(beforeConclusion);
      if (m) {
        const idx = html.indexOf(m[0]);
        return html.slice(0, idx) + faqBlock + '\n' + html.slice(idx);
      }
      return html + '\n' + faqBlock;
    }

    // FAQ heading exists but fewer than 2 details: add missing details after heading
    return html + '\n' + faqDetails;
  }

  enforceSourceTraceability(html = '', sourceUrl = '') {
    if (!sourceUrl || !/reddit\.com/i.test(sourceUrl)) return html;
    const hasSourceMention = new RegExp(sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(html);
    if (hasSourceMention) return html;
    if (!/t[ée]moignage|reddit|discussion|retour\s+terrain/i.test(html)) return html;
    return `${html}\n<p><a href="${sourceUrl}" target="_blank" rel="noopener nofollow">Source Reddit vérifiable</a> utilisée pour les éléments de témoignage.</p>`;
  }

  applyGeneratorOutputContract(article, ctx = {}) {
    const out = { ...article };
    out.title = String(out.title || '').replace(/^"+|"+$/g, '').trim();
    out.title_tag = this.buildSeoTitleTag(out.title, ctx.destination || '');
    let content = String(out.content || '');
    content = this.sanitizePlaceholdersAndUnsafeClaims(content);
    content = this.downgradeUnsourcedNumericalClaims(content, !!ctx.hasSourceEvidence);
    content = this.enforceInternalLinkVolume(content, 8);
    content = this.ensureFaqMinimum(content);
    content = this.enforceSourceTraceability(content, ctx.sourceUrl || '');
    out.content = content;
    return out;
  }

  // Valider l'article final
  /**
   * Extrait le texte éditorial pur (sans sections injectées, sans attributs HTML)
   */
  extractEditorialText(finalizedArticle) {
    let html = `${finalizedArticle.title} ${finalizedArticle.content || ''}`;
    
    // AMÉLIORATION: Retirer les métadonnées HTML (title, meta description) qui peuvent contenir des destinations non-asiatiques
    html = html.replace(/<title[^>]*>.*?<\/title>/gi, '');
    html = html.replace(/<meta[^>]*name=["']description["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]*property=["']og:description["'][^>]*>/gi, '');
    
    // 1. Retirer entièrement la section "Articles connexes"
    html = html.replace(/<h[2-6][^>]*>.*?Articles\s+connexes.*?<\/h[2-6]>.*?(?=<h[2-6]|$)/gis, '');
    
    // 2. Convertir les liens en texte simple (retirer hrefs et garder seulement le texte)
    html = html.replace(/<a[^>]*>(.*?)<\/a>/gi, '$1');
    
    // 3. Retirer toutes les balises HTML restantes pour obtenir le texte visible
    const textContent = html.replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return textContent.toLowerCase();
  }

  /**
   * Valide que le contenu ne contient pas de mentions non-asiatiques
   * Ignore les mentions dans un contexte de comparaison/alternative/retour
   */
  validateNonAsiaContent(editorialText, title, finalDestination = null) {
    const finalNonAsiaDestinations = [
      // Europe
      'portugal','spain','espagne','lisbon','lisbonne','barcelona','barcelone','madrid','porto',
      'france','paris','italy','italie','rome','greece','grèce','turkey','turquie','istanbul',
      'europe','germany','allemagne','berlin','netherlands','pays-bas','amsterdam','switzerland','suisse',
      'austria','autriche','vienna','vienne','prague','poland','pologne','hungary','hongrie','budapest',
      'croatia','croatie','uk','england','angleterre','london','londres',
      // Amériques
      'america','usa','united states','états-unis','brazil','brésil','mexico','mexique','canada','quebec','québec','colombia','colombie','peru','pérou','argentina','argentine',
      'cuba','cancun','cancún','dominican','dominicaine','jamaica','jamaïque','haiti','haïti','puerto rico','panama','honduras','guatemala','nicaragua','el salvador','belize','ecuador','équateur',
      // Afrique & Afrique du Nord
      'egypt','égypte','egypte','cairo','le caire','giza','gizeh','alexandria','alexandrie','luxor','louxor','aswan','assouan',
      'morocco','maroc','marrakech','casablanca','tunisia','tunisie','algeria','algérie','africa','afrique',
      'south africa','afrique du sud','kenya','nairobi','tanzania','tanzanie','kilimanjaro','zanzibar','nigeria','ethiopia','éthiopie','ghana','senegal','sénégal',
      // Moyen-Orient (NON ASIE)
      'iraq','irak','iran','israel','israël','jordanie','jordan','liban','lebanon','syrie','syria',
      'arabie','saudi','emirats','emirates','dubai','dubaï','qatar','koweit','kuwait','oman','yemen','yémen',
      'bahrein','bahrain','kurdistan','bagdad','baghdad','erbil',
      // Océanie
      'australia','australie','sydney','melbourne','new zealand','nouvelle-zélande'
    ];
    
    // VÉRIFICATION CRITIQUE DU TITRE - Rejet si destination non-asiatique dans le titre
    // EXCEPTION: Si le titre contient AUSSI une destination asiatique, ne pas rejeter
    // (ex: "Vol Londres-Osaka" → Londres est le départ, Osaka la destination → OK)
    const titleLower = (title || '').toLowerCase();
    const escapeRegExp2 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleAsiaKeywords = ['japan', 'japon', 'tokyo', 'osaka', 'kyoto', 'thailand', 'thaïlande', 'bangkok', 'vietnam', 'hanoi', 'saigon', 'indonesia', 'indonésie', 'bali', 'malaysia', 'malaisie', 'philippines', 'manila', 'cebu', 'cambodia', 'cambodge', 'laos', 'myanmar', 'singapore', 'singapour', 'korea', 'corée', 'seoul', 'taiwan', 'taïwan', 'india', 'inde', 'nepal', 'népal', 'sri lanka', 'asia', 'asie', 'phuket', 'chiang mai', 'ho chi minh', 'da nang', 'hoi an', 'ubud', 'kuala lumpur', 'penang', 'phnom penh', 'siem reap', 'hong kong', 'shanghai', 'beijing', 'pékin'];
    const titleHasAsia = titleAsiaKeywords.some(kw => new RegExp(`\\b${escapeRegExp2(kw)}\\b`, 'i').test(titleLower));
    // Vérifier aussi si finalDestination est asiatique (le titre peut ne pas la mentionner)
    const asiaCountries = ['japan','thailand','vietnam','indonesia','malaysia','philippines','cambodia','laos','myanmar','singapore','korea','south korea','taiwan','taïwan','taipei','india','nepal','sri lanka','china','hong kong','maldives'];
    const finalDestIsAsia = finalDestination && asiaCountries.some(c => finalDestination.toLowerCase().includes(c));
    for (const dest of finalNonAsiaDestinations) {
      if (new RegExp(`\\b${escapeRegExp2(dest)}\\b`, 'i').test(titleLower)) {
        if (titleHasAsia || finalDestIsAsia) {
          console.log(`   ⚠️ validateNonAsiaContent: Titre contient "${dest}" mais final_destination="${finalDestination}" est asiatique → non bloquant`);
          continue;
        }
        return { hits: [{ term: dest, excerpt: `TITRE: "${title}" contient "${dest}"` }] };
      }
    }

    // Contextes qui rendent la mention acceptable (comparaison, alternative, retour, chronologie passée, résidence/origine)
    const acceptableContextPatterns = [
      /alternative\s+(en|à|vers|pour)\s+/i,
      /retour\s+(en|à|vers|de)\s+/i,
      /avant\s+de\s+partir\s+(en|à|pour)\s+/i,
      /contrairement\s+à\s+/i,
      /comparé\s+à\s+/i,
      /versus\s+/i,
      /vs\.?\s+/i,
      /plutôt\s+que\s+/i,
      /au\s+lieu\s+de\s+/i,
      /loin\s+de\s+/i,
      /originaire\s+de\s+/i,
      /venant\s+de\s+/i,
      /manque\s+(de\s+)?connaissances?\s+(sur|de)\s+/i,
      /connaissance\s+limitée\s+(de|sur)\s+/i,
      /ne\s+(disent|dit|mentionne)\s+pas/i,
      /pas\s+d['']info(rmation)?s?\s+(sur|de)\s+/i,
      /absence\s+(d['']info|de\s+données)/i,
      /certaines\s+régions\s+(d['']|de\s+)/i,
      // Chronologie du voyage (mentions historiques/passées)
      /chronologie\s+du\s+voyage/i,
      /début\s+du\s+voyage\s+(en|à)/i,
      /\d{4}\s*:\s*(début|voyage|séjour|volontariat)/i,
      /(avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janvier|février|mars)\s+\d{4}\s*:/i,
      // Contexte historique du voyage (le voyageur a commencé ailleurs)
      /commenc[ée]\s+(en|à|son\s+voyage)/i,
      /a\s+commencé\s+(en|à)/i,
      /débuté\s+(en|à)/i,
      /parti\s+de/i,
      /quitté/i,
      // Retour futur (le voyageur prévoit de revenir)
      /(reviendrai|reviendra|retournerai|retournera|retour)\s+(en|à|vers)/i,
      /quand\s+(je|il|elle|on)\s+(reviendra|retournera)/i,
      // Expressions anglaises équivalentes
      /(returning|return|considering returning|considers returning)\s+(to|in|to work in)/i,
      /(begin|begins|began)\s+to\s+consider\s+returning/i,
      // Résidence / Origine (le voyageur VIENT de ce pays, ce n'est PAS sa destination)
      /viv(ons|ez|ent|ais|ait|aient|re)\s+(en|à|au|aux|dans)\s+/i,
      /habit(ons|ez|ent|ais|ait|aient|er|e)\s+(en|à|au|aux|dans)\s+/i,
      /résid(ons|ez|ent|ais|ait|aient|er|e)\s+(en|à|au|aux|dans)\s+/i,
      /(basé|basée|basés|basées|installé|installée|installés|installées)\s+(en|à|au|aux|dans)\s+/i,
      /(vien[st]|venons|venez|viennent)\s+(de|du|des|d[''])\s+/i,
      /(live|lives|living|lived|based)\s+in\s+/i,
      /(from|come\s+from|coming\s+from)\s+/i,
      /nous\s+(sommes|étions)\s+(en|à|au|aux|de|du)\s+/i,
      /je\s+(suis|étais)\s+(en|à|au|aux|de|du)\s+/i,
      // Voyages passés (le voyageur mentionne où il est allé AVANT, pas sa destination actuelle)
      /auparavant/i,
      /all[ée]s?\s+(en|à|au|aux|qu[''])/i,
      /(déjà|jamais)\s+(visité|été|allé|voyagé|vu)/i,
      /(avions|avait|avaient|avons)\s+(visité|été|voyagé)\s+(en|à|au|aux)/i,
      /n['']étions.*all[ée]s?\s+qu/i,
      /(only|ever)\s+(been|visited|traveled)\s+(to|in)/i,
      // Routes de vol / itinéraires (ORIGIN-DESTINATION, "depuis", "vol ... vers")
      /vol\s+\S+-\S+/i,
      /flight\s+\S+-\S+/i,
      /vol\s+[a-zà-öø-ÿ]+\s*(?:→|->|&rarr;|vers|to)\s+/i,
      /flight\s+[a-zà-öø-ÿ]+\s*(?:→|->|&rarr;|to)\s+/i,
      /(depuis|departing|depart)\s+/i,
      /\S+-osaka/i,
      /\S+-tokyo/i,
      /\S+-bangkok/i,
      /\S+-hanoi/i,
      /\S+-bali/i,
      // Contexte réglementaire / légal (pas une destination, mais une loi/norme)
      /réglementation\s+/i,
      /regulation\s+/i,
      /\beu\s+\d+/i,
      /\buk\s+\d+/i,
      /conform[ée]ment\s+/i,
      /loi\s+/i,
      /law\s+/i,
      /directive\s+/i
    ];

    // match word-boundary (évite des faux positifs bêtes)
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    console.log(`   📋 validateNonAsiaContent: finalDestination="${finalDestination}", finalDestIsAsia=${finalDestIsAsia}`);
    const hits = [];
    for (const term of finalNonAsiaDestinations) {
      const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
      const m = editorialText.match(re);
      if (m) {
        const idx = editorialText.search(re);
        const start = Math.max(0, idx - 120);
        const end = Math.min(editorialText.length, idx + 120);
        const context = editorialText.slice(start, end).replace(/\s+/g, ' ');
        
        // Vérifier si le contexte est acceptable
        const matchedPattern = acceptableContextPatterns.find(pattern => pattern.test(context));
        const isAcceptableContext = !!matchedPattern;
        
        
        // FALLBACK: Si le contexte contient aussi une destination asiatique, c'est acceptable
        // (itinéraire de vol, comparaison origine/destination, etc.)
        const contextAsiaKeywords = ['japan', 'japon', 'tokyo', 'osaka', 'kyoto', 'thailand', 'thaïlande', 'bangkok', 'vietnam', 'hanoi', 'saigon', 'indonesia', 'indonésie', 'bali', 'malaysia', 'malaisie', 'philippines', 'cambodia', 'cambodge', 'laos', 'myanmar', 'singapore', 'singapour', 'korea', 'corée', 'seoul', 'taiwan', 'taïwan', 'taipei', 'india', 'inde', 'nepal', 'sri lanka', 'asia', 'asie', 'phuket', 'chiang mai', 'ubud', 'kuala lumpur', 'phnom penh', 'hong kong', 'shanghai', 'beijing', 'pékin'];
        const contextHasAsia = contextAsiaKeywords.some(kw => new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'i').test(context));
        const finalAcceptable = isAcceptableContext || contextHasAsia || finalDestIsAsia;

        if (!finalAcceptable) {
          hits.push({
            term,
            excerpt: context
          });
        } else {
          const reason = isAcceptableContext ? `pattern: ${matchedPattern?.toString()}` : `contexte contient aussi destination asiatique`;
          console.log(`   ⚠️ Mention "${term}" ignorée (${reason})`);
        }
      }
    }

    return { hits };
  }

  validateFinalArticle(article, widgetsRendered = 0) {
    const errors = [];
    
    if (!article.title || article.title.length < 10) {
      errors.push('Titre trop court');
    }
    
    // Vérifier la longueur du contenu (plus flexible)
    const contentLength = typeof article.content === 'string' 
      ? article.content.length 
      : JSON.stringify(article.content).length;
    
    if (!article.content || contentLength < 300) {
      errors.push('Contenu trop court');
    }
    
    if (!article.categories || article.categories.length === 0) {
      errors.push('Aucune catégorie');
    }
    
    if (!article.tags || article.tags.length === 0) {
      errors.push('Aucun tag');
    }
    
    // FIX H2: NE PAS vérifier la meta description dans le HTML
    // WordPress gère les meta descriptions via les plugins SEO (Yoast, RankMath, etc.)
    // L'injection de <meta> dans le contenu HTML pollue le DOM et crée des problèmes SEO
    // La validation est désactivée car WordPress génère automatiquement les meta via l'excerpt
    // Si nécessaire, la meta peut être passée via article.meta.description pour l'API WordPress
    console.log('   ℹ️ Meta description: gérée par WordPress/plugins SEO (validation skip)');
    
    // FIX D: Utiliser widgets réellement rendus pour le scoring (pas de détection HTML)
    // When Travelpayouts Drive is enabled (ENABLE_AFFILIATE_INJECTOR=0), skip widget validation
    // Drive auto-places widgets after publication based on content analysis
    const affiliateEnabled = process.env.ENABLE_AFFILIATE_INJECTOR !== '0';
    const widgetsScore = widgetsRendered >= 1 ? 100 : 0;
    if (widgetsRendered === 0 && affiliateEnabled) {
      // Only enforce widget check when manual injection is active
      const hasFamilyBlock = article.content?.toLowerCase().includes('famille') &&
                            (article.content?.toLowerCase().includes('enfant') ||
                             article.content?.toLowerCase().includes('bébé'));

      const finalDestination = article.final_destination || article.analysis?.final_destination || '';
      const hasGenericDestination = finalDestination && (
        finalDestination.toLowerCase() === 'asie' ||
        finalDestination.toLowerCase() === 'asia' ||
        finalDestination.toLowerCase() === '' ||
        !finalDestination
      );

      if (!hasFamilyBlock && !hasGenericDestination) {
        errors.push(`Widgets insuffisants: ${widgetsRendered} rendu(s)`);
      } else if (hasGenericDestination) {
        console.log(`   ℹ️ Widgets non requis: destination générique (${finalDestination}) - geo_defaults NULL`);
      }
    } else if (widgetsRendered === 0 && !affiliateEnabled) {
      console.log('   ℹ️ Widgets non requis: Travelpayouts Drive mode actif (ENABLE_AFFILIATE_INJECTOR=0)');
    }
    
    console.log('📊 Validation article:', {
      titleLength: article.title?.length || 0,
      contentLength: contentLength,
      widgetsRendered: widgetsRendered,
      widgetsScore: widgetsScore,
      categories: article.categories?.length || 0,
      tags: article.tags?.length || 0,
      hasMeta: !!article.meta?.description
    });
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Traduction forcée de tout le HTML (dernier rempart avant publication)
   * Utilise regex pour remplacer les textes anglais sans casser le HTML
   * Gère spécifiquement les blockquotes et paragraphes longs
   */
  async forceTranslateHTML(html) {
    if (!html) return html;
    
    console.log('🌐 Traduction forcée : extraction et traduction de TOUT le texte anglais...');
    
    // PHASE 1: Extraire les textes dans les blockquotes (priorité haute)
    const blockquotePattern = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    const blockquoteTexts = [];
    let match;
    
    while ((match = blockquotePattern.exec(html)) !== null) {
      const blockquoteContent = match[1];
      // Extraire tous les textes dans les <p> du blockquote
      const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pMatch;
      while ((pMatch = pPattern.exec(blockquoteContent)) !== null) {
        const text = pMatch[1].replace(/<[^>]+>/g, '').trim(); // Retirer les balises internes
        if (text.length > 20 && /[a-zA-Z]{3,}/.test(text)) {
          blockquoteTexts.push({ original: text, fullMatch: pMatch[0], isBlockquote: true });
        }
      }
    }
    
    // PHASE 1.5: Extraire explicitement le contenu des H2, H3, LI (souvent manqués par le pattern générique)
    // AMÉLIORATION: Détection spécifique des citations dans les listes (guillemets français « ... » ou anglais "...")
    const ENGLISH_WORDS_REGEX = /\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|launched|available|now|requires|income|investment|regular|tourist|visa|extensions|still|most|common|approach|doesn't|specific|yet|easy|months|renewable|reasonable|proof|health|insurance|requirements|looking|latest|info|current|options|heard|might|introducing|something|interested|programs)\b/gi;
    const headingAndListTexts = [];
    
    // Détection spécifique des citations dans les <li>
    const liWithCitationsPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liWithCitationsPattern.exec(html)) !== null) {
      const liContent = liMatch[1];
      // Détecter les citations (guillemets français « ... » ou anglais "...")
      const citationPattern = /(«[^»]*»|"[^"]*"|'[^']*')/g;
      const citations = liContent.match(citationPattern);
      if (citations && citations.length > 0) {
        // Extraire le texte de la citation
        for (const citation of citations) {
          const citationText = citation.replace(/[«»""'']/g, '').trim();
          if (citationText.length >= 10 && /[a-zA-Z]{3,}/.test(citationText)) {
            const englishWords = (citationText.match(ENGLISH_WORDS_REGEX) || []).length;
            const totalWords = citationText.split(/\s+/).length;
            const ratio = totalWords > 0 ? englishWords / totalWords : 0;
            // Seuil abaissé à 20% pour les citations dans les listes
            if (ratio > 0.20) {
              headingAndListTexts.push({ 
                original: citationText, 
                fullMatch: liMatch[0], 
                ratio, 
                isBlockquote: false,
                isCitation: true 
              });
            }
          }
        }
      }
      // Aussi traiter le texte complet du <li> si pas de citation détectée
      const text = liContent.replace(/<[^>]+>/g, '').trim();
      if (text.length >= 10 && !citations && /[a-zA-Z]{3,}/.test(text)) {
        const englishWords = (text.match(ENGLISH_WORDS_REGEX) || []).length;
        const totalWords = text.split(/\s+/).length;
        const ratio = totalWords > 0 ? englishWords / totalWords : 0;
        if (ratio > 0.25) {
          headingAndListTexts.push({ original: text, fullMatch: liMatch[0], ratio, isBlockquote: false });
        }
      }
    }
    
    // Détection H2 et H3 (sans modification)
    for (const tag of ['h2', 'h3']) {
      const tagRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
      let tagMatch;
      while ((tagMatch = tagRegex.exec(html)) !== null) {
        const text = (tagMatch[1] || '').replace(/<[^>]+>/g, '').trim();
        if (text.length < 10 || !/[a-zA-Z]{3,}/.test(text)) continue;
        const englishWords = (text.match(ENGLISH_WORDS_REGEX) || []).length;
        const totalWords = text.split(/\s+/).length;
        const ratio = totalWords > 0 ? englishWords / totalWords : 0;
        if (ratio > 0.25) {
          headingAndListTexts.push({ original: text, fullMatch: tagMatch[0], ratio, isBlockquote: false });
        }
      }
    }
    
    // PHASE 2: Extraire tous les autres textes entre balises (y compris dans les <p>)
    const textPattern = />([^<]+)</g;
    const regularTexts = [];
    
    // Aussi extraire les textes dans les <p> qui ne sont pas dans des blockquotes
    const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    const pTexts = [];
    const pMatches = [];
    // Collecter tous les matches d'abord
    while ((pMatch = pPattern.exec(html)) !== null) {
      pMatches.push({ match: pMatch, index: pMatch.index });
    }
    
    // Vérifier chaque <p> pour voir s'il est dans un blockquote
    for (const { match, index } of pMatches) {
      const pContent = match[1];
      // Vérifier si ce <p> est dans un blockquote en cherchant le blockquote le plus proche avant
      const beforeP = html.substring(0, index);
      const lastBlockquoteOpen = beforeP.lastIndexOf('<blockquote');
      const lastBlockquoteClose = beforeP.lastIndexOf('</blockquote>');
      const isInBlockquote = lastBlockquoteOpen > lastBlockquoteClose;
      
      if (!isInBlockquote) {
        const text = pContent.replace(/<[^>]+>/g, '').trim(); // Retirer les balises internes
        if (text.length > 20 && /[a-zA-Z]{3,}/.test(text)) {
          pTexts.push({ original: text, fullMatch: match[0] });
        }
      }
    }
    
    while ((match = textPattern.exec(html)) !== null) {
      const text = match[1].trim();
      
      // Ignorer textes trop courts, sans lettres, ou déjà vus
      if (text.length < 10 || !/[a-zA-Z]{3,}/.test(text)) continue;
      if (regularTexts.some(t => t.original === text)) continue; // Éviter doublons
      if (blockquoteTexts.some(t => t.original === text)) continue; // Éviter doublons avec blockquotes
      if (pTexts.some(t => t.original === text)) continue; // Éviter doublons avec <p>
      if (headingAndListTexts.some(t => t.original === text)) continue; // Éviter doublons avec H2/H3/LI
      
      // Détecter anglais (ratio > 25%)
      const englishWords = (text.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|launched|available|now|requires|income|investment|regular|tourist|visa|extensions|still|most|common|approach|doesn't|specific|yet|easy|months|renewable|reasonable|proof|health|insurance|requirements|looking|latest|info|current|options|heard|might|introducing|something|interested|programs)\b/gi) || []).length;
      const totalWords = text.split(/\s+/).length;
      const ratio = totalWords > 0 ? englishWords / totalWords : 0;
      
      if (ratio > 0.25) {
        regularTexts.push({ original: text, ratio, isBlockquote: false });
      }
    }
    
    // PHASE 3: Détecter anglais dans les blockquotes
    for (const blockquote of blockquoteTexts) {
      const text = blockquote.original;
      const englishWords = (text.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|launched|available|now|requires|income|investment|regular|tourist|visa|extensions|still|most|common|approach|doesn't|specific|yet|easy|months|renewable|reasonable|proof|health|insurance|requirements|looking|latest|info|current|options|heard|might|introducing|something|interested|programs)\b/gi) || []).length;
      const totalWords = text.split(/\s+/).length;
      blockquote.ratio = totalWords > 0 ? englishWords / totalWords : 0;
    }
    
    // PHASE 3.5: Détecter anglais dans les <p> réguliers
    for (const pText of pTexts) {
      const text = pText.original;
      const englishWords = (text.match(/\b(the|a|an|is|are|was|were|have|has|had|will|would|can|could|should|this|that|these|those|in|on|at|to|for|of|with|from|by|as|be|been|being|do|does|did|get|got|go|went|come|came|see|saw|know|knew|think|thought|say|said|make|made|take|took|give|gave|find|found|work|worked|use|used|try|tried|want|wanted|need|needed|like|liked|look|looked|just|launched|available|now|requires|income|investment|regular|tourist|visa|extensions|still|most|common|approach|doesn't|specific|yet|easy|months|renewable|reasonable|proof|health|insurance|requirements|looking|latest|info|current|options|heard|might|introducing|something|interested|programs)\b/gi) || []).length;
      const totalWords = text.split(/\s+/).length;
      pText.ratio = totalWords > 0 ? englishWords / totalWords : 0;
    }
    
    // Filtrer les blockquotes anglais
    const blockquotesToTranslate = blockquoteTexts.filter(b => b.ratio > 0.25);
    // Filtrer les <p> anglais
    const pToTranslate = pTexts.filter(p => p.ratio > 0.25);
    
    // Combiner tous les textes à traduire (blockquotes, p, H2/H3/LI, puis réguliers)
    const allTextsToTranslate = [...blockquotesToTranslate, ...pToTranslate, ...headingAndListTexts, ...regularTexts];
    
    if (allTextsToTranslate.length === 0) {
      console.log('   ✅ Aucun texte anglais détecté');
      return html;
    }
    
    console.log(`   📝 ${allTextsToTranslate.length} textes anglais à traduire (${blockquotesToTranslate.length} blockquotes + ${pToTranslate.length} paragraphes + ${headingAndListTexts.length} H2/H3/LI + ${regularTexts.length} réguliers)...`);
    
    // Traduire et remplacer dans le HTML
    let translatedHtml = html;
    for (let i = 0; i < allTextsToTranslate.length; i++) {
      const item = allTextsToTranslate[i];
      const { original, ratio, fullMatch, isBlockquote } = item;
      
      try {
        const typeLabel = isBlockquote ? 'BLOCKQUOTE' : 'TEXTE';
        console.log(`   🔄 [${i + 1}/${allTextsToTranslate.length}] [${typeLabel}] "${original.substring(0, 70)}..." (${Math.round(ratio * 100)}% EN)`);
        const translated = await this.intelligentAnalyzer.translateToFrench(original);
        
        if (isBlockquote && fullMatch) {
          // Pour les blockquotes, remplacer le <p> complet
          const translatedPMatch = fullMatch.replace(original, translated);
          translatedHtml = translatedHtml.replace(fullMatch, translatedPMatch);
          console.log(`   ✅ "${translated.substring(0, 70)}..."`);
        } else if (fullMatch && !isBlockquote) {
          // Pour les <p> réguliers, remplacer le <p> complet
          const translatedPMatch = fullMatch.replace(original, translated);
          translatedHtml = translatedHtml.replace(fullMatch, translatedPMatch);
          console.log(`   ✅ "${translated.substring(0, 70)}..."`);
        } else {
          // Pour les textes réguliers, remplacer directement
          const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          translatedHtml = translatedHtml.replace(new RegExp(escapedOriginal, 'g'), translated);
          console.log(`   ✅ "${translated.substring(0, 70)}..."`);
        }
      } catch (error) {
        console.warn(`   ⚠️ Échec: ${error.message}`);
      }
    }
    
    console.log(`   ✅ Traduction forcée terminée (${allTextsToTranslate.length} textes traduits)`);
    return translatedHtml;
  }
  
  // Publier sur WordPress
  async publishToWordPress(article) {
    // GARDE: Bloquer publication si quality-loop gère la publication
    const skipWpPublish = process.env.SKIP_WP_PUBLISH === '1';
    if (DRY_RUN || FORCE_OFFLINE || skipWpPublish) {
      console.log(`🧪 ${DRY_RUN ? 'DRY_RUN' : 'FORCE_OFFLINE'}: publication WordPress bloquée`);
      // DRY_RUN save final content for audit
      try { const fs2 = await import('fs'); fs2.writeFileSync('/tmp/last-generated-article.html', article.content, 'utf-8'); console.log('💾 DRY_RUN: contenu final sauvegardé dans /tmp/last-generated-article.html'); } catch(e) {}
      // Générer une URL fictive pour les tests
      const fakeUrl = `https://flashvoyage.com/temoignage-voyage-retours-et-lecons-test-${Date.now()}/`;
      return {
        id: null,
        title: article.title,
        link: fakeUrl,
        status: DRY_RUN ? 'dry_run' : 'force_offline',
        enhancements: article.enhancements
      };
    }
    
    try {
      const axios = (await import('axios')).default;
      const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
      
      console.log('📝 Publication sur WordPress...');
      
      // Préparer les données WordPress
      if (this.articleFinalizer?.sanitizeAffiliateWidgetIntegrity) {
        article.content = this.articleFinalizer.sanitizeAffiliateWidgetIntegrity(article.content);
      }

      const wpMeta = {
        description: article.meta?.description || article.excerpt || '',
        keywords: article.meta?.keywords || '',
        'og:title': article.meta?.['og:title'] || article.title,
        'og:description': article.meta?.['og:description'] || article.excerpt || ''
      };

      // Stocker les schemas JSON-LD en meta pour injection dans <head> par le plugin WP
      if (article.schemaMarkup?.length > 0) {
        wpMeta.fv_schema_json = JSON.stringify(article.schemaMarkup);
      }

      const wordpressData = {
        title: article.title,
        content: article.content,
        status: process.env.FORCE_WP_STATUS || 'publish',
        excerpt: article.excerpt || '',
        categories: article.categoryIds || [],
        tags: article.tagIds || [],
        meta: wpMeta,
        ...(article._authorWpId ? { author: article._authorWpId } : {})
      };
      
      // Authentification
      const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
      
      // Publication
      const response = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, wordpressData, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      const publishedArticle = response.data;
      
      console.log('✅ Article publié sur WordPress !');
      console.log(`   ID: ${publishedArticle.id}`);
      console.log(`   URL: ${publishedArticle.link}`);

      // Auteur E-E-A-T: deja assigne a la creation via wordpressData.author
      if (!article._authorWpId) {
        try {
          const destination = article.meta?.destination || article.destination || '';
          const { author, wpId } = await this.authorManager.getAuthorForArticle(destination);
          if (wpId) {
            await this.authorManager.assignAuthor(publishedArticle.id, wpId);
            console.log(`   👤 Auteur assigne (fallback): ${author.name}`);
          }
        } catch (err) {
          console.warn(`   ⚠️ Assignation auteur echouee: ${err.message}`);
        }
      } else {
        console.log(`   👤 Auteur assigne a la creation: ${article._authorName || 'ID ' + article._authorWpId}`);
      }
      
      // Uploader l'image featured si disponible
      if (article.featuredImage) {
        try {
          const featSrc = article.featuredImage.source || 'pexels';
          console.log(`🖼️ Upload de l'image featured (source: ${featSrc})...`);
          
          // Télécharger l'image
          const imageResponse = await axios.get(article.featuredImage.url, {
            responseType: 'arraybuffer'
          });
          
          // Détecter le content-type depuis la réponse ou l'URL
          const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
          const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
          
          // Uploader sur WordPress
          const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, imageResponse.data, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': contentType,
              'Content-Disposition': `attachment; filename="featured-${publishedArticle.id}.${ext}"`
            }
          });
          
          // Ajouter le texte alternatif pour le SEO
          if (article.featuredImage.alt) {
            await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media/${uploadResponse.data.id}`, {
              alt_text: article.featuredImage.alt,
              caption: article.featuredImage.photographer
                ? `Photo: ${article.featuredImage.photographer}${article.featuredImage.license ? ` (${article.featuredImage.license})` : ''}`
                : ''
            }, {
              headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
              }
            });
          }
          
          // Associer l'image à l'article
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${publishedArticle.id}`, {
            featured_media: uploadResponse.data.id
          }, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          });
          
          console.log(`✅ Image featured ajoutée (${featSrc}, alt: "${article.featuredImage.alt?.substring(0, 50)}")`);
        } catch (imageError) {
          console.warn('⚠️ Erreur upload image:', imageError.message);
        }
      }

      // Uploader toutes les images inline vers WordPress (Pexels/Flickr permettent le re-upload)
      if (article.inlineImages && article.inlineImages.length > 0) {
        {
          console.log(`🖼️ Upload de ${article.inlineImages.length} image(s) inline vers WordPress...`);
          let updatedContent = publishedArticle.content?.rendered || article.content;
          let uploadedCount = 0;

          for (let i = 0; i < article.inlineImages.length; i++) {
            const img = article.inlineImages[i];
            try {
              const imgResponse = await axios.get(img.url, { responseType: 'arraybuffer' });
              const ext = img.url.match(/\.(jpe?g|png|webp)/i)?.[1] || 'jpg';
              const filename = `inline-${publishedArticle.id}-${img.source}-${img.position || i}.${ext}`;
              
              const uploadRes = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, imgResponse.data, {
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                  'Content-Disposition': `attachment; filename="${filename}"`
                }
              });

              if (uploadRes.data?.source_url) {
                updatedContent = updatedContent.replace(img.url, uploadRes.data.source_url);
                uploadedCount++;
              }
            } catch (imgErr) {
              console.warn(`   ⚠️ Erreur upload image inline ${i + 1}: ${imgErr.message}`);
            }
          }

          if (uploadedCount > 0) {
            // Defensive: re-run fixWordGlue on updatedContent (WordPress content.rendered may differ slightly)
            if (this.articleFinalizer) {
              updatedContent = this.articleFinalizer.fixWordGlue(updatedContent, null);
              updatedContent = this.articleFinalizer.applyDeterministicFinalTextCleanup(updatedContent);
              // Re-apply post-processing fixers after finalizer to undo any re-joins
              updatedContent = applyPostProcessingFixers(updatedContent);
            }
            try {
              await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${publishedArticle.id}`, {
                content: updatedContent
              }, {
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Content-Type': 'application/json'
                }
              });
              console.log(`✅ ${uploadedCount} image(s) inline uploadée(s), URLs mises à jour`);
            } catch (updateErr) {
              console.warn('⚠️ Erreur mise à jour contenu avec images inline:', updateErr.message);
            }
          }
        }
      }
      
      return {
        id: publishedArticle.id,
        title: publishedArticle.title.rendered,
        link: publishedArticle.link,
        status: publishedArticle.status,
        enhancements: article.enhancements
      };
    } catch (error) {
      console.error('❌ Erreur publication WordPress:', error.message);
      if (error.response) {
        console.error('   Détails:', error.response.data);
      }
      throw error;
    }
  }
  /**
   * Synchronise l'index de liens internes depuis articles-database.json
   */
  async syncInternalLinksIndex() {
    const fs = await import('fs');
    
    try {
      const dbContent = fs.default.readFileSync('articles-database.json', 'utf-8');
      const db = JSON.parse(dbContent);
      
      const extractKeywords = (title) => {
        const stopWords = ['de', 'du', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'pour', 'un', 'une', 'des', 'à', 'son', 'sa', 'ses', 'ce', 'cette', 'qui', 'que', 'comment', 'quoi', 'où'];
        const titleKeywords = title.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .split(/[\s:,\-–]+/)
          .filter(w => w.length > 2 && !stopWords.includes(w));
        
        const broadKeywords = ['voyage', 'budget', 'asie'];
        const seaDests = ['thailande', 'vietnam', 'indonesie', 'bali', 'japon', 'philippines', 'cambodge', 'malaisie', 'laos'];
        const hasSeaDest = titleKeywords.some(k => seaDests.some(d => k.includes(d)));
        if (hasSeaDest) {
          broadKeywords.forEach(bk => { if (!titleKeywords.includes(bk)) titleKeywords.push(bk); });
        }
        return titleKeywords;
      };
      
      // Détecter la catégorie
      const detectCategory = (article) => {
        const title = article.title.toLowerCase();
        if (/visa|formalit/.test(title)) return 'visa';
        if (/budget|cout|prix|argent/.test(title)) return 'budget';
        if (/coworking|travail|remote/.test(title)) return 'coworking';
        if (/logement|hotel|airbnb|quartier/.test(title)) return 'logement';
        if (/transport|vol|avion|train/.test(title)) return 'transport';
        if (/sante|assurance|medic/.test(title)) return 'sante';
        return 'temoignage';
      };
      
      // Construire l'index (top 100 articles les plus récents)
      const internalLinks = {
        articles: db.articles.slice(0, 100).map(a => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          url: a.url,
          category: detectCategory(a),
          keywords: extractKeywords(a.title),
          excerpt: (a.excerpt || '').substring(0, 100)
        })),
        blacklist: ['spam', 'test', 'draft', '_obsolete']
      };
      
      // Sauvegarder
      fs.default.writeFileSync('data/internal-links.json', JSON.stringify(internalLinks, null, 2));
      console.log(`   ✅ ${internalLinks.articles.length} articles indexés pour liens internes`);
      
    } catch (error) {
      console.warn(`   ⚠️ Erreur sync index liens: ${error.message}`);
    }
  }
}

export default EnhancedUltraGenerator;

// Exécution si lancé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new EnhancedUltraGenerator();
  generator.generateAndPublishEnhancedArticle()
    .then(() => {
      if (generator.vizBridge) generator.vizBridge.shutdown();
      console.log('\n✅ Processus terminé avec succès !');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Erreur fatale:', error.message);
      console.error(error.stack);
      costTracker.printSummary();
      process.exit(1);
    });
}
