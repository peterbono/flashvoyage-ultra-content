#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

class FlashVoyagesContentGenerator {
  constructor() {
    this.server = new Server(
      {
        name: 'flashvoyages-content-generator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.wpBaseUrl = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
    this.wpUsername = process.env.WORDPRESS_USERNAME || '';
    this.wpPassword = process.env.WORDPRESS_PASSWORD || '';
    this.wpApplicationPassword = process.env.WORDPRESS_APP_PASSWORD || '';

    // Configuration FlashVoyages
    this.categories = {
      'actualites': 1,      // Actualités
      'guides-pratiques': 2, // Guides Pratiques
      'bons-plans': 3       // Bons Plans
    };

    this.tone = {
      style: 'proche-et-complice',
      target: 'voyageur-francophone-asie',
      voice: 'malin-chasseur-bons-plans'
    };

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler pour lister les outils disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'generate_news_article',
            description: 'Génère un article d\'actualité FlashVoyages sur l\'Asie',
            inputSchema: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  description: 'Sujet de l\'actualité (ex: "nouveau vol Paris-Bangkok")'
                },
                source_data: {
                  type: 'object',
                  description: 'Données sources (prix, dates, compagnie, etc.)'
                }
              },
              required: ['topic']
            }
          },
          {
            name: 'generate_guide_article',
            description: 'Génère un guide pratique evergreen sur l\'Asie',
            inputSchema: {
              type: 'object',
              properties: {
                destination: {
                  type: 'string',
                  description: 'Destination en Asie (ex: "Thaïlande", "Japon", "Vietnam")'
                },
                guide_type: {
                  type: 'string',
                  description: 'Type de guide (visa, budget, transport, hébergement, activités)',
                  enum: ['visa', 'budget', 'transport', 'hebergement', 'activites', 'securite']
                }
              },
              required: ['destination', 'guide_type']
            }
          },
          {
            name: 'generate_deal_article',
            description: 'Génère un article de bon plan avec affiliation',
            inputSchema: {
              type: 'object',
              properties: {
                deal_type: {
                  type: 'string',
                  description: 'Type de deal (vol, hotel, activite, visa)',
                  enum: ['vol', 'hotel', 'activite', 'visa', 'transport']
                },
                deal_data: {
                  type: 'object',
                  description: 'Données du deal (prix, dates, conditions)'
                },
                affiliate_links: {
                  type: 'array',
                  description: 'Liens d\'affiliation à intégrer',
                  items: {
                    type: 'object',
                    properties: {
                      platform: { type: 'string' },
                      url: { type: 'string' },
                      description: { type: 'string' }
                    }
                  }
                }
              },
              required: ['deal_type', 'deal_data']
            }
          },
          {
            name: 'publish_flashvoyages_article',
            description: 'Publie un article FlashVoyages avec le bon formatage',
            inputSchema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
                category: { 
                  type: 'string',
                  enum: ['actualites', 'guides-pratiques', 'bons-plans']
                },
                tags: { 
                  type: 'array',
                  items: { type: 'string' }
                },
                featured_image_url: { type: 'string' },
                excerpt: { type: 'string' },
                status: { 
                  type: 'string',
                  enum: ['draft', 'publish'],
                  default: 'draft'
                }
              },
              required: ['title', 'content', 'category']
            }
          },
          {
            name: 'get_trending_topics',
            description: 'Récupère les sujets tendance pour l\'Asie',
            inputSchema: {
              type: 'object',
              properties: {
                country: {
                  type: 'string',
                  description: 'Pays d\'Asie à analyser',
                  default: 'all'
                }
              }
            }
          }
        ]
      };
    });

    // Handler pour exécuter les outils
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'generate_news_article':
            return await this.generateNewsArticle(args);
          case 'generate_guide_article':
            return await this.generateGuideArticle(args);
          case 'generate_deal_article':
            return await this.generateDealArticle(args);
          case 'publish_flashvoyages_article':
            return await this.publishFlashVoyagesArticle(args);
          case 'get_trending_topics':
            return await this.getTrendingTopics(args);
          default:
            throw new Error(`Outil inconnu: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Erreur lors de l'exécution de l'outil ${name}: ${error.message}`
            }
          ]
        };
      }
    });
  }

  // Méthodes pour interagir avec l'API WordPress
  async makeRequest(endpoint, method = 'GET', data = null) {
    const url = `${this.wpBaseUrl}/wp-json/wp/v2${endpoint}`;
    
    const config = {
      method,
      url,
      auth: {
        username: this.wpUsername,
        password: this.wpApplicationPassword || this.wpPassword
      },
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      throw new Error(`Erreur API WordPress: ${error.response?.data?.message || error.message}`);
    }
  }

  // Génération d'articles d'actualité
  async generateNewsArticle(args) {
    const { topic, source_data = {} } = args;
    
    const article = this.createNewsArticleTemplate(topic, source_data);
    
    return {
      content: [
        {
          type: 'text',
          text: `Article d'actualité généré:\n\n${JSON.stringify(article, null, 2)}`
        }
      ]
    };
  }

  // Génération de guides pratiques
  async generateGuideArticle(args) {
    const { destination, guide_type } = args;
    
    const article = this.createGuideArticleTemplate(destination, guide_type);
    
    return {
      content: [
        {
          type: 'text',
          text: `Guide pratique généré:\n\n${JSON.stringify(article, null, 2)}`
        }
      ]
    };
  }

  // Génération d'articles de bons plans
  async generateDealArticle(args) {
    const { deal_type, deal_data, affiliate_links = [] } = args;
    
    const article = this.createDealArticleTemplate(deal_type, deal_data, affiliate_links);
    
    return {
      content: [
        {
          type: 'text',
          text: `Article de bon plan généré:\n\n${JSON.stringify(article, null, 2)}`
        }
      ]
    };
  }

  // Publication d'articles FlashVoyages
  async publishFlashVoyagesArticle(args) {
    const { title, content, category, tags = [], featured_image_url, excerpt, status = 'draft' } = args;
    
    const postData = {
      title,
      content: this.formatFlashVoyagesContent(content),
      status,
      categories: [this.categories[category]],
      tags: tags,
      excerpt: excerpt || this.generateExcerpt(content)
    };

    if (featured_image_url) {
      // TODO: Upload image and get attachment ID
      postData.featured_media = await this.uploadImage(featured_image_url);
    }

    const post = await this.makeRequest('/posts', 'POST', postData);
    
    return {
      content: [
        {
          type: 'text',
          text: `Article FlashVoyages publié avec succès!\n\nTitre: ${post.title.rendered}\nID: ${post.id}\nCatégorie: ${category}\nStatut: ${post.status}\nURL: ${post.link}`
        }
      ]
    };
  }

  // Récupération des sujets tendance
  async getTrendingTopics(args) {
    const { country = 'all' } = args;
    
    // Simulation de récupération de tendances
    const trendingTopics = this.getMockTrendingTopics(country);
    
    return {
      content: [
        {
          type: 'text',
          text: `Sujets tendance pour ${country}:\n\n${JSON.stringify(trendingTopics, null, 2)}`
        }
      ]
    };
  }

  // Templates d'articles FlashVoyages
  createNewsArticleTemplate(topic, sourceData) {
    return {
      title: this.generateNewsTitle(topic, sourceData),
      content: this.generateNewsContent(topic, sourceData),
      excerpt: this.generateNewsExcerpt(topic, sourceData),
      category: 'actualites',
      tags: this.extractTags(topic, sourceData),
      meta: {
        tone: this.tone,
        word_count: '300-500',
        structure: 'intro-factuel-conseil-cta'
      }
    };
  }

  createGuideArticleTemplate(destination, guideType) {
    return {
      title: this.generateGuideTitle(destination, guideType),
      content: this.generateGuideContent(destination, guideType),
      excerpt: this.generateGuideExcerpt(destination, guideType),
      category: 'guides-pratiques',
      tags: [destination.toLowerCase(), guideType, 'guide', 'pratique'],
      meta: {
        tone: this.tone,
        word_count: '800-1200',
        structure: 'intro-contexte-etapes-conseils-ressources'
      }
    };
  }

  createDealArticleTemplate(dealType, dealData, affiliateLinks) {
    return {
      title: this.generateDealTitle(dealType, dealData),
      content: this.generateDealContent(dealType, dealData, affiliateLinks),
      excerpt: this.generateDealExcerpt(dealType, dealData),
      category: 'bons-plans',
      tags: this.extractDealTags(dealType, dealData),
      meta: {
        tone: this.tone,
        word_count: '400-600',
        structure: 'accroche-deal-contexte-cta',
        affiliate_links: affiliateLinks
      }
    };
  }

  // Générateurs de contenu FlashVoyages
  generateNewsTitle(topic, sourceData) {
    const emojis = {
      'vol': '✈️',
      'hotel': '🏨',
      'visa': '📋',
      'transport': '🚌',
      'activite': '🎯'
    };
    
    const emoji = emojis[this.detectTopicType(topic)] || '🌏';
    const urgency = sourceData.urgent ? 'URGENT: ' : '';
    const price = sourceData.price ? ` dès ${sourceData.price}` : '';
    
    return `${emoji} ${urgency}${topic}${price} : ${sourceData.company || 'Nouvelle offre'} lance ${this.getActionWord(topic)}`;
  }

  generateNewsContent(topic, sourceData) {
    return `
<!-- wp:paragraph -->
<p><strong>Envie de ${this.getDestinationFromTopic(topic)} sans complications ?</strong> ${sourceData.company || 'Une nouvelle offre'} vient de ${this.getActionWord(topic)} une pépite à son programme.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>📊 Ce qui change concrètement</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Prix :</strong> ${sourceData.price || 'À confirmer'}</li>
<li><strong>Dates :</strong> ${sourceData.dates || 'Disponible maintenant'}</li>
<li><strong>Conditions :</strong> ${sourceData.conditions || 'Sous réserve de disponibilité'}</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>👉 Astuce voyageur FlashVoyages</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${this.generateTravelerTip(topic, sourceData)}</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🎯 Contextualisation</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${this.generateContextualization(topic, sourceData)}</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->
    `.trim();
  }

  generateGuideTitle(destination, guideType) {
    const titles = {
      'visa': `📋 Visa ${destination} : Guide complet 2024`,
      'budget': `💰 Budget voyage ${destination} : Combien ça coûte vraiment ?`,
      'transport': `🚌 Se déplacer en ${destination} : Transport local et international`,
      'hebergement': `🏨 Où dormir en ${destination} : Hébergements et quartiers`,
      'activites': `🎯 Que faire en ${destination} : Activités incontournables`,
      'securite': `🛡️ Sécurité en ${destination} : Conseils pratiques et alertes`
    };
    
    return titles[guideType] || `Guide ${destination} : ${guideType}`;
  }

  generateGuideContent(destination, guideType) {
    return `
<!-- wp:paragraph -->
<p><strong>Préparer son voyage en ${destination} ?</strong> Voici tout ce qu'il faut savoir pour ${this.getGuideObjective(guideType)}.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🎯 Pourquoi ce guide ?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${this.generateGuideIntroduction(destination, guideType)}</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>📋 Étapes pratiques</h2>
<!-- /wp:heading -->

${this.generateGuideSteps(destination, guideType)}

<!-- wp:heading {"level":2} -->
<h2>💡 Conseils FlashVoyages</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${this.generateGuideTips(destination, guideType)}</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🔗 Ressources utiles</h2>
<!-- /wp:heading -->

${this.generateGuideResources(destination, guideType)}

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->
    `.trim();
  }

  generateDealTitle(dealType, dealData) {
    const emojis = {
      'vol': '✈️',
      'hotel': '🏨',
      'activite': '🎯',
      'visa': '📋',
      'transport': '🚌'
    };
    
    const emoji = emojis[dealType] || '🎯';
    const urgency = dealData.urgent ? 'URGENT: ' : '';
    const discount = dealData.discount ? ` (-${dealData.discount}%)` : '';
    
    return `${emoji} ${urgency}${dealData.destination || 'Asie'} dès ${dealData.price}${discount} : ${dealData.description || 'Offre limitée'}`;
  }

  generateDealContent(dealType, dealData, affiliateLinks) {
    return `
<!-- wp:paragraph -->
<p><strong>Envie de ${dealData.destination || 'voyager en Asie'} sans se ruiner ?</strong> On a repéré cette pépite avant tout le monde !</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🔥 L'offre en détail</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Prix :</strong> ${dealData.price}</li>
<li><strong>Validité :</strong> ${dealData.validity || 'Jusqu\'à épuisement des stocks'}</li>
<li><strong>Conditions :</strong> ${dealData.conditions || 'Sous réserve de disponibilité'}</li>
</ul>
<!-- /wp:list -->

${affiliateLinks.length > 0 ? this.generateAffiliateSection(affiliateLinks) : ''}

<!-- wp:heading {"level":3} -->
<h3>👉 Pourquoi c'est un bon plan ?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${this.generateDealJustification(dealType, dealData)}</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>⚡ Action rapide</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>${this.generateUrgencyMessage(dealData)}</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->
    `.trim();
  }

  // Méthodes utilitaires
  formatFlashVoyagesContent(content) {
    // Ajouter les shortcodes et formatage FlashVoyages
    return content.replace(/\[cta-newsletter\]/g, '[cta-newsletter]');
  }

  generateExcerpt(content) {
    // Extraire les 150 premiers caractères
    const cleanContent = content.replace(/<[^>]*>/g, '');
    return cleanContent.substring(0, 150) + '...';
  }

  detectTopicType(topic) {
    const keywords = {
      'vol': ['vol', 'avion', 'compagnie', 'aérien'],
      'hotel': ['hotel', 'hébergement', 'logement'],
      'visa': ['visa', 'passeport', 'entrée'],
      'transport': ['transport', 'bus', 'train', 'métro'],
      'activite': ['activité', 'excursion', 'visite', 'tour']
    };
    
    for (const [type, words] of Object.entries(keywords)) {
      if (words.some(word => topic.toLowerCase().includes(word))) {
        return type;
      }
    }
    return 'general';
  }

  getActionWord(topic) {
    const actions = {
      'vol': 'ajouter un vol direct',
      'hotel': 'ouvrir un nouvel établissement',
      'visa': 'simplifier les démarches',
      'transport': 'lancer une nouvelle ligne',
      'activite': 'proposer une nouvelle expérience'
    };
    
    return actions[this.detectTopicType(topic)] || 'proposer une nouvelle offre';
  }

  getDestinationFromTopic(topic) {
    // Extraction basique de destination depuis le topic
    const destinations = ['Thaïlande', 'Japon', 'Vietnam', 'Indonésie', 'Malaisie', 'Singapour', 'Corée', 'Chine', 'Inde'];
    const found = destinations.find(dest => topic.toLowerCase().includes(dest.toLowerCase()));
    return found || 'l\'Asie';
  }

  generateTravelerTip(topic, sourceData) {
    const tips = [
      "Réservez tôt le matin pour avoir les meilleures disponibilités.",
      "Comparez toujours avec d'autres compagnies avant de valider.",
      "Les prix peuvent varier selon la saison, vérifiez les tendances.",
      "Inscrivez-vous aux alertes prix pour ne rien rater.",
      "Les offres flash sont souvent limitées dans le temps."
    ];
    
    return tips[Math.floor(Math.random() * tips.length)];
  }

  generateContextualization(topic, sourceData) {
    return `Cette annonce s'inscrit dans la tendance du boom du tourisme en Asie post-COVID. Les voyageurs francophones sont de plus en plus nombreux à se tourner vers cette région pour ses paysages exceptionnels et son excellent rapport qualité-prix.`;
  }

  getGuideObjective(guideType) {
    const objectives = {
      'visa': 'obtenir son visa sans stress',
      'budget': 'budgétiser son voyage intelligemment',
      'transport': 'se déplacer facilement',
      'hebergement': 'trouver le logement parfait',
      'activites': 'organiser ses activités',
      'securite': 'voyager en toute sécurité'
    };
    
    return objectives[guideType] || 'préparer son voyage';
  }

  generateGuideIntroduction(destination, guideType) {
    return `Ce guide pratique vous accompagne étape par étape pour ${this.getGuideObjective(guideType)} en ${destination}. Basé sur notre expérience terrain et les retours de la communauté FlashVoyages.`;
  }

  generateGuideSteps(destination, guideType) {
    // Génération de steps selon le type de guide
    return `
<!-- wp:list {"ordered":true} -->
<ol>
<li>Étape 1 : Préparation initiale</li>
<li>Étape 2 : Documentation nécessaire</li>
<li>Étape 3 : Réservation et paiement</li>
<li>Étape 4 : Suivi et confirmation</li>
</ol>
<!-- /wp:list -->
    `.trim();
  }

  generateGuideTips(destination, guideType) {
    return `Nos conseils d'experts pour optimiser votre expérience en ${destination} : réservez en avance, gardez toujours vos documents à portée de main, et n'hésitez pas à contacter les services locaux en cas de question.`;
  }

  generateGuideResources(destination, guideType) {
    return `
<!-- wp:list -->
<ul>
<li><a href="#">Site officiel du tourisme ${destination}</a></li>
<li><a href="#">Ambassade de France</a></li>
<li><a href="#">Communauté FlashVoyages</a></li>
</ul>
<!-- /wp:list -->
    `.trim();
  }

  generateAffiliateSection(affiliateLinks) {
    let section = `
<!-- wp:heading {"level":3} -->
<h3>🔗 Réservez maintenant</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
`;
    
    affiliateLinks.forEach(link => {
      section += `<li><a href="${link.url}">${link.platform} - ${link.description}</a></li>\n`;
    });
    
    section += `</ul>
<!-- /wp:list -->`;
    
    return section;
  }

  generateDealJustification(dealType, dealData) {
    return `Cette offre représente une économie significative par rapport aux prix habituels. ${dealData.discount ? `Avec ${dealData.discount}% de réduction, ` : ''}c'est l'occasion parfaite de découvrir ${dealData.destination || 'l\'Asie'} sans se ruiner.`;
  }

  generateUrgencyMessage(dealData) {
    return `⚠️ Attention : ${dealData.validity || 'Cette offre est limitée dans le temps'}. Ne tardez pas à réserver pour profiter de ce bon plan !`;
  }

  extractTags(topic, sourceData) {
    const tags = [];
    
    // Tags basés sur le topic
    if (topic.toLowerCase().includes('paris')) tags.push('paris');
    if (topic.toLowerCase().includes('bangkok')) tags.push('bangkok');
    if (topic.toLowerCase().includes('tokyo')) tags.push('tokyo');
    
    // Tags basés sur le type
    const type = this.detectTopicType(topic);
    tags.push(type);
    
    // Tags basés sur les données sources
    if (sourceData.company) tags.push(sourceData.company.toLowerCase());
    
    return [...new Set(tags)]; // Supprimer les doublons
  }

  extractDealTags(dealType, dealData) {
    const tags = [dealType, 'bon-plan', 'promo'];
    
    if (dealData.destination) tags.push(dealData.destination.toLowerCase());
    if (dealData.urgent) tags.push('urgent');
    
    return [...new Set(tags)];
  }

  getMockTrendingTopics(country) {
    const topics = {
      'all': [
        'Nouveaux vols directs Paris-Asie',
        'Simplification des visas Thaïlande',
        'Boom du tourisme au Japon',
        'Nouveaux hôtels de luxe à Bali',
        'Transport local en Asie du Sud-Est'
      ],
      'thailand': [
        'Visa Thaïlande gratuit prolongé',
        'Nouveaux vols Paris-Bangkok',
        'Hôtels de charme à Chiang Mai',
        'Transport local en Thaïlande'
      ],
      'japan': [
        'Yen faible : bon moment pour le Japon',
        'Nouveaux vols Paris-Tokyo',
        'Guides pratiques Tokyo 2024',
        'Hébergement pas cher au Japon'
      ]
    };
    
    return topics[country] || topics['all'];
  }

  async uploadImage(imageUrl) {
    // TODO: Implémenter l'upload d'image vers WordPress
    return null;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Serveur FlashVoyages Content Generator démarré');
  }
}

// Démarrer le serveur
const server = new FlashVoyagesContentGenerator();
server.run().catch(console.error);

