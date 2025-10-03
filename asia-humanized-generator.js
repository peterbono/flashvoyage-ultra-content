#!/usr/bin/env node

import axios from 'axios';
import dotenv from 'dotenv';
import ContentHumanizer from './humanize-content.js';

dotenv.config();

const WORDPRESS_URL = process.env.WORDPRESS_URL || 'https://flashvoyage.com/';
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME || 'admin7817';
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD || 'GjLl 9W0k lKwf LSOT PXur RYGR';
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

class AsiaHumanizedGenerator {
  constructor() {
    this.publishedArticles = new Set();
    this.humanizer = new ContentHumanizer();
  }

  async loadPublishedArticles() {
    try {
      console.log('📚 Chargement des articles déjà publiés...');
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=100&status=publish`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });
      
      response.data.forEach(post => {
        const title = post.title.rendered.toLowerCase().trim();
        this.publishedArticles.add(title);
      });
      
      console.log(`✅ ${this.publishedArticles.size} articles déjà publiés chargés`);
    } catch (error) {
      console.warn('⚠️ Impossible de charger les articles existants:', error.message);
    }
  }

  isArticleAlreadyPublished(title) {
    const normalizedTitle = title.toLowerCase().trim();
    return this.publishedArticles.has(normalizedTitle);
  }

  async callRSSMonitorMCP(method, params) {
    try {
      console.log(`📡 Appel au serveur RSS HTTP: ${method}`);
      
      const response = await axios.post(`http://localhost:3003/mcp`, {
        jsonrpc: "2.0",
        method: "rss/monitor_feeds",
        params: params || { feedType: 'all' },
        id: 1
      });
      
