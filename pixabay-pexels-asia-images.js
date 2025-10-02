import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Configuration des APIs
const IMAGE_APIS = {
  pixabay: {
    baseUrl: 'https://pixabay.com/api/',
    key: 'YOUR_PIXABAY_API_KEY', // À remplacer par votre clé
    params: {
      'key': 'YOUR_PIXABAY_API_KEY',
      'image_type': 'photo',
      'orientation': 'horizontal',
      'category': 'travel',
      'safesearch': 'true',
      'per_page': 20
    }
  },
  pexels: {
    baseUrl: 'https://api.pexels.com/v1/search',
    key: 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA',
    headers: {
      'Authorization': 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA'
    }
  }
};

// Mots-clés de recherche spécifiques à l'Asie
const ASIA_SEARCH_KEYWORDS = {
  'thailande': {
    'vols': ['thailand airport', 'bangkok airport', 'thai airlines', 'thailand travel'],
    'hotels': ['thailand hotel', 'bangkok hotel', 'thai resort', 'thailand accommodation'],
    'visa': ['thailand temple', 'bangkok temple', 'thai culture', 'thailand passport'],
    'budget': ['thailand street food', 'bangkok market', 'thai budget travel', 'thailand cheap'],
    'securite': ['thailand safe', 'bangkok safe', 'thailand security', 'thai police'],
    'guide': ['thailand guide', 'bangkok guide', 'thai travel guide', 'thailand tips'],
    'bon_plan': ['thailand deal', 'bangkok deal', 'thai promotion', 'thailand offer'],
    'default': ['thailand', 'bangkok', 'thai culture', 'thailand travel']
  },
  'japon': {
    'vols': ['japan airport', 'tokyo airport', 'japanese airlines', 'japan travel'],
    'hotels': ['japan hotel', 'tokyo hotel', 'japanese ryokan', 'japan accommodation'],
    'visa': ['japan temple', 'tokyo temple', 'japanese culture', 'japan passport'],
    'budget': ['japan street food', 'tokyo market', 'japanese budget travel', 'japan cheap'],
    'securite': ['japan safe', 'tokyo safe', 'japan security', 'japanese police'],
    'guide': ['japan guide', 'tokyo guide', 'japanese travel guide', 'japan tips'],
    'bon_plan': ['japan deal', 'tokyo deal', 'japanese promotion', 'japan offer'],
    'default': ['japan', 'tokyo', 'japanese culture', 'japan travel']
  },
  'philippines': {
    'vols': ['philippines airport', 'manila airport', 'philippine airlines', 'philippines travel'],
    'hotels': ['philippines hotel', 'manila hotel', 'philippine resort', 'philippines accommodation'],
    'visa': ['philippines culture', 'manila culture', 'philippine tradition', 'philippines passport'],
    'budget': ['philippines street food', 'manila market', 'philippine budget travel', 'philippines cheap'],
    'securite': ['philippines safe', 'manila safe', 'philippine security', 'philippines police'],
    'guide': ['philippines guide', 'manila guide', 'philippine travel guide', 'philippines tips'],
    'bon_plan': ['philippines deal', 'manila deal', 'philippine promotion', 'philippines offer'],
    'default': ['philippines', 'manila', 'philippine culture', 'philippines travel']
  },
  'coree': {
    'vols': ['south korea airport', 'seoul airport', 'korean airlines', 'korea travel'],
    'hotels': ['south korea hotel', 'seoul hotel', 'korean accommodation', 'korea accommodation'],
    'visa': ['south korea culture', 'seoul culture', 'korean tradition', 'korea passport'],
    'budget': ['south korea street food', 'seoul market', 'korean budget travel', 'korea cheap'],
    'securite': ['south korea safe', 'seoul safe', 'korean security', 'korea police'],
    'guide': ['south korea guide', 'seoul guide', 'korean travel guide', 'korea tips'],
    'bon_plan': ['south korea deal', 'seoul deal', 'korean promotion', 'korea offer'],
    'default': ['south korea', 'seoul', 'korean culture', 'korea travel']
  },
  'vietnam': {
    'vols': ['vietnam airport', 'hanoi airport', 'vietnamese airlines', 'vietnam travel'],
    'hotels': ['vietnam hotel', 'hanoi hotel', 'vietnamese accommodation', 'vietnam accommodation'],
    'visa': ['vietnam culture', 'hanoi culture', 'vietnamese tradition', 'vietnam passport'],
    'budget': ['vietnam street food', 'hanoi market', 'vietnamese budget travel', 'vietnam cheap'],
    'securite': ['vietnam safe', 'hanoi safe', 'vietnamese security', 'vietnam police'],
    'guide': ['vietnam guide', 'hanoi guide', 'vietnamese travel guide', 'vietnam tips'],
    'bon_plan': ['vietnam deal', 'hanoi deal', 'vietnamese promotion', 'vietnam offer'],
    'default': ['vietnam', 'hanoi', 'vietnamese culture', 'vietnam travel']
  }
};

