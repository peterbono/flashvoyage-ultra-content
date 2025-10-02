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

class EnhancedFlashVoyagesContentGenerator {
  constructor() {
    this.server = new Server(
      {
        name: 'enhanced-flashvoyages-content-generator',
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
      'actualites': 56,
      'guides-pratiques': 58,
      'bons-plans': 57,
      'destinations_asie': 1,
      'japon': 61,
      'coree_sud': 63,
      'philippines': 64,
      'nouveaux_vols': 65,
      'alertes': 66,
      'astuces_voyageur': 70
    };

    // Sources d'images Pexels pour l'Asie (plus fiables)
    this.imageSources = {
      'thailande': [
        'https://images.pexels.com/photos/1007657/pexels-photo-1007657.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
      ],
      'japon': [
        'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
      ],
      'philippines': [
        'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
      ],
      'coree': [
        'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
      ],
      'vietnam': [
        'https://images.pexels.com/photos/2901209/pexels-photo-2901209.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901210/pexels-photo-2901210.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901211/pexels-photo-2901211.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901212/pexels-photo-2901212.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop',
        'https://images.pexels.com/photos/2901213/pexels-photo-2901213.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop'
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
            name: 'generate_article_with_images',
            description: 'Génère un article FlashVoyages avec images automatiques',
            inputSchema: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  description: 'Sujet de l\'article (ex: "nouveau vol Paris-Bangkok")'
                },
                content_type: {
                  type: 'string',
                  description: 'Type de contenu',
                  enum: ['actualite', 'guide', 'bon_plan']
                },
                destination: {
                  type: 'string',
                  description: 'Destination (ex: "Thaïlande", "Japon")'
                },
                auto_publish: {
                  type: 'boolean',
                  description: 'Publier automatiquement',
                  default: false
                }
              },
              required: ['topic', 'content_type', 'destination']
            }
          },
          {
            name: 'upload_image_from_url',
            description: 'Upload une image depuis une URL vers WordPress',
            inputSchema: {
              type: 'object',
              properties: {
                image_url: {
                  type: 'string',
                  description: 'URL de l\'image à uploader'
                },
                alt_text: {
                  type: 'string',
                  description: 'Texte alternatif pour l\'image'
                },
                filename: {
                  type: 'string',
                  description: 'Nom du fichier (optionnel)'
                }
              },
              required: ['image_url']
            }
          },
          {
            name: 'create_article_with_featured_image',
            description: 'Crée un article avec image mise en avant',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Titre de l\'article'
                },
                content: {
                  type: 'string',
                  description: 'Contenu de l\'article'
                },
                category: {
                  type: 'string',
                  description: 'Catégorie de l\'article',
                  enum: ['actualites', 'guides-pratiques', 'bons-plans', 'destinations_asie']
                },
                image_url: {
                  type: 'string',
                  description: 'URL de l\'image à utiliser'
                },
                status: {
                  type: 'string',
                  description: 'Statut de publication',
                  enum: ['draft', 'publish'],
                  default: 'draft'
                }
              },
              required: ['title', 'content', 'category', 'image_url']
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
          case 'generate_article_with_images':
            return await this.generateArticleWithImages(args);
          case 'upload_image_from_url':
            return await this.uploadImageFromUrl(args);
          case 'create_article_with_featured_image':
            return await this.createArticleWithFeaturedImage(args);
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

  // Génération d'article avec images automatiques
  async generateArticleWithImages(args) {
    const { topic, content_type, destination, auto_publish = false } = args;
    
    console.log(`🚀 Génération d'article avec images: ${topic}`);
    
    try {
      // 1. Générer le contenu de l'article
      const articleContent = this.generateArticleContent(topic, content_type, destination);
      
      // 2. Sélectionner et uploader une image appropriée
      const imageId = await this.selectAndUploadImage(destination, topic);
      
      // 3. Créer l'article avec l'image
      const article = await this.createArticleWithImage({
        title: this.generateTitle(topic, content_type),
        content: articleContent,
        category: this.getCategoryForContentType(content_type),
        imageId: imageId,
        status: auto_publish ? 'publish' : 'draft'
      });
      
      return {
        content: [
          {
            type: 'text',
            text: `Article généré avec succès !\n\nTitre: ${article.title}\nID: ${article.id}\nURL: ${article.link}\nImage ID: ${imageId}\nStatut: ${article.status}`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Erreur lors de la génération: ${error.message}`
          }
        ]
      };
    }
  }

  // Upload d'image depuis URL
  async uploadImageFromUrl(args) {
    const { image_url, alt_text = '', filename = '' } = args;
    
    try {
      console.log(`📤 Upload d'image depuis: ${image_url}`);
      
      // Télécharger l'image
      const imageResponse = await axios.get(image_url, {
        responseType: 'arraybuffer'
      });
      
      // Créer le FormData
      const formData = new FormData();
      const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
      const finalFilename = filename || `image-${Date.now()}.jpg`;
      formData.append('file', blob, finalFilename);
      
      // Upload vers WordPress
      const uploadResponse = await axios.post(`${this.wpBaseUrl}/wp-json/wp/v2/media`, formData, {
        auth: {
          username: this.wpUsername,
          password: this.wpApplicationPassword || this.wpPassword
        },
        headers: {
          'Content-Disposition': `attachment; filename="${finalFilename}"`,
          'Content-Type': 'image/jpeg'
        }
      });
      
      // Ajouter l'alt text si fourni
      if (alt_text) {
        await axios.post(`${this.wpBaseUrl}/wp-json/wp/v2/media/${uploadResponse.data.id}`, {
          alt_text: alt_text
        }, {
          auth: {
            username: this.wpUsername,
            password: this.wpApplicationPassword || this.wpPassword
          }
        });
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `Image uploadée avec succès !\nID: ${uploadResponse.data.id}\nURL: ${uploadResponse.data.source_url}\nTaille: ${uploadResponse.data.media_details.width}x${uploadResponse.data.media_details.height}`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Erreur upload image: ${error.message}`
          }
        ]
      };
    }
  }

  // Création d'article avec image mise en avant
  async createArticleWithFeaturedImage(args) {
    const { title, content, category, image_url, status = 'draft' } = args;
    
    try {
      // 1. Uploader l'image
      const imageUpload = await this.uploadImageFromUrl({ 
        image_url, 
        alt_text: title,
        filename: `featured-${Date.now()}.jpg`
      });
      
      const imageId = imageUpload.content[0].text.match(/ID: (\d+)/)[1];
      
      // 2. Créer l'article avec l'image
      const article = await this.createArticleWithImage({
        title,
        content,
        category,
        imageId: parseInt(imageId),
        status
      });
      
      return {
        content: [
          {
            type: 'text',
            text: `Article créé avec image mise en avant !\n\nTitre: ${article.title}\nID: ${article.id}\nURL: ${article.link}\nImage featured: ${imageId}`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Erreur création article: ${error.message}`
          }
        ]
      };
    }
  }

  // Méthodes utilitaires
  async selectAndUploadImage(destination, topic) {
    const destinationKey = this.getDestinationKey(destination);
    const images = this.imageSources[destinationKey] || this.imageSources['thailande'];
    
    // Sélectionner une image aléatoire
    const randomImage = images[Math.floor(Math.random() * images.length)];
    
    // Uploader l'image
    const uploadResult = await this.uploadImageFromUrl({
      image_url: randomImage,
      alt_text: `${topic} - ${destination}`,
      filename: `${destinationKey}-${Date.now()}.jpg`
    });
    
    // Extraire l'ID de l'image
    const imageId = uploadResult.content[0].text.match(/ID: (\d+)/)[1];
    return parseInt(imageId);
  }

  async createArticleWithImage({ title, content, category, imageId, status }) {
    const postData = {
      title,
      content: this.enhanceContentWithImage(content, imageId),
      status,
      categories: [this.categories[category]],
      featured_media: imageId,
      excerpt: this.generateExcerpt(content)
    };

    const response = await axios.post(`${this.wpBaseUrl}/wp-json/wp/v2/posts`, postData, {
      auth: {
        username: this.wpUsername,
        password: this.wpApplicationPassword || this.wpPassword
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  enhanceContentWithImage(content, imageId) {
    // Ajouter l'image au début du contenu
    const imageBlock = `<!-- wp:image {"id":${imageId},"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="" alt="" class="wp-image-${imageId}"/></figure>
<!-- /wp:image -->

`;
    
    return imageBlock + content;
  }

  generateArticleContent(topic, contentType, destination) {
    const templates = {
      'actualite': this.generateNewsContent(topic, destination),
      'guide': this.generateGuideContent(topic, destination),
      'bon_plan': this.generateDealContent(topic, destination)
    };
    
    return templates[contentType] || templates['actualite'];
  }

  generateNewsContent(topic, destination) {
    return `<!-- wp:paragraph -->
<p><strong>Envie de ${destination} sans complications ?</strong> ${topic} - une excellente nouvelle pour les voyageurs francophones !</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>📊 Ce qui change concrètement</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Prix :</strong> À confirmer selon les dates</li>
<li><strong>Dates :</strong> Disponible maintenant</li>
<li><strong>Conditions :</strong> Sous réserve de disponibilité</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>👉 Astuce voyageur FlashVoyages</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Réservez tôt le matin pour avoir les meilleures disponibilités. Les prix peuvent varier selon la saison, mais cette offre reste exceptionnelle.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`;
  }

  generateGuideContent(topic, destination) {
    return `<!-- wp:paragraph -->
<p><strong>Préparer son voyage en ${destination} ?</strong> Voici tout ce qu'il faut savoir pour ${topic.toLowerCase()}.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>🎯 Pourquoi ce guide ?</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Ce guide pratique vous accompagne étape par étape. Basé sur notre expérience terrain et les retours de la communauté FlashVoyages.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>📋 Étapes pratiques</h2>
<!-- /wp:heading -->

<!-- wp:list {"ordered":true} -->
<ol>
<li>Étape 1 : Préparation initiale</li>
<li>Étape 2 : Documentation nécessaire</li>
<li>Étape 3 : Réservation et paiement</li>
<li>Étape 4 : Suivi et confirmation</li>
</ol>
<!-- /wp:list -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`;
  }

  generateDealContent(topic, destination) {
    return `<!-- wp:paragraph -->
<p><strong>Envie de découvrir ${destination} sans se ruiner ?</strong> On a repéré cette pépite avant tout le monde !</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3>🔥 L'offre en détail</h3>
<!-- /wp:heading -->

<!-- wp:list -->
<ul>
<li><strong>Prix :</strong> Offre exceptionnelle</li>
<li><strong>Validité :</strong> Jusqu'à épuisement des stocks</li>
<li><strong>Conditions :</strong> Sous réserve de disponibilité</li>
</ul>
<!-- /wp:list -->

<!-- wp:heading {"level":3} -->
<h3>👉 Pourquoi c'est un bon plan ?</h3>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Cette offre représente une économie significative par rapport aux prix habituels. C'est l'occasion parfaite de découvrir ${destination} sans se ruiner.</p>
<!-- /wp:paragraph -->

<!-- wp:shortcode -->
[cta-newsletter]
<!-- /wp:shortcode -->`;
  }

  generateTitle(topic, contentType) {
    const emojis = {
      'actualite': '✈️',
      'guide': '📋',
      'bon_plan': '🏨'
    };
    
    const emoji = emojis[contentType] || '🌏';
    return `${emoji} ${topic}`;
  }

  getCategoryForContentType(contentType) {
    const mapping = {
      'actualite': 'actualites',
      'guide': 'guides-pratiques',
      'bon_plan': 'bons-plans'
    };
    
    return mapping[contentType] || 'actualites';
  }

  getDestinationKey(destination) {
    const mapping = {
      'Thaïlande': 'thailande',
      'Japon': 'japon',
      'Philippines': 'philippines',
      'Corée du Sud': 'coree',
      'Vietnam': 'vietnam'
    };
    
    return mapping[destination] || 'thailande';
  }

  generateExcerpt(content) {
    const cleanContent = content.replace(/<[^>]*>/g, '');
    return cleanContent.substring(0, 150) + '...';
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Serveur Enhanced FlashVoyages Content Generator avec images démarré');
  }
}

// Démarrer le serveur
const server = new EnhancedFlashVoyagesContentGenerator();
server.run().catch(console.error);
