#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// Vérification des variables d'environnement requises
if (!WORDPRESS_URL || !WORDPRESS_USERNAME || !WORDPRESS_APP_PASSWORD || !PEXELS_API_KEY) {
  console.error('❌ Variables d\'environnement manquantes. Vérifiez votre fichier .env');
  process.exit(1);
}

class PointsGuyStyleGenerator {
  constructor() {
    this.publishedArticles = new Set();
  }

  async loadPublishedArticles() {
    try {
      console.log('📚 Chargement des articles déjà publiés...');
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      response.data.forEach(post => {
        const title = post.title.rendered.toLowerCase().trim();
        this.publishedArticles.add(title);
      });
      
      console.log(`✅ ${this.publishedArticles.size} articles déjà publiés chargés`);
    } catch (error) {
      console.warn('⚠️ Impossible de charger les articles existants:', error.message);
    }
  }

  isArticleAlreadyPublished(title) {
    const normalizedTitle = title.toLowerCase().trim();
    return this.publishedArticles.has(normalizedTitle);
  }

  async callRSSMonitorMCP(method, params) {
    try {
      console.log(`📡 Appel au serveur RSS HTTP: ${method}`);
      
      const response = await axios.post(`http://localhost:3003/mcp`, {
        jsonrpc: "2.0",
        method: "rss/monitor_feeds",
        params: params || { feedType: 'all' },
        id: 1
      });
      
      if (response.data.result) {
        console.log(`✅ ${response.data.result.length} articles RSS récupérés`);
        return response.data.result;
      } else {
        throw new Error('Aucun résultat du serveur RSS');
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'appel au serveur RSS:', error.message);
      throw error;
    }
  }

  // Style The Points Guy - Titres conversationnels
  generatePointsGuyTitle(article, destination, articleType) {
    const destinationFrench = destination === 'china' ? 'Chine' :
                             destination === 'korea' ? 'Corée du Sud' :
                             destination === 'japan' ? 'Japon' :
                             destination === 'vietnam' ? 'Vietnam' :
                             destination === 'thailand' ? 'Thaïlande' :
                             destination === 'singapore' ? 'Singapour' :
                             destination === 'malaysia' ? 'Malaisie' :
                             destination === 'indonesia' ? 'Indonésie' :
                             destination === 'philippines' ? 'Philippines' :
                             destination === 'taiwan' ? 'Taïwan' :
                             destination === 'hong kong' ? 'Hong Kong' :
                             destination;

    const title = article.title.toLowerCase();
    
    // Détecter le vrai contenu
    let specificInfo = '';
    let urgencyLevel = 'normal';
    let realType = 'actualité';

    if (title.includes('free') && (title.includes('ticket') || title.includes('flight'))) {
      specificInfo = 'vols gratuits';
      urgencyLevel = 'high';
      realType = 'deals';
    } else if (title.includes('visa-free') || title.includes('visa free')) {
      specificInfo = 'visa gratuit';
      urgencyLevel = 'high';
      realType = 'visa';
    } else if (title.includes('e-arrival cards')) {
      specificInfo = 'cartes d\'arrivée électroniques';
      urgencyLevel = 'high';
      realType = 'formalités';
    } else if (title.includes('biometric borders')) {
      specificInfo = 'frontières biométriques';
      urgencyLevel = 'high';
      realType = 'formalités';
    } else if (title.includes('power bank restrictions')) {
      specificInfo = 'restrictions batteries';
      urgencyLevel = 'high';
      realType = 'sécurité';
    }

    // Titres style The Points Guy
    const pointsGuyTemplates = {
      'vols gratuits': [
        `${destinationFrench} offre des vols gratuits aux touristes — voici comment en profiter`,
        `Deal alert : ${destinationFrench} lance 200 000 vols gratuits pour les voyageurs internationaux`,
        `Pourquoi ${destinationFrench} donne des vols gratuits (et comment les obtenir)`
      ],
      'visa gratuit': [
        `${destinationFrench} supprime les visas pour les Français — ce que ça change pour vous`,
        `Bonne nouvelle : ${destinationFrench} offre maintenant des visas gratuits`,
        `Comment voyager en ${destinationFrench} sans visa (et économiser 25€)`
      ],
      'cartes d\'arrivée électroniques': [
        `Nouvelles cartes d'arrivée électroniques en Asie — ce que vous devez savoir`,
        `Pourquoi l'Asie passe aux cartes d'arrivée électroniques (et comment s'y préparer)`,
        `Cartes d'arrivée électroniques en Asie : tout ce qui change en octobre 2024`
      ],
      'frontières biométriques': [
        `Frontières biométriques en Europe : comment ça marche pour les voyageurs français`,
        `Nouveaux contrôles biométriques en Europe — préparez-vous à ces changements`,
        `Pourquoi l'Europe instaure des frontières biométriques (et ce que ça signifie pour vous)`
      ],
      'restrictions batteries': [
        `Nouvelles restrictions de batteries au Moyen-Orient — ce que vous devez savoir`,
        `Pourquoi le Moyen-Orient durcit les règles sur les batteries de téléphone`,
        `Restrictions batteries au Moyen-Orient : comment voyager sans encombre`
      ]
    };

    const templates = pointsGuyTemplates[specificInfo] || [
      `${destinationFrench} : ce que vous devez savoir sur cette actualité voyage`,
      `Pourquoi cette info sur ${destinationFrench} va changer votre façon de voyager`,
      `${destinationFrench} : une actualité qui va impacter vos prochains voyages`
    ];
    
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    
    console.log(`🎯 Titre style The Points Guy: ${randomTemplate}`);
    console.log(`📊 Info spécifique: ${specificInfo}`);
    console.log(`🏷️ Type: ${realType}`);
    console.log(`⚡ Urgence: ${urgencyLevel}`);
    
    return {
      title: randomTemplate,
      specificInfo,
      realType,
      urgency: urgencyLevel
    };
  }

