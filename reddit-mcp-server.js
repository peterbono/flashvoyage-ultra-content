#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class RedditMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'reddit-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Mapping des destinations vers les subreddits d'expats
    this.subredditMap = {
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

    this.setupHandlers();
  }

  setupHandlers() {
    // Handler pour lister les outils disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_expat_advice',
            description: 'Récupérer des conseils d\'expats authentiques depuis Reddit',
            inputSchema: {
              type: 'object',
              properties: {
                destination: {
                  type: 'string',
                  description: 'Destination (ex: tokyo, bangkok, seoul)'
                },
                quartier: {
                  type: 'string',
                  description: 'Quartier spécifique (ex: shibuya, sukhumvit)'
                },
                max_posts: {
                  type: 'number',
                  description: 'Nombre maximum de posts à récupérer',
                  default: 20
                },
                min_score: {
                  type: 'number',
                  description: 'Score minimum des posts',
                  default: 5
                }
              },
              required: ['destination']
            }
          },
          {
            name: 'search_expat_keywords',
            description: 'Rechercher des conseils d\'expats par mots-clés',
            inputSchema: {
              type: 'object',
              properties: {
                destination: {
                  type: 'string',
                  description: 'Destination'
                },
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Mots-clés de recherche'
                },
                max_posts: {
                  type: 'number',
                  description: 'Nombre maximum de posts',
                  default: 15
                }
              },
              required: ['destination', 'keywords']
            }
          },
          {
            name: 'get_travel_tips',
            description: 'Récupérer des conseils de voyage généraux',
            inputSchema: {
              type: 'object',
              properties: {
                destination: {
                  type: 'string',
                  description: 'Destination'
                },
                tip_type: {
                  type: 'string',
                  enum: ['transport', 'food', 'accommodation', 'culture', 'money'],
                  description: 'Type de conseil'
                },
                max_posts: {
                  type: 'number',
                  description: 'Nombre maximum de posts',
                  default: 10
                }
              },
              required: ['destination', 'tip_type']
            }
          },
          {
            name: 'get_local_insights',
            description: 'Récupérer des insights locaux et culturels',
            inputSchema: {
              type: 'object',
              properties: {
                destination: {
                  type: 'string',
                  description: 'Destination'
                },
                insight_type: {
                  type: 'string',
                  enum: ['culture', 'language', 'etiquette', 'festivals', 'hidden_gems'],
                  description: 'Type d\'insight'
                },
                max_posts: {
                  type: 'number',
                  description: 'Nombre maximum de posts',
                  default: 12
                }
              },
              required: ['destination', 'insight_type']
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
          case 'get_expat_advice':
            return await this.getExpatAdvice(args);
          case 'search_expat_keywords':
            return await this.searchExpatKeywords(args);
          case 'get_travel_tips':
            return await this.getTravelTips(args);
          case 'get_local_insights':
            return await this.getLocalInsights(args);
          default:
            throw new Error(`Outil inconnu: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Erreur lors de l'exécution de ${name}: ${error.message}`
            }
          ]
        };
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

  async getExpatAdvice(args) {
    const { destination, quartier = '', max_posts = 20, min_score = 5 } = args;
    
    const subreddit = this.subredditMap[destination.toLowerCase()];
    if (!subreddit) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun subreddit d'expats trouvé pour ${destination}`
          }
        ]
      };
    }

    const searchQuery = quartier 
      ? `${quartier} expat advice tips local insider`
      : `${destination} expat advice tips local insider`;

    console.log(`🔍 Recherche Reddit: r/${subreddit} - "${searchQuery}"`);
    
    const posts = await this.makeRedditRequest(subreddit, searchQuery, max_posts);
    const relevantPosts = this.filterRelevantPosts(posts, min_score);

    if (relevantPosts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun conseil d'expat trouvé pour ${destination}${quartier ? ` - ${quartier}` : ''}`
          }
        ]
      };
    }

    const adviceList = relevantPosts.map((post, index) => 
      `${index + 1}. **${post.title}** (Score: ${post.score})\n   ${post.content.substring(0, 200)}...\n   🔗 ${post.url}\n`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `🎯 Conseils d'expats authentiques pour ${destination}${quartier ? ` - ${quartier}` : ''}:\n\n${adviceList}\n\n📊 **Total:** ${relevantPosts.length} conseils trouvés\n🔗 **Source:** r/${subreddit}`
        }
      ]
    };
  }

  async searchExpatKeywords(args) {
    const { destination, keywords, max_posts = 15 } = args;
    
    const subreddit = this.subredditMap[destination.toLowerCase()];
    if (!subreddit) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun subreddit d'expats trouvé pour ${destination}`
          }
        ]
      };
    }

    const searchQuery = keywords.join(' ') + ' expat advice';
    console.log(`🔍 Recherche Reddit: r/${subreddit} - "${searchQuery}"`);
    
    const posts = await this.makeRedditRequest(subreddit, searchQuery, max_posts);
    const relevantPosts = this.filterRelevantPosts(posts, 3);

    if (relevantPosts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun conseil trouvé pour les mots-clés: ${keywords.join(', ')}`
          }
        ]
      };
    }

    const adviceList = relevantPosts.map((post, index) => 
      `${index + 1}. **${post.title}** (Score: ${post.score})\n   ${post.content.substring(0, 150)}...\n   🔗 ${post.url}\n`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `🎯 Conseils d'expats pour "${keywords.join(', ')}" à ${destination}:\n\n${adviceList}\n\n📊 **Total:** ${relevantPosts.length} conseils trouvés`
        }
      ]
    };
  }

  async getTravelTips(args) {
    const { destination, tip_type, max_posts = 10 } = args;
    
    const subreddit = this.subredditMap[destination.toLowerCase()];
    if (!subreddit) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun subreddit d'expats trouvé pour ${destination}`
          }
        ]
      };
    }

    const tipKeywords = {
      'transport': 'transport bus train metro taxi',
      'food': 'food restaurant local cuisine street food',
      'accommodation': 'hotel hostel accommodation where to stay',
      'culture': 'culture local customs etiquette',
      'money': 'money budget cost price currency'
    };

    const searchQuery = tipKeywords[tip_type] || tip_type;
    console.log(`🔍 Recherche Reddit: r/${subreddit} - "${searchQuery}"`);
    
    const posts = await this.makeRedditRequest(subreddit, searchQuery, max_posts);
    const relevantPosts = this.filterRelevantPosts(posts, 3);

    if (relevantPosts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun conseil ${tip_type} trouvé pour ${destination}`
          }
        ]
      };
    }

    const tipsList = relevantPosts.map((post, index) => 
      `${index + 1}. **${post.title}** (Score: ${post.score})\n   ${post.content.substring(0, 200)}...\n   🔗 ${post.url}\n`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `🎯 Conseils ${tip_type} pour ${destination}:\n\n${tipsList}\n\n📊 **Total:** ${relevantPosts.length} conseils trouvés`
        }
      ]
    };
  }

  async getLocalInsights(args) {
    const { destination, insight_type, max_posts = 12 } = args;
    
    const subreddit = this.subredditMap[destination.toLowerCase()];
    if (!subreddit) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun subreddit d'expats trouvé pour ${destination}`
          }
        ]
      };
    }

    const insightKeywords = {
      'culture': 'culture local customs traditions',
      'language': 'language learn speak local',
      'etiquette': 'etiquette manners do not do',
      'festivals': 'festival events celebrations',
      'hidden_gems': 'hidden gems secret spots local'
    };

    const searchQuery = insightKeywords[insight_type] || insight_type;
    console.log(`🔍 Recherche Reddit: r/${subreddit} - "${searchQuery}"`);
    
    const posts = await this.makeRedditRequest(subreddit, searchQuery, max_posts);
    const relevantPosts = this.filterRelevantPosts(posts, 3);

    if (relevantPosts.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Aucun insight ${insight_type} trouvé pour ${destination}`
          }
        ]
      };
    }

    const insightsList = relevantPosts.map((post, index) => 
      `${index + 1}. **${post.title}** (Score: ${post.score})\n   ${post.content.substring(0, 200)}...\n   🔗 ${post.url}\n`
    ).join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `🎯 Insights ${insight_type} pour ${destination}:\n\n${insightsList}\n\n📊 **Total:** ${relevantPosts.length} insights trouvés`
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Reddit MCP Server running on stdio');
  }
}

const server = new RedditMCPServer();
server.run().catch(console.error);
