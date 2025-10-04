#!/usr/bin/env node

/**
 * Nomade Hub Generator - Générateur de pages hub pour le contenu nomade
 * Génère des pages hub organisées et optimisées pour les nomades
 */

import axios from 'axios';
import dotenv from 'dotenv';
import NomadeTemplates from './nomade-templates.js';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

class NomadeHubGenerator {
  constructor() {
    this.templates = new NomadeTemplates();
    this.publishedHubs = new Set();
  }

  // Générer toutes les pages hub
  async generateAllHubs(organizedContent) {
    console.log('🏠 Génération des pages hub nomades...\n');
    
    try {
      // Générer la page hub principale
      const mainHub = await this.generateMainHub(organizedContent);
      
      // Générer les pages hub par catégorie
      const categoryHubs = await this.generateCategoryHubs(organizedContent);
      
      // Générer les pages hub par destination
      const destinationHubs = await this.generateDestinationHubs(organizedContent);
      
      console.log('✅ Toutes les pages hub générées avec succès');
      
      return {
        mainHub,
        categoryHubs,
        destinationHubs
      };
      
    } catch (error) {
      console.error('❌ Erreur lors de la génération des hubs:', error.message);
      throw error;
    }
  }

  // Générer la page hub principale
  async generateMainHub(organizedContent) {
    console.log('🏠 Génération de la page hub principale...');
    
    const topArticles = this.getTopArticles(organizedContent, 20);
    const featuredContent = this.selectFeaturedContent(organizedContent);
    
    const hubContent = {
      title: '🏠 Hub Nomade Asie - Coliving, Visa & Communauté',
      content: this.generateMainHubContent(featuredContent, topArticles),
      excerpt: 'Le hub ultime pour les digital nomades en Asie. Coliving, visa, budget, communauté et actualités.',
      categories: ['nomade', 'hub', 'asie'],
      tags: ['digital nomad', 'coliving', 'visa', 'asie', 'nomade numérique'],
      featured_media: await this.getFeaturedImage('nomade asie coliving visa')
    };
    
    return await this.publishHub(hubContent, 'main');
  }

  // Générer les pages hub par catégorie
  async generateCategoryHubs(organizedContent) {
    console.log('📊 Génération des pages hub par catégorie...');
    
    const categoryHubs = {};
    
    // Hub Coliving
    if (organizedContent.coliving) {
      categoryHubs.coliving = await this.generateColivingHub(organizedContent.coliving);
    }
    
    // Hub Visa
    if (organizedContent.visa) {
      categoryHubs.visa = await this.generateVisaHub(organizedContent.visa);
    }
    
    // Hub Budget
    if (organizedContent.budget) {
      categoryHubs.budget = await this.generateBudgetHub(organizedContent.budget);
    }
    
    // Hub Communauté
    if (organizedContent.community) {
      categoryHubs.community = await this.generateCommunityHub(organizedContent.community);
    }
    
    // Hub News
    if (organizedContent.news) {
      categoryHubs.news = await this.generateNewsHub(organizedContent.news);
    }
    
    return categoryHubs;
  }

  // Générer le hub Coliving
  async generateColivingHub(colivingContent) {
    console.log('🏠 Génération du hub Coliving...');
    
    const urgentColiving = colivingContent.urgent || [];
    const trendingColiving = colivingContent.trending || [];
    const guidesColiving = colivingContent.guides || [];
    
    const hubContent = {
      title: '🏠 Hub Coliving Asie - Espaces & Communautés Nomades',
      content: this.generateColivingHubContent(urgentColiving, trendingColiving, guidesColiving),
      excerpt: 'Découvrez les meilleurs colivings en Asie pour les digital nomades. Espaces, prix, communautés et avis.',
      categories: ['nomade', 'coliving', 'asie'],
      tags: ['coliving', 'coworking', 'nomade', 'asie', 'communauté'],
      featured_media: await this.getFeaturedImage('coliving asie nomade')
    };
    
    return await this.publishHub(hubContent, 'coliving');
  }

