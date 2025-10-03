#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';

async function fixContentDetection() {
  try {
    console.log('🔧 Correction de la détection de contenu...');

    // Récupérer l'article problématique
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/549`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });

    const article = response.data;
    console.log(`📰 Article actuel: ${article.title.rendered}`);

    // Analyser le vrai contenu de l'actualité
    const originalTitle = "Global Travel Updates You Need To Know For October With New E-Arrival Cards In Asia, Biometric Borders In Europe, And Power Bank Restrictions In The Middle East";
    
    // Détecter le vrai type d'actualité
    let realType = 'actualité';
    let specificInfo = '';
    let urgencyLevel = 'normal';

    if (originalTitle.toLowerCase().includes('e-arrival cards')) {
      realType = 'formalités';
      specificInfo = 'cartes d\'arrivée électroniques';
      urgencyLevel = 'high';
    } else if (originalTitle.toLowerCase().includes('biometric borders')) {
      realType = 'formalités';
      specificInfo = 'frontières biométriques';
      urgencyLevel = 'high';
    } else if (originalTitle.toLowerCase().includes('power bank restrictions')) {
      realType = 'sécurité';
      specificInfo = 'restrictions batteries';
      urgencyLevel = 'high';
    }

    console.log(`🎯 Type réel détecté: ${realType}`);
    console.log(`📊 Info spécifique: ${specificInfo}`);
    console.log(`⚡ Urgence: ${urgencyLevel}`);

    // Générer un titre correct
    const correctTitle = `🚨 URGENT : ${specificInfo} en Asie - Nouveautés octobre 2024 !`;

    // Générer le contenu correct
    const correctContent = `
<p><strong>📰 Actualité :</strong> ${originalTitle} - Travel And Tour World</p>

<h2>🚨 ${specificInfo} - Impact voyageurs</h2>
<p><strong>FlashVoyages décrypte :</strong> Ces nouvelles mesures en Asie changent la donne pour les voyageurs français, voici notre analyse.</p>

<h3>📋 Nouvelles mesures en vigueur :</h3>
<ul>
<li><strong>Cartes d'arrivée électroniques :</strong> Obligatoires en Asie</li>
<li><strong>Frontières biométriques :</strong> Nouveaux contrôles en Europe</li>
<li><strong>Restrictions batteries :</strong> Nouvelles règles au Moyen-Orient</li>
<li><strong>Début d'application :</strong> Octobre 2024</li>
</ul>

<h3>🎯 Action immédiate recommandée :</h3>
<ol>
<li><strong>Vérifiez les nouvelles procédures</strong> avant votre départ</li>
<li><strong>Préparez vos documents</strong> électroniques</li>
<li><strong>Renseignez-vous sur les restrictions</strong> batteries</li>
<li><strong>Planifiez vos connexions</strong> en conséquence</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Ces nouvelles mesures ${specificInfo} en Asie sont importantes. <strong>Restez informé</strong> et préparez-vous en conséquence pour éviter les surprises.</p>

<h3>🌏 Contexte Asie :</h3>
<p>L'Asie modernise ses procédures d'entrée. Ces évolutions ${specificInfo} confirment la digitalisation du voyage en Asie.</p>

<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : 75/100 – Information cruciale</p>

<h3>🔗 Source :</h3>
<p>Article original traduit et analysé par FlashVoyages – Votre spécialiste du voyage en Asie</p>
`;

    // Mettre à jour l'article
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/549`, {
      title: correctTitle,
      content: correctContent
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });

    console.log('✅ Article corrigé avec succès !');
    console.log(`🔗 URL: ${article.link}`);
    console.log(`📊 Nouveau titre: ${correctTitle}`);
    console.log(`🎯 Type corrigé: ${realType} (${specificInfo})`);
    console.log(`⚡ Urgence: ${urgencyLevel}`);

  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error.response ? error.response.data : error.message);
  }
}

// Exécuter la correction
fixContentDetection();
