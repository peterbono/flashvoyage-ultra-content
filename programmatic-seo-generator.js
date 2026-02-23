/**
 * Programmatic SEO Generator — Genere et publie des pages SEO long-tail
 * a partir de la matrice destinations x templates.
 *
 * Usage:
 *   import { ProgrammaticSeoGenerator } from './programmatic-seo-generator.js';
 *   const gen = new ProgrammaticSeoGenerator();
 *   await gen.generatePage('vols', 'japan');   // une page
 *   await gen.generateAll();                   // toutes les pages manquantes
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { SEO_TEMPLATES } from './seo-templates.js';
import LiveDataEnricher from './live-data-enricher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATRIX_PATH = path.join(__dirname, 'data', 'seo-matrix.json');
const LINKS_PATH = path.join(__dirname, 'data', 'internal-links.json');

const DRY_RUN = process.env.FLASHVOYAGE_DRY_RUN === '1' || process.env.FORCE_OFFLINE === '1';

export class ProgrammaticSeoGenerator {
  constructor() {
    this.matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf-8'));
    this.enricher = new LiveDataEnricher();
  }

  _saveMatrix() {
    fs.writeFileSync(MATRIX_PATH, JSON.stringify(this.matrix, null, 2));
  }

  _trackerKey(templateId, countryKey) {
    return `${templateId}__${countryKey}`;
  }

  isAlreadyPublished(templateId, countryKey) {
    return !!this.matrix.pageTracker[this._trackerKey(templateId, countryKey)];
  }

  /**
   * Collecte les donnees live pour une destination.
   */
  async _fetchLiveData(dest) {
    const iso = dest.iso;
    const city = (dest.cities && dest.cities[0]) || '';

    const [countryInfo, flight] = await Promise.all([
      this.enricher.fetchCountryInfo(iso),
      this.enricher.fetchFlightPrice(city, iso),
    ]);

    const safety = this.enricher.fetchSafetyScore(iso);
    const cost = this.enricher.fetchCostOfLiving(city.toLowerCase(), dest.country);

    return { flight, cost, safety, countryInfo };
  }

  /**
   * Genere et publie une page SEO pour un template + destination.
   * @returns {{ slug, wpId, url }} ou null si deja publiee
   */
  async generatePage(templateId, countryKey, options = {}) {
    const { force = false } = options;

    if (!force && this.isAlreadyPublished(templateId, countryKey)) {
      console.log(`⏭️  ${templateId}/${countryKey} — deja publiee, skip`);
      return null;
    }

    const templateFn = SEO_TEMPLATES[templateId];
    if (!templateFn) throw new Error(`Template inconnu: ${templateId}`);

    const dest = this.matrix.destinations.find(d => d.country === countryKey);
    if (!dest) throw new Error(`Destination inconnue: ${countryKey}`);

    console.log(`\n🔧 Génération SEO: ${templateId} × ${dest.displayName}...`);

    // 1. Donnees live
    const liveData = await this._fetchLiveData(dest);

    // 2. Appliquer le template
    const page = templateFn(dest, liveData);
    console.log(`   📄 Titre: ${page.title}`);
    console.log(`   🔗 Slug: ${page.slug}`);

    // 3. Publier sur WordPress
    const result = await this._publishToWordPress(page);

    // 4. Tracker
    this.matrix.pageTracker[this._trackerKey(templateId, countryKey)] = {
      wpId: result.id,
      url: result.url,
      slug: page.slug,
      publishedAt: new Date().toISOString(),
    };
    this._saveMatrix();

    // 5. Enregistrer dans internal-links pour le maillage
    this._registerInternalLink(page, result, dest, templateId);

    // 6. Transitionner le ticket Jira PUB correspondant
    await this._transitionJiraTicket(templateId, dest);

    console.log(`   ✅ Publiee: ${result.url}`);
    return { slug: page.slug, wpId: result.id, url: result.url };
  }

  /**
   * Genere toutes les pages manquantes (matrice complete).
   */
  async generateAll(options = {}) {
    const { templates, destinations, force = false, limit = Infinity } = options;

    const tplList = templates || this.matrix.templates;
    const destList = destinations
      ? this.matrix.destinations.filter(d => destinations.includes(d.country))
      : this.matrix.destinations;

    let count = 0;
    const results = [];

    for (const tplId of tplList) {
      for (const dest of destList) {
        if (count >= limit) {
          console.log(`\n🛑 Limite atteinte (${limit} pages)`);
          return results;
        }
        try {
          const r = await this.generatePage(tplId, dest.country, { force });
          if (r) {
            results.push(r);
            count++;
          }
        } catch (err) {
          console.error(`   ❌ Erreur ${tplId}/${dest.country}: ${err.message}`);
        }
      }
    }

    console.log(`\n📊 Résumé: ${count} page(s) générée(s) / ${tplList.length * destList.length} combinaisons`);
    return results;
  }

  /**
   * Publication WordPress (page, pas article).
   */
  async _publishToWordPress(page) {
    if (DRY_RUN) {
      console.log(`   🧪 DRY_RUN: publication bloquee`);
      return { id: null, url: `https://flashvoyage.com/${page.slug}/` };
    }

    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

    // Chercher si une page avec ce slug existe deja (pour update)
    let existingId = null;
    try {
      const search = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/pages?slug=${page.slug}&status=publish,draft`, {
        headers: { Authorization: `Basic ${auth}` }
      });
      if (search.data.length > 0) {
        existingId = search.data[0].id;
        console.log(`   🔄 Page existante trouvee (ID ${existingId}), mise a jour...`);
      }
    } catch { /* ignore */ }

    const wpData = {
      title: page.title,
      content: page.content,
      status: 'publish',
      excerpt: page.excerpt,
      slug: page.slug,
      meta: {
        description: page.metaDescription,
      },
    };

    if (page.schema?.length > 0) {
      wpData.meta.fv_schema_json = JSON.stringify(page.schema);
    }

    const endpoint = existingId
      ? `${WORDPRESS_URL}/wp-json/wp/v2/pages/${existingId}`
      : `${WORDPRESS_URL}/wp-json/wp/v2/pages`;

    const method = existingId ? 'put' : 'post';

    const response = await axios[method](endpoint, wpData, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });

    return { id: response.data.id, url: response.data.link };
  }

  /**
   * Enregistre la page dans internal-links.json pour le maillage.
   */
  _registerInternalLink(page, result, dest, templateId) {
    try {
      const linksData = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf-8'));
      const articles = linksData.articles || [];

      const destKeywords = [
        dest.displayName.toLowerCase(),
        dest.country,
        ...(dest.cities || []).map(c => c.toLowerCase()),
      ];

      const templateKeywords = {
        vols: ['vol', 'avion', 'billet', 'compagnie', 'aeroport'],
        budget: ['budget', 'prix', 'cout', 'argent', 'depenses'],
        visa: ['visa', 'passeport', 'formalites', 'entree', 'douane'],
        esim: ['esim', 'sim', 'internet', 'data', 'mobile', 'roaming'],
      };

      const entry = {
        id: result.id,
        slug: page.slug,
        title: page.title,
        url: result.url || `https://flashvoyage.com/${page.slug}/`,
        category: 'seo-page',
        keywords: [...destKeywords, ...(templateKeywords[templateId] || [])],
        excerpt: page.metaDescription,
        destination: dest.displayName,
        templateId,
      };

      const existingIdx = articles.findIndex(a => a.slug === page.slug);
      if (existingIdx >= 0) {
        articles[existingIdx] = entry;
      } else {
        articles.push(entry);
      }

      linksData.articles = articles;
      fs.writeFileSync(LINKS_PATH, JSON.stringify(linksData, null, 2));
    } catch (err) {
      console.warn(`   ⚠️ internal-links update failed: ${err.message}`);
    }
  }

  /**
   * Transitionne le ticket Jira PUB correspondant a "Termine" apres publication.
   */
  async _transitionJiraTicket(templateId, dest) {
    try {
      const jiraDomain = process.env.JIRA_DOMAIN?.replace(/\/+$/, '');
      const jiraKey = process.env.JIRA_API_KEY;
      if (!jiraDomain || !jiraKey) return;

      const cleanKey = jiraKey.replace(/[^\x20-\x7E]/g, '').trim();
      const auth = Buffer.from(`floriangouloubi@gmail.com:${cleanKey}`).toString('base64');

      const summaryPrefix = this._jiraSummaryPrefix(templateId, dest);
      if (!summaryPrefix) return;

      // Chercher le ticket PUB par summary
      const jql = encodeURIComponent(`project=PUB AND summary~"${summaryPrefix}" AND status!="Terminé(e)"`);
      const searchResp = await axios.get(
        `${jiraDomain}/rest/api/3/search/jql?jql=${jql}&maxResults=1&fields=key,status`,
        { headers: { Authorization: `Basic ${auth}` } }
      );

      const issues = searchResp.data?.issues || [];
      if (issues.length === 0) return;

      const issueKey = issues[0].key || issues[0].fields?.key;
      if (!issueKey) return;

      // Transition "Termine" (id=21)
      await axios.post(
        `${jiraDomain}/rest/api/3/issue/${issueKey}/transitions`,
        { transition: { id: '21' } },
        { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' } }
      );

      console.log(`   🎫 Jira ${issueKey} → Terminé`);
    } catch (err) {
      console.warn(`   ⚠️ Jira transition failed: ${err.message}`);
    }
  }

  _jiraSummaryPrefix(templateId, dest) {
    const name = dest.displayName;
    const map = {
      vols: `SEO — Vol Paris ${name}`,
      budget: `SEO — Budget voyage ${name}`,
      visa: `SEO — Visa ${name}`,
      esim: `SEO — eSIM ${name}`,
    };
    return map[templateId] || null;
  }

  /**
   * Affiche le statut de la matrice (publiees / manquantes).
   */
  status() {
    const tpls = this.matrix.templates;
    const dests = this.matrix.destinations;
    let published = 0;
    let missing = 0;

    console.log('\n📊 Matrice SEO programmatique:\n');
    const header = ['Destination', ...tpls].map(s => s.padEnd(14)).join(' | ');
    console.log(header);
    console.log('-'.repeat(header.length));

    for (const dest of dests) {
      const cells = [dest.displayName.padEnd(14)];
      for (const tpl of tpls) {
        const key = this._trackerKey(tpl, dest.country);
        if (this.matrix.pageTracker[key]) {
          cells.push('✅'.padEnd(13));
          published++;
        } else {
          cells.push('—'.padEnd(14));
          missing++;
        }
      }
      console.log(cells.join(' | '));
    }

    console.log(`\n  Total: ${published} publiées, ${missing} manquantes (${tpls.length * dests.length} combinaisons)`);
    return { published, missing, total: tpls.length * dests.length };
  }
}

export default ProgrammaticSeoGenerator;