  // Générer le hub Visa
  async generateVisaHub(visaContent) {
    console.log('✈️ Génération du hub Visa...');
    
    const urgentVisa = visaContent.urgent || [];
    const guidesVisa = visaContent.guides || [];
    const updatesVisa = visaContent.updates || [];
    
    const hubContent = {
      title: '✈️ Hub Visa Nomade Asie - Guides & Actualités',
      content: this.generateVisaHubContent(urgentVisa, guidesVisa, updatesVisa),
      excerpt: 'Tout sur les visas nomades en Asie. Guides, démarches, actualités et conseils pratiques.',
      categories: ['nomade', 'visa', 'asie'],
      tags: ['visa', 'nomade', 'asie', 'démarches', 'guide'],
      featured_media: await this.getFeaturedImage('visa nomade asie')
    };
    
    return await this.publishHub(hubContent, 'visa');
  }

  // Générer le hub Budget
  async generateBudgetHub(budgetContent) {
    console.log('💰 Génération du hub Budget...');
    
    const dealsBudget = budgetContent.deals || [];
    const comparisonsBudget = budgetContent.comparisons || [];
    const tipsBudget = budgetContent.tips || [];
    
    const hubContent = {
      title: '💰 Hub Budget Nomade Asie - Deals & Conseils',
      content: this.generateBudgetHubContent(dealsBudget, comparisonsBudget, tipsBudget),
      excerpt: 'Optimisez votre budget nomade en Asie. Deals, comparaisons, conseils et outils de calcul.',
      categories: ['nomade', 'budget', 'asie'],
      tags: ['budget', 'deals', 'économies', 'nomade', 'asie'],
      featured_media: await this.getFeaturedImage('budget nomade asie')
    };
    
    return await this.publishHub(hubContent, 'budget');
  }

  // Générer le hub Communauté
  async generateCommunityHub(communityContent) {
    console.log('👥 Génération du hub Communauté...');
    
    const discussionsCommunity = communityContent.discussions || [];
    const experiencesCommunity = communityContent.experiences || [];
    const questionsCommunity = communityContent.questions || [];
    
    const hubContent = {
      title: '👥 Hub Communauté Nomade Asie - Discussions & Expériences',
      content: this.generateCommunityHubContent(discussionsCommunity, experiencesCommunity, questionsCommunity),
      excerpt: 'Rejoignez la communauté nomade en Asie. Discussions, expériences, questions et rencontres.',
      categories: ['nomade', 'communauté', 'asie'],
      tags: ['communauté', 'discussion', 'expérience', 'nomade', 'asie'],
      featured_media: await this.getFeaturedImage('communauté nomade asie')
    };
    
    return await this.publishHub(hubContent, 'community');
  }

  // Générer le hub News
  async generateNewsHub(newsContent) {
    console.log('📰 Génération du hub News...');
    
    const breakingNews = newsContent.breaking || [];
    const industryNews = newsContent.industry || [];
    const destinationsNews = newsContent.destinations || [];
    
    const hubContent = {
      title: '📰 Hub Actualités Nomade Asie - News & Tendances',
      content: this.generateNewsHubContent(breakingNews, industryNews, destinationsNews),
      excerpt: 'Restez informé des dernières actualités nomades en Asie. News, tendances et analyses.',
      categories: ['nomade', 'actualités', 'asie'],
      tags: ['actualités', 'news', 'tendances', 'nomade', 'asie'],
      featured_media: await this.getFeaturedImage('actualités nomade asie')
    };
    
    return await this.publishHub(hubContent, 'news');
  }

  // Générer les pages hub par destination
  async generateDestinationHubs(organizedContent) {
    console.log('🌏 Génération des pages hub par destination...');
    
    const destinations = ['japon', 'thailande', 'corée', 'singapour', 'bali', 'vietnam'];
    const destinationHubs = {};
    
    for (const destination of destinations) {
      const destinationContent = this.filterContentByDestination(organizedContent, destination);
      
      if (destinationContent.total > 0) {
        destinationHubs[destination] = await this.generateDestinationHub(destination, destinationContent);
      }
    }
    
    return destinationHubs;
  }

