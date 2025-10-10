#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

class TravelpayoutsMarkerUpdater {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
    this.partnerId = '463418'; // Votre vrai Partner ID
  }

  // Créer des widgets avec le vrai Partner ID
  createRealTravelpayoutsWidgets() {
    console.log(`🔧 Création de widgets Travelpayouts avec Partner ID: ${this.partnerId}...`);

    const widgets = {
      flights: {
        name: 'Recherche de vols',
        html: `
<div class="travelpayouts-widget flights-widget">
  <h4>✈️ Trouvez les meilleurs vols vers l'Asie</h4>
  <div class="tp-widget-container">
    <script async src="https://www.travelpayouts.com/calendar_widget/calendar_widget.js?currency=eur&marker=${this.partnerId}&search_host=jetradar.com&locale=fr&powered_by=false&destination=BKK&destination_name=Bangkok" charset="utf-8"></script>
  </div>
</div>`,
        description: 'Widget de recherche de vols vers l\'Asie avec tracking'
      },
      
      hotels: {
        name: 'Recherche d\'hôtels',
        html: `
<div class="travelpayouts-widget hotels-widget">
  <h4>🏨 Réservez votre hébergement en Asie</h4>
  <div class="tp-widget-container">
    <script async src="https://www.travelpayouts.com/hotels_widget/hotels_widget.js?currency=eur&marker=${this.partnerId}&search_host=hotellook.com&locale=fr&powered_by=false&destination=BKK&destination_name=Bangkok" charset="utf-8"></script>
  </div>
</div>`,
        description: 'Widget de recherche d\'hôtels en Asie avec tracking'
      },
      
      insurance: {
        name: 'Assurance voyage',
        html: `
<div class="travelpayouts-widget insurance-widget">
  <h4>🛡️ Assurance voyage pour nomades</h4>
  <div class="tp-widget-container">
    <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://www.worldnomads.com" target="_blank" rel="nofollow">
      <img src="https://www.travelpayouts.com/partners/${this.partnerId}/worldnomads.png" alt="Assurance voyage World Nomads" style="max-width: 100%; height: auto;">
    </a>
  </div>
</div>`,
        description: 'Widget d\'assurance voyage avec tracking'
      },
      
      productivity: {
        name: 'Outils de productivité',
        html: `
<div class="travelpayouts-widget productivity-widget">
  <h4>💼 Outils essentiels pour nomades</h4>
  <div class="tp-widget-container">
    <ul style="list-style: none; padding: 0;">
      <li style="margin: 10px 0;">
        <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://notion.so" target="_blank" rel="nofollow">
          📝 Notion - Organisation et productivité
        </a>
      </li>
      <li style="margin: 10px 0;">
        <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://trello.com" target="_blank" rel="nofollow">
          📋 Trello - Gestion de projets
        </a>
      </li>
      <li style="margin: 10px 0;">
        <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://calendly.com" target="_blank" rel="nofollow">
          📅 Calendly - Planification de rendez-vous
        </a>
      </li>
    </ul>
  </div>
</div>`,
        description: 'Widget d\'outils de productivité avec tracking'
      }
    };

    console.log('✅ Widgets Travelpayouts créés avec Partner ID réel:');
    Object.keys(widgets).forEach(key => {
      console.log(`- ${widgets[key].name}: ${widgets[key].description}`);
    });

    return widgets;
  }

  // Remplacer les widgets existants par les nouveaux avec le vrai Partner ID
  replaceWidgetsWithRealMarker(content, widgets) {
    console.log('🔄 Remplacement des widgets avec le vrai Partner ID...');

    let updatedContent = content;

    // Remplacer les widgets existants par les nouveaux
    updatedContent = updatedContent.replace(
      /<div class="travelpayouts-widget flights-widget">[\s\S]*?<\/div>/g,
      widgets.flights.html
    );

    updatedContent = updatedContent.replace(
      /<div class="travelpayouts-widget hotels-widget">[\s\S]*?<\/div>/g,
      widgets.hotels.html
    );

    updatedContent = updatedContent.replace(
      /<div class="travelpayouts-widget insurance-widget">[\s\S]*?<\/div>/g,
      widgets.insurance.html
    );

    updatedContent = updatedContent.replace(
      /<div class="travelpayouts-widget productivity-widget">[\s\S]*?<\/div>/g,
      widgets.productivity.html
    );

    console.log('✅ Widgets remplacés avec le vrai Partner ID');
    return updatedContent;
  }

  // Mettre à jour l'article avec le vrai Partner ID
  async updateArticleWithRealMarker(articleId, widgets) {
    try {
      console.log(`📝 Mise à jour de l'article ${articleId} avec Partner ID ${this.partnerId}...`);

      // Récupérer l'article actuel
      const getResponse = await axios.get(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        auth: {
          username: this.username,
          password: this.password
        }
      });

      const article = getResponse.data;
      const originalContent = article.content.rendered;

      // Remplacer les widgets par les nouveaux avec le vrai Partner ID
      const updatedContent = this.replaceWidgetsWithRealMarker(originalContent, widgets);

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

      console.log('✅ Article mis à jour avec le vrai Partner ID Travelpayouts!');
      console.log(`🔗 Lien: ${updateResponse.data.link}`);

      return updateResponse.data;

    } catch (error) {
      console.error('❌ Erreur mise à jour article:', error.response?.data || error.message);
      throw error;
    }
  }

  // Vérifier l'intégration avec le vrai Partner ID
  async verifyRealMarkerIntegration(articleUrl) {
    try {
      console.log('🔍 Vérification de l\'intégration avec le vrai Partner ID...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      const checks = {
        hasRealMarker: html.includes(`marker=${this.partnerId}`),
        hasFlightsWidget: html.includes('travelpayouts.com/calendar_widget') && html.includes(`marker=${this.partnerId}`),
        hasHotelsWidget: html.includes('travelpayouts.com/hotels_widget') && html.includes(`marker=${this.partnerId}`),
        hasInsuranceWidget: html.includes('worldnomads.com') && html.includes(`marker=${this.partnerId}`),
        hasProductivityWidget: html.includes('notion.so') && html.includes(`marker=${this.partnerId}`),
        hasTrackingLinks: html.includes('travelpayouts.com/redirect') && html.includes(`marker=${this.partnerId}`),
        noOldMarker: !html.includes('marker=123456')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification avec Partner ID réel:');
      console.log(`✅ Partner ID ${this.partnerId}: ${checks.hasRealMarker ? 'OUI' : 'NON'}`);
      console.log(`✅ Widget vols avec tracking: ${checks.hasFlightsWidget ? 'OUI' : 'NON'}`);
      console.log(`✅ Widget hôtels avec tracking: ${checks.hasHotelsWidget ? 'OUI' : 'NON'}`);
      console.log(`✅ Widget assurance avec tracking: ${checks.hasInsuranceWidget ? 'OUI' : 'NON'}`);
      console.log(`✅ Widget productivité avec tracking: ${checks.hasProductivityWidget ? 'OUI' : 'NON'}`);
      console.log(`✅ Liens de tracking: ${checks.hasTrackingLinks ? 'OUI' : 'NON'}`);
      console.log(`✅ Ancien marker supprimé: ${checks.noOldMarker ? 'OUI' : 'NON'}`);
      console.log(`📈 Score d'intégration: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isIntegrated: percentage >= 90
      };

    } catch (error) {
      console.error('❌ Erreur vérification Partner ID:', error.message);
      throw error;
    }
  }

  // Processus complet de mise à jour avec le vrai Partner ID
  async updateWithRealMarker() {
    try {
      console.log('🔧 MISE À JOUR AVEC PARTNER ID RÉEL\n');

      // 1. Créer les widgets avec le vrai Partner ID
      console.log(`ÉTAPE 1: Création des widgets avec Partner ID ${this.partnerId}...`);
      const widgets = this.createRealTravelpayoutsWidgets();

      // 2. Mettre à jour l'article
      console.log('\nÉTAPE 2: Mise à jour de l\'article avec le vrai Partner ID...');
      const updatedArticle = await this.updateArticleWithRealMarker(879, widgets);

      // 3. Vérifier l'intégration
      console.log('\nÉTAPE 3: Vérification de l\'intégration...');
      const verification = await this.verifyRealMarkerIntegration(updatedArticle.link);

      // 4. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isIntegrated) {
        console.log('✅ SUCCÈS! Widgets Travelpayouts avec Partner ID réel intégrés');
        console.log(`📈 Score d'intégration: ${verification.score}%`);
        console.log(`🔗 Lien: ${updatedArticle.link}`);
        console.log(`💰 Tracking activé avec Partner ID: ${this.partnerId}`);
        console.log('🎉 Vous pouvez maintenant générer des revenus d\'affiliation!');
      } else {
        console.log('❌ ÉCHEC! Widgets non correctement intégrés');
        console.log(`📈 Score d'intégration: ${verification.score}%`);
        console.log('🔧 Corrections supplémentaires nécessaires...');
      }

      return {
        success: verification.isIntegrated,
        score: verification.score,
        articleUrl: updatedArticle.link,
        partnerId: this.partnerId,
        verification: verification
      };

    } catch (error) {
      console.error('❌ Erreur mise à jour Partner ID:', error.message);
      throw error;
    }
  }
}

async function updateWithRealMarker() {
  const updater = new TravelpayoutsMarkerUpdater();
  
  try {
    const result = await updater.updateWithRealMarker();
    
    if (result.success) {
      console.log('\n🏆 PARTNER ID RÉEL INTÉGRÉ!');
      console.log(`✅ Tracking activé avec Partner ID: ${result.partnerId}`);
      console.log('💰 Prêt à générer des revenus d\'affiliation!');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ CORRECTIONS NÉCESSAIRES');
      console.log('🔧 Les widgets nécessitent encore des ajustements');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

updateWithRealMarker();
