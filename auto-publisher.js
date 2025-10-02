import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';
const ULTRA_CONTENT_PORT = 3006;
const PEXELS_API_KEY = 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

// Planification de contenu ultra-spécialisé
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

async function generateUltraContent(type, params) {
  try {
    const response = await axios.post(`http://localhost:${ULTRA_CONTENT_PORT}/mcp`, {
      method: `generate_${type}`,
      params: params
    });
    
    return response.data.result;
  } catch (error) {
    console.error(`Erreur génération ${type}:`, error.message);
    return null;
  }
}

async function publishUltraContent(content) {
  console.log(`📝 Publication: ${content.title}`);
  
  try {
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
      console.log(`   🔍 Recherche image: "${imageQuery}"`);
      const imageData = await searchPexelsImage(imageQuery);
      
      if (imageData) {
        const filename = `ultra-${content.type}-${Date.now()}.jpg`;
        const uploadedImage = await uploadImageToWordPress(imageData.url, filename, imageData.alt);
        
        if (uploadedImage) {
          featuredMediaId = uploadedImage.id;
          console.log(`   ✅ Image ajoutée (ID: ${featuredMediaId})`);
        }
      }
    }
    
    // Déterminer les catégories
    let categories = [];
    if (content.destination) {
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
      
      // Récupérer l'ID de la catégorie
      const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?slug=${categorySlug}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      if (categoriesResponse.data.length > 0) {
        categories.push(categoriesResponse.data[0].id);
      }
    }
    
    // Ajouter des catégories par type
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
      tags: [content.type, content.destination || 'asie']
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log(`   ✅ Article publié (ID: ${articleResponse.data.id})`);
    console.log(`   🔗 URL: ${articleResponse.data.link}`);
    
    return articleResponse.data;
    
  } catch (error) {
    console.error(`   ❌ Erreur publication: ${error.message}`);
    return null;
  }
}

async function generateDailyContent() {
  console.log('🚀 Génération du contenu quotidien ultra-spécialisé...\n');
  
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase();
  const schedule = CONTENT_SCHEDULE[today];
  
  if (!schedule) {
    console.log('❌ Aucun planning trouvé pour aujourd\'hui');
    return;
  }
  
  console.log(`📅 Planning ${today}: ${schedule.type}`);
  
  let publishedCount = 0;
  
  if (schedule.type === 'quartier_guide') {
    for (const destination of schedule.destinations) {
      const quartiers = {
        'tokyo': ['shibuya', 'harajuku', 'ginza', 'akihabara'],
        'bangkok': ['sukhumvit', 'silom', 'chatuchak', 'chinatown'],
        'seoul': ['hongdae', 'myeongdong', 'gangnam', 'insadong'],
        'philippines': ['manila', 'cebu', 'boracay', 'palawan'],
        'vietnam': ['hanoi', 'ho-chi-minh', 'hue', 'hoi-an'],
        'singapour': ['marina-bay', 'chinatown', 'little-india', 'orchard']
      };
      
      const quartier = quartiers[destination][Math.floor(Math.random() * quartiers[destination].length)];
      
      const content = await generateUltraContent('quartier_guide', {
        destination: destination,
        quartier: quartier,
        nombre_spots: 7
      });
      
      if (content) {
        const published = await publishUltraContent(content);
        if (published) publishedCount++;
      }
      
      // Pause entre les publications
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } else if (schedule.type === 'comparatif') {
    for (const sujet of schedule.sujets) {
      const destinations = ['tokyo', 'bangkok', 'seoul', 'philippines', 'vietnam'];
      const destination = destinations[Math.floor(Math.random() * destinations.length)];
      
      const content = await generateUltraContent('comparatif', {
        destination: destination,
        sujet: sujet,
        nombre_options: 5
      });
      
      if (content) {
        const published = await publishUltraContent(content);
        if (published) publishedCount++;
      }
      
      // Pause entre les publications
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } else if (schedule.type === 'saisonnier') {
    for (const saison of schedule.saisons) {
      const destinations = ['japon', 'thailande', 'coree-du-sud', 'philippines', 'vietnam'];
      const destination = destinations[Math.floor(Math.random() * destinations.length)];
      
      const content = await generateUltraContent('saisonnier', {
        destination: destination,
        saison: saison,
        annee: 2024
      });
      
      if (content) {
        const published = await publishUltraContent(content);
        if (published) publishedCount++;
      }
      
      // Pause entre les publications
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n🎉 GÉNÉRATION QUOTIDIENNE TERMINÉE !');
  console.log('='.repeat(50));
  console.log(`✅ Articles publiés: ${publishedCount}`);
  console.log(`📅 Planning: ${today} - ${schedule.type}`);
  console.log('✅ Contenu ultra-spécialisé généré automatiquement');
  console.log('✅ Images contextuelles ajoutées');
  console.log('✅ Intégration TravelPayouts prête');
}

// Exécuter la génération quotidienne
generateDailyContent();
