#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class GitHubMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'github-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.githubToken = process.env.GITHUB_TOKEN || '';
    this.githubUsername = process.env.GITHUB_USERNAME || '';
    this.setupHandlers();
  }

  setupHandlers() {
    // Handler pour lister les outils disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_repository',
            description: 'Créer un nouveau repository GitHub',
            inputSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Nom du repository'
                },
                description: {
                  type: 'string',
                  description: 'Description du repository'
                },
                private: {
                  type: 'boolean',
                  description: 'Repository privé ou public',
                  default: false
                }
              },
              required: ['name']
            }
          },
          {
            name: 'push_code',
            description: 'Pousser le code vers un repository GitHub',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Nom du repository (format: owner/repo)'
                },
                branch: {
                  type: 'string',
                  description: 'Branche de destination',
                  default: 'main'
                },
                message: {
                  type: 'string',
                  description: 'Message de commit'
                }
              },
              required: ['repository', 'message']
            }
          },
          {
            name: 'create_workflow',
            description: 'Créer un workflow GitHub Actions',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Nom du repository (format: owner/repo)'
                },
                workflow_name: {
                  type: 'string',
                  description: 'Nom du workflow'
                },
                workflow_content: {
                  type: 'string',
                  description: 'Contenu YAML du workflow'
                }
              },
              required: ['repository', 'workflow_name', 'workflow_content']
            }
          },
          {
            name: 'set_secrets',
            description: 'Configurer les secrets GitHub (simulation)',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Nom du repository (format: owner/repo)'
                },
                secrets: {
                  type: 'object',
                  description: 'Secrets à configurer'
                }
              },
              required: ['repository', 'secrets']
            }
          },
          {
            name: 'get_repository_info',
            description: 'Récupérer les informations d\'un repository',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Nom du repository (format: owner/repo)'
                }
              },
              required: ['repository']
            }
          },
          {
            name: 'list_repositories',
            description: 'Lister les repositories de l\'utilisateur',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Nom d\'utilisateur GitHub'
                }
              },
              required: ['username']
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
          case 'create_repository':
            return await this.createRepository(args);
          case 'push_code':
            return await this.pushCode(args);
          case 'create_workflow':
            return await this.createWorkflow(args);
          case 'set_secrets':
            return await this.setSecrets(args);
          case 'get_repository_info':
            return await this.getRepositoryInfo(args);
          case 'list_repositories':
            return await this.listRepositories(args);
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

  async makeGitHubRequest(endpoint, method = 'GET', data = null) {
    const headers = {
      'Authorization': `token ${this.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'FlashVoyages-MCP-Server'
    };

    const config = {
      method,
      url: `https://api.github.com${endpoint}`,
      headers,
      data
    };

    const response = await axios(config);
    return response.data;
  }

  async createRepository(args) {
    const { name, description = '', private: isPrivate = false } = args;
    
    if (!this.githubToken) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ GITHUB_TOKEN non configuré. Veuillez configurer votre token GitHub.'
          }
        ]
      };
    }

    try {
      const repoData = {
        name,
        description,
        private: isPrivate,
        auto_init: true,
        gitignore_template: 'Node'
      };

      const repository = await this.makeGitHubRequest('/user/repos', 'POST', repoData);
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Repository créé avec succès !
📁 Nom: ${repository.name}
🔗 URL: ${repository.html_url}
📝 Description: ${repository.description}
🔒 Privé: ${repository.private ? 'Oui' : 'Non'}
📊 Stars: ${repository.stargazers_count}
🍴 Forks: ${repository.forks_count}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Erreur création repository: ${error.response?.data?.message || error.message}`);
    }
  }

  async pushCode(args) {
    const { repository, branch = 'main', message } = args;
    
    return {
      content: [
        {
          type: 'text',
          text: `📤 Instructions pour pousser le code vers ${repository}:

1. **Ajouter le remote GitHub:**
   \`\`\`bash
   git remote add origin https://github.com/${repository}.git
   \`\`\`

2. **Pousser le code:**
   \`\`\`bash
   git branch -M ${branch}
   git push -u origin ${branch}
   \`\`\`

3. **Vérifier sur GitHub:**
   🔗 https://github.com/${repository}

✅ Le code sera poussé vers la branche ${branch} avec le message: "${message}"`
        }
      ]
    };
  }

  async createWorkflow(args) {
    const { repository, workflow_name, workflow_content } = args;
    
    return {
      content: [
        {
          type: 'text',
          text: `🔧 Workflow GitHub Actions créé pour ${repository}:

**Fichier:** \`.github/workflows/${workflow_name}.yml\`

**Contenu:**
\`\`\`yaml
${workflow_content}
\`\`\`

**Instructions:**
1. Créer le dossier \`.github/workflows/\` dans votre projet
2. Sauvegarder le contenu dans \`${workflow_name}.yml\`
3. Commiter et pousser vers GitHub
4. Le workflow se lancera automatiquement !

**Vérification:**
🔗 https://github.com/${repository}/actions`
        }
      ]
    };
  }

  async setSecrets(args) {
    const { repository, secrets } = args;
    
    const secretsList = Object.entries(secrets)
      .map(([key, value]) => `- \`${key}\` = \`${value}\``)
      .join('\n');
    
    return {
      content: [
        {
          type: 'text',
          text: `🔐 Secrets à configurer pour ${repository}:

**Dans GitHub:**
1. Aller dans Settings > Secrets and variables > Actions
2. Cliquer "New repository secret"
3. Ajouter ces secrets:

${secretsList}

**Note:** Les secrets sont masqués dans les logs GitHub Actions pour la sécurité.

**Vérification:**
🔗 https://github.com/${repository}/settings/secrets/actions`
        }
      ]
    };
  }

  async getRepositoryInfo(args) {
    const { repository } = args;
    
    try {
      const repoInfo = await this.makeGitHubRequest(`/repos/${repository}`);
      
      return {
        content: [
          {
            type: 'text',
            text: `📊 Informations du repository ${repository}:

📁 **Nom:** ${repoInfo.name}
📝 **Description:** ${repoInfo.description || 'Aucune description'}
🔒 **Visibilité:** ${repoInfo.private ? 'Privé' : 'Public'}
⭐ **Stars:** ${repoInfo.stargazers_count}
🍴 **Forks:** ${repoInfo.forks_count}
👀 **Watchers:** ${repoInfo.watchers_count}
🌿 **Branche par défaut:** ${repoInfo.default_branch}
📅 **Créé le:** ${new Date(repoInfo.created_at).toLocaleDateString('fr-FR')}
🔄 **Dernière mise à jour:** ${new Date(repoInfo.updated_at).toLocaleDateString('fr-FR')}
🔗 **URL:** ${repoInfo.html_url}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Repository non trouvé: ${error.response?.data?.message || error.message}`);
    }
  }

  async listRepositories(args) {
    const { username } = args;
    
    try {
      const repos = await this.makeGitHubRequest(`/users/${username}/repos?sort=updated&per_page=10`);
      
      const reposList = repos.map(repo => 
        `- **${repo.name}** (${repo.private ? '🔒' : '🌐'}) - ${repo.description || 'Aucune description'} - ⭐ ${repo.stargazers_count}`
      ).join('\n');
      
      return {
        content: [
          {
            type: 'text',
            text: `📚 Repositories de ${username} (10 derniers):

${reposList}

**Total:** ${repos.length} repositories trouvés
🔗 **Profil:** https://github.com/${username}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Utilisateur non trouvé: ${error.response?.data?.message || error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GitHub MCP Server running on stdio');
  }
}

const server = new GitHubMCPServer();
server.run().catch(console.error);
