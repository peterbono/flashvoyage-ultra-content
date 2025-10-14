/**
 * GÉNÉRATEUR DE TABLEAUX WORDPRESS STYLÉS
 * Crée des tableaux de comparaison avec le style WordPress natif
 */

export class TableGenerator {
  /**
   * Génère un tableau de comparaison WordPress
   * @param {Array} headers - En-têtes du tableau ['Critère', 'Destination A', 'Destination B']
   * @param {Array} rows - Lignes du tableau [{critere: 'Coût', valA: '250€', valB: '400€'}]
   * @param {Object} options - Options de style
   * @returns {string} - HTML du tableau WordPress
   */
  static generateComparisonTable(headers, rows, options = {}) {
    const {
      striped = false,
      fixedLayout = true,
      caption = null
    } = options;

    const classNames = ['wp-block-table'];
    if (striped) classNames.push('is-style-stripes');

    const tableClasses = [];
    if (fixedLayout) tableClasses.push('has-fixed-layout');

    let html = '<!-- wp:table -->\n';
    html += `<figure class="${classNames.join(' ')}">\n`;
    
    if (caption) {
      html += `<figcaption class="wp-element-caption">${caption}</figcaption>\n`;
    }

    html += `<table${tableClasses.length ? ` class="${tableClasses.join(' ')}"` : ''}>\n`;
    
    // En-têtes
    html += '<thead>\n<tr>\n';
    headers.forEach(header => {
      html += `<th>${header}</th>\n`;
    });
    html += '</tr>\n</thead>\n';
    
    // Corps
    html += '<tbody>\n';
    rows.forEach(row => {
      html += '<tr>\n';
      Object.values(row).forEach(value => {
        html += `<td>${value}</td>\n`;
      });
      html += '</tr>\n';
    });
    html += '</tbody>\n';
    
    html += '</table>\n';
    html += '</figure>\n';
    html += '<!-- /wp:table -->\n';

    return html;
  }

  /**
   * Génère un tableau de comparaison destinations
   * @param {string} destA - Nom de la destination A
   * @param {string} destB - Nom de la destination B
   * @param {Object} data - Données de comparaison
   * @returns {string} - HTML du tableau
   */
  static generateDestinationComparison(destA, destB, data) {
    const headers = ['Critère', destA, destB];
    
    const rows = [
      {
        critere: 'Coût de la vie',
        valA: data.coutVieA || 'N/A',
        valB: data.coutVieB || 'N/A'
      },
      {
        critere: 'Internet',
        valA: data.internetA || 'N/A',
        valB: data.internetB || 'N/A'
      },
      {
        critere: 'Communauté',
        valA: data.communauteA || 'N/A',
        valB: data.communauteB || 'N/A'
      },
      {
        critere: 'Visa',
        valA: data.visaA || 'N/A',
        valB: data.visaB || 'N/A'
      },
      {
        critere: 'Météo',
        valA: data.meteoA || 'N/A',
        valB: data.meteoB || 'N/A'
      }
    ];

    return this.generateComparisonTable(headers, rows, { fixedLayout: true });
  }

  /**
   * Génère un tableau de budget mensuel
   * @param {string} destination - Nom de la destination
   * @param {Object} budget - Détails du budget
   * @returns {string} - HTML du tableau
   */
  static generateBudgetTable(destination, budget) {
    const headers = ['Catégorie', 'Coût mensuel'];
    
    const rows = [
      { categorie: 'Logement', cout: budget.logement || 'N/A' },
      { categorie: 'Nourriture', cout: budget.nourriture || 'N/A' },
      { categorie: 'Transport', cout: budget.transport || 'N/A' },
      { categorie: 'Coworking', cout: budget.coworking || 'N/A' },
      { categorie: 'Loisirs', cout: budget.loisirs || 'N/A' },
      { categorie: '<strong>Total</strong>', cout: `<strong>${budget.total || 'N/A'}</strong>` }
    ];

    return this.generateComparisonTable(
      headers, 
      rows, 
      { 
        fixedLayout: true,
        caption: `Budget mensuel moyen à ${destination}`
      }
    );
  }

  /**
   * Génère un tableau de scores/notes
   * @param {string} destA - Destination A
   * @param {string} destB - Destination B
   * @param {Object} scores - Scores pour chaque critère
   * @returns {string} - HTML du tableau
   */
  static generateScoreTable(destA, destB, scores) {
    const headers = ['Critère', destA, destB];
    
    const rows = Object.entries(scores).map(([critere, values]) => ({
      critere: critere,
      scoreA: `${values.scoreA}/10`,
      scoreB: `${values.scoreB}/10`
    }));

    return this.generateComparisonTable(headers, rows, { 
      fixedLayout: true,
      striped: false
    });
  }

  /**
   * Parse les données d'un article Reddit pour créer un tableau
   * @param {string} content - Contenu de l'article
   * @returns {Object|null} - Données du tableau ou null
   */
  static parseComparisonFromContent(content) {
    // Chercher des patterns de comparaison dans le contenu
    const comparisonPatterns = [
      /(\w+)\s*:\s*([^,\n]+)\s*vs\s*(\w+)\s*:\s*([^,\n]+)/gi,
      /(\w+)\s*-\s*([^,\n]+)\s*\/\s*(\w+)\s*-\s*([^,\n]+)/gi
    ];

    for (const pattern of comparisonPatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        // Extraire les données
        const data = {};
        matches.forEach(match => {
          const [, destA, valA, destB, valB] = match;
          if (!data.destA) data.destA = destA.trim();
          if (!data.destB) data.destB = destB.trim();
          // Stocker les valeurs
          // ... logique d'extraction
        });
        return data;
      }
    }

    return null;
  }
}

export default TableGenerator;
