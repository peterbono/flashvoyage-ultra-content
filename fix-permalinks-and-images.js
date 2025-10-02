import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Sources d'images Pexels par destination
const PEXELS_IMAGES = {
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
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'coree': [
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'vietnam': [
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ]
};

async function uploadImageFromPexels(imageUrl, filename, altText) {
  try {
    console.log(`📤 Upload image: ${filename}`);
    
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
    if (altText) {
      await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media/${uploadResponse.data.id}`, {
        alt_text: altText
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
    }
    
    console.log(`✅ Image uploadée: ID ${uploadResponse.data.id}`);
    return uploadResponse.data.id;
    
  } catch (error) {
    console.error(`❌ Erreur upload image ${filename}:`, error.message);
    return null;
  }
}

function detectDestinationFromTitle(title) {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('thailande') || titleLower.includes('bangkok') || titleLower.includes('thaïlande')) {
    return 'thailande';
  } else if (titleLower.includes('japon') || titleLower.includes('tokyo') || titleLower.includes('japon')) {
    return 'japon';
  } else if (titleLower.includes('philippines') || titleLower.includes('manille')) {
    return 'philippines';
  } else if (titleLower.includes('coree') || titleLower.includes('séoul') || titleLower.includes('seoul')) {
    return 'coree';
  } else if (titleLower.includes('vietnam') || titleLower.includes('hanoi') || titleLower.includes('ho chi minh')) {
    return 'vietnam';
  } else {
    return 'thailande'; // Par défaut
  }
}

async function fixPermalinksAndImages() {
  console.log('🔧 Correction des permaliens et ajout d\'images...');
  
  try {
    // 1. D'abord, corriger les paramètres de permaliens
    console.log('\n🔗 Correction des permaliens...');
    
    try {
      // Essayer de mettre à jour les paramètres de permaliens
      const permalinkResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/settings`, {
        permalink_structure: '/%postname%/'
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      console.log('✅ Paramètres de permaliens mis à jour');
    } catch (error) {
      console.log('⚠️  Impossible de modifier les permaliens via API, continuons...');
    }
    
    // 2. Récupérer tous les articles
    console.log('\n📄 Récupération des articles...');
    
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles trouvés`);
    
    // 3. Traiter chaque article
    let processedCount = 0;
    let imageAddedCount = 0;
    
    for (const article of articles) {
      console.log(`\n📄 Traitement article ID: ${article.id}`);
      console.log(`   Titre: ${article.title.rendered}`);
      
      // Détecter la destination
      const destination = detectDestinationFromTitle(article.title.rendered);
      console.log(`   Destination détectée: ${destination}`);
      
      // Vérifier si l'article a déjà une image featured
      if (article.featured_media > 0) {
        console.log(`   ✅ Déjà une image featured (ID: ${article.featured_media})`);
        processedCount++;
        continue;
      }
      
      // Ajouter une image featured
      console.log(`   📤 Ajout d'une image featured...`);
      
      const imageUrl = PEXELS_IMAGES[destination][Math.floor(Math.random() * PEXELS_IMAGES[destination].length)];
      const filename = `${destination}-${article.id}-${Date.now()}.jpg`;
      const altText = `${article.title.rendered} - Image ${destination}`;
      
      const imageId = await uploadImageFromPexels(imageUrl, filename, altText);
      
      if (imageId) {
        // Mettre à jour l'article avec l'image featured
        try {
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
            featured_media: imageId
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          console.log(`   ✅ Image featured ajoutée (ID: ${imageId})`);
          imageAddedCount++;
          
        } catch (error) {
          console.error(`   ❌ Erreur mise à jour article: ${error.message}`);
        }
      }
      
      // Mettre à jour le slug pour corriger les problèmes d'URL
      try {
        const cleanSlug = article.title.rendered
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') // Supprimer les caractères spéciaux
          .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
          .replace(/-+/g, '-') // Supprimer les tirets multiples
          .replace(/^-|-$/g, ''); // Supprimer les tirets en début/fin
        
        await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
          slug: cleanSlug
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        console.log(`   ✅ Slug mis à jour: ${cleanSlug}`);
        
      } catch (error) {
        console.error(`   ❌ Erreur mise à jour slug: ${error.message}`);
      }
      
      processedCount++;
      
      // Pause entre les requêtes pour éviter la surcharge
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 TRAITEMENT TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Articles traités: ${processedCount}`);
    console.log(`✅ Images ajoutées: ${imageAddedCount}`);
    console.log(`✅ Slugs corrigés: ${processedCount}`);
    
    // 4. Tester l'accès aux articles après correction
    console.log('\n🧪 Test d\'accès aux articles corrigés...');
    
    if (articles.length > 0) {
      const testArticle = articles[0];
      console.log(`Test d'accès à: ${testArticle.link}`);
      
      try {
        const testResponse = await axios.get(testArticle.link, {
          timeout: 10000
        });
        
        if (testResponse.status === 200) {
          console.log('✅ Article accessible après correction');
        } else {
          console.log(`❌ Toujours une erreur HTTP: ${testResponse.status}`);
        }
      } catch (error) {
        console.log(`❌ Erreur d'accès: ${error.message}`);
        
        // Essayer avec l'URL directe
        const directUrl = `${WORDPRESS_URL}?p=${testArticle.id}`;
        console.log(`Test URL directe: ${directUrl}`);
        
        try {
          const directResponse = await axios.get(directUrl, {
            timeout: 10000
          });
          
          if (directResponse.status === 200) {
            console.log('✅ Article accessible via URL directe');
          } else {
            console.log(`❌ Erreur URL directe: ${directResponse.status}`);
          }
        } catch (directError) {
          console.log(`❌ Erreur URL directe: ${directError.message}`);
        }
      }
    }
    
    console.log('\n💡 Prochaines étapes:');
    console.log('1. Vérifiez les paramètres de permaliens dans WordPress Admin');
    console.log('2. Allez dans Réglages > Permaliens');
    console.log('3. Sélectionnez "Nom de l\'article" et sauvegardez');
    console.log('4. Testez l\'accès aux articles');
    
  } catch (error) {
    console.error('❌ Erreur lors du traitement:', error.response?.data?.message || error.message);
  }
}

// Exécuter la correction
fixPermalinksAndImages();