  // Style The Points Guy - Contenu conversationnel
  generatePointsGuyContent(article, destination, specificInfo, realType, urgency) {
    const destinationFrench = destination === 'china' ? 'Chine' :
                             destination === 'korea' ? 'Corée du Sud' :
                             destination === 'japan' ? 'Japon' :
                             destination === 'vietnam' ? 'Vietnam' :
                             destination === 'thailand' ? 'Thaïlande' :
                             destination === 'singapore' ? 'Singapour' :
                             destination === 'malaysia' ? 'Malaisie' :
                             destination === 'indonesia' ? 'Indonésie' :
                             destination === 'philippines' ? 'Philippines' :
                             destination === 'taiwan' ? 'Taïwan' :
                             destination === 'hong kong' ? 'Hong Kong' :
                             destination;

    return `
<p><strong>Source :</strong> <a href="${article.link}" target="_blank" rel="noopener">${article.title}</a> - Travel And Tour World</p>

<p>Si vous prévoyez de voyager en Asie dans les prochains mois, cette actualité va probablement changer la donne. Voici ce que nous savons — et ce que vous devez faire.</p>

<h5>Pourquoi cette info est importante</h5>
<p>Cette nouvelle sur ${specificInfo} en ${destinationFrench} n'est pas juste une actualité de plus. C'est le genre d'info qui peut faire la différence entre un voyage fluide et un cauchemar administratif.</p>

<p>Chez FlashVoyages, on suit ces évolutions de près parce qu'on sait que nos lecteurs comptent sur nous pour anticiper les changements qui vont impacter leurs voyages.</p>

<h5>Ce qui change concrètement</h5>
<p>Voici ce que vous devez retenir :</p>

<ul>
<li><strong>${specificInfo} :</strong> ${this.getSpecificDetails(specificInfo)}</li>
<li><strong>Quand :</strong> ${this.getTimeline(specificInfo)}</li>
<li><strong>Pour qui :</strong> Tous les voyageurs français</li>
<li><strong>Impact :</strong> ${this.getImpact(specificInfo)}</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>${this.getPersonalAdvice(specificInfo, destinationFrench)}</p>

<p>On vous recommande de ${this.getActionAdvice(specificInfo)}. C'est le genre de changement qu'on voit venir, et mieux vaut être préparé.</p>

<h5>Contexte Asie</h5>
<p>Cette évolution s'inscrit dans une tendance plus large : l'Asie modernise ses procédures de voyage. ${this.getAsiaContext(specificInfo, destinationFrench)}</p>

<p>C'est une bonne nouvelle pour les voyageurs français — ça signifie des procédures plus fluides et moins de paperasserie.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> 85/100 — Information cruciale</p>
<p><strong>Pourquoi c'est important :</strong> ${this.getWhyImportant(specificInfo)}</p>
<p><strong>Action recommandée :</strong> ${this.getRecommendedAction(specificInfo)}</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — votre spécialiste du voyage en Asie.</em></p>
`;
  }

