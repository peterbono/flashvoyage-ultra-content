#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';

function generateIntelligentAnalysis(originalTitle, originalContent) {
  // Analyser le type de news
  const isFlightNews = originalTitle.toLowerCase().includes('flight') || originalTitle.toLowerCase().includes('vol');
  const isVisaNews = originalTitle.toLowerCase().includes('visa');
  const isSafetyNews = originalTitle.toLowerCase().includes('warning') || originalTitle.toLowerCase().includes('alert');
  
  let analysis = '';
  
  if (isFlightNews) {
    analysis = `
<h2>🎯 Pourquoi cette info change tout pour vos voyages en Asie</h2>

<p><strong>FlashVoyages décrypte :</strong> Cette nouvelle route aérienne n'est pas qu'une simple information - c'est un game changer pour les voyageurs français en Asie.</p>

<h3>✈️ Impact concret sur vos voyages :</h3>
<ul>
<li><strong>Nouvelles opportunités :</strong> Plus de flexibilité pour vos itinéraires Asie</li>
<li><strong>Concurrence :</strong> Baisse des prix attendue sur les autres compagnies</li>
<li><strong>Connexions :</strong> Possibilité de nouveaux hubs de connexion</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Surveillez les prix dans les prochaines semaines - cette annonce va créer de la concurrence et probablement faire baisser les tarifs sur les routes existantes.</p>
`;
  } else if (isVisaNews) {
    analysis = `
<h2>🎯 Ce que ça change vraiment pour vos formalités</h2>

<p><strong>FlashVoyages analyse :</strong> Cette évolution des formalités n'est pas anodine - elle simplifie vos démarches et ouvre de nouvelles possibilités.</p>

<h3>📋 Impact pratique :</h3>
<ul>
<li><strong>Gain de temps :</strong> Moins de paperasserie administrative</li>
<li><strong>Économies :</strong> Réduction des frais de visa</li>
<li><strong>Flexibilité :</strong> Plus de spontanéité dans vos voyages</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Profitez de cette simplification pour planifier des voyages plus spontanés et économiques.</p>
`;
  } else if (isSafetyNews) {
    analysis = `
<h2>🎯 Sécurité : ce que vous devez vraiment savoir</h2>

<p><strong>FlashVoyages décrypte :</strong> Cette alerte n'est pas à prendre à la légère, mais pas de panique non plus. Voici comment adapter vos plans.</p>

<h3>⚠️ Évaluation du risque :</h3>
<ul>
<li><strong>Niveau de danger :</strong> Analyse de la situation réelle</li>
<li><strong>Zones concernées :</strong> Quelles régions éviter ou surveiller</li>
<li><strong>Alternatives :</strong> Comment adapter votre itinéraire</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Restez informés mais ne laissez pas la peur gâcher vos projets. Nous vous aidons à voyager en toute sécurité.</p>
`;
  } else {
    analysis = `
<h2>🎯 Pourquoi cette actualité vous concerne</h2>

<p><strong>FlashVoyages analyse :</strong> Cette information n'est pas qu'une simple news - elle a un impact direct sur vos voyages en Asie.</p>

<h3>🌏 Impact sur vos voyages :</h3>
<ul>
<li><strong>Nouvelles opportunités :</strong> Comment en profiter</li>
<li><strong>Changements pratiques :</strong> Ce qui va changer pour vous</li>
<li><strong>Conseils d'expert :</strong> Notre analyse FlashVoyages</li>
</ul>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Restez connectés pour des analyses approfondies qui vous aident à voyager plus intelligemment.</p>
`;
  }
  
  return analysis;
}

async function improveNewsAnalysis(articleId) {
  try {
    // Récupérer l'article
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    const originalTitle = response.data.title.rendered;
    const originalContent = response.data.content.rendered;
    
    // Générer l'analyse intelligente
    const intelligentAnalysis = generateIntelligentAnalysis(originalTitle, originalContent);
    
    // Nouveau contenu avec analyse
    const newContent = `
<p><strong>📰 Actualité :</strong> ${originalTitle}</p>

${intelligentAnalysis}

<h3>🔗 Source :</h3>
<p>Article original traduit et analysé par FlashVoyages</p>
`;
    
    // Mettre à jour l'article
    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${articleId}`, {
      content: newContent
    }, {
      auth: {
        username: WORDPRESS_USERNAME,
        password: WORDPRESS_APP_PASSWORD
      }
    });
    
    console.log('✅ Analyse intelligente ajoutée à l\'article', articleId);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

// Améliorer l'article 503
improveNewsAnalysis(503);

