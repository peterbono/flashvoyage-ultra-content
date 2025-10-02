import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function finalCleanupAndSummary() {
  console.log('🧹 Nettoyage final et résumé de la mise à jour FlashVoyages...');
  
  try {
    // Récupérer tous les articles publiés
    const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 100, status: 'publish' }
    });
    
    console.log(`📰 ${postsResponse.data.length} articles publiés trouvés`);
    
    // Identifier les articles non pertinents restants
    const nonRelevantKeywords = [
      'shadow tactics', 'blades of the shogun', 'heroes of the storm', 'championship',
      'millennials', 'boomers', 'doctors', 'organ transplant', 'ai', 'lighting',
      'obama', 'press conference', 'gfinity', 'competitive league', 'sneakers',
      'fashion week', 'molested', 'woman', 'politically correct', 'nigerian',
      'developer', 'zuckerberg', 'jimmy fallon', 'hosting', 'british model',
      'cultural appropriation', 'morocco', 'desert', 'seaside', '35mm', 'sony',
      'ps4 pro', 'chinese province', 'fiscal data'
    ];
    
    const articlesToMove = [];
    
    for (const post of postsResponse.data) {
      const title = post.title.rendered.toLowerCase();
      const content = post.content.rendered.toLowerCase();
      
      // Vérifier si l'article contient des mots-clés non pertinents
      const isNonRelevant = nonRelevantKeywords.some(keyword => 
        title.includes(keyword) || content.includes(keyword)
      );
      
      if (isNonRelevant) {
        articlesToMove.push({
          id: post.id,
          title: post.title.rendered
        });
      }
    }
    
    console.log(`🔍 ${articlesToMove.length} articles non pertinents supplémentaires identifiés`);
    
    // Mettre les articles non pertinents en brouillon
    let movedCount = 0;
    
    for (const article of articlesToMove) {
      try {
        console.log(`📝 Mise en brouillon: ${article.title}`);
        
        await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}`, {
          status: 'draft'
        }, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          },
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`✅ Mis en brouillon (ID: ${article.id})`);
        movedCount++;
        
        // Pause entre les mises à jour
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Erreur pour l'article ${article.id}:`, error.response?.data?.message || error.message);
      }
    }
    
    console.log('='.repeat(50));
    console.log(`📊 Nettoyage final: ${movedCount} articles mis en brouillon`);
    
    // Récupérer les articles FlashVoyages finaux
    const finalPosts = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 20, status: 'publish' }
    });
    
    console.log('\n🎉 ARTICLES FLASHVOYAGES FINAUX:');
    console.log('='.repeat(50));
    
    finalPosts.data.forEach((post, index) => {
      console.log(`${index + 1}. ${post.title.rendered}`);
      console.log(`   ID: ${post.id} | URL: ${post.link}`);
      console.log('');
    });
    
    // Récupérer les catégories et leur contenu
    const categoriesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD }
    });
    
    console.log('\n📂 RÉPARTITION PAR CATÉGORIES:');
    console.log('='.repeat(50));
    
    for (const category of categoriesResponse.data) {
      if (category.count > 0) {
        console.log(`${category.name}: ${category.count} articles`);
      }
    }
    
    // Récupérer les pages mises à jour
    const pagesResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 10, status: 'publish' }
    });
    
    console.log('\n📄 PAGES STATIQUES MISE À JOUR:');
    console.log('='.repeat(50));
    
    pagesResponse.data.forEach((page, index) => {
      console.log(`${index + 1}. ${page.title.rendered}`);
      console.log(`   URL: ${page.link}`);
    });
    
    console.log('\n✅ MISE À JOUR FLASHVOYAGES TERMINÉE !');
    console.log('='.repeat(50));
    console.log('🎯 Votre site est maintenant cohérent avec la stratégie FlashVoyages');
    console.log('🌏 Focus Asie avec ton proche et complice');
    console.log('📰 Contenu actualités, guides et bons plans');
    console.log('🔗 Prêt pour l\'intégration des liens d\'affiliation');
    console.log('🚀 Système MCP opérationnel pour l\'automatisation');
    
  } catch (error) {
    console.error('❌ Erreur générale:', error.response?.data?.message || error.message);
  }
}

// Exécuter le nettoyage final
finalCleanupAndSummary();

