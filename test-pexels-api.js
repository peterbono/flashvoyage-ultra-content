import axios from 'axios';

const PEXELS_API_KEY = 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

async function testPexelsAPI() {
  console.log('🔑 Test de la clé API Pexels...\n');
  
  const testQueries = [
    'thailand temple',
    'japan tokyo',
    'philippines islands',
    'south korea seoul',
    'vietnam hanoi'
  ];
  
  for (const query of testQueries) {
    try {
      console.log(`🔍 Test: "${query}"`);
      
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
        const photo = response.data.photos[0];
        console.log(`   ✅ Trouvé: ${photo.alt || 'Sans description'}`);
        console.log(`   📸 URL: ${photo.src.medium}`);
        console.log(`   👤 Photographe: ${photo.photographer}`);
        console.log(`   🔗 Lien: ${photo.url}`);
      } else {
        console.log(`   ⚠️  Aucune image trouvée`);
      }
      
    } catch (error) {
      console.log(`   ❌ Erreur: ${error.response?.data?.message || error.message}`);
    }
    
    console.log('   ' + '─'.repeat(50));
    
    // Pause entre les requêtes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🎉 Test terminé !');
  console.log('💡 Si vous voyez des images, votre clé API fonctionne parfaitement !');
}

testPexelsAPI();

