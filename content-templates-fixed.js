#!/usr/bin/env node

/**
 * Content Templates - Templates structurés pour éviter les erreurs
 * Assure la cohérence et la qualité du contenu généré
 */

class ContentTemplates {
  constructor() {
    this.templates = this.initializeTemplates();
  }

  // Initialiser les templates
  initializeTemplates() {
    return {
      // Template pour les bons plans
      bon_plan: {
        title: "🔥 URGENT : \${title}",
        validity: "Offre valable jusqu'en \${endDate}",
        economic_value: "Économies : \${minAmount}-\${maxAmount}€ par voyage",
        content: `
<p><strong>Source :</strong> <a href="\${sourceLink}" target="_blank" rel="noopener">\${sourceTitle}</a> - \${sourceName}</p>

<p>Si tu es un voyageur français qui rêve d'Asie, cette info va changer ton prochain voyage. Chez FlashVoyages, on déniche les bons plans qui valent le détour.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur \${articleType} en Asie, c'est pas juste une actualité de plus. C'est le genre d'info qui peut te faire économiser des centaines d'euros sur ton prochain voyage.</p>

<p>On suit ces évolutions de près parce qu'on sait que nos lecteurs comptent sur nous pour dénicher les vraies bonnes affaires.</p>

<h5>Ce qui change concrètement pour toi</h5>
<p>Voici ce que tu dois retenir :</p>

<ul>
<li><strong>\${articleType} :</strong> \${articleContent}</li>
<li><strong>Validité :</strong> \${validity}</li>
<li><strong>Pour qui :</strong> \${targetAudience}</li>
<li><strong>Économies :</strong> \${economicValue}</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>On te conseille d'agir rapidement. Ces offres sont souvent limitées dans le temps et partent vite.</p>

<p>On te recommande de réserver rapidement pour profiter des offres. C'est le genre de changement qu'on voit venir, et mieux vaut être préparé.</p>

<h5>Contexte Asie</h5>
<p>Cette évolution s'inscrit dans une tendance plus large : l'Asie se positionne comme une destination accessible avec des offres attractives.</p>

<p>C'est une bonne nouvelle pour les voyageurs français — ça signifie des économies importantes sur tes voyages.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> \${relevanceScore}/100 — Information cruciale</p>
<p><strong>Pourquoi c'est important :</strong> \${importanceReason}</p>
<p><strong>Action recommandée :</strong> \${recommendedAction}</p>

<p><em>Cet article a été analysé par notre équipe FlashVoyages — ton spécialiste du voyage en Asie.</em></p>
        `
      },

      // Template pour les formalités
      formalites: {
        title: "📋 \${title}",
        validity: "Règlement en vigueur jusqu'en \${endDate}",
        economic_value: "Coût : \${cost}€ par personne",
        content: `
<p><strong>Source :</strong> <a href="\${sourceLink}" target="_blank" rel="noopener">\${sourceTitle}</a> - \${sourceName}</p>

<p>Les formalités en Asie évoluent constamment. Chez FlashVoyages, on te tient informé des changements qui impactent tes voyages.</p>

<h5>Ce qui change pour tes voyages</h5>
<p>Cette modification des \${articleType} en Asie va impacter la façon dont tu prépares tes voyages.</p>

<h5>Détails pratiques</h5>
<ul>
<li><strong>Nouvelle règle :</strong> \${articleContent}</li>
<li><strong>Validité :</strong> \${validity}</li>
<li><strong>Pays concernés :</strong> \${affectedCountries}</li>
<li><strong>Coût :</strong> \${economicValue}</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>On te recommande de vérifier les formalités avant chaque voyage. Les règles changent souvent sans préavis.</p>

<h5>Contexte Asie</h5>
<p>L'Asie modernise ses procédures pour faciliter le tourisme tout en maintenant la sécurité.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> \${relevanceScore}/100 — Information importante</p>
<p><strong>Impact :</strong> \${impactDescription}</p>
<p><strong>Action recommandée :</strong> \${recommendedAction}</p>
        `
      },

      // Template pour les transports
      transport: {
        title: "✈️ \${title}",
        validity: "Disponible jusqu'en \${endDate}",
        economic_value: "Prix : \${priceRange}€",
        content: `
<p><strong>Source :</strong> <a href="\${sourceLink}" target="_blank" rel="noopener">\${sourceTitle}</a> - \${sourceName}</p>

<p>Les transports en Asie s'améliorent constamment. Chez FlashVoyages, on teste et on te recommande les meilleures options.</p>

<h5>Nouvelle option de transport</h5>
<p>Cette évolution des \${articleType} en Asie va améliorer tes déplacements.</p>

<h5>Détails techniques</h5>
<ul>
<li><strong>Service :</strong> \${articleContent}</li>
<li><strong>Disponibilité :</strong> \${validity}</li>
<li><strong>Destinations :</strong> \${destinations}</li>
<li><strong>Prix :</strong> \${economicValue}</li>
</ul>

<h5>Notre conseil FlashVoyages</h5>
<p>On te recommande de tester cette nouvelle option lors de ton prochain voyage.</p>

<h5>Contexte Asie</h5>
<p>L'Asie investit massivement dans les infrastructures de transport pour attirer les touristes.</p>

<h5>Notre analyse</h5>
<p><strong>Score FlashVoyages :</strong> \${relevanceScore}/100 — Innovation intéressante</p>
<p><strong>Avantages :</strong> \${advantages}</p>
<p><strong>Action recommandée :</strong> \${recommendedAction}</p>
        `
      }
    };
  }

