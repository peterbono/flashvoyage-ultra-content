#!/usr/bin/env node

import axios from 'axios';
import xml2js from 'xml2js';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

async function fetchRSSNews(source) {
  try {
    console.log(`🔍 Récupération actualité depuis ${source.name}...`);
    
    const response = await axios.get(source.url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FlashVoyages-RSS-Monitor/1.0)'
      }
    });
    
    if (response.status === 200) {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      let articles = [];
      if (result.rss && result.rss.channel && result.rss.channel[0].item) {
        articles = result.rss.channel[0].item;
      }
      
      if (articles.length > 0) {
        // Prendre le premier article récent
        const article = articles[0];
        const title = article.title?.[0] || article.title?._ || 'Sans titre';
        const description = article.description?.[0] || article.description?._ || '';
        const link = article.link?.[0] || article.link?._ || '#';
        const pubDate = article.pubDate?.[0] || article.published?.[0] || new Date().toISOString();
        
        return {
          source: source.name,
          title,
          description,
          link,
          pubDate,
          category: source.category
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Erreur ${source.name}:`, error.message);
    return null;
  }
}

async function generateArticleFromRSS(news) {
  console.log(`📝 Génération d'article basé sur: ${news.title}`);
  
  // Analyser le contenu pour déterminer le type d'article
  let articleType = 'actualites';
  let destination = 'Asie';
  let category = 'Actualités';
  
  // Détecter la destination basée sur le titre
  const title = news.title.toLowerCase();
  if (title.includes('japan') || title.includes('tokyo') || title.includes('japon')) {
    destination = 'Japon';
    category = 'Japon';
  } else if (title.includes('thailand') || title.includes('bangkok') || title.includes('thaïlande')) {
    destination = 'Thaïlande';
    category = 'Thaïlande';
  } else if (title.includes('korea') || title.includes('seoul') || title.includes('corée')) {
    destination = 'Corée du Sud';
    category = 'Corée du Sud';
  } else if (title.includes('singapore') || title.includes('singapour')) {
    destination = 'Singapour';
    category = 'Singapour';
  } else if (title.includes('vietnam') || title.includes('hanoi') || title.includes('ho chi minh')) {
    destination = 'Vietnam';
    category = 'Vietnam';
  } else if (title.includes('philippines') || title.includes('manila')) {
    destination = 'Philippines';
    category = 'Philippines';
  }
  
  // Détecter le type d'article
  if (title.includes('deal') || title.includes('offer') || title.includes('promotion') || title.includes('discount')) {
    articleType = 'bons-plans';
  } else if (title.includes('visa') || title.includes('passport') || title.includes('entry')) {
    articleType = 'guides-pratiques';
  } else if (title.includes('safety') || title.includes('security') || title.includes('alert')) {
    articleType = 'alertes-securite';
  }
  
  // Générer le titre FlashVoyages
  const flashVoyagesTitle = `🌏 ${destination} : ${news.title}`;
  
  // Générer le contenu de l'article
  const content = `
    <h2>📰 ${destination} - Actualité voyage</h2>
    <p><em>📅 Dernière mise à jour : ${new Date().toLocaleDateString('fr-FR')}</em></p>
    
    <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <h3>🚀 FlashVoyages vous informe</h3>
      <p><strong>${news.title}</strong></p>
      <p>${news.description}</p>
    </div>
    
    <h3>📊 Détails de l'actualité</h3>
    <ul>
      <li><strong>Source :</strong> ${news.source}</li>
      <li><strong>Date :</strong> ${new Date(news.pubDate).toLocaleDateString('fr-FR')}</li>
      <li><strong>Destination :</strong> ${destination}</li>
      <li><strong>Catégorie :</strong> ${category}</li>
    </ul>
    
    <h3>💡 Impact pour les voyageurs</h3>
    <ul>
      <li>Informations importantes pour votre voyage en ${destination}</li>
      <li>Conseils FlashVoyages pour bien préparer votre séjour</li>
      <li>Mise à jour des conditions de voyage</li>
    </ul>
    
    <h3>🔍 En savoir plus</h3>
    <p>Pour plus d'informations, consultez la source officielle :</p>
    <p><a href="${news.link}" target="_blank" rel="noopener">${news.title}</a></p>
    
    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
      <h4>💡 Conseil FlashVoyages</h4>
      <p>Restez informé des dernières actualités voyage avec FlashVoyages. Nous surveillons en permanence les développements qui peuvent affecter votre voyage en ${destination}.</p>
    </div>
  `;
  
  return {
    title: flashVoyagesTitle,
    content,
    type: articleType,
    destination,
    category,
    source: news.source,
    originalLink: news.link
  };
}

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
    
    // Créer l'article
    const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: article.title,
      content: article.content,
      status: 'publish',
      categories: [categoryId],
      featured_media: imageId || 0,
      tags: ['actualite', 'rss', 'voyage', article.destination.toLowerCase()]
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    return articleResponse.data;
  } catch (error) {
    console.error('Erreur création article:', error.message);
    throw error;
  }
}

async function testRSSArticleGeneration() {
  console.log('🧪 Test de génération d\'article basé sur l\'actualité RSS...\n');
  
  // Sources RSS à tester
  const sources = [
    { name: 'CNN Travel', url: 'http://rss.cnn.com/rss/edition_travel.rss', category: 'travel_news' },
    { name: 'Google News Asia', url: 'https://news.google.com/rss/search?q=travel+asia&hl=en&gl=US&ceid=US:en', category: 'asia_news' },
    { name: 'Google News Japan', url: 'https://news.google.com/rss/search?q=travel+japan&hl=en&gl=US&ceid=US:en', category: 'asia_news' }
  ];
  
  try {
    // Récupérer l'actualité depuis la première source disponible
    let news = null;
    for (const source of sources) {
      news = await fetchRSSNews(source);
      if (news) {
        console.log(`✅ Actualité trouvée: ${news.title}`);
        break;
      }
    }
    
    if (!news) {
      console.log('❌ Aucune actualité trouvée');
      return;
    }
    
    // Générer l'article
    console.log('\n📝 Génération de l\'article...');
    const article = await generateArticleFromRSS(news);
    console.log(`✅ Article généré: ${article.title}`);
    
    // Rechercher une image
    console.log('\n🖼️ Recherche d\'image...');
    const imageQuery = `${article.destination} travel news`;
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
    
    // Créer l'article sur WordPress
    console.log('\n📝 Création de l\'article sur WordPress...');
    const wpArticle = await createWordPressArticle(article, imageId);
    
    console.log('\n🎉 Article créé avec succès !');
    console.log(`🔗 URL: ${wpArticle.link}`);
    console.log(`📊 ID: ${wpArticle.id}`);
    console.log(`📂 Catégorie: ${article.category}`);
    console.log(`🏷️ Tags: actualite, rss, voyage, ${article.destination.toLowerCase()}`);
    
    if (imageId) {
      console.log(`🖼️ Image: ${imageId}`);
    }
    
    return {
      success: true,
      article: wpArticle,
      source: news.source,
      originalTitle: news.title
    };
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Test de génération d\'article RSS FlashVoyages\n');
  
  const result = await testRSSArticleGeneration();
  
  if (result.success) {
    console.log('\n✅ Test réussi !');
    console.log('🌏 FlashVoyages peut générer des articles basés sur l\'actualité RSS');
    console.log('📰 Contenu automatique et pertinent');
    console.log('🖼️ Images contextuelles intégrées');
  } else {
    console.log('\n❌ Test échoué');
    console.log('🔍 Vérifiez les logs pour plus de détails');
  }
}

main().catch(console.error);

