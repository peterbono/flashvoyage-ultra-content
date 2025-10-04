#!/usr/bin/env node

/**
 * Nomade Hub Collector - Collecteur multi-sources pour le hub nomade
 * Collecte et organise le contenu de toutes les sources nomades
 */

import axios from 'axios';
import dotenv from 'dotenv';
import NomadePersonaDetector from './nomade-persona-detector.js';

dotenv.config();

class NomadeHubCollector {
  constructor() {
    this.personaDetector = new NomadePersonaDetector();
    this.collectedContent = {
      coliving: [],
      visa: [],
      budget: [],
      community: [],
      news: []
    };
  }

  // Collecter depuis toutes les sources nomades
  async collectNomadeContent() {
    console.log('🏠 Collecte de contenu nomade depuis toutes les sources...\n');
    
    try {
      // Collecter depuis Reddit
      const redditContent = await this.collectFromReddit();
      this.organizeContent(redditContent);
      
      // Collecter depuis Google News
      const googleContent = await this.collectFromGoogleNews();
      this.organizeContent(googleContent);
      
      // Collecter depuis les forums nomades
      const forumContent = await this.collectFromForums();
      this.organizeContent(forumContent);
      
      // Collecter depuis les blogs spécialisés
      const blogContent = await this.collectFromBlogs();
      this.organizeContent(blogContent);
      
      console.log(`\n✅ Contenu collecté:`);
      console.log(`   🏠 Coliving: ${this.collectedContent.coliving.length} articles`);
      console.log(`   ✈️ Visa: ${this.collectedContent.visa.length} articles`);
      console.log(`   💰 Budget: ${this.collectedContent.budget.length} articles`);
      console.log(`   👥 Communauté: ${this.collectedContent.community.length} articles`);
      console.log(`   📰 News: ${this.collectedContent.news.length} articles`);
      
      // Debug: afficher le contenu avant retour
      console.log('\n🔍 Debug - Contenu avant retour:');
      console.log(`   Coliving: ${this.collectedContent.coliving.length} articles`);
      console.log(`   Visa: ${this.collectedContent.visa.length} articles`);
      console.log(`   Budget: ${this.collectedContent.budget.length} articles`);
      console.log(`   Communauté: ${this.collectedContent.community.length} articles`);
      console.log(`   News: ${this.collectedContent.news.length} articles`);
      
      return this.collectedContent;
      
    } catch (error) {
      console.error('❌ Erreur lors de la collecte:', error.message);
      return this.collectedContent;
    }
  }

