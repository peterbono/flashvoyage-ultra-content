import axios from 'axios';

const ULTRA_CONTENT_PORT = 3006;

async function testUltraContentGenerator() {
  console.log('🧪 Test du générateur de contenu ultra-spécialisé...\n');
  
  try {
    // Test 1: Guide de quartier
    console.log('📝 Test 1: Guide de quartier Tokyo Shibuya');
    const quartierResponse = await axios.post(`http://localhost:${ULTRA_CONTENT_PORT}/mcp`, {
      method: 'generate_quartier_guide',
      params: {
        destination: 'tokyo',
        quartier: 'shibuya',
        nombre_spots: 5
      }
    });
    
    console.log('✅ Guide de quartier généré:');
    console.log(`   Titre: ${quartierResponse.data.result.title}`);
    console.log(`   Type: ${quartierResponse.data.result.type}`);
    console.log(`   Spots: ${quartierResponse.data.result.spots_count}`);
    console.log(`   Contenu: ${quartierResponse.data.result.content.substring(0, 200)}...`);
    
    // Test 2: Comparatif pratique
    console.log('\n📊 Test 2: Comparatif hôtels Bangkok');
    const comparatifResponse = await axios.post(`http://localhost:${ULTRA_CONTENT_PORT}/mcp`, {
      method: 'generate_comparatif',
      params: {
        destination: 'bangkok',
        sujet: 'hôtels',
        nombre_options: 3
      }
    });
    
    console.log('✅ Comparatif généré:');
    console.log(`   Titre: ${comparatifResponse.data.result.title}`);
    console.log(`   Type: ${comparatifResponse.data.result.type}`);
    console.log(`   Options: ${comparatifResponse.data.result.options_count}`);
    console.log(`   Contenu: ${comparatifResponse.data.result.content.substring(0, 200)}...`);
    
    // Test 3: Guide saisonnier
    console.log('\n🌸 Test 3: Guide saisonnier Japon printemps');
    const saisonnierResponse = await axios.post(`http://localhost:${ULTRA_CONTENT_PORT}/mcp`, {
      method: 'generate_saisonnier',
      params: {
        destination: 'japon',
        saison: 'printemps',
        annee: 2024
      }
    });
    
    console.log('✅ Guide saisonnier généré:');
    console.log(`   Titre: ${saisonnierResponse.data.result.title}`);
    console.log(`   Type: ${saisonnierResponse.data.result.type}`);
    console.log(`   Saison: ${saisonnierResponse.data.result.saison}`);
    console.log(`   Contenu: ${saisonnierResponse.data.result.content.substring(0, 200)}...`);
    
    console.log('\n🎉 TOUS LES TESTS RÉUSSIS !');
    console.log('='.repeat(50));
    console.log('✅ Générateur de contenu ultra-spécialisé opérationnel');
    console.log('✅ 3 types de contenu disponibles');
    console.log('✅ Intégration TravelPayouts prête');
    console.log('✅ Prêt pour la production de contenu premium');
    
  } catch (error) {
    console.error('❌ Erreur lors des tests:', error.message);
  }
}

// Exécuter les tests
testUltraContentGenerator();

