# 🚀 FlashVoyages Ultra Content Generator

## Système de génération de contenu ultra-spécialisé automatisé

### 🎯 Fonctionnalités

- **Génération automatique** de contenu premium
- **3 types de contenu** : Guides de quartier, Comparatifs, Guides saisonniers
- **Images contextuelles** via Pexels
- **Intégration TravelPayouts** prête
- **Publication automatique** sur WordPress

### 📝 Types de contenu

1. **Guides de quartier** : "Tokyo : Shibuya comme un local - 7 spots secrets"
2. **Comparatifs pratiques** : "Bangkok : hôtels - Comparatif complet 5 options testées"
3. **Guides saisonniers** : "Japon en printemps : Guide complet 2024"

### 🚀 Utilisation

#### Démarrage manuel
```bash
# Démarrer le générateur
node ultra-specialized-content-generator.js

# Dans un autre terminal, publier le contenu
node fixed-auto-publisher.js
```

#### Automatisation quotidienne
```bash
# Script complet
./start-daily-content.sh
```

#### Configuration cron (recommandé)
```bash
# Éditer le crontab
crontab -e

# Ajouter cette ligne pour exécuter tous les jours à 9h
0 9 * * * /Users/floriangouloubi/Documents/perso/flashvoyage/start-daily-content.sh
```

### 📅 Planning automatique

- **Lundi** : Guides de quartier (Tokyo, Bangkok, Séoul)
- **Mardi** : Comparatifs (hôtels, restaurants, transports)
- **Mercredi** : Guides saisonniers (printemps, été, automne, hiver)
- **Jeudi** : Guides de quartier (Philippines, Vietnam, Singapour)
- **Vendredi** : Comparatifs (vols, assurances, guides)
- **Samedi** : Guides saisonniers (printemps, été, automne, hiver)
- **Dimanche** : Guides de quartier (Tokyo, Bangkok, Séoul)

### 🔧 Configuration

1. **Variables d'environnement** dans `.env`:
   ```
   WORDPRESS_URL=https://flashvoyage.com/
   WORDPRESS_USERNAME=admin7817
   WORDPRESS_APP_PASSWORD=GjLl 9W0k lKwf LSOT PXur RYGR
   MCP_ULTRA_CONTENT_PORT=3006
   ```

2. **Plugin TravelPayouts** installé sur WordPress

3. **API Pexels** configurée pour les images

### 📊 Résultats

- **Contenu ultra-spécialisé** généré automatiquement
- **Images contextuelles** ajoutées
- **Catégories et tags** optimisés
- **Intégration TravelPayouts** prête
- **SEO optimisé** automatiquement

### 🎯 Prochaines étapes

1. **Configurer cron** pour l'automatisation quotidienne
2. **Optimiser les templates** de contenu
3. **Ajouter plus de destinations** et conseils d'expats
4. **Intégrer TravelPayouts** dans les comparatifs
5. **Analyser les performances** et optimiser

---

**FlashVoyages - Votre spécialiste du voyage en Asie** 🌏✈️
