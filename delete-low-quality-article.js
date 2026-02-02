#!/usr/bin/env node
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || '';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || '';

async function deleteLowQualityArticle() {
  console.log('🔍 Recherche d\'un article de basse qualité à supprimer...\n');
  
  if (!WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD) {
    console.error('❌ Erreur: WORDPRESS_USERNAME et WORDPRESS_APP_PASSWORD doivent être définis dans .env');
    process.exit(1);
  }

  try {
    // 1. Récupérer les 10 derniers articles publiés
    console.log('📚 Récupération des 10 derniers articles publiés...');
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      params: {
        per_page: 10,
        page: 1,
        status: 'publish',
        orderby: 'date',
        order: 'desc',
        _fields: 'id,title,link,date,content'
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

    // 2. Identifier l'article de plus basse qualité
    // Critères: "Budget: Non spécifié", "Difficulté: Moyenne", contenu court, etc.
    let lowestQualityArticle = null;
    let lowestQualityScore = Infinity;

    console.log('\n🔍 Analyse de la qualité des articles...\n');
    
    for (const article of articles) {
      const content = article.content?.rendered || article.content || '';
      const contentText = content.replace(/<[^>]*>/g, ' ').toLowerCase();
      
      let qualityScore = 0;
      const issues = [];
      
      // Pénalités pour indicateurs de basse qualité
      if (contentText.includes('budget: non spécifié') || contentText.includes('budget : non spécifié')) {
        qualityScore += 10;
        issues.push('Budget non spécifié');
      }
      if (contentText.includes('difficulté: moyenne') || contentText.includes('difficulté : moyenne')) {
        qualityScore += 10;
        issues.push('Difficulté générique');
      }
      if (contentText.includes('type d\'expérience') && !contentText.includes('nomade')) {
        qualityScore += 5;
        issues.push('Type générique');
      }
      if (content.length < 3000) {
        qualityScore += 5;
        issues.push('Contenu court');
      }
      if (contentText.includes('destination: asie') || contentText.includes('destination : asie')) {
        qualityScore += 3;
        issues.push('Destination trop générique');
      }
      
      if (qualityScore > 0) {
        console.log(`   📊 [ID: ${article.id}] "${article.title.rendered || article.title}"`);
        console.log(`      Score qualité: ${qualityScore} (${issues.join(', ')})`);
        console.log(`      Lien: ${article.link}\n`);
        
        if (qualityScore < lowestQualityScore) {
          lowestQualityScore = qualityScore;
          lowestQualityArticle = article;
        }
      }
    }

    if (!lowestQualityArticle) {
      console.log('✅ Aucun article de basse qualité détecté parmi les 10 derniers');
      return;
    }

    // 3. Afficher l'article sélectionné
    console.log('\n' + '='.repeat(60));
    console.log('🎯 ARTICLE SÉLECTIONNÉ POUR SUPPRESSION');
    console.log('='.repeat(60));
    console.log(`   ID: ${lowestQualityArticle.id}`);
    console.log(`   Titre: ${lowestQualityArticle.title.rendered || lowestQualityArticle.title}`);
    console.log(`   Lien: ${lowestQualityArticle.link}`);
    console.log(`   Date: ${lowestQualityArticle.date}`);
    console.log(`   Score qualité: ${lowestQualityScore}`);
    console.log('='.repeat(60) + '\n');

    // 4. Demander confirmation
    console.log('⚠️  ATTENTION: Cet article sera supprimé DÉFINITIVEMENT (force=true)');
    console.log('   Appuyez sur Ctrl+C pour annuler, ou attendez 3 secondes pour continuer...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 5. Supprimer l'article
    console.log('🗑️  Suppression en cours...\n');
    
    try {
      await axios.delete(
        `${WORDPRESS_URL}/wp-json/wp/v2/posts/${lowestQualityArticle.id}?force=true`,
        {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          },
          timeout: 15000
        }
      );
      
      console.log(`✅ [${lowestQualityArticle.id}] "${lowestQualityArticle.title.rendered || lowestQualityArticle.title}" supprimé avec succès`);
      console.log('\n✅ L\'article a été supprimé. Vous pouvez maintenant relancer une génération.');
      
    } catch (error) {
      console.error(`❌ Erreur lors de la suppression: ${error.response?.data?.message || error.message}`);
      if (error.response?.data) {
        console.error('   Détails:', JSON.stringify(error.response.data, null, 2));
      }
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Erreur:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('   Détails:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

deleteLowQualityArticle().catch(console.error);
