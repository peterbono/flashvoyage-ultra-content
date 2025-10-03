# 🔐 Guide de Configuration des Secrets GitHub

## 📋 Secrets requis pour l'automatisation

Pour que GitHub Actions fonctionne, tu dois configurer ces secrets dans ton repository :

### 1. **Secrets WordPress** (déjà configurés)
- `WORDPRESS_URL` : `https://flashvoyage.com/`
- `WORDPRESS_USERNAME` : `admin7817`
- `WORDPRESS_APP_PASSWORD` : `GjLl 9W0k lKwf LSOT PXur RYGR`

### 2. **Secrets APIs** (à ajouter)
- `PEXELS_API_KEY` : `qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA`
- `AMADEUS_CLIENT_ID` : `GDrDHvtw18nznyrw5wNklV0Ys8Lvg2Q0`
- `AMADEUS_CLIENT_SECRET` : `hD1Ofq62cPExWhNS`

## 🚀 Comment configurer les secrets

### Étape 1 : Aller dans les paramètres du repository
1. Va sur https://github.com/floriangouloubi/flashvoyage-ultra-content
2. Clique sur **Settings** (en haut à droite)
3. Dans le menu de gauche, clique sur **Secrets and variables** → **Actions**

### Étape 2 : Ajouter les nouveaux secrets
1. Clique sur **New repository secret**
2. Ajoute chaque secret avec son nom et sa valeur :

| Nom du secret | Valeur |
|---------------|--------|
| `PEXELS_API_KEY` | `qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA` |
| `AMADEUS_CLIENT_ID` | `GDrDHvtw18nznyrw5wNklV0Ys8Lvg2Q0` |
| `AMADEUS_CLIENT_SECRET` | `hD1Ofq62cPExWhNS` |

### Étape 3 : Vérifier les secrets existants
Assure-toi que ces secrets existent déjà :
- `WORDPRESS_URL`
- `WORDPRESS_USERNAME` 
- `WORDPRESS_APP_PASSWORD`

## ⚡ Test de l'automatisation

### Déclenchement manuel
1. Va dans l'onglet **Actions** de ton repository
2. Clique sur **Auto Publish Ultra Content**
3. Clique sur **Run workflow** → **Run workflow**

### Déclenchement automatique
- **Programmé** : Tous les jours à 9h UTC (11h française)
- **Fréquence** : 1-2 articles par jour automatiquement

## 📊 Ce que fait l'automatisation

1. **📡 Récupération RSS** : 740 articles de sources fiables
2. **🧠 Filtrage intelligent** : Score stratégique FlashVoyages
3. **✈️ Données Amadeus** : Prix de vols en temps réel
4. **🖼️ Images Pexels** : Photos contextuelles
5. **🇫🇷 Traduction** : Google Translate automatique
6. **📝 Publication** : Article optimisé sur WordPress

## 🎯 Résultat attendu

Chaque jour, le système publiera automatiquement :
- **1-2 articles ultra-pertinents**
- **Score stratégique 70-95/100**
- **Données de vol réelles**
- **Images contextuelles**
- **Ton FlashVoyages authentique**

## 🔧 Dépannage

Si l'automatisation échoue :
1. Vérifie que tous les secrets sont configurés
2. Regarde les logs dans l'onglet **Actions**
3. Vérifie que le serveur RSS fonctionne
4. Teste manuellement avec `node ultra-pertinent-generator.js`

## 🎉 Prêt !

Une fois les secrets configurés, ton site FlashVoyages publiera automatiquement du contenu ultra-pertinent tous les jours !
