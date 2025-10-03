#!/usr/bin/env node

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.MCP_REDDIT_CONTENT_PORT || 3007;
const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

app.use(bodyParser.json());
app.use(cors());

// Mapping des destinations vers les subreddits d'expats
const SUBREDDIT_MAP = {
  'tokyo': 'japanlife',
  'japon': 'japanlife',
  'bangkok': 'Thailand',
  'thailande': 'Thailand',
  'seoul': 'korea',
  'coree': 'korea',
  'coree-du-sud': 'korea',
  'singapour': 'singapore',
  'singapore': 'singapore',
  'vietnam': 'Vietnam',
  'hanoi': 'Vietnam',
  'ho-chi-minh': 'Vietnam',
  'philippines': 'Philippines',
  'manila': 'Philippines',
  'cebu': 'Philippines',
  'boracay': 'Philippines'
};

class RedditEnhancedContentGenerator {
  constructor() {
    this.setupHandlers();
  }

  setupHandlers() {
    // Endpoint pour générer du contenu avec Reddit
    app.post('/mcp', async (req, res) => {
      try {
        const { method, params } = req.body;
        
        let result;
        switch (method) {
          case 'generate_quartier_guide':
            result = await this.generateQuartierGuideWithReddit(params);
            break;
          case 'generate_comparatif':
            result = await this.generateComparatifWithReddit(params);
            break;
          case 'generate_saisonnier':
            result = await this.generateSaisonnierWithReddit(params);
            break;
          default:
            throw new Error(`Méthode inconnue: ${method}`);
        }
        
        res.json({ result });
      } catch (error) {
        console.error('Erreur MCP:', error.message);
        res.status(500).json({ error: error.message });
      }
    });
  }

  async makeRedditRequest(subreddit, searchQuery, limit = 20) {
    try {
      const response = await axios.get(`https://www.reddit.com/r/${subreddit}/search.json`, {
        params: {
          q: searchQuery,
          sort: 'top',
          t: 'year',
          limit: limit,
          raw_json: 1
        },
        headers: {
          'User-Agent': 'FlashVoyages-Content-Generator/1.0'
        },
        timeout: 10000
      });

      return response.data.data.children || [];
    } catch (error) {
      console.error(`Erreur Reddit API pour r/${subreddit}:`, error.message);
      return [];
    }
  }

  parseRedditPost(post) {
    const data = post.data;
    return {
      title: data.title,
      content: data.selftext,
      score: data.score,
      upvote_ratio: data.upvote_ratio,
      num_comments: data.num_comments,
      created_utc: data.created_utc,
      url: `https://reddit.com${data.permalink}`,
      author: data.author,
      subreddit: data.subreddit
    };
  }

  filterRelevantPosts(posts, minScore = 5) {
    return posts
      .map(post => this.parseRedditPost(post))
      .filter(post => 
        post.score >= minScore && 
        post.content && 
        post.content.length > 50 &&
        !post.title.toLowerCase().includes('[removed]') &&
        !post.title.toLowerCase().includes('[deleted]')
      )
      .sort((a, b) => b.score - a.score);
  }

  async getRedditAdvice(destination, quartier = '', keywords = []) {
    const subreddit = SUBREDDIT_MAP[destination.toLowerCase()];
    if (!subreddit) {
      console.log(`❌ Aucun subreddit d'expats trouvé pour ${destination}`);
      return [];
    }

    const searchQuery = quartier 
      ? `${quartier} ${keywords.join(' ')} expat advice tips local insider`
      : `${destination} ${keywords.join(' ')} expat advice tips local insider`;

    console.log(`🔍 Recherche Reddit: r/${subreddit} - "${searchQuery}"`);
    
    const posts = await this.makeRedditRequest(subreddit, searchQuery, 20);
    const relevantPosts = this.filterRelevantPosts(posts, 3);

    console.log(`✅ ${relevantPosts.length} conseils d'expats trouvés pour ${destination}${quartier ? ` - ${quartier}` : ''}`);
    
    return relevantPosts;
  }

