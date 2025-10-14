#!/usr/bin/env node

/**
 * CRAWLER WORDPRESS - RÉCUPÉRER TOUS LES ARTICLES PUBLIÉS
 */

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import fs from 'fs';

class WordPressArticlesCrawler {
  constructor() {
    this.articles = [];
    this.baseUrl = WORDPRESS_URL;
    this.auth = {
      username: WORDPRESS_USERNAME,
      password: WORDPRESS_APP_PASSWORD
    };
  }

  async crawlAllArticles() {
    console.log('🕷️ CRAWLER WORDPRESS - RÉCUPÉRATION DES ARTICLES');
    console.log('=================================================\n');

    try {
      let page = 1;
      let hasMore = true;
      let totalArticles = 0;

      while (hasMore) {
        console.log(`📄 Récupération de la page ${page}...`);
        
        try {
          const response = await axios.get(`${this.baseUrl}/wp-json/wp/v2/posts`, {
            params: {
              per_page: 100, // Max par page
              page: page,
              status: 'publish',
              _embed: true // Inclure les métadonnées (catégories, tags, featured image)
            },
            auth: this.auth
          });

          const posts = response.data;
          
          if (posts.length === 0) {
            hasMore = false;
            break;
          }

          console.log(`  ✅ ${posts.length} articles récupérés`);

          // Extraire les informations essentielles
          for (const post of posts) {
            const article = {
              id: post.id,
              title: post.title.rendered,
              url: post.link,
              slug: post.slug,
              excerpt: post.excerpt.rendered.replace(/<[^>]*>/g, '').substring(0, 200),
              content: post.content.rendered.replace(/<[^>]*>/g, '').substring(0, 500), // Premier 500 caractères
              categories: this.extractCategories(post),
              tags: this.extractTags(post),
              date: post.date,
              modified: post.modified,
              featured_image: this.extractFeaturedImage(post)
            };

            this.articles.push(article);
            totalArticles++;
          }

          page++;
          
        } catch (pageError) {
          // Si erreur 400, c'est qu'on a atteint la fin
          if (pageError.response && pageError.response.status === 400) {
            console.log(`  ℹ️ Fin de la pagination (page ${page})`);
            hasMore = false;
          } else {
            throw pageError;
          }
        }
      }

      console.log(`\n✅ CRAWL TERMINÉ:`);
      console.log(`  - Total d'articles: ${totalArticles}`);
      
      return this.articles;

    } catch (error) {
      console.error('❌ Erreur lors du crawl:', error.message);
      if (error.response) {
        console.error('Détails:', error.response.status, error.response.statusText);
      }
      throw error;
    }
  }

  extractCategories(post) {
    if (!post._embedded || !post._embedded['wp:term']) return [];
    
    const categories = post._embedded['wp:term'][0] || [];
    return categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug
    }));
  }

  extractTags(post) {
    if (!post._embedded || !post._embedded['wp:term']) return [];
    
    const tags = post._embedded['wp:term'][1] || [];
    return tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug
    }));
  }

  extractFeaturedImage(post) {
    if (!post._embedded || !post._embedded['wp:featuredmedia']) return null;
    
    const media = post._embedded['wp:featuredmedia'][0];
    return media ? media.source_url : null;
  }

  saveToFile(filename = 'articles-database.json') {
    console.log(`\n💾 SAUVEGARDE:`);
    console.log(`  - Fichier: ${filename}`);
    
    const data = {
      crawled_at: new Date().toISOString(),
      total_articles: this.articles.length,
      articles: this.articles
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`  ✅ ${this.articles.length} articles sauvegardés`);
  }

  displayStats() {
    console.log(`\n📊 STATISTIQUES:`);
    console.log(`================`);
    console.log(`  - Total d'articles: ${this.articles.length}`);
    
    // Compter par catégorie
    const categoryCounts = {};
    this.articles.forEach(article => {
      article.categories.forEach(cat => {
        categoryCounts[cat.name] = (categoryCounts[cat.name] || 0) + 1;
      });
    });
    
    console.log(`\n  Articles par catégorie:`);
    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, count]) => {
        console.log(`    - ${name}: ${count}`);
      });
    
    // Compter par tag
    const tagCounts = {};
    this.articles.forEach(article => {
      article.tags.forEach(tag => {
        tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
      });
    });
    
    console.log(`\n  Tags les plus utilisés:`);
    Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([name, count]) => {
        console.log(`    - ${name}: ${count}`);
      });
  }
}

// Exécution
async function main() {
  const crawler = new WordPressArticlesCrawler();
  
  try {
    await crawler.crawlAllArticles();
    crawler.saveToFile('articles-database.json');
    crawler.displayStats();
    
    console.log('\n✅ CRAWL TERMINÉ AVEC SUCCÈS !');
    console.log('📁 Base de données créée: articles-database.json');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Exporter la classe pour utilisation dans d'autres modules
export { WordPressArticlesCrawler };

// Exécuter si appelé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