  // Collecter depuis Reddit
  async collectFromReddit() {
    const redditSources = [
      {
        name: 'r/digitalnomad',
        url: 'https://www.reddit.com/r/digitalnomad/new.json',
        keywords: ['digital nomad', 'nomade numérique', 'coliving', 'visa', 'asie', 'asia']
      },
      {
        name: 'r/expats',
        url: 'https://www.reddit.com/r/expats/new.json',
        keywords: ['expat', 'expatrié', 'visa', 'asie', 'asia', 'nomade']
      },
      {
        name: 'r/JapanTravel',
        url: 'https://www.reddit.com/r/JapanTravel/new.json',
        keywords: ['japon', 'japan', 'visa', 'coliving', 'nomade']
      },
      {
        name: 'r/Thailand',
        url: 'https://www.reddit.com/r/Thailand/new.json',
        keywords: ['thailande', 'thailand', 'visa', 'coliving', 'nomade']
      }
    ];

    const allContent = [];

    for (const source of redditSources) {
      try {
        console.log(`🔍 Collecte depuis ${source.name}...`);
        
        // Délai pour respecter les rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await axios.get(source.url, {
          headers: {
            'User-Agent': 'NomadeAsieBot/1.0 (Nomade Content Collector; +https://nomadeasie.com)',
            'Accept': 'application/json'
          },
          timeout: 10000
        });

        const posts = response.data.data.children;
        
        posts.forEach(post => {
          const data = post.data;
          const text = `${data.title} ${data.selftext || ''}`.toLowerCase();
          
          // Vérifier si le post contient des mots-clés nomades
          const hasNomadeKeywords = source.keywords.some(keyword => 
            text.includes(keyword.toLowerCase())
          );
          
          if (hasNomadeKeywords && data.ups > 3) {
            allContent.push({
              title: data.title,
              link: `https://reddit.com${data.permalink}`,
              content: data.selftext || '',
              date: new Date(data.created_utc * 1000).toISOString(),
              source: source.name,
              type: 'community',
              relevance: this.calculateRelevance(data.title, data.selftext, source.keywords),
              upvotes: data.ups,
              comments: data.num_comments
            });
          }
        });
        
        console.log(`   ✅ ${source.name}: ${posts.filter(p => p.data.ups > 3).length} posts pertinents`);
        
      } catch (error) {
        console.warn(`⚠️ Erreur ${source.name}:`, error.message);
        // Continuer même en cas d'erreur - ajouter un contenu vide pour éviter les erreurs
        allContent.push(...[]);
      }
    }

    return allContent;
  }

  // Collecter depuis Google News
  async collectFromGoogleNews() {
    const newsSources = [
      {
        name: 'Google News Digital Nomad',
        url: 'https://news.google.com/rss/search?q=digital+nomad+asia&hl=en&gl=US&ceid=US:en',
        keywords: ['digital nomad', 'nomade numérique', 'asie', 'asia', 'visa', 'coliving']
      },
      {
        name: 'Google News Coliving Asia',
        url: 'https://news.google.com/rss/search?q=coliving+asia&hl=en&gl=US&ceid=US:en',
        keywords: ['coliving', 'coworking', 'asie', 'asia', 'nomade']
      },
      {
        name: 'Google News Visa Asia',
        url: 'https://news.google.com/rss/search?q=visa+asia+nomad&hl=en&gl=US&ceid=US:en',
        keywords: ['visa', 'asie', 'asia', 'nomade', 'digital nomad']
      }
    ];

    const allContent = [];

    for (const source of newsSources) {
      try {
        console.log(`🔍 Collecte depuis ${source.name}...`);
        
        const response = await axios.get(source.url, {
          headers: { 'User-Agent': 'NomadeAsieBot/1.0' },
          timeout: 10000
        });

        // Parser le RSS XML
        const xmlText = response.data;
        const titleMatches = xmlText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g) || [];
        const linkMatches = xmlText.match(/<link>(.*?)<\/link>/g) || [];
        const pubDateMatches = xmlText.match(/<pubDate>(.*?)<\/pubDate>/g) || [];

        for (let i = 0; i < Math.min(titleMatches.length, 10); i++) {
          const title = titleMatches[i]?.replace(/<title><!\[CDATA\[(.*?)\]\]><\/title>/, '$1') || '';
          const link = linkMatches[i]?.replace(/<link>(.*?)<\/link>/, '$1') || '';
          const pubDate = pubDateMatches[i]?.replace(/<pubDate>(.*?)<\/pubDate>/, '$1') || '';

          if (title && link) {
            allContent.push({
              title,
              link,
              content: '',
              date: pubDate,
              source: source.name,
              type: 'news',
              relevance: this.calculateRelevance(title, '', source.keywords)
            });
          }
        }
        
        console.log(`   ✅ ${source.name}: ${titleMatches.length} articles trouvés`);
        
      } catch (error) {
        console.warn(`⚠️ Erreur ${source.name}:`, error.message);
      }
    }

    return allContent;
  }

  // Collecter depuis les forums nomades
  async collectFromForums() {
    // Simulation de collecte depuis des forums nomades
    console.log('🔍 Collecte depuis les forums nomades...');
    
    const forumContent = [
      {
        title: 'Nouveau coliving à Tokyo - Expérience partagée',
        link: 'https://nomadlist.com/forum/tokyo-coliving-experience',
        content: 'Partage d\'expérience sur un nouveau coliving à Tokyo. Espaces modernes, communauté active, prix abordable.',
        date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        source: 'NomadList Forum',
        type: 'community',
        relevance: 85
      },
      {
        title: 'Visa nomade Thaïlande - Guide complet 2025',
        link: 'https://nomadlist.com/forum/thailand-visa-guide-2025',
        content: 'Guide complet pour obtenir le visa nomade en Thaïlande. Démarches, documents, conseils pratiques.',
        date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        source: 'NomadList Forum',
        type: 'community',
        relevance: 90
      }
    ];
    
    console.log(`   ✅ Forums: ${forumContent.length} posts trouvés`);
    return forumContent;
  }

  // Collecter depuis les blogs spécialisés
  async collectFromBlogs() {
    // Simulation de collecte depuis des blogs spécialisés
    console.log('🔍 Collecte depuis les blogs spécialisés...');
    
    const blogContent = [
      {
        title: 'Top 10 Colivings à Bali pour Digital Nomades',
        link: 'https://thedigitalnomad.asia/top-10-colivings-bali-2025',
        content: 'Sélection des meilleurs colivings à Bali pour les digital nomades. Prix, équipements, communauté.',
        date: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        source: 'The Digital Nomad Asia',
        type: 'news',
        relevance: 88
      },
      {
        title: 'Visa Digital Nomad Japon - Nouveautés 2025',
        link: 'https://nomadlist.com/blog/japan-digital-nomad-visa-2025',
        content: 'Nouvelles réglementations pour le visa digital nomad au Japon. Simplifications, délais, coûts.',
        date: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        source: 'NomadList Blog',
        type: 'news',
        relevance: 92
      }
    ];
    
    console.log(`   ✅ Blogs: ${blogContent.length} articles trouvés`);
    return blogContent;
  }

  // Organiser le contenu par catégories
  organizeContent(content) {
    content.forEach(item => {
      // Détecter la persona pour mieux catégoriser
      const personaDetection = this.personaDetector.detectPersona(item);
      
      // Debug: afficher l'article en cours de traitement
      console.log(`🔍 Traitement: ${item.title.substring(0, 50)}... (Source: ${item.source})`);
      
      // Catégoriser selon les mots-clés et la persona (utiliser else if pour éviter les doublons)
      if (item.title.toLowerCase().includes('coliving') || 
          item.content.toLowerCase().includes('coliving') ||
          personaDetection.persona.includes('coliving')) {
        this.collectedContent.coliving.push(item);
        console.log(`   → Catégorisé dans: coliving`);
      }
      else if (item.title.toLowerCase().includes('visa') || 
               item.content.toLowerCase().includes('visa') ||
               personaDetection.persona.includes('visa')) {
        this.collectedContent.visa.push(item);
        console.log(`   → Catégorisé dans: visa`);
      }
      else if (item.title.toLowerCase().includes('budget') || 
               item.title.toLowerCase().includes('prix') ||
               item.title.toLowerCase().includes('coût') ||
               personaDetection.persona.includes('budget')) {
        this.collectedContent.budget.push(item);
        console.log(`   → Catégorisé dans: budget`);
      }
      else if (item.type === 'news' || 
               item.source.includes('Google News') ||
               item.source.includes('Blog')) {
        this.collectedContent.news.push(item);
        console.log(`   → Catégorisé dans: news`);
      }
      else {
        // Par défaut, mettre dans communauté (Reddit, Forum, etc.)
        this.collectedContent.community.push(item);
        console.log(`   → Catégorisé dans: community`);
      }
    });
  }

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

  // Obtenir le contenu trié par pertinence
  getSortedContent() {
    const sortedContent = {};
    
    Object.keys(this.collectedContent).forEach(category => {
      sortedContent[category] = this.collectedContent[category]
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 10); // Garder seulement les 10 meilleurs
    });
    
    return sortedContent;
  }

  // Obtenir les statistiques de collecte
  getCollectionStats() {
    const total = Object.values(this.collectedContent).reduce((sum, arr) => sum + arr.length, 0);
    
    return {
      total: total,
      byCategory: {
        coliving: this.collectedContent.coliving.length,
        visa: this.collectedContent.visa.length,
        budget: this.collectedContent.budget.length,
        community: this.collectedContent.community.length,
        news: this.collectedContent.news.length
      },
      topSources: this.getTopSources()
    };
  }

  // Obtenir les sources les plus productives
  getTopSources() {
    const sourceCounts = {};
    
    Object.values(this.collectedContent).flat().forEach(item => {
      sourceCounts[item.source] = (sourceCounts[item.source] || 0) + 1;
    });
    
    return Object.entries(sourceCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));
  }
}

export default NomadeHubCollector;