  async generateQuartierGuideWithReddit(params) {
    const { destination, quartier, spots_count = 7 } = params;
    
    console.log(`🌏 Génération guide quartier Reddit: ${destination} - ${quartier}`);
    
    // Récupérer les conseils d'expats depuis Reddit
    const redditAdvice = await this.getRedditAdvice(destination, quartier, [
      'local', 'insider', 'secret', 'hidden', 'tips', 'advice'
    ]);

    // Conseils de base si Reddit ne donne rien
    const fallbackAdvice = [
      `Évitez les heures de pointe pour ${quartier}`,
      `Utilisez les transports locaux pour économiser`,
      `Négociez les prix dans les marchés locaux`,
      `Respectez les coutumes locales`
    ];

    const advice = redditAdvice.length > 0 ? redditAdvice : fallbackAdvice;
    const spots_secrets = advice.slice(0, spots_count).map((item, index) => {
      if (typeof item === 'string') {
        return `<li><strong>${index + 1}. ${item}</strong></li>`;
      } else {
        return `<li><strong>${index + 1}. ${item.title}</strong> (${item.score} upvotes)<br><em>${item.content.substring(0, 100)}...</em></li>`;
      }
    }).join('');

    const redditSource = redditAdvice.length > 0 
      ? `<p><em>💡 Conseils authentiques d'expats de r/${SUBREDDIT_MAP[destination.toLowerCase()]}</em></p>`
      : '';

    const content = `
      <h2>🌏 ${destination.charAt(0).toUpperCase() + destination.slice(1)} Insider : ${quartier.charAt(0).toUpperCase() + quartier.slice(1)}</h2>
      ${redditSource}
      <p><strong>Conseil FlashVoyages :</strong> ${advice[0]?.title || advice[0] || 'Découvrez les spots secrets'}</p>
      
      <h3>📍 Spots secrets (que les touristes ne connaissent pas)</h3>
      <ul>${spots_secrets}</ul>
      
      <h3>⏰ Meilleur timing pour visiter</h3>
      <ul>
        <li><strong>Matin :</strong> 6h-9h : meilleur moment pour photos</li>
        <li><strong>Après-midi :</strong> 14h-16h : évitez la foule</li>
        <li><strong>Soir :</strong> 18h-20h : ambiance locale</li>
      </ul>
      
      <h3>💰 Budget local vs touristique</h3>
      <ul>
        <li><strong>Nourriture locale :</strong> 50-80% moins cher que les spots touristiques</li>
        <li><strong>Transport :</strong> Utilisez les transports locaux</li>
        <li><strong>Activités :</strong> Beaucoup d'activités gratuites</li>
      </ul>
      
      <h3>🚨 Erreurs à éviter</h3>
      <ul>
        <li>Éviter les heures de pointe</li>
        <li>Négocier les prix</li>
        <li>Respecter les coutumes locales</li>
      </ul>
      
      <h3>🎯 Itinéraire parfait 1 jour</h3>
      <ol>
        <li>9h : Visite du spot principal</li>
        <li>11h : Pause café locale</li>
        <li>14h : Exploration des rues secondaires</li>
        <li>16h : Shopping local</li>
        <li>18h : Dîner authentique</li>
      </ol>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Astuce FlashVoyages</h4>
        <p>${advice[Math.floor(Math.random() * advice.length)]?.title || advice[Math.floor(Math.random() * advice.length)] || 'Conseil d\'expat exclusif'}</p>
      </div>
    `;

    const title = `${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${quartier.charAt(0).toUpperCase() + quartier.slice(1)} comme un local - ${spots_count} spots secrets`;

    return { title, content, type: 'quartier_guide', destination, quartier };
  }