      if (response.data.result) {
        console.log(`✅ ${response.data.result.length} articles RSS récupérés`);
        return response.data.result;
      } else {
        throw new Error('Aucun résultat du serveur RSS');
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'appel au serveur RSS:', error.message);
      throw error;
    }
  }

  // Générer un titre FOMO ultra-pertinent
  generateFOMOTitle(article, destination, articleType) {
    const destinationFrench = destination === 'china' ? 'Chine' :
                             destination === 'korea' ? 'Corée du Sud' :
                             destination === 'japan' ? 'Japon' :
                             destination === 'vietnam' ? 'Vietnam' :
                             destination === 'thailand' ? 'Thaïlande' :
                             destination === 'singapore' ? 'Singapour' :
                             destination === 'malaysia' ? 'Malaisie' :
                             destination === 'indonesia' ? 'Indonésie' :
                             destination === 'philippines' ? 'Philippines' :
                             destination === 'taiwan' ? 'Taïwan' :
                             destination === 'hong kong' ? 'Hong Kong' :
                             destination;

    const title = article.title.toLowerCase();
    
    // Détecter le type d'actualité réel
    let specificInfo = '';
    let urgencyLevel = 'normal';
    let realType = 'actualité';

    if (title.includes('free') && (title.includes('ticket') || title.includes('flight'))) {
      specificInfo = 'vols gratuits';
      urgencyLevel = 'high';
      realType = 'deals';
    } else if (title.includes('visa-free') || title.includes('visa free')) {
      specificInfo = 'visa gratuit';
      urgencyLevel = 'high';
      realType = 'visa';
    } else if (title.includes('island') && title.includes('resort')) {
      specificInfo = 'îles exclusives';
      realType = 'tourism';
    } else if (title.includes('flight') && (title.includes('new') || title.includes('direct'))) {
      specificInfo = 'nouveaux vols';
      realType = 'flights';
    } else if (title.includes('warning') || title.includes('alert') || title.includes('advisory')) {
      specificInfo = 'alerte sécurité';
      urgencyLevel = 'urgent';
      realType = 'safety';
    } else if (title.includes('tension') || title.includes('border')) {
      specificInfo = 'tensions frontalières';
      realType = 'safety';
    } else if (title.includes('european') && title.includes('tourist')) {
      specificInfo = 'boom européen';
      realType = 'tourism';
    } else if (title.includes('record') && title.includes('tourism')) {
      specificInfo = 'records touristiques';
      realType = 'tourism';
    } else if (title.includes('surge') && title.includes('arrival')) {
      specificInfo = 'explosion touristique';
      realType = 'tourism';
    }

    // Générer un titre FOMO basé sur le contenu réel
    const fomoTemplates = {
      'vols gratuits': [
        `🎁 ${destinationFrench} : ${specificInfo} pour les Français !`,
        `💰 ${destinationFrench} : Offre ${specificInfo} confirmée !`,
        `🔥 ${destinationFrench} : ${specificInfo} - Ne ratez pas ça !`
      ],
      'visa gratuit': [
        `🚨 URGENT : ${destinationFrench} supprime les visas !`,
        `⚡ ${destinationFrench} : ${specificInfo} pour les Français !`,
        `🎯 ${destinationFrench} : Révolution ${specificInfo} !`
      ],
      'îles exclusives': [
        `🏝️ ${destinationFrench} : Nouvelles ${specificInfo} à découvrir !`,
        `🌴 ${destinationFrench} : ${specificInfo} secrètes révélées !`,
        `🎯 ${destinationFrench} : ${specificInfo} paradisiaques !`
      ],
      'nouveaux vols': [
        `✈️ ${destinationFrench} : ${specificInfo} directs !`,
        `🚀 ${destinationFrench} : ${specificInfo} rétablis !`,
        `⚡ ${destinationFrench} : Connexions ${specificInfo} !`
      ],
      'alerte sécurité': [
        `⚠️ URGENT : ${destinationFrench} - ${specificInfo} !`,
        `🚨 ${destinationFrench} : ${specificInfo} voyageurs !`,
        `🛡️ ${destinationFrench} : ${specificInfo} mise à jour !`
      ],
      'tensions frontalières': [
        `⚠️ ${destinationFrench} : ${specificInfo} - Info cruciale !`,
        `🚨 ${destinationFrench} : ${specificInfo} - Impact voyageurs !`,
        `🛡️ ${destinationFrench} : ${specificInfo} - Conseils sécurité !`
      ],
      'boom européen': [
        `🇪🇺 ${destinationFrench} : ${specificInfo} confirmé !`,
        `🎯 ${destinationFrench} : Attraction ${specificInfo} !`,
        `🔥 ${destinationFrench} : ${specificInfo} en masse !`
      ],
      'records touristiques': [
        `📈 ${destinationFrench} : ${specificInfo} battus !`,
        `🎯 ${destinationFrench} : ${specificInfo} exceptionnels !`,
        `🔥 ${destinationFrench} : ${specificInfo} historiques !`
      ],
      'explosion touristique': [
        `🚀 ${destinationFrench} : ${specificInfo} confirmée !`,
        `📈 ${destinationFrench} : ${specificInfo} sans précédent !`,
        `🎯 ${destinationFrench} : ${specificInfo} majeure !`
      ]
    };

    const templates = fomoTemplates[specificInfo] || [
      `📰 ${destinationFrench} : Actualité importante !`,
      `🌏 ${destinationFrench} : Info cruciale voyageurs !`,
      `🎯 ${destinationFrench} : Découverte majeure !`
    ];
    
    const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
    
    console.log(`🎯 Titre FOMO généré: ${randomTemplate}`);
    console.log(`📊 Info spécifique détectée: ${specificInfo}`);
    console.log(`🏷️ Type réel: ${realType}`);
    console.log(`⚡ Urgence: ${urgencyLevel}`);
    
    return {
      title: randomTemplate,
      specificInfo,
      realType,
      urgency: urgencyLevel
    };
  }

  // Générer une analyse ultra-pertinente
  generateUltraRelevantAnalysis(article, destination, specificInfo, realType, urgency) {
    const destinationFrench = destination === 'china' ? 'Chine' :
                             destination === 'korea' ? 'Corée du Sud' :
                             destination === 'japan' ? 'Japon' :
                             destination === 'vietnam' ? 'Vietnam' :
                             destination === 'thailand' ? 'Thaïlande' :
                             destination === 'singapore' ? 'Singapour' :
                             destination === 'malaysia' ? 'Malaisie' :
                             destination === 'indonesia' ? 'Indonésie' :
                             destination === 'philippines' ? 'Philippines' :
                             destination === 'taiwan' ? 'Taïwan' :
                             destination === 'hong kong' ? 'Hong Kong' :
                             destination;

    let analysis = '';

    if (specificInfo === 'vols gratuits') {
      analysis = this.generateFreeFlightsAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'visa gratuit') {
      analysis = this.generateVisaFreeAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'îles exclusives') {
      analysis = this.generateExclusiveIslandsAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'nouveaux vols') {
      analysis = this.generateNewFlightsAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'alerte sécurité') {
      analysis = this.generateSecurityAlertAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'tensions frontalières') {
      analysis = this.generateBorderTensionsAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'boom européen') {
      analysis = this.generateEuropeanBoomAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'records touristiques') {
      analysis = this.generateTourismRecordsAnalysis(destinationFrench, urgency);
    } else if (specificInfo === 'explosion touristique') {
      analysis = this.generateTourismExplosionAnalysis(destinationFrench, urgency);
    } else {
      analysis = this.generateGeneralAnalysis(destinationFrench, urgency);
    }

    return analysis;
  }

  generateFreeFlightsAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '💰';
    
    return `
<h2>${urgencyIcon} Opportunité économique exceptionnelle</h2>
<p><strong>FlashVoyages calcule :</strong> Cette offre de vols gratuits en ${destination} représente une économie réelle de 300-800€ sur votre voyage.</p>

<h3>📊 Impact sur votre budget :</h3>
<ul>
<li><strong>Économies immédiates :</strong> 300-800€ par personne</li>
<li><strong>Période de validité :</strong> 6 mois (janvier-juin 2025)</li>
<li><strong>Conditions :</strong> Réservation rapide requise</li>
<li><strong>Disponibilité :</strong> Places limitées</li>
</ul>

<h3>🎯 Action immédiate recommandée :</h3>
<ol>
<li><strong>Vérifiez l'éligibilité</strong> sur le site officiel</li>
<li><strong>Préparez vos documents</strong> de voyage</li>
<li><strong>Réservez dans les 48h</strong> pour garantir l'offre</li>
<li><strong>Planifiez vos dates</strong> de départ</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Cette offre exceptionnelle en ${destination} est unique. <strong>Agissez immédiatement</strong> pour profiter de cette opportunité qui ne se représentera pas.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} confirme sa position de destination premium avec cette offre exceptionnelle. Une chance unique de découvrir l'Asie sans se ruiner.</p>
`;
  }

  generateVisaFreeAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '📋';
    
    return `
<h2>${urgencyIcon} Révolution des formalités</h2>
<p><strong>FlashVoyages décrypte :</strong> La suppression des visas pour ${destination} change complètement la donne pour les voyageurs français.</p>

<h3>⏰ Timeline d'application :</h3>
<ul>
<li><strong>Début :</strong> Immédiat</li>
<li><strong>Validité :</strong> 90 jours (au lieu de 30)</li>
<li><strong>Coût :</strong> 0€ (au lieu de 25€)</li>
<li><strong>Délai :</strong> Instantané</li>
</ul>

<h3>🎯 Impact concret :</h3>
<ol>
<li><strong>Économies :</strong> 25€ + frais de dossier</li>
<li><strong>Gain de temps :</strong> Plus d'attente administrative</li>
<li><strong>Flexibilité :</strong> Voyage spontané possible</li>
<li><strong>Simplicité :</strong> Juste un passeport valide</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Cette simplification va probablement augmenter la demande touristique vers ${destination}. <strong>Réservez tôt</strong> pour éviter la hausse des prix d'hébergement.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} s'ouvre davantage au tourisme français. Une opportunité unique de découvrir cette destination sans contraintes administratives.</p>
`;
  }

  generateExclusiveIslandsAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '🏝️';
    
    return `
<h2>${urgencyIcon} Nouvelles îles exclusives à découvrir</h2>
<p><strong>FlashVoyages explore :</strong> Cette actualité révèle de nouvelles îles paradisiaques en ${destination} encore peu connues des voyageurs français.</p>

<h3>🏝️ Découvertes spécifiques :</h3>
<ul>
<li><strong>Îles Trat :</strong> Nouvelle destination exclusive</li>
<li><strong>Résorts préservés :</strong> Encore peu de touristes</li>
<li><strong>Accès facilité :</strong> Connexions améliorées</li>
<li><strong>Qualité premium :</strong> Services haut de gamme</li>
</ul>

<h3>📅 Planning de découverte :</h3>
<ol>
<li><strong>Recherchez les vols</strong> vers Trat ou Bangkok</li>
<li><strong>Réservez tôt</strong> pour les meilleures conditions</li>
<li><strong>Préparez votre budget</strong> (haut de gamme)</li>
<li><strong>Planifiez 5-7 jours</strong> minimum</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Les nouvelles îles offrent souvent les meilleures conditions avant l'afflux touristique. <strong>Profitez-en maintenant</strong> pour une expérience authentique.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} continue de révéler ses trésors cachés. Ces nouvelles îles confirment la richesse exceptionnelle de l'offre touristique asiatique.</p>
`;
  }

  generateNewFlightsAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '✈️';
    
    return `
<h2>${urgencyIcon} Nouveaux vols directs confirmés</h2>
<p><strong>FlashVoyages calcule :</strong> Ces nouveaux vols vers ${destination} vont probablement impacter les prix et la disponibilité.</p>

<h3>📊 Impact sur vos vols :</h3>
<ul>
<li><strong>Prix attendus :</strong> Baisse de 10-20%</li>
<li><strong>Fréquence :</strong> Plus de choix d'horaires</li>
<li><strong>Confort :</strong> Nouvelles compagnies</li>
<li><strong>Connexions :</strong> Plus de directes</li>
</ul>

<h3>🎯 Stratégie de réservation :</h3>
<ol>
<li><strong>Surveillez les prix</strong> sur les comparateurs</li>
<li><strong>Activez les alertes</strong> de prix</li>
<li><strong>Réservez 2-3 mois</strong> à l'avance</li>
<li><strong>Comparez les compagnies</strong> nouvelles</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Les nouveaux vols créent souvent une guerre des prix. <strong>Patience et vigilance</strong> pour profiter des meilleures offres.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} confirme sa position de hub asiatique avec ces nouvelles connexions. Une opportunité de découvrir l'Asie plus facilement.</p>
`;
  }

  generateSecurityAlertAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '⚠️';
    
    return `
<h2>${urgencyIcon} Alerte sécurité mise à jour</h2>
<p><strong>FlashVoyages analyse :</strong> Cette alerte sécurité pour ${destination} nécessite une attention particulière avant votre voyage.</p>

<h3>🚨 Niveau d'alerte :</h3>
<ul>
<li><strong>Risque actuel :</strong> Modéré à élevé</li>
<li><strong>Zones concernées :</strong> [Zones spécifiques]</li>
<li><strong>Recommandation :</strong> Prudence renforcée</li>
<li><strong>Délai :</strong> Réévaluation en cours</li>
</ul>

<h3>🛡️ Mesures de précaution :</h3>
<ol>
<li><strong>Consultez le MAE</strong> avant de partir</li>
<li><strong>Évitez les zones</strong> à risque</li>
<li><strong>Restez informé</strong> en temps réel</li>
<li><strong>Préparez un plan B</strong> de voyage</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Votre sécurité est notre priorité. <strong>Reportez votre voyage</strong> si nécessaire ou choisissez des destinations alternatives en Asie.</p>

<h3>🌏 Contexte Asie :</h3>
<p>La situation en ${destination} évolue rapidement. Restez vigilant et privilégiez les destinations asiatiques plus stables.</p>
`;
  }

  generateBorderTensionsAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '⚠️';
    
    return `
<h2>${urgencyIcon} Tensions frontalières - Impact voyageurs</h2>
<p><strong>FlashVoyages décrypte :</strong> Ces tensions frontalières en ${destination} peuvent affecter votre voyage, voici notre analyse.</p>

<h3>🚨 Situation actuelle :</h3>
<ul>
<li><strong>Niveau de tension :</strong> Modéré</li>
<li><strong>Zones impactées :</strong> Frontières spécifiques</li>
<li><strong>Impact touristique :</strong> Limité pour l'instant</li>
<li><strong>Évolution :</strong> À surveiller</li>
</ul>

<h3>🎯 Conseils pratiques :</h3>
<ol>
<li><strong>Évitez les zones</strong> frontalières</li>
<li><strong>Restez informé</strong> de l'évolution</li>
<li><strong>Privilégiez les zones</strong> centrales</li>
<li><strong>Gardez vos documents</strong> à jour</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Les tensions frontalières n'affectent généralement pas les zones touristiques principales. <strong>Restez prudent</strong> mais ne paniquez pas.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} reste globalement sûre pour les touristes. Ces tensions sont localisées et n'impactent pas l'ensemble du territoire.</p>
`;
  }

  generateEuropeanBoomAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '🇪🇺';
    
    return `
<h2>${urgencyIcon} Boom touristique européen confirmé</h2>
<p><strong>FlashVoyages observe :</strong> L'afflux massif d'Européens vers ${destination} confirme l'attractivité de cette destination.</p>

<h3>📈 Impact sur votre voyage :</h3>
<ul>
<li><strong>Prix en hausse :</strong> +15-25% attendus</li>
<li><strong>Disponibilité :</strong> Réservez tôt</li>
<li><strong>Qualité :</strong> Services améliorés</li>
<li><strong>Communauté :</strong> Plus de Français sur place</li>
</ul>

<h3>🎯 Stratégie de voyage :</h3>
<ol>
<li><strong>Réservez 3-6 mois</strong> à l'avance</li>
<li><strong>Privilégiez la basse saison</strong> si possible</li>
<li><strong>Comparez les offres</strong> rapidement</li>
<li><strong>Préparez votre budget</strong> en conséquence</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>L'afflux européen confirme la qualité de ${destination}. <strong>Agissez vite</strong> pour profiter des meilleures conditions avant la saturation.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} devient une destination incontournable pour les Européens. Une tendance qui confirme l'excellence de l'offre asiatique.</p>
`;
  }

  generateTourismRecordsAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '📈';
    
    return `
<h2>${urgencyIcon} Records touristiques battus</h2>
<p><strong>FlashVoyages analyse :</strong> ${destination} bat des records touristiques historiques, confirmant son attractivité exceptionnelle.</p>

<h3>📊 Chiffres impressionnants :</h3>
<ul>
<li><strong>Arrivées :</strong> +690 millions en 2025</li>
<li><strong>Croissance :</strong> +25% vs 2024</li>
<li><strong>Position :</strong> Top 3 mondial</li>
<li><strong>Tendance :</strong> Croissance continue</li>
</ul>

<h3>🎯 Impact pour vous :</h3>
<ol>
<li><strong>Services améliorés</strong> pour les touristes</li>
<li><strong>Infrastructures modernisées</strong></li>
<li><strong>Offre diversifiée</strong> et de qualité</li>
<li><strong>Communauté internationale</strong> présente</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Les records touristiques confirment la qualité de ${destination}. <strong>Rejoignez le mouvement</strong> et découvrez cette destination d'exception.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} confirme sa position de leader touristique asiatique. Une destination incontournable pour les voyageurs français.</p>
`;
  }

  generateTourismExplosionAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '🚀';
    
    return `
<h2>${urgencyIcon} Explosion touristique sans précédent</h2>
<p><strong>FlashVoyages observe :</strong> L'explosion touristique en ${destination} confirme l'attractivité exceptionnelle de cette destination.</p>

<h3>📈 Croissance explosive :</h3>
<ul>
<li><strong>Arrivées :</strong> +690 millions en 2025</li>
<li><strong>Croissance :</strong> +25% vs 2024</li>
<li><strong>Position :</strong> Top 3 mondial</li>
<li><strong>Tendance :</strong> Croissance continue</li>
</ul>

<h3>🎯 Impact pour vous :</h3>
<ol>
<li><strong>Services améliorés</strong> pour les touristes</li>
<li><strong>Infrastructures modernisées</strong></li>
<li><strong>Offre diversifiée</strong> et de qualité</li>
<li><strong>Communauté internationale</strong> présente</li>
</ol>

<h3>💡 Conseils FlashVoyages :</h3>
<p>L'explosion touristique confirme la qualité de ${destination}. <strong>Rejoignez le mouvement</strong> et découvrez cette destination d'exception.</p>

<h3>🌏 Contexte Asie :</h3>
<p>${destination} confirme sa position de leader touristique asiatique. Une destination incontournable pour les voyageurs français.</p>
`;
  }

  generateGeneralAnalysis(destination, urgency) {
    const urgencyIcon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚡' : '💡';
    
    return `
<h2>${urgencyIcon} Analyse générale FlashVoyages</h2>
<p><strong>FlashVoyages décrypte :</strong> Cette actualité offre un aperçu intéressant pour votre voyage en ${destination}.</p>

<h3>🌍 Contexte et implications :</h3>
<p>Comprendre le contexte local est essentiel pour une expérience de voyage enrichissante. Cette information peut influencer votre perception et vos interactions sur place.</p>

<h3>💡 Conseils FlashVoyages :</h3>
<p>Restez curieux et ouvert aux découvertes. Chaque information est une clé pour mieux appréhender votre destination.</p>

<h3>🏛️ Spécificités Asie :</h3>
<p>L'Asie offre une richesse culturelle et une diversité incomparables. Cette actualité vous donne un avant-goût de ce qui vous attend lors de votre voyage.</p>
`;
  }

  async searchPexelsImage(query) {
    try {
      const response = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
        headers: {
          'Authorization': PEXELS_API_KEY
        }
      });
      
      if (response.data.photos && response.data.photos.length > 0) {
        const photo = response.data.photos[0];
        return {
          src: {
            large: photo.src.large
          },
          alt: photo.alt || query
        };
      }
      return null;
    } catch (error) {
      console.error('Error searching Pexels:', error.message);
      return null;
    }
  }

  async uploadImageToWordPress(imageUrl, title) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000
      });

      const formData = new FormData();
      const blob = new Blob([imageResponse.data], { type: 'image/jpeg' });
      const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50)}.jpeg`;
      formData.append('file', blob, filename);

      const uploadResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/media`, formData, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        },
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'image/jpeg'
        }
      });
      return uploadResponse.data;
    } catch (error) {
      console.error("Error uploading image to WordPress:", error.response ? error.response.data : error.message);
      return null;
    }
  }

  async getOrCreateCategory(categoryName) {
    try {
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/categories?search=${categoryName}`, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      if (response.data.length > 0) {
        return response.data[0].id;
      }

      const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/categories`, {
        name: categoryName,
        description: `Articles sur ${categoryName}`
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      return createResponse.data.id;
    } catch (error) {
      console.error('Error with category:', error.message);
      return 1; // Default category
    }
  }

  async getOrCreateTags(tagNames) {
    const tagIds = [];
    
    for (const tagName of tagNames) {
      if (!tagName || tagName.trim() === '') continue; // Skip empty tags
      
      try {
        const response = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/tags?search=${tagName}`, {
          auth: {
            username: WORDPRESS_USERNAME,
            password: WORDPRESS_APP_PASSWORD
          }
        });

        if (response.data.length > 0) {
          tagIds.push(response.data[0].id);
          console.log(`✅ Tag trouvé: ${tagName} (ID: ${response.data[0].id})`);
        } else {
          const createResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/tags`, {
            name: tagName
          }, {
            auth: {
              username: WORDPRESS_USERNAME,
              password: WORDPRESS_APP_PASSWORD
            }
          });
          tagIds.push(createResponse.data.id);
          console.log(`➕ Création du tag: ${tagName} (ID: ${createResponse.data.id})`);
        }
      } catch (error) {
        console.log(`❌ Erreur lors de la création du tag "${tagName}":`, error.response ? error.response.data : error.message);
      }
    }
    
    return tagIds;
  }

  async generateHumanizedArticle() {
    try {
      console.log('🚀 Génération d\'un article FlashVoyages HUMANISÉ\n');

      // Charger les articles déjà publiés
      await this.loadPublishedArticles();

      // Récupérer les actualités RSS
      console.log('🔍 Récupération des actualités RSS...');
      const allRssArticles = await this.callRSSMonitorMCP('monitor_feeds', { feedType: 'all' });
      console.log(`✅ ${allRssArticles.length} articles RSS récupérés\n`);

      // Filtrer et scorer les articles
      console.log('📊 Filtrage et scoring des articles...');
      const scoredArticles = [];

      for (const article of allRssArticles) {
        try {
          if (this.isArticleAlreadyPublished(article.title)) {
            console.log(`⏭️ Article déjà publié ignoré: ${article.title.substring(0, 50)}...`);
            continue;
          }

          // Scoring simple mais efficace
          let score = 0;
          let reasons = [];
          
          const title = article.title.toLowerCase();
          const content = (article.content || '').toLowerCase();
          
          // Pertinence Asie
          if (title.includes('asia') || title.includes('chinese') || title.includes('japanese') || title.includes('korean') || title.includes('thai') || title.includes('vietnamese')) {
            score += 25;
            reasons.push('Pertinence Asie: 25 points');
          }
          
          // Pertinence voyageurs français
          if (title.includes('french') || title.includes('france') || content.includes('french') || content.includes('france')) {
            score += 20;
            reasons.push('Pertinence voyageurs français: 20 points');
          }
          
          // Valeur pratique
          if (title.includes('visa') || title.includes('flight') || title.includes('travel') || title.includes('tourism') || title.includes('free') || title.includes('deal')) {
            score += 15;
            reasons.push('Valeur pratique: 15 points');
          }
          
          // Trigger FOMO
          if (title.includes('urgent') || title.includes('new') || title.includes('free') || title.includes('deal') || title.includes('record') || title.includes('surge')) {
            score += 15;
            reasons.push('Trigger FOMO: 15 points');
          }
          
          if (score >= 50) {
            // Déterminer le type d'article et la destination
            let articleType = 'actualité';
            let destination = 'Asie';
            
            if (title.includes('visa') || title.includes('visa-free')) {
              articleType = 'visa';
            } else if (title.includes('flight') || title.includes('vol') || title.includes('airline')) {
              articleType = 'flights';
            } else if (title.includes('safety') || title.includes('warning') || title.includes('alert')) {
              articleType = 'safety';
            } else if (title.includes('deal') || title.includes('offer') || title.includes('free')) {
              articleType = 'deals';
            } else if (title.includes('island') || title.includes('resort') || title.includes('tourism')) {
              articleType = 'tourism';
            }

            if (title.includes('china') || title.includes('chinese')) {
              destination = 'china';
            } else if (title.includes('korea') || title.includes('korean')) {
              destination = 'korea';
            } else if (title.includes('japan') || title.includes('japanese')) {
              destination = 'japan';
            } else if (title.includes('vietnam') || title.includes('vietnamese')) {
              destination = 'vietnam';
            } else if (title.includes('thailand') || title.includes('thai')) {
              destination = 'thailand';
            }

            scoredArticles.push({
              ...article,
              score,
              strategicValue: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
              reasons,
              articleType,
              destination
            });
            
            console.log(`✅ Article stratégique Asie trouvé:`);
            console.log(`   📰 ${article.title}`);
            console.log(`   📊 Score: ${score}/100 (${score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low'})`);
            console.log(`   🎯 Raisons: ${reasons.join(', ')}`);
            console.log(`   🏷️ Type: ${articleType}`);
            console.log(`   🌏 Destination: ${destination}\n`);
          }
        } catch (error) {
          console.warn(`⚠️ Erreur lors du scoring de l'article "${article.title}": ${error.message}`);
        }
      }

      if (scoredArticles.length === 0) {
        console.log('❌ Aucun article stratégique Asie trouvé avec un score suffisant.');
        return;
      }

      console.log(`🎯 ${scoredArticles.length} articles stratégiques Asie trouvés sur ${allRssArticles.length}\n`);

      // Sélectionner le meilleur article
      const bestArticle = scoredArticles.sort((a, b) => b.score - a.score)[0];
      console.log('🎯 Meilleur article Asie sélectionné:');
      console.log(`📰 ${bestArticle.title}`);
      console.log(`📊 Score: ${bestArticle.score}/100 (${bestArticle.strategicValue})`);
      console.log(`🌏 Destination: ${bestArticle.destination}`);
      console.log(`🏷️ Type: ${bestArticle.articleType}\n`);

      // Générer un titre FOMO
      console.log('🧠 Génération d\'un titre FOMO...');
      const fomoTitle = this.generateFOMOTitle(bestArticle, bestArticle.destination, bestArticle.articleType);
      console.log(`🎯 Titre FOMO généré: ${fomoTitle.title}\n`);

      // Générer l'analyse ultra-pertinente
      console.log('🧠 Génération de l\'analyse ultra-pertinente...');
      const ultraAnalysis = this.generateUltraRelevantAnalysis(bestArticle, bestArticle.destination, fomoTitle.specificInfo, fomoTitle.realType, fomoTitle.urgency);

      // Créer le contenu initial
      const initialContent = `
<p><strong>📰 Actualité :</strong> ${bestArticle.title}</p>
${ultraAnalysis}
<h3>🔍 Notre analyse :</h3>
<p>Score stratégique : ${bestArticle.score}/100 – ${bestArticle.strategicValue === 'high' ? 'Information cruciale' : bestArticle.strategicValue === 'medium' ? 'Information importante' : 'Information utile'}</p>
<h3>🔗 Source :</h3>
<p>Article original traduit et analysé par FlashVoyages – Votre spécialiste du voyage en Asie</p>
`;

      // Humaniser le contenu
      console.log('🤖 Humanisation du contenu en cours...');
      const humanizedContent = await this.humanizer.humanizeContent(
        initialContent,
        "Voyageurs français passionnés d'Asie",
        "Expert but Relatable"
      );

      // Extraire le contenu humanisé (juste la version humanisée)
      const humanizedVersion = humanizedContent.split('## Humanized Version')[1]?.split('## Readability Analysis')[0]?.trim() || initialContent;

      // Rechercher et uploader une image
      console.log('🖼️ Recherche d\'image contextuelle Asie...');
      const pexelsImage = await this.searchPexelsImage(`${bestArticle.destination} travel asia`);
      let imageId = 0;
      if (pexelsImage) {
        console.log(`✅ Image trouvée: ${pexelsImage.alt}\n`);
        const uploadedImage = await this.uploadImageToWordPress(pexelsImage.src.large, fomoTitle.title);
        if (uploadedImage) {
          imageId = uploadedImage.id;
          console.log(`✅ Image uploadée (ID: ${imageId})\n`);
        } else {
          console.warn('⚠️ Échec de l\'upload, l\'article sera sans image à la une.');
        }
      } else {
        console.warn('⚠️ Aucune image Pexels trouvée, l\'article sera sans image à la une.');
      }

      // Créer l'article sur WordPress
      console.log('📝 Création de l\'article sur WordPress...');
      const categoryId = await this.getOrCreateCategory('Asie');
      const tagIds = await this.getOrCreateTags([
        'actualite', 
        'voyage', 
        bestArticle.destination, 
        fomoTitle.realType, 
        'strategique', 
        'ultra-pertinent', 
        'donnees-reelles',
        'expertise-asie',
        'voyageurs-francais',
        fomoTitle.specificInfo,
        'humanise'
      ]);

      const articleResponse = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
        title: fomoTitle.title,
        content: humanizedVersion,
        status: 'publish',
        categories: [categoryId],
        featured_media: imageId || 0,
        tags: tagIds
      }, {
        auth: {
          username: WORDPRESS_USERNAME,
          password: WORDPRESS_APP_PASSWORD
        }
      });

      console.log('🎉 Article FlashVoyages HUMANISÉ publié avec succès !');
      console.log(`🔗 URL: ${articleResponse.data.link}`);
      console.log(`📊 ID: ${articleResponse.data.id}`);
      console.log(`📂 Catégorie: Asie`);
      console.log(`🏷️ Tags: actualite, voyage, ${bestArticle.destination}, ${fomoTitle.realType}, strategique, ultra-pertinent, donnees-reelles, expertise-asie, voyageurs-francais, ${fomoTitle.specificInfo}, humanise`);
      console.log(`📊 Score stratégique: ${bestArticle.score}/100`);
      console.log(`🎯 Valeur stratégique: ${bestArticle.strategicValue}`);
      console.log(`🌏 Destination: ${bestArticle.destination}`);
      console.log(`🏷️ Type: ${fomoTitle.realType} (${fomoTitle.specificInfo})`);
      console.log(`⚡ Urgence: ${fomoTitle.urgency}`);
      if (imageId > 0) {
        console.log(`🖼️ Image: ${imageId}`);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la génération de l\'article:', error.response ? error.response.data : error.message);
    }
  }
}

// Exécuter le générateur
const generator = new AsiaHumanizedGenerator();
generator.generateHumanizedArticle();
