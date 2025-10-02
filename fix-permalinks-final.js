import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function fixPermalinksFinal() {
  console.log('🔧 Correction finale des permaliens...');
  
  try {
    // 1. Vérifier les paramètres actuels
    console.log('\n📊 Vérification des paramètres actuels...');
    
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
    
    // 2. Essayer de corriger les permaliens via l'API
    console.log('\n🔗 Correction des permaliens via API...');
    
    try {
      const permalinkResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/settings`, {
        permalink_structure: '/%postname%/'
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      console.log('✅ Paramètres de permaliens mis à jour via API');
    } catch (error) {
      console.log('⚠️  Impossible de modifier les permaliens via API');
      console.log(`   Erreur: ${error.response?.data?.message || error.message}`);
    }
    
    // 3. Créer un article de test avec un slug simple
    console.log('\n📝 Création d\'un article de test...');
    
    const testArticle = {
      title: 'Test Permaliens FlashVoyages',
      content: 'Article de test pour vérifier le fonctionnement des permaliens.',
      status: 'publish',
      slug: 'test-permalinks-flashvoyages'
    };
    
    try {
      const testResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, testArticle, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      console.log('✅ Article de test créé');
      console.log(`   ID: ${testResponse.data.id}`);
      console.log(`   Slug: ${testResponse.data.slug}`);
      console.log(`   URL: ${testResponse.data.link}`);
      
      // Tester l'accès à cet article
      console.log('\n🧪 Test d\'accès à l\'article de test...');
      
      try {
        const accessTest = await axios.get(testResponse.data.link, {
          timeout: 10000
        });
        
        if (accessTest.status === 200) {
          console.log('✅ Article de test accessible !');
        } else {
          console.log(`❌ Erreur HTTP: ${accessTest.status}`);
        }
      } catch (accessError) {
        console.log(`❌ Erreur d'accès: ${accessError.message}`);
        
        // Essayer avec l'URL directe
        const directUrl = `${WORDPRESS_URL}?p=${testResponse.data.id}`;
        console.log(`Test URL directe: ${directUrl}`);
        
        try {
          const directTest = await axios.get(directUrl, {
            timeout: 10000
          });
          
          if (directTest.status === 200) {
            console.log('✅ Article accessible via URL directe');
          } else {
            console.log(`❌ Erreur URL directe: ${directTest.status}`);
          }
        } catch (directError) {
          console.log(`❌ Erreur URL directe: ${directError.message}`);
        }
      }
      
    } catch (error) {
      console.error(`❌ Erreur création article test: ${error.message}`);
    }
    
    // 4. Instructions pour la correction manuelle
    console.log('\n📋 INSTRUCTIONS POUR CORRIGER LES PERMALIENS:');
    console.log('='.repeat(60));
    console.log('1. Connectez-vous à votre WordPress Admin');
    console.log('2. Allez dans "Réglages" > "Permaliens"');
    console.log('3. Sélectionnez "Nom de l\'article"');
    console.log('4. Cliquez sur "Enregistrer les modifications"');
    console.log('5. Testez l\'accès aux articles');
    console.log('');
    console.log('Si le problème persiste:');
    console.log('- Vérifiez que le fichier .htaccess est accessible');
    console.log('- Vérifiez les permissions du serveur');
    console.log('- Contactez votre hébergeur si nécessaire');
    
  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error.response?.data?.message || error.message);
  }
}

// Exécuter la correction
fixPermalinksFinal();

