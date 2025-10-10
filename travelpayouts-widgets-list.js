// Liste des widgets Travelpayouts disponibles
// Tu peux me donner tes vrais widgets et je les stockerai ici

export const TRAVELPAYOUTS_WIDGETS = {
  // Exemple du widget que tu as fourni
  example: {
    name: "Widget Exemple",
    script: `<script async src="https://trpwdg.com/content?trs=463418&shmarker=676421&locale=en&powered_by=true&color_button=%23f2685f&color_focused=%23f2685f&secondary=%23FFFFFF&dark=%2311100f&light=%23FFFFFF&special=%23C4C4C4&border_radius=5&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>`,
    description: "Widget exemple fourni par l'utilisateur"
  },

  // Placeholder pour tes vrais widgets
  // Tu peux me donner la liste et je les ajouterai ici
  flights: null,
  hotels: null,
  insurance: null,
  productivity: null,
  // Ajoute d'autres types selon tes besoins
};

// Fonction pour remplacer les placeholders par les vrais widgets
export function replacePlaceholdersWithRealWidgets(content, widgets) {
  let updatedContent = content;

  // Remplacer les placeholders par les vrais scripts
  if (widgets.flights) {
    updatedContent = updatedContent.replace(
      /\{\{TRAVELPAYOUTS_FLIGHTS_WIDGET\}\}/g,
      widgets.flights
    );
  }

  if (widgets.hotels) {
    updatedContent = updatedContent.replace(
      /\{\{TRAVELPAYOUTS_HOTELS_WIDGET\}\}/g,
      widgets.hotels
    );
  }

  if (widgets.insurance) {
    updatedContent = updatedContent.replace(
      /\{\{TRAVELPAYOUTS_INSURANCE_WIDGET\}\}/g,
      widgets.insurance
    );
  }

  if (widgets.productivity) {
    updatedContent = updatedContent.replace(
      /\{\{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET\}\}/g,
      widgets.productivity
    );
  }

  return updatedContent;
}

export default TRAVELPAYOUTS_WIDGETS;