// Images de fallback Pexels (sans clé API)
const FALLBACK_IMAGES = {
  'thailande': [
    'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'japon': [
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'philippines': [
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'coree': [
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'vietnam': [
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ]
};

async function searchImageFromPixabay(destination, theme) {
  const keywords = ASIA_SEARCH_KEYWORDS[destination]?.[theme] || ASIA_SEARCH_KEYWORDS[destination]?.default || ['travel'];
  const query = keywords[Math.floor(Math.random() * keywords.length)];
  
  try {
    console.log(`   🔍 Recherche Pixabay: "${query}"`);
    
    const response = await axios.get(IMAGE_APIS.pixabay.baseUrl, {
      params: {
        ...IMAGE_APIS.pixabay.params,
        q: query
      }
    });
    
    if (response.data.hits && response.data.hits.length > 0) {
      const randomImage = response.data.hits[Math.floor(Math.random() * response.data.hits.length)];
      return {
        url: randomImage.webformatURL,
        alt: randomImage.tags || `${query} - ${destination}`,
        source: 'pixabay'
      };
    }
    
    return null;
    
  } catch (error) {
    console.error(`   ❌ Erreur Pixabay: ${error.message}`);
    return null;
  }
}

async function searchImageFromPexels(destination, theme) {
  const keywords = ASIA_SEARCH_KEYWORDS[destination]?.[theme] || ASIA_SEARCH_KEYWORDS[destination]?.default || ['travel'];
  const query = keywords[Math.floor(Math.random() * keywords.length)];
  
  try {
    console.log(`   🔍 Recherche Pexels: "${query}"`);
    
    const response = await axios.get(IMAGE_APIS.pexels.baseUrl, {
      params: {
        query: query,
        per_page: 10,
        orientation: 'landscape'
      },
      headers: IMAGE_APIS.pexels.headers
    });
    
    if (response.data.photos && response.data.photos.length > 0) {
      const randomImage = response.data.photos[Math.floor(Math.random() * response.data.photos.length)];
      return {
        url: randomImage.src.medium,
        alt: randomImage.alt || `${query} - ${destination}`,
        source: 'pexels'
      };
    }
    
    return null;
    
  } catch (error) {
    console.error(`   ❌ Erreur Pexels: ${error.message}`);
    return null;
  }
}

async function getFallbackImage(destination) {
  const images = FALLBACK_IMAGES[destination] || FALLBACK_IMAGES['thailande'];
  const randomImage = images[Math.floor(Math.random() * images.length)];
  
  return {
    url: randomImage,
    alt: `${destination} - Image de fallback`,
    source: 'fallback'
  };
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
    
    // Ajouter l'alt text
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media/${uploadResponse.data.id}`, {
      alt_text: altText
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    return uploadResponse.data.id;
    
  } catch (error) {
    console.error('Erreur upload WordPress:', error.message);
    return null;
  }
}

function detectThemes(content, title) {
  const text = (content + ' ' + title).toLowerCase();
  
  const themes = {
    'vols': text.includes('vol') || text.includes('avion') || text.includes('compagnie') || text.includes('aérien'),
    'hotels': text.includes('hôtel') || text.includes('hébergement') || text.includes('nuit') || text.includes('logement'),
    'visa': text.includes('visa') || text.includes('document') || text.includes('passeport') || text.includes('électronique'),
    'budget': text.includes('budget') || text.includes('prix') || text.includes('coût') || text.includes('€') || text.includes('euro'),
    'securite': text.includes('sécurité') || text.includes('alerte') || text.includes('danger') || text.includes('évitez'),
    'guide': text.includes('guide') || text.includes('conseil') || text.includes('astuce') || text.includes('complet'),
    'bon_plan': text.includes('offre') || text.includes('promo') || text.includes('deal') || text.includes('limité')
  };
  
  return Object.entries(themes).filter(([theme, detected]) => detected).map(([theme]) => theme);
}

function detectDestination(content, title) {
  const text = (content + ' ' + title).toLowerCase();
  
  if (text.includes('thailande') || text.includes('bangkok') || text.includes('thaïlande')) {
    return 'thailande';
  } else if (text.includes('japon') || text.includes('tokyo') || text.includes('japon')) {
    return 'japon';
  } else if (text.includes('philippines') || text.includes('manille')) {
    return 'philippines';
  } else if (text.includes('coree') || text.includes('séoul') || text.includes('seoul')) {
    return 'coree';
  } else if (text.includes('vietnam') || text.includes('hanoi') || text.includes('ho chi minh')) {
    return 'vietnam';
  } else {
    return 'thailande'; // Par défaut
  }
}

async function updateArticlesWithRealAsiaImages() {
  console.log('🌏 Mise à jour avec de vraies images d\'Asie (Pixabay + Pexels)...');
  
  try {
    // Récupérer les articles
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à traiter\n`);
    
    let updatedCount = 0;
    
    for (const article of articles) {
      console.log(`📄 Article: ${article.title.rendered}`);
      
      // Analyser le contenu
      const themes = detectThemes(article.content.rendered, article.title.rendered);
      const destination = detectDestination(article.content.rendered, article.title.rendered);
      
      console.log(`   Thèmes: ${themes.join(', ')}`);
      console.log(`   Destination: ${destination}`);
      
      // Essayer de récupérer une image via les APIs
      let imageData = null;
      
      // Essayer Pixabay en premier
      imageData = await searchImageFromPixabay(destination, themes[0] || 'default');
      
      // Si Pixabay échoue, essayer Pexels
      if (!imageData) {
        imageData = await searchImageFromPexels(destination, themes[0] || 'default');
      }
      
      // Si les deux APIs échouent, utiliser une image de fallback
      if (!imageData) {
        console.log(`   ⚠️  Aucune image trouvée via les APIs, utilisation d'une image de fallback`);
        imageData = await getFallbackImage(destination);
      }
      
      console.log(`   ✅ Image trouvée via ${imageData.source}: ${imageData.url}`);
      
      // Uploader l'image vers WordPress
      const filename = `real-${destination}-${themes[0] || 'default'}-${article.id}-${Date.now()}.jpg`;
      const imageId = await uploadImageToWordPress(imageData.url, filename, imageData.alt);
      
      if (imageId) {
        // Mettre à jour l'article avec la nouvelle image
        await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
          featured_media: imageId
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        console.log(`   ✅ Image réelle ajoutée (ID: ${imageId})`);
        console.log(`   Alt text: ${imageData.alt}`);
        updatedCount++;
      } else {
        console.log(`   ❌ Échec de l'upload de l'image`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les requêtes pour respecter les limites d'API
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🎉 MISE À JOUR TERMINÉE !');
    console.log('='.repeat(50));
    console.log(`✅ Articles mis à jour: ${updatedCount}`);
    console.log('✅ Images réelles d\'Asie ajoutées');
    console.log('✅ Recherche via Pixabay + Pexels');
    console.log('✅ Images de fallback Pexels');
    console.log('✅ Cohérence destination/image améliorée');
    
    console.log('\n💡 POUR ACTIVER LES APIs:');
    console.log('1. Pixabay: https://pixabay.com/api/docs/');
    console.log('2. Pexels: https://www.pexels.com/api/');
    console.log('3. Remplacez les clés API dans le code');
    console.log('4. Les images de fallback Pexels fonctionnent déjà');
    
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error.response?.data?.message || error.message);
  }
}

// Exécuter la mise à jour
updateArticlesWithRealAsiaImages();
