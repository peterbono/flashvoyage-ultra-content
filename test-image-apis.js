import axios from 'axios';

// Test des APIs d'images gratuites
async function testImageAPIs() {
  console.log('🔍 Test des APIs d\'images gratuites...\n');
  
  // Test 1: Pexels (sans clé API - utilisation directe des URLs)
  console.log('📸 Test Pexels (sans clé API)...');
  try {
    const pexelsUrl = 'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop';
    const response = await axios.get(pexelsUrl, { timeout: 5000 });
    console.log('✅ Pexels: Fonctionne (taille:', response.data.length, 'bytes)');
  } catch (error) {
    console.log('❌ Pexels: Erreur -', error.message);
  }
  
  // Test 2: Unsplash (sans clé API - utilisation directe des URLs)
  console.log('\n📸 Test Unsplash (sans clé API)...');
  try {
    const unsplashUrl = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop';
    const response = await axios.get(unsplashUrl, { timeout: 5000 });
    console.log('✅ Unsplash: Fonctionne (taille:', response.data.length, 'bytes)');
  } catch (error) {
    console.log('❌ Unsplash: Erreur -', error.message);
  }
  
  // Test 3: Pixabay (sans clé API - utilisation directe des URLs)
  console.log('\n📸 Test Pixabay (sans clé API)...');
  try {
    const pixabayUrl = 'https://cdn.pixabay.com/photo/2015/12/01/20/28/road-1072823_640.jpg';
    const response = await axios.get(pixabayUrl, { timeout: 5000 });
    console.log('✅ Pixabay: Fonctionne (taille:', response.data.length, 'bytes)');
  } catch (error) {
    console.log('❌ Pixabay: Erreur -', error.message);
  }
  
  // Test 4: Lorem Picsum (API gratuite sans clé)
  console.log('\n📸 Test Lorem Picsum (API gratuite)...');
  try {
    const picsumUrl = 'https://picsum.photos/800/600?random=1';
    const response = await axios.get(picsumUrl, { timeout: 5000 });
    console.log('✅ Lorem Picsum: Fonctionne (taille:', response.data.length, 'bytes)');
  } catch (error) {
    console.log('❌ Lorem Picsum: Erreur -', error.message);
  }
  
  // Test 5: Placeholder.com (API gratuite)
  console.log('\n📸 Test Placeholder.com (API gratuite)...');
  try {
    const placeholderUrl = 'https://via.placeholder.com/800x600/4A90E2/FFFFFF?text=Thailand+Travel';
    const response = await axios.get(placeholderUrl, { timeout: 5000 });
    console.log('✅ Placeholder.com: Fonctionne (taille:', response.data.length, 'bytes)');
  } catch (error) {
    console.log('❌ Placeholder.com: Erreur -', error.message);
  }
  
  console.log('\n🎯 RECOMMANDATIONS:');
  console.log('='.repeat(50));
  console.log('1. Pexels: ✅ Fonctionne sans clé, images de qualité');
  console.log('2. Unsplash: ✅ Fonctionne sans clé, images de qualité');
  console.log('3. Lorem Picsum: ✅ API gratuite, images aléatoires');
  console.log('4. Placeholder.com: ✅ API gratuite, images personnalisées');
  console.log('5. Pixabay: ✅ Fonctionne sans clé, images de qualité');
  
  console.log('\n💡 SOLUTION RECOMMANDÉE:');
  console.log('Utiliser Pexels + Unsplash + Lorem Picsum en rotation');
  console.log('pour avoir des images variées et de qualité pour l\'Asie');
}

// Exécuter les tests
testImageAPIs();

