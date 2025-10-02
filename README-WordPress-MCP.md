# WordPress MCP Server pour Cursor

Ce serveur MCP (Model Context Protocol) permet d'intégrer Cursor avec votre site WordPress via l'API REST.

## 🚀 Installation

### 1. Prérequis
- Node.js 18+ installé
- Un site WordPress avec l'API REST activée
- Un compte utilisateur WordPress avec les permissions appropriées

### 2. Configuration

1. **Copiez le fichier d'environnement :**
   ```bash
   cp env.example .env
   ```

2. **Modifiez le fichier `.env` avec vos informations :**
   ```env
   WORDPRESS_URL=https://votre-site-wordpress.com
   WORDPRESS_USERNAME=votre_nom_utilisateur
   WORDPRESS_APP_PASSWORD=votre_mot_de_passe_application
   ```

3. **Générez un mot de passe d'application dans WordPress :**
   - Allez dans `Utilisateurs` > `Votre profil`
   - Scrollez vers le bas jusqu'à "Mots de passe d'application"
   - Créez un nouveau mot de passe d'application
   - Copiez-le dans votre fichier `.env`

### 3. Test de connexion

```bash
npm run test:wp
```

## 🔧 Configuration de Cursor

### Option 1 : Configuration via les paramètres Cursor

1. Ouvrez Cursor
2. Allez dans `Settings` > `Features` > `Model Context Protocol`
3. Ajoutez un nouveau serveur MCP avec la configuration suivante :

```json
{
  "name": "wordpress",
  "command": "node",
  "args": ["wordpress-mcp-server.js"],
  "cwd": "/Users/floriangouloubi/Documents/perso/flashvoyage",
  "env": {
    "WORDPRESS_URL": "https://votre-site-wordpress.com",
    "WORDPRESS_USERNAME": "votre_nom_utilisateur",
    "WORDPRESS_APP_PASSWORD": "votre_mot_de_passe_application"
  }
}
```

### Option 2 : Configuration via fichier

Utilisez le fichier `cursor-mcp-config.json` fourni et importez-le dans Cursor.

## 🛠️ Fonctionnalités disponibles

Le serveur MCP WordPress expose les outils suivants :

### Gestion des articles
- `get_posts` - Récupère la liste des articles
- `get_post` - Récupère un article spécifique par ID
- `create_post` - Crée un nouvel article
- `update_post` - Met à jour un article existant
- `delete_post` - Supprime un article

### Gestion des pages
- `get_pages` - Récupère la liste des pages

### Gestion des médias
- `get_media` - Récupère la liste des médias

### Gestion des utilisateurs
- `get_users` - Récupère la liste des utilisateurs

## 📝 Utilisation

Une fois configuré, vous pouvez utiliser le serveur MCP dans Cursor pour :

1. **Créer du contenu :**
   ```
   Crée un nouvel article WordPress avec le titre "Mon nouvel article" et le contenu "Voici le contenu de mon article"
   ```

2. **Modifier du contenu :**
   ```
   Mets à jour l'article ID 123 avec le nouveau titre "Titre modifié"
   ```

3. **Récupérer des informations :**
   ```
   Récupère la liste des 5 derniers articles publiés
   ```

## 🔒 Sécurité

- Utilisez toujours un mot de passe d'application plutôt que votre mot de passe principal
- Limitez les permissions de l'utilisateur WordPress aux besoins minimum
- Considérez utiliser HTTPS pour toutes les communications

## 🐛 Dépannage

### Erreur de connexion
- Vérifiez que l'URL WordPress est correcte
- Vérifiez que l'API REST est activée
- Vérifiez les identifiants dans le fichier `.env`

### Erreur d'authentification
- Vérifiez que le mot de passe d'application est correct
- Vérifiez que l'utilisateur a les permissions nécessaires

### Erreur de permissions
- Vérifiez que l'utilisateur a les rôles appropriés (Editor ou Administrator)

## 📚 Ressources

- [Documentation WordPress REST API](https://developer.wordpress.org/rest-api/)
- [Documentation MCP](https://modelcontextprotocol.io/)
- [Génération de mots de passe d'application WordPress](https://wordpress.org/support/article/application-passwords/)


