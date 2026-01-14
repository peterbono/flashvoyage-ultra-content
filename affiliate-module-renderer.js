#!/usr/bin/env node

import { REAL_TRAVELPAYOUTS_WIDGETS } from './travelpayouts-real-widgets-database.js';

/**
 * AFFILIATE MODULE RENDERER
 * Phase 5.B - Renderer neutre "module éditorial" pour les placements d'affiliation
 * 
 * Règles strictes:
 * - Style minimal et neutre
 * - Pas de CTA agressif
 * - HTML safe
 * - Disclaimer discret
 */

/**
 * Rend un module d'affiliation éditorial
 * @param {Object} placement - Placement décidé par contextual-affiliate-injector
 * @param {Object} geo_defaults - Géolocalisation par défaut (country, city, nearest_hub, origin)
 * @returns {string} HTML safe du module
 */
export function renderAffiliateModule(placement, geo_defaults) {
  if (!placement || !placement.id) {
    return '';
  }

  // Phrases diagnostic→solution selon le type de placement
  const diagnosticPhrases = {
    insurance: {
      title: 'Outil utile si vous voyagez sans assurance',
      phrase: 'Les frais médicaux à l\'étranger peuvent être très élevés. Une assurance voyage adaptée aux nomades digitaux peut vous protéger en cas d\'urgence médicale, de vol ou d\'annulation de vol.'
    },
    esim: {
      title: 'Outil utile si vous avez besoin d\'internet en voyage',
      phrase: 'Évitez les frais de roaming élevés. Une eSIM vous permet d\'avoir internet dès votre arrivée dans plus de 200 pays, sans changer de carte SIM.'
    },
    flights: {
      title: 'Outil utile si vous planifiez vos vols',
      phrase: 'Les prix des vols varient selon les compagnies et les dates. Un comparateur de vols vous aide à trouver les meilleures offres pour votre destination.'
    },
    accommodation: {
      title: 'Outil utile si vous cherchez un hébergement',
      phrase: 'Trouvez l\'hébergement qui correspond à vos besoins et à votre budget, que ce soit un hôtel, un hostel ou un appartement.'
    },
    coworking: {
      title: 'Outil utile si vous travaillez en voyage',
      phrase: 'Un espace de coworking avec une connexion internet fiable peut améliorer votre productivité pendant votre séjour.'
    }
  };

  const diagnostic = diagnosticPhrases[placement.id] || {
    title: 'Outil utile pour votre voyage',
    phrase: 'Cet outil peut vous aider à organiser votre voyage.'
  };

  // Générer le widget/script selon placement.id
  const widgetScript = generateWidgetScript(placement, geo_defaults);

  // Construire le HTML
  const html = `
<div class="affiliate-module" data-placement-id="${placement.id}">
  <h3 class="affiliate-module-title">${escapeHtml(diagnostic.title)}</h3>
  <p class="affiliate-module-description">${escapeHtml(diagnostic.phrase)}</p>
  <div class="affiliate-module-widget">
    ${widgetScript}
  </div>
  <p class="affiliate-module-disclaimer">
    <small>Lien partenaire</small>
  </p>
</div>
`.trim();

  return html;
}

/**
 * Génère le script/widget selon le type de placement
 * @param {Object} placement - Placement avec id et payload
 * @param {Object} geo_defaults - Géolocalisation
 * @returns {string} HTML/script du widget
 */
function generateWidgetScript(placement, geo_defaults) {
  const { id, payload } = placement;

  switch (id) {
    case 'flights':
      // Widget Flights - pas géré ici, géré par le finalizer via Travelpayouts database
      return `<!-- Widget Flights géré par finalizer -->`;

    case 'esim':
      // VRAI WIDGET eSIM Airalo
      const esimWidget = REAL_TRAVELPAYOUTS_WIDGETS.esim?.airalo?.esimSearch;
      if (esimWidget && esimWidget.script) {
        return esimWidget.script;
      }
      return `<!-- Widget eSIM non trouvé -->`;

    case 'insurance':
      // VRAI WIDGET Insurance SafetyWing
      const insuranceWidget = REAL_TRAVELPAYOUTS_WIDGETS.insurance?.safetywing?.nomadInsurance;
      if (insuranceWidget && insuranceWidget.script) {
        return insuranceWidget.script;
      }
      return `<!-- Widget Insurance non trouvé -->`;

    case 'accommodation':
      // VRAI WIDGET Accommodation Booking.com
      const hotelWidget = REAL_TRAVELPAYOUTS_WIDGETS.hotels?.booking?.hotelMap;
      if (hotelWidget && hotelWidget.script) {
        return hotelWidget.script;
      }
      return `<!-- Widget Accommodation non trouvé -->`;

    case 'coworking':
      // Pas de widget Travelpayouts pour coworking, on met un lien vers une page partenaire
      return `<p><a href="https://www.coworker.com/?ref=flashvoyage" target="_blank" rel="nofollow">Trouver un espace de coworking</a></p>`;

    default:
      return `<!-- Widget ${id} -->`;
  }
}

/**
 * Échappe le HTML pour éviter les injections XSS
 * @param {string} text - Texte à échapper
 * @returns {string} Texte échappé
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
