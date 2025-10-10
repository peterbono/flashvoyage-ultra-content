#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

class MinimalArticleCleaner {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
  }

  // Créer un contenu minimal et propre
  createMinimalContent() {
    console.log('🧹 Création d\'un contenu minimal et propre...');

    const minimalContent = `
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

<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%23f2685f&color_focused=%23f2685f&secondary=%23FFFFFF&dark=%2311100f&light=%23FFFFFF&special=%23C4C4C4&border_radius=5&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>

<h3>Articles connexes</h3>
<p><strong>Liens internes :</strong></p>
<ul>
<li><a href="#">Guide connexe</a> – Article complémentaire</li>
<li><a href="#">Ressource utile</a> – Information supplémentaire</li>
</ul>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du nomadisme en Asie.</em></p>`;

    console.log('✅ Contenu minimal créé');
    return minimalContent;
  }

  // Mettre à jour avec le contenu minimal
  async updateWithMinimalContent(articleId, minimalContent) {
    try {
      console.log(`📝 Mise à jour de l'article ${articleId} avec le contenu minimal...`);

      const updateResponse = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        content: minimalContent
      }, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Article mis à jour avec le contenu minimal!');
      console.log(`🔗 Lien: ${updateResponse.data.link}`);

      return updateResponse.data;

    } catch (error) {
      console.error('❌ Erreur mise à jour:', error.response?.data || error.message);
      throw error;
    }
  }

  // Vérifier que c'est minimal
  async verifyMinimal(articleUrl) {
    try {
      console.log('🔍 Vérification du contenu minimal...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      const checks = {
        hasWidget: html.includes('trpwdg.com/content'),
        hasPartnerId: html.includes('trs=463418'),
        hasCleanHTML: !html.includes('style=') && !html.includes('class='),
        hasStructure: html.includes('<h2>') && html.includes('<h3>') && html.includes('<ul>'),
        noComplexCSS: !html.includes('border-radius') && !html.includes('background:') && !html.includes('color:'),
        hasSimpleScript: html.includes('<script async') && html.includes('charset="utf-8"')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification minimal:');
      console.log(`✅ Widget présent: ${checks.hasWidget ? 'OUI' : 'NON'}`);
      console.log(`✅ Partner ID: ${checks.hasPartnerId ? 'OUI' : 'NON'}`);
      console.log(`✅ HTML propre: ${checks.hasCleanHTML ? 'OUI' : 'NON'}`);
      console.log(`✅ Structure: ${checks.hasStructure ? 'OUI' : 'NON'}`);
      console.log(`✅ Pas de CSS complexe: ${checks.noComplexCSS ? 'OUI' : 'NON'}`);
      console.log(`✅ Script simple: ${checks.hasSimpleScript ? 'OUI' : 'NON'}`);
      console.log(`📈 Score minimal: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isMinimal: percentage >= 80
      };

    } catch (error) {
      console.error('❌ Erreur vérification:', error.message);
      throw error;
    }
  }

  // Processus minimal
  async makeMinimal() {
    try {
      console.log('🧹 CRÉATION D\'UN CONTENU MINIMAL\n');

      // 1. Créer le contenu minimal
      console.log('ÉTAPE 1: Création du contenu minimal...');
      const minimalContent = this.createMinimalContent();

      // 2. Mettre à jour
      console.log('\nÉTAPE 2: Mise à jour avec le contenu minimal...');
      const updatedArticle = await this.updateWithMinimalContent(879, minimalContent);

      // 3. Vérifier
      console.log('\nÉTAPE 3: Vérification du contenu minimal...');
      const verification = await this.verifyMinimal(updatedArticle.link);

      // 4. Résultat
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isMinimal) {
        console.log('✅ SUCCÈS! Contenu minimal et propre');
        console.log(`📈 Score minimal: ${verification.score}%`);
        console.log(`🔗 Lien: ${updatedArticle.link}`);
        console.log('🎉 Article propre avec widget Travelpayouts simple!');
      } else {
        console.log('❌ ÉCHEC! Contenu pas assez minimal');
        console.log(`📈 Score minimal: ${verification.score}%`);
      }

      return {
        success: verification.isMinimal,
        score: verification.score,
        articleUrl: updatedArticle.link
      };

    } catch (error) {
      console.error('❌ Erreur:', error.message);
      throw error;
    }
  }
}

async function makeMinimal() {
  const cleaner = new MinimalArticleCleaner();
  
  try {
    const result = await cleaner.makeMinimal();
    
    if (result.success) {
      console.log('\n🏆 CONTENU MINIMAL CRÉÉ!');
      console.log('✅ Article propre avec widget Travelpayouts simple');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ CONTENU PAS ASSEZ MINIMAL');
      console.log('🔧 Ajustements nécessaires');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

makeMinimal();
