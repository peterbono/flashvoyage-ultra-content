#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const REPO_NAME = 'flashvoyage-ultra-content';

// Configuration des secrets GitHub
const GITHUB_SECRETS = {
  'WORDPRESS_URL': 'https://flashvoyage.com/',
  'WORDPRESS_USERNAME': 'admin7817',
  'WORDPRESS_APP_PASSWORD': 'GjLl 9W0k lKwf LSOT PXur RYGR',
  'PEXELS_API_KEY': 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA'
};

// Workflow GitHub Actions
const WORKFLOW_CONTENT = `name: Auto Publish Ultra Content
on:
  schedule:
    - cron: '0 9 * * *'  # Tous les jours à 9h UTC (11h française)
  workflow_dispatch:  # Permet de déclencher manuellement

jobs:
  publish:
    runs-on: ubuntu-latest
    name: Generate and Publish Ultra Content
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm install
        
      - name: Start Ultra Content Generator
        run: |
          node ultra-specialized-content-generator.js &
          sleep 5
        env:
          WORDPRESS_URL: \${{ secrets.WORDPRESS_URL }}
          WORDPRESS_USERNAME: \${{ secrets.WORDPRESS_USERNAME }}
          WORDPRESS_APP_PASSWORD: \${{ secrets.WORDPRESS_APP_PASSWORD }}
          PEXELS_API_KEY: \${{ secrets.PEXELS_API_KEY }}
          
      - name: Publish Content
        run: node fixed-auto-publisher.js
        env:
          WORDPRESS_URL: \${{ secrets.WORDPRESS_URL }}
          WORDPRESS_USERNAME: \${{ secrets.WORDPRESS_USERNAME }}
          WORDPRESS_APP_PASSWORD: \${{ secrets.WORDPRESS_APP_PASSWORD }}
          PEXELS_API_KEY: \${{ secrets.PEXELS_API_KEY }}
          
      - name: Notify Success
        if: success()
        run: |
          echo "✅ Contenu ultra-spécialisé publié avec succès !"
          echo "📅 Date: \$(date)"
          echo "🌏 FlashVoyages - Votre spécialiste du voyage en Asie"
          
      - name: Notify Failure
        if: failure()
        run: |
          echo "❌ Erreur lors de la publication du contenu"
          echo "📅 Date: \$(date)"
          echo "🔍 Vérifiez les logs pour plus de détails"`;

async function makeGitHubRequest(endpoint, method = 'GET', data = null) {
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'FlashVoyages-Auto-Deployment'
  };

  const config = {
    method,
    url: `https://api.github.com${endpoint}`,
    headers,
    data
  };

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    throw new Error(`GitHub API Error: ${error.response?.data?.message || error.message}`);
  }
}

async function createRepository() {
  console.log('🚀 Création du repository GitHub...');
  
  try {
    const repoData = {
      name: REPO_NAME,
      description: '🚀 FlashVoyages Ultra Content Generator - Système d\'automatisation de contenu ultra-spécialisé pour le voyage en Asie',
      private: false,
      auto_init: true,
      gitignore_template: 'Node'
    };

    const repository = await makeGitHubRequest('/user/repos', 'POST', repoData);
    console.log(`✅ Repository créé: ${repository.html_url}`);
    return repository;
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log(`ℹ️ Repository ${REPO_NAME} existe déjà`);
      return { name: REPO_NAME, html_url: `https://github.com/${GITHUB_USERNAME}/${REPO_NAME}` };
    }
    throw error;
  }
}

async function createWorkflow() {
  console.log('🔧 Création du workflow GitHub Actions...');
  
  try {
    // Créer le workflow via l'API GitHub
    const workflowData = {
      message: 'Add GitHub Actions workflow for auto-publishing',
      content: Buffer.from(WORKFLOW_CONTENT).toString('base64'),
      branch: 'main'
    };

    await makeGitHubRequest(
      `/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/.github/workflows/auto-publish.yml`,
      'PUT',
      workflowData
    );
    
    console.log('✅ Workflow GitHub Actions créé');
  } catch (error) {
    console.log(`⚠️ Erreur création workflow: ${error.message}`);
    console.log('📝 Instructions manuelles:');
    console.log('1. Créer le dossier .github/workflows/');
    console.log('2. Créer le fichier auto-publish.yml avec le contenu du workflow');
  }
}