  getSpecificDetails(specificInfo) {
    const details = {
      'vols gratuits': '200 000 places disponibles pour les touristes internationaux',
      'visa gratuit': 'Suppression des frais de visa pour les ressortissants français',
      'cartes d\'arrivée électroniques': 'Nouveaux formulaires numériques obligatoires à l\'arrivée',
      'frontières biométriques': 'Contrôles d\'empreintes digitales et reconnaissance faciale',
      'restrictions batteries': 'Nouvelles limitations sur les batteries de téléphone et ordinateur'
    };
    return details[specificInfo] || 'Détails spécifiques à confirmer';
  }

  getTimeline(specificInfo) {
    const timelines = {
      'vols gratuits': 'Janvier-juin 2025',
      'visa gratuit': 'Immédiatement',
      'cartes d\'arrivée électroniques': 'Octobre 2024',
      'frontières biométriques': 'Octobre 2024',
      'restrictions batteries': 'Octobre 2024'
    };
    return timelines[specificInfo] || 'À confirmer';
  }

  getImpact(specificInfo) {
    const impacts = {
      'vols gratuits': 'Économies de 300-800€ par voyage',
      'visa gratuit': 'Économies de 25€ + gain de temps',
      'cartes d\'arrivée électroniques': 'Procédures d\'arrivée plus rapides',
      'frontières biométriques': 'Contrôles plus stricts mais plus rapides',
      'restrictions batteries': 'Limitations sur les appareils électroniques'
    };
    return impacts[specificInfo] || 'Impact à évaluer';
  }

  getPersonalAdvice(specificInfo, destination) {
    const advice = {
      'vols gratuits': `On a testé ce genre d'offre avant, et c'est du pur bonheur. ${destination} fait vraiment des efforts pour attirer les touristes français.`,
      'visa gratuit': `C'est exactement le genre de nouvelle qu'on attendait ! ${destination} simplifie vraiment les choses pour nous.`,
      'cartes d\'arrivée électroniques': `On vous conseille de vous renseigner avant de partir. Ces nouvelles procédures peuvent faire gagner du temps.`,
      'frontières biométriques': `Pas de panique, c'est juste une formalité de plus. Mais mieux vaut être préparé.`,
      'restrictions batteries': `Attention à vos appareils électroniques. Ces nouvelles règles peuvent surprendre.`
    };
    return advice[specificInfo] || `Cette évolution en ${destination} mérite votre attention.`;
  }

  getActionAdvice(specificInfo) {
    const actions = {
      'vols gratuits': 'réserver rapidement — ces offres partent vite',
      'visa gratuit': 'profiter de cette simplification immédiatement',
      'cartes d\'arrivée électroniques': 'vous renseigner sur les nouvelles procédures',
      'frontières biométriques': 'préparer vos documents en conséquence',
      'restrictions batteries': 'vérifier les nouvelles limitations avant de partir'
    };
    return actions[specificInfo] || 'rester informé des évolutions';
  }

