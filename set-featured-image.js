#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD, PEXELS_API_KEY } from './config.js';

class FeaturedImageSetter {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
    this.pexelsApiKey = PEXELS_API_KEY;
  }

  // Rechercher une image appropriée pour Paul
  async searchFeaturedImage() {
    try {
      console.log('🔍 Recherche d\'une image featured appropriée pour Paul...');
      
      const response = await axios.get('https://api.pexels.com/v1/search', {
        headers: {
          'Authorization': this.pexelsApiKey
        },
        params: {
          query: 'man laptop digital nomad thailand',
          per_page: 5,
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
      return images;

    } catch (error) {
      console.error('❌ Erreur recherche image:', error.response?.data || error.message);
      return [];
    }
  }

  // Sélectionner la meilleure image pour featured
  selectBestFeaturedImage(images) {
    if (!images || images.length === 0) return null;

    let bestImage = images[0];
    let bestScore = 0;

    images.forEach(image => {
      let score = 0;
      const altLower = image.alt.toLowerCase();
      
      // Mots-clés prioritaires
      const keywords = ['man', 'male', 'laptop', 'digital', 'nomad', 'thailand', 'working', 'business'];
      
      keywords.forEach(keyword => {
        if (altLower.includes(keyword)) {
          score += 1;
        }
      });
      
      // Bonus pour les images d'hommes
      if (altLower.includes('man') || altLower.includes('male')) {
        score += 2;
      }
      
      // Bonus pour les images de travail
      if (altLower.includes('laptop') || altLower.includes('working')) {
        score += 1;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestImage = image;
      }
    });

    console.log(`✅ Meilleure image featured sélectionnée: "${bestImage.alt}" (score: ${bestScore})`);
    return bestImage;
  }

  // Télécharger l'image et l'uploader sur WordPress
  async uploadImageToWordPress(image) {
    try {
      console.log(`📤 Upload de l'image "${image.alt}" sur WordPress...`);

      // Télécharger l'image depuis Pexels
      const imageResponse = await axios.get(image.url, {
        responseType: 'arraybuffer'
      });

      // Créer un FormData pour l'upload
      const { FormData } = await import('form-data');
      const form = new FormData();
      
      form.append('file', imageResponse.data, {
        filename: `paul-nomade-digital-${image.id}.jpg`,
        contentType: 'image/jpeg'
      });

      // Uploader l'image sur WordPress
      const uploadResponse = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/media`, form, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          ...form.getHeaders(),
          'Content-Disposition': `attachment; filename="paul-nomade-digital-${image.id}.jpg"`
        }
      });

      console.log('✅ Image uploadée sur WordPress avec succès!');
      console.log(`📸 ID WordPress: ${uploadResponse.data.id}`);
      console.log(`🔗 URL: ${uploadResponse.data.source_url}`);

      return uploadResponse.data;

    } catch (error) {
      console.error('❌ Erreur upload image:', error.response?.data || error.message);
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
      const images = await this.searchFeaturedImage();

      if (images.length === 0) {
        console.log('❌ Aucune image trouvée');
        return null;
      }

      // 2. Sélectionner la meilleure image
      console.log('\nÉTAPE 2: Sélection de la meilleure image...');
      const bestImage = this.selectBestFeaturedImage(images);

      if (!bestImage) {
        console.log('❌ Aucune image appropriée trouvée');
        return null;
      }

      // 3. Uploader l'image sur WordPress
      console.log('\nÉTAPE 3: Upload de l\'image sur WordPress...');
      const uploadedImage = await this.uploadImageToWordPress(bestImage);

      // 4. Supprimer l'ancienne image du contenu
      console.log('\nÉTAPE 4: Suppression de l\'ancienne image du contenu...');
      await this.removeImageFromContent(879);

      // 5. Définir comme featured image
      console.log('\nÉTAPE 5: Définition comme featured image...');
      const updatedArticle = await this.setFeaturedImage(879, uploadedImage.id);

      // 6. Vérifier
      console.log('\nÉTAPE 6: Vérification...');
      const verification = await this.verifyFeaturedImage(updatedArticle.link);

      // 7. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isCorrect) {
        console.log('✅ SUCCÈS! Featured image définie correctement');
        console.log(`📈 Score de conformité: ${verification.score}%`);
        console.log(`📸 Image: "${bestImage.alt}"`);
        console.log(`👤 Photographe: ${bestImage.photographer}`);
        console.log(`🔗 Lien: ${updatedArticle.link}`);
      } else {
        console.log('❌ ÉCHEC! Featured image pas correctement définie');
        console.log(`📈 Score de conformité: ${verification.score}%`);
      }

      return {
        success: verification.isCorrect,
        score: verification.score,
        image: bestImage,
        articleUrl: updatedArticle.link
      };

    } catch (error) {
      console.error('❌ Erreur définition featured image:', error.message);
      throw error;
    }
  }
}

async function setFeaturedImageCompletely() {
  const setter = new FeaturedImageSetter();
  
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
