import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
// import basicAuth from 'basic-auth'; // Non utilisé pour l'instant

dotenv.config();

const app = express();
const PORT = process.env.MCP_ULTRA_CONTENT_PORT || 3006;
const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const PEXELS_API_KEY = 'qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA';

app.use(bodyParser.json());
app.use(cors());

// Base de données de conseils d'expats par destination
const EXPAT_INSIGHTS = {
  'tokyo': {
    'shibuya': [
      "Évitez le crossing aux heures de pointe (17h-19h), allez-y tôt le matin pour des photos parfaites",
      "Le Hachiko Exit est bondé, utilisez l'Exit 8 pour sortir plus facilement",
      "Le Starbucks du 2ème étage offre la meilleure vue sur le crossing",
      "Shibuya Sky : réservez 2 semaines à l'avance, coucher de soleil = 1h d'attente"
    ],
    'harajuku': [
      "Takeshita Street : évitez le weekend, allez-y en semaine vers 10h",
      "Le Meiji Jingu est gratuit et magnifique, allez-y tôt le matin",
      "Cat Street : meilleure rue shopping, moins touristique",
      "Kawaii Monster Cafe : réservation obligatoire, 1h de spectacle"
    ],
    'ginza': [
      "Ginza Six : toit gratuit avec vue sur Tokyo, ferme à 20h",
      "Tsukiji Outer Market : allez-y avant 9h, ferme à 14h",
      "Uniqlo Ginza : 12 étages, étage 11 = items exclusifs",
      "Ginza Bairin : meilleur tonkatsu de Tokyo, 1h d'attente normale"
    ]
  },
  'bangkok': {
    'sukhumvit': [
      "Terminal 21 : chaque étage = un pays, toit gratuit au 6ème",
      "Soi 11 : meilleure rue pour la vie nocturne, évitez Soi Cowboy",
      "BTS Asok : connexion directe à l'aéroport, évitez les heures de pointe",
      "Health Land : massage thaï authentique, 400 bahts pour 2h"
    ],
    'silom': [
      "Patpong Night Market : négociez à 50% du prix affiché",
      "Lumpini Park : gratuit, évitez 12h-14h (trop chaud)",
      "Silom Complex : food court au 4ème étage, prix locaux",
      "BTS Sala Daeng : connexion directe à l'aéroport"
    ],
    'chatuchak': [
      "Weekend Market : ouvre 6h-18h samedi-dimanche, allez-y tôt",
      "Section 2-4 : vêtements vintage, négociez à 30% du prix",
      "Section 26-27 : nourriture locale, évitez les stands touristiques",
      "Section 1 : souvenirs, prix fixes, pas de négociation"
    ]
  },
  'seoul': {
    'hongdae': [
      "Hongdae Shopping Street : ouvre 10h-22h, meilleur moment 14h-16h",
      "Trick Eye Museum : 15,000 won, réservez en ligne pour -20%",
      "Hongdae Playground : concerts gratuits le weekend",
      "Hongdae Station Exit 9 : meilleur accès, évitez Exit 2"
    ],
    'myeongdong': [
      "Myeongdong Shopping : négociez dans les boutiques, pas dans les chaînes",
      "Lotte Young Plaza : étage 8-9 = marques coréennes, prix corrects",
      "Myeongdong Cathedral : gratuit, magnifique architecture",
      "Myeongdong Night Market : 18h-22h, street food authentique"
    ],
    'gangnam': [
      "Gangnam Station : connexion directe à l'aéroport, évitez 8h-9h",
      "COEX Mall : aquarium au sous-sol, 22,000 won",
      "Bongeunsa Temple : gratuit, temple bouddhiste authentique",
      "Gangnam Style Statue : photo obligatoire, gratuit"
    ]
  }
};

