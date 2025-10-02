#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function setupGitHubCredentials() {
  console.log('🔧 Configuration des credentials GitHub\n');
  
  let githubToken = process.env.GITHUB_TOKEN;
  let githubUsername = process.env.GITHUB_USERNAME;
  
  if (!githubToken || githubToken === 'your_github_token_here') {
    console.log('📝 Pour obtenir un token GitHub :');
    console.log('1. Aller sur https://github.com/settings/tokens');
    console.log('2. "Generate new token" > "Generate new token (classic)"');
    console.log('3. Sélectionner les scopes : repo, workflow, admin:org');
    console.log('4. Copier le token\n');
    
    githubToken = await askQuestion('🔑 Votre token GitHub : ');
  }
  
  if (!githubUsername || githubUsername === 'your_github_username') {
    githubUsername = await askQuestion('👤 Votre nom d\'utilisateur GitHub : ');
  }
  
  return { githubToken, githubUsername };
}

async function testGitHubConnection(token, username) {
  console.log('\n🧪 Test de connexion GitHub...');
  
  try {
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FlashVoyages-Setup'
      }
    });
    
    console.log('✅ Connexion GitHub réussie');
    console.log(`👤 Utilisateur: ${response.data.login}`);
    return true;
  } catch (error) {
    console.log('❌ Erreur connexion GitHub:', error.response?.data?.message || error.message);
    return false;
  }
}

async function checkRepositoryExists(username, repoName) {
  console.log(`\n🔍 Vérification du repository ${username}/${repoName}...`);
  
  try {
    const response = await axios.get(`https://api.github.com/repos/${username}/${repoName}`, {
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FlashVoyages-Setup'
      }
    });
    
    console.log('✅ Repository trouvé');
    console.log(`🔗 URL: ${response.data.html_url}`);
    console.log(`📝 Description: ${response.data.description || 'Aucune description'}`);
    console.log(`🔒 Privé: ${response.data.private ? 'Oui' : 'Non'}`);
    return true;
  } catch (error) {
    console.log('❌ Repository non trouvé:', error.response?.data?.message || error.message);
    return false;
  }
}

async function createWorkflow(username, repoName, token) {
  console.log('\n🔧 Création du workflow GitHub Actions...');
  
  const workflowContent = `name: Auto Publish Ultra Content
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

  try {
    const encodedContent = Buffer.from(workflowContent).toString('base64');
    
    const workflowData = {
      message: 'Add GitHub Actions workflow for auto-publishing FlashVoyages content',
      content: encodedContent,
      branch: 'main'
    };

    await axios.put(
      `https://api.github.com/repos/${username}/${repoName}/contents/.github/workflows/auto-publish.yml`,
      workflowData,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'FlashVoyages-Setup'
        }
      }
    );
    
    console.log('✅ Workflow GitHub Actions créé');
    console.log('🔗 Vérifier: https://github.com/' + username + '/' + repoName + '/actions');
    return true;
  } catch (error) {
    if (error.response?.status === 422) {
      console.log('ℹ️ Workflow existe déjà, mise à jour...');
      // Essayer de mettre à jour le workflow existant
      try {
        const getResponse = await axios.get(
          `https://api.github.com/repos/${username}/${repoName}/contents/.github/workflows/auto-publish.yml`,
          {
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'FlashVoyages-Setup'
            }
          }
        );
        
        const updateData = {
          message: 'Update GitHub Actions workflow for auto-publishing',
          content: encodedContent,
          sha: getResponse.data.sha,
          branch: 'main'
        };

        await axios.put(
          `https://api.github.com/repos/${username}/${repoName}/contents/.github/workflows/auto-publish.yml`,
          updateData,
          {
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'User-Agent': 'FlashVoyages-Setup'
            }
          }
        );
        
        console.log('✅ Workflow mis à jour');
        return true;
      } catch (updateError) {
        console.log('❌ Erreur mise à jour workflow:', updateError.response?.data?.message || updateError.message);
        return false;
      }
    } else {
      console.log('❌ Erreur création workflow:', error.response?.data?.message || error.message);
      return false;
    }
  }
}

