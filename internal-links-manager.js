#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import { isKnownLocation } from './airport-lookup.js';

class InternalLinksManager {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
    this.articlesCache = new Map();
    this.lastCacheUpdate = null;
    this.cacheValidity = 30 * 60 * 1000; // 30 minutes
  }

  // Récupérer tous les articles WordPress
  async getAllArticles() {
    try {
      // Vérifier le cache
      if (this.articlesCache.size > 0 && this.lastCacheUpdate && 
          (Date.now() - this.lastCacheUpdate) < this.cacheValidity) {
        console.log('📚 Utilisation du cache des articles');
        return Array.from(this.articlesCache.values());
      }

      console.log('🔍 Récupération des articles WordPress...');
      
      const articles = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        try {
          const response = await axios.get(`${this.wordpressUrl}/wp-json/wp/v2/posts`, {
            params: {
              per_page: 100,
              page: page,
              status: 'publish',
              _fields: 'id,title,slug,excerpt,content,link,categories,tags,date'
            },
            auth: {
              username: this.username,
              password: this.password
            }
          });

          if (response.data.length === 0) {
            hasMore = false;
          } else {
            articles.push(...response.data);
            page++;
          }
        } catch (error) {
          if (error.response?.status === 400) {
            console.log('   ℹ️ Fin de la pagination (page ' + page + ')');
            hasMore = false;
          } else {
            console.error('   ❌ Erreur récupération articles:', error.message);
            throw error;
          }
        }
      }

      // Mettre à jour le cache
      this.articlesCache.clear();
      articles.forEach(article => {
        this.articlesCache.set(article.id, article);
      });
      this.lastCacheUpdate = Date.now();

      console.log(`✅ ${articles.length} articles récupérés et mis en cache`);
      return articles;

    } catch (error) {
      console.error('❌ Erreur récupération articles:', error.message);
      return Array.from(this.articlesCache.values()); // Fallback sur le cache
    }
  }

  // Analyser le contenu pour trouver des liens internes pertinents
  async findRelevantInternalLinks(content, analysis, maxLinks = 3) {
    try {
      const articles = await this.getAllArticles();
      const relevantLinks = [];

      // Extraire les mots-clés du contenu
      const keywords = this.extractKeywords(content);
      const destinations = this.extractDestinations(content);
      const categories = this.extractCategories(content);

      // Score de pertinence pour chaque article
      articles.forEach(article => {
        if (article.id === analysis.articleId) return; // Exclure l'article actuel

        const score = this.calculateRelevanceScore(
          article, 
          keywords, 
          destinations, 
          categories, 
          analysis
        );

        if (score > 0.3) { // Seuil de pertinence
          relevantLinks.push({
            id: article.id,
            title: article.title.rendered,
            slug: article.slug,
            link: article.link,
            excerpt: article.excerpt.rendered,
            score: score,
            reason: this.getRelevanceReason(article, keywords, destinations, categories)
          });
        }
      });

      // Trier par score et limiter
      return relevantLinks
        .sort((a, b) => b.score - a.score)
        .slice(0, maxLinks);

    } catch (error) {
      console.error('❌ Erreur recherche liens internes:', error.message);
      return [];
    }
  }

  // Extraire les mots-clés du contenu
  extractKeywords(content) {
    const text = content.toLowerCase();
    const keywords = [];
    
    // Mots-clés nomades
    const nomadKeywords = [
      'nomad', 'digital nomad', 'remote work', 'coliving', 'coworking',
      'visa', 'résidence', 'fiscal', 'budget', 'coût', 'économie',
      'productivité', 'travail', 'bureau', 'outils', 'sécurité'
    ];
    
    nomadKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        keywords.push(keyword);
      }
    });
    
    return keywords;
  }

  // Extraire les destinations du contenu
  extractDestinations(content) {
    const text = content.toLowerCase();
    const destinations = [];
    
    // Détection dynamique via BDD OpenFlights (5600+ entrées)
    const words = text.split(/[\s,;.()]+/).filter(w => w.length > 2);
    const seen = new Set();
    for (const word of words) {
      const w = word.toLowerCase();
      if (!seen.has(w) && isKnownLocation(w)) {
        destinations.push(w);
        seen.add(w);
      }
    }
    
    return destinations;
  }

  // Extraire les catégories du contenu
  extractCategories(content) {
    const text = content.toLowerCase();
    const categories = [];
    
    const categoryKeywords = [
      'visa', 'logement', 'transport', 'santé', 'finance',
      'communauté', 'travail', 'voyage', 'culture', 'langue'
    ];
    
    categoryKeywords.forEach(category => {
      if (text.includes(category)) {
        categories.push(category);
      }
    });
    
    return categories;
  }

  // Calculer le score de pertinence
  calculateRelevanceScore(article, keywords, destinations, categories, analysis) {
    let score = 0;
    const articleText = (article.title.rendered + ' ' + article.excerpt.rendered).toLowerCase();
    
    // Score basé sur les mots-clés
    keywords.forEach(keyword => {
      if (articleText.includes(keyword)) {
        score += 0.2;
      }
    });
    
    // Score basé sur les destinations
    destinations.forEach(dest => {
      if (articleText.includes(dest)) {
        score += 0.3;
      }
    });
    
    // Score basé sur les catégories
    categories.forEach(category => {
      if (articleText.includes(category)) {
        score += 0.15;
      }
    });
    
    // Score basé sur le type de contenu
    if (analysis.type_contenu) {
      const typeKeywords = this.getTypeKeywords(analysis.type_contenu);
      typeKeywords.forEach(keyword => {
        if (articleText.includes(keyword)) {
          score += 0.1;
        }
      });
    }
    
    // Bonus pour les articles récents
    const articleDate = new Date(article.date);
    const daysSincePublication = (Date.now() - articleDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePublication < 30) {
      score += 0.1;
    }
    
    return Math.min(score, 1); // Limiter à 1
  }

  // Obtenir les mots-clés par type de contenu
  getTypeKeywords(typeContenu) {
    const typeKeywords = {
      'TEMOIGNAGE_SUCCESS_STORY': ['succès', 'réussite', 'transformation', 'objectif'],
      'TEMOIGNAGE_ECHEC_LEÇONS': ['erreur', 'échec', 'leçon', 'apprentissage'],
      'TEMOIGNAGE_TRANSITION': ['transition', 'changement', 'évolution', 'adaptation'],
      'TEMOIGNAGE_COMPARAISON': ['comparaison', 'vs', 'différence', 'choix'],
      'GUIDE_PRATIQUE': ['guide', 'tutoriel', 'étape', 'procédure'],
      'COMPARAISON_DESTINATIONS': ['destination', 'pays', 'ville', 'comparaison'],
      'ACTUALITE_NOMADE': ['actualité', 'nouvelle', 'tendance', 'réglementation'],
      'CONSEIL_PRATIQUE': ['conseil', 'astuce', 'bonne pratique', 'optimisation']
    };
    
    return typeKeywords[typeContenu] || [];
  }

  // Obtenir la raison de pertinence
  getRelevanceReason(article, keywords, destinations, categories) {
    const reasons = [];
    const articleText = (article.title.rendered + ' ' + article.excerpt.rendered).toLowerCase();
    
    // Vérifier les mots-clés communs
    const commonKeywords = keywords.filter(keyword => articleText.includes(keyword));
    if (commonKeywords.length > 0) {
      reasons.push(`Mots-clés communs: ${commonKeywords.join(', ')}`);
    }
    
    // Vérifier les destinations communes
    const commonDestinations = destinations.filter(dest => articleText.includes(dest));
    if (commonDestinations.length > 0) {
      reasons.push(`Destinations communes: ${commonDestinations.join(', ')}`);
    }
    
    // Vérifier les catégories communes
    const commonCategories = categories.filter(category => articleText.includes(category));
    if (commonCategories.length > 0) {
      reasons.push(`Catégories communes: ${commonCategories.join(', ')}`);
    }
    
    return reasons.join(' | ');
  }

  // Générer le HTML des liens internes
  generateInternalLinksHTML(links) {
    if (links.length === 0) {
      return '';
    }

    let html = '<h3>Articles connexes</h3>\n<p><strong>Liens internes :</strong></p>\n<ul>\n';
    
    links.forEach(link => {
      html += `  <li><a href="${link.link}">${link.title}</a></li>\n`;
    });
    
    html += '</ul>\n';
    return html;
  }

  // Valider les liens internes
  validateInternalLinks(content) {
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      links.push({
        url: match[1],
        text: match[2],
        isInternal: match[1].includes(this.wordpressUrl) || match[1].startsWith('/')
      });
    }
    
    return {
      total: links.length,
      internal: links.filter(l => l.isInternal).length,
      external: links.filter(l => !l.isInternal).length,
      links: links
    };
  }

  // Optimiser les liens internes
  optimizeInternalLinks(content, analysis) {
    // Cette méthode pourrait être étendue pour optimiser automatiquement
    // les liens internes selon le contexte
    return content;
  }
}

export default InternalLinksManager;
