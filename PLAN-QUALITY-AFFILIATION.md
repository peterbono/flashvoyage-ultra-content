# Plan Qualité + Catégories Affiliation

> Généré le 2026-03-11  
> Objectif: Améliorer la qualité éditoriale ET optimiser la structure catégories/tags pour l'affiliation

---

## PARTIE 1: État Actuel des Catégories

### Catégories WordPress existantes (IDs réels)

| Catégorie | ID | Pertinence Affiliation | Usage Actuel |
|-----------|----|-----------------------|--------------|
| **Destinations** (parent) | 1 | ⚠️ Trop large | Sous-catégories par pays |
| Vietnam | 59 | ✅ Vols, eSIM, assurance | Non utilisée |
| Thaïlande | 60 | ✅ Vols, eSIM, assurance, tours | Non utilisée |
| Japon | 61 | ✅ Vols, JR Pass, tours | Non utilisée |
| Singapour | 62 | ✅ Vols, tours | Non utilisée |
| Corée du Sud | 63 | ✅ Vols, eSIM | Non utilisée |
| Philippines | 64 | ✅ Vols, eSIM, assurance | Non utilisée |
| Indonésie | 182 | ✅ Vols, eSIM, assurance, tours | Non utilisée |
| **Digital Nomades Asie** | 138 | ⚠️ Fourre-tout | **100% des articles** |
| Logement & Coliving | 140 | ✅ Hébergement | Non utilisée |
| Finance & Fiscalité | 143 | ✅ Cartes bancaires | Non utilisée |
| Santé & Assurance | 20 | ✅ **Assurance voyage** | Non utilisée |
| Transport & Mobilité | 19 | ✅ Vols, transferts, location | Non utilisée |
| Travail & Productivité | 22 | ⚠️ Coworking (faible) | Non utilisée |
| Guides Pratiques | 165 | ✅ SEO long-tail | Non utilisée |
| Comparaisons | 167 | ✅ **Haute intention** | Non utilisée |

### Problème actuel
- **TOUS les articles** vont dans "Digital Nomades Asie" (ID: 138)
- **Aucun tag** n'est appliqué (`tags: []` partout)
- Pas de catégorisation par thème d'affiliation → opportunités de CTA manquées

---

## PARTIE 2: Mapping Catégories ↔ Produits Affiliation

### Produits Affiliés Actuels (contextual-affiliate-injector.js)

| Produit | ID Widget | Catégories Pertinentes | Tags Recommandés |
|---------|-----------|----------------------|------------------|
| Assurance voyage | `insurance` | Santé & Assurance, [Destination] | Assurance, Santé, Sécurité |
| eSIM | `esim` | Transport & Mobilité, [Destination] | eSIM, Connectivité, Internet |
| Vols | `flights` | Transport & Mobilité, [Destination] | Vols, Avion, Comparateur |
| Hébergement | `accommodation` | Logement & Coliving, [Destination] | Hôtel, Hostel, Airbnb |
| Tours/Activités | `tours` | Guides Pratiques, [Destination] | Activités, Excursions, Visites |
| Transferts | `transfers` | Transport & Mobilité, [Destination] | Aéroport, Navette, Taxi |
| Location voiture | `car_rental` | Transport & Mobilité, [Destination] | Location, Road trip |
| Scooter/Vélo | `bikes` | Transport & Mobilité, [Destination] | Scooter, Moto, Vélo |
| Indemnisation vol | `flight_compensation` | Transport & Mobilité | Retard, Annulation, Indemnisation |
| Événements | `events` | Guides Pratiques, [Destination] | Concert, Festival, Spectacle |
| Coworking | `coworking` | Travail & Productivité, [Destination] | Coworking, Remote, Productivité |

### Stratégie de Catégorisation Recommandée

```
RÈGLE 1: Catégorie principale = Destination (si identifiable)
RÈGLE 2: Catégorie secondaire = Thème affiliation (si détecté)
RÈGLE 3: Tags = Destination + Thème + Type de contenu
```

**Exemple article sur l'assurance voyage au Vietnam:**
- Catégories: `[Vietnam, Santé & Assurance]`
- Tags: `[Vietnam, Assurance voyage, Budget, Témoignage]`

---

## PARTIE 3: Plan d'Implémentation

### Phase A: Qualité Éditoriale (P2, P4, P5, P6, P7)

| # | Ticket | Priorité | Effort | Description |
|---|--------|----------|--------|-------------|
| 1 | **P6** | HIGH | 1.5h | Enrichir scoring: check "angle coherence" (+10/+5 pts) |
| 2 | **P5** | HIGH | 1.5h | Quality gate pré-pub: boucle 2 itérations + instructions ciblées |
| 3 | **P4** | HIGH | 1h | Cohérence angle expansion: ratio + rejet si dilution >30% |
| 4 | **P2** | MEDIUM | 1h | Sections SERP: retirer interdiction "Limites et biais" |
| 5 | **P7** | LOW | 0.5h | Liens internes: MAX 5 (au lieu de 3), >=2 dans premiers 30% |

