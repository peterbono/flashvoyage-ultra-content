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

class WordPressMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'wordpress-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.wpBaseUrl = process.env.WORDPRESS_URL || 'https://votre-site-wordpress.com';
    this.wpUsername = process.env.WORDPRESS_USERNAME || '';
    this.wpPassword = process.env.WORDPRESS_PASSWORD || '';
    this.wpApplicationPassword = process.env.WORDPRESS_APP_PASSWORD || '';

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler pour lister les outils disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_posts',
            description: 'Récupère la liste des articles WordPress',
            inputSchema: {
              type: 'object',
              properties: {
                per_page: {
                  type: 'number',
                  description: 'Nombre d\'articles à récupérer (défaut: 10)',
                  default: 10
                },
                page: {
                  type: 'number',
                  description: 'Numéro de page (défaut: 1)',
                  default: 1
                },
                status: {
                  type: 'string',
                  description: 'Statut des articles (publish, draft, private)',
                  enum: ['publish', 'draft', 'private', 'pending', 'future']
                }
              }
            }
          },
          {
            name: 'get_post',
            description: 'Récupère un article WordPress spécifique par ID',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'ID de l\'article à récupérer'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'create_post',
            description: 'Crée un nouvel article WordPress',
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
                status: {
                  type: 'string',
                  description: 'Statut de l\'article',
                  enum: ['publish', 'draft', 'private', 'pending'],
                  default: 'draft'
                },
                excerpt: {
                  type: 'string',
                  description: 'Extrait de l\'article'
                }
              },
              required: ['title', 'content']
            }
          },
          {
            name: 'update_post',
            description: 'Met à jour un article WordPress existant',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'ID de l\'article à mettre à jour'
                },
                title: {
                  type: 'string',
                  description: 'Nouveau titre de l\'article'
                },
                content: {
                  type: 'string',
                  description: 'Nouveau contenu de l\'article'
                },
                status: {
                  type: 'string',
                  description: 'Nouveau statut de l\'article',
                  enum: ['publish', 'draft', 'private', 'pending']
                },
                excerpt: {
                  type: 'string',
                  description: 'Nouvel extrait de l\'article'
                }
              },
              required: ['id']
            }
          },
          {
            name: 'delete_post',
            description: 'Supprime un article WordPress',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'number',
                  description: 'ID de l\'article à supprimer'
                },
                force: {
                  type: 'boolean',
                  description: 'Suppression définitive (true) ou mise en corbeille (false)',
                  default: false
                }
              },
              required: ['id']
            }
          },
          {
            name: 'get_pages',
            description: 'Récupère la liste des pages WordPress',
            inputSchema: {
              type: 'object',
              properties: {
                per_page: {
                  type: 'number',
                  description: 'Nombre de pages à récupérer (défaut: 10)',
                  default: 10
                },
                page: {
                  type: 'number',
                  description: 'Numéro de page (défaut: 1)',
                  default: 1
                }
              }
            }
          },
          {
            name: 'get_media',
            description: 'Récupère la liste des médias WordPress',
            inputSchema: {
              type: 'object',
              properties: {
                per_page: {
                  type: 'number',
                  description: 'Nombre de médias à récupérer (défaut: 10)',
                  default: 10
                },
                page: {
                  type: 'number',
                  description: 'Numéro de page (défaut: 1)',
                  default: 1
                }
              }
            }
          },
          {
            name: 'get_users',
            description: 'Récupère la liste des utilisateurs WordPress',
            inputSchema: {
              type: 'object',
              properties: {
                per_page: {
                  type: 'number',
                  description: 'Nombre d\'utilisateurs à récupérer (défaut: 10)',
                  default: 10
                },
                page: {
                  type: 'number',
                  description: 'Numéro de page (défaut: 1)',
                  default: 1
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
          case 'get_posts':
            return await this.getPosts(args);
          case 'get_post':
            return await this.getPost(args);
          case 'create_post':
            return await this.createPost(args);
          case 'update_post':
            return await this.updatePost(args);
          case 'delete_post':
            return await this.deletePost(args);
          case 'get_pages':
            return await this.getPages(args);
          case 'get_media':
            return await this.getMedia(args);
          case 'get_users':
            return await this.getUsers(args);
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
    const auth = this.wpApplicationPassword 
      ? `${this.wpUsername}:${this.wpApplicationPassword}`
      : `${this.wpUsername}:${this.wpPassword}`;
    
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

  async getPosts(args) {
    const params = new URLSearchParams();
    if (args.per_page) params.append('per_page', args.per_page);
    if (args.page) params.append('page', args.page);
    if (args.status) params.append('status', args.status);

    const posts = await this.makeRequest(`/posts?${params.toString()}`);
    return {
      content: [
        {
          type: 'text',
          text: `Articles récupérés: ${JSON.stringify(posts, null, 2)}`
        }
      ]
    };
  }

  async getPost(args) {
    const post = await this.makeRequest(`/posts/${args.id}`);
    return {
      content: [
        {
          type: 'text',
          text: `Article récupéré: ${JSON.stringify(post, null, 2)}`
        }
      ]
    };
  }

  async createPost(args) {
    const postData = {
      title: args.title,
      content: args.content,
      status: args.status || 'draft'
    };
    if (args.excerpt) postData.excerpt = args.excerpt;

    const post = await this.makeRequest('/posts', 'POST', postData);
    return {
      content: [
        {
          type: 'text',
          text: `Article créé avec succès: ${JSON.stringify(post, null, 2)}`
        }
      ]
    };
  }

  async updatePost(args) {
    const postData = {};
    if (args.title) postData.title = args.title;
    if (args.content) postData.content = args.content;
    if (args.status) postData.status = args.status;
    if (args.excerpt) postData.excerpt = args.excerpt;

    const post = await this.makeRequest(`/posts/${args.id}`, 'POST', postData);
    return {
      content: [
        {
          type: 'text',
          text: `Article mis à jour avec succès: ${JSON.stringify(post, null, 2)}`
        }
      ]
    };
  }

  async deletePost(args) {
    const params = args.force ? '?force=true' : '';
    await this.makeRequest(`/posts/${args.id}${params}`, 'DELETE');
    return {
      content: [
        {
          type: 'text',
          text: `Article ${args.force ? 'supprimé définitivement' : 'mis en corbeille'} avec succès`
        }
      ]
    };
  }

  async getPages(args) {
    const params = new URLSearchParams();
    if (args.per_page) params.append('per_page', args.per_page);
    if (args.page) params.append('page', args.page);

    const pages = await this.makeRequest(`/pages?${params.toString()}`);
    return {
      content: [
        {
          type: 'text',
          text: `Pages récupérées: ${JSON.stringify(pages, null, 2)}`
        }
      ]
    };
  }

  async getMedia(args) {
    const params = new URLSearchParams();
    if (args.per_page) params.append('per_page', args.per_page);
    if (args.page) params.append('page', args.page);

    const media = await this.makeRequest(`/media?${params.toString()}`);
    return {
      content: [
        {
          type: 'text',
          text: `Médias récupérés: ${JSON.stringify(media, null, 2)}`
        }
      ]
    };
  }

  async getUsers(args) {
    const params = new URLSearchParams();
    if (args.per_page) params.append('per_page', args.per_page);
    if (args.page) params.append('page', args.page);

    const users = await this.makeRequest(`/users?${params.toString()}`);
    return {
      content: [
        {
          type: 'text',
          text: `Utilisateurs récupérés: ${JSON.stringify(users, null, 2)}`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Serveur MCP WordPress démarré');
  }
}

// Démarrer le serveur
const server = new WordPressMCPServer();
server.run().catch(console.error);