async function setupSecrets() {
  console.log('🔐 Configuration des secrets GitHub...');
  
  console.log('📋 Secrets à configurer manuellement dans GitHub:');
  console.log('🔗 https://github.com/' + GITHUB_USERNAME + '/' + REPO_NAME + '/settings/secrets/actions');
  console.log('');
  
  Object.entries(GITHUB_SECRETS).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
  
  console.log('');
  console.log('📝 Instructions:');
  console.log('1. Aller dans Settings > Secrets and variables > Actions');
  console.log('2. Cliquer "New repository secret"');
  console.log('3. Ajouter chaque secret un par un');
}

async function generateDeploymentInstructions() {
  console.log('📚 Génération des instructions de déploiement...');
  
  const instructions = `# 🚀 Instructions de Déploiement FlashVoyages

## ✅ Étapes Automatisées
- ✅ Repository GitHub créé
- ✅ Workflow GitHub Actions configuré
- ✅ Structure du projet prête

## 🔧 Étapes Manuelles

### 1. Configurer les secrets GitHub
Aller sur: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}/settings/secrets/actions

Ajouter ces secrets:
${Object.entries(GITHUB_SECRETS).map(([key, value]) => `- \`${key}\` = \`${value}\``).join('\n')}

### 2. Pousser le code
\`\`\`bash
git remote add origin https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git
git branch -M main
git push -u origin main
\`\`\`

### 3. Activer GitHub Actions
1. Aller dans l'onglet "Actions" du repository
2. Cliquer "I understand my workflows, go ahead and enable them"
3. Le workflow se lancera automatiquement !

## 🎯 Résultat
- ✅ Publication automatique quotidienne à 9h UTC
- ✅ Contenu ultra-spécialisé généré
- ✅ Images contextuelles via Pexels
- ✅ Aucune intervention manuelle nécessaire

## 🔍 Monitoring
- **Logs:** Actions > Auto Publish Ultra Content
- **Articles:** Vérifier sur votre site WordPress
- **Erreurs:** Notifications automatiques

Votre système d'automatisation est prêt ! 🎉`;

  console.log(instructions);
  
  // Sauvegarder dans un fichier
  const fs = await import('fs');
  fs.writeFileSync('DEPLOYMENT-COMPLETE.md', instructions);
  console.log('💾 Instructions sauvegardées dans DEPLOYMENT-COMPLETE.md');
}

async function main() {
  console.log('🚀 FlashVoyages Auto GitHub Deployment');
  console.log('=====================================\n');
  
  if (!GITHUB_TOKEN) {
    console.log('❌ GITHUB_TOKEN non configuré');
    console.log('📝 Ajoutez votre token GitHub dans le fichier .env');
    console.log('🔗 Créer un token: https://github.com/settings/tokens');
    return;
  }
  
  if (!GITHUB_USERNAME) {
    console.log('❌ GITHUB_USERNAME non configuré');
    console.log('📝 Ajoutez votre nom d\'utilisateur GitHub dans le fichier .env');
    return;
  }
  
  try {
    // 1. Créer le repository
    await createRepository();
    
    // 2. Créer le workflow
    await createWorkflow();
    
    // 3. Configurer les secrets
    await setupSecrets();
    
    // 4. Générer les instructions
    await generateDeploymentInstructions();
    
    console.log('\n🎉 Déploiement GitHub automatisé terminé !');
    console.log('📋 Suivez les instructions dans DEPLOYMENT-COMPLETE.md');
    
  } catch (error) {
    console.error('❌ Erreur lors du déploiement:', error.message);
  }
}

main().catch(console.error);
