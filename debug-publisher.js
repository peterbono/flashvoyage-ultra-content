import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function debugPublisher() {
  console.log('🔍 Debug du système de publication...\n');
  
  try {
    // Test simple de création d'article
    console.log('📝 Test de création d\'article simple...');
    
    const testArticle = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: 'Test Ultra Content Generator',
      content: '<p>Ceci est un test du générateur de contenu ultra-spécialisé.</p>',
      status: 'publish'
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ Article de test créé (ID: ' + testArticle.data.id + ')');
    
    // Vérifier les catégories disponibles
    console.log('\n📂 Vérification des catégories...');
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('Catégories disponibles:');
    for (const category of categoriesResponse.data) {
      console.log(`   - ${category.name} (${category.slug}) - ID: ${category.id}`);
    }
    
    // Test avec catégorie
    console.log('\n📝 Test avec catégorie...');
    const categoryTest = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: 'Test avec catégorie',
      content: '<p>Test avec catégorie guides-pratiques.</p>',
      status: 'publish',
      categories: [58] // ID de guides-pratiques
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ Article avec catégorie créé (ID: ' + categoryTest.data.id + ')');
    
    // Test avec tags
    console.log('\n📝 Test avec tags...');
    const tagTest = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      title: 'Test avec tags',
      content: '<p>Test avec tags.</p>',
      status: 'publish',
      tags: ['test', 'ultra-content']
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ Article avec tags créé (ID: ' + tagTest.data.id + ')');
    
    console.log('\n🎉 DEBUG TERMINÉ !');
    console.log('✅ Création d\'articles fonctionne');
    console.log('✅ Catégories accessibles');
    console.log('✅ Tags fonctionnent');
    
  } catch (error) {
    console.error('❌ Erreur debug:', error.response?.data || error.message);
  }
}

// Exécuter le debug
debugPublisher();
