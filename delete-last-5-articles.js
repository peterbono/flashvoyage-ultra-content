#!/usr/bin/env node

/**
 * Script pour supprimer les 5 derniers articles WordPress publiés
 * Permet de libérer de l'espace pour republier des articles Reddit
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || '';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || '';

async function deleteLast5Articles() {
  console.log('🗑️  Suppression des 5 derniers articles WordPress publiés...\n');
  
  if (!WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) {
    console.error('❌ Erreur: WORDPRESS_USERNAME et WORDPRESS_APP_PASSWORD doivent être définis dans .env');
    process.exit(1);
  }

  try {
    // 1. Récupérer les 5 derniers articles publiés
    console.log('📚 Récupération des 5 derniers articles publiés...');
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      params: {
        per_page: 5,
        page: 1,
        status: 'publish',
        orderby: 'date',
        order: 'desc',
        _fields: 'id,title,link,date'
      },
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      },
      timeout: 15000
    });

    const articles = response.data;
    
    if (articles.length === 0) {
      console.log('✅ Aucun article publié trouvé');
      return;
    }

    console.log(`✅ ${articles.length} article(s) trouvé(s):\n`);
    articles.forEach((article, index) => {
      console.log(`   ${index + 1}. [ID: ${article.id}] ${article.title.rendered || article.title}`);
      console.log(`      Lien: ${article.link}`);
      console.log(`      Date: ${article.date}\n`);
    });

    // 2. Demander confirmation
    console.log('⚠️  ATTENTION: Ces articles seront supprimés DÉFINITIVEMENT (force=true)');
    console.log('   Appuyez sur Ctrl+C pour annuler, ou attendez 5 secondes pour continuer...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Supprimer les articles
    console.log('🗑️  Suppression en cours...\n');
    let success = 0;
    let errors = 0;

    for (const article of articles) {
      try {
        await axios.delete(
          `${WORDPRESS_URL}/wp-json/wp/v2/posts/${article.id}?force=true`,
          {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            },
            timeout: 15000
          }
        );
        
        console.log(`✅ [${article.id}] "${article.title.rendered || article.title}" supprimé`);
        success++;
        
        // Pause pour éviter rate limiting
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error(`❌ [${article.id}] Erreur: ${error.response?.data?.message || error.message}`);
        errors++;
      }
    }

    console.log('\n════════════════════════════════════════');
    console.log(`✅ Succès: ${success}`);
    console.log(`❌ Erreurs: ${errors}`);
    console.log('════════════════════════════════════════\n');
    
    if (success > 0) {
      console.log('✅ Les articles ont été supprimés. Vous pouvez maintenant relancer une génération.');
    }

  } catch (error) {
    console.error('❌ Erreur:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('   Détails:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

deleteLast5Articles().catch(console.error);
