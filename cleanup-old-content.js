import axios from 'axios';

const WORDPRESS_URL = 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = 'admin7817';
const WORDPRESS_APP_PASSWORD = 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function cleanupOldContent() {
  console.log('🧹 Nettoyage du contenu non pertinent...');
  
  try {
    // Récupérer tous les articles
    const postsResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 100, status: 'publish' }
    });
    
    console.log(`📰 ${postsResponse.data.length} articles trouvés`);
    
    // Identifier les articles non pertinents (tech, jeux vidéo, etc.)
    const nonRelevantKeywords = [
      'zelda', 'nintendo', 'switch', 'playstation', 'xbox', 'gaming', 'game',
      'samsung', 'galaxy', 'iphone', 'macos', 'sierra', 'tech', 'technology',
      'amazon', 'prime', 'clinton', 'trump', 'inauguration', 'election',
      'halloween', 'parade', 'motogp', 'ducati', 'lorenzo', 'rossi',
      'golden globes', 'celebrity', 'tweets', 'power rangers', 'vr',
      'startup', 'investor', 'dota', 'csgo', 'steam', 'vinales'
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
          title: post.title.rendered,
          url: post.link
        });
      }
    }
    
    console.log(`🔍 ${articlesToMove.length} articles non pertinents identifiés`);
    
    // Mettre les articles non pertinents en brouillon au lieu de les supprimer
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
    console.log(`📊 Résumé: ${movedCount} articles mis en brouillon`);
    
    // Afficher les articles FlashVoyages restants
    console.log('\n🎉 Articles FlashVoyages actifs:');
    const remainingPosts = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      auth: { username: WORDPRESS_USERNAME, password: WORDPRESS_APP_PASSWORD },
      params: { per_page: 20, status: 'publish' }
    });
    
    remainingPosts.data.forEach((post, index) => {
      console.log(`${index + 1}. ${post.title.rendered} (ID: ${post.id})`);
    });
    
  } catch (error) {
    console.error('❌ Erreur générale:', error.response?.data?.message || error.message);
  }
}

// Exécuter le nettoyage
cleanupOldContent();

