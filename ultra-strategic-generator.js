#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import { translate } from '@vitalets/google-translate-api';
import UltraFreshComplete from './ultra-fresh-complete.js';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-proj-placeholder';

console.log('🎯 ULTRA-STRATEGIC GENERATOR - Positionnement FlashVoyages optimisé\n');

class UltraStrategicGenerator {
  constructor() {
    this.scraper = new UltraFreshComplete();
    this.publishedArticles = new Set();
  }

  // Charger les articles déjà publiés
  async loadPublishedArticles() {
    try {
      console.log('📚 Chargement des articles déjà publiés...');
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      response.data.forEach(post => {
        const title = post.title.rendered.toLowerCase().trim();
        this.publishedArticles.add(title);
      });
      
      console.log(`✅ ${this.publishedArticles.size} articles déjà publiés chargés`);
    } catch (error) {
      console.warn('⚠️ Impossible de charger les articles existants:', error.message);
    }
  }

  // Vérifier si l'article est déjà publié
  isArticleAlreadyPublished(title) {
    const normalizedTitle = title.toLowerCase().trim();
    return this.publishedArticles.has(normalizedTitle);
  }

  // Générer un contenu stratégique avec GPT-4
  async generateStrategicContent(article) {
    try {
      console.log('🧠 Génération de contenu stratégique avec GPT-4...');
      
      const prompt = `Tu es un expert en voyage en Asie pour FlashVoyages.com. 

POSITIONNEMENT FLASHVOYAGES:
- Cible: Voyageurs français passionnés d'Asie (budget moyen à élevé)
- Ton: Expert, confident, proche (comme Voyage Pirate mais pour l'Asie)
- Valeur: Expertise + bons plans + économies concrètes
- Objectif: Conversion et fidélisation

ARTICLE À ANALYSER:
- Titre: ${article.title}
- Source: ${article.source}
- Type: ${article.type}
- Contenu: ${article.content}
- Pertinence: ${article.relevance}/100

GÉNÈRE UN ARTICLE STRATÉGIQUE QUI INCLUT:

1. TITRE FOMO OPTIMISÉ:
- Court, percutant, sans redondance
- Émoji stratégique (1 seul)
- Promesse d'économie claire
- Urgence justifiée

2. CIBLE DÉFINIE:
- Profil précis du voyageur français
- Budget et motivations
- Niveau d'expérience Asie

3. INTÉRÊT ÉCONOMIQUE CONCRET:
- Économies chiffrées précises
- Comparaison avant/après
- ROI du voyage
- Coûts cachés évités

4. CONTENU STRATÉGIQUE:
- Expertise FlashVoyages visible
- Conseils pratiques exclusifs
- Pièges à éviter
- Timing optimal
- Alternatives si indisponible

5. STRUCTURE OPTIMISÉE:
- Hook percutant
- Valeur immédiate
- Preuve sociale
- Call-to-action fort

RÉPONDS UNIQUEMENT EN JSON:
{
  "title": "Titre optimisé",
  "target_audience": "Cible précise",
  "economic_value": "Valeur économique chiffrée",
  "content": "Contenu HTML complet",
  "cta": "Call-to-action",
  "expertise_score": "Score d'expertise 1-10"
}`;

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert en rédaction stratégique pour un site de voyage spécialisé Asie. Tu génères du contenu optimisé pour la conversion et la fidélisation.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const content = response.data.choices[0].message.content;
      return JSON.parse(content);

    } catch (error) {
      console.warn('⚠️ Erreur GPT-4, utilisation du fallback:', error.message);
      return this.generateFallbackContent(article);
    }
  }

