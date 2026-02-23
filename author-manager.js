/**
 * Author Manager — Gere un pool d'auteurs WordPress pour le E-E-A-T.
 *
 * Cree les profils auteur sur WordPress si inexistants, et assigne
 * un auteur pertinent a chaque article en fonction de la destination.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, 'data', 'authors.json');

/**
 * Pool d'auteurs avec specialisations geographiques.
 * Chaque auteur a une bio E-E-A-T qui demontre l'experience terrain.
 */
const AUTHOR_PROFILES = [
  {
    slug: 'claire-nomade',
    name: 'Claire Dumontier',
    bio: 'Nomade digitale depuis 2019, Claire a vecu 3 ans en Asie du Sud-Est — Bangkok, Chiang Mai, Bali et Ho Chi Minh. Elle partage ses arbitrages budget, logement et connectivite pour les francophones qui veulent tenter l\'aventure.',
    specialties: ['thailand', 'indonesia', 'vietnam', 'cambodia', 'laos', 'myanmar', 'malaysia', 'singapore', 'philippines'],
    email: 'claire@flashvoyage.com',
  },
  {
    slug: 'thomas-japon',
    name: 'Thomas Lefebvre',
    bio: 'Passionne du Japon depuis son premier voyage en 2016, Thomas y retourne chaque annee. JR Pass, ryokans, cerisiers, street food a Osaka — il decrypte le Japon pour les voyageurs francophones avec des conseils concrets et testes.',
    specialties: ['japan', 'korea', 'taiwan'],
    email: 'thomas@flashvoyage.com',
  },
  {
    slug: 'julie-backpack',
    name: 'Julie Renard',
    bio: 'Julie a parcouru 14 pays d\'Asie en solo avec un budget serré. Specialiste des itineraires hors sentiers battus, elle aide les voyageurs a eviter les pieges classiques et a decouvrir l\'Asie authentique.',
    specialties: ['india', 'nepal', 'sri lanka'],
    email: 'julie@flashvoyage.com',
  },
];

export class AuthorManager {
  constructor() {
    this.state = this._loadState();
  }

  _loadState() {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch {
      return { wpUserIds: {} };
    }
  }

  _saveState() {
    fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
  }

  /**
   * Selectionne l'auteur le plus pertinent pour une destination.
   */
  pickAuthor(destination) {
    const dest = (destination || '').toLowerCase();

    for (const author of AUTHOR_PROFILES) {
      if (author.specialties.some(s => dest.includes(s) || s.includes(dest))) {
        return author;
      }
    }

    // Fallback: Claire (couverture Asie du Sud-Est la plus large)
    return AUTHOR_PROFILES[0];
  }

  /**
   * Cree l'auteur sur WordPress s'il n'existe pas encore.
   * Retourne le WP user ID.
   */
  async ensureAuthorExists(author) {
    // Deja en cache?
    if (this.state.wpUserIds[author.slug]) {
      return this.state.wpUserIds[author.slug];
    }

    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

    // Chercher par slug
    try {
      const search = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/users`, {
        headers,
        params: { slug: author.slug, per_page: 1 },
      });
      if (search.data.length > 0) {
        const wpId = search.data[0].id;
        this.state.wpUserIds[author.slug] = wpId;
        this._saveState();
        console.log(`   👤 Auteur ${author.name} trouve (WP ID ${wpId})`);
        return wpId;
      }
    } catch { /* continue to create */ }

    // Creer l'utilisateur
    try {
      const resp = await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/users`, {
        username: author.slug,
        name: author.name,
        slug: author.slug,
        description: author.bio,
        email: author.email,
        roles: ['author'],
        password: `FV_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      }, { headers });

      const wpId = resp.data.id;
      this.state.wpUserIds[author.slug] = wpId;
      this._saveState();
      console.log(`   👤 Auteur ${author.name} cree (WP ID ${wpId})`);
      return wpId;
    } catch (err) {
      console.warn(`   ⚠️ Creation auteur ${author.name} echouee: ${err.response?.data?.message || err.message}`);
      return null;
    }
  }

  /**
   * Assigne un auteur a un article deja publie.
   */
  async assignAuthor(wpPostId, wpUserId) {
    if (!wpPostId || !wpUserId) return false;

    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

    try {
      await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${wpPostId}`, {
        author: wpUserId,
      }, {
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      });
      return true;
    } catch (err) {
      console.warn(`   ⚠️ Assignation auteur echouee pour post ${wpPostId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Point d'entree: choisit un auteur, le cree si besoin, retourne le WP user ID.
   */
  async getAuthorForArticle(destination) {
    const author = this.pickAuthor(destination);
    console.log(`   👤 Auteur selectionne: ${author.name} (${author.slug})`);
    const wpId = await this.ensureAuthorExists(author);
    return { author, wpId };
  }
}

export default AuthorManager;
