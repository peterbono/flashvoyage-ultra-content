# 🚀 Instructions de Déploiement GitHub

## 📋 Étapes pour déployer sur GitHub

### 1. **Créer le repository sur GitHub**
1. Aller sur [github.com](https://github.com)
2. Cliquer sur "New repository"
3. Nom : `flashvoyage-ultra-content`
4. Description : `🚀 FlashVoyages Ultra Content Generator - Système d'automatisation de contenu ultra-spécialisé pour le voyage en Asie`
5. Public ✅
6. Ne pas initialiser avec README (déjà créé)
7. Cliquer "Create repository"

### 2. **Connecter le repository local**
```bash
# Ajouter le remote GitHub
git remote add origin https://github.com/VOTRE-USERNAME/flashvoyage-ultra-content.git

# Pousser le code
git branch -M main
git push -u origin main
```

### 3. **Configurer les secrets GitHub**
1. Aller dans Settings > Secrets and variables > Actions
2. Cliquer "New repository secret"
3. Ajouter ces secrets :

| Nom du Secret | Valeur |
|---------------|--------|
| `WORDPRESS_URL` | `https://flashvoyage.com/` |
| `WORDPRESS_USERNAME` | `admin7817` |
| `WORDPRESS_APP_PASSWORD` | `GjLl 9W0k lKwf LSOT PXur RYGR` |
| `PEXELS_API_KEY` | `qNCjwU6WA9168C8204HQ4V1sD8FsWtAyb6dfIrI0LRNRU9ntfMkhevmA` |

### 4. **Activer GitHub Actions**
1. Aller dans l'onglet "Actions"
2. Cliquer "I understand my workflows, go ahead and enable them"
3. Le workflow se lancera automatiquement

### 5. **Tester l'automatisation**
1. Aller dans Actions > "Auto Publish Ultra Content"
2. Cliquer "Run workflow" pour tester manuellement
3. Vérifier les logs d'exécution

## 🎯 **Résultat Attendu**

✅ **Publication automatique** tous les jours à 9h UTC (11h française)
✅ **Contenu ultra-spécialisé** généré automatiquement
✅ **Images contextuelles** via Pexels
✅ **SEO optimisé** avec catégories et tags
✅ **Aucune intervention** manuelle nécessaire

## 🔧 **Monitoring**

- **Logs** : Actions > Auto Publish Ultra Content > [Dernière exécution]
- **Articles publiés** : Vérifier sur votre site WordPress
- **Erreurs** : Notifications automatiques en cas de problème

## 🚨 **En cas de problème**

1. **Vérifier les secrets** : S'assurer qu'ils sont corrects
2. **Consulter les logs** : Actions > Dernière exécution > Logs
3. **Tester manuellement** : Run workflow > Run workflow
4. **Vérifier WordPress** : S'assurer que l'API REST fonctionne

---

**Votre système d'automatisation est prêt !** 🎉
