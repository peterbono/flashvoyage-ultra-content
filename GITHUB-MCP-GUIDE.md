# 🚀 GitHub MCP Server - Guide d'Utilisation

## 📋 Vue d'ensemble

Le **GitHub MCP Server** permet d'automatiser complètement le déploiement de votre projet FlashVoyages sur GitHub avec GitHub Actions.

## 🛠️ Configuration

### 1. **Variables d'environnement**
Créez un fichier `.env` avec :
```env
GITHUB_TOKEN=your_github_token_here
GITHUB_USERNAME=your_github_username
```

### 2. **Obtenir un token GitHub**
1. Aller sur [github.com/settings/tokens](https://github.com/settings/tokens)
2. "Generate new token" > "Generate new token (classic)"
3. Sélectionner les scopes :
   - ✅ `repo` (accès complet aux repositories)
   - ✅ `workflow` (gestion des GitHub Actions)
   - ✅ `admin:org` (si organisation)
4. Copier le token

## 🧪 Test de Configuration

```bash
# Tester la connexion GitHub
node test-github-mcp.js
```

## 🚀 Déploiement Automatique

### **Option 1 : Déploiement Complet Automatique**
```bash
# Lancer le déploiement automatique complet
node auto-github-deployment.js
```

**Ce script va :**
- ✅ Créer le repository GitHub
- ✅ Configurer le workflow GitHub Actions
- ✅ Générer les instructions pour les secrets
- ✅ Créer un guide de déploiement complet

### **Option 2 : Utilisation via MCP (dans Cursor)**

Une fois le MCP server configuré, vous pouvez utiliser ces outils dans Cursor :

#### **Créer un repository**
```json
{
  "name": "create_repository",
  "arguments": {
    "name": "flashvoyage-ultra-content",
    "description": "🚀 FlashVoyages Ultra Content Generator",
    "private": false
  }
}
```

#### **Créer un workflow GitHub Actions**
```json
{
  "name": "create_workflow",
  "arguments": {
    "repository": "votre-username/flashvoyage-ultra-content",
    "workflow_name": "auto-publish",
    "workflow_content": "name: Auto Publish\non:\n  schedule:\n    - cron: '0 9 * * *'"
  }
}
```

#### **Configurer les secrets**
```json
{
  "name": "set_secrets",
  "arguments": {
    "repository": "votre-username/flashvoyage-ultra-content",
    "secrets": {
      "WORDPRESS_URL": "https://votre-site.com/",
      "WORDPRESS_USERNAME": "votre_username",
      "WORDPRESS_APP_PASSWORD": "votre_app_password",
      "PEXELS_API_KEY": "votre_pexels_api_key"
    }
  }
}
```

## 📊 Outils Disponibles

### 1. **create_repository**
Crée un nouveau repository GitHub
- `name` : Nom du repository
- `description` : Description (optionnel)
- `private` : Privé ou public (défaut: false)

### 2. **push_code**
Génère les instructions pour pousser le code
- `repository` : Nom du repository (format: owner/repo)
- `branch` : Branche de destination (défaut: main)
- `message` : Message de commit

### 3. **create_workflow**
Crée un workflow GitHub Actions
- `repository` : Nom du repository
- `workflow_name` : Nom du fichier workflow
- `workflow_content` : Contenu YAML du workflow

### 4. **set_secrets**
Configure les secrets GitHub (instructions)
- `repository` : Nom du repository
- `secrets` : Objet des secrets à configurer

### 5. **get_repository_info**
Récupère les informations d'un repository
- `repository` : Nom du repository

### 6. **list_repositories**
Liste les repositories de l'utilisateur
- `username` : Nom d'utilisateur GitHub

## 🎯 Workflow de Déploiement

### **Étape 1 : Configuration**
```bash
# 1. Configurer les variables d'environnement
cp github-env.example .env
# Éditer .env avec vos credentials

# 2. Tester la configuration
node test-github-mcp.js
```

### **Étape 2 : Déploiement**
```bash
# Lancer le déploiement automatique
node auto-github-deployment.js
```

### **Étape 3 : Configuration manuelle des secrets**
1. Aller sur le repository GitHub créé
2. Settings > Secrets and variables > Actions
3. Ajouter les secrets listés dans les instructions

### **Étape 4 : Pousser le code**
```bash
git remote add origin https://github.com/votre-username/flashvoyage-ultra-content.git
git branch -M main
git push -u origin main
```

### **Étape 5 : Activer GitHub Actions**
1. Onglet "Actions" du repository
2. "I understand my workflows, go ahead and enable them"
3. L'automatisation se lance !

## 🔍 Monitoring

### **Logs GitHub Actions**
- Accéder à l'onglet "Actions" du repository
- Consulter les logs de chaque exécution
- Notifications en cas d'erreur

### **Vérification du contenu**
- Articles publiés sur votre site WordPress
- Images contextuelles via Pexels
- Catégories et tags automatiques

## 🚨 Dépannage

### **Erreur de token GitHub**
```
❌ GITHUB_TOKEN non configuré
```
**Solution :** Vérifier le fichier `.env` et le token GitHub

### **Erreur de permissions**
```
❌ GitHub API Error: Bad credentials
```
**Solution :** Vérifier que le token a les bonnes permissions

### **Repository existe déjà**
```
ℹ️ Repository flashvoyage-ultra-content existe déjà
```
**Solution :** Normal, le script continue avec le repository existant

## 🎉 Avantages

✅ **Déploiement 100% automatisé**  
✅ **Aucune intervention manuelle**  
✅ **Configuration GitHub Actions automatique**  
✅ **Instructions détaillées générées**  
✅ **Monitoring intégré**  
✅ **Gestion d'erreurs complète**  

---

**Votre système d'automatisation FlashVoyages est prêt à dominer le marché !** 🌏✈️🚀