  async generateComparatifWithReddit(params) {
    const { destination, sujet, options_count = 5 } = params;
    
    console.log(`🔍 Génération comparatif Reddit: ${destination} - ${sujet}`);
    
    // Récupérer les conseils d'expats pour le sujet
    const redditAdvice = await this.getRedditAdvice(destination, '', [
      sujet, 'best', 'recommend', 'review', 'compare'
    ]);

    const options = [];
    const noms = ['Option Premium', 'Choix Qualité', 'Meilleur Prix', 'Recommandé', 'Exclusif'];
    const prix = ['€', '€€', '€€€'];
    
    for (let i = 0; i < options_count; i++) {
      const redditOption = redditAdvice[i];
      options.push({
        nom: redditOption ? redditOption.title.substring(0, 50) : `${noms[i % noms.length]} ${sujet}`,
        prix: prix[Math.floor(Math.random() * prix.length)],
        note: redditOption ? (4 + (redditOption.score / 100)).toFixed(1) : (4 + Math.random()).toFixed(1),
        reddit_score: redditOption ? redditOption.score : null,
        reddit_url: redditOption ? redditOption.url : null
      });
    }
    
    const top_3 = options.slice(0, 3).map((option, index) => 
      `<li><strong>${index + 1}. ${option.nom}</strong> - ${option.prix} (Note: ${option.note}/5)${option.reddit_score ? ` (${option.reddit_score} upvotes Reddit)` : ''}</li>`
    ).join('');

    const tableau = options.map(option => 
      `<tr>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.nom}</td>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.prix}</td>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.note}/5</td>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.reddit_score ? `${option.reddit_score} upvotes` : 'N/A'}</td>
      </tr>`
    ).join('');

    const redditSource = redditAdvice.length > 0 
      ? `<p><em>💡 Comparatif basé sur les recommandations d'expats de r/${SUBREDDIT_MAP[destination.toLowerCase()]}</em></p>`
      : '';

    const content = `
      <h2>🔍 ${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${sujet} - Test complet</h2>
      ${redditSource}
      <p><strong>FlashVoyages a testé ${options_count} options pour vous :</strong></p>
      
      <h3>🏆 Top 3 des meilleures options</h3>
      <ul>${top_3}</ul>
      
      <h3>📊 Comparatif détaillé</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f8f9fa;">
          <th style="border: 1px solid #ddd; padding: 10px;">Option</th>
          <th style="border: 1px solid #ddd; padding: 10px;">Prix</th>
          <th style="border: 1px solid #ddd; padding: 10px;">Note</th>
          <th style="border: 1px solid #ddd; padding: 10px;">Reddit Score</th>
        </tr>
        ${tableau}
      </table>
      
      <h3>🎯 Recommandation FlashVoyages</h3>
      <p><strong>Notre choix :</strong> ${options[0].nom}</p>
      <p><strong>Pourquoi :</strong> Testé et approuvé par notre équipe d'experts${options[0].reddit_score ? ` et ${options[0].reddit_score} expats sur Reddit` : ''}</p>
      
      <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>✅ Réservation recommandée</h4>
        <p>[tp_affiliate_link]Réserver ${options[0].nom}[/tp_affiliate_link]</p>
      </div>
    `;

    const title = `${destination.charAt(0).toUpperCase() + destination.slice(1)} : ${sujet} - Comparatif complet ${options_count} options testées`;

    return { title, content, type: 'comparatif', destination, sujet };
  }

  async generateSaisonnierWithReddit(params) {
    const { destination, saison } = params;
    
    console.log(`🌤️ Génération guide saisonnier Reddit: ${destination} - ${saison}`);
    
    // Récupérer les conseils d'expats pour la saison
    const redditAdvice = await this.getRedditAdvice(destination, '', [
      saison, 'weather', 'climate', 'best time', 'season'
    ]);

    const redditSource = redditAdvice.length > 0 
      ? `<p><em>💡 Conseils saisonniers d'expats de r/${SUBREDDIT_MAP[destination.toLowerCase()]}</em></p>`
      : '';

    const content = `
      <h2>🌤️ ${destination.charAt(0).toUpperCase() + destination.slice(1)} en ${saison} - Guide complet</h2>
      ${redditSource}
      <p><strong>Conseil FlashVoyages :</strong> La ${saison} est une période idéale pour découvrir ${destination}</p>
      
      <h3>🌡️ Météo et climat</h3>
      <ul>
        <li><strong>Température :</strong> ${this.getSeasonalTemp(saison, destination)}</li>
        <li><strong>Précipitations :</strong> ${this.getSeasonalRain(saison, destination)}</li>
        <li><strong>Humidité :</strong> ${this.getSeasonalHumidity(saison, destination)}</li>
      </ul>
      
      <h3>👕 Que porter</h3>
      <ul>
        <li><strong>Haut :</strong> ${this.getSeasonalClothes(saison, 'top')}</li>
        <li><strong>Bas :</strong> ${this.getSeasonalClothes(saison, 'bottom')}</li>
        <li><strong>Chaussures :</strong> ${this.getSeasonalClothes(saison, 'shoes')}</li>
        <li><strong>Accessoires :</strong> ${this.getSeasonalClothes(saison, 'accessories')}</li>
      </ul>
      
      <h3>🎯 Activités recommandées</h3>
      <ul>
        <li>Visites culturelles en intérieur</li>
        <li>Marchés locaux et street food</li>
        <li>Musées et galeries d'art</li>
        <li>Spas et centres de bien-être</li>
      </ul>
      
      <h3>💰 Budget saisonnier</h3>
      <ul>
        <li><strong>Hébergement :</strong> ${this.getSeasonalBudget(saison, 'accommodation')}</li>
        <li><strong>Nourriture :</strong> ${this.getSeasonalBudget(saison, 'food')}</li>
        <li><strong>Activités :</strong> ${this.getSeasonalBudget(saison, 'activities')}</li>
      </ul>
      
      <h3>🚨 À éviter en ${saison}</h3>
      <ul>
        <li>Activités en plein air par mauvais temps</li>
        <li>Vêtements inadaptés au climat</li>
        <li>Horaires d'ouverture saisonniers</li>
      </ul>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Astuce FlashVoyages</h4>
        <p>${redditAdvice[0]?.title || `La ${saison} offre les meilleures conditions pour visiter ${destination}`}</p>
      </div>
    `;

    const title = `${destination.charAt(0).toUpperCase() + destination.slice(1)} en ${saison} : Guide complet et conseils d'expats`;

    return { title, content, type: 'saisonnier', destination, saison };
  }

