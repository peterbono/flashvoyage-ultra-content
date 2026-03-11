# Session Cursor — 11 mars 2026

## Objectif de la session
Améliorer qualité éditoriale + optimiser catégories/tags pour affiliation + comparer modèles LLM

---

## Travail effectué

### 1. Audit Backlog Evergreen (P1-P8, K1-K10)

**Tickets COMPLÉTÉS aujourd'hui:**

| Ticket | Description | Fichier modifié |
|--------|-------------|-----------------|
| **P6** | Check "angle coherence" (+10/+5 pts) | `quality-analyzer.js` |
| **P5** | Quality gate 2 itérations + instructions ciblées | `enhanced-ultra-generator.js` |
| **P4** | Anti-dilution expansion (ratio <70% = rejet) | `intelligent-content-analyzer-optimized.js` |
| **P2** | Sections SERP obligatoires (Limites et biais = OK) | `intelligent-content-analyzer-optimized.js` |
| **P7** | Liens internes MAX 5, >=2 dans premiers 30% | `seo-optimizer.js` |

### 2. Phase B — Catégories/Tags Affiliation

**Implémenté:**
- Mapping `AFFILIATE_TO_CATEGORY` (11 produits → catégories WordPress)
- Mapping `AFFILIATE_TAGS` (tags par produit affilié)
- Assignation dynamique dans `getCategoriesForContent()` et `getTagsForContent()`

**Catégories utilisées:**
- Santé & Assurance (ID 20) ← insurance
- Transport & Mobilité (ID 19) ← flights, esim, transfers, bikes
- Logement & Coliving (ID 140) ← accommodation
- Guides Pratiques (ID 165) ← tours, events
- + Destinations (Vietnam 59, Thaïlande 60, Japon 61, etc.)

### 3. Support Claude Haiku ajouté

**Fichiers créés/modifiés:**
- `anthropic-client.js` — nouveau client Anthropic avec interface compatible OpenAI
- `llm-cost-tracker.js` — ajout pricing Claude (Haiku $0.80/$4.00 per 1M tokens)

**Pricing comparatif:**
| Modèle | Input/1M | Output/1M |
|--------|----------|-----------|
| GPT-4o | $2.50 | $10.00 |
| Claude 3.5 Haiku | $0.80 | $4.00 |
| GPT-4o-mini | $0.15 | $0.60 |

### 4. Test Comparatif Multi-Modèles

**Script créé:** `scripts/compare-models-quality.js`

**Résultats (sans Claude — clé manquante):**
- GPT-4o: 562 mots, score 36.1%
- GPT-4o-mini: 727 mots, score 40.6%

**Verdict Expert Marketing Affiliation:**
- GPT-4o gagne sur le potentiel affiliation (témoignage personnel = conversion)
- GPT-4o-mini gagne sur la longueur
- Placements manqués: eSIM, Vols, Revolut/N26

### 5. Fichiers générés pour review

- `data/model-comparison-results.json` — résultats comparatifs
- `data/generated-gpt-4o.html` — article généré GPT-4o
- `data/generated-gpt-4o-mini.html` — article généré GPT-4o-mini
- `PLAN-QUALITY-AFFILIATION.md` — plan détaillé

---

## À reprendre au restart

### Priorité 1: Test Claude Haiku
1. Vérifier que `ANTHROPIC_API_KEY` est chargée (`echo $ANTHROPIC_API_KEY`)
2. Relancer le test comparatif:
   ```bash
   node scripts/compare-models-quality.js
   ```
3. Comparer GPT-4o vs GPT-4o-mini vs Claude Haiku

### Priorité 2: Décision modèle production
Selon résultats du test:
- Si Claude Haiku = bonne qualité → économie 63% vs GPT-4o
- Stratégie hybride recommandée:
  - Génération principale → GPT-4o (ou Claude si équivalent)
  - Tâches secondaires → Claude Haiku ou GPT-4o-mini

### Priorité 3: Génération article réel
Tester avec le pipeline complet (pas juste le prompt simplifié):
```bash
node enhanced-ultra-generator.js --dry-run
```

---

## Commandes utiles

```bash
# Vérifier clé Anthropic
echo $ANTHROPIC_API_KEY | head -c 20

# Test comparatif
node scripts/compare-models-quality.js

# Vérifier syntaxe fichiers modifiés
node --check quality-analyzer.js enhanced-ultra-generator.js intelligent-content-analyzer-optimized.js seo-optimizer.js

# Tests KPI
node --test tests/kpi-quality.test.js

# Génération article (dry run)
node enhanced-ultra-generator.js --dry-run
```

---

## Résumé des modifications de code

### quality-analyzer.js
- Ligne 348: `analyzeContentWriting(html, editorialMode, options = {})`
- Ligne 634-673: Check "EVERGREEN cohérence angle" (+10/+5 pts)
- Ligne 828: `getGlobalScore(html, editorialMode, angle = null)`

### enhanced-ultra-generator.js
- Ligne 969: Passe `angle` à `getGlobalScore()`
- Ligne 1014-1100: Quality gate avec boucle 2 itérations + `buildTargetedInstructions()`
- Ligne 1237: `AFFILIATE_TO_CATEGORY` mapping
- Ligne 1704: `AFFILIATE_TAGS` mapping

### intelligent-content-analyzer-optimized.js
- Ligne 2906-2913: `extractAngleKeywords()` + `countKeywords()` + `preExpansionCount`
- Ligne 2953: Ajout obligation sections SERP dans prompt expansion
- Ligne 3043-3051: Contrôle dilution post-expansion (ratio <70% = rejet)
- Ligne 1528: "Limites et biais" maintenant OBLIGATOIRE
- Ligne 1760-1764: 3 sections SERP obligatoires dans prompt

### seo-optimizer.js
- Ligne 1649: `MAX_INTERNAL_LINKS = 5`
- Ligne 1653-1670: Distribution garantissant >=2 liens dans premiers 30%

### Nouveaux fichiers
- `anthropic-client.js` — client Claude
- `scripts/compare-models-quality.js` — test comparatif
- `PLAN-QUALITY-AFFILIATION.md` — plan détaillé

---

## État des TODOs (tous COMPLETED)

- ✅ P6: Scoring angle coherence
- ✅ P5: Quality gate 2 itérations
- ✅ P4: Anti-dilution expansion
- ✅ P2: Sections SERP obligatoires
- ✅ P7: Liens internes MAX 5
- ✅ CAT1-3: Catégories/tags affiliation
