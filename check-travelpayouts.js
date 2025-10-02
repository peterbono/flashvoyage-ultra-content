import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function checkTravelPayouts() {
  console.log('🔍 Vérification du plugin TravelPayouts...\n');
  
  try {
    // Vérifier les plugins actifs
    const pluginsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/plugins`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('📦 Plugins trouvés:');
    for (const plugin of pluginsResponse.data) {
      if (plugin.name.toLowerCase().includes('travel') || 
          plugin.name.toLowerCase().includes('payout') ||
          plugin.name.toLowerCase().includes('affiliate')) {
        console.log(`   ✅ ${plugin.name} - ${plugin.status}`);
      }
    }
    
    // Vérifier les shortcodes disponibles
    console.log('\n🔗 Vérification des shortcodes TravelPayouts...');
    
    // Tester quelques shortcodes courants
    const commonShortcodes = [
      'tp_affiliate_link',
      'tp_hotel',
      'tp_flight',
      'tp_car_rental',
      'tp_insurance',
      'travelpayouts',
      'tp_widget'
    ];
    
    for (const shortcode of commonShortcodes) {
      try {
        // Créer un post de test pour vérifier le shortcode
        const testPost = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
          title: `Test shortcode ${shortcode}`,
          content: `[${shortcode}]`,
          status: 'draft'
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        // Récupérer le contenu rendu
        const renderedPost = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${testPost.data.id}`, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
        if (renderedPost.data.content.rendered.includes('[') && 
            !renderedPost.data.content.rendered.includes(`[${shortcode}]`)) {
          console.log(`   ✅ ${shortcode} - Fonctionne`);
        } else {
          console.log(`   ❌ ${shortcode} - Non reconnu`);
        }
        
        // Supprimer le post de test
        await axios.delete(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${testPost.data.id}?force=true`, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        
      } catch (error) {
        console.log(`   ❌ ${shortcode} - Erreur: ${error.message}`);
      }
    }
    
    // Vérifier les options du plugin
    console.log('\n⚙️ Vérification des options TravelPayouts...');
    try {
      const optionsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/options`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      const options = optionsResponse.data;
      const travelOptions = Object.keys(options).filter(key => 
        key.toLowerCase().includes('travel') || 
        key.toLowerCase().includes('payout') ||
        key.toLowerCase().includes('affiliate')
      );
      
      if (travelOptions.length > 0) {
        console.log('   Options TravelPayouts trouvées:');
        for (const option of travelOptions) {
          console.log(`   - ${option}`);
        }
      } else {
        console.log('   Aucune option TravelPayouts trouvée via API');
      }
      
    } catch (error) {
      console.log('   ❌ Impossible d\'accéder aux options');
    }
    
    console.log('\n🎯 Recommandations:');
    console.log('1. Vérifiez dans l\'admin WordPress > Plugins');
    console.log('2. Allez dans TravelPayouts > Settings pour configurer');
    console.log('3. Testez les shortcodes dans un post');
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.response?.data?.message || error.message);
  }
}

// Exécuter la vérification
checkTravelPayouts();

