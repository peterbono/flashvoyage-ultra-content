#!/usr/bin/env node

/**
 * AUTO-CRITIC - Vérification critique automatique d'un article publié
 * Vérifie tous les éléments de qualité attendus
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

class AutoCritic {
  constructor() {
    this.auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    this.criticalIssues = [];
    this.warnings = [];
    this.successes = [];
  }

  async analyzeArticle(articleId) {
    console.log('\n🔍 AUTO-CRITIC - ANALYSE CRITIQUE');
    console.log('==================================\n');

    try {
      // Récupérer l'article
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
        headers: { 'Authorization': `Basic ${this.auth}` }
      });

      const article = response.data;
      const content = article.content.rendered;

      console.log(`📰 Article ID: ${article.id}`);
      console.log(`📝 Titre: ${article.title.rendered}`);
      console.log(`🔗 URL: ${article.link}\n`);

      // 1. Vérifier les widgets
      this.checkWidgets(content);

      // 2. Vérifier les placeholders
      this.checkPlaceholders(content);

      // 3. Vérifier l'intro FOMO
      this.checkFomoIntro(content);

      // 4. Vérifier le quote highlight
      this.checkQuoteHighlight(content);

      // 5. Vérifier les liens internes
      this.checkInternalLinks(content);

      // 6. Vérifier l'image featured
      this.checkFeaturedImage(article);

      // 7. Vérifier les catégories et tags
      this.checkCategoriesAndTags(article);

      // 8. Vérifier la structure
      this.checkStructure(content);

      // 9. Vérifier la longueur du contenu
      this.checkContentLength(content);

      // Afficher le résumé
      this.displaySummary();

      return {
        score: this.calculateScore(),
        criticalIssues: this.criticalIssues,
        warnings: this.warnings,
        successes: this.successes
      };

    } catch (error) {
      console.error('❌ Erreur:', error.message);
      throw error;
    }
  }

  checkWidgets(content) {
    console.log('🔧 VÉRIFICATION DES WIDGETS');
    console.log('----------------------------');

    const widgetCount = (content.match(/trpwdg\.com/g) || []).length;
    
    if (widgetCount === 0) {
      this.criticalIssues.push('❌ CRITIQUE: Aucun widget Travelpayouts trouvé');
      console.log('   ❌ Aucun widget trouvé\n');
    } else if (widgetCount < 2) {
      this.warnings.push(`⚠️ Seulement ${widgetCount} widget (recommandé: 2-4)`);
      console.log(`   ⚠️ ${widgetCount} widget (recommandé: 2-4)\n`);
    } else {
      this.successes.push(`✅ ${widgetCount} widgets Travelpayouts intégrés`);
      console.log(`   ✅ ${widgetCount} widgets intégrés\n`);
    }
  }

  checkPlaceholders(content) {
    console.log('🔍 VÉRIFICATION DES PLACEHOLDERS');
    console.log('--------------------------------');

    const placeholders = content.match(/\{\{?TRAVELPAYOUTS_\w+_WIDGET\}\}?/g);
    
    if (placeholders && placeholders.length > 0) {
      this.criticalIssues.push(`❌ CRITIQUE: ${placeholders.length} placeholders non remplacés`);
      console.log(`   ❌ ${placeholders.length} placeholders non remplacés:`);
      placeholders.forEach(p => console.log(`      - ${p}`));
      console.log('');
    } else {
      this.successes.push('✅ Aucun placeholder non remplacé');
      console.log('   ✅ Tous les placeholders remplacés\n');
    }
  }

  checkFomoIntro(content) {
    console.log('🔥 VÉRIFICATION INTRO FOMO');
    console.log('--------------------------');

    const hasFomo = content.includes('Pendant que vous') || 
                    content.includes('FlashVoyages, nous avons sélectionné');
    
    if (!hasFomo) {
      this.warnings.push('⚠️ Intro FOMO manquante ou non détectée');
      console.log('   ⚠️ Intro FOMO non détectée\n');
    } else {
      this.successes.push('✅ Intro FOMO présente');
      console.log('   ✅ Intro FOMO présente\n');
    }
  }

  checkQuoteHighlight(content) {
    console.log('💬 VÉRIFICATION QUOTE HIGHLIGHT');
    console.log('-------------------------------');

    const hasQuote = content.includes('wp-block-pullquote') || 
                     content.includes('<blockquote');
    const hasRedditUsername = content.includes('u/') && content.includes('Reddit');
    
    if (!hasQuote) {
      this.warnings.push('⚠️ Quote highlight manquant');
      console.log('   ⚠️ Pas de quote highlight\n');
    } else if (!hasRedditUsername) {
      this.warnings.push('⚠️ Quote sans username Reddit');
      console.log('   ⚠️ Quote présent mais sans username Reddit\n');
    } else {
      this.successes.push('✅ Quote highlight avec username Reddit');
      console.log('   ✅ Quote avec username Reddit\n');
    }
  }

  checkInternalLinks(content) {
    console.log('🔗 VÉRIFICATION LIENS INTERNES');
    console.log('------------------------------');

    const internalLinks = (content.match(/flashvoyage\.com/g) || []).length - 1; // -1 pour la source
    
    if (internalLinks === 0) {
      this.criticalIssues.push('❌ CRITIQUE: Aucun lien interne');
      console.log('   ❌ Aucun lien interne\n');
    } else if (internalLinks < 3) {
      this.warnings.push(`⚠️ Seulement ${internalLinks} liens internes (recommandé: 3-5)`);
      console.log(`   ⚠️ ${internalLinks} liens (recommandé: 3-5)\n`);
    } else {
      this.successes.push(`✅ ${internalLinks} liens internes`);
      console.log(`   ✅ ${internalLinks} liens internes\n`);
    }
  }

  checkFeaturedImage(article) {
    console.log('🖼️ VÉRIFICATION IMAGE FEATURED');
    console.log('------------------------------');

    if (!article.featured_media || article.featured_media === 0) {
      this.warnings.push('⚠️ Pas d\'image featured');
      console.log('   ⚠️ Pas d\'image featured\n');
    } else {
      this.successes.push('✅ Image featured présente');
      console.log(`   ✅ Image featured (ID: ${article.featured_media})\n`);
    }
  }

  checkCategoriesAndTags(article) {
    console.log('🏷️ VÉRIFICATION CATÉGORIES/TAGS');
    console.log('--------------------------------');

    const catCount = article.categories?.length || 0;
    const tagCount = article.tags?.length || 0;
    
    if (catCount === 0) {
      this.warnings.push('⚠️ Aucune catégorie');
      console.log('   ⚠️ Aucune catégorie\n');
    } else {
      this.successes.push(`✅ ${catCount} catégories`);
      console.log(`   ✅ ${catCount} catégories\n`);
    }
    
    if (tagCount === 0) {
      this.warnings.push('⚠️ Aucun tag');
      console.log('   ⚠️ Aucun tag\n');
    } else {
      this.successes.push(`✅ ${tagCount} tags`);
      console.log(`   ✅ ${tagCount} tags\n`);
    }
  }

  checkStructure(content) {
    console.log('📐 VÉRIFICATION STRUCTURE');
    console.log('-------------------------');

    const h2Count = (content.match(/<h2/g) || []).length;
    const h3Count = (content.match(/<h3/g) || []).length;
    
    if (h2Count === 0) {
      this.criticalIssues.push('❌ CRITIQUE: Aucun H2');
      console.log('   ❌ Aucun H2\n');
    } else {
      this.successes.push(`✅ ${h2Count} H2, ${h3Count} H3`);
      console.log(`   ✅ ${h2Count} H2, ${h3Count} H3\n`);
    }
  }

  checkContentLength(content) {
    console.log('📏 VÉRIFICATION LONGUEUR');
    console.log('------------------------');

    const textContent = content.replace(/<[^>]+>/g, '').trim();
    const wordCount = textContent.split(/\s+/).length;
    
    if (wordCount < 300) {
      this.criticalIssues.push(`❌ CRITIQUE: Contenu trop court (${wordCount} mots)`);
      console.log(`   ❌ Trop court: ${wordCount} mots (min: 300)\n`);
    } else if (wordCount < 500) {
      this.warnings.push(`⚠️ Contenu court (${wordCount} mots, recommandé: 500+)`);
      console.log(`   ⚠️ ${wordCount} mots (recommandé: 500+)\n`);
    } else {
      this.successes.push(`✅ ${wordCount} mots`);
      console.log(`   ✅ ${wordCount} mots\n`);
    }
  }

  calculateScore() {
    const totalChecks = this.criticalIssues.length + this.warnings.length + this.successes.length;
    const positiveScore = this.successes.length * 100;
    const warningPenalty = this.warnings.length * 10;
    const criticalPenalty = this.criticalIssues.length * 30;
    
    const score = Math.max(0, Math.round((positiveScore - warningPenalty - criticalPenalty) / totalChecks));
    return score;
  }

  displaySummary() {
    console.log('\n📊 RÉSUMÉ DE L\'ANALYSE');
    console.log('======================\n');

    const score = this.calculateScore();
    
    console.log(`🎯 SCORE GLOBAL: ${score}/100\n`);

    if (this.criticalIssues.length > 0) {
      console.log('❌ PROBLÈMES CRITIQUES:');
      this.criticalIssues.forEach(issue => console.log(`   ${issue}`));
      console.log('');
    }

    if (this.warnings.length > 0) {
      console.log('⚠️ AVERTISSEMENTS:');
      this.warnings.forEach(warning => console.log(`   ${warning}`));
      console.log('');
    }

    if (this.successes.length > 0) {
      console.log('✅ POINTS FORTS:');
      this.successes.forEach(success => console.log(`   ${success}`));
      console.log('');
    }

    // Verdict final
    if (score >= 90) {
      console.log('🏆 VERDICT: EXCELLENT - Article prêt pour la production !');
    } else if (score >= 70) {
      console.log('✅ VERDICT: BON - Quelques améliorations mineures possibles');
    } else if (score >= 50) {
      console.log('⚠️ VERDICT: MOYEN - Corrections recommandées');
    } else {
      console.log('❌ VERDICT: INSUFFISANT - Corrections urgentes nécessaires');
    }
    console.log('');
  }
}

// Exécution
const articleId = process.argv[2] || 997; // ID de l'article à analyser

const critic = new AutoCritic();
critic.analyzeArticle(articleId)
  .then(result => {
    process.exit(result.criticalIssues.length > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
  });