**Ordre d'exécution:** P6 → P5 → P4 → P2 → P7

### Phase B: Catégories & Tags Affiliation

| # | Tâche | Effort | Fichier |
|---|-------|--------|---------|
| 1 | Mapping thème→catégorie dans `getCategoriesForContent()` | 1h | enhanced-ultra-generator.js |
| 2 | Détection thème affiliation depuis angle/extracted | 0.5h | enhanced-ultra-generator.js |
| 3 | Génération tags automatiques (destination + thème) | 0.5h | enhanced-ultra-generator.js |
| 4 | Mise à jour `getCategoriesAndTagsIds()` avec nouveaux mappings | 0.5h | article-finalizer.js |

---

## PARTIE 4: Nouvelle Logique de Catégorisation

### Algorithme proposé

```javascript
function getCategoriesForContent(analysis, content, affiliatePlacements) {
  const categories = [];
  
  // 1. Destination (priorité haute)
  if (analysis.final_destination) {
    const destCategory = getDestinationCategory(analysis.final_destination);
    if (destCategory !== 'Destinations') {
      categories.push(destCategory); // Ex: "Thaïlande"
    }
  }
  
  // 2. Thème affiliation (si détecté)
  const affiliateTheme = detectAffiliateTheme(content, affiliatePlacements);
  const themeCategory = AFFILIATE_TO_CATEGORY[affiliateTheme];
  if (themeCategory && !categories.includes(themeCategory)) {
    categories.push(themeCategory);
  }
  
  // 3. Fallback: Digital Nomades Asie (si rien d'autre)
  if (categories.length === 0) {
    categories.push('Digital Nomades Asie');
  }
  
  return categories.slice(0, 2); // Max 2 catégories
}

const AFFILIATE_TO_CATEGORY = {
  insurance: 'Santé & Assurance',
  esim: 'Transport & Mobilité',
  flights: 'Transport & Mobilité',
  accommodation: 'Logement & Coliving',
  tours: 'Guides Pratiques',
  transfers: 'Transport & Mobilité',
  car_rental: 'Transport & Mobilité',
  bikes: 'Transport & Mobilité',
  coworking: 'Travail & Productivité',
  flight_compensation: 'Transport & Mobilité',
  events: 'Guides Pratiques'
};
```

### Tags automatiques

```javascript
function getTagsForContent(analysis, affiliatePlacements) {
  const tags = new Set();
  
  // 1. Destination
  if (analysis.final_destination) {
    tags.add(normalizeDestinationTag(analysis.final_destination));
  }
  
  // 2. Thème affiliation → tags spécifiques
  const AFFILIATE_TAGS = {
    insurance: ['Assurance voyage', 'Santé', 'Sécurité'],
    esim: ['eSIM', 'Connectivité', 'Internet'],
    flights: ['Vols', 'Avion', 'Comparateur'],
    accommodation: ['Hébergement', 'Hôtel', 'Logement'],
    tours: ['Activités', 'Excursions', 'Visites'],
    // ...
  };
  
  affiliatePlacements.forEach(p => {
    const themeTags = AFFILIATE_TAGS[p.id] || [];
    themeTags.forEach(t => tags.add(t));
  });
  
  // 3. Type de contenu
  if (analysis.type_contenu?.includes('TEMOIGNAGE')) {
    tags.add('Témoignage');
  }
  if (analysis.type_contenu?.includes('GUIDE')) {
    tags.add('Guide');
  }
  
  // 4. Budget (si mentionné)
  if (/budget|€|euro|prix|coût/i.test(analysis.title || '')) {
    tags.add('Budget');
  }
  
  return [...tags].slice(0, 8); // Max 8 tags
}
```

---

## PARTIE 5: Résumé Exécutif

### Problèmes identifiés
1. ❌ 100% des articles dans "Digital Nomades Asie" — pas de segmentation
2. ❌ 0 tag appliqué — SEO et navigation interne dégradés
3. ❌ Tickets qualité P2/P4/P5/P6/P7 partiellement implémentés
4. ❌ Catégories thématiques (Santé, Transport, Logement) inutilisées

### Actions prioritaires
1. ✅ Implémenter mapping catégorie basé sur destination + thème affiliation
2. ✅ Générer tags automatiques depuis analyse + placements affiliés
3. ✅ Compléter les tickets qualité (P6 → P5 → P4 → P2 → P7)

### Impact attendu
- **SEO**: Meilleure structure de silos, pages catégorie mieux ciblées
- **Affiliation**: CTR amélioré car contenu aligné avec catégorie/tags
- **Navigation**: Utilisateurs trouvent facilement les articles par thème
- **Qualité**: Score moyen Evergreen de 70% → 85%+

---

## Prochaines étapes

Confirme si tu veux que j'implémente:
1. **Phase A uniquement** (qualité éditoriale P2-P7)
2. **Phase B uniquement** (catégories/tags affiliation)
3. **Les deux phases** (recommandé)
