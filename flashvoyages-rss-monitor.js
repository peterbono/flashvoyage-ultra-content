#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import xml2js from 'xml2js';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

class FlashVoyagesRSSMonitor {
  constructor() {
    this.server = new Server(
      {
        name: 'flashvoyages-rss-monitor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Sources RSS pour l'Asie et le voyage
    this.rssFeeds = {
      'airlines': [
        'https://www.airfrance.fr/rss/actualites',
        'https://www.singaporeair.com/rss/news',
        'https://www.cathaypacific.com/rss/news'
      ],
      'tourism_boards': [
        'https://www.tourismthailand.org/rss/news',
        'https://www.jnto.go.jp/rss/news',
        'https://www.vietnam.travel/rss/news'
      ],
      'travel_deals': [
        'https://www.skyscanner.fr/rss/deals',
        'https://www.kayak.fr/rss/deals',
        'https://www.momondo.fr/rss/deals'
      ],
      'visa_immigration': [
        'https://www.diplomatie.gouv.fr/rss/actualites',
        'https://www.service-public.fr/rss/actualites'
      ]
    };

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler pour lister les outils disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'monitor_rss_feeds',
            description: 'Surveille les flux RSS pour détecter les actualités voyage Asie',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Catégorie de flux à surveiller',
                  enum: ['airlines', 'tourism_boards', 'travel_deals', 'visa_immigration', 'all']
                },
                keywords: {
                  type: 'array',
                  description: 'Mots-clés à filtrer (ex: ["Thaïlande", "vol direct", "visa"])',
                  items: { type: 'string' }
                },
                max_items: {
                  type: 'number',
                  description: 'Nombre maximum d\'articles à récupérer par flux',
                  default: 10
                }
              }
            }
          },
          {
            name: 'analyze_trending_topics',
            description: 'Analyse les sujets tendance dans les flux RSS',
            inputSchema: {
              type: 'object',
              properties: {
                time_period: {
                  type: 'string',
                  description: 'Période d\'analyse',
                  enum: ['last_hour', 'last_day', 'last_week'],
                  default: 'last_day'
                },
                min_mentions: {
                  type: 'number',
                  description: 'Nombre minimum de mentions pour considérer un sujet comme tendance',
                  default: 3
                }
              }
            }
          },
          {
            name: 'extract_deal_opportunities',
            description: 'Extrait les opportunités de bons plans depuis les flux RSS',
            inputSchema: {
              type: 'object',
              properties: {
                deal_types: {
                  type: 'array',
                  description: 'Types de deals à rechercher',
                  items: {
                    type: 'string',
                    enum: ['vol', 'hotel', 'activite', 'visa', 'transport']
                  }
                },
                price_threshold: {
                  type: 'number',
                  description: 'Seuil de prix maximum pour considérer comme un bon plan',
                  default: 500
                }
              }
            }
          },
          {
            name: 'get_asia_travel_alerts',
            description: 'Récupère les alertes voyage spécifiques à l\'Asie',
            inputSchema: {
              type: 'object',
              properties: {
                countries: {
                  type: 'array',
                  description: 'Pays d\'Asie à surveiller',
                  items: {
                    type: 'string',
                    enum: ['Thaïlande', 'Japon', 'Vietnam', 'Indonésie', 'Malaisie', 'Singapour', 'Corée', 'Chine', 'Inde']
                  }
                },
                alert_types: {
                  type: 'array',
                  description: 'Types d\'alertes à rechercher',
                  items: {
                    type: 'string',
                    enum: ['visa', 'sécurité', 'transport', 'santé', 'monnaie']
                  }
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
          case 'monitor_rss_feeds':
            return await this.monitorRSSFeeds(args);
          case 'analyze_trending_topics':
            return await this.analyzeTrendingTopics(args);
          case 'extract_deal_opportunities':
            return await this.extractDealOpportunities(args);
          case 'get_asia_travel_alerts':
            return await this.getAsiaTravelAlerts(args);
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

  // Surveillance des flux RSS
  async monitorRSSFeeds(args) {
    const { category = 'all', keywords = [], max_items = 10 } = args;
    
    const feeds = category === 'all' 
      ? Object.values(this.rssFeeds).flat()
      : this.rssFeeds[category] || [];

    const results = [];
    
    for (const feedUrl of feeds) {
      try {
        const feedData = await this.fetchRSSFeed(feedUrl, max_items);
        const filteredItems = this.filterItemsByKeywords(feedData.items, keywords);
        
        if (filteredItems.length > 0) {
          results.push({
            source: feedUrl,
            category: category,
            items: filteredItems,
            total_found: filteredItems.length
          });
        }
      } catch (error) {
        console.error(`Erreur lors de la récupération du flux ${feedUrl}:`, error.message);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Surveillance RSS terminée:\n\n${JSON.stringify(results, null, 2)}`
        }
      ]
    };
  }

  // Analyse des sujets tendance
  async analyzeTrendingTopics(args) {
    const { time_period = 'last_day', min_mentions = 3 } = args;
    
    // Récupérer tous les flux
    const allFeeds = Object.values(this.rssFeeds).flat();
    const allItems = [];
    
    for (const feedUrl of allFeeds) {
      try {
        const feedData = await this.fetchRSSFeed(feedUrl, 20);
        allItems.push(...feedData.items);
      } catch (error) {
        console.error(`Erreur flux ${feedUrl}:`, error.message);
      }
    }

    // Analyser les tendances
    const trends = this.analyzeTrends(allItems, min_mentions);
    
    return {
      content: [
        {
          type: 'text',
          text: `Analyse des tendances (${time_period}):\n\n${JSON.stringify(trends, null, 2)}`
        }
      ]
    };
  }

  // Extraction des opportunités de deals
  async extractDealOpportunities(args) {
    const { deal_types = ['vol', 'hotel'], price_threshold = 500 } = args;
    
    const dealFeeds = this.rssFeeds.travel_deals;
    const opportunities = [];
    
    for (const feedUrl of dealFeeds) {
      try {
        const feedData = await this.fetchRSSFeed(feedUrl, 15);
        const deals = this.extractDealsFromItems(feedData.items, deal_types, price_threshold);
        opportunities.push(...deals);
      } catch (error) {
        console.error(`Erreur flux deals ${feedUrl}:`, error.message);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Opportunités de deals trouvées:\n\n${JSON.stringify(opportunities, null, 2)}`
        }
      ]
    };
  }

  // Récupération des alertes voyage Asie
  async getAsiaTravelAlerts(args) {
    const { countries = ['Thaïlande', 'Japon', 'Vietnam'], alert_types = ['visa', 'sécurité'] } = args;
    
    const alerts = [];
    
    // Surveiller les flux gouvernementaux et de sécurité
    const governmentFeeds = this.rssFeeds.visa_immigration;
    
    for (const feedUrl of governmentFeeds) {
      try {
        const feedData = await this.fetchRSSFeed(feedUrl, 20);
        const relevantAlerts = this.filterAlertsByCountryAndType(
          feedData.items, 
          countries, 
          alert_types
        );
        alerts.push(...relevantAlerts);
      } catch (error) {
        console.error(`Erreur flux gouvernemental ${feedUrl}:`, error.message);
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Alertes voyage Asie:\n\n${JSON.stringify(alerts, null, 2)}`
        }
      ]
    };
  }

  // Méthodes utilitaires
  async fetchRSSFeed(url, maxItems = 10) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'FlashVoyages-RSS-Monitor/1.0'
        }
      });

      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      const items = result.rss?.channel?.[0]?.item || [];
      const limitedItems = items.slice(0, maxItems).map(item => ({
        title: item.title?.[0] || '',
        description: item.description?.[0] || '',
        link: item.link?.[0] || '',
        pubDate: item.pubDate?.[0] || '',
        guid: item.guid?.[0]?._ || item.guid?.[0] || '',
        category: item.category?.[0] || '',
        source: url
      }));

      return {
        title: result.rss?.channel?.[0]?.title?.[0] || 'Flux RSS',
        description: result.rss?.channel?.[0]?.description?.[0] || '',
        items: limitedItems
      };
    } catch (error) {
      throw new Error(`Erreur lors de la récupération du flux RSS ${url}: ${error.message}`);
    }
  }

  filterItemsByKeywords(items, keywords) {
    if (keywords.length === 0) return items;
    
    return items.filter(item => {
      const searchText = `${item.title} ${item.description}`.toLowerCase();
      return keywords.some(keyword => 
        searchText.includes(keyword.toLowerCase())
      );
    });
  }

  analyzeTrends(items, minMentions) {
    const wordCount = {};
    const asiaKeywords = [
      'thaïlande', 'japon', 'vietnam', 'indonésie', 'malaisie', 'singapour',
      'corée', 'chine', 'inde', 'asie', 'bangkok', 'tokyo', 'hanoi',
      'jakarta', 'kuala lumpur', 'séoul', 'shanghai', 'mumbai'
    ];

    // Compter les occurrences de mots-clés
    items.forEach(item => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      asiaKeywords.forEach(keyword => {
        if (text.includes(keyword)) {
          wordCount[keyword] = (wordCount[keyword] || 0) + 1;
        }
      });
    });

    // Filtrer les tendances
    const trends = Object.entries(wordCount)
      .filter(([word, count]) => count >= minMentions)
      .sort(([,a], [,b]) => b - a)
      .map(([word, count]) => ({
        keyword: word,
        mentions: count,
        trend_score: count / items.length
      }));

    return {
      total_items_analyzed: items.length,
      trending_keywords: trends,
      analysis_date: new Date().toISOString()
    };
  }

  extractDealsFromItems(items, dealTypes, priceThreshold) {
    const deals = [];
    
    items.forEach(item => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      
      // Détecter les prix
      const priceMatches = text.match(/(\d+)\s*€/g);
      if (!priceMatches) return;
      
      const prices = priceMatches.map(match => 
        parseInt(match.replace('€', '').trim())
      );
      
      const minPrice = Math.min(...prices);
      if (minPrice > priceThreshold) return;
      
      // Détecter le type de deal
      const detectedTypes = dealTypes.filter(type => {
        const typeKeywords = {
          'vol': ['vol', 'avion', 'compagnie', 'aérien', 'billet'],
          'hotel': ['hotel', 'hébergement', 'logement', 'nuit'],
          'activite': ['activité', 'excursion', 'visite', 'tour'],
          'visa': ['visa', 'passeport', 'entrée'],
          'transport': ['transport', 'bus', 'train', 'métro']
        };
        
        return typeKeywords[type]?.some(keyword => text.includes(keyword));
      });
      
      if (detectedTypes.length > 0) {
        deals.push({
          title: item.title,
          description: item.description,
          link: item.link,
          price: minPrice,
          deal_types: detectedTypes,
          source: item.source,
          pub_date: item.pubDate,
          relevance_score: this.calculateRelevanceScore(text, dealTypes)
        });
      }
    });
    
    return deals.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  filterAlertsByCountryAndType(items, countries, alertTypes) {
    return items.filter(item => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      
      const hasCountry = countries.some(country => 
        text.includes(country.toLowerCase())
      );
      
      const hasAlertType = alertTypes.some(type => {
        const typeKeywords = {
          'visa': ['visa', 'passeport', 'entrée', 'immigration'],
          'sécurité': ['sécurité', 'alerte', 'danger', 'risque'],
          'transport': ['transport', 'grève', 'annulation', 'retard'],
          'santé': ['santé', 'vaccin', 'covid', 'épidémie'],
          'monnaie': ['monnaie', 'taux', 'change', 'euro']
        };
        
        return typeKeywords[type]?.some(keyword => text.includes(keyword));
      });
      
      return hasCountry && hasAlertType;
    }).map(item => ({
      title: item.title,
      description: item.description,
      link: item.link,
      countries: countries.filter(country => 
        text.includes(country.toLowerCase())
      ),
      alert_types: alertTypes.filter(type => {
        const typeKeywords = {
          'visa': ['visa', 'passeport', 'entrée', 'immigration'],
          'sécurité': ['sécurité', 'alerte', 'danger', 'risque'],
          'transport': ['transport', 'grève', 'annulation', 'retard'],
          'santé': ['santé', 'vaccin', 'covid', 'épidémie'],
          'monnaie': ['monnaie', 'taux', 'change', 'euro']
        };
        
        return typeKeywords[type]?.some(keyword => text.includes(keyword));
      }),
      source: item.source,
      pub_date: item.pubDate,
      urgency_level: this.calculateUrgencyLevel(item.title, item.description)
    }));
  }

  calculateRelevanceScore(text, dealTypes) {
    let score = 0;
    
    // Score basé sur les mots-clés de voyage
    const travelKeywords = ['voyage', 'vacances', 'découverte', 'aventure', 'explorer'];
    score += travelKeywords.filter(keyword => text.includes(keyword)).length * 2;
    
    // Score basé sur les types de deals
    score += dealTypes.filter(type => {
      const typeKeywords = {
        'vol': ['vol', 'avion', 'compagnie'],
        'hotel': ['hotel', 'hébergement'],
        'activite': ['activité', 'excursion'],
        'visa': ['visa', 'passeport'],
        'transport': ['transport', 'bus', 'train']
      };
      
      return typeKeywords[type]?.some(keyword => text.includes(keyword));
    }).length * 3;
    
    // Score basé sur les mots-clés d'urgence
    const urgencyKeywords = ['urgent', 'limité', 'promo', 'offre', 'réduction'];
    score += urgencyKeywords.filter(keyword => text.includes(keyword)).length * 1.5;
    
    return score;
  }

  calculateUrgencyLevel(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    
    if (text.includes('urgent') || text.includes('immédiat')) return 'high';
    if (text.includes('important') || text.includes('attention')) return 'medium';
    return 'low';
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Serveur FlashVoyages RSS Monitor démarré');
  }
}

// Démarrer le serveur
const server = new FlashVoyagesRSSMonitor();
server.run().catch(console.error);

