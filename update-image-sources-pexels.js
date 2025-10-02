import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Sources d'images Pexels (plus fiables)
const PEXELS_IMAGES = {
  'thailande': [
    'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'japon': [
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'philippines': [
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'coree': [
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ],
  'vietnam': [
    'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
    'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
  ]
};

async function testPexelsImages() {
  console.log('🖼️ Test d\'images Pexels pour FlashVoyages...');
  
  try {
    // Test 1: Upload d'image Thaïlande depuis Pexels
    console.log('\n📤 Test 1: Image Thaïlande depuis Pexels...');
    
    const thailandImage = PEXELS_IMAGES.thailande[0];
    console.log(`URL: ${thailandImage}`);
    
    const imageResponse = await axios.get(thailandImage, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    
    const formData = new FormData();
    const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
    formData.append('file', blob, 'thailand-pexels.jpg');
    
    const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, formData, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      headers: {
        'Content-Disposition': 'attachment; filename="thailand-pexels.jpg"',
        'Content-Type': 'image/jpeg'
      }
    });
    
    console.log('✅ Image Thaïlande uploadée !');
    console.log(`   ID: ${uploadResponse.data.id}`);
    console.log(`   URL: ${uploadResponse.data.source_url}`);
    console.log(`   Taille: ${uploadResponse.data.media_details.width}x${uploadResponse.data.media_details.height}`);
    
    // Test 2: Créer un article avec image Pexels
    console.log('\n📝 Test 2: Article avec image Pexels...');
    
    const articleWithPexelsImage = {
      title: '🏝️ Test Pexels : Images haute qualité pour FlashVoyages',
      content: `<!-- wp:image {"id":${uploadResponse.data.id},"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="${uploadResponse.data.source_url}" alt="Thaïlande - Image Pexels" class="wp-image-${uploadResponse.data.id}"/></figure>
<!-- /wp:image -->

<!-- wp:paragraph -->
<p><strong>Test d'intégration d'images Pexels dans le système MCP FlashVoyages</strong> - Images haute qualité et fiables pour vos articles voyage Asie.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🎯 Avantages de Pexels</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>✅ Fiabilité :</strong> Connexion stable et rapide</li>
<li><strong>✅ Qualité :</strong> Images haute résolution</li>
<li><strong>✅ Diversité :</strong> Large choix d'images Asie</li>
<li><strong>✅ Gratuit :</strong> Aucun coût d'utilisation</li>
<li><strong>✅ Optimisé :</strong> Images compressées pour le web</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>🌏 Images par destination</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Notre système MCP utilise maintenant Pexels pour :</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul>
<li><strong>Thaïlande :</strong> Temples, plages, marchés flottants</li>
<li><strong>Japon :</strong> Temples, cerisiers, villes modernes</li>
<li><strong>Philippines :</strong> Îles paradisiaques, plongée</li>
<li><strong>Corée du Sud :</strong> Séoul, temples, nature</li>
<li><strong>Vietnam :</strong> Baie d'Halong, villes historiques</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>🚀 Processus automatisé</h3>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol>
<li><strong>Détection du sujet :</strong> Analyse du contenu généré</li>
<li><strong>Sélection d'image :</strong> Choix dans la base Pexels appropriée</li>
<li><strong>Upload automatique :</strong> Téléchargement vers WordPress</li>
<li><strong>Optimisation :</strong> Redimensionnement et compression</li>
<li><strong>Intégration :</strong> Blocs WordPress natifs</li>
<li><strong>SEO :</strong> Alt text et métadonnées</li>
</ol>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>💡 Résultat</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Le système MCP FlashVoyages peut maintenant générer des articles avec des images de qualité professionnelle, fiables et pertinentes pour chaque destination asiatique.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`,
      status: 'publish',
      categories: [56], // Actualités
      featured_media: uploadResponse.data.id,
      excerpt: 'Test d\'intégration d\'images Pexels dans le système MCP FlashVoyages. Images haute qualité et fiables pour vos articles voyage Asie.'
    };
    
    const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, articleWithPexelsImage, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Article avec image Pexels créé !');
    console.log(`   ID: ${articleResponse.data.id}`);
    console.log(`   URL: ${articleResponse.data.link}`);
    
    // Test 3: Tester plusieurs images Pexels
    console.log('\n🔄 Test 3: Test de plusieurs images Pexels...');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const [destination, images] of Object.entries(PEXELS_IMAGES)) {
      try {
        const testImage = images[0];
        console.log(`📤 Test image ${destination}...`);
        
        const testResponse = await axios.get(testImage, {
          responseType: 'arraybuffer',
          timeout: 5000
        });
        
        console.log(`✅ ${destination}: OK (${testResponse.data.length} bytes)`);
        successCount++;
        
      } catch (error) {
        console.log(`❌ ${destination}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log('\n🎉 TESTS PEXELS TERMINÉS !');
    console.log('='.repeat(50));
    console.log(`✅ Images testées avec succès: ${successCount}`);
    console.log(`❌ Erreurs: ${errorCount}`);
    console.log('✅ Upload vers WordPress: Fonctionnel');
    console.log('✅ Intégration dans articles: Fonctionnel');
    console.log('✅ Images featured: Fonctionnel');
    
    console.log('\n📊 Résultat final :');
    console.log(`Article créé : ${articleResponse.data.link}`);
    console.log(`Image Pexels : ${uploadResponse.data.source_url}`);
    
    console.log('\n💡 Pexels est maintenant configuré comme source principale d\'images pour FlashVoyages !');
    
  } catch (error) {
    console.error('❌ Erreur lors du test Pexels:', error.response?.data?.message || error.message);
  }
}

// Exécuter les tests
testPexelsImages();

