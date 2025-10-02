import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

// Mots-clés pour images contextuelles simples
const IMAGE_KEYWORDS = {
  'thailande': {
    'culture': ['thailand temple', 'bangkok temple', 'thai culture'],
    'nourriture': ['thai street food', 'bangkok market', 'pad thai'],
    'paysage': ['thailand beach', 'bangkok skyline', 'thailand nature'],
    'ville': ['bangkok city', 'thailand urban', 'bangkok street']
  },
  'japon': {
    'culture': ['japan temple', 'tokyo temple', 'japanese culture'],
    'nourriture': ['japanese food', 'tokyo street food', 'sushi'],
    'paysage': ['japan mountain', 'tokyo skyline', 'mount fuji'],
    'ville': ['tokyo city', 'japan urban', 'tokyo street']
  },
  'philippines': {
    'culture': ['philippines culture', 'manila culture', 'filipino tradition'],
    'nourriture': ['filipino food', 'manila street food', 'philippines cuisine'],
    'paysage': ['philippines islands', 'manila bay', 'philippines beach'],
    'ville': ['manila city', 'philippines urban', 'manila street']
  },
  'coree': {
    'culture': ['south korea culture', 'seoul culture', 'korean palace'],
    'nourriture': ['korean food', 'seoul street food', 'korean cuisine'],
    'paysage': ['south korea mountain', 'seoul skyline', 'korean landscape'],
    'ville': ['seoul city', 'korea urban', 'seoul street']
  },
  'vietnam': {
    'culture': ['vietnam culture', 'hanoi culture', 'vietnamese tradition'],
    'nourriture': ['vietnamese food', 'hanoi street food', 'vietnamese cuisine'],
    'paysage': ['vietnam landscape', 'hanoi city', 'vietnam mountains'],
    'ville': ['hanoi city', 'vietnam urban', 'hanoi street']
  }
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
    return 'thailande';
  }
}

function detectContentType(content) {
  const text = content.toLowerCase();
  
  if (text.includes('temple') || text.includes('culture') || text.includes('tradition')) {
    return 'culture';
  } else if (text.includes('manger') || text.includes('cuisine') || text.includes('restaurant') || text.includes('nourriture')) {
    return 'nourriture';
  } else if (text.includes('montagne') || text.includes('plage') || text.includes('nature') || text.includes('paysage')) {
    return 'paysage';
  } else if (text.includes('ville') || text.includes('rue') || text.includes('urbain') || text.includes('centre')) {
    return 'ville';
  } else {
    return 'culture';
  }
}

function shouldAddImage(content, title) {
  const text = (content + ' ' + title).toLowerCase();
  
  // Ajouter une image si l'article parle de :
  return text.includes('temple') || 
         text.includes('cuisine') || 
         text.includes('plage') || 
         text.includes('ville') || 
         text.includes('culture') || 
         text.includes('paysage') ||
         text.includes('nourriture') ||
         text.includes('montagne');
}

async function addSimpleImageToContent(article) {
  console.log(`\n📄 Article: ${article.title.rendered}`);
  
  const destination = detectDestination(article.content.rendered, article.title.rendered);
  const contentType = detectContentType(article.content.rendered);
  
  console.log(`   Destination: ${destination}, Type: ${contentType}`);
  
  // Vérifier si on doit ajouter une image
  if (!shouldAddImage(article.content.rendered, article.title.rendered)) {
    console.log(`   ⏭️  Pas d'image nécessaire pour cet article`);
    return;
  }
  
  // Vérifier si l'article a déjà des images
  if (article.content.rendered.includes('<img')) {
    console.log(`   ⏭️  Article déjà avec images`);
    return;
  }
  
  const keywords = IMAGE_KEYWORDS[destination]?.[contentType] || IMAGE_KEYWORDS[destination]?.culture || ['travel'];
  const query = keywords[Math.floor(Math.random() * keywords.length)];
  
  console.log(`   🔍 Recherche: "${query}"`);
  
  const imageData = await searchPexelsImage(query);
  
  if (imageData) {
    const filename = `content-${destination}-${contentType}-${article.id}-${Date.now()}.jpg`;
    const uploadedImage = await uploadImageToWordPress(imageData.url, filename, imageData.alt);
    
    if (uploadedImage) {
      // Image simple centrée
      const imageHtml = `
        <div style="text-align: center; margin: 20px 0;">
          <img src="${uploadedImage.source_url}" alt="${imageData.alt}" style="width: 100%; max-width: 600px; height: auto; border-radius: 8px;">
        </div>
      `;
      
      // Insérer l'image après le premier paragraphe
      const firstParagraphEnd = article.content.rendered.indexOf('</p>');
      if (firstParagraphEnd !== -1) {
        const enhancedContent = article.content.rendered.slice(0, firstParagraphEnd + 4) + 
                              imageHtml + 
                              article.content.rendered.slice(firstParagraphEnd + 4);
        
        // Mettre à jour l'article
        try {
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
            content: enhancedContent
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          console.log(`   ✅ Image ajoutée: ${imageData.alt}`);
        } catch (error) {
          console.error(`   ❌ Erreur mise à jour: ${error.message}`);
        }
      }
    }
  } else {
    console.log(`   ⚠️  Aucune image trouvée`);
  }
}

async function enhanceArticlesSimply() {
  console.log('🖼️ Ajout d\'images pertinentes dans le contenu...\n');
  
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles à vérifier\n`);
    
    let imagesAdded = 0;
    
    for (const article of articles) {
      await addSimpleImageToContent(article);
      
      if (article.content.rendered.includes('<img')) {
        imagesAdded++;
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les articles
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log('\n🎉 ENRICHISSEMENT TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Images ajoutées: ${imagesAdded}`);
    console.log('✅ Images pertinentes et contextuelles');
    console.log('✅ Mise en page simple et propre');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'enrichissement:', error.response?.data?.message || error.message);
  }
}

// Exécuter l'enrichissement simple
enhanceArticlesSimply();

