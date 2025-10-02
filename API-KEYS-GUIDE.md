# 🔑 Guide pour obtenir les clés API Pixabay et Pexels

## 🎯 **APIs recommandées pour FlashVoyages**

### 1. **Pixabay** (Recommandé)
- **Gratuit** : 5000 requêtes/mois
- **Qualité** : Images haute résolution
- **Mots-clés** : Excellents pour l'Asie
- **URL** : https://pixabay.com/api/docs/

### 2. **Pexels** (Recommandé)
- **Gratuit** : 200 requêtes/heure
- **Qualité** : Images professionnelles
- **Mots-clés** : Très bons pour le voyage
- **URL** : https://www.pexels.com/api/

## 📋 **Étapes pour obtenir les clés**

### **Pixabay :**
1. Aller sur https://pixabay.com/api/docs/
2. Cliquer sur "Get API Key"
3. Créer un compte gratuit
4. Copier votre clé API
5. Remplacer `YOUR_PIXABAY_API_KEY` dans le code

### **Pexels :**
1. Aller sur https://www.pexels.com/api/
2. Cliquer sur "Get Started"
3. Créer un compte gratuit
4. Copier votre clé API
5. Remplacer `YOUR_PEXELS_API_KEY` dans le code

## 🔧 **Configuration du système**

Une fois les clés obtenues, modifier le fichier `pixabay-pexels-asia-images.js` :

```javascript
const IMAGE_APIS = {
  pixabay: {
    baseUrl: 'https://pixabay.com/api/',
    key: 'VOTRE_CLE_PIXABAY_ICI',
    params: {
      'key': 'VOTRE_CLE_PIXABAY_ICI',
      'image_type': 'photo',
      'orientation': 'horizontal',
      'category': 'travel',
      'safesearch': 'true',
      'per_page': 20
    }
  },
  pexels: {
    baseUrl: 'https://api.pexels.com/v1/search',
    key: 'VOTRE_CLE_PEXELS_ICI',
    headers: {
      'Authorization': 'VOTRE_CLE_PEXELS_ICI'
    }
  }
};
```

## 🌏 **Mots-clés de recherche par destination**

### **Thaïlande :**
- `thailand temple`, `bangkok street`, `thai culture`, `thailand travel`
- `thailand airport`, `bangkok hotel`, `thai street food`

### **Japon :**
- `japan temple`, `tokyo city`, `japanese culture`, `japan travel`
- `japan airport`, `tokyo hotel`, `japanese street food`

### **Philippines :**
- `philippines islands`, `manila city`, `filipino culture`, `philippines travel`
- `philippines airport`, `manila hotel`, `filipino street food`

### **Corée du Sud :**
- `south korea`, `seoul city`, `korean culture`, `korea travel`
- `seoul airport`, `korean hotel`, `korean street food`

### **Vietnam :**
- `vietnam`, `hanoi city`, `vietnamese culture`, `vietnam travel`
- `vietnam airport`, `hanoi hotel`, `vietnamese street food`

## 🚀 **Utilisation du système**

1. **Obtenir les clés API** (gratuites)
2. **Modifier le code** avec vos clés
3. **Exécuter le script** : `node pixabay-pexels-asia-images.js`
4. **Vérifier les résultats** sur votre site

## 💡 **Avantages du système**

- ✅ **Images réelles d'Asie** via APIs
- ✅ **Mots-clés spécifiques** par destination
- ✅ **Fallback Pexels** si APIs indisponibles
- ✅ **Sélection intelligente** par thème
- ✅ **Alt text contextuels** automatiques
- ✅ **Cohérence parfaite** contenu/image

## 🔄 **Système de fallback**

Si les APIs échouent, le système utilise automatiquement des images Pexels de fallback, garantissant que votre site a toujours des images appropriées.

## 📊 **Limites gratuites**

- **Pixabay** : 5000 requêtes/mois (suffisant pour 500+ articles)
- **Pexels** : 200 requêtes/heure (suffisant pour 200 articles/heure)

## 🎯 **Résultat attendu**

Avec les clés API, vous obtiendrez de vraies images d'Asie :
- Temples thaïlandais pour les articles Thaïlande
- Temples japonais pour les articles Japon
- Îles philippines pour les articles Philippines
- Villes coréennes pour les articles Corée
- Paysages vietnamiens pour les articles Vietnam

Votre site FlashVoyages aura enfin des images parfaitement cohérentes ! 🌏✈️

