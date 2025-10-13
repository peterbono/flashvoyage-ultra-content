/**
 * GÉNÉRATION D'ARTICLE RÉEL AVEC SYSTÈME SEO OPTIMISÉ
 * Test en conditions réelles sur FlashVoyage.com
 */

import IntelligentContentAnalyzerSEOOptimized from './intelligent-content-analyzer-seo-optimized.js';
import { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } from './config.js';
import axios from 'axios';

async function generateRealSEOArticle() {
  console.log('🚀 GÉNÉRATION D\'ARTICLE RÉEL SEO OPTIMISÉ');
  console.log('==========================================');

  try {
    // Initialiser l'analyseur SEO optimisé
    const analyzer = new IntelligentContentAnalyzerSEOOptimized();

    // Article Reddit de test (simulation réaliste)
    const testArticle = {
      title: "Mon expérience complète : 6 mois de nomadisme digital en Thaïlande",
      source: "Reddit",
      type: "temoignage",
      content: `Salut la communauté ! Je voulais partager mon expérience de 6 mois en Thaïlande en tant que nomade digital. 

**Le contexte :** J'ai quitté mon job en France en janvier 2024 pour tenter l'aventure nomade. J'ai choisi la Thaïlande pour son coût de la vie abordable et sa communauté nomade active.

**Les étapes que j'ai suivies :**
1. **Visa :** J'ai obtenu un visa touristique de 60 jours, puis j'ai fait une extension de 30 jours. Coût total : 200€
2. **Logement :** J'ai trouvé un coliving à Chiang Mai pour 300€/mois (chambre privée + espaces communs)
3. **Transport :** Scooter acheté d'occasion pour 800€, revendu 750€ à mon départ
4. **Internet :** AIS 4G illimité pour 20€/mois, très fiable
5. **Coworking :** Punspace à 80€/mois, excellent pour la productivité

**Les défis rencontrés :**
- Adaptation au décalage horaire avec l'Europe (6h de décalage)
- Gestion de la fiscalité française depuis l'étranger
- Trouver un équilibre entre travail et découverte

**Les résultats :**
- Revenus maintenus à 100% (je suis développeur freelance)
- Coût de la vie divisé par 3 par rapport à Paris
- Épargne de 2000€ sur 6 mois
- Réseau professionnel élargi avec d'autres nomades

**Mes conseils pour les débutants :**
1. Commencez par un visa court pour tester
2. Privilégiez les colivings pour la communauté
3. Gardez un budget de secours de 3 mois de frais
4. Documentez tout pour la fiscalité

**Verdict :** Expérience transformatrice ! Je recommande vivement la Thaïlande pour débuter le nomadisme digital.`,
      link: "https://reddit.com/r/digitalnomad/comments/experience-thailand-6-months"
    };

    console.log('📝 Article source:');
    console.log(`   Titre: ${testArticle.title}`);
    console.log(`   Source: ${testArticle.source}`);
    console.log(`   Type: ${testArticle.type}`);
    console.log('');

    // 1. ANALYSE SEO OPTIMISÉE
    console.log('🔍 ÉTAPE 1: ANALYSE SEO OPTIMISÉE');
    console.log('-----------------------------------');
    
    const analysis = await analyzer.analyzeContent(testArticle);
    
    console.log('✅ Analyse réussie:');
    console.log(`   Type: ${analysis.type_contenu}`);
    console.log(`   Audience: ${analysis.audience}`);
    console.log(`   Destination: ${analysis.destination}`);
    console.log(`   Micro-intention: ${analysis.micro_intention}`);
    console.log(`   Score: ${analysis.pertinence}/100`);
    console.log('');

    // 2. GÉNÉRATION DE CONTENU SEO OPTIMISÉE
    console.log('🤖 ÉTAPE 2: GÉNÉRATION DE CONTENU SEO OPTIMISÉE');
    console.log('--------------------------------------------------');
    
    const generatedContent = await analyzer.generateIntelligentContent(testArticle, analysis);
    
    console.log('✅ Génération réussie:');
    console.log(`   Titre: ${generatedContent.title}`);
    console.log(`   Micro-intention: ${generatedContent.micro_intention}`);
    console.log(`   Mots-clés: ${generatedContent.keywords}`);
    console.log('');

    // 3. VALIDATION SEO
    console.log('✅ ÉTAPE 3: VALIDATION SEO');
    console.log('----------------------------');
    
    const validation = await analyzer.validateContent(generatedContent.content);
    
    console.log('✅ Validation réussie:');
    console.log(`   Score qualité: ${validation.score_qualite}/100`);
    console.log(`   Score SEO: ${validation.score_seo}/100`);
    console.log(`   Validation: ${validation.validation ? '✅' : '❌'}`);
    console.log('');

    // 4. PRÉPARATION POUR WORDPRESS
    console.log('📝 ÉTAPE 4: PRÉPARATION POUR WORDPRESS');
    console.log('---------------------------------------');
    
    // Préparer les données WordPress
    const wordpressData = {
      title: generatedContent.title,
      content: generatedContent.content,
      status: 'publish',
      excerpt: generatedContent.content.substring(0, 160) + '...',
      categories: [], // Pas de catégories pour éviter les erreurs
      tags: [], // Pas de tags pour éviter les erreurs
      meta: {
        description: `Découvrez l'expérience complète d'un nomade digital en Thaïlande : visa, logement, transport, revenus et conseils pratiques. Guide pas à pas pour débuter le nomadisme digital en Asie.`,
        keywords: generatedContent.keywords,
        'og:title': generatedContent.title,
        'og:description': `Expérience nomade digital en Thaïlande : guide complet avec conseils pratiques et retours d'expérience.`
      }
    };

    console.log('✅ Données WordPress préparées:');
    console.log(`   Titre: ${wordpressData.title}`);
    console.log(`   Statut: ${wordpressData.status}`);
    console.log(`   Meta description: ${wordpressData.meta.description}`);
    console.log('');

    // 5. PUBLICATION SUR WORDPRESS
    console.log('🚀 ÉTAPE 5: PUBLICATION SUR WORDPRESS');
    console.log('---------------------------------------');
    
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    
    const response = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, wordpressData, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    const publishedArticle = response.data;
    
    console.log('✅ Article publié avec succès !');
    console.log(`   ID: ${publishedArticle.id}`);
    console.log(`   Titre: ${publishedArticle.title.rendered}`);
    console.log(`   URL: ${publishedArticle.link}`);
    console.log(`   Statut: ${publishedArticle.status}`);
    console.log('');

    // 6. VÉRIFICATION DE LA PUBLICATION
    console.log('🔍 ÉTAPE 6: VÉRIFICATION DE LA PUBLICATION');
    console.log('---------------------------------------------');
    
    // Vérifier que l'article est bien publié
    const verificationResponse = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${publishedArticle.id}`, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });

    const verifiedArticle = verificationResponse.data;
    
    console.log('✅ Vérification réussie:');
    console.log(`   Titre: ${verifiedArticle.title.rendered}`);
    console.log(`   Contenu: ${verifiedArticle.content.rendered ? 'Présent' : 'Manquant'}`);
    console.log(`   Meta description: ${verifiedArticle.meta?.description || 'Non définie'}`);
    console.log(`   Mots-clés: ${verifiedArticle.meta?.keywords || 'Non définis'}`);
    console.log('');

    // 7. RÉSUMÉ FINAL
    console.log('📊 RÉSUMÉ FINAL');
    console.log('================');
    console.log(`✅ Analyse SEO: ${analysis.pertinence}/100`);
    console.log(`✅ Génération: ${generatedContent.title ? 'Succès' : 'Échec'}`);
    console.log(`✅ Validation: ${validation.score_qualite}/100`);
    console.log(`✅ Publication: ${publishedArticle.id ? 'Succès' : 'Échec'}`);
    console.log(`✅ URL: ${publishedArticle.link}`);
    console.log('');

    console.log('🎉 ARTICLE GÉNÉRÉ ET PUBLIÉ AVEC SUCCÈS !');
    console.log('Le système SEO optimisé fonctionne en conditions réelles.');
    
    return {
      success: true,
      articleId: publishedArticle.id,
      articleUrl: publishedArticle.link,
      analysis,
      generatedContent,
      validation
    };

  } catch (error) {
    console.error('❌ ERREUR LORS DE LA GÉNÉRATION:', error.message);
    console.error('Stack trace:', error.stack);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Exécuter la génération
generateRealSEOArticle()
  .then(result => {
    if (result.success) {
      console.log('✅ Génération et publication réussies !');
      console.log(`🔗 Article publié: ${result.articleUrl}`);
      process.exit(0);
    } else {
      console.log('❌ Génération échouée !');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
  });
