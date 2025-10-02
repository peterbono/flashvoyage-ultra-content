# 🚀 Déploiement Vercel - FlashVoyages Ultra Content

## 📋 Étapes de déploiement

### 1. **Préparer le projet**
```bash
# Installer Vercel CLI
npm i -g vercel

# Se connecter à Vercel
vercel login
```

### 2. **Configurer les variables d'environnement**
Dans le dashboard Vercel, ajouter :
```
WORDPRESS_URL=https://flashvoyage.com/
WORDPRESS_USERNAME=admin7817
WORDPRESS_APP_PASSWORD=GjLl 9W0k lKwf LSOT PXur RYGR
PEXELS_API_KEY=qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA
```

### 3. **Déployer**
```bash
# Déployer sur Vercel
vercel --prod
```

### 4. **Configurer les crons**
Dans le dashboard Vercel :
- Aller dans "Functions" > "Crons"
- Ajouter un cron : `0 9 * * *` (tous les jours à 9h)
- URL : `https://your-app.vercel.app/api/auto-publish`

## 🔧 **Alternative : GitHub Actions (Gratuit)**

### 1. **Créer .github/workflows/auto-publish.yml**
```yaml
name: Auto Publish Content
on:
  schedule:
    - cron: '0 9 * * *'  # Tous les jours à 9h UTC
  workflow_dispatch:  # Déclenchement manuel

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: node fixed-auto-publisher.js
        env:
          WORDPRESS_URL: ${{ secrets.WORDPRESS_URL }}
          WORDPRESS_USERNAME: ${{ secrets.WORDPRESS_USERNAME }}
          WORDPRESS_APP_PASSWORD: ${{ secrets.WORDPRESS_APP_PASSWORD }}
          PEXELS_API_KEY: ${{ secrets.PEXELS_API_KEY }}
```

### 2. **Configurer les secrets GitHub**
Dans Settings > Secrets :
- `WORDPRESS_URL`
- `WORDPRESS_USERNAME`
- `WORDPRESS_APP_PASSWORD`
- `PEXELS_API_KEY`

## 🌐 **Option 3 : Railway (Gratuit)**

### 1. **Créer railway.json**
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node fixed-auto-publisher.js",
    "healthcheckPath": "/health"
  }
}
```

### 2. **Déployer sur Railway**
- Connecter le repo GitHub
- Configurer les variables d'environnement
- Déployer automatiquement

## ⚡ **Option 4 : Render (Gratuit)**

### 1. **Créer render.yaml**
```yaml
services:
  - type: cron
    name: flashvoyage-auto-publish
    env: node
    buildCommand: npm install
    startCommand: node fixed-auto-publish.js
    schedule: "0 9 * * *"
    envVars:
      - key: WORDPRESS_URL
        value: https://flashvoyage.com/
      - key: WORDPRESS_USERNAME
        value: admin7817
      - key: WORDPRESS_APP_PASSWORD
        value: GjLl 9W0k lKwf LSOT PXur RYGR
      - key: PEXELS_API_KEY
        value: qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA
```

## 🎯 **Recommandation**

**GitHub Actions** est la meilleure option car :
- ✅ **100% gratuit**
- ✅ **Fiable et stable**
- ✅ **Facile à configurer**
- ✅ **Logs détaillés**
- ✅ **Déclenchement manuel possible**

## 🚀 **Déploiement rapide GitHub Actions**

1. **Créer le fichier .github/workflows/auto-publish.yml**
2. **Configurer les secrets dans GitHub**
3. **Push sur GitHub**
4. **L'automatisation se lance automatiquement !**

Votre ordinateur peut rester éteint, l'automatisation tourne dans le cloud ! ☁️
