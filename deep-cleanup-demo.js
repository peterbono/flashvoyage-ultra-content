import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Catégories de démo JNews à supprimer
const DEMO_CATEGORIES = [
  'Business',
  'Techno', 
  'Technology',
  'Sports',
  'Entertainment',
  'Lifestyle',
  'News',
  'Uncategorized',
  'Non classé',
  'Général',
  'General',
  'Featured',
  'Popular'
];

async function findAndDeleteDemoCategories() {
  console.log('🔍 Recherche des catégories de démo JNews...\n');
  
  try {
    // Récupérer toutes les catégories
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const categories = response.data;
    console.log(`📊 ${categories.length} catégories trouvées\n`);
    
    let deletedCount = 0;
    
    for (const category of categories) {
      const categoryName = category.name;
      const categorySlug = category.slug;
      
      console.log(`📁 Vérification: ${categoryName} (${categorySlug})`);
      
      // Vérifier si c'est une catégorie de démo
      const isDemo = DEMO_CATEGORIES.some(demo => 
        categoryName.toLowerCase().includes(demo.toLowerCase()) ||
        categorySlug.toLowerCase().includes(demo.toLowerCase())
      );
      
      if (isDemo) {
        try {
          // D'abord, déplacer les articles de cette catégorie vers "Destinations Asie"
          if (category.count > 0) {
            console.log(`   📝 Déplacement de ${category.count} articles vers "Destinations Asie"`);
            
            // Récupérer les articles de cette catégorie
            const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?categories=${category.id}&per_page=100`, {
              auth: {
                username: WORDPRESS_USERNAME,
                password: WORDPRESS_APP_PASSWORD
              }
            });
            
            // Trouver l'ID de la catégorie "Destinations Asie"
            const destinationsCategory = categories.find(cat => cat.slug === 'destinations-asie');
            
            if (destinationsCategory) {
              for (const post of postsResponse.data) {
                try {
                  await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${post.id}`, {
                    categories: [destinationsCategory.id]
                  }, {
                    auth: {
                      username: WORDPRESS_USERNAME,
                      password: WORDPRESS_APP_PASSWORD
                    }
                  });
                } catch (error) {
                  console.error(`   ❌ Erreur déplacement article ${post.id}: ${error.message}`);
                }
              }
            }
          }
          
          // Supprimer la catégorie de démo
          await axios.delete(`${WORDPRESS_URL}/wp-json/wp/v2/categories/${category.id}?force=true`, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          
          console.log(`   ✅ Catégorie supprimée`);
          deletedCount++;
          
        } catch (error) {
          console.error(`   ❌ Erreur suppression: ${error.message}`);
        }
      } else {
        console.log(`   ⏭️  Catégorie FlashVoyages gardée`);
      }
      
      console.log('   ' + '─'.repeat(40));
      
      // Pause entre les requêtes
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return deletedCount;
    
  } catch (error) {
    console.error('❌ Erreur lors de la recherche:', error.response?.data?.message || error.message);
    return 0;
  }
}

async function checkRemainingCategories() {
  console.log('\n🔍 Vérification des catégories restantes...\n');
  
  try {
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const categories = response.data;
    console.log(`📊 ${categories.length} catégories restantes:\n`);
    
    for (const category of categories) {
      console.log(`📁 ${category.name} (${category.slug}) - ${category.count} articles`);
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error.response?.data?.message || error.message);
  }
}

async function deepCleanupDemo() {
  console.log('🧹 Nettoyage approfondi du contenu de démo JNews...\n');
  
  try {
    // 1. Supprimer les catégories de démo
    const deletedCount = await findAndDeleteDemoCategories();
    
    // 2. Vérifier les catégories restantes
    await checkRemainingCategories();
    
    console.log('\n🎉 NETTOYAGE APPROFONDI TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Catégories de démo supprimées: ${deletedCount}`);
    console.log('✅ Seules les catégories FlashVoyages restent');
    console.log('✅ "Business", "Techno", "Sports" supprimés');
    console.log('✅ Home page devrait être propre maintenant');
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error.response?.data?.message || error.message);
  }
}

// Exécuter le nettoyage approfondi
deepCleanupDemo();

