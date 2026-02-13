---
name: Inline images articles
overview: "Add 2-3 contextual inline images per article using a cascade multi-source strategy (Unsplash > Flickr CC-BY > Pexels fallback) to increase engagement, scroll depth, time-on-page, and affiliate conversion rates."
todos:
  - id: config-keys-flag
    content: "Add UNSPLASH_API_KEY, FLICKR_API_KEY exports + ENABLE_INLINE_IMAGES flag in config.js. Forward secrets in devcontainer.json if needed."
    status: pending
  - id: image-source-manager
    content: "Create image-source-manager.js with cascade logic: Unsplash (50 req/h demo) > Flickr CC-BY (filter license=4,5,9,10) > Pexels fallback. Unified return format."
    status: pending
  - id: query-generator
    content: "Create generateImageQueries() that extracts destination + section themes from article content and builds source-specific queries."
    status: pending
  - id: image-inserter
    content: "Create insertContextualImages() in article-finalizer.js that places 2-3 images after specific H2 sections with spacing rules."
    status: pending
  - id: html-template
    content: "Build semantic figure/figcaption HTML with lazy loading, dimensions, contextual alt text, source-specific attribution."
    status: pending
  - id: wp-upload
    content: "Extend WordPress upload in enhanced-ultra-generator.js to upload inline images to media library and replace source URLs with WordPress URLs."
    status: pending
  - id: dedup-tracking
    content: "Extend used-pexels-images.json to used-images.json tracking all sources, avoid duplicates cross-articles."
    status: pending
  - id: pipeline-integration
    content: "Wire the image phase into pipeline-runner.js after affiliate injection, before QA report."
    status: pending
  - id: test-production
    content: "Test on a production article, verify images from each source render correctly with proper attribution."
    status: pending
isProject: false
---

# Insertion d'images contextuelles dans les articles FlashVoyage

## Diagnostic expert (10 ans content marketing affiliation)

**Constat** : Les articles sont actuellement des murs de texte avec uniquement une featured image. Sur un site voyage/nomade digital, c'est un handicap majeur :

- **SEO** : Google favorise le contenu enrichi d'images avec alt-text contextuels. Les articles sans images dans le body sont penalises face aux concurrents qui en ont.
- **Engagement** : Les articles avec 1 image tous les 300-400 mots ont un temps de lecture 2x superieur. Plus le lecteur reste, plus il scroll, plus il voit les widgets affilies.
- **Conversion affiliation** : Une image immersive de destination juste avant un widget flights/eSIM cree un effet de desir qui booste le taux de clic (priming visuel).
- **Bounce rate** : Un article travel sans images contextuelles perd en credibilite et fait fuir les visiteurs non-captifs.
- **Partage social** : Les articles avec images internes generent environ 94% plus de partages.

## Strategie cascade multi-source

### Sources d'images (ordre de priorite)

- **Unsplash (priorite 1)** : Qualite editoriale "magazine". Ideal pour l'image hook (1er H2). Contrainte : 50 req/h en mode demo (App ID: 874057, production en attente de validation = 5000 req/h). Budget : 1 requete/article max en demo.
- **Flickr CC-BY (priorite 2)** : Photos de vrais voyageurs = authenticite maximale. Ideal pour images mid-article (sections specifiques : street food, temples, coworking). Filtrer par licences commerciales uniquement (CC-BY 2.0/4.0 = license IDs 4, 5, 9, 10). Pas de limite stricte.
- **Pexels (fallback, priorite 3)** : Deja integre, fiable. Utilise uniquement si les 2 autres ne retournent pas de resultats pertinents. 200 req/h.

### Secrets disponibles (GitHub Codespace)

- `UNSPLASH_API_KEY` + `UNSPLASH_CLIENT_SECRET` : Configures (demo)
- `FLICKR_API_KEY` + `FLICKR_CLIENT_SECRET` : Configures
- `PEXELS_API_KEY` : Deja integre dans [config.js](config.js) ligne 20

Note : ces secrets sont dans les Codespace Secrets GitHub mais ne sont PAS encore exportes dans `config.js`. Les env vars `UNSPLASH_API_KEY` et `FLICKR_API_KEY` ne sont pas encore lues par le code.

### Budget rate-limit par article

- Unsplash : 1 requete/article (image hook) - 50 articles/h max en demo
- Flickr : 1-2 requetes/article (mid-article) - illimite
- Pexels : 0-1 requete/article (fallback uniquement) - 200 req/h

Quand Unsplash passe en production (5000 req/h), on pourra l'utiliser pour 2-3 images/article.

## Strategie d'insertion

**Nombre cible** : 2-3 images par article, placees strategiquement :

