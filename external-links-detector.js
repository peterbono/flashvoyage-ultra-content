/**
 * DÉTECTEUR DE LIENS EXTERNES INTELLIGENTS
 * Identifie les opportunités de liens externes vers des ressources utiles
 */

export class ExternalLinksDetector {
  constructor() {
    // Base de données de liens externes connus
    this.knownLinks = {
      // Groupes Facebook
      'Digital Nomads Indonesia': 'https://www.facebook.com/groups/digitalnomadsindonesia',
      'Digital Nomads Bali': 'https://www.facebook.com/groups/digitalnomadsbali',
      'Digital Nomads Thailand': 'https://www.facebook.com/groups/digitalnomadsthailand',
      'Digital Nomads Bangkok': 'https://www.facebook.com/groups/digitalnomadsbangkok',
      
      // Coworking Spaces
      'Hubud': 'https://www.hubud.org/',
      'Dojo Bali': 'https://dojobali.org/',
      'Outpost': 'https://www.outpost-asia.com/',
      'Tropical Nomad': 'https://tropicalnomad.com/',
      
      // Compagnies aériennes
      'AirAsia': 'https://www.airasia.com/',
      'Garuda Indonesia': 'https://www.garuda-indonesia.com/',
      'Thai Airways': 'https://www.thaiairways.com/',
      
      // Hébergement
      'Airbnb': 'https://www.airbnb.com/',
      'Booking.com': 'https://www.booking.com/',
      
      // Outils nomades
      'Nomad List': 'https://nomadlist.com/',
      'Remote Year': 'https://www.remoteyear.com/',
      'Workaway': 'https://www.workaway.info/',
      
      // Visas & Admin
      'iVisa': 'https://www.ivisa.com/',
      
      // Reddit
      'r/digitalnomad': 'https://www.reddit.com/r/digitalnomad/',
      'r/bali': 'https://www.reddit.com/r/bali/',
      'r/indonesia': 'https://www.reddit.com/r/indonesia/'
    };

    // Patterns pour détecter des opportunités
    this.patterns = [
      // Groupes Facebook
      {
        regex: /groupe Facebook[:\s]+([^,\.]+)/gi,
        type: 'facebook_group',
        priority: 'high'
      },
      // Coworking spaces
      {
        regex: /coworking[:\s]+([^,\.]+)/gi,
        type: 'coworking',
        priority: 'high'
      },
      // Espaces de travail
      {
        regex: /espace de travail[:\s]+([^,\.]+)/gi,
        type: 'coworking',
        priority: 'medium'
      },
      // Compagnies
      {
        regex: /compagnie aérienne[:\s]+([^,\.]+)/gi,
        type: 'airline',
        priority: 'medium'
      }
    ];
  }

  /**
   * Détecte les opportunités de liens externes dans un texte
   * @param {string} content - Contenu HTML de l'article
   * @param {string} plainText - Contenu texte brut
   * @returns {Array} - Liste des opportunités de liens
   */
  detectOpportunities(content, plainText) {
    console.log('\n🔍 DÉTECTION DE LIENS EXTERNES:');
    console.log('==============================\n');

    const opportunities = [];

    // 1. Chercher les entités connues dans le texte
    for (const [name, url] of Object.entries(this.knownLinks)) {
      const regex = new RegExp(`\\b${this.escapeRegex(name)}\\b`, 'gi');
      const matches = plainText.match(regex);

      if (matches) {
        opportunities.push({
          anchor_text: name,
          url: url,
          type: this.getLinkType(name),
          priority: 'high',
          reason: `Référence directe à ${name}`,
          occurrences: matches.length
        });
        console.log(`✅ Détecté: "${name}" → ${url}`);
      }
    }

    // 2. Chercher les patterns génériques
    for (const pattern of this.patterns) {
      const matches = [...plainText.matchAll(pattern.regex)];
      
      for (const match of matches) {
        const extractedName = match[1].trim();
        
        // Vérifier si on a un lien pour cette entité
        if (this.knownLinks[extractedName]) {
          opportunities.push({
            anchor_text: extractedName,
            url: this.knownLinks[extractedName],
            type: pattern.type,
            priority: pattern.priority,
            reason: `Détecté via pattern: ${pattern.type}`,
            occurrences: 1
          });
          console.log(`✅ Pattern détecté: "${extractedName}" → ${this.knownLinks[extractedName]}`);
        }
      }
    }

    // 3. Dédupliquer
    const uniqueOpportunities = this.deduplicateOpportunities(opportunities);

    console.log(`\n📊 Total: ${uniqueOpportunities.length} opportunités de liens externes\n`);

    return uniqueOpportunities;
  }

  /**
   * Déduplique les opportunités par URL
   */
  deduplicateOpportunities(opportunities) {
    const seen = new Map();

    for (const opp of opportunities) {
      if (!seen.has(opp.url)) {
        seen.set(opp.url, opp);
      } else {
        // Garder celle avec la priorité la plus haute
        const existing = seen.get(opp.url);
        if (this.getPriorityValue(opp.priority) > this.getPriorityValue(existing.priority)) {
          seen.set(opp.url, opp);
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Détermine le type de lien
   */
  getLinkType(name) {
    if (name.includes('Facebook') || name.includes('Reddit')) return 'community';
    if (name.includes('Coworking') || ['Hubud', 'Dojo Bali', 'Outpost'].includes(name)) return 'coworking';
    if (['AirAsia', 'Garuda', 'Thai Airways'].includes(name)) return 'airline';
    if (['Airbnb', 'Booking.com'].includes(name)) return 'accommodation';
    if (['Nomad List', 'Remote Year'].includes(name)) return 'tool';
    return 'other';
  }

  /**
   * Valeur numérique de priorité
   */
  getPriorityValue(priority) {
    const values = { high: 3, medium: 2, low: 1 };
    return values[priority] || 0;
  }

  /**
   * Échappe les caractères spéciaux pour regex
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Ajoute un nouveau lien connu à la base de données
   */
  addKnownLink(name, url) {
    this.knownLinks[name] = url;
  }

  /**
   * Suggère des liens externes basés sur le contenu
   * @param {string} content - Contenu HTML
   * @param {string} plainText - Contenu texte brut
   * @param {number} maxLinks - Nombre max de liens à suggérer
   * @returns {Array} - Liste des liens suggérés
   */
  suggestLinks(content, plainText, maxLinks = 8) {
    const opportunities = this.detectOpportunities(content, plainText);

    // Trier par priorité puis par occurrences
    const sorted = opportunities.sort((a, b) => {
      const priorityDiff = this.getPriorityValue(b.priority) - this.getPriorityValue(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return b.occurrences - a.occurrences;
    });

    return sorted.slice(0, maxLinks);
  }

  /**
   * Affiche les résultats
   */
  displayResults(suggestions) {
    console.log('📋 LIENS EXTERNES SUGGÉRÉS:');
    console.log('===========================\n');

    if (suggestions.length === 0) {
      console.log('⚠️ Aucun lien externe suggéré\n');
      return;
    }

    suggestions.forEach((link, index) => {
      console.log(`${index + 1}. ${link.anchor_text}`);
      console.log(`   Type: ${link.type}`);
      console.log(`   Priorité: ${link.priority}`);
      console.log(`   URL: ${link.url}`);
      console.log(`   Raison: ${link.reason}`);
      console.log(`   Occurrences: ${link.occurrences}`);
      console.log('');
    });
  }
}

export default ExternalLinksDetector;
