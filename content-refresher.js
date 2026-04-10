/**
 * Content Refresher — Met a jour les articles existants avec des donnees live fraiches.
 *
 * Responsabilites :
 *   1. Lister les articles WordPress publies
 *   2. Identifier ceux qui n'ont pas ete mis a jour depuis N jours
 *   3. Re-fetcher les donnees live (vols, couts, securite, pays)
 *   4. Remplacer le bloc "Infos pratiques" avec les nouvelles donnees
 *   5. Mettre a jour dateModified dans le schema JSON-LD
 *   6. Injecter/mettre a jour le badge "Mis a jour le ..."
 *   7. Pousser l'update sur WordPress
 */

import axios from 'axios';
import LiveDataEnricher from './live-data-enricher.js';

const DRY_RUN = process.env.FLASHVOYAGE_DRY_RUN === '1' || process.env.FORCE_OFFLINE === '1';

export class ContentRefresher {
  constructor() {
    this.enricher = new LiveDataEnricher();
    this.stats = { checked: 0, refreshed: 0, skipped: 0, errors: 0 };
  }

  /**
   * Recupere les articles WordPress publies.
   */
  async _fetchPublishedArticles(maxPages = 5) {
    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };

    const articles = [];
    for (let page = 1; page <= maxPages; page++) {
      try {
        const resp = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
          headers,
          params: { status: 'publish', per_page: 50, page, _fields: 'id,title,slug,modified,link,content,meta' },
        });
        articles.push(...resp.data);
        const totalPages = parseInt(resp.headers['x-wp-totalpages'] || '1', 10);
        if (page >= totalPages) break;
      } catch (err) {
        if (err.response?.status === 400) break;
        throw err;
      }
    }

    return articles;
  }

  /**
   * Detecte la destination d'un article a partir de son titre/contenu.
   */
  _detectDestination(article) {
    const title = (article.title?.rendered || article.title || '').toLowerCase();
    const content = (article.content?.rendered || article.content || '').toLowerCase().slice(0, 2000);
    const text = title + ' ' + content;

    const destMap = [
      { key: 'japan', iso: 'JP', patterns: ['japon', 'japan', 'tokyo', 'kyoto', 'osaka'] },
      { key: 'thailand', iso: 'TH', patterns: ['thaïlande', 'thailande', 'thailand', 'bangkok', 'chiang mai', 'phuket'] },
      { key: 'vietnam', iso: 'VN', patterns: ['vietnam', 'hanoi', 'ho chi minh', 'saigon', 'da nang'] },
      { key: 'indonesia', iso: 'ID', patterns: ['indonésie', 'indonesie', 'indonesia', 'bali', 'jakarta', 'ubud'] },
      { key: 'korea', iso: 'KR', patterns: ['corée', 'coree', 'korea', 'seoul', 'busan'] },
      { key: 'philippines', iso: 'PH', patterns: ['philippines', 'cebu', 'palawan', 'manila'] },
      { key: 'malaysia', iso: 'MY', patterns: ['malaisie', 'malaysia', 'kuala lumpur', 'penang'] },
      { key: 'cambodia', iso: 'KH', patterns: ['cambodge', 'cambodia', 'siem reap', 'phnom penh'] },
      { key: 'singapore', iso: 'SG', patterns: ['singapour', 'singapore'] },
      { key: 'laos', iso: 'LA', patterns: ['laos', 'luang prabang', 'vientiane'] },
      { key: 'india', iso: 'IN', patterns: ['inde', 'india', 'delhi', 'mumbai', 'goa'] },
      { key: 'nepal', iso: 'NP', patterns: ['népal', 'nepal', 'kathmandu'] },
      { key: 'sri lanka', iso: 'LK', patterns: ['sri lanka', 'colombo'] },
      { key: 'taiwan', iso: 'TW', patterns: ['taïwan', 'taiwan', 'taipei'] },
    ];

    for (const d of destMap) {
      if (d.patterns.some(p => text.includes(p))) {
        return { country: d.key, iso: d.iso, city: d.patterns.find(p => text.includes(p)) || '' };
      }
    }
    return null;
  }

  /**
   * Remplace le bloc "Infos pratiques" existant par un nouveau.
   */
  _replaceLiveDataBlock(html, newBlock) {
    const blockPattern = /<!-- wp:group \{"className":"fv-live-data"\} -->[\s\S]*?<!-- \/wp:group -->/i;
    if (blockPattern.test(html)) {
      return html.replace(blockPattern, newBlock);
    }
    // Fallback : ancien format inline CSS
    const oldPattern = /<div[^>]*class="[^"]*fv-live-data[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?:<\/div>)?/i;
    if (oldPattern.test(html)) {
      return html.replace(oldPattern, newBlock);
    }
    return null;
  }

  /**
   * Injecte ou met a jour le badge "Mis a jour le ..."
   */
  _upsertUpdateBadge(html) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const badge = `<!-- wp:paragraph {"className":"fv-update-badge"} -->\n<p class="fv-update-badge"><em>Mis à jour le ${dateStr}</em></p>\n<!-- /wp:paragraph -->`;

    // Remplacer badge existant
    const existingBadge = /<!-- wp:paragraph \{"className":"fv-update-badge"\} -->[\s\S]*?<!-- \/wp:paragraph -->/i;
    if (existingBadge.test(html)) {
      return html.replace(existingBadge, badge);
    }

    // Inserer apres le premier H2
    const firstH2End = html.indexOf('</h2>');
    if (firstH2End > 0) {
      const insertPos = firstH2End + '</h2>'.length;
      return html.slice(0, insertPos) + '\n' + badge + '\n' + html.slice(insertPos);
    }

    return badge + '\n' + html;
  }

  /**
   * Met a jour le schema JSON-LD dateModified.
   */
  _updateSchemaDate(schemaJson) {
    if (!schemaJson) return null;
    try {
      const schemas = JSON.parse(schemaJson);
      const now = new Date().toISOString();
      for (const s of schemas) {
        if (s['@type'] === 'Article' || s['@type'] === 'WebPage') {
          s.dateModified = now;
        }
      }
      return JSON.stringify(schemas);
    } catch {
      return schemaJson;
    }
  }

  /**
   * Rafraichit un article individuel.
   * @returns {boolean} true si mis a jour
   */
  async refreshArticle(article) {
    const title = article.title?.rendered || article.title || '???';
    const wpId = article.id;
    const modified = new Date(article.modified);
    const ageInDays = Math.floor((Date.now() - modified.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`\n📄 [${wpId}] ${title} (modifie il y a ${ageInDays}j)`);
    this.stats.checked++;

    // Detecter la destination
    const dest = this._detectDestination(article);
    if (!dest) {
      console.log(`   ⏭️  Pas de destination detectee, skip`);
      this.stats.skipped++;
      return false;
    }

    console.log(`   📍 Destination: ${dest.country} (${dest.iso})`);

    // Re-fetcher les donnees live
    const [countryInfo, flight] = await Promise.all([
      this.enricher.fetchCountryInfo(dest.iso),
      this.enricher.fetchFlightPrice(dest.city, dest.iso),
    ]);
    const safety = this.enricher.fetchSafetyScore(dest.iso);
    const cost = this.enricher.fetchCostOfLiving(dest.city, dest.country);

    const liveData = {
      destination: { displayName: dest.country, countryCode: dest.iso },
      safety,
      countryInfo,
      flightPrice: flight,
      costOfLiving: cost,
      fetchedAt: new Date().toISOString(),
    };

    const newBlock = this.enricher.generateHtmlBlock(liveData);
    if (!newBlock) {
      console.log(`   ⏭️  Pas de donnees live recuperees, skip`);
      this.stats.skipped++;
      return false;
    }

    let content = article.content?.rendered || article.content || '';

    // Remplacer le bloc live data
    const updatedContent = this._replaceLiveDataBlock(content, newBlock);
    if (!updatedContent) {
      console.log(`   ⏭️  Pas de bloc Infos pratiques existant, skip`);
      this.stats.skipped++;
      return false;
    }

    // Injecter le badge
    const finalContent = this._upsertUpdateBadge(updatedContent);

    // Mettre a jour le schema
    const existingSchema = article.meta?.fv_schema_json || null;
    const updatedSchema = this._updateSchemaDate(existingSchema);

    // Push sur WordPress
    if (DRY_RUN) {
      console.log(`   🧪 DRY_RUN: mise a jour bloquee`);
      this.stats.refreshed++;
      return true;
    }

    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');

    const updateData = { content: finalContent };
    if (updatedSchema) {
      updateData.meta = { fv_schema_json: updatedSchema };
    }

    await axios.post(`${WORDPRESS_URL}/wp-json/wp/v2/posts/${wpId}`, updateData, {
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    });

    console.log(`   ✅ Article mis a jour sur WordPress`);
    this.stats.refreshed++;
    return true;
  }

  /**
   * Rafraichit tous les articles de +N jours.
   */
  /**
   * Rafraichit plusieurs articles par leurs slugs en sequence.
   * Utilise par le bouton "Refresh selected (N)" du dashboard pour un batch
   * refresh qui tourne dans un SEUL run GitHub Actions (beaucoup plus rapide
   * que N runs sequentiels, ~6 min vs N × 15 min).
   * @param {string[]} slugs
   * @returns {Promise<{ refreshed: number, skipped: number, errors: number }>}
   */
  async refreshBySlugs(slugs) {
    if (!Array.isArray(slugs) || slugs.length === 0) {
      throw new Error('refreshBySlugs: tableau de slugs requis');
    }

    console.log(`🔄 Batch refresh — ${slugs.length} articles\n`);

    let refreshed = 0;
    let skipped = 0;
    let errors = 0;

    for (const slug of slugs) {
      try {
        const ok = await this.refreshBySlug(slug);
        if (ok) refreshed++;
        else skipped++;
      } catch (err) {
        console.error(`   ❌ ${slug}: ${err.message}`);
        errors++;
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log(`📊 Batch résumé:`);
    console.log(`   Rafraîchis: ${refreshed}`);
    console.log(`   Ignorés:    ${skipped}`);
    console.log(`   Erreurs:    ${errors}`);
    console.log('═══════════════════════════════════════════\n');

    return { refreshed, skipped, errors };
  }

  /**
   * Rafraichit un seul article par son slug.
   * Utilise par le bouton "Refresh this" du dashboard pour declencher
   * un refresh ciblé sur un article qui saigne dans la Refresh Queue.
   * @param {string} slug
   * @returns {Promise<boolean>} true si mis a jour
   */
  async refreshBySlug(slug) {
    if (!slug || typeof slug !== 'string') {
      throw new Error('refreshBySlug: slug requis');
    }

    console.log(`🔄 Refresh ciblé — slug: ${slug}\n`);

    const { WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD } = await import('./config.js');
    const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };

    const resp = await axios.get(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
      headers,
      params: { slug, status: 'publish', _fields: 'id,title,slug,modified,link,content,meta' },
    });

    const article = Array.isArray(resp.data) ? resp.data[0] : null;
    if (!article) {
      console.log(`❌ Article introuvable pour slug=${slug}`);
      this.stats.errors++;
      return false;
    }

    try {
      const updated = await this.refreshArticle(article);
      console.log('\n═══════════════════════════════════════════');
      console.log(`📊 Résumé: refresh ${updated ? '✅ reussi' : '⏭️  skip'}`);
      console.log('═══════════════════════════════════════════\n');
      return updated;
    } catch (err) {
      console.error(`❌ Erreur refresh ${slug}: ${err.message}`);
      this.stats.errors++;
      throw err;
    }
  }

  async refreshAll(options = {}) {
    const { minAgeDays = 30, limit = Infinity } = options;

    console.log(`🔄 Content Refresh — articles de +${minAgeDays} jours\n`);

    const articles = await this._fetchPublishedArticles();
    console.log(`📊 ${articles.length} articles publies trouves`);

    const now = Date.now();
    const stale = articles.filter(a => {
      const age = (now - new Date(a.modified).getTime()) / (1000 * 60 * 60 * 24);
      return age >= minAgeDays;
    });

    console.log(`📋 ${stale.length} articles de +${minAgeDays}j a verifier`);

    let refreshed = 0;
    for (const article of stale) {
      if (refreshed >= limit) {
        console.log(`\n🛑 Limite atteinte (${limit})`);
        break;
      }
      try {
        const updated = await this.refreshArticle(article);
        if (updated) refreshed++;
      } catch (err) {
        console.error(`   ❌ Erreur: ${err.message}`);
        this.stats.errors++;
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log(`📊 Résumé:`);
    console.log(`   Vérifiés: ${this.stats.checked}`);
    console.log(`   Rafraîchis: ${this.stats.refreshed}`);
    console.log(`   Ignorés: ${this.stats.skipped}`);
    console.log(`   Erreurs: ${this.stats.errors}`);
    console.log('═══════════════════════════════════════════\n');

    return this.stats;
  }
}

export default ContentRefresher;
