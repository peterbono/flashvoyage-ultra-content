# Archive Quarantine Index

Cette archive sert de quarantaine restaurable avant suppression définitive.
Tous les fichiers déplacés ici peuvent être restaurés rapidement.

## Restore rapide

```bash
# Exemple restore fichier tracked
git mv "archive/top-level/_OBSOLETE_content-enhancer.js" "./_OBSOLETE_content-enhancer.js"

# Exemple restore fichier backup non tracked
mv "archive/backups/published-articles-cache.json.bak" "./published-articles-cache.json.bak"
```

## Mapping des fichiers archivés

| Original | Archive | Type | Raison | Ticket Jira |
|---|---|---|---|---|
| `_OBSOLETE_content-enhancer.js` | `archive/top-level/_OBSOLETE_content-enhancer.js` | tracked | Obsolète, non référencé runtime | `FV-82` |
| `_OBSOLETE_flashvoyages-orchestrator.js` | `archive/top-level/_OBSOLETE_flashvoyages-orchestrator.js` | tracked | Obsolète, non référencé runtime | `FV-82` |
| `_OBSOLETE_semantic-link-analyzer.js` | `archive/top-level/_OBSOLETE_semantic-link-analyzer.js` | tracked | Obsolète, non référencé runtime | `FV-82` |
| `intelligent-content-analyzer-optimized.js.bak` | `archive/backups/intelligent-content-analyzer-optimized.js.bak` | tracked | Backup, non utilisé runtime | `FV-82` |
| `published-articles-cache.json.bak` | `archive/backups/published-articles-cache.json.bak` | untracked | Backup local non utilisé runtime | `FV-82` |
| `published-reddit-urls.json.bak` | `archive/backups/published-reddit-urls.json.bak` | untracked | Backup local non utilisé runtime | `FV-82` |

## Fichiers explicitement exclus de l'archive (sécurité)

- `_OBSOLETE_ultra-fresh-complete.js` (import direct détecté dans `ultra-strategic-generator.js`)
- `flashvoyages-rss-monitor.js`, `github-mcp-server.js`, `wordpress-mcp-server.js` (référencés par `cursor-mcp-config.json`)
- `real-stats-scraper.js` (mention docs + usage manuel possible)
- `delete-last-5-articles.js`, `delete-low-quality-article.js`, `regen-target.js` (scripts manuels potentiels)