- **Image 1 ("hook visuel")** : Apres le 1er H2 ou apres le 2e paragraphe. Source : Unsplash. Query : destination principale.
- **Image 2 ("mid-article engagement")** : Apres le 3e ou 4e H2. Source : Flickr CC-BY. Query : theme de la section.
- **Image 3 ("desire trigger", optionnelle)** : Avant le dernier widget affilie ou "Nos recommandations". Source : Flickr ou Pexels. Query : lifestyle/ambiance.

**Regles de placement** :

- Jamais 2 images dans la meme section H2
- Jamais une image adjacente a un widget affilie (min 1 paragraphe de separation)
- Jamais dans les sections "Ce qu'il faut retenir" ou "A lire egalement"
- Min 800 caracteres entre 2 images

## Implementation technique

### Fichiers concernes

- **Nouveau** : `image-source-manager.js` - Abstraction cascade Unsplash > Flickr > Pexels. Chaque source implemente `search(query, options)` et retourne un format unifie `{url, width, height, alt, photographer, photographerUrl, source, license}`.
- [config.js](config.js) - Ajouter exports `UNSPLASH_API_KEY`, `FLICKR_API_KEY`, `ENABLE_INLINE_IMAGES` flag (defaut: true).
- [article-finalizer.js](article-finalizer.js) - Nouvelles methodes `generateImageQueries()`, `insertContextualImages()`. Phase inseree apres 5.C (affiliate injection) et avant 6.1 (QA Report). Reutilise l'infra existante de `getFeaturedImage()` (lignes 6719-6862) comme reference.
- [enhanced-ultra-generator.js](enhanced-ultra-generator.js) - Etendre l'upload WordPress pour gerer les images inline (upload chaque image au media library, remplacer les URLs source par les URLs WordPress).
- [pipeline-runner.js](pipeline-runner.js) - Passer les images inline dans le contexte pipeline.
- `used-pexels-images.json` evolue en `used-images.json` - Tracking multi-source pour la deduplication.

### Format HTML genere

```html
<figure class="fv-inline-image" data-position="hook" data-source="unsplash">
  <img src="URL_WORDPRESS" alt="Marche flottant de Bangkok au lever du soleil"
       loading="lazy" width="800" height="533" />
  <figcaption>
    Photo: <a href="PHOTOGRAPHER_URL" target="_blank" rel="noopener">Nom</a>
    / <a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a>
  </figcaption>
</figure>
```

**Attribution par source (obligations legales)** :

- **Unsplash** : Lien profil photographe + lien Unsplash (obligatoire API Terms)
- **Flickr CC-BY** : Nom photographe + lien original Flickr + mention "CC BY 2.0" (obligation Creative Commons)
- **Pexels** : Credit photographe (recommande, pas obligatoire)

### Architecture image-source-manager.js

Classe `ImageSourceManager` avec les methodes suivantes :

- `constructor(config)` : init sources avec API keys depuis config.js
- `async searchCascade(query, options)` : essaie Unsplash > Flickr > Pexels, retourne le premier resultat valide
- `async searchUnsplash(query)` : GET `api.unsplash.com/search/photos` avec `UNSPLASH_API_KEY`
- `async searchFlickr(query)` : GET `flickr.com/services/rest/?method=flickr.photos.search&license=4,5,9,10` avec `FLICKR_API_KEY`, filtrer resolution min 1200px, faves > 5
- `async searchPexels(query)` : GET `api.pexels.com/v1/search` avec `PEXELS_API_KEY` (existant)
- `formatResult(rawResult, source)` : normalise vers format unifie
- `isUsed(imageId)` / `markUsed(imageId, articleId)` : deduplication via `used-images.json`

### Generation des queries

Methode `generateImageQueries(article, analysis, pipelineContext)` :

- Extraire la destination principale depuis `geo_defaults` (ex: "Vietnam", "Chiang Mai")
- Parser les H2 pour extraire les themes de chaque section
- Construire des queries specifiques : `"street food Ho Chi Minh"`, `"temple Angkor Wat sunrise"`, `"coworking Chiang Mai"`
- Retourner un tableau de `{query, position, sourcePreference}` pour chaque image cible

## Risques et mitigations

- **Rate limit Unsplash demo (50 req/h)** : Budget strict 1 req/article. Fallback Flickr/Pexels si epuise. Quand production approuvee, augmenter a 2-3.
- **Qualite variable Flickr** : Filtrer par resolution min (1200px largeur), faves > 5, licences commerciales uniquement.
- **Temps pipeline** : +5-10s par article (requetes API paralleles). Acceptable.
- **Stockage WordPress** : +2-3 images par article (~500KB). Negligeable.
- **Core Web Vitals** : `loading="lazy"` + `width`/`height` explicites eliminent le risque CLS/LCP.
- **Secrets non charges en runtime** : Verifier que les Codespace Secrets sont bien exposes comme env vars dans le conteneur. Sinon, les mapper dans `devcontainer.json`.
