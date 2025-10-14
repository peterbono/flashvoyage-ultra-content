#!/usr/bin/env node

/**
 * APPLIQUE LA STRATÉGIE COMPLÈTE DE LIENS EN PRODUCTION
 */

import axios from 'axios';
import fs from 'fs';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

async function applyCompleteLinks() {
  console.log('🚀 APPLICATION DE LA STRATÉGIE COMPLÈTE EN PRODUCTION');
  console.log('====================================================\n');

  try {
    const articleId = 907;

    // 1. Charger le contenu avec les liens
    console.log('📥 CHARGEMENT DU CONTENU:');
    console.log('========================\n');

    if (!fs.existsSync('article-with-complete-links.html')) {
      throw new Error('Fichier article-with-complete-links.html introuvable. Lancez d\'abord: node test-complete-strategy.js');
    }

    const newContent = fs.readFileSync('article-with-complete-links.html', 'utf-8');
    const report = JSON.parse(fs.readFileSync('complete-linking-strategy-report.json', 'utf-8'));

    console.log('✅ Contenu chargé');
    console.log(`📊 Liens à publier: ${report.final_link_count}`);
    console.log(`📊 Liens internes: ${report.strategy.breakdown.internal}`);
    console.log(`📊 Liens externes: ${report.strategy.breakdown.external}\n`);

    // 2. Récupérer l'article actuel
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

    // 3. Publier
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

    // Vérifier les liens externes
    const hasDojoBali = verifyResponse.data.content.rendered.includes('dojobali.org');
    const hasDigitalNomads = verifyResponse.data.content.rendered.includes('facebook.com/groups/digitalnomadsindonesia');
    const hasHubud = verifyResponse.data.content.rendered.includes('hubud.org');

    console.log('📊 VALIDATION DES LIENS EXTERNES:');
    console.log('=================================\n');
    console.log(`  ✅ Dojo Bali: ${hasDojoBali ? 'Présent' : '❌ Absent'}`);
    console.log(`  ✅ Digital Nomads Indonesia: ${hasDigitalNomads ? 'Présent' : '❌ Absent'}`);
    console.log(`  ✅ Hubud: ${hasHubud ? 'Présent' : '❌ Absent'}\n`);

    console.log('🎉 SUCCÈS !');
    console.log('==========\n');
    console.log(`L'article a été enrichi avec ${finalLinkCount - currentLinkCount} nouveaux liens.`);
    console.log(`Visitez: ${updateResponse.data.link}\n`);

    // 5. Sauvegarder un rapport final
    const finalReport = {
      article_id: articleId,
      article_title: currentArticle.title.rendered,
      article_url: updateResponse.data.link,
      updated_at: new Date().toISOString(),
      links_before: currentLinkCount,
      links_after: finalLinkCount,
      links_added: finalLinkCount - currentLinkCount,
      strategy: report.strategy,
      external_links_verified: {
        dojo_bali: hasDojoBali,
        digital_nomads_indonesia: hasDigitalNomads,
        hubud: hasHubud
      }
    };

    fs.writeFileSync('complete-links-final-report.json', JSON.stringify(finalReport, null, 2));
    console.log('📄 Rapport final sauvegardé: complete-links-final-report.json\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('Détails:', error.response.data);
    }
  }
}

applyCompleteLinks().catch(console.error);
