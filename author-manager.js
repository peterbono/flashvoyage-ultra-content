/**
 * Author Manager — Gere un pool d'auteurs WordPress pour le E-E-A-T.
 *
 * Cree les profils auteur sur WordPress si inexistants, et assigne
 * un auteur a chaque article via rotation round-robin.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, 'data', 'authors.json');

/**
 * Pool d'auteurs avec WordPress IDs pre-enregistres.
 * Rotation round-robin pour varier les signatures.
 */
const AUTHOR_PROFILES = [
  {
    slug: 'claire-moreau',
    name: 'Claire Moreau',
    bio: 'Redactrice en chef, specialisee Asie du Sud-Est. 8 ans d\'experience en redaction voyage. Basee entre Paris et Bangkok.',
    email: 'claire.moreau@flashvoyage.com',
    wpId: 3,
  },
  {
    slug: 'sophie-leclerc',
    name: 'Sophie Leclerc',
    bio: 'Journaliste voyage independante, experte Asie. 5 ans sur le terrain entre Vietnam, Thailande et Indonesie.',
    email: 'sophie.leclerc@flashvoyage.com',
    wpId: 4,
  },
  {
    slug: 'thomas-renard',
    name: 'Thomas Renard',
    bio: 'Reporter terrain, specialiste budget et aventure. Nomade digital depuis 4 ans, bases aux Philippines et en Indonesie.',
    email: 'thomas.renard@flashvoyage.com',
    wpId: 5,
  },
  {
    slug: 'marc-delacroix',
    name: 'Marc Delacroix',
    bio: 'Redacteur senior, expert logistique et transport en Asie. 10 ans d\'experience, ancien guide touristique au Japon.',
    email: 'marc.delacroix@flashvoyage.com',
    wpId: 6,
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
      return { wpUserIds: {}, rotationIndex: 0 };
    }
  }

  _saveState() {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
  }

  /**
   * Selectionne le prochain auteur par rotation round-robin.
   * Avance l'index et persiste l'etat.
   */
  pickAuthor() {
    const index = (this.state.rotationIndex || 0) % AUTHOR_PROFILES.length;
    const author = AUTHOR_PROFILES[index];
    this.state.rotationIndex = index + 1;
    this._saveState();
    return author;
  }

  /**
   * Cree l'auteur sur WordPress s'il n'existe pas encore.
   * Retourne le WP user ID.
   */
  async ensureAuthorExists(author) {
    // ID deja connu dans le profil
    if (author.wpId) {
      return author.wpId;
    }

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
   * Point d'entree: choisit le prochain auteur (round-robin), le cree si besoin,
   * retourne le profil et le WP user ID.
   */
  async getAuthorForArticle(destination) {
    const author = this.pickAuthor();
    console.log(`   👤 Auteur selectionne: ${author.name} (${author.slug}) [round-robin]`);
    const wpId = await this.ensureAuthorExists(author);
    return { author, wpId };
  }
}

export default AuthorManager;
