#!/usr/bin/env node

import TemplatesTemoignageComplets from './templates-temoignage-complets.js';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import axios from 'axios';

class CorrectTemoignageGenerator {
  constructor() {
    this.templates = new TemplatesTemoignageComplets();
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
  }

  // Supprimer l'article incorrect
  async deleteIncorrectArticle(articleId) {
    try {
      console.log(`🗑️ Suppression de l'article incorrect (ID: ${articleId})...`);
      
      const response = await axios.delete(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        auth: {
          username: this.username,
          password: this.password
        }
      });

      console.log('✅ Article incorrect supprimé avec succès!');
      return response.data;

    } catch (error) {
      console.error('❌ Erreur suppression article:', error.response?.data || error.message);
      throw error;
    }
  }

  // Générer un vrai témoignage avec template Success Story
  generateCorrectTemoignage() {
    console.log('📝 Génération d\'un témoignage correct avec template Success Story...');

    // Données simulées basées sur Reddit
    const redditData = {
      title: "Comment j'ai doublé mes revenus en 6 mois en Thaïlande",
      content: "Salut les nomades ! Je voulais partager mon expérience incroyable en Thaïlande. Il y a 6 mois, j'étais développeur freelance en France avec des revenus instables. J'ai décidé de partir à Bangkok pour changer ma vie. Aujourd'hui, je gagne 2x plus qu'avant et j'ai trouvé l'équilibre parfait entre travail et vie personnelle. Mon secret ? J'ai créé un réseau local solide, j'ai optimisé ma productivité avec des outils adaptés, et j'ai trouvé des clients qui paient mieux. Je recommande vraiment cette expérience à tous les nomades qui hésitent !",
      permalink: "https://reddit.com/r/digitalnomad/comments/example",
      subreddit: "digitalnomad"
    };

    // Générer le témoignage avec template Success Story
    const temoignage = this.templates.generateTemoignage('success_story', redditData);

    console.log('✅ Témoignage généré avec succès!');
    console.log(`📄 Titre: ${temoignage.title}`);
    console.log(`🎯 Audience: ${temoignage.target_audience}`);
    console.log(`🎨 Ton: ${temoignage.ton}`);

    return temoignage;
  }

  // Publier le témoignage correct
  async publishCorrectTemoignage(temoignage) {
    try {
      console.log('📤 Publication du témoignage correct...');

      const wordpressData = {
        title: temoignage.title,
        content: temoignage.content,
        excerpt: `Découvrez comment ${temoignage.target_audience.toLowerCase()} peut transformer sa vie de nomade.`,
        status: 'publish',
        categories: [64], // Destinations
        tags: ['Témoignage', 'Success Story', 'Thaïlande', 'Nomade Digital'],
        meta: {
          description: `Témoignage inspirant d'un nomade digital qui a doublé ses revenus en Thaïlande. ${temoignage.keywords}`,
          keywords: temoignage.keywords
        }
      };

      const response = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/posts`, wordpressData, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Témoignage publié avec succès!');
      console.log(`🔗 Lien: ${response.data.link}`);
      console.log(`📄 ID: ${response.data.id}`);

      return response.data;

    } catch (error) {
      console.error('❌ Erreur publication témoignage:', error.response?.data || error.message);
      throw error;
    }
  }

  // Vérifier l'article publié
  async verifyPublishedArticle(articleUrl) {
    try {
      console.log('🔍 Vérification de l\'article publié...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      // Vérifications
      const checks = {
        hasPersonalIntro: html.includes('Je suis') && html.includes('ans'),
        hasSuccessStory: html.includes('Comment') && html.includes('a doublé'),
        hasPersonalNarrative: html.includes('Ma stratégie') && html.includes('Les résultats'),
        hasWidgets: html.includes('TRAVELPAYOUTS_') || html.includes('Widget'),
        hasInternalLinks: html.includes('Articles connexes') && html.includes('href='),
        hasCorrectStructure: html.includes('Le défi initial') && html.includes('Ma stratégie d\'action'),
        hasPersonalTone: html.includes('mon parcours') && html.includes('mes conseils')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification:');
      console.log(`✅ Introduction personnelle: ${checks.hasPersonalIntro ? 'OUI' : 'NON'}`);
      console.log(`✅ Success story: ${checks.hasSuccessStory ? 'OUI' : 'NON'}`);
      console.log(`✅ Récit personnel: ${checks.hasPersonalNarrative ? 'OUI' : 'NON'}`);
      console.log(`✅ Widgets intégrés: ${checks.hasWidgets ? 'OUI' : 'NON'}`);
      console.log(`✅ Liens internes: ${checks.hasInternalLinks ? 'OUI' : 'NON'}`);
      console.log(`✅ Structure correcte: ${checks.hasCorrectStructure ? 'OUI' : 'NON'}`);
      console.log(`✅ Ton personnel: ${checks.hasPersonalTone ? 'OUI' : 'NON'}`);
      console.log(`📈 Score de conformité: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isCompliant: percentage >= 80
      };

    } catch (error) {
      console.error('❌ Erreur vérification article:', error.message);
      throw error;
    }
  }

  // Processus complet de correction
  async fixArticleCompletely() {
    try {
      console.log('🔧 CORRECTION COMPLÈTE DE L\'ARTICLE\n');

      // 1. Supprimer l'article incorrect (ID: 875)
      console.log('ÉTAPE 1: Suppression de l\'article incorrect...');
      await this.deleteIncorrectArticle(875);

      // 2. Générer un témoignage correct
      console.log('\nÉTAPE 2: Génération du témoignage correct...');
      const temoignage = this.generateCorrectTemoignage();

      // 3. Publier le témoignage correct
      console.log('\nÉTAPE 3: Publication du témoignage correct...');
      const publishedArticle = await this.publishCorrectTemoignage(temoignage);

      // 4. Vérifier la conformité
      console.log('\nÉTAPE 4: Vérification de la conformité...');
      const verification = await this.verifyPublishedArticle(publishedArticle.link);

      // 5. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isCompliant) {
        console.log('✅ SUCCÈS! Article conforme aux templates témoignage');
        console.log(`📈 Score de conformité: ${verification.score}%`);
        console.log(`🔗 Lien: ${publishedArticle.link}`);
      } else {
        console.log('❌ ÉCHEC! Article non conforme');
        console.log(`📈 Score de conformité: ${verification.score}%`);
        console.log('🔧 Corrections nécessaires...');
      }

      return {
        success: verification.isCompliant,
        score: verification.score,
        articleUrl: publishedArticle.link,
        verification: verification
      };

    } catch (error) {
      console.error('❌ Erreur correction complète:', error.message);
      throw error;
    }
  }
}

async function fixArticleCompletely() {
  const fixer = new CorrectTemoignageGenerator();
  
  try {
    const result = await fixer.fixArticleCompletely();
    
    if (result.success) {
      console.log('\n🎉 MISSION ACCOMPLIE!');
      console.log('✅ Article parfaitement conforme aux templates témoignage');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ CORRECTIONS NÉCESSAIRES');
      console.log('🔧 L\'article nécessite des ajustements supplémentaires');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

fixArticleCompletely();
