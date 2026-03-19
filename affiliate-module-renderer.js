#!/usr/bin/env node

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
      title: 'Utile si tu voyages sans assurance',
      phrase: 'Les frais médicaux à l\'étranger peuvent être très élevés. Une assurance voyage adaptée peut te protéger en cas d\'urgence médicale, de vol ou d\'annulation.'
    },
    esim: {
      title: 'Utile si tu as besoin d\'internet en voyage',
      phrase: 'Évite les frais de roaming élevés. Une eSIM te permet d\'avoir internet dès ton arrivée dans plus de 200 pays, sans changer de carte SIM.'
    },
    flights: {
      title: 'Utile si tu planifies tes vols',
      phrase: 'Les prix des vols varient selon les compagnies et les dates. Un comparateur t\'aide à trouver les meilleures offres pour ta destination.'
    },
    accommodation: {
      title: 'Utile si tu cherches un hébergement',
      phrase: 'Trouve l\'hébergement qui correspond à tes besoins et à ton budget, que ce soit un hôtel, un hostel ou un appartement.'
    },
    coworking: {
      title: 'Utile si tu travailles en voyage',
      phrase: 'Un espace de coworking avec une connexion internet fiable peut améliorer ta productivité pendant ton séjour.'
    },
    transfers: {
      title: 'Utile si tu arrives dans un nouvel aéroport',
      phrase: 'Réserver ton transfert à l\'avance te garantit un trajet fiable et un prix fixe, sans mauvaise surprise à l\'arrivée.'
    },
    tours: {
      title: 'Utile si tu cherches des activités sur place',
      phrase: 'Billets coupe-file et excursions locales t\'évitent les files d\'attente et te font gagner du temps.'
    },
    car_rental: {
      title: 'Utile si tu veux explorer par la route',
      phrase: 'Comparer les agences de location te permet de trouver le meilleur prix et la meilleure couverture.'
    },
    bikes: {
      title: 'Utile si tu veux louer un scooter ou un vélo',
      phrase: 'La location de deux-roues est souvent le moyen le plus pratique et économique pour explorer une destination.'
    },
    flight_compensation: {
      title: 'Utile si ton vol a été retardé ou annulé',
      phrase: 'Tu peux réclamer jusqu\'à 600 € de compensation automatiquement, sans frais si ta demande n\'aboutit pas.'
    },
    events: {
      title: 'Utile si tu cherches des événements sur place',
      phrase: 'Billets concerts, spectacles et événements sportifs au meilleur prix, livrés directement sur ton téléphone.'
    }
  };

  // P3: Contextualiser avec la friction de l'Angle Hunter si disponible
  const frictionContext = placement.payload?.friction_moment || null;
  const frictionCost = placement.payload?.friction_cost || null;
  const isAngleHunter = placement.payload?.source === 'angle_hunter';

  let diagnostic;
  if (isAngleHunter && frictionCost && frictionCost.length >= 10) {
    // Titre contextuel construit depuis cost_of_inaction
    let contextualTitle = frictionCost;
    if (!/[.!?]$/.test(contextualTitle)) {
      contextualTitle = contextualTitle.replace(/^(.)/,  (_, c) => c.toUpperCase());
    }
    if (contextualTitle.length > 120) {
      contextualTitle = contextualTitle.substring(0, 117) + '...';
    }

    // Description contextuelle depuis friction_moment + phrase diagnostic
    const baseDiag = diagnosticPhrases[placement.id] || { title: 'Utile pour ton voyage', phrase: '' };
    const contextualPhrase = frictionContext
      ? `${frictionContext} ${baseDiag.phrase}`
      : baseDiag.phrase;

    diagnostic = {
      title: contextualTitle,
      phrase: contextualPhrase
    };
  } else {
    diagnostic = diagnosticPhrases[placement.id] || {
      title: 'Utile pour ton voyage',
      phrase: 'Cet outil peut t\'aider à organiser ton voyage.'
    };
  }
  // Générer le widget/script selon placement.id
  const widgetScript = generateWidgetScript(placement, geo_defaults);

  // Construire le HTML
  // IMPORTANT: Utiliser <aside> au lieu de <div> pour éviter que le thème JNews
  // traite le module comme un slot publicitaire (jeg_ad jnews_content_inline_ads)
  // ce qui provoque height=0px et masque tout le contenu suivant.
  // IMPORTANT: Envelopper le script dans <!-- wp:html --> pour empêcher WordPress
  // de supprimer le </script> fermant via wp_kses_post(), ce qui casse le rendu.
  const html = `
<aside class="affiliate-module" data-placement-id="${placement.id}" data-fv-segment="affiliate">
<h3 class="affiliate-module-title">${escapeHtml(diagnostic.title)}</h3>
<p class="affiliate-module-description">${escapeHtml(diagnostic.phrase)}</p>
<!-- wp:html -->
${widgetScript}
<!-- /wp:html -->
<p class="affiliate-module-disclaimer"><small>Liens partenaires: une commission peut être perçue, sans surcoût pour toi.</small></p>
</aside>
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
      // PHASE 2.3a: Utiliser iata_destination/iata_origin explicites du payload en priorité
      const origin = payload?.iata_origin || geo_defaults?.origin || 'PAR';
      const dest = payload?.iata_destination || geo_defaults?.nearest_hub || 'BKK';
      return `[fv_widget type="flights" origin="${origin}" destination="${dest}"]`;

    case 'esim':
      return `[fv_widget type="esim"]`;

    case 'insurance':
      return `[fv_widget type="insurance"]`;

    case 'accommodation':
    case 'hotels': {
      const hotelCity = geo_defaults?.city || 'bangkok';
      const hotelCityDisplay = hotelCity.charAt(0).toUpperCase() + hotelCity.slice(1);
      const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotelCity)}&aid=2397601`;
      return `<aside class="affiliate-module affiliate-module--hotels" data-fv-segment="affiliate">` +
        `<h3 class="affiliate-module-title">🏨 Hébergements à ${hotelCityDisplay}</h3>` +
        `<p class="affiliate-module-description">Compare les meilleurs hôtels, hostels et appartements à ${hotelCityDisplay}. Réservation flexible et meilleurs prix garantis.</p>` +
        `<a href="${bookingUrl}" target="_blank" rel="nofollow sponsored" class="affiliate-module-cta">Voir les hébergements →</a>` +
        `<p class="affiliate-module-disclaimer"><small>Lien partenaire : une commission peut être perçue, sans surcoût pour toi.</small></p>` +
        `</aside>`;
    }

    case 'coworking':
      return `<p><a href="https://www.coworker.com/?ref=flashvoyage" target="_blank" rel="nofollow">Trouver un espace de coworking</a></p>`;

    case 'transfers':
      return `[fv_widget type="transfers"]`;

    case 'tours':
    case 'activities':
      // DISABLED — always shows Amsterdam regardless of destination
      return '';

    case 'car_rental':
      return `[fv_widget type="car_rental"]`;

    case 'bikes':
      return `[fv_widget type="bikes"]`;

    case 'flight_compensation':
      return `[fv_widget type="flight_compensation"]`;

    case 'events':
      return `[fv_widget type="events"]`;

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
