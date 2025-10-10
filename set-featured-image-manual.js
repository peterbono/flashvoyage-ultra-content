#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

class ManualFeaturedImageSetter {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
  }

  // Supprimer l'image du corps de l'article
  async removeImageFromContent(articleId) {
    try {
      console.log(`🧹 Suppression de l'image du corps de l'article ${articleId}...`);

      // Récupérer l'article actuel
      const getResponse = await axios.get(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        auth: {
          username: this.username,
          password: this.password
        }
      });

      const article = getResponse.data;
      let content = article.content.rendered;

      // Supprimer l'ancienne image du corps
      content = content.replace(
        /<div class="article-featured-image"[\s\S]*?<\/div>/g,
        ''
      );

      // Mettre à jour l'article
      const updateResponse = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        content: content
      }, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Image supprimée du corps de l\'article!');
      return updateResponse.data;

    } catch (error) {
      console.error('❌ Erreur suppression image:', error.response?.data || error.message);
      throw error;
    }
  }

  // Vérifier l'état actuel de l'article
  async checkArticleStatus(articleId) {
    try {
      console.log(`🔍 Vérification de l'état de l'article ${articleId}...`);

      const response = await axios.get(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        auth: {
          username: this.username,
          password: this.password
        }
      });

      const article = response.data;
      
      console.log('📊 État de l\'article:');
      console.log(`- Titre: ${article.title.rendered}`);
      console.log(`- Featured media: ${article.featured_media || 'Aucune'}`);
      console.log(`- A du CSS: ${article.content.rendered.includes('style=') ? 'OUI' : 'NON'}`);
      console.log(`- A le widget: ${article.content.rendered.includes('trpwdg.com') ? 'OUI' : 'NON'}`);
      console.log(`- A une image dans le contenu: ${article.content.rendered.includes('article-featured-image') ? 'OUI' : 'NON'}`);

      return article;

    } catch (error) {
      console.error('❌ Erreur vérification article:', error.message);
      throw error;
    }
  }

  // Processus de nettoyage
  async cleanArticleForFeaturedImage() {
    try {
      console.log('🧹 NETTOYAGE DE L\'ARTICLE POUR FEATURED IMAGE\n');

      // 1. Vérifier l'état actuel
      console.log('ÉTAPE 1: Vérification de l\'état actuel...');
      const article = await this.checkArticleStatus(879);

      // 2. Supprimer l'image du contenu
      console.log('\nÉTAPE 2: Suppression de l\'image du contenu...');
      const updatedArticle = await this.removeImageFromContent(879);

      // 3. Vérifier le résultat
      console.log('\nÉTAPE 3: Vérification du résultat...');
      const finalArticle = await this.checkArticleStatus(879);

      console.log('\n🎯 RÉSULTAT FINAL:');
      console.log('✅ Article nettoyé pour featured image');
      console.log(`🔗 Lien: ${updatedArticle.link}`);
      console.log('\n📋 INSTRUCTIONS POUR DÉFINIR LA FEATURED IMAGE:');
      console.log('1. Allez sur WordPress Admin');
      console.log('2. Ouvrez l\'article "Comment Paul a doublé ses revenus en Thaïlande"');
      console.log('3. Cliquez sur "Set featured image"');
      console.log('4. Uploadez une image d\'un homme avec laptop (nomade digital)');
      console.log('5. Sauvegardez l\'article');

      return {
        success: true,
        articleUrl: updatedArticle.link,
        instructions: 'Article nettoyé, définissez manuellement la featured image'
      };

    } catch (error) {
      console.error('❌ Erreur nettoyage:', error.message);
      throw error;
    }
  }
}

async function cleanArticleForFeaturedImage() {
  const cleaner = new ManualFeaturedImageSetter();
  
  try {
    const result = await cleaner.cleanArticleForFeaturedImage();
    
    if (result && result.success) {
      console.log('\n🏆 ARTICLE NETTOYÉ!');
      console.log('✅ Prêt pour la définition manuelle de la featured image');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ PROBLÈME DE NETTOYAGE');
      console.log('🔧 L\'article n\'a pas été correctement nettoyé');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

cleanArticleForFeaturedImage();