  getAsiaContext(specificInfo, destination) {
    const contexts = {
      'vols gratuits': 'Les pays asiatiques rivalisent d\'ingéniosité pour attirer les touristes français.',
      'visa gratuit': 'L\'Asie s\'ouvre de plus en plus aux voyageurs français.',
      'cartes d\'arrivée électroniques': 'L\'Asie digitalise ses procédures d\'entrée pour fluidifier les voyages.',
      'frontières biométriques': 'L\'Asie renforce ses contrôles tout en modernisant ses infrastructures.',
      'restrictions batteries': 'L\'Asie adapte ses règles de sécurité aux nouvelles technologies.'
    };
    return contexts[specificInfo] || `${destination} confirme sa position de destination de choix pour les Français.`;
  }

  getWhyImportant(specificInfo) {
    const reasons = {
      'vols gratuits': 'Opportunité d\'économies significatives sur vos voyages',
      'visa gratuit': 'Simplification majeure des procédures administratives',
      'cartes d\'arrivée électroniques': 'Changement concret dans vos procédures de voyage',
      'frontières biométriques': 'Nouvelle réalité des contrôles frontaliers',
      'restrictions batteries': 'Impact direct sur vos appareils électroniques'
    };
    return reasons[specificInfo] || 'Information pertinente pour vos voyages';
  }

  getRecommendedAction(specificInfo) {
    const actions = {
      'vols gratuits': 'Réserver immédiatement',
      'visa gratuit': 'Profiter de la simplification',
      'cartes d\'arrivée électroniques': 'Se renseigner sur les nouvelles procédures',
      'frontières biométriques': 'Préparer ses documents',
      'restrictions batteries': 'Vérifier les limitations'
    };
    return actions[specificInfo] || 'Rester informé';
  }

  async searchPexelsImage(query) {
    try {
      const response = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
        headers: {
          'Authorization': PEXELS_API_KEY
        }
      });
      
