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

class FlashVoyagesAffiliateManager {
  constructor() {
    this.server = new Server(
      {
        name: 'flashvoyages-affiliate-manager',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Configuration des partenaires d'affiliation
    this.affiliatePartners = {
      'skyscanner': {
        name: 'Skyscanner',
        baseUrl: 'https://www.skyscanner.fr',
        affiliateId: process.env.SKYSCANNER_AFFILIATE_ID || '',
        commissionRate: 0.05, // 5%
        categories: ['vols', 'hotels', 'voitures']
      },
      'booking': {
        name: 'Booking.com',
        baseUrl: 'https://www.booking.com',
        affiliateId: process.env.BOOKING_AFFILIATE_ID || '',
        commissionRate: 0.04, // 4%
        categories: ['hotels', 'appartements', 'villas']
      },
      'getyourguide': {
        name: 'GetYourGuide',
        baseUrl: 'https://www.getyourguide.fr',
        affiliateId: process.env.GETYOURGUIDE_AFFILIATE_ID || '',
        commissionRate: 0.08, // 8%
        categories: ['activites', 'excursions', 'tours']
      },
      'kiwi': {
        name: 'Kiwi.com',
        baseUrl: 'https://www.kiwi.com',
        affiliateId: process.env.KIWI_AFFILIATE_ID || '',
        commissionRate: 0.06, // 6%
        categories: ['vols', 'trains', 'bus']
      },
      'airbnb': {
        name: 'Airbnb',
        baseUrl: 'https://www.airbnb.fr',
        affiliateId: process.env.AIRBNB_AFFILIATE_ID || '',
        commissionRate: 0.03, // 3%
        categories: ['logements', 'experiences']
      }
    };

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler pour lister les outils disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'generate_affiliate_links',
            description: 'Génère des liens d\'affiliation pour un contenu donné',
            inputSchema: {
              type: 'object',
              properties: {
                content_type: {
                  type: 'string',
                  description: 'Type de contenu',
                  enum: ['vol', 'hotel', 'activite', 'transport', 'logement']
                },
                destination: {
                  type: 'string',
                  description: 'Destination (ex: "Bangkok", "Tokyo")'
                },
                search_params: {
                  type: 'object',
                  description: 'Paramètres de recherche (dates, passagers, etc.)'
                },
                partners: {
                  type: 'array',
                  description: 'Partenaires à utiliser',
                  items: {
                    type: 'string',
                    enum: ['skyscanner', 'booking', 'getyourguide', 'kiwi', 'airbnb']
                  }
                }
              },
              required: ['content_type', 'destination']
            }
          },
          {
            name: 'create_affiliate_shortcode',
            description: 'Crée un shortcode WordPress pour les liens d\'affiliation',
            inputSchema: {
              type: 'object',
              properties: {
                shortcode_name: {
                  type: 'string',
                  description: 'Nom du shortcode (ex: "cta-vol-bangkok")'
                },
                affiliate_links: {
                  type: 'array',
                  description: 'Liens d\'affiliation à inclure',
                  items: {
                    type: 'object',
                    properties: {
                      partner: { type: 'string' },
                      url: { type: 'string' },
                      text: { type: 'string' },
                      priority: { type: 'number' }
                    }
                  }
                },
                display_style: {
                  type: 'string',
                  description: 'Style d\'affichage',
                  enum: ['buttons', 'list', 'carousel'],
                  default: 'buttons'
                }
              },
              required: ['shortcode_name', 'affiliate_links']
            }
          },
          {
            name: 'track_affiliate_performance',
            description: 'Suit les performances des liens d\'affiliation',
            inputSchema: {
              type: 'object',
              properties: {
                time_period: {
                  type: 'string',
                  description: 'Période d\'analyse',
                  enum: ['last_24h', 'last_7d', 'last_30d', 'custom'],
                  default: 'last_7d'
                },
                partners: {
                  type: 'array',
                  description: 'Partenaires à analyser',
                  items: { type: 'string' }
                }
              }
            }
          },
          {
            name: 'optimize_affiliate_placement',
            description: 'Optimise le placement des liens d\'affiliation dans le contenu',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'Contenu à optimiser'
                },
                content_type: {
                  type: 'string',
                  description: 'Type de contenu',
                  enum: ['actualite', 'guide', 'bon_plan']
                },
                target_conversion: {
                  type: 'string',
                  description: 'Objectif de conversion',
                  enum: ['clics', 'reservations', 'revenue'],
                  default: 'clics'
                }
              },
              required: ['content', 'content_type']
            }
          },
          {
            name: 'generate_affiliate_widget',
            description: 'Génère un widget d\'affiliation pour la sidebar',
            inputSchema: {
              type: 'object',
              properties: {
                widget_type: {
                  type: 'string',
                  description: 'Type de widget',
                  enum: ['deals_carousel', 'price_comparison', 'destination_highlights', 'trending_destinations']
                },
                destination: {
                  type: 'string',
                  description: 'Destination focus'
                },
                max_items: {
                  type: 'number',
                  description: 'Nombre maximum d\'éléments à afficher',
                  default: 5
                }
              },
              required: ['widget_type']
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
          case 'generate_affiliate_links':
            return await this.generateAffiliateLinks(args);
          case 'create_affiliate_shortcode':
            return await this.createAffiliateShortcode(args);
          case 'track_affiliate_performance':
            return await this.trackAffiliatePerformance(args);
          case 'optimize_affiliate_placement':
            return await this.optimizeAffiliatePlacement(args);
          case 'generate_affiliate_widget':
            return await this.generateAffiliateWidget(args);
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

  // Génération de liens d'affiliation
  async generateAffiliateLinks(args) {
    const { content_type, destination, search_params = {}, partners = [] } = args;
    
    const availablePartners = partners.length > 0 
      ? partners 
      : this.getRelevantPartners(content_type);

    const affiliateLinks = [];

    for (const partnerKey of availablePartners) {
      const partner = this.affiliatePartners[partnerKey];
      if (!partner) continue;

      try {
        const link = await this.generatePartnerLink(partner, content_type, destination, search_params);
        if (link) {
          affiliateLinks.push({
            partner: partnerKey,
            partner_name: partner.name,
            url: link.url,
            display_text: link.display_text,
            commission_rate: partner.commissionRate,
            estimated_commission: link.estimated_commission,
            priority: this.calculatePriority(partner, content_type, destination)
          });
        }
      } catch (error) {
        console.error(`Erreur génération lien ${partnerKey}:`, error.message);
      }
    }

    // Trier par priorité
    affiliateLinks.sort((a, b) => b.priority - a.priority);

    return {
      content: [
        {
          type: 'text',
          text: `Liens d'affiliation générés pour ${destination} (${content_type}):\n\n${JSON.stringify(affiliateLinks, null, 2)}`
        }
      ]
    };
  }

  // Création de shortcodes WordPress
  async createAffiliateShortcode(args) {
    const { shortcode_name, affiliate_links, display_style = 'buttons' } = args;
    
    const shortcodeContent = this.generateShortcodeContent(affiliate_links, display_style);
    
    return {
      content: [
        {
          type: 'text',
          text: `Shortcode WordPress créé: [${shortcode_name}]\n\nContenu:\n${shortcodeContent}\n\nUtilisation: [${shortcode_name}]`
        }
      ]
    };
  }

  // Suivi des performances
  async trackAffiliatePerformance(args) {
    const { time_period = 'last_7d', partners = [] } = args;
    
    // Simulation de données de performance
    const performance = this.generateMockPerformanceData(time_period, partners);
    
    return {
      content: [
        {
          type: 'text',
          text: `Performances d'affiliation (${time_period}):\n\n${JSON.stringify(performance, null, 2)}`
        }
      ]
    };
  }

  // Optimisation du placement
  async optimizeAffiliatePlacement(args) {
    const { content, content_type, target_conversion = 'clics' } = args;
    
    const optimizedContent = this.optimizeContentForAffiliates(content, content_type, target_conversion);
    
    return {
      content: [
        {
          type: 'text',
          text: `Contenu optimisé pour l'affiliation:\n\n${optimizedContent}`
        }
      ]
    };
  }

  // Génération de widgets
  async generateAffiliateWidget(args) {
    const { widget_type, destination, max_items = 5 } = args;
    
    const widget = this.generateWidgetContent(widget_type, destination, max_items);
    
    return {
      content: [
        {
          type: 'text',
          text: `Widget d'affiliation généré (${widget_type}):\n\n${widget}`
        }
      ]
    };
  }

  // Méthodes utilitaires
  getRelevantPartners(contentType) {
    const relevance = {
      'vol': ['skyscanner', 'kiwi'],
      'hotel': ['booking', 'airbnb'],
      'activite': ['getyourguide'],
      'transport': ['kiwi', 'skyscanner'],
      'logement': ['booking', 'airbnb']
    };
    
    return relevance[contentType] || Object.keys(this.affiliatePartners);
  }

  async generatePartnerLink(partner, contentType, destination, searchParams) {
    const baseUrl = partner.baseUrl;
    const affiliateId = partner.affiliateId;
    
    // Paramètres de recherche par défaut
    const defaultParams = {
      'vol': {
        from: 'Paris',
        to: destination,
        depart: this.getDefaultDate(),
        return: this.getDefaultDate(7),
        passengers: 1
      },
      'hotel': {
        destination: destination,
        checkin: this.getDefaultDate(),
        checkout: this.getDefaultDate(2),
        guests: 2
      },
      'activite': {
        destination: destination,
        date: this.getDefaultDate()
      }
    };

    const params = { ...defaultParams[contentType], ...searchParams };
    
    // Génération de l'URL selon le partenaire
    let url = '';
    let displayText = '';
    
    switch (partner.name) {
      case 'Skyscanner':
        url = this.buildSkyscannerUrl(baseUrl, params, affiliateId);
        displayText = `Comparer les vols vers ${destination}`;
        break;
      case 'Booking.com':
        url = this.buildBookingUrl(baseUrl, params, affiliateId);
        displayText = `Réserver un hôtel à ${destination}`;
        break;
      case 'GetYourGuide':
        url = this.buildGetYourGuideUrl(baseUrl, params, affiliateId);
        displayText = `Découvrir ${destination} avec des activités`;
        break;
      case 'Kiwi.com':
        url = this.buildKiwiUrl(baseUrl, params, affiliateId);
        displayText = `Trouver des vols pas chers vers ${destination}`;
        break;
      case 'Airbnb':
        url = this.buildAirbnbUrl(baseUrl, params, affiliateId);
        displayText = `Louer un logement unique à ${destination}`;
        break;
    }

    return {
      url,
      display_text: displayText,
      estimated_commission: this.calculateEstimatedCommission(partner, params)
    };
  }

  buildSkyscannerUrl(baseUrl, params, affiliateId) {
    const searchUrl = `${baseUrl}/transport/flights/${params.from}/${params.to}/${params.depart}/${params.return}/`;
    return affiliateId ? `${searchUrl}?aid=${affiliateId}` : searchUrl;
  }

  buildBookingUrl(baseUrl, params, affiliateId) {
    const searchUrl = `${baseUrl}/searchresults.html?ss=${params.destination}&checkin=${params.checkin}&checkout=${params.checkout}&group_adults=${params.guests}`;
    return affiliateId ? `${searchUrl}&aid=${affiliateId}` : searchUrl;
  }

  buildGetYourGuideUrl(baseUrl, params, affiliateId) {
    const searchUrl = `${baseUrl}/s/${params.destination}/`;
    return affiliateId ? `${searchUrl}?aid=${affiliateId}` : searchUrl;
  }

  buildKiwiUrl(baseUrl, params, affiliateId) {
    const searchUrl = `${baseUrl}/search/results/${params.from}/${params.to}/${params.depart}/${params.return}`;
    return affiliateId ? `${searchUrl}?aid=${affiliateId}` : searchUrl;
  }

  buildAirbnbUrl(baseUrl, params, affiliateId) {
    const searchUrl = `${baseUrl}/s/${params.destination}/homes?checkin=${params.checkin}&checkout=${params.checkout}&adults=${params.guests}`;
    return affiliateId ? `${searchUrl}&aid=${affiliateId}` : searchUrl;
  }

  calculatePriority(partner, contentType, destination) {
    let priority = 0;
    
    // Priorité basée sur le taux de commission
    priority += partner.commissionRate * 100;
    
    // Priorité basée sur la pertinence du partenaire
    const relevance = {
      'vol': { 'skyscanner': 10, 'kiwi': 8, 'booking': 3, 'getyourguide': 1, 'airbnb': 1 },
      'hotel': { 'booking': 10, 'airbnb': 8, 'skyscanner': 2, 'kiwi': 1, 'getyourguide': 1 },
      'activite': { 'getyourguide': 10, 'booking': 3, 'airbnb': 2, 'skyscanner': 1, 'kiwi': 1 }
    };
    
    priority += relevance[contentType]?.[partner.name] || 1;
    
    return priority;
  }

  calculateEstimatedCommission(partner, params) {
    // Estimation basée sur des prix moyens
    const averagePrices = {
      'vol': 400,
      'hotel': 80,
      'activite': 50,
      'transport': 100,
      'logement': 60
    };
    
    const contentType = this.detectContentType(partner.name);
    const averagePrice = averagePrices[contentType] || 50;
    
    return Math.round(averagePrice * partner.commissionRate * 100) / 100;
  }

  detectContentType(partnerName) {
    const mapping = {
      'Skyscanner': 'vol',
      'Kiwi.com': 'vol',
      'Booking.com': 'hotel',
      'Airbnb': 'logement',
      'GetYourGuide': 'activite'
    };
    
    return mapping[partnerName] || 'vol';
  }

  generateShortcodeContent(affiliateLinks, displayStyle) {
    if (displayStyle === 'buttons') {
      return this.generateButtonShortcode(affiliateLinks);
    } else if (displayStyle === 'list') {
      return this.generateListShortcode(affiliateLinks);
    } else {
      return this.generateCarouselShortcode(affiliateLinks);
    }
  }

  generateButtonShortcode(affiliateLinks) {
    let content = '<!-- wp:group {"className":"flashvoyages-affiliate-buttons"} -->\n<div class="wp-block-group flashvoyages-affiliate-buttons">\n';
    
    affiliateLinks.forEach((link, index) => {
      content += `<!-- wp:button {"className":"affiliate-button-${index + 1}"} -->\n`;
      content += `<div class="wp-block-button affiliate-button-${index + 1}">\n`;
      content += `<a class="wp-block-button__link" href="${link.url}" target="_blank" rel="nofollow sponsored">\n`;
      content += `${link.display_text}\n`;
      content += '</a>\n</div>\n<!-- /wp:button -->\n\n';
    });
    
    content += '</div>\n<!-- /wp:group -->';
    
    return content;
  }

  generateListShortcode(affiliateLinks) {
    let content = '<!-- wp:list -->\n<ul>\n';
    
    affiliateLinks.forEach(link => {
      content += `<li><a href="${link.url}" target="_blank" rel="nofollow sponsored">${link.display_text}</a> (${link.partner_name})</li>\n`;
    });
    
    content += '</ul>\n<!-- /wp:list -->';
    
    return content;
  }

  generateCarouselShortcode(affiliateLinks) {
    return `<!-- wp:group {"className":"flashvoyages-affiliate-carousel"} -->
<div class="wp-block-group flashvoyages-affiliate-carousel">
  <!-- wp:html -->
  <div class="affiliate-carousel" data-partners='${JSON.stringify(affiliateLinks)}'>
    <!-- Carousel content will be generated by JavaScript -->
  </div>
  <!-- /wp:html -->
</div>
<!-- /wp:group -->`;
  }

  generateMockPerformanceData(timePeriod, partners) {
    const data = {
      period: timePeriod,
      total_clicks: 0,
      total_commission: 0,
      partners: {}
    };

    const partnerList = partners.length > 0 ? partners : Object.keys(this.affiliatePartners);
    
    partnerList.forEach(partnerKey => {
      const partner = this.affiliatePartners[partnerKey];
      const clicks = Math.floor(Math.random() * 100) + 10;
      const commission = clicks * partner.commissionRate * (Math.random() * 50 + 25);
      
      data.partners[partnerKey] = {
        clicks,
        commission: Math.round(commission * 100) / 100,
        conversion_rate: Math.round((Math.random() * 0.05 + 0.02) * 100) / 100,
        top_destinations: ['Bangkok', 'Tokyo', 'Hanoi', 'Jakarta', 'Kuala Lumpur']
      };
      
      data.total_clicks += clicks;
      data.total_commission += commission;
    });

    data.total_commission = Math.round(data.total_commission * 100) / 100;
    
    return data;
  }

  optimizeContentForAffiliates(content, contentType, targetConversion) {
    // Ajouter des call-to-action optimisés
    const ctaOptimizations = {
      'actualite': '👉 Profitez de cette offre avant qu\'elle ne disparaisse !',
      'guide': '💡 Prêt à réserver ? Comparez les meilleures offres :',
      'bon_plan': '⚡ Offre limitée dans le temps - Réservez maintenant :'
    };

    const cta = ctaOptimizations[contentType] || '🔗 Découvrez les meilleures offres :';
    
    // Insérer le CTA avant la fin du contenu
    const ctaInsertion = `\n\n<!-- wp:paragraph {"className":"flashvoyages-cta"} -->\n<p class="flashvoyages-cta">${cta}</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:shortcode -->\n[cta-affiliate-${contentType}]\n<!-- /wp:shortcode -->`;
    
    return content + ctaInsertion;
  }

  generateWidgetContent(widgetType, destination, maxItems) {
    const widgets = {
      'deals_carousel': this.generateDealsCarouselWidget(destination, maxItems),
      'price_comparison': this.generatePriceComparisonWidget(destination),
      'destination_highlights': this.generateDestinationHighlightsWidget(destination, maxItems),
      'trending_destinations': this.generateTrendingDestinationsWidget(maxItems)
    };
    
    return widgets[widgetType] || widgets['deals_carousel'];
  }

  generateDealsCarouselWidget(destination, maxItems) {
    return `<!-- wp:group {"className":"flashvoyages-deals-carousel"} -->
<div class="wp-block-group flashvoyages-deals-carousel">
  <h3>🔥 Bons plans ${destination}</h3>
  <div class="deals-carousel" data-destination="${destination}" data-max-items="${maxItems}">
    <!-- Deals will be loaded dynamically -->
  </div>
</div>
<!-- /wp:group -->`;
  }

  generatePriceComparisonWidget(destination) {
    return `<!-- wp:group {"className":"flashvoyages-price-comparison"} -->
<div class="wp-block-group flashvoyages-price-comparison">
  <h3>💰 Comparateur de prix ${destination}</h3>
  <div class="price-comparison" data-destination="${destination}">
    <!-- Price comparison will be loaded dynamically -->
  </div>
</div>
<!-- /wp:group -->`;
  }

  generateDestinationHighlightsWidget(destination, maxItems) {
    return `<!-- wp:group {"className":"flashvoyages-destination-highlights"} -->
<div class="wp-block-group flashvoyages-destination-highlights">
  <h3>⭐ À ne pas manquer à ${destination}</h3>
  <div class="highlights-list" data-destination="${destination}" data-max-items="${maxItems}">
    <!-- Highlights will be loaded dynamically -->
  </div>
</div>
<!-- /wp:group -->`;
  }

  generateTrendingDestinationsWidget(maxItems) {
    return `<!-- wp:group {"className":"flashvoyages-trending-destinations"} -->
<div class="wp-block-group flashvoyages-trending-destinations">
  <h3>📈 Destinations tendance</h3>
  <div class="trending-destinations" data-max-items="${maxItems}">
    <!-- Trending destinations will be loaded dynamically -->
  </div>
</div>
<!-- /wp:group -->`;
  }

  getDefaultDate(daysFromNow = 0) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toISOString().split('T')[0];
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Serveur FlashVoyages Affiliate Manager démarré');
  }
}

// Démarrer le serveur
const server = new FlashVoyagesAffiliateManager();
server.run().catch(console.error);

