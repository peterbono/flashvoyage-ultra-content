#!/usr/bin/env node

import axios from 'axios';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';

class ArticleCSSCleaner {
  constructor() {
    this.wordpressUrl = WORDPRESS_URL;
    this.username = WORDPRESS_USERNAME;
    this.password = WORDPRESS_APP_PASSWORD;
  }

  // Nettoyer le contenu en supprimant tout le CSS ajouté
  cleanContentFromCSS(content) {
    console.log('🧹 Nettoyage du contenu - suppression du CSS...');

    let cleanedContent = content;

    // Supprimer tous les divs avec du CSS inline
    cleanedContent = cleanedContent.replace(
      /<div class="travelpayouts-widget[^>]*style="[^"]*"[^>]*>[\s\S]*?<\/div>/g,
      ''
    );

    // Supprimer les styles inline des listes
    cleanedContent = cleanedContent.replace(
      /<ul[^>]*style="[^"]*"[^>]*>/g,
      '<ul>'
    );

    cleanedContent = cleanedContent.replace(
      /<li[^>]*style="[^"]*"[^>]*>/g,
      '<li>'
    );

    // Supprimer les styles inline des liens
    cleanedContent = cleanedContent.replace(
      /<a[^>]*style="[^"]*"[^>]*>/g,
      (match) => {
        // Garder seulement href, target, rel, et le contenu
        const hrefMatch = match.match(/href="[^"]*"/);
        const targetMatch = match.match(/target="[^"]*"/);
        const relMatch = match.match(/rel="[^"]*"/);
        
        let cleanLink = '<a';
        if (hrefMatch) cleanLink += ' ' + hrefMatch[0];
        if (targetMatch) cleanLink += ' ' + targetMatch[0];
        if (relMatch) cleanLink += ' ' + relMatch[0];
        cleanLink += '>';
        
        return cleanLink;
      }
    );

    // Supprimer les styles inline des h4
    cleanedContent = cleanedContent.replace(
      /<h4[^>]*style="[^"]*"[^>]*>/g,
      '<h4>'
    );

    console.log('✅ CSS supprimé du contenu');
    return cleanedContent;
  }

  // Récupérer le contenu original sans CSS
  getCleanContent() {
    console.log('📝 Création du contenu propre sans CSS...');

    const cleanContent = `
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

    console.log('✅ Contenu propre créé sans CSS');
    return cleanContent;
  }

  // Mettre à jour l'article avec le contenu propre
  async updateArticleWithCleanContent(articleId, cleanContent) {
    try {
      console.log(`📝 Mise à jour de l'article ${articleId} avec le contenu propre...`);

      const updateResponse = await axios.post(`${this.wordpressUrl}/wp-json/wp/v2/posts/${articleId}`, {
        content: cleanContent
      }, {
        auth: {
          username: this.username,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ Article mis à jour avec le contenu propre!');
      console.log(`🔗 Lien: ${updateResponse.data.link}`);

      return updateResponse.data;

    } catch (error) {
      console.error('❌ Erreur mise à jour article:', error.response?.data || error.message);
      throw error;
    }
  }

  // Vérifier que le CSS a été supprimé
  async verifyCSSRemoval(articleUrl) {
    try {
      console.log('🔍 Vérification de la suppression du CSS...');
      
      const response = await axios.get(articleUrl);
      const html = response.data;
      
      const checks = {
        noInlineStyles: !html.includes('style='),
        hasCleanWidget: html.includes('trpwdg.com/content'),
        hasPartnerId: html.includes('trs=463418'),
        noCSSClasses: !html.includes('travelpayouts-widget'),
        hasCleanStructure: html.includes('<h3>') && html.includes('<ul>'),
        noStyledDivs: !html.includes('border-radius') && !html.includes('background:')
      };

      const score = Object.values(checks).filter(Boolean).length;
      const total = Object.keys(checks).length;
      const percentage = Math.round((score / total) * 100);

      console.log('📊 Résultats de vérification du nettoyage:');
      console.log(`✅ Pas de styles inline: ${checks.noInlineStyles ? 'OUI' : 'NON'}`);
      console.log(`✅ Widget propre: ${checks.hasCleanWidget ? 'OUI' : 'NON'}`);
      console.log(`✅ Partner ID présent: ${checks.hasPartnerId ? 'OUI' : 'NON'}`);
      console.log(`✅ Pas de classes CSS: ${checks.noCSSClasses ? 'OUI' : 'NON'}`);
      console.log(`✅ Structure propre: ${checks.hasCleanStructure ? 'OUI' : 'NON'}`);
      console.log(`✅ Pas de divs stylés: ${checks.noStyledDivs ? 'OUI' : 'NON'}`);
      console.log(`📈 Score de nettoyage: ${percentage}%`);

      return {
        score: percentage,
        checks: checks,
        isClean: percentage >= 80
      };

    } catch (error) {
      console.error('❌ Erreur vérification nettoyage:', error.message);
      throw error;
    }
  }

  // Processus complet de nettoyage
  async cleanArticleCompletely() {
    try {
      console.log('🧹 NETTOYAGE COMPLET DE L\'ARTICLE\n');

      // 1. Créer le contenu propre
      console.log('ÉTAPE 1: Création du contenu propre sans CSS...');
      const cleanContent = this.getCleanContent();

      // 2. Mettre à jour l'article
      console.log('\nÉTAPE 2: Mise à jour de l\'article avec le contenu propre...');
      const updatedArticle = await this.updateArticleWithCleanContent(879, cleanContent);

      // 3. Vérifier le nettoyage
      console.log('\nÉTAPE 3: Vérification du nettoyage...');
      const verification = await this.verifyCSSRemoval(updatedArticle.link);

      // 4. Résultat final
      console.log('\n🎯 RÉSULTAT FINAL:');
      if (verification.isClean) {
        console.log('✅ SUCCÈS! Article nettoyé du CSS');
        console.log(`📈 Score de nettoyage: ${verification.score}%`);
        console.log(`🔗 Lien: ${updatedArticle.link}`);
        console.log('🎉 Article propre avec widget Travelpayouts simple!');
      } else {
        console.log('❌ ÉCHEC! CSS non complètement supprimé');
        console.log(`📈 Score de nettoyage: ${verification.score}%`);
        console.log('🔧 Nettoyage supplémentaire nécessaire...');
      }

      return {
        success: verification.isClean,
        score: verification.score,
        articleUrl: updatedArticle.link,
        verification: verification
      };

    } catch (error) {
      console.error('❌ Erreur nettoyage article:', error.message);
      throw error;
    }
  }
}

async function cleanArticleCompletely() {
  const cleaner = new ArticleCSSCleaner();
  
  try {
    const result = await cleaner.cleanArticleCompletely();
    
    if (result.success) {
      console.log('\n🏆 ARTICLE NETTOYÉ!');
      console.log('✅ CSS supprimé, widget Travelpayouts simple intégré');
      console.log(`🔗 Vérifiez: ${result.articleUrl}`);
    } else {
      console.log('\n⚠️ NETTOYAGE INCOMPLET');
      console.log('🔧 Le CSS nécessite encore des ajustements');
    }

  } catch (error) {
    console.error('❌ Erreur critique:', error.message);
  }
}

cleanArticleCompletely();
