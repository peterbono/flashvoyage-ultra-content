import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function analyzeExistingArticles() {
  console.log('🔍 Analyse des articles existants...');
  
  try {
    // Récupérer tous les articles
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    console.log(`📊 ${articles.length} articles trouvés`);
    
    // Analyser chaque article
    for (const article of articles) {
      console.log(`\n📄 Article ID: ${article.id}`);
      console.log(`   Titre: ${article.title.rendered}`);
      console.log(`   Slug: ${article.slug}`);
      console.log(`   URL: ${article.link}`);
      console.log(`   Featured Media: ${article.featured_media}`);
      console.log(`   Status: ${article.status}`);
      console.log(`   Date: ${article.date}`);
      
      // Vérifier si l'article a une image featured
      if (article.featured_media > 0) {
        try {
          const mediaResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/media/${article.featured_media}`, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          console.log(`   Image: ${mediaResponse.data.source_url}`);
          console.log(`   Image Alt: ${mediaResponse.data.alt_text || 'Pas d\'alt text'}`);
        } catch (error) {
          console.log(`   ❌ Erreur image: ${error.message}`);
        }
      } else {
        console.log(`   ⚠️  Pas d'image featured`);
      }
      
      // Vérifier le contenu pour des images
      const content = article.content.rendered;
      const imageMatches = content.match(/<img[^>]+src="([^"]+)"/g);
      if (imageMatches) {
        console.log(`   Images dans le contenu: ${imageMatches.length}`);
        imageMatches.forEach((img, index) => {
          const srcMatch = img.match(/src="([^"]+)"/);
          if (srcMatch) {
            console.log(`     ${index + 1}. ${srcMatch[1]}`);
          }
        });
      }
    }
    
    // Vérifier les paramètres de permaliens
    console.log('\n🔗 Vérification des permaliens...');
    
    try {
      const settingsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/settings`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      console.log('Paramètres WordPress:');
      console.log(`   Site URL: ${settingsResponse.data.url}`);
      console.log(`   Home URL: ${settingsResponse.data.home}`);
      
    } catch (error) {
      console.log(`❌ Erreur paramètres: ${error.message}`);
    }
    
    // Tester l'accès à un article
    console.log('\n🧪 Test d\'accès aux articles...');
    
    if (articles.length > 0) {
      const testArticle = articles[0];
      console.log(`Test d'accès à: ${testArticle.link}`);
      
      try {
        const testResponse = await axios.get(testArticle.link, {
          timeout: 10000
        });
        
        if (testResponse.status === 200) {
          console.log('✅ Article accessible');
        } else {
          console.log(`❌ Erreur HTTP: ${testResponse.status}`);
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
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse:', error.response?.data?.message || error.message);
  }
}

// Exécuter l'analyse
analyzeExistingArticles();

