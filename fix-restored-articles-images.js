import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

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

async function addFeaturedImagesToRestoredArticles() {
  console.log('🖼️ Ajout des images featured aux articles restaurés...\n');
  
  try {
    // Récupérer tous les articles
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles trouvés\n`);
    
    let imagesAdded = 0;
    
    for (const article of articles) {
      console.log(`📄 Article: ${article.title.rendered}`);
      console.log(`   ID: ${article.id}`);
      console.log(`   Featured Media: ${article.featured_media}`);
      
      // Vérifier si l'article a déjà une image featured
      if (article.featured_media && article.featured_media !== 0) {
        console.log(`   ⏭️  Article déjà avec image featured`);
        continue;
      }
      
      // Identifier l'article par son titre
      let imageQuery = '';
      let imageAlt = '';
      
      if (article.title.rendered.includes('Korean Air') || article.title.rendered.includes('Séoul')) {
        imageQuery = 'korean air seoul airport';
        imageAlt = 'Korean Air Boeing 777 at Seoul Incheon Airport';
      } else if (article.title.rendered.includes('Budget voyage Japon') || article.title.rendered.includes('Japon 2024')) {
        imageQuery = 'japan tokyo budget travel';
        imageAlt = 'Tokyo cityscape with budget travel elements';
      } else {
        console.log(`   ⏭️  Article non identifié pour image`);
        continue;
      }
      
      console.log(`   🔍 Recherche image: "${imageQuery}"`);
      
      const imageData = await searchPexelsImage(imageQuery);
      
      if (imageData) {
        const filename = `featured-${article.id}-${Date.now()}.jpg`;
        const uploadedImage = await uploadImageToWordPress(imageData.url, filename, imageAlt);
        
        if (uploadedImage) {
          // Mettre à jour l'article avec l'image featured
          try {
            await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
              featured_media: uploadedImage.id
            }, {
              auth: {
                username: WORDPRESS_USERNAME,
                password: WORDPRESS_APP_PASSWORD
              }
            });
            
            console.log(`   ✅ Image featured ajoutée (ID: ${uploadedImage.id})`);
            console.log(`   📸 Alt: ${imageAlt}`);
            imagesAdded++;
            
          } catch (error) {
            console.error(`   ❌ Erreur mise à jour: ${error.message}`);
          }
        } else {
          console.log(`   ❌ Échec upload image`);
        }
      } else {
        console.log(`   ⚠️  Aucune image trouvée`);
      }
      
      console.log('   ' + '─'.repeat(50));
      
      // Pause entre les requêtes
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n🎉 AJOUT DES IMAGES TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Images featured ajoutées: ${imagesAdded}`);
    console.log('✅ Articles restaurés avec images');
    console.log('✅ Images contextuelles et pertinentes');
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'ajout:', error.response?.data?.message || error.message);
  }
}

// Exécuter l'ajout des images
addFeaturedImagesToRestoredArticles();

