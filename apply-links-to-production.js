#!/usr/bin/env node

/**
 * APPLIQUE LES LIENS INTERNES À L'ARTICLE DE PRODUCTION
 */

import axios from 'axios';
import fs from 'fs';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

async function applyLinksToProduction() {
  console.log('🚀 APPLICATION DES LIENS EN PRODUCTION');
  console.log('======================================\n');

  try {
    const articleId = 907;

    // 1. Charger le contenu avec les liens
    console.log('📥 CHARGEMENT DU CONTENU:');
    console.log('========================\n');

    if (!fs.existsSync('production-article-with-links.html')) {
      throw new Error('Fichier production-article-with-links.html introuvable. Lancez d\'abord: node test-on-production-article.js');
    }

    const newContent = fs.readFileSync('production-article-with-links.html', 'utf-8');
    const analysis = JSON.parse(fs.readFileSync('production-article-analysis.json', 'utf-8'));

    console.log('✅ Contenu chargé');
    console.log(`📊 Liens à publier: ${analysis.final_link_count}`);
    console.log(`📊 Densité: ${analysis.link_density}\n`);

    // 2. Récupérer l'article actuel pour comparaison
    console.log('📥 RÉCUPÉRATION DE L\'ARTICLE ACTUEL:');
    console.log('====================================\n');

    const currentResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });

    const currentArticle = currentResponse.data;
    const currentLinkCount = (currentArticle.content.rendered.match(/<a href=/g) || []).length;

    console.log(`✅ Article actuel: "${currentArticle.title.rendered}"`);
    console.log(`📊 Liens actuels: ${currentLinkCount}\n`);

    // 3. Publier le nouveau contenu
    console.log('📤 PUBLICATION:');
    console.log('===============\n');

    const updateResponse = await axios.post(
      `${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`,
      {
        content: newContent
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

    // 4. Vérification
    console.log('🔍 VÉRIFICATION:');
    console.log('================\n');

    const verifyResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });

    const finalLinkCount = (verifyResponse.data.content.rendered.match(/<a href=/g) || []).length;

    console.log(`  Liens avant: ${currentLinkCount}`);
    console.log(`  Liens après: ${finalLinkCount}`);
    console.log(`  Différence: +${finalLinkCount - currentLinkCount}\n`);

    // Vérifier que les liens internes sont présents
    const hasInternalLinks = verifyResponse.data.content.rendered.includes('flashvoyage.com');
    const hasRelatedSection = verifyResponse.data.content.rendered.includes('Articles connexes');

    console.log('📊 VALIDATION:');
    console.log('=============\n');
    console.log(`  ✅ Liens internes: ${hasInternalLinks ? 'Présents' : '❌ Absents'}`);
    console.log(`  ✅ Section "Articles connexes": ${hasRelatedSection ? 'Présente' : '❌ Absente'}`);

    if (finalLinkCount === analysis.final_link_count) {
      console.log(`  ✅ Nombre de liens correct: ${finalLinkCount}\n`);
    } else {
      console.log(`  ⚠️ Différence de liens: attendu ${analysis.final_link_count}, obtenu ${finalLinkCount}\n`);
    }

    console.log('🎉 SUCCÈS !');
    console.log('==========\n');
    console.log(`L'article a été enrichi avec ${finalLinkCount - currentLinkCount} nouveaux liens internes.`);
    console.log(`Visitez: ${updateResponse.data.link}\n`);

    // 5. Sauvegarder un rapport
    const report = {
      article_id: articleId,
      article_title: currentArticle.title.rendered,
      article_url: updateResponse.data.link,
      updated_at: new Date().toISOString(),
      links_before: currentLinkCount,
      links_after: finalLinkCount,
      links_added: finalLinkCount - currentLinkCount,
      link_density: analysis.link_density,
      suggested_links: analysis.suggested_links,
      integration_stats: analysis.integration_stats
    };

    fs.writeFileSync('production-links-report.json', JSON.stringify(report, null, 2));
    console.log('📄 Rapport sauvegardé: production-links-report.json\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('Détails:', error.response.data);
    }
  }
}

applyLinksToProduction().catch(console.error);