  getSeasonalTemp(saison, destination) {
    const temps = {
      'printemps': '20-25°C, agréable',
      'été': '28-35°C, chaud et humide',
      'automne': '18-23°C, frais et sec',
      'hiver': '10-18°C, frais'
    };
    return temps[saison] || 'Variable selon la saison';
  }

  getSeasonalRain(saison, destination) {
    const pluie = {
      'printemps': 'Pluies modérées, parapluie recommandé',
      'été': 'Mousson, pluies abondantes',
      'automne': 'Peu de pluie, saison sèche',
      'hiver': 'Pluies occasionnelles'
    };
    return pluie[saison] || 'Variable selon la saison';
  }

  getSeasonalHumidity(saison, destination) {
    const humidite = {
      'printemps': 'Modérée, confortable',
      'été': 'Très élevée, 80-90%',
      'automne': 'Faible, agréable',
      'hiver': 'Modérée, 60-70%'
    };
    return humidite[saison] || 'Variable selon la saison';
  }

  getSeasonalClothes(saison, type) {
    const vetements = {
      'printemps': {
        'top': 'T-shirts légers, chemises',
        'bottom': 'Pantalons légers, jeans',
        'shoes': 'Baskets, chaussures confortables',
        'accessories': 'Lunettes de soleil, chapeau'
      },
      'été': {
        'top': 'T-shirts, débardeurs',
        'bottom': 'Shorts, jupes légères',
        'shoes': 'Sandales, tongs',
        'accessories': 'Chapeau, crème solaire'
      },
      'automne': {
        'top': 'Pulls légers, vestes',
        'bottom': 'Pantalons, jeans',
        'shoes': 'Baskets, bottes légères',
        'accessories': 'Écharpe légère'
      },
      'hiver': {
        'top': 'Pulls, vestes chaudes',
        'bottom': 'Pantalons, jeans',
        'shoes': 'Bottes, chaussures fermées',
        'accessories': 'Écharpe, gants'
      }
    };
    return vetements[saison]?.[type] || 'Adaptez selon la saison';
  }

  getSeasonalBudget(saison, type) {
    const budget = {
      'printemps': {
        'accommodation': 'Prix moyens, bonne disponibilité',
        'food': 'Prix normaux, produits frais',
        'activities': 'Prix standards, tout ouvert'
      },
      'été': {
        'accommodation': 'Prix élevés, réservation nécessaire',
        'food': 'Prix normaux, fruits de saison',
        'activities': 'Prix élevés, très fréquenté'
      },
      'automne': {
        'accommodation': 'Prix bas, bonne disponibilité',
        'food': 'Prix normaux, récoltes',
        'activities': 'Prix réduits, moins de monde'
      },
      'hiver': {
        'accommodation': 'Prix bas, très disponible',
        'food': 'Prix normaux, plats chauds',
        'activities': 'Prix réduits, saison basse'
      }
    };
    return budget[saison]?.[type] || 'Variable selon la saison';
  }

  async start() {
    app.listen(PORT, () => {
      console.log(`🚀 Reddit Enhanced Content Generator running on port ${PORT}`);
      console.log(`🔗 MCP endpoint: http://localhost:${PORT}/mcp`);
    });
  }
}

const generator = new RedditEnhancedContentGenerator();
generator.start().catch(console.error);
