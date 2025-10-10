#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD, PEXELS_API_KEY } from './config.js';

class AutoFeaturedImageSetter {
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
      return images[0]; // Prendre la première image

    } catch (error) {
      console.error('❌ Erreur recherche image:', error.response?.data || error.message);
      return null;
    }
  }

  // Télécharger l'image et l'uploader sur WordPress
  async uploadImageToWordPress(image) {
    try {
      console.log(`📤 Upload de l'image "${image.alt}" sur WordPress...`);

      // Télécharger l'image depuis Pexels
      const imageResponse = await axios.get(image.url, {
        responseType: 'arraybuffer'
      });

      // Convertir en base64
      const base64Image = Buffer.from(imageResponse.data).toString('base64');
      
      // Créer le media avec base64
      const mediaData = {
        title: `Paul nomade digital - ${image.alt}`,
        alt_text: image.alt,
        caption: `Photo par ${image.photographer} sur Pexels`,
        description: `Image featured pour l'article sur Paul, nomade digital en Thaïlande. ${image.alt}`,
        media: `data:image/jpeg;base64,${base64Image}`
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

      console.log('✅ Image uploadée sur WordPress avec succès!');
      console.log(`📸 ID WordPress: ${response.data.id}`);
      console.log(`🔗 URL: ${response.data.source_url}`);

      return response.data;

    } catch (error) {
      console.error('❌ Erreur upload image:', error.response?.data || error.message);
      throw error;
    }
  }

  // Alternative: utiliser l'URL directe de Pexels
  async createMediaWithUrl(image) {
    try {
      console.log(`📤 Création du media avec URL directe...`);

      // Créer le media avec l'URL de l'image Pexels
      const mediaData = {
        source_url: image.url,
        alt_text: image.alt,
        caption: `Photo par ${image.photographer} sur Pexels`,
        description: `Image featured pour l'article sur Paul, nomade digital en Thaïlande. ${image.alt}`,
        title: `Paul nomade digital - ${image.alt}`
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

      console.log('✅ Media créé avec URL directe!');
      console.log(`📸 ID WordPress: ${response.data.id}`);
      console.log(`🔗 URL: ${response.data.source_url}`);

      return response.data;

    } catch (error) {
      console.error('❌ Erreur création media avec URL:', error.response?.data || error.message);
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

  // Vérifier que la featured image est bien définie
  async verifyFeaturedImage(articleUrl) {
    try {
      console.log('🔍 Vérification de la featured image...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      const checks = {
        hasFeaturedImage: html.includes('wp-post-image') || html.includes('featured-image'),
        hasImageTag: html.includes('<img'),
        hasPexelsImage: html.includes('pexels.com'),
        hasMaleKeywords: html.includes('man') || html.includes('male') || html.includes('businessman')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification:');
      console.log(`✅ Featured image: ${checks.hasFeaturedImage ? 'OUI' : 'NON'}`);
      console.log(`✅ Tag img présent: ${checks.hasImageTag ? 'OUI' : 'NON'}`);
      console.log(`✅ Image Pexels: ${checks.hasPexelsImage ? 'OUI' : 'NON'}`);
      console.log(`✅ Mots-clés masculins: ${checks.hasMaleKeywords ? 'OUI' : 'NON'}`);
      console.log(`📈 Score de conformité: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isCorrect: percentage >= 75
      };

    } catch (error) {
      console.error('❌ Erreur vérification:', error.message);
      throw error;
    }
  }

  // Processus complet de définition automatique de featured image
  async setFeaturedImageAutomatically() {
    try {
      console.log('📸 DÉFINITION AUTOMATIQUE DE LA FEATURED IMAGE\n');

      // 1. Rechercher une image appropriée
      console.log('ÉTAPE 1: Recherche d\'une image appropriée...');
      const image = await this.searchFeaturedImage();

      if (!image) {
        console.log('❌ Aucune image trouvée');
        return null;
      }

      console.log(`✅ Image sélectionnée: "${image.alt}"`);

      // 2. Essayer de créer le media avec URL directe
      console.log('\nÉTAPE 2: Création du media WordPress...');
      let media;
      try {
        media = await this.createMediaWithUrl(image);
      } catch (error) {
        console.log('⚠️ Échec avec URL directe, tentative avec base64...');
        try {
          media = await this.uploadImageToWordPress(image);
        } catch (error2) {
          console.log('❌ Échec des deux méthodes');
          throw error2;
        }
      }

      // 3. Définir comme featured image
      console.log('\nÉTAPE 3: Définition comme featured image...');
      const updatedArticle = await this.setFeaturedImage(879, media.id);

      // 4. Vérifier
      console.log('\nÉTAPE 4: Vérification...');
      const verification = await this.verifyFeaturedImage(updatedArticle.link);

      // 5. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isCorrect) {
        console.log('✅ SUCCÈS! Featured image définie automatiquement');
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
      console.error('❌ Erreur définition automatique:', error.message);
      throw error;
    }
  }
}

async function setFeaturedImageAutomatically() {
  const setter = new AutoFeaturedImageSetter();
  
  try {
    const result = await setter.setFeaturedImageAutomatically();
    
    if (result && result.success) {
      console.log('\n🏆 FEATURED IMAGE DÉFINIE AUTOMATIQUEMENT!');
      console.log('✅ Image mise en avant définie via Pexels');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ PROBLÈME AVEC LA FEATURED IMAGE');
      console.log('🔧 La featured image n\'a pas pu être définie automatiquement');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

setFeaturedImageAutomatically();