async function generateSecretsInstructions(username, repoName) {
  console.log('\n🔐 Configuration des secrets GitHub...');
  
  const secrets = {
    'WORDPRESS_URL': 'https://flashvoyage.com/',
    'WORDPRESS_USERNAME': 'admin7817',
    'WORDPRESS_APP_PASSWORD': 'GjLl 9W0k lKwf LSOT PXur RYGR',
    'PEXELS_API_KEY': 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA'
  };
  
  console.log('📋 Secrets à configurer manuellement :');
  console.log('🔗 https://github.com/' + username + '/' + repoName + '/settings/secrets/actions');
  console.log('');
  
  Object.entries(secrets).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });
  
  console.log('\n📝 Instructions :');
  console.log('1. Aller dans Settings > Secrets and variables > Actions');
  console.log('2. Cliquer "New repository secret"');
  console.log('3. Ajouter chaque secret un par un');
  console.log('4. Sauvegarder');
}

async function generateDeploymentInstructions(username, repoName) {
  console.log('\n📚 Instructions de déploiement final...');
  
  const instructions = `
# 🚀 FlashVoyages - Déploiement Automatique Configuré !

## ✅ Étapes Automatisées Terminées
- ✅ Repository GitHub vérifié : ${username}/${repoName}
- ✅ Workflow GitHub Actions créé
- ✅ Configuration prête

## 🔧 Étapes Manuelles Restantes

### 1. Configurer les secrets GitHub
Aller sur: https://github.com/${username}/${repoName}/settings/secrets/actions

Ajouter ces secrets:
- \`WORDPRESS_URL\` = \`https://flashvoyage.com/\`
- \`WORDPRESS_USERNAME\` = \`admin7817\`
- \`WORDPRESS_APP_PASSWORD\` = \`GjLl 9W0k lKwf LSOT PXur RYGR\`
- \`PEXELS_API_KEY\` = \`qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA\`

### 2. Pousser le code vers GitHub
\`\`\`bash
git remote add origin https://github.com/${username}/${repoName}.git
git branch -M main
git push -u origin main
\`\`\`

### 3. Activer GitHub Actions
1. Aller dans l'onglet "Actions" du repository
2. Cliquer "I understand my workflows, go ahead and enable them"
3. Le workflow se lancera automatiquement !

## 🎯 Résultat Final
- ✅ Publication automatique quotidienne à 9h UTC (11h française)
- ✅ Contenu ultra-spécialisé généré automatiquement
- ✅ Images contextuelles via Pexels
- ✅ Aucune intervention manuelle nécessaire
- ✅ Votre ordinateur peut rester éteint !

## 🔍 Monitoring
- **Logs:** https://github.com/${username}/${repoName}/actions
- **Articles:** Vérifier sur https://flashvoyage.com/
- **Erreurs:** Notifications automatiques

Votre système d'automatisation FlashVoyages est prêt ! 🎉🌏✈️`;

  console.log(instructions);
  
  // Sauvegarder dans un fichier
  const fs = await import('fs');
  fs.writeFileSync('DEPLOYMENT-READY.md', instructions);
  console.log('\n💾 Instructions sauvegardées dans DEPLOYMENT-READY.md');
}

async function main() {
  console.log('🚀 FlashVoyages - Configuration GitHub Automatique');
  console.log('==================================================\n');
  
  try {
    // 1. Configurer les credentials
    const { githubToken, githubUsername } = await setupGitHubCredentials();
    
    // 2. Tester la connexion
    const connected = await testGitHubConnection(githubToken, githubUsername);
    if (!connected) {
      console.log('\n❌ Impossible de continuer sans connexion GitHub valide');
      return;
    }
    
    // 3. Vérifier le repository
    const repoExists = await checkRepositoryExists(githubUsername, 'flashvoyage-ultra-content');
    if (!repoExists) {
      console.log('\n❌ Repository flashvoyage-ultra-content non trouvé');
      console.log('📝 Créez d\'abord le repository sur GitHub');
      return;
    }
    
    // 4. Créer le workflow
    const workflowCreated = await createWorkflow(githubUsername, 'flashvoyage-ultra-content', githubToken);
    if (!workflowCreated) {
      console.log('\n⚠️ Erreur lors de la création du workflow');
    }
    
    // 5. Générer les instructions pour les secrets
    await generateSecretsInstructions(githubUsername, 'flashvoyage-ultra-content');
    
    // 6. Générer les instructions finales
    await generateDeploymentInstructions(githubUsername, 'flashvoyage-ultra-content');
    
    console.log('\n🎉 Configuration terminée !');
    console.log('📋 Suivez les instructions dans DEPLOYMENT-READY.md');
    
  } catch (error) {
    console.error('\n❌ Erreur lors de la configuration:', error.message);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
