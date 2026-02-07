# 🛠️ UTILITAIRES FLASHVOYAGE

## 📚 **MODULES UTILITAIRES (NON-PIPELINE)**

Ces modules ne font **PAS partie** du pipeline principal de génération d'articles, mais sont utiles pour des tâches spécifiques :

---

### 1. `wordpress-articles-crawler.js`
**Usage** : Crawler tous les articles existants sur WordPress  
**Commande** :
```bash
node wordpress-articles-crawler.js
```
**Sortie** : Met à jour `articles-database.json` avec tous les articles existants  
**Quand l'utiliser** : Pour synchroniser la base locale avec WordPress

---

### 2. `flashvoyages-rss-monitor.js`
**Usage** : Monitoring des flux RSS (Google News, blogs, etc.)  
**Commande** :
```bash
node flashvoyages-rss-monitor.js
```
**Sortie** : Affiche les nouveaux articles disponibles dans les flux  
**Quand l'utiliser** : Pour vérifier manuellement les sources disponibles

---

### 3. `real-stats-scraper.js`
**Usage** : Scraper les statistiques réelles de vols depuis Travelpayouts  
**Commande** :
```bash
node real-stats-scraper.js
```
**Sortie** : Statistiques de prix réels pour les widgets vols  
**Quand l'utiliser** : Pour mettre à jour les données de prix en temps réel

---

### 4. `github-mcp-server.js`
**Usage** : Serveur MCP pour intégration GitHub  
**Commande** :
```bash
node github-mcp-server.js
```
**Quand l'utiliser** : Pour les intégrations automatisées avec GitHub

---

### 5. `wordpress-mcp-server.js`
**Usage** : Serveur MCP pour intégration WordPress  
**Commande** :
```bash
node wordpress-mcp-server.js
```
**Quand l'utiliser** : Pour les intégrations automatisées avec WordPress

---

## 🗑️ **MODULES OBSOLÈTES (RENOMMÉS AVEC _OBSOLETE_)**

Ces modules ont été remplacés et ne doivent **PLUS ÊTRE UTILISÉS** :

1. `_OBSOLETE_content-enhancer.js` → Remplacé par `seo-optimizer.js` + `article-finalizer.js`
2. `_OBSOLETE_ultra-fresh-complete.js` → Remplacé par `enhanced-ultra-generator.js` + `pipeline-runner.js`
3. `_OBSOLETE_semantic-link-analyzer.js` → Remplacé par `seo-optimizer.js` (internal links)
4. `_OBSOLETE_flashvoyages-orchestrator.js` → Remplacé par `enhanced-ultra-generator.js`

**⚠️ Ces fichiers sont conservés pour référence historique mais ne doivent plus être importés.**

---

## 📖 **SCRIPTS DE TEST**

Tous les scripts de test sont dans le dossier `scripts/` :

- **Tests alignment** : `node scripts/test-article-finalizer-alignment.js`
- **Tests anti-invention** : `node scripts/test-article-finalizer-anti-invention.js`
- **Tests anti-hallucination** : `node scripts/test-phase-7.js`
- **Tests SEO** : `node scripts/test-seo-quality-gate.js`
- **Test E2E pipeline** : `node scripts/test-pipeline-quality-gate-offline.js`

**Mode des tests** : Les tests (CI et locaux) s'exécutent en mode **online** par défaut (appels OpenAI). En CI, `OPENAI_API_KEY` est fourni via les secrets GitHub ; en local, le fichier `.env` doit contenir `OPENAI_API_KEY`. Pour forcer le mode offline (fixtures, pas d'API), utiliser `FORCE_OFFLINE=1`.

---

## 🎯 **POINT D'ENTRÉE PRINCIPAL**

Pour générer et publier un article :

```bash
node enhanced-ultra-generator.js
```

Avec DRY_RUN (test sans publication) :

```bash
FLASHVOYAGE_DRY_RUN=1 node enhanced-ultra-generator.js
```

---

## 🔧 **CONFIGURATION**

Toutes les variables d'environnement sont dans `.env` :

```bash
# API Keys
OPENAI_API_KEY=sk-...
WORDPRESS_URL=https://flashvoyage.com
WORDPRESS_USERNAME=...
WORDPRESS_APP_PASSWORD=...
PEXELS_API_KEY=...

# Flags (tous activés par défaut)
ENABLE_AFFILIATE_INJECTOR=1
ENABLE_ANTI_HALLUCINATION_BLOCKING=1
ENABLE_PIPELINE_BLOCKING=1
ENABLE_FINALIZER_BLOCKING=1
ENABLE_ARTICLE_VALIDATION=1

# Modes
FLASHVOYAGE_DRY_RUN=0  # 0=publication réelle, 1=test sans publication
FORCE_OFFLINE=0  # 1=mode offline (pas d'API calls)
```