  // Générer un hub de destination
  async generateDestinationHub(destination, destinationContent) {
    console.log(`🌏 Génération du hub ${destination}...`);
    
    const hubContent = {
      title: `🌏 Hub Nomade ${this.capitalizeFirst(destination)} - Coliving, Visa & Communauté`,
      content: this.generateDestinationHubContent(destination, destinationContent),
      excerpt: `Tout pour les nomades au ${this.capitalizeFirst(destination)}. Coliving, visa, budget, communauté et actualités.`,
      categories: ['nomade', 'destination', destination],
      tags: ['nomade', destination, 'coliving', 'visa', 'communauté'],
      featured_media: await this.getFeaturedImage(`nomade ${destination}`)
    };
    
    return await this.publishHub(hubContent, destination);
  }

  // Générer le contenu de la page hub principale
  generateMainHubContent(featuredContent, topArticles) {
    return `
<div class="nomade-hub-main">
  <h2>🏠 Bienvenue dans le Hub Nomade Asie</h2>
  <p>Le centre de ressources ultime pour les digital nomades en Asie. Coliving, visa, budget, communauté et actualités.</p>
  
  <div class="featured-content">
    <h3>🔥 Contenu en vedette</h3>
    ${this.generateFeaturedContentHTML(featuredContent)}
  </div>
  
  <div class="top-articles">
    <h3>📈 Articles les plus populaires</h3>
    ${this.generateTopArticlesHTML(topArticles)}
  </div>
  
  <div class="quick-links">
    <h3>⚡ Accès rapide</h3>
    <div class="quick-links-grid">
      <a href="/hub-coliving-asie" class="quick-link coliving">🏠 Coliving</a>
      <a href="/hub-visa-asie" class="quick-link visa">✈️ Visa</a>
      <a href="/hub-budget-asie" class="quick-link budget">💰 Budget</a>
      <a href="/hub-communaute-asie" class="quick-link community">👥 Communauté</a>
      <a href="/hub-news-asie" class="quick-link news">📰 Actualités</a>
    </div>
  </div>
</div>
    `;
  }

  // Générer le contenu du hub Coliving
  generateColivingHubContent(urgent, trending, guides) {
    return `
<div class="nomade-hub-coliving">
  <h2>🏠 Hub Coliving Asie</h2>
  <p>Découvrez les meilleurs espaces de coliving en Asie pour les digital nomades.</p>
  
  ${urgent.length > 0 ? `
  <div class="urgent-coliving">
    <h3>🚨 Offres urgentes</h3>
    ${this.generateArticlesHTML(urgent.slice(0, 5))}
  </div>
  ` : ''}
  
  ${trending.length > 0 ? `
  <div class="trending-coliving">
    <h3>📈 Tendance</h3>
    ${this.generateArticlesHTML(trending.slice(0, 8))}
  </div>
  ` : ''}
  
  ${guides.length > 0 ? `
  <div class="guides-coliving">
    <h3>📚 Guides</h3>
    ${this.generateArticlesHTML(guides.slice(0, 6))}
  </div>
  ` : ''}
</div>
    `;
  }

  // Générer le contenu du hub Visa
  generateVisaHubContent(urgent, guides, updates) {
    return `
<div class="nomade-hub-visa">
  <h2>✈️ Hub Visa Nomade Asie</h2>
  <p>Tout sur les visas nomades en Asie. Guides, démarches et actualités.</p>
  
  ${urgent.length > 0 ? `
  <div class="urgent-visa">
    <h3>🚨 Actualités urgentes</h3>
    ${this.generateArticlesHTML(urgent.slice(0, 5))}
  </div>
  ` : ''}
  
  ${guides.length > 0 ? `
  <div class="guides-visa">
    <h3>📚 Guides pratiques</h3>
    ${this.generateArticlesHTML(guides.slice(0, 8))}
  </div>
  ` : ''}
  
  ${updates.length > 0 ? `
  <div class="updates-visa">
    <h3>📰 Mises à jour</h3>
    ${this.generateArticlesHTML(updates.slice(0, 6))}
  </div>
  ` : ''}
</div>
    `;
  }

