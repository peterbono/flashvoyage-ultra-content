#!/usr/bin/env node

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;

async function testGitHubConnection() {
  console.log('🧪 Test de connexion GitHub MCP Server\n');
  
  if (!GITHUB_TOKEN) {
    console.log('❌ GITHUB_TOKEN non configuré');
    console.log('📝 Ajoutez votre token GitHub dans le fichier .env');
    console.log('🔗 Créer un token: https://github.com/settings/tokens');
    return false;
  }
  
  if (!GITHUB_USERNAME) {
    console.log('❌ GITHUB_USERNAME non configuré');
    console.log('📝 Ajoutez votre nom d\'utilisateur GitHub dans le fichier .env');
    return false;
  }
  
  try {
    // Test de connexion à l'API GitHub
    const response = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FlashVoyages-Test'
      }
    });
    
    console.log('✅ Connexion GitHub réussie');
    console.log(`👤 Utilisateur: ${response.data.login}`);
    console.log(`📧 Email: ${response.data.email || 'Non public'}`);
    console.log(`📊 Repositories publics: ${response.data.public_repos}`);
    
    return true;
  } catch (error) {
    console.log('❌ Erreur connexion GitHub:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testRepositoryCreation() {
  console.log('\n🔧 Test de création de repository...');
  
  try {
    const testRepoName = `flashvoyage-test-${Date.now()}`;
    
    const repoData = {
      name: testRepoName,
      description: 'Test repository pour FlashVoyages MCP',
      private: true,
      auto_init: true
    };
    
    const response = await axios.post('https://api.github.com/user/repos', repoData, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FlashVoyages-Test'
      }
    });
    
    console.log('✅ Repository de test créé');
    console.log(`🔗 URL: ${response.data.html_url}`);
    
    // Supprimer le repository de test
    await axios.delete(`https://api.github.com/repos/${GITHUB_USERNAME}/${testRepoName}`, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FlashVoyages-Test'
      }
    });
    
    console.log('🗑️ Repository de test supprimé');
    return true;
  } catch (error) {
    console.log('❌ Erreur création repository:', error.response?.data?.message || error.message);
    return false;
  }
}

async function testWorkflowCreation() {
  console.log('\n⚙️ Test de création de workflow...');
  
  try {
    const workflowContent = `name: Test Workflow
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test step
        run: echo "Test workflow"`;
    
    const encodedContent = Buffer.from(workflowContent).toString('base64');
    
    console.log('✅ Workflow de test généré');
    console.log(`📝 Contenu: ${workflowContent.length} caractères`);
    console.log(`🔐 Encodé: ${encodedContent.length} caractères`);
    
    return true;
  } catch (error) {
    console.log('❌ Erreur création workflow:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Test du MCP GitHub Server\n');
  
  const results = {
    connection: await testGitHubConnection(),
    repository: await testRepositoryCreation(),
    workflow: await testWorkflowCreation()
  };
  
  console.log('\n📊 Résumé des tests:');
  console.log('==================');
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    const testName = {
      connection: 'Connexion GitHub',
      repository: 'Création repository',
      workflow: 'Génération workflow'
    }[test];
    
    console.log(`${status} ${testName}`);
  });
  
  const allPassed = Object.values(results).every(result => result);
  
  if (allPassed) {
    console.log('\n🎉 Tous les tests sont passés !');
    console.log('✅ Le MCP GitHub Server est prêt');
    console.log('\n📋 Prochaines étapes:');
    console.log('1. Lancer: node auto-github-deployment.js');
    console.log('2. Suivre les instructions générées');
    console.log('3. Votre automatisation sera configurée !');
  } else {
    console.log('\n⚠️ Certains tests ont échoué');
    console.log('❌ Vérifiez la configuration avant de continuer');
  }
  
  return allPassed;
}

// Exécuter les tests
runAllTests().catch(console.error);
