#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD, PEXELS_API_KEY } from './config.js';

class SimpleFeaturedImageSetter {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
    this.pexelsApiKey = PEXELS_API_KEY;
  }

  // Rechercher une image appropriée
  async searchFeaturedImage() {
    try {
      console.log('🔍 Recherche d\'une image featured appropriée...');
      
      const response = await axios.get('https://api.pexels.com/v1/search', {
        headers: {
          'Authorization': this.pexelsApiKey
        },
        params: {
          query: 'man laptop digital nomad thailand',
          per_page: 3,
          orientation: 'landscape'
        }
      });

      const images = response.data.photos.map(photo => ({
        id: photo.id,
        url: photo.src.large,
        photographer: photo.photographer,
        photographer_url: photo.photographer_url,
        alt: photo.alt || 'Digital nomad man with laptop',
        width: photo.width,
        height: photo.height
      }));

      console.log(`✅ ${images.length} images trouvées`);
      return images[0]; // Prendre la première image

    } catch (error) {
      console.error('❌ Erreur recherche image:', error.response?.data || error.message);
      return null;
    }
  }

  // Créer un media WordPress avec l'URL de l'image
  async createWordPressMedia(image) {
    try {
      console.log(`📤 Création du media WordPress pour "${image.alt}"...`);

      // Créer le media avec l'URL de l'image Pexels
      const mediaData = {
        source_url: image.url,
        alt_text: image.alt,
        caption: `Photo par ${image.photographer} sur Pexels`,
        description: `Image featured pour l'article sur Paul, nomade digital en Thaïlande. ${image.alt}`
      };

      const response = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/media`, mediaData, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Media WordPress créé avec succès!');
      console.log(`📸 ID WordPress: ${response.data.id}`);
      console.log(`🔗 URL: ${response.data.source_url}`);

      return response.data;

    } catch (error) {
      console.error('❌ Erreur création media:', error.response?.data || error.message);
      throw error;
    }
  }

  // Définir l'image comme featured image
  async setFeaturedImage(articleId, imageId) {
    try {
      console.log(`📸 Définition de l'image ${imageId} comme featured image...`);

      const updateResponse = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        featured_media: imageId
      }, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Featured image définie avec succès!');
      console.log(`🔗 Lien: ${updateResponse.data.link}`);

      return updateResponse.data;

    } catch (error) {
      console.error('❌ Erreur définition featured image:', error.response?.data || error.message);
      throw error;
    }
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

  // Vérifier que la featured image est bien définie
  async verifyFeaturedImage(articleUrl) {
    try {
      console.log('🔍 Vérification de la featured image...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      const checks = {
        hasFeaturedImage: html.includes('wp-post-image') || html.includes('featured-image'),
        hasImageInContent: !html.includes('article-featured-image'),
        hasImageTag: html.includes('<img'),
        hasPexelsImage: html.includes('pexels.com'),
        hasMaleKeywords: html.includes('man') || html.includes('male') || html.includes('businessman')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification:');
      console.log(`✅ Featured image: ${checks.hasFeaturedImage ? 'OUI' : 'NON'}`);
      console.log(`✅ Pas d'image dans le contenu: ${checks.hasImageInContent ? 'OUI' : 'NON'}`);
      console.log(`✅ Tag img présent: ${checks.hasImageTag ? 'OUI' : 'NON'}`);
      console.log(`✅ Image Pexels: ${checks.hasPexelsImage ? 'OUI' : 'NON'}`);
      console.log(`✅ Mots-clés masculins: ${checks.hasMaleKeywords ? 'OUI' : 'NON'}`);
      console.log(`📈 Score de conformité: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isCorrect: percentage >= 80
      };

    } catch (error) {
      console.error('❌ Erreur vérification:', error.message);
      throw error;
    }
  }

  // Processus complet de définition de featured image
  async setFeaturedImageCompletely() {
    try {
      console.log('📸 DÉFINITION DE LA FEATURED IMAGE\n');

      // 1. Rechercher une image appropriée
      console.log('ÉTAPE 1: Recherche d\'une image appropriée...');
      const image = await this.searchFeaturedImage();

      if (!image) {
        console.log('❌ Aucune image trouvée');
        return null;
      }

      console.log(`✅ Image sélectionnée: "${image.alt}"`);

      // 2. Créer le media WordPress
      console.log('\nÉTAPE 2: Création du media WordPress...');
      const media = await this.createWordPressMedia(image);

      // 3. Supprimer l'ancienne image du contenu
      console.log('\nÉTAPE 3: Suppression de l\'ancienne image du contenu...');
      await this.removeImageFromContent(879);

      // 4. Définir comme featured image
      console.log('\nÉTAPE 4: Définition comme featured image...');
      const updatedArticle = await this.setFeaturedImage(879, media.id);

      // 5. Vérifier
      console.log('\nÉTAPE 5: Vérification...');
      const verification = await this.verifyFeaturedImage(updatedArticle.link);

      // 6. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isCorrect) {
        console.log('✅ SUCCÈS! Featured image définie correctement');
        console.log(`📈 Score de conformité: ${verification.score}%`);
        console.log(`📸 Image: "${image.alt}"`);
        console.log(`👤 Photographe: ${image.photographer}`);
        console.log(`🔗 Lien: ${updatedArticle.link}`);
      } else {
        console.log('❌ ÉCHEC! Featured image pas correctement définie');
        console.log(`📈 Score de conformité: ${verification.score}%`);
      }

      return {
        success: verification.isCorrect,
        score: verification.score,
        image: image,
        articleUrl: updatedArticle.link
      };

    } catch (error) {
      console.error('❌ Erreur définition featured image:', error.message);
      throw error;
    }
  }
}

async function setFeaturedImageCompletely() {
  const setter = new SimpleFeaturedImageSetter();
  
  try {
    const result = await setter.setFeaturedImageCompletely();
    
    if (result && result.success) {
      console.log('\n🏆 FEATURED IMAGE DÉFINIE!');
      console.log('✅ Image mise en avant correctement définie');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ PROBLÈME AVEC LA FEATURED IMAGE');
      console.log('🔧 La featured image n\'est pas correctement définie');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

setFeaturedImageCompletely();