  // Générer le contenu du hub Budget
  generateBudgetHubContent(deals, comparisons, tips) {
    return `
<div class="nomade-hub-budget">
  <h2>💰 Hub Budget Nomade Asie</h2>
  <p>Optimisez votre budget nomade en Asie. Deals, comparaisons et conseils.</p>
  
  ${deals.length > 0 ? `
  <div class="deals-budget">
    <h3>🔥 Meilleurs deals</h3>
    ${this.generateArticlesHTML(deals.slice(0, 6))}
  </div>
  ` : ''}
  
  ${comparisons.length > 0 ? `
  <div class="comparisons-budget">
    <h3>⚖️ Comparaisons</h3>
    ${this.generateArticlesHTML(comparisons.slice(0, 5))}
  </div>
  ` : ''}
  
  ${tips.length > 0 ? `
  <div class="tips-budget">
    <h3>💡 Conseils</h3>
    ${this.generateArticlesHTML(tips.slice(0, 8))}
  </div>
  ` : ''}
</div>
    `;
  }

  // Générer le contenu du hub Communauté
  generateCommunityHubContent(discussions, experiences, questions) {
    return `
<div class="nomade-hub-community">
  <h2>👥 Hub Communauté Nomade Asie</h2>
  <p>Rejoignez la communauté nomade en Asie. Discussions, expériences et rencontres.</p>
  
  ${discussions.length > 0 ? `
  <div class="discussions-community">
    <h3>💬 Discussions</h3>
    ${this.generateArticlesHTML(discussions.slice(0, 6))}
  </div>
  ` : ''}
  
  ${experiences.length > 0 ? `
  <div class="experiences-community">
    <h3>🌟 Expériences</h3>
    ${this.generateArticlesHTML(experiences.slice(0, 8))}
  </div>
  ` : ''}
  
  ${questions.length > 0 ? `
  <div class="questions-community">
    <h3>❓ Questions</h3>
    ${this.generateArticlesHTML(questions.slice(0, 5))}
  </div>
  ` : ''}
</div>
    `;
  }

  // Générer le contenu du hub News
  generateNewsHubContent(breaking, industry, destinations) {
    return `
<div class="nomade-hub-news">
  <h2>📰 Hub Actualités Nomade Asie</h2>
  <p>Restez informé des dernières actualités nomades en Asie.</p>
  
  ${breaking.length > 0 ? `
  <div class="breaking-news">
    <h3>🚨 Actualités urgentes</h3>
    ${this.generateArticlesHTML(breaking.slice(0, 5))}
  </div>
  ` : ''}
  
  ${industry.length > 0 ? `
  <div class="industry-news">
    <h3>🏢 Industrie</h3>
    ${this.generateArticlesHTML(industry.slice(0, 6))}
  </div>
  ` : ''}
  
  ${destinations.length > 0 ? `
  <div class="destinations-news">
    <h3>🌏 Destinations</h3>
    ${this.generateArticlesHTML(destinations.slice(0, 8))}
  </div>
  ` : ''}
</div>
    `;
  }

  // Générer le contenu du hub de destination
  generateDestinationHubContent(destination, destinationContent) {
    return `
<div class="nomade-hub-destination">
  <h2>🌏 Hub Nomade ${this.capitalizeFirst(destination)}</h2>
  <p>Tout pour les nomades au ${this.capitalizeFirst(destination)}. Coliving, visa, budget et communauté.</p>
  
  ${destinationContent.coliving ? `
  <div class="coliving-${destination}">
    <h3>🏠 Coliving</h3>
    ${this.generateArticlesHTML(destinationContent.coliving.slice(0, 6))}
  </div>
  ` : ''}
  
  ${destinationContent.visa ? `
  <div class="visa-${destination}">
    <h3>✈️ Visa</h3>
    ${this.generateArticlesHTML(destinationContent.visa.slice(0, 5))}
  </div>
  ` : ''}
  
  ${destinationContent.budget ? `
  <div class="budget-${destination}">
    <h3>💰 Budget</h3>
    ${this.generateArticlesHTML(destinationContent.budget.slice(0, 6))}
  </div>
  ` : ''}
</div>
    `;
  }

