# 🛫 Guide des APIs de Données de Vols

## 🎯 **APIs Configurées (par ordre de priorité)**

### 1. **Amadeus API** (Principal)
- **Quota :** 2000 requêtes/mois
- **Coût :** Gratuit
- **Données :** Prix, horaires, compagnies, durées
- **Inscription :** https://developers.amadeus.com/
- **Clés nécessaires :** `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`

### 2. **Skyscanner API** (Backup 1)
- **Quota :** 1000 requêtes/mois
- **Coût :** Gratuit
- **Données :** Prix, inspiration, destinations
- **Inscription :** https://rapidapi.com/skyscanner/api/skyscanner-flight-search
- **Clé nécessaire :** `SKYSCANNER_API_KEY`

### 3. **Kiwi.com API** (Backup 2)
- **Quota :** 100 requêtes/mois
- **Coût :** Gratuit
- **Données :** Prix, routes, compagnies
- **Inscription :** https://tequila.kiwi.com/portal/login
- **Clé nécessaire :** `KIWI_API_KEY`

## 🚀 **Comment obtenir les clés API**

### **Amadeus API (Recommandé)**
1. Aller sur https://developers.amadeus.com/
2. Créer un compte gratuit
3. Créer une nouvelle application
4. Récupérer `Client ID` et `Client Secret`
5. Ajouter dans `.env` :
   ```
   AMADEUS_CLIENT_ID="votre_client_id"
   AMADEUS_CLIENT_SECRET="votre_client_secret"
   ```

### **Skyscanner API**
1. Aller sur https://rapidapi.com/skyscanner/api/skyscanner-flight-search
2. S'inscrire sur RapidAPI
3. S'abonner au plan gratuit
4. Récupérer la clé API
5. Ajouter dans `.env` :
   ```
   SKYSCANNER_API_KEY="votre_rapidapi_key"
   ```

### **Kiwi.com API**
1. Aller sur https://tequila.kiwi.com/portal/login
2. Créer un compte gratuit
3. Générer une clé API
4. Ajouter dans `.env` :
   ```
   KIWI_API_KEY="votre_kiwi_key"
   ```

## ⚡ **Fonctionnalités du système**

### **Fallback Automatique**
- Si Amadeus est indisponible → Skyscanner
- Si Skyscanner est indisponible → Kiwi.com
- Si toutes les APIs sont down → Message d'erreur gracieux

### **Cache Intelligent**
- **Prix de vols :** 1 heure
- **Données d'inspiration :** 24 heures
- **Données d'aéroports :** 7 jours

### **Monitoring des Quotas**
- Suivi en temps réel des requêtes utilisées
- Alertes quand quota atteint
- Switch automatique vers l'API suivante

## 📊 **Données Récupérées**

### **Pour chaque vol :**
- Prix (minimum, maximum, moyen)
- Durée du trajet
- Nombre d'escales
- Compagnie aérienne
- Aéroports de départ/arrivée
- Horaires de départ/arrivée

### **Destinations Supportées :**
- Chine (Pékin)
- Japon (Tokyo)
- Corée du Sud (Séoul)
- Vietnam (Ho Chi Minh)
- Thaïlande (Bangkok)
- Singapour
- Malaisie (Kuala Lumpur)
- Indonésie (Jakarta)
- Philippines (Manille)
- Taïwan (Taipei)
- Hong Kong

## 🔧 **Note**

⚠️ Ce guide documente un système d'APIs qui n'est plus utilisé.

Le système actuel utilise `real-stats-scraper.js` qui :
- Scrape Google Flights et Kayak en priorité
- Utilise des données publiques en fallback
- Ne dépend plus des APIs Amadeus/Skyscanner/Kiwi

## 🎯 **Avantages pour FlashVoyages**

- **Données réelles** au lieu de données simulées
- **Prix actuels** des billets d'avion
- **Analyses précises** des économies potentielles
- **Recommandations basées sur les faits**
- **Crédibilité maximale** comme The Points Guy

## 🚨 **Important**

- **Ne jamais** commiter les clés API dans Git
- **Utiliser** `.env` pour les variables sensibles
- **Surveiller** les quotas pour éviter les interruptions
- **Tester** régulièrement le fallback automatique

