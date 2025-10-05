# 🔒 Guide de Sécurité - Reddit API

## ⚠️ RISQUES IDENTIFIÉS

### 1. **EXPOSITION DU TOKEN REDDIT**
- **Risque** : Le token Reddit peut être exposé dans les logs
- **Impact** : Accès non autorisé au compte Reddit
- **Mitigation** : Token non loggé dans le code principal

### 2. **CREDENTIALS EN DUR**
- **Risque** : Credentials hardcodés dans le code
- **Impact** : Compromission du compte Reddit
- **Mitigation** : Utilisation de variables d'environnement

### 3. **LOGS GITHUB ACTIONS**
- **Risque** : Exposition des tokens dans les logs publics
- **Impact** : Accès non autorisé
- **Mitigation** : Pas de logging des tokens sensibles

## 🛡️ MESURES DE SÉCURITÉ

### 1. **PROTECTION DES TOKENS**
```javascript
// ✅ CORRECT - Token non exposé
console.log('✅ Token Reddit généré, expire dans 86400s');
console.log('🔒 Token sécurisé - non exposé dans les logs');

// ❌ INCORRECT - Token exposé
console.log('Token:', accessToken); // DANGEREUX
```

### 2. **GESTION DES CREDENTIALS**
```javascript
// ✅ CORRECT - Variables d'environnement
const REDDIT_API_CONFIG = {
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  username: process.env.REDDIT_USERNAME,
  password: process.env.REDDIT_PASSWORD
};

// ❌ INCORRECT - Credentials hardcodés
const REDDIT_API_CONFIG = {
  clientId: 'TTElvoZRwFqVYinhpeb7-A', // DANGEREUX
  clientSecret: 'XJuOwF5xY7PycDSHIeiIrRfD-1YTtA' // DANGEREUX
};
```

### 3. **CACHE SÉCURISÉ**
```javascript
// ✅ CORRECT - Cache en mémoire uniquement
let redditTokenCache = {
  token: null,
  expires: 0,
  refreshTime: 0
};
```

## 🔍 VÉRIFICATIONS DE SÉCURITÉ

### 1. **VÉRIFIER L'EXPOSITION DES TOKENS**
```bash
# Chercher les tokens exposés
grep -r "access_token" . --exclude-dir=node_modules
grep -r "Bearer" . --exclude-dir=node_modules
```

### 2. **VÉRIFIER LES CREDENTIALS HARDCODÉS**
```bash
# Chercher les credentials en dur
grep -r "REDDIT_CLIENT_ID.*=" . --exclude-dir=node_modules
grep -r "REDDIT_CLIENT_SECRET.*=" . --exclude-dir=node_modules
```

### 3. **VÉRIFIER LES LOGS**
```bash
# Vérifier les logs pour l'exposition
grep -r "console.log.*token" . --exclude-dir=node_modules
```

## 🚨 ACTIONS EN CAS DE COMPROMISSION

### 1. **TOKEN COMPROMIS**
- Révoquer immédiatement le token
- Générer un nouveau token
- Vérifier l'activité du compte

### 2. **CREDENTIALS COMPROMIS**
- Changer le mot de passe Reddit
- Régénérer les credentials de l'app
- Mettre à jour les variables d'environnement

### 3. **APP COMPROMISE**
- Supprimer l'app Reddit
- Créer une nouvelle app
- Mettre à jour tous les credentials

## 📋 CHECKLIST DE SÉCURITÉ

- [ ] Aucun token exposé dans les logs
- [ ] Aucun credential hardcodé
- [ ] Variables d'environnement utilisées
- [ ] Cache en mémoire uniquement
- [ ] Logs GitHub Actions sécurisés
- [ ] App Reddit correctement configurée
- [ ] Permissions minimales (read uniquement)
- [ ] Monitoring des accès

## 🔒 BONNES PRATIQUES

1. **Ne jamais logger les tokens**
2. **Utiliser des variables d'environnement**
3. **Limiter les permissions (scope: read)**
4. **Monitorer les accès**
5. **Rafraîchir les tokens régulièrement**
6. **Utiliser HTTPS uniquement**
7. **Valider les inputs**
8. **Gérer les erreurs proprement**