  // Générer le HTML des articles
  generateArticlesHTML(articles) {
    return articles.map(article => `
      <div class="article-card">
        <h4><a href="${article.link}" target="_blank">${article.title}</a></h4>
        <p>${article.content.substring(0, 150)}...</p>
        <div class="article-meta">
          <span class="source">${article.source}</span>
          <span class="date">${this.formatDate(article.date)}</span>
          <span class="relevance">Pertinence: ${article.relevance}/100</span>
        </div>
      </div>
    `).join('');
  }

  // Générer le HTML du contenu en vedette
  generateFeaturedContentHTML(featuredContent) {
    return featuredContent.map(item => `
      <div class="featured-item">
        <h4><a href="${item.link}" target="_blank">${item.title}</a></h4>
        <p>${item.content.substring(0, 200)}...</p>
      </div>
    `).join('');
  }

  // Générer le HTML des articles populaires
  generateTopArticlesHTML(topArticles) {
    return topArticles.map((article, index) => `
      <div class="top-article">
        <span class="rank">${index + 1}</span>
        <h4><a href="${article.link}" target="_blank">${article.title}</a></h4>
        <span class="priority">Priorité: ${article.priority}/100</span>
      </div>
    `).join('');
  }

  // Obtenir les articles les plus pertinents
  getTopArticles(organizedContent, limit) {
    const allArticles = [];
    
    Object.values(organizedContent).forEach(category => {
      Object.values(category).forEach(subCategory => {
        allArticles.push(...subCategory);
      });
    });
    
    return allArticles
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, limit);
  }

  // Sélectionner le contenu en vedette
  selectFeaturedContent(organizedContent) {
    const featured = [];
    
    // Prendre les articles les plus prioritaires de chaque catégorie
    Object.values(organizedContent).forEach(category => {
      Object.values(category).forEach(subCategory => {
        if (subCategory.length > 0) {
          featured.push(subCategory[0]);
        }
      });
    });
    
    return featured.slice(0, 5);
  }

  // Filtrer le contenu par destination
  filterContentByDestination(organizedContent, destination) {
    const filtered = {};
    
    Object.keys(organizedContent).forEach(category => {
      filtered[category] = {};
      Object.keys(organizedContent[category]).forEach(subCategory => {
        filtered[category][subCategory] = organizedContent[category][subCategory].filter(article => 
          article.title.toLowerCase().includes(destination) ||
          article.content.toLowerCase().includes(destination)
        );
      });
    });
    
    // Calculer le total
    filtered.total = Object.values(filtered).reduce((sum, category) => 
      sum + Object.values(category).reduce((catSum, subCat) => catSum + subCat.length, 0), 0
    );
    
    return filtered;
  }

  // Publier un hub
  async publishHub(hubContent, hubType) {
    try {
      console.log(`📝 Publication du hub ${hubType}...`);
      
      const response = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        title: hubContent.title,
        content: hubContent.content,
        excerpt: hubContent.excerpt,
        status: 'publish',
        categories: hubContent.categories,
        tags: hubContent.tags,
        featured_media: hubContent.featured_media
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      console.log(`✅ Hub ${hubType} publié: ${response.data.link}`);
      return response.data;
      
    } catch (error) {
      console.error(`❌ Erreur publication hub ${hubType}:`, error.message);
      throw error;
    }
  }

  // Obtenir une image en vedette
  async getFeaturedImage(keywords) {
    try {
      const response = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(keywords)}&per_page=1`, {
        headers: {
          'Authorization': PEXELS_API_KEY
        }
      });
      
      if (response.data.photos && response.data.photos.length > 0) {
        return response.data.photos[0].id;
      }
    } catch (error) {
      console.warn('⚠️ Erreur récupération image:', error.message);
    }
    
    return null;
  }

  // Utilitaires
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

export default NomadeHubGenerator;