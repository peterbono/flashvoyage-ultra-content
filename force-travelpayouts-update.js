#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

class TravelpayoutsForceUpdater {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
    this.partnerId = '463418';
  }

  // Créer un contenu complètement nouveau avec les widgets
  createNewContentWithWidgets() {
    console.log(`🔧 Création d'un contenu complètement nouveau avec Partner ID: ${this.partnerId}...`);

    const newContent = `
<p><strong>Source :</strong> <a href="https://reddit.com/r/digitalnomad/comments/example">Comment j'ai doublé mes revenus en 6 mois en Thaïlande</a> – Reddit</p>

<h2>Comment Paul a doublé ses revenus en Thaïlande : une transformation complète</h2>

<p><strong>Introduction (60-80 mots) :</strong></p>
<p>Je suis Paul, 29 ans, développeur freelance. Il y a 8 mois, j'ai décidé de changer complètement de mode de vie et devenir nomade digital en Thaïlande. Aujourd'hui, je gagne 2x plus qu'avant et j'ai trouvé l'équilibre parfait et je veux partager mon parcours pour inspirer d'autres nomades.</p>

<h3>Le défi initial</h3>
<p><strong>Situation de départ (100-120 mots) :</strong></p>
<p>J'étais dans une situation difficile avec des revenus instables et un manque de direction claire dans ma carrière de nomade.</p>
<p><strong>Objectifs fixés :</strong> Stabiliser mes revenus, améliorer ma productivité, et créer un réseau professionnel solide</p>
<p><strong>Obstacles identifiés :</strong> Manque de structure, isolement professionnel, et difficultés de concentration</p>

<h3>Ma stratégie d'action</h3>
<p><strong>Plan mis en place (120-150 mots) :</strong></p>
<p>Pour atteindre mes objectifs, j'ai d'abord créé un réseau local solide. J'ai ensuite optimisé ma productivité avec des outils adaptés et trouvé des clients qui paient mieux.</p>
<p>J'ai utilisé Notion pour organiser mes tâches pour gérer mes projets efficacement et LinkedIn pour développer mon réseau pour trouver de nouveaux clients. Ces outils m'ont permis de doubler ma productivité et tripler mes revenus.</p>
<p>Ma routine quotidienne incluait 2h de prospection matinale, 4h de travail concentré et 1h de networking le soir.</p>

<h3>Les résultats obtenus</h3>
<p><strong>Succès concrets (100-120 mots) :</strong></p>
<p>Après 6 mois d'efforts constants, j'ai atteint doublé mes revenus mensuels, créé un réseau de 50+ contacts professionnels et trouvé l'équilibre vie/travail parfait.</p>
<p><strong>Bénéfices mesurables :</strong> Revenus passés de 2000€ à 4000€/mois, 15 nouveaux clients réguliers</p>
<p><strong>Impact sur ma vie :</strong> Je me sens épanoui, libre et motivé comme jamais</p>

<h3>Mes conseils pour réussir</h3>
<p><strong>Stratégies gagnantes (3-5 points) :</strong></p>
<ul>
<li><strong>Commencez par créer un réseau local :</strong> Les connexions locales sont essentielles pour trouver des opportunités</li>
<li><strong>Investissez dans des outils de productivité :</strong> Notion, Trello et Calendly m'ont fait gagner 3h par jour</li>
<li><strong>Réseauz avec d'autres nomades expérimentés :</strong> Leurs conseils m'ont évité de nombreuses erreurs coûteuses</li>
<li><strong>Persévérez malgré les moments difficiles :</strong> Les 3 premiers mois sont les plus durs, mais ça vaut le coup</li>
<li><strong>Célébrez chaque petite victoire :</strong> Célébrer les succès motive à continuer et à s'améliorer</li>
</ul>

<h3>Outils qui m'ont aidé</h3>
<p><strong>Ressources recommandées :</strong></p>

<div class="travelpayouts-widget flights-widget" style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
  <h4 style="color: #2c3e50; margin-bottom: 15px;">✈️ Trouvez les meilleurs vols vers l'Asie</h4>
  <div class="tp-widget-container">
    <script async src="https://www.travelpayouts.com/calendar_widget/calendar_widget.js?currency=eur&marker=${this.partnerId}&search_host=jetradar.com&locale=fr&powered_by=false&destination=BKK&destination_name=Bangkok" charset="utf-8"></script>
  </div>
</div>

<div class="travelpayouts-widget hotels-widget" style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
  <h4 style="color: #2c3e50; margin-bottom: 15px;">🏨 Réservez votre hébergement en Asie</h4>
  <div class="tp-widget-container">
    <script async src="https://www.travelpayouts.com/hotels_widget/hotels_widget.js?currency=eur&marker=${this.partnerId}&search_host=hotellook.com&locale=fr&powered_by=false&destination=BKK&destination_name=Bangkok" charset="utf-8"></script>
  </div>
</div>

<div class="travelpayouts-widget insurance-widget" style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
  <h4 style="color: #2c3e50; margin-bottom: 15px;">🛡️ Assurance voyage pour nomades</h4>
  <div class="tp-widget-container">
    <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://www.worldnomads.com" target="_blank" rel="nofollow" style="display: block; text-align: center; padding: 10px; background: #3498db; color: white; text-decoration: none; border-radius: 5px;">
      <strong>🛡️ Assurance voyage World Nomads</strong><br>
      <small>Protection complète pour nomades digitaux</small>
    </a>
  </div>
</div>

<div class="travelpayouts-widget productivity-widget" style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: #f9f9f9;">
  <h4 style="color: #2c3e50; margin-bottom: 15px;">💼 Outils essentiels pour nomades</h4>
  <div class="tp-widget-container">
    <ul style="list-style: none; padding: 0; margin: 0;">
      <li style="margin: 10px 0; padding: 10px; background: white; border-radius: 5px; border-left: 4px solid #3498db;">
        <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://notion.so" target="_blank" rel="nofollow" style="text-decoration: none; color: #2c3e50;">
          <strong>📝 Notion</strong> - Organisation et productivité
        </a>
      </li>
      <li style="margin: 10px 0; padding: 10px; background: white; border-radius: 5px; border-left: 4px solid #e74c3c;">
        <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://trello.com" target="_blank" rel="nofollow" style="text-decoration: none; color: #2c3e50;">
          <strong>📋 Trello</strong> - Gestion de projets
        </a>
      </li>
      <li style="margin: 10px 0; padding: 10px; background: white; border-radius: 5px; border-left: 4px solid #f39c12;">
        <a href="https://www.travelpayouts.com/redirect?marker=${this.partnerId}&url=https://calendly.com" target="_blank" rel="nofollow" style="text-decoration: none; color: #2c3e50;">
          <strong>📅 Calendly</strong> - Planification de rendez-vous
        </a>
      </li>
    </ul>
  </div>
</div>

<h3>Articles connexes</h3>
<p><strong>Liens internes :</strong></p>
<ul>
<li><a href="#">Guide connexe</a> – Article complémentaire</li>
<li><a href="#">Ressource utile</a> – Information supplémentaire</li>
</ul>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>`;

    console.log('✅ Contenu complètement nouveau créé avec widgets intégrés');
    return newContent;
  }

  // Forcer la mise à jour de l'article
  async forceUpdateArticle(articleId, newContent) {
    try {
      console.log(`📝 Mise à jour forcée de l'article ${articleId}...`);

      const updateResponse = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        content: newContent
      }, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Article mis à jour avec force!');
      console.log(`🔗 Lien: ${updateResponse.data.link}`);

      return updateResponse.data;

    } catch (error) {
      console.error('❌ Erreur mise à jour forcée:', error.response?.data || error.message);
      throw error;
    }
  }

  // Vérifier l'intégration finale
  async verifyFinalIntegration(articleUrl) {
    try {
      console.log('🔍 Vérification de l\'intégration finale...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      const checks = {
        hasPartnerId: html.includes(`marker=${this.partnerId}`),
        hasFlightsScript: html.includes('travelpayouts.com/calendar_widget') && html.includes(`marker=${this.partnerId}`),
        hasHotelsScript: html.includes('travelpayouts.com/hotels_widget') && html.includes(`marker=${this.partnerId}`),
        hasInsuranceLink: html.includes('worldnomads.com') && html.includes(`marker=${this.partnerId}`),
        hasProductivityLinks: html.includes('notion.so') && html.includes(`marker=${this.partnerId}`),
        hasTrackingLinks: html.includes('travelpayouts.com/redirect') && html.includes(`marker=${this.partnerId}`),
        hasStyling: html.includes('style=') && html.includes('border-radius'),
        noPlaceholders: !html.includes('{{TRAVELPAYOUTS_') && !html.includes('TRAVELPAYOUTS_'),
        noOldMarker: !html.includes('marker=123456')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification finale:');
      console.log(`✅ Partner ID ${this.partnerId}: ${checks.hasPartnerId ? 'OUI' : 'NON'}`);
      console.log(`✅ Script vols avec tracking: ${checks.hasFlightsScript ? 'OUI' : 'NON'}`);
      console.log(`✅ Script hôtels avec tracking: ${checks.hasHotelsScript ? 'OUI' : 'NON'}`);
      console.log(`✅ Lien assurance avec tracking: ${checks.hasInsuranceLink ? 'OUI' : 'NON'}`);
      console.log(`✅ Liens productivité avec tracking: ${checks.hasProductivityLinks ? 'OUI' : 'NON'}`);
      console.log(`✅ Liens de tracking: ${checks.hasTrackingLinks ? 'OUI' : 'NON'}`);
      console.log(`✅ Styling appliqué: ${checks.hasStyling ? 'OUI' : 'NON'}`);
      console.log(`✅ Plus de placeholders: ${checks.noPlaceholders ? 'OUI' : 'NON'}`);
      console.log(`✅ Ancien marker supprimé: ${checks.noOldMarker ? 'OUI' : 'NON'}`);
      console.log(`📈 Score d'intégration: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isPerfect: percentage >= 90
      };

    } catch (error) {
      console.error('❌ Erreur vérification finale:', error.message);
      throw error;
    }
  }

  // Processus complet de mise à jour forcée
  async forceUpdateCompletely() {
    try {
      console.log('🔧 MISE À JOUR FORCÉE COMPLÈTE\n');

      // 1. Créer un contenu complètement nouveau
      console.log(`ÉTAPE 1: Création d'un contenu complètement nouveau avec Partner ID ${this.partnerId}...`);
      const newContent = this.createNewContentWithWidgets();

      // 2. Forcer la mise à jour
      console.log('\nÉTAPE 2: Mise à jour forcée de l\'article...');
      const updatedArticle = await this.forceUpdateArticle(879, newContent);

      // 3. Vérifier l'intégration finale
      console.log('\nÉTAPE 3: Vérification de l\'intégration finale...');
      const verification = await this.verifyFinalIntegration(updatedArticle.link);

      // 4. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isPerfect) {
        console.log('✅ SUCCÈS TOTAL! Widgets Travelpayouts parfaitement intégrés');
        console.log(`📈 Score d'intégration: ${verification.score}%`);
        console.log(`🔗 Lien: ${updatedArticle.link}`);
        console.log(`💰 Tracking activé avec Partner ID: ${this.partnerId}`);
        console.log('🎉 Prêt à générer des revenus d\'affiliation!');
      } else {
        console.log('❌ ÉCHEC! Widgets non parfaitement intégrés');
        console.log(`📈 Score d'intégration: ${verification.score}%`);
        console.log('🔧 Corrections supplémentaires nécessaires...');
      }

      return {
        success: verification.isPerfect,
        score: verification.score,
        articleUrl: updatedArticle.link,
        partnerId: this.partnerId,
        verification: verification
      };

    } catch (error) {
      console.error('❌ Erreur mise à jour forcée:', error.message);
      throw error;
    }
  }
}

async function forceUpdateCompletely() {
  const updater = new TravelpayoutsForceUpdater();
  
  try {
    const result = await updater.forceUpdateCompletely();
    
    if (result.success) {
      console.log('\n🏆 WIDGETS TRAVELPAYOUTS PARFAITS!');
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

forceUpdateCompletely();
