# Session Cursor — 23 fevrier 2026

## Travail effectue aujourd'hui

### 1. Fix detectRenderedWidgets (commit 31120f9)
- `detectRenderedWidgets` ne detectait que 3 types de widgets (flights, esim, insurance)
- Ajout de 6 types manquants : tours, transfers, car_rental, bikes, flight_compensation, events
- Le pipeline echouait avec "Widgets insuffisants: 0 rendu(s)" pour les articles avec widget tours

### 2. LLM Cost Tracker (commit 0b18903)
- Creation de `llm-cost-tracker.js` — module singleton qui track tous les appels LLM
- Instrumentation de 8 fichiers : openai-client.js, intelligent-content-analyzer-optimized.js, article-finalizer.js, editorial-enhancer.js, content-marketing-pass.js, pipeline-runner.js, anti-hallucination-guard.js, enhanced-ultra-generator.js
- Grille tarifaire : gpt-4o ($2.50/$10 per 1M tokens), gpt-4o-mini ($0.15/$0.60)
- Historique persistant dans `data/cost-history.jsonl`
- Print summary en fin de pipeline

### 3. Dashboard WordPress Cost Tracker (commit 0b18903 + 3bb7005)
- Script `scripts/publish-cost-dashboard.js` — genere une page HTML avec 4 graphiques Chart.js
- Page privee WordPress (page_id=2988) : https://flashvoyage.com/?page_id=2988
- Auto-refresh du dashboard apres chaque publication d'article
- KPIs : cout moyen, cout total, repartition par etape et modele

### 4. Publication de 2 articles
- "Choisir Entre Taipei et Kuala Lumpur" (avant fix widgets — echoue, puis reussi apres fix)
- "Comment decouvrir l'Indonesie authentique" — $0.1476, 24 appels LLM, 6.4 min

### 5. README mis a jour (commit 27b5de6)
- README.md reecrit pour refleter l'etat reel du projet

### 6. Merge refactor-v2 -> legacy (PR #2 mergee)

### 7. Recherche sources RSS gratuites
Sources testees et fonctionnelles :
- Travel Off Path (traveloffpath.com/feed/) — alertes visa, advisories
- View from the Wing (viewfromthewing.com/feed/) — disruptions aeriennes
- Simple Flying (simpleflying.com/feed/) — news aviation
- Nomadic Matt (nomadicmatt.com/travel-blog/feed/) — guides

Sources bloquees (Cloudflare/404) : schengenvisainfo, secretflying, visaguide, travelpulse, lonelyplanet, tourmag, skift

### 8. Strategie de differenciation — Analyse expert
Decision : RSS comme SIGNAL (pas comme source directe) cross-reference avec Reddit pour eviter le contenu generique.

Vrais moats identifies :
1. Donnees live proprietaires (prix vols, cout de vie, securite)
2. Programmatic SEO long-tail (pages ciblees haute intention)
3. Content freshness loop (auto-update des donnees)
4. Niche francophone (visas FR/BE/CH, prix EUR, aeroports francophones)
5. E-E-A-T signals (pages auteur, schema markup)

## Plan SMART en cours (non demarre)

### PHASE 1 — Donnees Live + Schema Markup (semaine 1)
- Creer `live-data-enricher.js` (APIs: Kiwi Tequila, Numbeo, Travel Advisory, REST Countries)
- Ajouter schema JSON-LD dans `seo-optimizer.js` (Article, FAQPage, BreadcrumbList, TravelAction)

### PHASE 2 — RSS Signal + Cross-Ref Reddit (semaine 2)
- Creer `rss-signal-fetcher.js` (4 feeds RSS + cross-ref Reddit)
- Modifier `enhanced-ultra-generator.js` et `editorial-router.js`

### PHASE 3 — Programmatic SEO Long-Tail (semaines 3-4)
- Creer `programmatic-seo-generator.js` + templates + matrice
- Volume cible : 50-100 pages initial, 10-20/semaine ensuite
- Cout quasi nul (~$0.001/page)

### PHASE 4 — Content Freshness Loop (semaine 5)
- Creer `content-refresher.js` — re-fetch donnees live, update articles >30j
- Zero cout LLM

### PHASE 5 — E-E-A-T + Niche Francophone (semaine 6)
- Pages auteur WordPress
- Niche down prompts LLM (voyageur francophone)
- Hreflang + sitemap XML

## Point en cours (a reprendre)

- **Jira** : l'utilisateur a regenere ses cles API Jira (secrets codespace). Objectif : creer des tickets Kanban + roadmap dans Jira (flashvoyage.atlassian.net) pour suivre l'avancement des 5 phases.
- Variables necessaires : `JIRA_API_KEY`, `JIRA_CLIENT_ID`, `JIRA_DOMAIN`
- Probleme precedent : caractere Unicode parasite en fin de JIRA_API_KEY + email Atlassian inconnu (401 sur toutes les tentatives)
- A FAIRE au restart : re-tester l'auth Jira avec les nouvelles cles + demander l'email Atlassian si besoin

## Jira — Projet FV cree

**URL Board** : https://flashvoyage.atlassian.net/jira/software/projects/FV/boards
**Auth** : floriangouloubi@gmail.com + JIRA_API_KEY (secret codespace)
**API endpoint** : POST /rest/api/3/issue (new search: /rest/api/3/search/jql)

### Tickets crees (28 total)

| Ticket | Type | Phase | Description |
|--------|------|-------|-------------|
| FV-1 | Epic | 1 | Donnees Live + Schema Markup |
| FV-2 | Epic | 2 | RSS Signal + Cross-Reference Reddit |
| FV-3 | Epic | 3 | Programmatic SEO Long-Tail |
| FV-4 | Epic | 4 | Content Freshness Loop |
| FV-5 | Epic | 5 | E-E-A-T + Niche Francophone |
| FV-6 to FV-12 | Taches | 1 | 7 taches sous FV-1 |
| FV-13 to FV-17 | Taches | 2 | 5 taches sous FV-2 |
| FV-18 to FV-22 | Taches | 3 | 5 taches sous FV-3 |
| FV-23 to FV-25 | Taches | 4 | 3 taches sous FV-4 |
| FV-26 to FV-28 | Taches | 5 | 3 taches sous FV-5 |

Note : l'ancienne API /rest/api/3/search est deprecee, utiliser /rest/api/3/search/jql

## Fichiers cles modifies/crees aujourd'hui
- `llm-cost-tracker.js` (cree)
- `scripts/publish-cost-dashboard.js` (cree)
- `openai-client.js` (modifie — tracking)
- `intelligent-content-analyzer-optimized.js` (modifie — tracking)
- `article-finalizer.js` (modifie — tracking + detectRenderedWidgets)
- `editorial-enhancer.js` (modifie — tracking)
- `content-marketing-pass.js` (modifie — tracking)
- `pipeline-runner.js` (modifie — tracking)
- `anti-hallucination-guard.js` (modifie — tracking)
- `enhanced-ultra-generator.js` (modifie — tracker init/print/save + dashboard auto-refresh)
- `README.md` (reecrit)
- `data/cost-history.jsonl` (cree — 1 entree)
