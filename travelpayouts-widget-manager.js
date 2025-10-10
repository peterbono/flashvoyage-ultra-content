#!/usr/bin/env node

class TravelpayoutsWidgetManager {
  constructor() {
    this.widgets = {
      // Widgets de base
      flights: {
        template: '{{TRAVELPAYOUTS_FLIGHTS_WIDGET}}',
        description: 'Widget de recherche de vols',
        conditions: ['transport', 'voyage', 'vol', 'avion', 'déplacement']
      },
      hotels: {
        template: '{{TRAVELPAYOUTS_HOTELS_WIDGET}}',
        description: 'Widget de recherche d\'hébergement',
        conditions: ['logement', 'hôtel', 'coliving', 'airbnb', 'hébergement']
      },
      insurance: {
        template: '{{TRAVELPAYOUTS_INSURANCE_WIDGET}}',
        description: 'Widget d\'assurance voyage',
        conditions: ['assurance', 'santé', 'sécurité', 'protection', 'couverture']
      },
      productivity: {
        template: '{{TRAVELPAYOUTS_PRODUCTIVITY_WIDGET}}',
        description: 'Widget d\'outils de productivité',
        conditions: ['productivité', 'travail', 'bureau', 'coworking', 'outils']
      },
      transport: {
        template: '{{TRAVELPAYOUTS_TRANSPORT_WIDGET}}',
        description: 'Widget de transport local',
        conditions: ['transport', 'bus', 'train', 'métro', 'taxi', 'moto']
      },
      activities: {
        template: '{{TRAVELPAYOUTS_ACTIVITIES_WIDGET}}',
        description: 'Widget d\'activités et excursions',
        conditions: ['activité', 'excursion', 'tourisme', 'visite', 'découverte']
      }
    };

    // Mapping des destinations vers les widgets spécifiques
    this.destinationWidgets = {
      'vietnam': ['flights', 'hotels', 'transport', 'activities'],
      'thailand': ['flights', 'hotels', 'transport', 'activities'],
      'indonesia': ['flights', 'hotels', 'transport', 'activities'],
      'japan': ['flights', 'hotels', 'transport', 'activities'],
      'korea': ['flights', 'hotels', 'transport', 'activities'],
      'singapore': ['flights', 'hotels', 'transport', 'activities'],
      'philippines': ['flights', 'hotels', 'transport', 'activities'],
      'malaysia': ['flights', 'hotels', 'transport', 'activities'],
      'taiwan': ['flights', 'hotels', 'transport', 'activities'],
      'hong kong': ['flights', 'hotels', 'transport', 'activities']
    };
  }

  // Analyser le contenu pour déterminer les widgets appropriés
  analyzeContentForWidgets(content, analysis) {
    const widgets = [];
    const text = content.toLowerCase();
    const destinations = this.extractDestinations(text);
    
    // Widgets basés sur le contenu
    Object.keys(this.widgets).forEach(widgetKey => {
      const widget = this.widgets[widgetKey];
      const hasCondition = widget.conditions.some(condition => 
        text.includes(condition)
      );
      
      if (hasCondition) {
        widgets.push({
          key: widgetKey,
          template: widget.template,
          description: widget.description,
          reason: `Contenu contient: ${widget.conditions.filter(c => text.includes(c)).join(', ')}`
        });
      }
    });

    // Widgets basés sur la destination
    destinations.forEach(dest => {
      const destWidgets = this.destinationWidgets[dest.toLowerCase()];
      if (destWidgets) {
        destWidgets.forEach(widgetKey => {
          if (!widgets.find(w => w.key === widgetKey)) {
            widgets.push({
              key: widgetKey,
              template: this.widgets[widgetKey].template,
              description: this.widgets[widgetKey].description,
              reason: `Destination: ${dest}`
            });
          }
        });
      }
    });

    // Widgets basés sur le type de contenu
    const contentTypeWidgets = this.getWidgetsByContentType(analysis.type_contenu);
    contentTypeWidgets.forEach(widgetKey => {
      if (!widgets.find(w => w.key === widgetKey)) {
        widgets.push({
          key: widgetKey,
          template: this.widgets[widgetKey].template,
          description: this.widgets[widgetKey].description,
          reason: `Type de contenu: ${analysis.type_contenu}`
        });
      }
    });

    return widgets;
  }

