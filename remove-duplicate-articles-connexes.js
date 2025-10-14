#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

async function removeDuplicate() {
  console.log('🔧 SUPPRESSION DU DOUBLON "ARTICLES CONNEXES"');
  console.log('=============================================\n');

  try {
    // 1. Récupérer l'article
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/907`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });

    const article = response.data;
    let content = article.content.rendered;

    // 2. Compter les occurrences
    const matches = content.match(/<h3>Articles connexes<\/h3>/g);
    const count = matches ? matches.length : 0;

    console.log(`📊 Sections "Articles connexes" trouvées: ${count}\n`);

    if (count <= 1) {
      console.log('✅ Pas de doublon à supprimer\n');
      return;
    }

    // 3. Supprimer la première occurrence (garder la dernière qui est la plus récente)
    console.log('🔧 Suppression de la première occurrence...\n');

    // Pattern pour capturer toute la section (H3 + UL)
    const sectionPattern = /<h3>Articles connexes<\/h3>\s*<ul>[\s\S]*?<\/ul>/;
    
    // Supprimer la première occurrence
    content = content.replace(sectionPattern, '');

    // 4. Vérifier
    const newMatches = content.match(/<h3>Articles connexes<\/h3>/g);
    const newCount = newMatches ? newMatches.length : 0;

    console.log(`✅ Sections restantes: ${newCount}\n`);

    if (newCount !== 1) {
      console.log('⚠️ Attention: Le nombre de sections n\'est pas 1 après suppression\n');
    }

    // 5. Publier
    console.log('📤 PUBLICATION:');
    console.log('===============\n');

    const updateResponse = await axios.post(
      `${WORDPRESS_URL}/wp-json/wp/v2/posts/907`,
      {
        content: content
      },
      {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        },
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Article mis à jour avec succès !');
    console.log(`🔗 URL: ${updateResponse.data.link}\n`);

    // 6. Vérification finale
    console.log('🔍 VÉRIFICATION FINALE:');
    console.log('======================\n');

    const verifyResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/907`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });

    const finalMatches = verifyResponse.data.content.rendered.match(/<h3>Articles connexes<\/h3>/g);
    const finalCount = finalMatches ? finalMatches.length : 0;

    console.log(`📊 Sections "Articles connexes": ${finalCount}`);

    if (finalCount === 1) {
      console.log('✅ Doublon supprimé avec succès !\n');
    } else {
      console.log(`⚠️ Nombre inattendu: ${finalCount}\n`);
    }

    console.log('🎉 TERMINÉ !');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('Détails:', error.response.data);
    }
  }
}

removeDuplicate().catch(console.error);