// Templates de contenu ultra-spécialisé
const CONTENT_TEMPLATES = {
  'quartier_guide': {
    title: "{destination} : {quartier} comme un local - {nombre} spots secrets",
    structure: `
      <h2>🌏 {destination} Insider : {quartier}</h2>
      <p><strong>Conseil FlashVoyages :</strong> {conseil_principal}</p>
      
      <h3>📍 Spots secrets (que les touristes ne connaissent pas)</h3>
      {spots_secrets}
      
      <h3>⏰ Meilleur timing pour visiter</h3>
      <ul>
        <li><strong>Matin :</strong> {timing_matin}</li>
        <li><strong>Après-midi :</strong> {timing_apres_midi}</li>
        <li><strong>Soir :</strong> {timing_soir}</li>
      </ul>
      
      <h3>💰 Budget local vs touristique</h3>
      <ul>
        <li><strong>Nourriture locale :</strong> {prix_local}</li>
        <li><strong>Transport :</strong> {prix_transport}</li>
        <li><strong>Activités :</strong> {prix_activites}</li>
      </ul>
      
      <h3>🚨 Erreurs à éviter</h3>
      <ul>
        {erreurs_a_eviter}
      </ul>
      
      <h3>🎯 Itinéraire parfait 1 jour</h3>
      <ol>
        {itineraire_parfait}
      </ol>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>💡 Astuce FlashVoyages</h4>
        <p>{astuce_exclusive}</p>
      </div>
    `
  },
  
  'comparatif_pratique': {
    title: "{destination} : {sujet} - Comparatif complet {nombre} options testées",
    structure: `
      <h2>🔍 {destination} : {sujet} - Test complet</h2>
      <p><strong>FlashVoyages a testé {nombre} options pour vous :</strong></p>
      
      <h3>🏆 Top 3 des meilleures options</h3>
      {top_3_options}
      
      <h3>📊 Comparatif détaillé</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #f8f9fa;">
          <th style="border: 1px solid #ddd; padding: 10px;">Option</th>
          <th style="border: 1px solid #ddd; padding: 10px;">Prix</th>
          <th style="border: 1px solid #ddd; padding: 10px;">Qualité</th>
          <th style="border: 1px solid #ddd; padding: 10px;">Note</th>
        </tr>
        {tableau_comparatif}
      </table>
      
      <h3>💰 Analyse des prix</h3>
      <ul>
        <li><strong>Budget serré :</strong> {option_budget}</li>
        <li><strong>Rapport qualité/prix :</strong> {option_qualite_prix}</li>
        <li><strong>Luxe :</strong> {option_luxe}</li>
      </ul>
      
      <h3>🎯 Recommandation FlashVoyages</h3>
      <p><strong>Notre choix :</strong> {recommandation_principale}</p>
      <p><strong>Pourquoi :</strong> {justification}</p>
      
      <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>✅ Réservation recommandée</h4>
        <p>{lien_reservation}</p>
      </div>
    `
  },
  
  'guide_saisonnier': {
    title: "{destination} en {saison} : Guide complet {annee}",
    structure: `
      <h2>🌸 {destination} en {saison} : Guide {annee}</h2>
      <p><strong>Pourquoi {saison} est la meilleure saison :</strong> {pourquoi_saison}</p>
      
      <h3>🌡️ Météo et températures</h3>
      <ul>
        <li><strong>Température moyenne :</strong> {temperature}</li>
        <li><strong>Précipitations :</strong> {precipitations}</li>
        <li><strong>Humidité :</strong> {humidite}</li>
      </ul>
      
      <h3>👕 Que porter</h3>
      <ul>
        {conseils_vestimentaires}
      </ul>
      
      <h3>🎯 Activités spécifiques à {saison}</h3>
      <ul>
        {activites_saisonnieres}
      </ul>
      
      <h3>💰 Budget {saison}</h3>
      <ul>
        <li><strong>Hébergement :</strong> {prix_hebergement}</li>
        <li><strong>Activités :</strong> {prix_activites}</li>
        <li><strong>Transport :</strong> {prix_transport}</li>
      </ul>
      
      <h3>📅 Itinéraire {saison} parfait</h3>
      <ol>
        {itineraire_saisonnier}
      </ol>
      
      <div style="background: #fff3cd; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <h4>⚠️ Attention {saison}</h4>
        <p>{avertissements_saison}</p>
      </div>
    `
  }
};

class UltraSpecializedContentGenerator {
  constructor() {
    this.setupHandlers();
  }

