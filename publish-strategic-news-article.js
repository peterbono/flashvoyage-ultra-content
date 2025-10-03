#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import StrategicRSSFilter from './strategic-rss-filter.js';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

async function searchPexelsImage(query) {
  try {
    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: {
        query: query,
        per_page: 3,
        orientation: 'landscape'
      },
      headers: {
        'Authorization': PEXELS_API_KEY
      }
    });
    
    if (response.data.photos && response.data.photos.length > 0) {
      const photo = response.data.photos[0];
      return {
        url: photo.src.large,
        alt: photo.alt || query,
        photographer: photo.photographer
      };
    }
    return null;
  } catch (error) {
    console.error('Erreur Pexels:', error.message);
    return null;
  }
}

async function uploadImageToWordPress(imageUrl, filename, altText) {
  try {
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const formData = new FormData();
    const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
    formData.append('file', blob, filename);

    const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, formData, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'image/jpeg'
      }
    });
    
    return uploadResponse.data.id;
  } catch (error) {
    console.error('Erreur upload image:', error.message);
    return null;
  }
}

async function getOrCreateTags(tagNames) {
  const tagIds = [];
  
  for (const tagName of tagNames) {
    try {
      // Chercher le tag existant
      const tagResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${tagName}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      if (tagResponse.data.length > 0) {
        tagIds.push(tagResponse.data[0].id);
        console.log(`✅ Tag trouvé: ${tagName} (ID: ${tagResponse.data[0].id})`);
      } else {
        // Créer le tag
        const createTagResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
          name: tagName,
          slug: tagName.toLowerCase().replace(/\s+/g, '-')
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        tagIds.push(createTagResponse.data.id);
        console.log(`✅ Tag créé: ${tagName} (ID: ${createTagResponse.data.id})`);
      }
    } catch (error) {
      console.log(`⚠️ Erreur tag ${tagName}:`, error.message);
    }
  }
  
  return tagIds;
}

async function createWordPressArticle(article, imageId) {
  try {
    // Récupérer les catégories
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    // Trouver la catégorie correspondante
    let categoryId = 1; // Default
    const category = categoriesResponse.data.find(cat => 
      cat.slug === article.category.toLowerCase().replace(/\s+/g, '-') ||
      cat.name.toLowerCase().includes(article.category.toLowerCase())
    );
    
    if (category) {
      categoryId = category.id;
    }
    
    // Gérer les tags (IDs entiers)
    console.log('🏷️ Gestion des tags...');
    const tagIds = await getOrCreateTags(article.tags);
    
    // Créer l'article
    const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: article.title,
      content: article.content,
      status: 'publish',
      categories: [categoryId],
      featured_media: imageId || 0,
      tags: tagIds
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    return articleResponse.data;
  } catch (error) {
    console.error('Erreur création article:', error.response?.data || error.message);
    throw error;
  }
}

async function publishStrategicNewsArticle() {
  console.log('🚀 Publication d\'un article news stratégique FlashVoyages\n');
  
  try {
    // 1. Récupérer et filtrer les articles RSS
    console.log('🔍 Récupération des articles RSS stratégiques...');
    const filter = new StrategicRSSFilter();
    const strategicArticles = await filter.fetchAndFilterStrategicRSS();
    
    if (strategicArticles.length === 0) {
      console.log('❌ Aucun article stratégique trouvé');
      return;
    }
    
    // 2. Sélectionner le meilleur article (score le plus élevé)
    const bestArticle = strategicArticles.reduce((best, current) => 
      current.analysis.score > best.analysis.score ? current : best
    );
    
    console.log(`\n🎯 Meilleur article sélectionné:`);
    console.log(`📰 ${bestArticle.title}`);
    console.log(`🇫🇷 ${bestArticle.translatedTitle}`);
    console.log(`📊 Score: ${bestArticle.analysis.score}/100 (${bestArticle.analysis.strategicValue})`);
    console.log(`🌏 Destination: ${bestArticle.analysis.destination}`);
    console.log(`🏷️ Type: ${bestArticle.analysis.travelType}`);
    
    // 3. Générer l'article FlashVoyages
    console.log('\n📝 Génération de l\'article FlashVoyages...');
    const flashVoyagesArticle = filter.generateStrategicFlashVoyagesArticle(bestArticle);
    
    console.log(`✅ Article généré: ${flashVoyagesArticle.title}`);
    console.log(`📂 Catégorie: ${flashVoyagesArticle.category}`);
    console.log(`🏷️ Tags: ${flashVoyagesArticle.tags.join(', ')}`);
    console.log(`📊 Score stratégique: ${flashVoyagesArticle.strategicScore}/100`);
    console.log(`🎯 Valeur stratégique: ${flashVoyagesArticle.strategicValue}`);
    
    // 4. Rechercher une image contextuelle
    console.log('\n🖼️ Recherche d\'image contextuelle...');
    const imageQuery = `${flashVoyagesArticle.destination} travel news ${flashVoyagesArticle.type}`;
    const image = await searchPexelsImage(imageQuery);
    
    let imageId = null;
    if (image) {
      console.log(`✅ Image trouvée: ${image.alt}`);
      
      // Uploader l'image
      const filename = `flashvoyages-${Date.now()}.jpg`;
      imageId = await uploadImageToWordPress(image.url, filename, image.alt);
      
      if (imageId) {
        console.log(`✅ Image uploadée (ID: ${imageId})`);
      }
    }
    
    // 5. Créer l'article sur WordPress
    console.log('\n📝 Création de l\'article sur WordPress...');
    const wpArticle = await createWordPressArticle(flashVoyagesArticle, imageId);
    
    console.log('\n🎉 Article publié avec succès !');
    console.log(`🔗 URL: ${wpArticle.link}`);
    console.log(`📊 ID: ${wpArticle.id}`);
    console.log(`📂 Catégorie: ${flashVoyagesArticle.category}`);
    console.log(`🏷️ Tags: ${flashVoyagesArticle.tags.join(', ')}`);
    console.log(`📊 Score stratégique: ${flashVoyagesArticle.strategicScore}/100`);
    console.log(`🎯 Valeur stratégique: ${flashVoyagesArticle.strategicValue}`);
    console.log(`💡 Valeur pratique: ${flashVoyagesArticle.practicalValue}`);
    
    if (imageId) {
      console.log(`🖼️ Image: ${imageId}`);
    }
    
    return {
      success: true,
      article: wpArticle,
      strategicScore: flashVoyagesArticle.strategicScore,
      strategicValue: flashVoyagesArticle.strategicValue,
      destination: flashVoyagesArticle.destination,
      type: flashVoyagesArticle.type
    };
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return { success: false, error: error.message };
  }
}

// Exécuter la publication
if (import.meta.url === `file://${process.argv[1]}`) {
  publishStrategicNewsArticle().then(result => {
    if (result.success) {
      console.log('\n✅ Publication réussie !');
      console.log('🌏 FlashVoyages a publié un article news stratégique');
      console.log('🇫🇷 Contenu en français et pertinent pour l\'Asie');
      console.log('🎯 Scoring intelligent et filtrage efficace');
      console.log('🚀 Prêt pour l\'automatisation quotidienne !');
    } else {
      console.log('\n❌ Publication échouée');
      console.log('🔍 Vérifiez les logs pour plus de détails');
    }
  });
}

export default publishStrategicNewsArticle;

