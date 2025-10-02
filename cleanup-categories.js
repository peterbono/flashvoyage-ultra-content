import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Catégories à supprimer (catégories par défaut WordPress ou non pertinentes)
const CATEGORIES_TO_DELETE = [
  'Entertainment',
  'Lifestyle', 
  'Sports',
  'Techno',
  'Technology',
  'Business',
  'News',
  'Uncategorized',
  'Non classé',
  'Général',
  'General'
];

// Catégories FlashVoyages à garder/optimiser
const FLASHVOYAGES_CATEGORIES = {
  'actualites': {
    name: 'Actualités',
    description: 'Dernières actualités voyage en Asie'
  },
  'guides-pratiques': {
    name: 'Guides Pratiques', 
    description: 'Guides complets pour voyager en Asie'
  },
  'bons-plans': {
    name: 'Bons Plans',
    description: 'Offres et promotions voyage'
  },
  'destinations-asie': {
    name: 'Destinations Asie',
    description: 'Découvrez les plus belles destinations d\'Asie'
  },
  'thailande': {
    name: 'Thaïlande',
    description: 'Tout sur la Thaïlande'
  },
  'japon': {
    name: 'Japon', 
    description: 'Tout sur le Japon'
  },
  'philippines': {
    name: 'Philippines',
    description: 'Tout sur les Philippines'
  },
  'coree-du-sud': {
    name: 'Corée du Sud',
    description: 'Tout sur la Corée du Sud'
  },
  'vietnam': {
    name: 'Vietnam',
    description: 'Tout sur le Vietnam'
  },
  'singapour': {
    name: 'Singapour',
    description: 'Tout sur Singapour'
  },
  'visa-formalites': {
    name: 'Visa & Formalités',
    description: 'Informations sur les visas et formalités'
  },
  'nouveaux-vols': {
    name: 'Nouveaux Vols',
    description: 'Nouvelles routes aériennes vers l\'Asie'
  },
  'vols-pas-chers': {
    name: 'Vols Pas Chers',
    description: 'Trouvez les meilleurs prix de vols'
  },
  'sejours': {
    name: 'Séjours',
    description: 'Séjours organisés en Asie'
  },
  'alertes-securite-visa': {
    name: 'Alertes Sécurité',
    description: 'Alertes sécurité et conseils aux voyageurs'
  },
  'astuces-voyageur': {
    name: 'Astuces Voyageur',
    description: 'Conseils et astuces pour bien voyager'
  }
};

async function cleanupCategories() {
  console.log('🧹 Nettoyage des catégories FlashVoyages...\n');
  
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
    let updatedCount = 0;
    
    for (const category of categories) {
      const categoryName = category.name;
      const categorySlug = category.slug;
      
      console.log(`📁 Traitement: ${categoryName} (${categorySlug})`);
      
      // Vérifier si c'est une catégorie à supprimer
      const shouldDelete = CATEGORIES_TO_DELETE.some(toDelete => 
        categoryName.toLowerCase().includes(toDelete.toLowerCase()) ||
        categorySlug.toLowerCase().includes(toDelete.toLowerCase())
      );
      
      if (shouldDelete && category.count === 0) {
        try {
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
      } else if (FLASHVOYAGES_CATEGORIES[categorySlug]) {
        // Mettre à jour les catégories FlashVoyages
        const newData = FLASHVOYAGES_CATEGORIES[categorySlug];
        
        try {
          await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/categories/${category.id}`, {
            name: newData.name,
            description: newData.description
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          console.log(`   ✅ Catégorie mise à jour`);
          updatedCount++;
        } catch (error) {
          console.error(`   ❌ Erreur mise à jour: ${error.message}`);
        }
      } else {
        console.log(`   ⏭️  Catégorie gardée (${category.count} articles)`);
      }
      
      console.log('   ' + '─'.repeat(40));
      
      // Pause entre les requêtes
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n🎉 NETTOYAGE TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Catégories supprimées: ${deletedCount}`);
    console.log(`✅ Catégories mises à jour: ${updatedCount}`);
    console.log('✅ Catégories FlashVoyages optimisées');
    console.log('✅ Home page plus propre');
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error.response?.data?.message || error.message);
  }
}

// Exécuter le nettoyage
cleanupCategories();