  // Obtenir les widgets selon le type de contenu
  getWidgetsByContentType(typeContenu) {
    const mapping = {
      'TEMOIGNAGE_SUCCESS_STORY': ['flights', 'hotels', 'productivity'],
      'TEMOIGNAGE_ECHEC_LEÇONS': ['insurance', 'hotels', 'transport'],
      'TEMOIGNAGE_TRANSITION': ['flights', 'hotels', 'productivity'],
      'TEMOIGNAGE_COMPARAISON': ['flights', 'hotels', 'activities'],
      'GUIDE_PRATIQUE': ['flights', 'hotels', 'transport', 'insurance'],
      'COMPARAISON_DESTINATIONS': ['flights', 'hotels', 'activities'],
      'ACTUALITE_NOMADE': ['flights', 'hotels', 'transport'],
      'CONSEIL_PRATIQUE': ['productivity', 'hotels', 'transport']
    };

    return mapping[typeContenu] || ['flights', 'hotels'];
  }

  // Extraire les destinations du texte
  extractDestinations(text) {
    const destinations = [];
    const asiaCountries = [
      'vietnam', 'thailand', 'japan', 'korea', 'singapore', 
      'philippines', 'indonesia', 'malaysia', 'taiwan', 'hong kong'
    ];
    
    asiaCountries.forEach(country => {
      if (text.includes(country)) {
        destinations.push(country);
      }
    });
    
    return destinations;
  }

  // Générer le HTML des widgets
  generateWidgetsHTML(widgets) {
    if (widgets.length === 0) {
      return '';
    }

    let html = '<h3>Outils recommandés</h3>\n<p><strong>Ressources FlashVoyages :</strong></p>\n<ul>\n';
    
    widgets.forEach(widget => {
      html += `  <li><strong>${this.getWidgetTitle(widget.key)} :</strong> ${widget.template}</li>\n`;
    });
    
    html += '</ul>\n';
    return html;
  }

  // Obtenir le titre du widget
  getWidgetTitle(widgetKey) {
    const titles = {
      'flights': 'Vols vers l\'Asie',
      'hotels': 'Hébergement nomade',
      'insurance': 'Assurance voyage',
      'productivity': 'Outils de productivité',
      'transport': 'Transport local',
      'activities': 'Activités et excursions'
    };
    
    return titles[widgetKey] || 'Service de voyage';
  }

  // Valider la présence des widgets dans le contenu
  validateWidgets(content) {
    const missingWidgets = [];
    const presentWidgets = [];
    
    Object.keys(this.widgets).forEach(widgetKey => {
      const widget = this.widgets[widgetKey];
      if (content.includes(widget.template)) {
        presentWidgets.push(widgetKey);
      } else {
        missingWidgets.push(widgetKey);
      }
    });
    
    return {
      present: presentWidgets,
      missing: missingWidgets,
      score: (presentWidgets.length / Object.keys(this.widgets).length) * 100
    };
  }

  // Optimiser les widgets selon le contexte
  optimizeWidgetsForContext(widgets, context) {
    const optimized = [];
    
    widgets.forEach(widget => {
      // Ajouter des paramètres contextuels si nécessaire
      let optimizedWidget = { ...widget };
      
      if (context.destination) {
        optimizedWidget.destination = context.destination;
      }
      
      if (context.audience) {
        optimizedWidget.audience = context.audience;
      }
      
      optimized.push(optimizedWidget);
    });
    
    return optimized;
  }

  // Générer des suggestions de widgets manquants
  suggestMissingWidgets(content, analysis) {
    const currentWidgets = this.analyzeContentForWidgets(content, analysis);
    const allPossibleWidgets = this.analyzeContentForWidgets(content, analysis);
    
    const suggestions = [];
    
    // Vérifier les widgets manquants par type de contenu
    const expectedWidgets = this.getWidgetsByContentType(analysis.type_contenu);
    expectedWidgets.forEach(widgetKey => {
      if (!currentWidgets.find(w => w.key === widgetKey)) {
        suggestions.push({
          key: widgetKey,
          template: this.widgets[widgetKey].template,
          description: this.widgets[widgetKey].description,
          reason: `Recommandé pour ${analysis.type_contenu}`
        });
      }
    });
    
    return suggestions;
  }
}

export default TravelpayoutsWidgetManager;
