#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const REDDIT_CONTENT_PORT = 3007;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

// Planification de contenu ultra-spécialisé avec Reddit
const CONTENT_SCHEDULE = {
  'lundi': { type: 'quartier_guide', destinations: ['tokyo', 'bangkok', 'seoul'] },
  'mardi': { type: 'comparatif', sujets: ['hôtels', 'restaurants', 'transports'] },
  'mercredi': { type: 'saisonnier', saisons: ['printemps', 'été', 'automne', 'hiver'] },
  'jeudi': { type: 'quartier_guide', destinations: ['philippines', 'vietnam', 'singapour'] },
  'vendredi': { type: 'comparatif', sujets: ['vols', 'assurances', 'guides'] },
  'samedi': { type: 'saisonnier', saisons: ['printemps', 'été', 'automne', 'hiver'] },
  'dimanche': { type: 'quartier_guide', destinations: ['tokyo', 'bangkok', 'seoul'] }
};

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
      const photo = response.data.photos[Math.floor(Math.random() * response.data.photos.length)];
      return {
        url: photo.src.large,
        alt: photo.alt || query,
        photographer: photo.photographer
      };
    }
    return null;
  } catch (error) {
    console.error(`Erreur Pexels pour "${query}":`, error.message);
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
    
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media/${uploadResponse.data.id}`, {
      alt_text: altText
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    return uploadResponse.data;
  } catch (error) {
    console.error('Erreur upload WordPress:', error.message);
    return null;
  }
}

async function generateRedditContent(type, params) {
  try {
    const response = await axios.post(`http://localhost:${REDDIT_CONTENT_PORT}/mcp`, {
      method: `generate_${type}`,
      params: params
    });
    
    return response.data.result;
  } catch (error) {
    console.error(`Erreur génération Reddit ${type}:`, error.message);
    return null;
  }
}

