import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function testImageUpload() {
  console.log('🖼️ Test d\'upload d\'images via MCP WordPress...');
  
  try {
    // 1. Tester l'upload d'une image depuis une URL
    console.log('📤 Test 1: Upload d\'image depuis URL...');
    
    const imageUrl = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop';
    
    // D'abord, télécharger l'image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });
    
    // Créer un FormData pour l'upload
    const formData = new FormData();
    const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
    formData.append('file', blob, 'bangkok-temple.jpg');
    
    // Upload vers WordPress
    const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, formData, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      headers: {
        'Content-Disposition': 'attachment; filename="bangkok-temple.jpg"',
        'Content-Type': 'image/jpeg'
      }
    });
    
    console.log('✅ Image uploadée avec succès !');
    console.log(`   ID: ${uploadResponse.data.id}`);
    console.log(`   URL: ${uploadResponse.data.source_url}`);
    console.log(`   Taille: ${uploadResponse.data.media_details.width}x${uploadResponse.data.media_details.height}`);
    
    // 2. Créer un article avec cette image
    console.log('\n📝 Test 2: Création d\'article avec image...');
    
    const articleWithImage = {
      title: '🖼️ Test d\'image : Temple de Bangkok',
      content: `<!-- wp:paragraph -->
<p><strong>Test d'intégration d'image via MCP WordPress</strong> - Cette image a été uploadée automatiquement via notre système MCP.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":${uploadResponse.data.id},"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="${uploadResponse.data.source_url}" alt="Temple de Bangkok" class="wp-image-${uploadResponse.data.id}"/></figure>
<!-- /wp:image -->

<!-- wp:paragraph -->
<p>Cette image a été automatiquement intégrée dans l'article grâce à notre système MCP FlashVoyages. L'image est optimisée et responsive.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🎯 Fonctionnalités d'image MCP</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Upload automatique :</strong> Depuis URL ou fichier local</li>
<li><strong>Optimisation :</strong> Redimensionnement automatique</li>
<li><strong>Intégration :</strong> Blocs WordPress natifs</li>
<li><strong>SEO :</strong> Alt text et métadonnées</li>
</ul>
<!-- /wp:list -->`,
      status: 'publish',
      categories: [56], // Actualités
      excerpt: 'Test d\'intégration d\'images via MCP WordPress. Découvrez comment automatiser l\'ajout d\'images dans vos articles FlashVoyages.',
      featured_media: uploadResponse.data.id
    };
    
    const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, articleWithImage, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Article avec image créé !');
    console.log(`   ID: ${articleResponse.data.id}`);
    console.log(`   URL: ${articleResponse.data.link}`);
    console.log(`   Image featured: ${articleResponse.data.featured_media}`);
    
    // 3. Tester l'upload d'une image depuis un fichier local
    console.log('\n📤 Test 3: Upload d\'image depuis fichier local...');
    
    // Créer une image de test simple (SVG)
    const svgContent = `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="#4A90E2"/>
      <text x="200" y="150" text-anchor="middle" fill="white" font-family="Arial" font-size="24">FlashVoyages MCP</text>
      <text x="200" y="180" text-anchor="middle" fill="white" font-family="Arial" font-size="16">Test d'image automatique</text>
    </svg>`;
    
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
    const svgFormData = new FormData();
    svgFormData.append('file', svgBlob, 'flashvoyages-test.svg');
    
    const svgUploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, svgFormData, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      headers: {
        'Content-Disposition': 'attachment; filename="flashvoyages-test.svg"',
        'Content-Type': 'image/svg+xml'
      }
    });
    
    console.log('✅ Image SVG uploadée !');
    console.log(`   ID: ${svgUploadResponse.data.id}`);
    console.log(`   URL: ${svgUploadResponse.data.source_url}`);
    
    console.log('\n🎉 Tests d\'images MCP terminés avec succès !');
    console.log('='.repeat(50));
    console.log('✅ Upload depuis URL : Fonctionnel');
    console.log('✅ Upload depuis fichier : Fonctionnel');
    console.log('✅ Intégration dans articles : Fonctionnel');
    console.log('✅ Images featured : Fonctionnel');
    
  } catch (error) {
    console.error('❌ Erreur lors du test d\'images:', error.response?.data?.message || error.message);
    
    if (error.response?.data?.code === 'rest_upload_unknown_error') {
      console.log('\n💡 Solution : Vérifiez que les permissions d\'upload sont activées sur votre WordPress');
    }
  }
}

// Exécuter le test
testImageUpload();