  // Contenu de fallback si GPT-4 échoue
  generateFallbackContent(article) {
    const timeAgo = this.getTimeAgo(article.date);
    
    return {
      title: `🔥 URGENT : ${article.title.replace(/^[🔥🚨⚡🎯]+/, '').trim()}`,
      target_audience: "Voyageurs français passionnés d'Asie (budget 2000-5000€/voyage)",
      economic_value: "Économies potentielles: 300-800€ par voyage",
      content: `
<p><strong>Source :</strong> <a href="${article.link}" target="_blank" rel="noopener">${article.title}</a> - ${article.source}</p>

<p>Si tu es un voyageur français qui rêve d'Asie, cette info va changer ton prochain voyage. Chez FlashVoyages, on déniche les bons plans qui valent le détour.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur ${article.type} en Asie, c'est pas juste une actualité de plus. C'est le genre d'info qui peut te faire économiser des centaines d'euros sur ton prochain voyage.</p>

<p>On suit ces évolutions de près parce qu'on sait que nos lecteurs comptent sur nous pour dénicher les vraies bonnes affaires.</p>

<h5>Ce qui change concrètement pour toi</h5>
<p>Voici ce que tu dois retenir :</p>

<ul>
<li><strong>${article.type} :</strong> ${article.content}</li>
<li><strong>Quand :</strong> ${timeAgo}</li>
<li><strong>Pour qui :</strong> Voyageurs français passionnés d'Asie</li>
<li><strong>Économies :</strong> 300-800€ par voyage</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>On te conseille d'agir rapidement. Ces offres sont souvent limitées dans le temps et partent vite.</p>

<p>On te recommande de réserver rapidement pour profiter des offres. C'est le genre de changement qu'on voit venir, et mieux vaut être préparé.</p>

<h5>Contexte Asie</h5>
<p>Cette évolution s'inscrit dans une tendance plus large : l'Asie se positionne comme une destination accessible avec des offres attractives.</p>

<p>C'est une bonne nouvelle pour les voyageurs français — ça signifie des économies importantes sur tes voyages.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> ${article.relevance}/100 — Information cruciale</p>
<p><strong>Pourquoi c'est important :</strong> Changement concret dans tes économies de voyage</p>
<p><strong>Action recommandée :</strong> Profiter des offres rapidement</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du voyage en Asie.</em></p>
`,
      cta: "Réserve maintenant pour profiter de cette offre",
      expertise_score: "8/10"
    };
  }

  // Méthodes utilitaires
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