async function publishContent(content) {
  try {
    console.log(`📝 Publication: ${content.title}`);
    
    // Générer une image contextuelle
    let imageQuery = '';
    if (content.type === 'quartier_guide') {
      imageQuery = `${content.destination} ${content.quartier} local`;
    } else if (content.type === 'comparatif') {
      imageQuery = `${content.destination} ${content.sujet}`;
    } else if (content.type === 'saisonnier') {
      imageQuery = `${content.destination} ${content.saison}`;
    }
    
    let featuredMediaId = 0;
    if (imageQuery) {
      const imageData = await searchPexelsImage(imageQuery);
      if (imageData) {
        const filename = `reddit-${content.type}-${Date.now()}.jpg`;
        const uploadedImage = await uploadImageToWordPress(imageData.url, filename, imageData.alt);
        if (uploadedImage) {
          featuredMediaId = uploadedImage.id;
          console.log(`🖼️ Image uploadée: ${uploadedImage.id}`);
        }
      }
    }
    
    // Déterminer les catégories
    let categories = [];
    const categoryMap = {
      'tokyo': 'japon',
      'bangkok': 'thailande', 
      'seoul': 'coree-du-sud',
      'philippines': 'philippines',
      'vietnam': 'vietnam',
      'singapour': 'singapour',
      'japon': 'japon'
    };
    
    const categorySlug = categoryMap[content.destination] || 'destinations-asie';
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?slug=${categorySlug}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    if (categoriesResponse.data.length > 0) {
      categories.push(categoriesResponse.data[0].id);
    }
    
    // Ajouter catégorie par type
    const typeCategories = {
      'quartier_guide': 'guides-pratiques',
      'comparatif': 'bons-plans',
      'saisonnier': 'guides-pratiques'
    };
    
    if (typeCategories[content.type]) {
      const typeCategoryResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?slug=${typeCategories[content.type]}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      if (typeCategoryResponse.data.length > 0) {
        categories.push(typeCategoryResponse.data[0].id);
      }
    }
    
    // Créer l'article
    const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: content.title,
      content: content.content,
      status: 'publish',
      categories: categories,
      featured_media: featuredMediaId,
      tags: [content.type, content.destination || 'asie', 'ultra-specialise', 'reddit-expats']
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log(`✅ Article publié: ${articleResponse.data.link}`);
    return articleResponse.data;
  } catch (error) {
    console.error('Erreur publication:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 FlashVoyages Reddit Enhanced Auto Publisher');
  console.log('==============================================\n');
  
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase();
  const schedule = CONTENT_SCHEDULE[today];
  
  if (!schedule) {
    console.log('❌ Aucun contenu prévu pour aujourd\'hui');
    return;
  }
  
  console.log(`📅 Planification du ${today}: ${schedule.type}`);
  
  let publishedCount = 0;
  const results = [];
  
  try {
    if (schedule.type === 'quartier_guide') {
      for (const destination of schedule.destinations) {
        const quartiers = {
          'tokyo': ['shibuya', 'harajuku', 'ginza'],
          'bangkok': ['sukhumvit', 'silom', 'chatuchak'],
          'seoul': ['hongdae', 'myeongdong', 'gangnam'],
          'philippines': ['manila', 'cebu', 'boracay'],
          'vietnam': ['hanoi', 'ho-chi-minh', 'hue'],
          'singapour': ['marina-bay', 'chinatown', 'little-india']
        };
        
        const quartier = quartiers[destination][Math.floor(Math.random() * quartiers[destination].length)];
        console.log(`🌏 Génération guide quartier: ${destination} - ${quartier}`);
        
        const content = await generateRedditContent('quartier_guide', {
          destination,
          quartier,
          spots_count: 7
        });
        
        if (content) {
          const published = await publishContent(content);
          if (published) {
            publishedCount++;
            results.push({
              title: content.title,
              url: published.link,
              type: content.type,
              source: 'Reddit expats'
            });
          }
        }
      }
    } else if (schedule.type === 'comparatif') {
      for (const sujet of schedule.sujets) {
        const destinations = ['tokyo', 'bangkok', 'seoul', 'philippines', 'vietnam'];
        const destination = destinations[Math.floor(Math.random() * destinations.length)];
        console.log(`🔍 Génération comparatif: ${destination} - ${sujet}`);
        
        const content = await generateRedditContent('comparatif', {
          destination,
          sujet,
          options_count: 5
        });
        
        if (content) {
          const published = await publishContent(content);
          if (published) {
            publishedCount++;
            results.push({
              title: content.title,
              url: published.link,
              type: content.type,
              source: 'Reddit expats'
            });
          }
        }
      }
    } else if (schedule.type === 'saisonnier') {
      for (const saison of schedule.saisons) {
        const destinations = ['tokyo', 'bangkok', 'seoul', 'philippines', 'vietnam'];
        const destination = destinations[Math.floor(Math.random() * destinations.length)];
        console.log(`🌤️ Génération guide saisonnier: ${destination} - ${saison}`);
        
        const content = await generateRedditContent('saisonnier', {
          destination,
          saison
        });
        
        if (content) {
          const published = await publishContent(content);
          if (published) {
            publishedCount++;
            results.push({
              title: content.title,
              url: published.link,
              type: content.type,
              source: 'Reddit expats'
            });
          }
        }
      }
    }
    
    console.log('\n📊 Résumé de la publication:');
    console.log('============================');
    console.log(`✅ Articles publiés: ${publishedCount}`);
    console.log(`📅 Date: ${new Date().toLocaleDateString('fr-FR')}`);
    console.log(`🌏 Source: Conseils d'expats Reddit authentiques`);
    
    if (results.length > 0) {
      console.log('\n📝 Articles publiés:');
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.title}`);
        console.log(`   🔗 ${result.url}`);
        console.log(`   📊 ${result.type} - ${result.source}`);
      });
    }
    
    console.log('\n🎉 Publication Reddit Enhanced terminée avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur lors de la publication:', error.message);
  }
}

main().catch(console.error);
