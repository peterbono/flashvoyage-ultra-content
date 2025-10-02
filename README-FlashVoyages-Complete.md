# 🚀 FlashVoyages - Système d'Affiliation Automatisé

Système complet d'automatisation de contenu et d'affiliation pour FlashVoyages.com, un média francophone spécialisé sur le voyage en Asie.

## 🎯 Vision Stratégique

FlashVoyages se positionne comme le **Voyage Pirate de l'Asie** avec :
- **Ton proche et complice** : écrire comme à un ami qui prépare un voyage
- **Expertise Asie** : focus authentique sur l'Asie (vs. global)
- **Chasseur de bons plans** : découvrir avant les concurrents
- **Confiance & expertise** : informations pratiques et rassurantes

## 🏗️ Architecture MCP

### Serveurs MCP Intégrés

1. **WordPress MCP Server** (`wordpress-mcp-server.js`)
   - Gestion complète du contenu WordPress
   - CRUD articles, pages, médias, utilisateurs
   - Intégration API REST native

2. **FlashVoyages Content Generator** (`flashvoyages-content-generator.js`)
   - Génération de contenu selon le ton FlashVoyages
   - Templates pour actualités, guides, bons plans
   - Optimisation SEO automatique

3. **FlashVoyages RSS Monitor** (`flashvoyages-rss-monitor.js`)
   - Surveillance des flux RSS compagnies aériennes
   - Détection des tendances voyage Asie
   - Extraction d'opportunités de deals

4. **FlashVoyages Affiliate Manager** (`flashvoyages-affiliate-manager.js`)
   - Gestion des partenaires d'affiliation
   - Génération de liens contextuels
   - Suivi des performances

5. **FlashVoyages Orchestrator** (`flashvoyages-orchestrator.js`)
   - Orchestration complète du pipeline
   - Automatisation end-to-end
   - Planification éditoriale

## 📊 Structure de Contenu

### Catégories WordPress
- **Actualités** : Flux quotidien d'articles d'actualité
- **Guides Pratiques** : Contenu evergreen SEO
- **Bons Plans** : Deals affiliés avec conversion

### Types d'Articles

#### 1. Actualités (300-500 mots)
```
Titre : ✈️ Paris–Bangkok dès 450€ A/R : Air France lance un vol direct
Structure :
- Intro accrocheuse
- Résumé pratique (prix, dates, conditions)
- Astuce voyageur FlashVoyages
- Contextualisation tendance
- CTA newsletter
```

#### 2. Guides Pratiques (800-1200 mots)
```
Titre : 📋 Guide complet visa Thaïlande 2024
Structure :
- Introduction contextuelle
- Étapes pratiques détaillées
- Conseils FlashVoyages
- Ressources utiles
- CTA conversion
```

#### 3. Bons Plans (400-600 mots)
```
Titre : 🏨 Hôtels Bangkok dès 25€/nuit : Offre limitée
Structure :
- Accroche urgence
- Détails de l'offre
- Liens d'affiliation contextuels
- Justification du bon plan
- CTA action rapide
```

## 🔧 Installation et Configuration

### 1. Prérequis
```bash
# Node.js 18+
node --version

# Dépendances
npm install
```

### 2. Configuration WordPress
```bash
# Copier le template d'environnement
cp env.example .env

# Configurer les identifiants
WORDPRESS_URL=https://flashvoyage.com/
WORDPRESS_USERNAME=admin7817
WORDPRESS_APP_PASSWORD=GjLl 9W0k lKwf LSOT PXur RYGR
```

### 3. Configuration Cursor
Importer `cursor-mcp-config.json` dans Cursor Settings > Features > Model Context Protocol

### 4. Configuration Affiliation
```bash
# Ajouter les IDs d'affiliation dans .env
SKYSCANNER_AFFILIATE_ID=your_id
BOOKING_AFFILIATE_ID=your_id
GETYOURGUIDE_AFFILIATE_ID=your_id
KIWI_AFFILIATE_ID=your_id
AIRBNB_AFFILIATE_ID=your_id
```

## 🚀 Utilisation

### Commandes Disponibles

```bash
# Serveurs individuels
npm run start:content-generator    # Générateur de contenu
npm run start:rss-monitor         # Surveillance RSS
npm run start:affiliate-manager   # Gestion affiliation
npm run start:orchestrator        # Orchestrateur principal

# Tous les serveurs
npm run start:all

# Test WordPress
npm run test:wp
```

### Utilisation dans Cursor

#### 1. Génération de Contenu Automatique
```
Génère un article d'actualité sur les nouveaux vols Paris-Bangkok
```