  // Générer du contenu à partir d'un template
  generateContent(templateType, data) {
    const template = this.templates[templateType];
    if (!template) {
      throw new Error(`Template ${templateType} non trouvé`);
    }

    // Données par défaut
    const defaultData = {
      title: data.title || 'Titre par défaut',
      sourceLink: data.link || '#',
      sourceTitle: data.title || 'Source',
      sourceName: data.source || 'Source officielle',
      articleType: data.type || 'actualité',
      articleContent: data.content || 'Contenu de l\'article',
      validity: this.generateValidityPeriod(data.type),
      targetAudience: 'Voyageurs français passionnés d\'Asie',
      economicValue: this.generateEconomicValue(data.type),
      relevanceScore: data.relevance || 85,
      importanceReason: 'Information utile pour tes voyages',
      recommendedAction: 'Rester informé des évolutions',
      endDate: this.getEndDate(data.type),
      minAmount: '300',
      maxAmount: '800',
      cost: '50-150',
      affectedCountries: 'Pays d\'Asie',
      impactDescription: 'Impact sur tes formalités de voyage',
      priceRange: '200-800',
      destinations: 'Principales villes d\'Asie',
      advantages: 'Confort et efficacité améliorés'
    };

    // Fusionner avec les données fournies
    const mergedData = { ...defaultData, ...data };

    // Remplacer les placeholders
    let content = template.content;
    Object.keys(mergedData).forEach(key => {
      const placeholder = new RegExp(`\\$\\{${key}\\}`, 'g');
      content = content.replace(placeholder, mergedData[key]);
    });

    return {
      title: this.replacePlaceholders(template.title, mergedData),
      content: content,
      validity: mergedData.validity,
      economicValue: mergedData.economicValue
    };
  }

  // Remplacer les placeholders dans une chaîne
  replacePlaceholders(template, data) {
    return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  // Générer une période de validité cohérente
  generateValidityPeriod(articleType) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    const validityTemplates = {
      'bon_plan': `Offre valable jusqu'en décembre ${currentYear}`,
      'transport': `Disponible jusqu'en mars ${currentYear + 1}`,
      'formalites': `Règlement en vigueur jusqu'en juin ${currentYear + 1}`,
      'safety': `Mesures applicables jusqu'en décembre ${currentYear}`,
      'tourism': `Saison touristique ${currentYear}-${currentYear + 1}`
    };
    
    // Si c'est un bon plan en fin d'année, étendre à l'année suivante
    if (articleType === 'bon_plan' && currentMonth >= 10) {
      return `Offre valable jusqu'en mars ${currentYear + 1}`;
    }
    
    return validityTemplates[articleType] || `Valide jusqu'en décembre ${currentYear}`;
  }

  // Générer une valeur économique cohérente
  generateEconomicValue(articleType) {
    const economicTemplates = {
      'bon_plan': '300-800€ par voyage',
      'transport': '200-600€ par trajet',
      'formalites': '50-150€ par personne',
      'safety': 'Économies sur l\'assurance voyage',
      'tourism': '200-500€ par séjour'
    };
    
    return economicTemplates[articleType] || 'Économies variables';
  }

  // Obtenir une date de fin cohérente
  getEndDate(articleType) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    if (articleType === 'bon_plan' && currentMonth >= 10) {
      return `mars ${currentYear + 1}`;
    }
    
    const endDates = {
      'bon_plan': `décembre ${currentYear}`,
      'transport': `mars ${currentYear + 1}`,
      'formalites': `juin ${currentYear + 1}`,
      'safety': `décembre ${currentYear}`,
      'tourism': `${currentYear}-${currentYear + 1}`
    };
    
    return endDates[articleType] || `décembre ${currentYear}`;
  }

  // Valider un template
  validateTemplate(templateType, data) {
    const template = this.templates[templateType];
    if (!template) {
      return { isValid: false, error: `Template ${templateType} non trouvé` };
    }

    // Vérifier que tous les placeholders requis sont fournis
    const requiredPlaceholders = this.extractPlaceholders(template.content);
    const missingPlaceholders = requiredPlaceholders.filter(placeholder => !data[placeholder]);
    
    if (missingPlaceholders.length > 0) {
      return {
        isValid: false,
        error: `Placeholders manquants: ${missingPlaceholders.join(', ')}`
      };
    }

    return { isValid: true };
  }

  // Extraire les placeholders d'un template
  extractPlaceholders(template) {
    const matches = template.match(/\$\{([^}]+)\}/g);
    if (!matches) return [];
    
    return matches.map(match => match.replace(/\$\{|\}/g, ''));
  }
}

export default ContentTemplates;
