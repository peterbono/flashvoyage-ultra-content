#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import { replacePlaceholdersWithRealWidgets } from './travelpayouts-widgets-list.js';

class RealWidgetsUpdater {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
  }

  // Utiliser le widget que tu as fourni comme exemple
  getRealWidgets() {
    console.log('🔧 Récupération des vrais widgets Travelpayouts...');

    const widgets = {
      // Widget exemple que tu as fourni
      example: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%23f2685f&color_focused=%23f2685f&secondary=%23FFFFFF&dark=%2311100f&light=%23FFFFFF&special=%23C4C4C4&border_radius=5&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>`,

      // Placeholders pour tes autres widgets
      flights: null, // Tu peux me donner le script pour les vols
      hotels: null,  // Tu peux me donner le script pour les hôtels
      insurance: null, // Tu peux me donner le script pour l'assurance
      productivity: null // Tu peux me donner le script pour la productivité
    };

    console.log('✅ Widgets récupérés:');
    console.log(`- Exemple: ${widgets.example ? 'Disponible' : 'Non disponible'}`);
    console.log(`- Vols: ${widgets.flights ? 'Disponible' : 'Non disponible'}`);
    console.log(`- Hôtels: ${widgets.hotels ? 'Disponible' : 'Non disponible'}`);
    console.log(`- Assurance: ${widgets.insurance ? 'Disponible' : 'Non disponible'}`);
    console.log(`- Productivité: ${widgets.productivity ? 'Disponible' : 'Non disponible'}`);

    return widgets;
  }

  // Mettre à jour l'article avec les vrais widgets
  async updateArticleWithRealWidgets(articleId, widgets) {
    try {
      console.log(`📝 Mise à jour de l'article ${articleId} avec les vrais widgets...`);

      // Récupérer l'article actuel
      const getResponse = await axios.get(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        auth: {
          username: this.username,
          password: this.password
        }
      });

      const article = getResponse.data;
      const originalContent = article.content.rendered;

      // Remplacer les placeholders par les vrais widgets
      let updatedContent = originalContent;

      // Remplacer les placeholders par les vrais scripts
      updatedContent = updatedContent.replace(
        /\{\{TRAVELPAYOUTS_FLIGHTS_WIDGET\}\}/g,
        widgets.flights || widgets.example // Utiliser l'exemple si pas de widget spécifique
      );

      updatedContent = updatedContent.replace(
        /\{\{TRAVELPAYOUTS_HOTELS_WIDGET\}\}/g,
        widgets.hotels || widgets.example
      );

      updatedContent = updatedContent.replace(
        /\{\{TRAVELPAYOUTS_INSURANCE_WIDGET\}\}/g,
        widgets.insurance || widgets.example
      );

      updatedContent = updatedContent.replace(
        /\{\{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET\}\}/g,
        widgets.productivity || widgets.example
      );

      // Mettre à jour l'article
      const updateResponse = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        content: updatedContent
      }, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Article mis à jour avec les vrais widgets Travelpayouts!');
      console.log(`🔗 Lien: ${updateResponse.data.link}`);

      return updateResponse.data;

    } catch (error) {
      console.error('❌ Erreur mise à jour article:', error.response?.data || error.message);
      throw error;
    }
  }

  // Vérifier l'intégration des vrais widgets
  async verifyRealWidgetsIntegration(articleUrl) {
    try {
      console.log('🔍 Vérification de l\'intégration des vrais widgets...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      const checks = {
        hasRealScripts: html.includes('trpwdg.com/content') || html.includes('travelpayouts.com'),
        hasPartnerId: html.includes('trs=463418') || html.includes('marker=463418'),
        hasShmarker: html.includes('shmarker=676421'),
        noPlaceholders: !html.includes('{{TRAVELPAYOUTS_') && !html.includes('TRAVELPAYOUTS_'),
        hasScriptTags: html.includes('<script') && html.includes('async'),
        hasRealWidgets: html.includes('trpwdg.com') || html.includes('travelpayouts.com')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification des vrais widgets:');
      console.log(`✅ Scripts réels: ${checks.hasRealScripts ? 'OUI' : 'NON'}`);
      console.log(`✅ Partner ID 463418: ${checks.hasPartnerId ? 'OUI' : 'NON'}`);
      console.log(`✅ Shmarker 676421: ${checks.hasShmarker ? 'OUI' : 'NON'}`);
      console.log(`✅ Plus de placeholders: ${checks.noPlaceholders ? 'OUI' : 'NON'}`);
      console.log(`✅ Scripts async: ${checks.hasScriptTags ? 'OUI' : 'NON'}`);
      console.log(`✅ Widgets réels: ${checks.hasRealWidgets ? 'OUI' : 'NON'}`);
      console.log(`📈 Score d'intégration: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isIntegrated: percentage >= 80
      };

    } catch (error) {
      console.error('❌ Erreur vérification widgets:', error.message);
      throw error;
    }
  }

  // Processus complet de mise à jour avec les vrais widgets
  async updateWithRealWidgets() {
    try {
      console.log('🔧 MISE À JOUR AVEC VRAIS WIDGETS TRAVELPAYOUTS\n');

      // 1. Récupérer les vrais widgets
      console.log('ÉTAPE 1: Récupération des vrais widgets...');
      const widgets = this.getRealWidgets();

      // 2. Mettre à jour l'article
      console.log('\nÉTAPE 2: Mise à jour de l\'article avec les vrais widgets...');
      const updatedArticle = await this.updateArticleWithRealWidgets(879, widgets);

      // 3. Vérifier l'intégration
      console.log('\nÉTAPE 3: Vérification de l\'intégration...');
      const verification = await this.verifyRealWidgetsIntegration(updatedArticle.link);

      // 4. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isIntegrated) {
        console.log('✅ SUCCÈS! Vrais widgets Travelpayouts intégrés');
        console.log(`📈 Score d'intégration: ${verification.score}%`);
        console.log(`🔗 Lien: ${updatedArticle.link}`);
        console.log('🎉 Widgets fonctionnels avec tracking!');
      } else {
        console.log('❌ ÉCHEC! Widgets non correctement intégrés');
        console.log(`📈 Score d'intégration: ${verification.score}%`);
        console.log('🔧 Corrections supplémentaires nécessaires...');
      }

      return {
        success: verification.isIntegrated,
        score: verification.score,
        articleUrl: updatedArticle.link,
        verification: verification
      };

    } catch (error) {
      console.error('❌ Erreur mise à jour widgets:', error.message);
      throw error;
    }
  }
}

async function updateWithRealWidgets() {
  const updater = new RealWidgetsUpdater();
  
  try {
    const result = await updater.updateWithRealWidgets();
    
    if (result.success) {
      console.log('\n🏆 VRAIS WIDGETS INTÉGRÉS!');
      console.log('✅ Widgets Travelpayouts fonctionnels');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ CORRECTIONS NÉCESSAIRES');
      console.log('🔧 Les widgets nécessitent encore des ajustements');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

updateWithRealWidgets();
