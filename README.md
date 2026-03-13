# FlashVoyage Ultra Content — Pipeline éditorial automatisé

Système de génération et publication automatique d'articles de voyage sur WordPress, alimenté par des discussions Reddit et des flux RSS, piloté par un calendrier éditorial stratégique et optimisé par un pipeline LLM multi-étapes avec contrôle qualité intégré.

Depuis la branche `refactor-v2`, le repo intègre un **quality loop multi-agents** de niveau production : pré‑gates déterministes (HTML, maillage, fact‑check, FAQ), panel d’experts LLM (SEO, Affiliation, Éditorial, UX, Intégrité) et CEO virtuel, réécriture contrainte par diff‑guard, puis auto‑fixers programmatiques. L’objectif opérationnel est un score qualité ≥ 85% sur le HTML final, avec une trajectoire progressive vers 90–95% sur les contenus à forte preuve source.

**Site** : [flashvoyage.com](https://flashvoyage.com) | **Jira** : [flashvoyage.atlassian.net](https://flashvoyage.atlassian.net)

## Ce que fait le projet

1. **Scrape Reddit** (r/travel, r/digitalnomad) et **flux RSS** (Skift, CNN Travel, The Points Guy) pour trouver du contenu source
2. **Calendrier éditorial** : cycle de 5 articles (1 pilier + 3 support + 1 news) par cluster géographique, avec timing saisonnier automatique
3. **Analyse sémantique** du post : extraction des destinations, budgets, contraintes, insights communautaires
4. **Génère un article éditorial complet** (2500+ mots) via GPT-4o avec angle unique, preuves sourcées et ton conversationnel
5. **Enrichit avec des données live** : prix vols (Kiwi), coût de la vie (Numbeo), alertes voyage (Travel Advisory), infos pays (REST Countries)
6. **Injecte des widgets d'affiliation TravelPayouts** contextuellement (vols, eSIM, assurance, tours, transferts, location auto, etc.)
7. **Passe l'article à travers 10+ étapes de qualité** : anti-hallucination, SEO, traduction, auto-critique, liens internes, FAQ
8. **Publie sur WordPress** avec image featured, catégories, tags, JSON-LD schema et liens internes
9. **Valide en production** (score qualité ≥ 85%) et corrige automatiquement si nécessaire
10. **Tracking complet** : coûts LLM par article, dashboard WordPress, backlog Jira synchronisé

## Architecture du pipeline

```
Editorial Calendar             (cluster géo + timing saisonnier → directive)
  → Reddit Scraper / RSS Fetcher  (source selon type article)
  → Semantic Extractor         (extraction structurée du post)
  → Pattern Detector           (type de contenu : témoignage, itinéraire, comparaison...)
  → Story Compiler             (narrative, citations, leçons)
  → Angle Hunter               (angle éditorial différenciant)
  → Generator (GPT-4o)         (article HTML complet)
  → Auto-critique (GPT-4o-mini)(correction anomalies)
  → Live Data Enricher         (vols, coût de vie, alertes, infos pays)
  → Affiliate Injector         (placement contextuel des widgets)
  → SEO Optimizer              (liens internes, densité sémantique, JSON-LD)
  → Editorial Enhancer         (FAQ, tableaux comparatifs, checklists)
  → SERP Competitive Enhancer  (E-E-A-T, angles manquants)
  → Article Finalizer          (20+ passes de nettoyage, traduction, QA)
  → Anti-Hallucination Guard   (truth pack + validation LLM par lieu)
  → Content Marketing Pass     (optimisation conversion)
  → Quality Gate               (score ≥ 85% requis pour publication)
  → WordPress Publisher        (REST API + images + JSON-LD meta + validation prod)
  → LLM Cost Tracker           (tokens, coûts, dashboard WordPress)
```

## Widgets TravelPayouts

Le plugin WordPress `wordpress/flashvoyage-widgets.php` gère le shortcode `[fv_widget]` avec 14 types de widgets :

| Type | Partenaire | Commission |
|------|-----------|------------|
| `flights` | Aviasales | 40% |
| `flights_calendar` | Aviasales | 40% |
| `flights_popular` | Aviasales | 40% |
| `flights_map` | Aviasales | 40% |
| `esim` | Airalo | 12% |
| `insurance` | VisitorCoverage | — |
| `insurance_usa` | Insubuy | $1.50-$150/policy |
| `insurance_schengen` | Insubuy | $1.50-$150/policy |
| `transfers` | Kiwitaxi | 9-11% |
| `tours` | Tiqets | 3.5-8% |
| `car_rental` | EconomyBookings | 60% |
| `bikes` | BikesBooking | 4% |
| `flight_compensation` | AirHelp | 15-16.6% |
| `events` | TicketNetwork | 6-12.5% |

## Calendrier éditorial

Le module `editorial-calendar.js` pilote la stratégie de contenu :

- **Cycle de 5 articles** : 1 pilier (2500+ mots) → 3 support → 1 news (actualité RSS)
- **Clusters géographiques** : Asie du Sud-Est, Japon, Europe du Sud, Amérique latine, etc.
- **Timing saisonnier** : chaque cluster a des mois de pic — le calendrier priorise automatiquement
- **État persistant** : `data/editorial-calendar.json` stocke la progression du cycle et l'historique

## Données live

Le module `live-data-enricher.js` injecte un bloc "Infos pratiques" avec des données temps réel :

| Source | Données |
|--------|---------|
| Kiwi Tequila | Prix vols aller-retour depuis Paris |
| Numbeo | Coût de la vie (repas, transport, logement) |
| Travel Advisory | Niveau d'alerte sécuritaire du pays |
| REST Countries | Devise, fuseau horaire, langues officielles |

## Gestion de projet — Jira

Le backlog est géré sur [flashvoyage.atlassian.net](https://flashvoyage.atlassian.net) (projet **FV**, Kanban).

| Epic | Statut |
|------|--------|
| Phase 1 — Données Live + Schema Markup | Terminé |
| Phase 2 — RSS Signal + Cross-Reference Reddit | Terminé |
| Phase 3 — Programmatic SEO Long-Tail | Backlog |
| Phase 4 — Content Freshness Loop | Backlog |
| Phase 5 — E-E-A-T + Niche Francophone | Backlog |
| Calendrier Éditorial (clusters + timing) | Terminé |
| Qualité contenu — Audit post-publication | Terminé |

43 tickets au total, synchronisés via l'API Jira.

## LLM Cost Tracking

Chaque appel OpenAI est tracké (modèle, tokens in/out, coût USD, étape pipeline, durée). Les données sont :
- Affichées en console après chaque run
- Persistées dans `data/cost-history.jsonl`
- Visualisées sur un dashboard WordPress privé (auto-refresh après publication)
- Projection mensuelle basée sur le calendrier éditorial (30 articles/mois)
- Suivi séparé des coûts LLM de développement (`data/dev-llm-cost.jsonl`)

Coût moyen par article : **~$0.15** (24 appels LLM, ~60k tokens).

## Commandes

```bash
# Générer et publier un article
npm run publish:article

# Mettre à jour le dashboard des coûts LLM
node scripts/publish-cost-dashboard.js

# Publier la page de test des widgets
node scripts/publish-test-widgets-page.js
```

## Structure des fichiers principaux

```
├── enhanced-ultra-generator.js        # Point d'entrée pipeline + publication
├── pipeline-runner.js                 # Orchestrateur des étapes
├── pipeline-report.js                 # Rapport structuré par étape
├── config.js                          # Variables d'env et feature flags
├── editorial-calendar.js              # Calendrier éditorial (clusters + saisonnalité)
│
├── intelligent-content-analyzer-optimized.js  # Générateur LLM (GPT-4o)
├── reddit-semantic-extractor.js       # Extraction sémantique Reddit
├── reddit-pattern-detector.js         # Détection du type de contenu
├── reddit-story-compiler.js           # Compilation narrative
├── angle-hunter.js                    # Recherche d'angle éditorial
├── rss-signal-fetcher.js              # Fetcher multi-source RSS
│
├── article-finalizer.js               # 20+ passes QA/nettoyage/traduction
├── editorial-enhancer.js              # FAQ, tableaux, checklists (GPT-4o-mini)
├── editorial-authority-booster.js     # Renforcement E-E-A-T
├── content-marketing-pass.js          # Optimisation conversion (GPT-4o-mini)
├── seo-optimizer.js                   # Liens internes, JSON-LD, densité sémantique
├── live-data-enricher.js              # Données temps réel (vols, coûts, alertes)
├── quality-analyzer.js                # Scoring qualité (seuil 85%)
│
├── contextual-affiliate-injector.js   # Décision des placements affiliés
├── affiliate-module-renderer.js       # Rendu HTML des modules affiliés
├── contextual-widget-placer-v2.js     # Placement intelligent dans le HTML
├── travelpayouts-real-widgets-database.js  # Base des widgets partenaires
│
├── src/anti-hallucination/
│   ├── anti-hallucination-guard.js    # Validation anti-hallucination
│   ├── truth-pack.js                  # Construction du pack de vérité
│   └── html-segmentation.js           # Segmentation HTML pour analyse
│
├── llm-cost-tracker.js                # Tracking coûts LLM (singleton)
├── openai-client.js                   # Client OpenAI centralisé
│
├── wordpress/
│   └── flashvoyage-widgets.php        # Plugin WP (shortcodes, JSON-LD, post meta)
│
├── scripts/
│   ├── publish-cost-dashboard.js      # Dashboard coûts sur WordPress
│   └── publish-test-widgets-page.js   # Page test widgets
│
└── data/
    ├── cost-history.jsonl             # Historique coûts par article
    ├── dev-llm-cost.jsonl             # Coûts LLM développement
    ├── editorial-calendar.json        # État du calendrier éditorial
    ├── internal-links.json            # Index liens internes
    └── live-cache/                    # Cache données live (vols, pays)
```

## Variables d'environnement

| Variable | Description |
|----------|------------|
| `OPENAI_API_KEY` | Clé API OpenAI (GPT-4o + GPT-4o-mini) |
| `WORDPRESS_URL` | URL du site WordPress |
| `WORDPRESS_USERNAME` | Identifiant WordPress |
| `WORDPRESS_APP_PASSWORD` | App Password WordPress |
| `PEXELS_API_KEY` | API Pexels (images featured + inline) |
| `REDDIT_CLIENT_ID` | OAuth Reddit |
| `REDDIT_CLIENT_SECRET` | OAuth Reddit |
| `TRAVELPAYOUTS_API_TOKEN` | API TravelPayouts |
| `JIRA_API_KEY` | Token API Atlassian (Jira Cloud) |
| `JIRA_DOMAIN` | URL instance Jira (`https://flashvoyage.atlassian.net`) |

### Feature flags

| Flag | Défaut | Description |
|------|--------|------------|
| `FLASHVOYAGE_DRY_RUN` | `0` | Mode test sans publication |
| `FORCE_OFFLINE` | `0` | Bloque tous les appels LLM |
| `ENABLE_AFFILIATE_INJECTOR` | `1` | Injection widgets affiliés |
| `ENABLE_ANTI_HALLUCINATION_BLOCKING` | `1` | Blocage anti-hallucination |
| `ENABLE_MARKETING_PASS` | `1` | Passe content marketing |
| `ENABLE_INLINE_IMAGES` | `1` | Images contextuelles inline |

## Qualité éditoriale

Chaque article est évalué sur 10 KPIs avant publication :

- **K1** — Hook narratif en intro (tension/curiosité)
- **K2** — H2 décisionnels ≥ 80% (pas de H2 descriptifs)
- **K3** — Preuves sourcées ≥ 2 (citations Reddit attribuées)
- **K4** — Décisions concrètes ≥ 2 (verdicts, arbitrages)
- **K5** — CTA friction (module affilié précédé de contexte)
- **K6** — Zéro invention (truth pack validation)
- **K7** — Liens internes ≥ 3
- **K8** — Score qualité global ≥ 85%
- **K9** — Sections SERP (budget, timeline, contraintes)
- **K10** — Quick Guide présent

## Schema JSON-LD

Chaque article publie automatiquement 4 schemas structures via post meta WordPress (`fv_schema_json`) :

- **Article** — titre, auteur, date, description, image
- **FAQPage** — questions/reponses generees par le pipeline
- **BreadcrumbList** — fil d'Ariane semantique
- **TravelAction** — destination, dates, intention de voyage

Les schemas sont injectes dans le `<head>` via un hook `wp_head` (pas dans le body).

---

**FlashVoyage** — flashvoyage.com
