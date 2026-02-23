/**
 * editorial-calendar.js
 *
 * Moteur de decision editoriale "Content Clusters + Seasonal Timing".
 *
 * Cycle de 5 articles :
 *   0 → pilier   (guide complet, long-form, 2500+ mots)
 *   1 → support  (sous-topic du pilier)
 *   2 → support
 *   3 → support
 *   4 → news     (actualite, RSS+Reddit cross-ref)
 *
 * Le cluster actif change chaque cycle (5 articles).
 * Les clusters sont tries par pertinence saisonniere.
 *
 * State persiste dans data/editorial-calendar.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, 'data', 'editorial-calendar.json');

const ARTICLE_TYPES = ['pillar', 'support', 'support', 'support', 'news'];

const CLUSTERS = [
  {
    id: 'asie-sud-est',
    label: 'Asie du Sud-Est',
    destinations: ['Thailande', 'Vietnam', 'Cambodge', 'Indonesie', 'Bali', 'Philippines', 'Myanmar', 'Laos', 'Malaisie', 'Singapour'],
    peakMonths: [11, 12, 1, 2, 3],
    pillarHints: ['itineraire asie du sud-est', 'budget asie', 'sac a dos asie'],
    supportHints: ['temples angkor', 'iles thailande', 'street food vietnam', 'visa asie', 'transport local asie']
  },
  {
    id: 'japon',
    label: 'Japon',
    destinations: ['Japon', 'Tokyo', 'Kyoto', 'Osaka', 'Hokkaido', 'Okinawa'],
    peakMonths: [3, 4, 10, 11],
    pillarHints: ['guide japon complet', 'premier voyage japon', 'budget japon'],
    supportHints: ['japan rail pass', 'cerisiers japon', 'ryokan onsen', 'cuisine japonaise', 'feuilles automne japon']
  },
  {
    id: 'europe-sud',
    label: 'Europe du Sud',
    destinations: ['Grece', 'Italie', 'Espagne', 'Portugal', 'Croatie', 'Malte', 'Turquie'],
    peakMonths: [5, 6, 7, 8, 9],
    pillarHints: ['road trip europe sud', 'iles grecques guide', 'italie hors sentiers'],
    supportHints: ['plages croatie', 'budget portugal', 'gastronomie italie', 'ferry grece', 'barcelone alternative']
  },
  {
    id: 'amerique-latine',
    label: 'Amerique Latine',
    destinations: ['Mexique', 'Colombie', 'Perou', 'Argentine', 'Costa Rica', 'Chili', 'Bolivie', 'Equateur', 'Cuba'],
    peakMonths: [12, 1, 2, 3, 6, 7, 8],
    pillarHints: ['tour amerique latine', 'backpack amerique du sud', 'securite amerique latine'],
    supportHints: ['machu picchu guide', 'playa del carmen', 'transport colombie', 'budget mexique', 'patagonie trek']
  },
  {
    id: 'afrique-moyen-orient',
    label: 'Afrique & Moyen-Orient',
    destinations: ['Maroc', 'Egypte', 'Kenya', 'Tanzanie', 'Afrique du Sud', 'Jordanie', 'Oman', 'Senegal'],
    peakMonths: [10, 11, 12, 1, 2, 3, 4],
    pillarHints: ['safari guide complet', 'maroc itineraire', 'egypte conseils'],
    supportHints: ['desert maroc', 'plongee mer rouge', 'safari budget', 'petra jordanie', 'zanzibar']
  },
  {
    id: 'oceanie',
    label: 'Oceanie',
    destinations: ['Australie', 'Nouvelle-Zelande', 'Fidji', 'Polynesie'],
    peakMonths: [11, 12, 1, 2, 3],
    pillarHints: ['whv australie guide', 'road trip nouvelle-zelande', 'budget oceanie'],
    supportHints: ['great barrier reef', 'van australie', 'milford sound', 'bora bora budget', 'working holiday visa']
  }
];

class EditorialCalendar {
  constructor() {
    this.state = this._loadState();
  }

  _loadState() {
    try {
      if (fs.existsSync(STATE_PATH)) {
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
      }
    } catch (e) {
      console.warn(`⚠️ CALENDAR: State corrompu, reinitialisation: ${e.message}`);
    }
    return { totalPublished: 0, currentClusterId: null, history: [] };
  }

  _saveState() {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
  }

  /**
   * Score de saisonnalite d'un cluster pour le mois donne (0-1).
   * Les mois "peak" obtiennent 1.0, les mois adjacents 0.5.
   */
  _seasonScore(cluster, month) {
    if (cluster.peakMonths.includes(month)) return 1.0;
    const adjacent = cluster.peakMonths.flatMap(m => [(m % 12) + 1, ((m - 2 + 12) % 12) + 1]);
    if (adjacent.includes(month)) return 0.5;
    return 0.2;
  }

  /**
   * Choisit le meilleur cluster pour le mois courant,
   * en privilegiant ceux qui n'ont pas ete utilises recemment.
   */
  _pickCluster() {
    const month = new Date().getMonth() + 1;
    const recentClusters = this.state.history.slice(-12).map(h => h.clusterId);

    const scored = CLUSTERS.map(c => {
      const seasonScore = this._seasonScore(c, month);
      const recentCount = recentClusters.filter(id => id === c.id).length;
      const diversityBonus = Math.max(0, 1 - recentCount * 0.25);
      return { cluster: c, score: seasonScore * 0.6 + diversityBonus * 0.4 };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].cluster;
  }

  /**
   * Retourne la directive editoriale pour le prochain article.
   *
   * @returns {{
   *   articleType: 'pillar'|'support'|'news',
   *   cluster: object,
   *   searchHints: string[],
   *   cyclePosition: number,
   *   totalPublished: number,
   *   useRss: boolean
   * }}
   */
  getNextDirective() {
    const cyclePos = this.state.totalPublished % ARTICLE_TYPES.length;
    const articleType = ARTICLE_TYPES[cyclePos];

    // Nouveau cycle → nouveau cluster
    let cluster;
    if (cyclePos === 0 || !this.state.currentClusterId) {
      cluster = this._pickCluster();
      this.state.currentClusterId = cluster.id;
    } else {
      cluster = CLUSTERS.find(c => c.id === this.state.currentClusterId) || this._pickCluster();
    }

    let searchHints;
    if (articleType === 'pillar') {
      searchHints = [...cluster.pillarHints, ...cluster.destinations.slice(0, 3)];
    } else if (articleType === 'support') {
      const usedSupports = this.state.history
        .filter(h => h.clusterId === cluster.id && h.articleType === 'support')
        .map(h => h.hint);
      const available = cluster.supportHints.filter(h => !usedSupports.includes(h));
      searchHints = available.length > 0 ? [available[0]] : [cluster.supportHints[0]];
      searchHints.push(...cluster.destinations.slice(0, 2));
    } else {
      searchHints = cluster.destinations.slice(0, 5);
    }

    return {
      articleType,
      cluster: { id: cluster.id, label: cluster.label, destinations: cluster.destinations },
      searchHints,
      cyclePosition: cyclePos,
      totalPublished: this.state.totalPublished,
      useRss: articleType === 'news'
    };
  }

  /**
   * Enregistre la publication d'un article.
   */
  recordPublication(articleType, clusterId, hint, title) {
    this.state.totalPublished += 1;
    this.state.history.push({
      date: new Date().toISOString(),
      clusterId,
      articleType,
      hint: hint || '',
      title: title || ''
    });
    // Garder un historique raisonnable
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.slice(-60);
    }
    this._saveState();
  }

  getStatus() {
    const directive = this.getNextDirective();
    return {
      nextArticleType: directive.articleType,
      activeCluster: directive.cluster.label,
      cyclePosition: `${directive.cyclePosition + 1}/5`,
      totalPublished: this.state.totalPublished,
      searchHints: directive.searchHints
    };
  }
}

export default EditorialCalendar;