  setupHandlers() {
    // Générer un guide de quartier
    app.post('/mcp', async (req, res) => {
      const { method, params } = req.body;
      
      if (method === 'generate_quartier_guide') {
        try {
          const result = await this.generateQuartierGuide(params);
          res.json({ result });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      } else if (method === 'generate_comparatif') {
        try {
          const result = await this.generateComparatif(params);
          res.json({ result });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      } else if (method === 'generate_saisonnier') {
        try {
          const result = await this.generateGuideSaisonnier(params);
          res.json({ result });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      } else {
        res.status(400).json({ error: 'Méthode non supportée' });
      }
    });
  }

  async generateQuartierGuide({ destination, quartier, nombre_spots = 10 }) {
    const insights = EXPAT_INSIGHTS[destination]?.[quartier] || [];
    const spots_secrets = insights.slice(0, nombre_spots).map((spot, index) => 
      `<li><strong>${index + 1}. ${spot}</strong></li>`
    ).join('');

    const content = CONTENT_TEMPLATES.quartier_guide.structure
      .replace(/{destination}/g, this.capitalizeFirst(destination))
      .replace(/{quartier}/g, this.capitalizeFirst(quartier))
      .replace(/{nombre}/g, nombre_spots)
      .replace(/{conseil_principal}/g, insights[0] || 'Découvrez les spots secrets')
      .replace(/{spots_secrets}/g, `<ul>${spots_secrets}</ul>`)
      .replace(/{timing_matin}/g, '6h-9h : meilleur moment pour photos')
      .replace(/{timing_apres_midi}/g, '14h-16h : évitez la foule')
      .replace(/{timing_soir}/g, '18h-20h : ambiance locale')
      .replace(/{prix_local}/g, '50-80% moins cher que les spots touristiques')
      .replace(/{prix_transport}/g, 'Utilisez les transports locaux')
      .replace(/{prix_activites}/g, 'Beaucoup d\'activités gratuites')
      .replace(/{erreurs_a_eviter}/g, '<li>Éviter les heures de pointe</li><li>Négocier les prix</li><li>Respecter les coutumes locales</li>')
      .replace(/{itineraire_parfait}/g, '<li>9h : Visite du spot principal</li><li>11h : Pause café locale</li><li>14h : Exploration des rues secondaires</li><li>16h : Shopping local</li><li>18h : Dîner authentique</li>')
      .replace(/{astuce_exclusive}/g, insights[Math.floor(Math.random() * insights.length)] || 'Conseil d\'expat exclusif');

    const title = CONTENT_TEMPLATES.quartier_guide.title
      .replace(/{destination}/g, this.capitalizeFirst(destination))
      .replace(/{quartier}/g, this.capitalizeFirst(quartier))
      .replace(/{nombre}/g, nombre_spots);

    return {
      title,
      content,
      type: 'quartier_guide',
      destination,
      quartier,
      spots_count: nombre_spots
    };
  }

  async generateComparatif({ destination, sujet, nombre_options = 5 }) {
    const options = this.generateComparatifOptions(sujet, nombre_options);
    
    const top_3 = options.slice(0, 3).map((option, index) => 
      `<li><strong>${index + 1}. ${option.nom}</strong> - ${option.prix} (Note: ${option.note}/5)</li>`
    ).join('');

    const tableau = options.map(option => 
      `<tr>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.nom}</td>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.prix}</td>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.qualite}</td>
        <td style="border: 1px solid #ddd; padding: 10px;">${option.note}/5</td>
      </tr>`
    ).join('');

    const content = CONTENT_TEMPLATES.comparatif_pratique.structure
      .replace(/{destination}/g, this.capitalizeFirst(destination))
      .replace(/{sujet}/g, sujet)
      .replace(/{nombre}/g, nombre_options)
      .replace(/{top_3_options}/g, `<ul>${top_3}</ul>`)
      .replace(/{tableau_comparatif}/g, tableau)
      .replace(/{option_budget}/g, options.find(o => o.note >= 4 && o.prix.includes('€'))?.nom || 'Option budget')
      .replace(/{option_qualite_prix}/g, options.find(o => o.note >= 4.5)?.nom || 'Meilleur rapport')
      .replace(/{option_luxe}/g, options.find(o => o.prix.includes('€€€'))?.nom || 'Option luxe')
      .replace(/{recommandation_principale}/g, options[0].nom)
      .replace(/{justification}/g, 'Testé et approuvé par notre équipe d\'experts')
      .replace(/{lien_reservation}/g, `[tp_affiliate_link]Réserver ${options[0].nom}[/tp_affiliate_link]`);

    const title = CONTENT_TEMPLATES.comparatif_pratique.title
      .replace(/{destination}/g, this.capitalizeFirst(destination))
      .replace(/{sujet}/g, sujet)
      .replace(/{nombre}/g, nombre_options);

    return {
      title,
      content,
      type: 'comparatif',
      destination,
      sujet,
      options_count: nombre_options
    };
  }

  async generateGuideSaisonnier({ destination, saison, annee = 2024 }) {
    const saisonData = this.getSaisonData(saison);
    
    const content = CONTENT_TEMPLATES.guide_saisonnier.structure
      .replace(/{destination}/g, this.capitalizeFirst(destination))
      .replace(/{saison}/g, saison)
      .replace(/{annee}/g, annee)
      .replace(/{pourquoi_saison}/g, saisonData.pourquoi)
      .replace(/{temperature}/g, saisonData.temperature)
      .replace(/{precipitations}/g, saisonData.precipitations)
      .replace(/{humidite}/g, saisonData.humidite)
      .replace(/{conseils_vestimentaires}/g, saisonData.vestimentaire.map(v => `<li>${v}</li>`).join(''))
      .replace(/{activites_saisonnieres}/g, saisonData.activites.map(a => `<li>${a}</li>`).join(''))
      .replace(/{prix_hebergement}/g, saisonData.prix.hebergement)
      .replace(/{prix_activites}/g, saisonData.prix.activites)
      .replace(/{prix_transport}/g, saisonData.prix.transport)
      .replace(/{itineraire_saisonnier}/g, saisonData.itineraire.map(i => `<li>${i}</li>`).join(''))
      .replace(/{avertissements_saison}/g, saisonData.avertissements);

    const title = CONTENT_TEMPLATES.guide_saisonnier.title
      .replace(/{destination}/g, this.capitalizeFirst(destination))
      .replace(/{saison}/g, saison)
      .replace(/{annee}/g, annee);

    return {
      title,
      content,
      type: 'saisonnier',
      destination,
      saison,
      annee
    };
  }

  generateComparatifOptions(sujet, nombre) {
    const options = [];
    const noms = ['Option Premium', 'Choix Qualité', 'Meilleur Prix', 'Recommandé', 'Exclusif'];
    const prix = ['€', '€€', '€€€'];
    const qualites = ['Excellent', 'Très bon', 'Bon', 'Correct'];
    
    for (let i = 0; i < nombre; i++) {
      options.push({
        nom: `${noms[i % noms.length]} ${sujet}`,
        prix: prix[Math.floor(Math.random() * prix.length)],
        qualite: qualites[Math.floor(Math.random() * qualites.length)],
        note: (4 + Math.random()).toFixed(1)
      });
    }
    
    return options.sort((a, b) => b.note - a.note);
  }

  getSaisonData(saison) {
    const saisons = {
      'printemps': {
        pourquoi: 'Températures douces, floraison des cerisiers, moins de touristes',
        temperature: '15-25°C',
        precipitations: 'Modérées',
        humidite: '60-70%',
        vestimentaire: ['Vêtements légers', 'Veste légère pour le soir', 'Chaussures confortables'],
        activites: ['Hanami (cerisiers en fleur)', 'Randonnées nature', 'Festivals locaux'],
        prix: {
          hebergement: 'Prix moyens, réservation recommandée',
          activites: 'Beaucoup d\'activités gratuites',
          transport: 'Prix normaux'
        },
        itineraire: ['9h : Parc aux cerisiers', '11h : Temple local', '14h : Marché de saison', '16h : Randonnée', '18h : Dîner avec vue'],
        avertissements: 'Réservation obligatoire pour les spots populaires'
      },
      'été': {
        pourquoi: 'Festivals, plages, activités en plein air',
        temperature: '25-35°C',
        precipitations: 'Saison des pluies',
        humidite: '80-90%',
        vestimentaire: ['Vêtements très légers', 'Protection solaire', 'Chapeau obligatoire'],
        activites: ['Festivals d\'été', 'Plages', 'Activités aquatiques'],
        prix: {
          hebergement: 'Prix élevés, réservation très recommandée',
          activites: 'Prix moyens à élevés',
          transport: 'Prix normaux'
        },
        itineraire: ['8h : Plage matinale', '11h : Festival local', '14h : Repos à l\'hôtel', '16h : Shopping', '18h : Dîner en terrasse'],
        avertissements: 'Hydratation constante, évitez 12h-15h'
      }
    };
    
    return saisons[saison] || saisons['printemps'];
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Démarrer le serveur
const generator = new UltraSpecializedContentGenerator();

app.listen(PORT, () => {
  console.log(`🚀 Ultra Specialized Content Generator démarré sur le port ${PORT}`);
  console.log('📝 Méthodes disponibles:');
  console.log('  - generate_quartier_guide');
  console.log('  - generate_comparatif');
  console.log('  - generate_saisonnier');
});
