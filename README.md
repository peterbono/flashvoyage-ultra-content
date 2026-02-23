# FlashVoyage Ultra Content — Pipeline éditorial automatisé

Système de génération et publication automatique d'articles de voyage sur WordPress, alimenté par des discussions Reddit et optimisé par un pipeline LLM multi-étapes avec contrôle qualité intégré.

**Site** : [flashvoyage.com](https://flashvoyage.com)

## Ce que fait le projet

1. **Scrape Reddit** (r/travel, r/digitalnomad) pour trouver des discussions authentiques sur le voyage en Asie
2. **Analyse sémantique** du post : extraction des destinations, budgets, contraintes, insights communautaires
3. **Génère un article éditorial complet** (2500+ mots) via GPT-4o avec angle unique, preuves sourcées et ton conversationnel
4. **Injecte des widgets d'affiliation TravelPayouts** contextuellement (vols, eSIM, assurance, tours, transferts, location auto, etc.)
5. **Passe l'article à travers 10+ étapes de qualité** : anti-hallucination, SEO, traduction, auto-critique, liens internes, FAQ
6. **Publie sur WordPress** avec image featured, catégories, tags et liens internes
7. **Valide en production** (score qualité ≥ 85%) et corrige automatiquement si nécessaire

## Architecture du pipeline

```
Reddit Scraper
  → Semantic Extractor         (extraction structurée du post)
  → Pattern Detector           (type de contenu : témoignage, itinéraire, comparaison...)
  → Story Compiler             (narrative, citations, leçons)
  → Angle Hunter               (angle éditorial différenciant)
  → Generator (GPT-4o)         (article HTML complet)
  → Auto-critique (GPT-4o-mini)(correction anomalies)
  → Affiliate Injector         (placement contextuel des widgets)
  → SEO Optimizer              (liens internes, densité sémantique)
  → Editorial Enhancer         (FAQ, tableaux comparatifs, checklists)
  → SERP Competitive Enhancer  (E-E-A-T, angles manquants)
  → Article Finalizer          (20+ passes de nettoyage, traduction, QA)
  → Anti-Hallucination Guard   (truth pack + validation LLM par lieu)
  → Content Marketing Pass     (optimisation conversion)
  → Quality Gate               (score ≥ 85% requis pour publication)
  → WordPress Publisher        (REST API + images + validation prod)
  → LLM Cost Tracker           (tokens, coûts, dashboard)
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

## LLM Cost Tracking

Chaque appel OpenAI est tracké (modèle, tokens in/out, coût USD, étape pipeline, durée). Les données sont :
- Affichées en console après chaque run
- Persistées dans `data/cost-history.jsonl`
- Visualisées sur un dashboard WordPress privé (auto-refresh après publication)

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
│
├── intelligent-content-analyzer-optimized.js  # Générateur LLM (GPT-4o)
├── reddit-semantic-extractor.js       # Extraction sémantique Reddit
├── reddit-pattern-detector.js         # Détection du type de contenu
├── reddit-story-compiler.js           # Compilation narrative
├── angle-hunter.js                    # Recherche d'angle éditorial
│
├── article-finalizer.js               # 20+ passes QA/nettoyage/traduction
├── editorial-enhancer.js              # FAQ, tableaux, checklists (GPT-4o-mini)
├── editorial-authority-booster.js     # Renforcement E-E-A-T
├── content-marketing-pass.js          # Optimisation conversion (GPT-4o-mini)
├── seo-optimizer.js                   # Liens internes, densité sémantique
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
│   └── flashvoyage-widgets.php        # Plugin WP shortcodes [fv_widget]
│
├── scripts/
│   ├── publish-cost-dashboard.js      # Dashboard coûts sur WordPress
│   └── publish-test-widgets-page.js   # Page test widgets
│
└── data/
    ├── cost-history.jsonl             # Historique coûts par article
    └── internal-links.json            # Index liens internes
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

---

**FlashVoyage** — flashvoyage.com
