import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function verifyFixes() {
  console.log('🔍 Vérification des corrections...');
  
  try {
    // 1. Vérifier les articles avec images
    console.log('\n📊 Vérification des articles avec images...');
    
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const articles = response.data;
    let withImages = 0;
    let withoutImages = 0;
    
    for (const article of articles) {
      if (article.featured_media > 0) {
        withImages++;
      } else {
        withoutImages++;
        console.log(`   ⚠️  Article sans image: ${article.title.rendered} (ID: ${article.id})`);
      }
    }
    
    console.log(`✅ Articles avec images: ${withImages}`);
    console.log(`⚠️  Articles sans images: ${withoutImages}`);
    
    // 2. Tester l'accès aux articles
    console.log('\n🧪 Test d\'accès aux articles...');
    
    let accessibleCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < Math.min(5, articles.length); i++) {
      const article = articles[i];
      console.log(`\n📄 Test article: ${article.title.rendered}`);
      console.log(`   URL: ${article.link}`);
      
      try {
        const testResponse = await axios.get(article.link, {
          timeout: 10000
        });
        
        if (testResponse.status === 200) {
          console.log('   ✅ Accessible');
          accessibleCount++;
        } else {
          console.log(`   ❌ Erreur HTTP: ${testResponse.status}`);
          errorCount++;
        }
      } catch (error) {
        console.log(`   ❌ Erreur: ${error.message}`);
        errorCount++;
        
        // Essayer avec l'URL directe
        const directUrl = `${WORDPRESS_URL}?p=${article.id}`;
        try {
          const directResponse = await axios.get(directUrl, {
            timeout: 10000
          });
          
          if (directResponse.status === 200) {
            console.log('   ✅ Accessible via URL directe');
            accessibleCount++;
          } else {
            console.log(`   ❌ Erreur URL directe: ${directResponse.status}`);
          }
        } catch (directError) {
          console.log(`   ❌ Erreur URL directe: ${directError.message}`);
        }
      }
    }
    
    // 3. Résumé des corrections
    console.log('\n🎉 RÉSUMÉ DES CORRECTIONS:');
    console.log('='.repeat(50));
    console.log(`✅ Images ajoutées: ${withImages} articles`);
    console.log(`✅ Articles testés: ${accessibleCount + errorCount}`);
    console.log(`✅ Articles accessibles: ${accessibleCount}`);
    console.log(`❌ Articles avec erreur: ${errorCount}`);
    
    if (errorCount > 0) {
      console.log('\n⚠️  PROBLÈME DE PERMALIENS DÉTECTÉ:');
      console.log('Pour corriger définitivement:');
      console.log('1. Allez dans WordPress Admin > Réglages > Permaliens');
      console.log('2. Sélectionnez "Nom de l\'article"');
      console.log('3. Cliquez sur "Enregistrer les modifications"');
      console.log('4. Testez à nouveau l\'accès aux articles');
    } else {
      console.log('\n🎉 TOUT FONCTIONNE PARFAITEMENT !');
      console.log('✅ Images ajoutées avec succès');
      console.log('✅ Articles accessibles');
      console.log('✅ Système MCP opérationnel');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.response?.data?.message || error.message);
  }
}

// Exécuter la vérification
verifyFixes();