      if (response.data.photos && response.data.photos.length > 0) {
        const photo = response.data.photos[0];
        return {
          src: {
            large: photo.src.large
          },
          alt: photo.alt || query
        };
      }
      return null;
    } catch (error) {
      console.error('Error searching Pexels:', error.message);
      return null;
    }
  }

  async uploadImageToWordPress(imageUrl, title) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });

      const formData = new FormData();
      const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
      const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50)}.jpeg`;
      formData.append('file', blob, filename);

      const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, formData, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        },
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'image/jpeg'
        }
      });
      return uploadResponse.data;
    } catch (error) {
      console.error("Error uploading image to WordPress:", error.response ? error.response.data : error.message);
      return null;
    }
  }

  async getOrCreateCategory(categoryName) {
    try {
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?search=${categoryName}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      if (response.data.length > 0) {
        return response.data[0].id;
      }

      const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
        name: categoryName,
        description: `Articles sur ${categoryName}`
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      return createResponse.data.id;
    } catch (error) {
      console.error('Error with category:', error.message);
      return 1;
    }
  }

  async getOrCreateTags(tagNames) {
    const tagIds = [];
    
    for (const tagName of tagNames) {
      if (!tagName || tagName.trim() === '') continue;
      
      try {
        const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${tagName}`, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });

        if (response.data.length > 0) {
          tagIds.push(response.data[0].id);
          console.log(`✅ Tag trouvé: ${tagName} (ID: ${response.data[0].id})`);
        } else {
          const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
            name: tagName
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          tagIds.push(createResponse.data.id);
          console.log(`➕ Création du tag: ${tagName} (ID: ${createResponse.data.id})`);
        }
      } catch (error) {
        console.log(`❌ Erreur lors de la création du tag "${tagName}":`, error.response ? error.response.data : error.message);
      }
    }
    
    return tagIds;
  }

  async generatePointsGuyArticle() {
    try {
      console.log('🚀 Génération d\'un article style The Points Guy\n');

      await this.loadPublishedArticles();

      console.log('🔍 Récupération des actualités RSS...');
      const allRssArticles = await this.callRSSMonitorMCP('monitor_feeds', { feedType: 'all' });
      console.log(`✅ ${allRssArticles.length} articles RSS récupérés\n`);

      console.log('📊 Filtrage et scoring des articles...');
      const scoredArticles = [];

      for (const article of allRssArticles) {
        try {
          if (this.isArticleAlreadyPublished(article.title)) {
            console.log(`⏭️ Article déjà publié ignoré: ${article.title.substring(0, 50)}...`);
            continue;
          }

          let score = 0;
          let reasons = [];
          
          const title = article.title.toLowerCase();
          const content = (article.content || '').toLowerCase();
          
          if (title.includes('asia') || title.includes('chinese') || title.includes('japanese') || title.includes('korean') || title.includes('thai') || title.includes('vietnamese')) {
            score += 25;
            reasons.push('Pertinence Asie: 25 points');
          }
          
          if (title.includes('french') || title.includes('france') || content.includes('french') || content.includes('france')) {
            score += 20;
            reasons.push('Pertinence voyageurs français: 20 points');
          }
          
          if (title.includes('visa') || title.includes('flight') || title.includes('travel') || title.includes('tourism') || title.includes('free') || title.includes('deal')) {
            score += 15;
            reasons.push('Valeur pratique: 15 points');
          }
          
          if (title.includes('urgent') || title.includes('new') || title.includes('free') || title.includes('deal') || title.includes('record') || title.includes('surge')) {
            score += 15;
            reasons.push('Trigger FOMO: 15 points');
          }
          
          if (score >= 50) {
            let articleType = 'actualité';
            let destination = 'Asie';
            
            if (title.includes('visa') || title.includes('visa-free')) {
              articleType = 'visa';
            } else if (title.includes('flight') || title.includes('vol') || title.includes('airline')) {
              articleType = 'flights';
            } else if (title.includes('safety') || title.includes('warning') || title.includes('alert')) {
              articleType = 'safety';
            } else if (title.includes('deal') || title.includes('offer') || title.includes('free')) {
              articleType = 'deals';
            } else if (title.includes('island') || title.includes('resort') || title.includes('tourism')) {
              articleType = 'tourism';
            }

            if (title.includes('china') || title.includes('chinese')) {
              destination = 'china';
            } else if (title.includes('korea') || title.includes('korean')) {
              destination = 'korea';
            } else if (title.includes('japan') || title.includes('japanese')) {
              destination = 'japan';
            } else if (title.includes('vietnam') || title.includes('vietnamese')) {
              destination = 'vietnam';
            } else if (title.includes('thailand') || title.includes('thai')) {
              destination = 'thailand';
            }

            scoredArticles.push({
              ...article,
              score,
              strategicValue: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
              reasons,
              articleType,
              destination
            });
            
            console.log(`✅ Article stratégique Asie trouvé:`);
            console.log(`   📰 ${article.title}`);
            console.log(`   📊 Score: ${score}/100 (${score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'})`);
            console.log(`   🎯 Raisons: ${reasons.join(', ')}`);
            console.log(`   🏷️ Type: ${articleType}`);
            console.log(`   🌏 Destination: ${destination}\n`);
          }
        } catch (error) {
          console.warn(`⚠️ Erreur lors du scoring de l'article "${article.title}": ${error.message}`);
        }
      }

      if (scoredArticles.length === 0) {
        console.log('❌ Aucun article stratégique Asie trouvé avec un score suffisant.');
        return;
      }

      console.log(`🎯 ${scoredArticles.length} articles stratégiques Asie trouvés sur ${allRssArticles.length}\n`);

      const bestArticle = scoredArticles.sort((a, b) => b.score - a.score)[0];
      console.log('🎯 Meilleur article Asie sélectionné:');
      console.log(`📰 ${bestArticle.title}`);
      console.log(`📊 Score: ${bestArticle.score}/100 (${bestArticle.strategicValue})`);
      console.log(`🌏 Destination: ${bestArticle.destination}`);
      console.log(`🏷️ Type: ${bestArticle.articleType}\n`);

      console.log('🧠 Génération d\'un titre style The Points Guy...');
      const pointsGuyTitle = this.generatePointsGuyTitle(bestArticle, bestArticle.destination, bestArticle.articleType);
      console.log(`🎯 Titre style The Points Guy: ${pointsGuyTitle.title}\n`);

      console.log('🧠 Génération du contenu style The Points Guy...');
      const pointsGuyContent = this.generatePointsGuyContent(bestArticle, bestArticle.destination, pointsGuyTitle.specificInfo, pointsGuyTitle.realType, pointsGuyTitle.urgency);

      console.log('🖼️ Recherche d\'image contextuelle Asie...');
      const pexelsImage = await this.searchPexelsImage(`${bestArticle.destination} travel asia`);
      let imageId = 0;
      if (pexelsImage) {
        console.log(`✅ Image trouvée: ${pexelsImage.alt}\n`);
        const uploadedImage = await this.uploadImageToWordPress(pexelsImage.src.large, pointsGuyTitle.title);
        if (uploadedImage) {
          imageId = uploadedImage.id;
          console.log(`✅ Image uploadée (ID: ${imageId})\n`);
        } else {
          console.warn('⚠️ Échec de l\'upload, l\'article sera sans image à la une.');
        }
      } else {
        console.warn('⚠️ Aucune image Pexels trouvée, l\'article sera sans image à la une.');
      }

      console.log('📝 Création de l\'article sur WordPress...');
      const categoryId = await this.getOrCreateCategory('Asie');
      const tagIds = await this.getOrCreateTags([
        'actualite', 
        'voyage', 
        bestArticle.destination, 
        pointsGuyTitle.realType, 
        'strategique', 
        'ultra-pertinent', 
        'donnees-reelles',
        'expertise-asie',
        'voyageurs-francais',
        pointsGuyTitle.specificInfo,
        'points-guy-style'
      ]);

      const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        title: pointsGuyTitle.title,
        content: pointsGuyContent,
        status: 'publish',
        categories: [categoryId],
        featured_media: imageId || 0,
        tags: tagIds
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      console.log('🎉 Article style The Points Guy publié avec succès !');
      console.log(`🔗 URL: ${articleResponse.data.link}`);
      console.log(`📊 ID: ${articleResponse.data.id}`);
      console.log(`📂 Catégorie: Asie`);
      console.log(`🏷️ Tags: actualite, voyage, ${bestArticle.destination}, ${pointsGuyTitle.realType}, strategique, ultra-pertinent, donnees-reelles, expertise-asie, voyageurs-francais, ${pointsGuyTitle.specificInfo}, points-guy-style`);
      console.log(`📊 Score stratégique: ${bestArticle.score}/100`);
      console.log(`🎯 Valeur stratégique: ${bestArticle.strategicValue}`);
      console.log(`🌏 Destination: ${bestArticle.destination}`);
      console.log(`🏷️ Type: ${pointsGuyTitle.realType} (${pointsGuyTitle.specificInfo})`);
      console.log(`⚡ Urgence: ${pointsGuyTitle.urgency}`);
      if (imageId > 0) {
        console.log(`🖼️ Image: ${imageId}`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la génération de l\'article:', error.response ? error.response.data : error.message);
    }
  }
}

// Exécuter le générateur
const generator = new PointsGuyStyleGenerator();
generator.generatePointsGuyArticle();