#### 2. Pipeline Automatisé
```
Lance le pipeline automatisé pour générer 5 articles basés sur les tendances actuelles
```

#### 3. Optimisation SEO
```
Optimise cet article pour les mots-clés "voyage Thaïlande" et "visa Bangkok"
```

#### 4. Gestion d'Affiliation
```
Génère des liens d'affiliation pour un article sur les hôtels de Tokyo
```

## 📈 Pipeline d'Automatisation

### Flux Complet
```
1. Surveillance RSS → Détection tendances
2. Analyse → Scoring et priorisation
3. Génération → Contenu FlashVoyages
4. Optimisation → SEO et affiliation
5. Publication → WordPress automatique
6. Suivi → Analytics et performance
```

### Sources de Données
- **Compagnies aériennes** : Air France, Singapore Airlines, Cathay Pacific
- **Offices de tourisme** : Thaïlande, Japon, Vietnam
- **Sites de deals** : Skyscanner, Kayak, Momondo
- **Gouvernements** : Ambassades, services publics

## 🎨 Personnalisation du Ton

### Règles de Rédaction FlashVoyages

1. **Proche et complice**
   - "Envie de Thaïlande sans escale ?"
   - "On a repéré cette pépite avant tout le monde !"

2. **Malin / Chasseur de bons plans**
   - "Places limitées", "Promo éclair"
   - "Découverte avant les concurrents"

3. **Confiance & expertise**
   - "Voici ce que ça change pour vous"
   - Informations pratiques et rassurantes

4. **Focus Asie**
   - Authenticité + niche
   - Contexte local et culturel

## 📊 Métriques et Performance

### KPIs Principaux
- **Contenu** : Articles publiés/jour, engagement
- **SEO** : Positionnement mots-clés, trafic organique
- **Affiliation** : Clics, conversions, revenus
- **Audience** : Newsletter, partages sociaux

### Tableaux de Bord
- Performance contenu par catégorie
- ROI affiliation par partenaire
- Tendance sujets populaires
- Calendrier éditorial

## 🔄 Maintenance et Évolution

### Tâches Quotidiennes
- Surveillance des flux RSS
- Génération de contenu automatique
- Optimisation des performances

### Tâches Hebdomadaires
- Analyse des tendances
- Ajustement de la stratégie
- Mise à jour des partenaires

### Tâches Mensuelles
- Audit SEO complet
- Analyse ROI affiliation
- Planification éditoriale

## 🛠️ Développement et Personnalisation

### Structure des Fichiers
```
flashvoyage/
├── wordpress-mcp-server.js          # Serveur WordPress
├── flashvoyages-content-generator.js # Générateur de contenu
├── flashvoyages-rss-monitor.js      # Surveillance RSS
├── flashvoyages-affiliate-manager.js # Gestion affiliation
├── flashvoyages-orchestrator.js     # Orchestrateur principal
├── cursor-mcp-config.json           # Configuration Cursor
└── README-FlashVoyages-Complete.md  # Documentation
```

### Personnalisation
- **Templates de contenu** : Modifier les structures d'articles
- **Sources RSS** : Ajouter de nouveaux flux
- **Partenaires affiliation** : Intégrer de nouveaux partenaires
- **Ton éditorial** : Ajuster les règles de rédaction

## 🎯 Objectifs et Résultats Attendus

### Objectifs Quantitatifs
- **10-15 articles/jour** automatiquement générés
- **50% de contenu evergreen** (guides pratiques)
- **30% de contenu actualité** (tendances)
- **20% de bons plans** (conversion)

### Objectifs Qualitatifs
- **Ton FlashVoyages** cohérent sur tous les contenus
- **SEO optimisé** pour les mots-clés Asie
- **Conversion maximisée** via l'affiliation
- **Engagement élevé** de la communauté

## 🚨 Dépannage

### Problèmes Courants
1. **Connexion WordPress** : Vérifier les identifiants API
2. **Flux RSS** : Vérifier la disponibilité des sources
3. **Affiliation** : Vérifier les IDs partenaires
4. **Performance** : Surveiller l'utilisation mémoire

### Logs et Monitoring
- Logs détaillés pour chaque serveur MCP
- Monitoring des performances en temps réel
- Alertes automatiques en cas d'erreur

## 📞 Support

Pour toute question ou personnalisation :
- Documentation complète dans ce README
- Code commenté pour faciliter la maintenance
- Architecture modulaire pour l'évolution

---

**FlashVoyages** - Votre partenaire pour l'automatisation de contenu voyage Asie ! 🌏✈️

