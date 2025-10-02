import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

// Mots-clés pour identifier le contenu de démo
const DEMO_KEYWORDS = [
  'entertainment',
  'lifestyle', 
  'sports',
  'technology',
  'business',
  'demo',
  'sample',
  'lorem ipsum',
  'jnews',
  'theme demo'
];

async function findDemoContent() {
  console.log('🔍 Recherche du contenu de démo JNews...\n');
  
  try {
    // Récupérer tous les posts
    const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=any`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    // Récupérer toutes les pages
    const pagesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages?per_page=100&status=any`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    // Récupérer toutes les catégories
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?per_page=100`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const posts = postsResponse.data;
    const pages = pagesResponse.data;
    const categories = categoriesResponse.data;
    
    console.log(`📊 Contenu trouvé:`);
    console.log(`   Posts: ${posts.length}`);
    console.log(`   Pages: ${pages.length}`);
    console.log(`   Catégories: ${categories.length}\n`);
    
    let demoPosts = [];
    let demoPages = [];
    let demoCategories = [];
    
    // Identifier les posts de démo
    for (const post of posts) {
      const content = (post.title.rendered + ' ' + post.content.rendered).toLowerCase();
      const isDemo = DEMO_KEYWORDS.some(keyword => content.includes(keyword));
      
      if (isDemo) {
        demoPosts.push(post);
        console.log(`📄 Post de démo: ${post.title.rendered} (ID: ${post.id})`);
      }
    }
    
    // Identifier les pages de démo
    for (const page of pages) {
      const content = (page.title.rendered + ' ' + page.content.rendered).toLowerCase();
      const isDemo = DEMO_KEYWORDS.some(keyword => content.includes(keyword));
      
      if (isDemo) {
        demoPages.push(page);
        console.log(`📄 Page de démo: ${page.title.rendered} (ID: ${page.id})`);
      }
    }
    
    // Identifier les catégories de démo
    for (const category of categories) {
      const content = (category.name + ' ' + (category.description || '')).toLowerCase();
      const isDemo = DEMO_KEYWORDS.some(keyword => content.includes(keyword));
      
      if (isDemo) {
        demoCategories.push(category);
        console.log(`📁 Catégorie de démo: ${category.name} (ID: ${category.id})`);
      }
    }
    
    console.log(`\n📊 Résumé:`);
    console.log(`   Posts de démo: ${demoPosts.length}`);
    console.log(`   Pages de démo: ${demoPages.length}`);
    console.log(`   Catégories de démo: ${demoCategories.length}`);
    
    return { demoPosts, demoPages, demoCategories };
    
  } catch (error) {
    console.error('❌ Erreur lors de la recherche:', error.response?.data?.message || error.message);
    return { demoPosts: [], demoPages: [], demoCategories: [] };
  }
}

async function deleteDemoContent(demoContent) {
  console.log('\n🗑️ Suppression du contenu de démo...\n');
  
  const { demoPosts, demoPages, demoCategories } = demoContent;
  let deletedCount = 0;
  
  // Supprimer les posts de démo
  for (const post of demoPosts) {
    try {
      await axios.delete(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${post.id}?force=true`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      console.log(`✅ Post supprimé: ${post.title.rendered}`);
      deletedCount++;
    } catch (error) {
      console.error(`❌ Erreur suppression post: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Supprimer les pages de démo (sauf les pages importantes)
  const importantPages = ['accueil', 'home', 'about', 'contact', 'à propos', 'mentions légales'];
  
  for (const page of demoPages) {
    const isImportant = importantPages.some(important => 
      page.title.rendered.toLowerCase().includes(important)
    );
    
    if (!isImportant) {
      try {
        await axios.delete(`${WORDPRESS_URL}/wp-json/wp/v2/pages/${page.id}?force=true`, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        console.log(`✅ Page supprimée: ${page.title.rendered}`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Erreur suppression page: ${error.message}`);
      }
    } else {
      console.log(`⏭️  Page importante gardée: ${page.title.rendered}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Supprimer les catégories de démo (si elles n'ont pas d'articles)
  for (const category of demoCategories) {
    if (category.count === 0) {
      try {
        await axios.delete(`${WORDPRESS_URL}/wp-json/wp/v2/categories/${category.id}?force=true`, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });
        console.log(`✅ Catégorie supprimée: ${category.name}`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Erreur suppression catégorie: ${error.message}`);
      }
    } else {
      console.log(`⏭️  Catégorie gardée (${category.count} articles): ${category.name}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return deletedCount;
}

async function cleanupJNewsDemo() {
  console.log('🧹 Nettoyage du contenu de démo JNews...\n');
  
  try {
    // 1. Identifier le contenu de démo
    const demoContent = await findDemoContent();
    
    if (demoContent.demoPosts.length === 0 && demoContent.demoPages.length === 0 && demoContent.demoCategories.length === 0) {
      console.log('✅ Aucun contenu de démo trouvé !');
      return;
    }
    
    // 2. Supprimer le contenu de démo
    const deletedCount = await deleteDemoContent(demoContent);
    
    console.log('\n🎉 NETTOYAGE TERMINÉ !');
    console.log('='.repeat(50));
    console.log(`✅ Éléments supprimés: ${deletedCount}`);
    console.log('✅ Contenu de démo JNews supprimé');
    console.log('✅ Home page propre');
    console.log('✅ Seul le contenu FlashVoyages reste');
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error.response?.data?.message || error.message);
  }
}

// Exécuter le nettoyage
cleanupJNewsDemo();

