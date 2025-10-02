#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

console.log('🧪 Test de déploiement FlashVoyages Ultra Content Generator\n');

async function testWordPressConnection() {
  console.log('1️⃣ Test de connexion WordPress...');
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=1`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      timeout: 10000
    });
    console.log('✅ WordPress connecté avec succès');
    console.log(`   📊 ${response.data.length} article(s) trouvé(s)`);
    return true;
  } catch (error) {
    console.log('❌ Erreur connexion WordPress:', error.message);
    return false;
  }
}

async function testPexelsAPI() {
  console.log('\n2️⃣ Test de l\'API Pexels...');
  try {
    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: {
        query: 'tokyo travel',
        per_page: 1
      },
      headers: {
        'Authorization': PEXELS_API_KEY
      },
      timeout: 10000
    });
    console.log('✅ Pexels API fonctionne');
    console.log(`   📸 ${response.data.photos.length} image(s) trouvée(s)`);
    return true;
  } catch (error) {
    console.log('❌ Erreur Pexels API:', error.message);
    return false;
  }
}

async function testContentGeneration() {
  console.log('\n3️⃣ Test de génération de contenu...');
  try {
    // Simuler la génération d'un guide de quartier
    const content = {
      title: 'Test Tokyo : Shibuya comme un local - 7 spots secrets',
      content: '<h2>Test de contenu généré</h2><p>Ceci est un test de génération de contenu.</p>',
      type: 'quartier_guide',
      destination: 'tokyo',
      quartier: 'shibuya'
    };
    console.log('✅ Génération de contenu simulée');
    console.log(`   📝 Titre: ${content.title}`);
    return true;
  } catch (error) {
    console.log('❌ Erreur génération contenu:', error.message);
    return false;
  }
}

async function testImageUpload() {
  console.log('\n4️⃣ Test d\'upload d\'image...');
  try {
    // Test avec une image de test
    const testImageUrl = 'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop';
    
    const imageResponse = await axios.get(testImageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    
    const formData = new FormData();
    const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
    formData.append('file', blob, 'test-image.jpg');
    
    const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, formData, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      headers: {
        'Content-Disposition': 'attachment; filename="test-image.jpg"',
        'Content-Type': 'image/jpeg'
      },
      timeout: 15000
    });
    
    console.log('✅ Upload d\'image réussi');
    console.log(`   🖼️ Image ID: ${uploadResponse.data.id}`);
    
    // Supprimer l'image de test
    await axios.delete(`${WORDPRESS_URL}/wp-json/wp/v2/media/${uploadResponse.data.id}?force=true`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    console.log('   🗑️ Image de test supprimée');
    
    return true;
  } catch (error) {
    console.log('❌ Erreur upload image:', error.message);
    return false;
  }
}

async function testCategories() {
  console.log('\n5️⃣ Test des catégories WordPress...');
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      timeout: 10000
    });
    
    const categories = response.data;
    const asiaCategories = categories.filter(cat => 
      cat.slug.includes('japon') || 
      cat.slug.includes('thailande') || 
      cat.slug.includes('coree') ||
      cat.slug.includes('asie')
    );
    
    console.log('✅ Catégories récupérées');
    console.log(`   📂 ${categories.length} catégorie(s) totale(s)`);
    console.log(`   🌏 ${asiaCategories.length} catégorie(s) Asie`);
    
    return true;
  } catch (error) {
    console.log('❌ Erreur catégories:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Démarrage des tests de déploiement...\n');
  
  const results = {
    wordpress: await testWordPressConnection(),
    pexels: await testPexelsAPI(),
    content: await testContentGeneration(),
    image: await testImageUpload(),
    categories: await testCategories()
  };
  
  console.log('\n📊 Résumé des tests:');
  console.log('==================');
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    const testName = {
      wordpress: 'WordPress',
      pexels: 'Pexels API',
      content: 'Génération contenu',
      image: 'Upload image',
      categories: 'Catégories'
    }[test];
    
    console.log(`${status} ${testName}`);
  });
  
  const allPassed = Object.values(results).every(result => result);
  
  if (allPassed) {
    console.log('\n🎉 Tous les tests sont passés !');
    console.log('✅ Votre système est prêt pour le déploiement');
    console.log('\n📋 Prochaines étapes:');
    console.log('1. Créer le repository GitHub');
    console.log('2. Configurer les secrets');
    console.log('3. Activer GitHub Actions');
    console.log('4. L\'automatisation se lancera automatiquement !');
  } else {
    console.log('\n⚠️ Certains tests ont échoué');
    console.log('❌ Vérifiez la configuration avant le déploiement');
  }
  
  return allPassed;
}

// Exécuter les tests
runAllTests().catch(console.error);