  // Rechercher une image Pexels
  async searchPexelsImage(query) {
    try {
      const response = await axios.get('https://api.pexels.com/v1/search', {
        headers: {
          'Authorization': PEXELS_API_KEY
        },
        params: {
          query: query,
          per_page: 1,
          orientation: 'landscape'
        }
      });

      const photos = response.data.photos;
      if (photos && photos.length > 0) {
        return {
          url: photos[0].src.large,
          alt: photos[0].alt || query,
          photographer: photos[0].photographer
        };
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Erreur Pexels:', error.message);
      return null;
    }
  }

  // Uploader une image sur WordPress
  async uploadImageToWordPress(imageUrl, altText) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer'
      });

      const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, imageResponse.data, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Disposition': `attachment; filename="strategic-${Date.now()}.jpg"`
        },
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      return uploadResponse.data.id;
    } catch (error) {
      console.warn('⚠️ Erreur upload image:', error.message);
      return null;
    }
  }

  // Créer ou récupérer un tag
  async getOrCreateTag(tagName) {
    try {
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      if (response.data.length > 0) {
        return response.data[0].id;
      }

      const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
        name: tagName,
        slug: tagName.toLowerCase().replace(/\s+/g, '-')
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      return createResponse.data.id;
    } catch (error) {
      console.warn(`⚠️ Erreur tag ${tagName}:`, error.message);
      return null;
    }
  }

  // Générer et publier un article stratégique
  async generateAndPublishStrategicArticle() {
    try {
      console.log('🎯 Génération d\'un article stratégique FlashVoyages...\n');

      // Charger les articles publiés
      await this.loadPublishedArticles();

      // Scraper les sources ultra-fraîches
      const articles = await this.scraper.scrapeAllSources();
      
      if (articles.length === 0) {
        console.log('❌ Aucun article ultra-fraîche trouvé');
        return;
      }

      // Trouver le meilleur article non publié
      let bestArticle = null;
      for (const article of articles) {
        if (!this.isArticleAlreadyPublished(article.title)) {
          bestArticle = article;
          break;
        }
      }

      if (!bestArticle) {
        console.log('❌ Tous les articles ont déjà été publiés');
        return;
      }

      console.log(`✅ Article sélectionné: ${bestArticle.title}`);
      console.log(`📊 Pertinence: ${bestArticle.relevance}/100`);
      console.log(`🏷️ Type: ${bestArticle.type}`);

      // Générer le contenu stratégique avec GPT-4
      const strategicContent = await this.generateStrategicContent(bestArticle);
      
      console.log(`🎯 Titre stratégique: ${strategicContent.title}`);
      console.log(`👥 Cible: ${strategicContent.target_audience}`);
      console.log(`💰 Valeur économique: ${strategicContent.economic_value}`);
      console.log(`🧠 Score d'expertise: ${strategicContent.expertise_score}`);

      // Rechercher une image
      console.log('🖼️ Recherche d\'image contextuelle...');
      const imageQuery = this.getImageQuery(bestArticle);
      const imageData = await this.searchPexelsImage(imageQuery);
      
      let imageId = null;
      if (imageData) {
        imageId = await this.uploadImageToWordPress(imageData.url, imageData.alt);
        if (imageId) {
          console.log(`✅ Image uploadée (ID: ${imageId})`);
        }
      }

      // Créer les tags
      const tagNames = ['actualite', 'voyage', 'Asie', bestArticle.type, 'strategique', 'expertise', 'bon-plan'];
      const tagIds = [];
      for (const tagName of tagNames) {
        const tagId = await this.getOrCreateTag(tagName);
        if (tagId) {
          tagIds.push(tagId);
          console.log(`✅ Tag trouvé: ${tagName} (ID: ${tagId})`);
        }
      }

      // Créer l'article
      console.log('📝 Création de l\'article stratégique sur WordPress...');
      const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        title: strategicContent.title,
        content: strategicContent.content,
        status: 'publish',
        categories: [1], // Catégorie Asie
        tags: tagIds,
        featured_media: imageId
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      console.log('🎉 Article stratégique publié avec succès !');
      console.log(`🔗 URL: ${articleResponse.data.link}`);
      console.log(`📊 ID: ${articleResponse.data.id}`);
      console.log(`📂 Catégorie: Asie`);
      console.log(`🏷️ Tags: ${tagNames.join(', ')}`);
      console.log(`📊 Score stratégique: ${bestArticle.relevance}/100`);
      console.log(`🎯 Valeur stratégique: ${strategicContent.economic_value}`);
      console.log(`👥 Cible: ${strategicContent.target_audience}`);
      console.log(`🧠 Expertise: ${strategicContent.expertise_score}`);
      console.log(`🌏 Source: ${bestArticle.source}`);
      console.log(`🏷️ Type: ${bestArticle.type}`);
      console.log(`⚡ Urgence: ${bestArticle.urgency}`);
      if (imageId) {
        console.log(`🖼️ Image: ${imageId}`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la génération stratégique:', error.response ? error.response.data : error.message);
    }
  }

  // Générer une requête d'image
  getImageQuery(article) {
    const queries = {
      'bon_plan': 'thailand travel deal savings',
      'transport': 'asia airplane flight premium',
      'formalités': 'asia passport visa official',
      'safety': 'asia travel safety security',
      'tourism': 'asia luxury tourism attraction'
    };
    return queries[article.type] || 'asia luxury travel';
  }
}

// Fonction principale
async function main() {
  const generator = new UltraStrategicGenerator();
  await generator.generateAndPublishStrategicArticle();
}

// Exécution
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default UltraStrategicGenerator;
