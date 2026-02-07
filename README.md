# 🚀 FlashVoyages Ultra Content Generator

Système d'automatisation de contenu ultra-spécialisé pour le voyage en Asie. Génère et publie automatiquement du contenu de qualité premium sur WordPress.

## 🌏 Fonctionnalités

### ✨ Contenu Ultra-Spécialisé
- **Guides de quartiers** : Spots secrets d'expats, conseils locaux, timing parfait
- **Comparatifs détaillés** : Tests complets d'hôtels, restaurants, transports
- **Guides saisonniers** : Meilleures périodes, événements, conseils météo

### 🤖 Automatisation Complète
- **Publication quotidienne** : Contenu généré et publié automatiquement
- **Images contextuelles** : Sélection intelligente via Pexels API
- **SEO optimisé** : Catégories, tags, meta descriptions automatiques
- **Intégration WordPress** : Publication directe via REST API

### 🎯 Stratégie Éditoriale
- **Ton FlashVoyages** : Proche, complice, malin, expert Asie
- **Structure optimisée** : 300-500 mots, impact maximum
- **Valeur ajoutée** : Conseils d'expats, astuces exclusives
- **Conversion** : CTAs intégrés, liens d'affiliation

## 🛠️ Installation

### Prérequis
- Node.js 18+
- WordPress avec REST API activée
- Compte Pexels (API gratuite)

### Configuration
1. **Cloner le repository**
```bash
git clone https://github.com/votre-username/flashvoyage-ultra-content.git
cd flashvoyage-ultra-content
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement**
```bash
cp .env.example .env
# Éditer .env avec vos credentials
```

4. **Démarrer les services**
```bash
# Développement local
npm run start:all

# Ou individuellement
npm run start:ultra-generator
npm run start:auto-publisher
```

## 🚀 Déploiement Cloud

### GitHub Actions (Recommandé)
1. **Fork ce repository**
2. **Configurer les secrets** dans Settings > Secrets :
   - `WORDPRESS_URL`
   - `WORDPRESS_USERNAME` 
   - `WORDPRESS_APP_PASSWORD`
   - `PEXELS_API_KEY`
   - `OPENAI_API_KEY` (déjà utilisé par la CI pour les tests en mode online)
3. **L'automatisation se lance automatiquement** tous les jours à 9h UTC

### Vercel
```bash
npm i -g vercel
vercel login
vercel --prod
```

### Railway/Render
Configuration automatique via `railway.json` ou `render.yaml`

## 📊 Planification du Contenu

| Jour | Type de Contenu | Destinations |
|------|----------------|--------------|
| Lundi | Guides de quartiers | Tokyo, Bangkok, Séoul |
| Mardi | Comparatifs | Hôtels, Restaurants, Transports |
| Mercredi | Guides saisonniers | Printemps, Été, Automne, Hiver |
| Jeudi | Guides de quartiers | Philippines, Vietnam, Singapour |
| Vendredi | Comparatifs | Vols, Assurances, Guides |
| Samedi | Guides saisonniers | Printemps, Été, Automne, Hiver |
| Dimanche | Guides de quartiers | Tokyo, Bangkok, Séoul |

## 🎨 Types de Contenu

### 1. Guides de Quartiers
- **7 spots secrets** d'expats
- **Timing parfait** pour visiter
- **Budget local vs touristique**
- **Erreurs à éviter**
- **Itinéraire 1 jour**

### 2. Comparatifs
- **5 options testées** en détail
- **Tableau comparatif** complet
- **Recommandation FlashVoyages**
- **Liens d'affiliation** intégrés

### 3. Guides Saisonniers
- **Meilleures périodes** par destination
- **Événements locaux** à ne pas manquer
- **Conseils météo** et équipement
- **Budget saisonnier**

## 🔧 Architecture

```
flashvoyage-ultra-content/
├── ultra-specialized-content-generator.js  # Générateur de contenu
├── fixed-auto-publisher.js                 # Publication automatique
├── .github/workflows/auto-publish.yml      # GitHub Actions
├── api/auto-publish.js                     # API Vercel
├── vercel.json                             # Config Vercel
└── README.md                               # Documentation
```

## 📈 Monitoring

### Logs GitHub Actions
- Accédez à l'onglet "Actions" de votre repository
- Consultez les logs de chaque exécution
- Notifications en cas d'erreur

### Logs Vercel
- Dashboard Vercel > Functions
- Logs en temps réel
- Métriques de performance

## 🎯 Avantages Concurrentiels

### ✅ Contenu Ultra-Spécialisé
- **Conseils d'expats** exclusifs
- **Spots secrets** non-touristiques
- **Timing parfait** pour chaque activité
- **Budget local** vs touristique

### ✅ Automatisation Totale
- **Aucune intervention** manuelle
- **Publication quotidienne** garantie
- **Qualité constante** du contenu
- **SEO optimisé** automatiquement

### ✅ Différenciation
- **Ton unique** FlashVoyages
- **Expertise Asie** approfondie
- **Valeur ajoutée** réelle
- **Conversion** optimisée

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence ISC. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

- **Issues** : [GitHub Issues](https://github.com/votre-username/flashvoyage-ultra-content/issues)
- **Documentation** : [Wiki du projet](https://github.com/votre-username/flashvoyage-ultra-content/wiki)
- **Email** : support@flashvoyage.com

---

**FlashVoyages** - Votre spécialiste du voyage en Asie 🌏✈️

*Généré automatiquement avec ❤️ par FlashVoyages Ultra Content Generator*
