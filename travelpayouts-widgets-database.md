# Base de données widgets Travelpayouts

Source de vérité côté code : [travelpayouts-real-widgets-database.js](travelpayouts-real-widgets-database.js) (export `REAL_TRAVELPAYOUTS_WIDGETS`).

Partner ID : `463418` · Marker : `676421`

---

## Vols (flights)

Ordre des providers : **Aviasales** (40 % reward) en premier, puis **Kiwi.com** (3 %). Le placer utilise par défaut le premier provider et `searchForm`.

### Aviasales (campaign_id=100)

| Widget | Type | promo_id | Usage |
|--------|------|----------|--------|
| Flight Search Form | searchForm | 7879 | Formulaire de recherche vols, comparatifs |
| Schedule Widget | scheduleWidget | 2811 | Horaires de vol, planning |
| Pricing Calendar | pricingCalendar | 4041 | Meilleures périodes, calendrier des prix |
| Popular Routes | popularRoutes | 4044 | Routes populaires, tendances |
| Price on Map | pricesOnMap | 4054 | Carte des prix, comparaisons géo |

### Kiwi.com (campaign_id=111)

| Widget | Type | promo_id | Usage |
|--------|------|----------|--------|
| Flight Search Form | searchForm | 3414 | Recherche vols (origin/destination dynamiques) |
| Popular Routes | popularRoutes | 3411 | Routes populaires |
| Search Results | searchResults | 4478 | Résultats de recherche |
| Specific Route | specificRoute | 4484 | Route spécifique (ex. Paris–Bangkok) |
| Popular Destinations | popularDestinations | 4563 | Destinations populaires |

---

## Connectivité / eSIM (connectivity, esim)

### Airalo (campaign_id=541)

| Widget | Type | promo_id | Usage |
|--------|------|----------|--------|
| eSIM Search Form | esimSearch | 8588 | Recherche eSIM, connectivité nomades |

---

## Assurance (insurance)

Ordre des providers : **VisitorCoverage** en premier (widget le plus générique), puis **Insubuy**.

### VisitorCoverage (campaign_id=153)

| Widget | Type | promo_id | Usage |
|--------|------|----------|--------|
| Travel medical insurance | travelMedical | 4652 | Assurance voyage médicale (type=visitor, theme=small-theme1) |

### Insubuy (campaign_id=165)

| Widget | Type | promo_id | Format | Usage |
|--------|------|----------|--------|--------|
| Insurance for USA (Horizontal) | usaHorizontal | 4792 | iframe 670×119 | Assurance voyage USA |
| Insurance for USA (Vertical) | usaVertical | 4775 | iframe 320×356 | Assurance voyage USA (vertical) |

**Schengen Visa Insurance Search Form (Insubuy)** : non ajouté tant que l’URL/script correct n’est pas fourni (le script fourni initialement était identique à celui d’Aviasales Flight Search). À ajouter en `insurance.insubuy.schengenVisa` dès que disponible.

---

## Hôtels (hotels)

Section vide (Hotellook retiré). Le sélecteur renvoie un widget vol en remplacement.

---

## Sélection contextuelle

- **contextual-widget-placer-v2.js** : `getWidgetScript(slot, ...)` utilise `REAL_TRAVELPAYOUTS_WIDGETS[slot]`. Pour `flights` : premier provider + `searchForm` (Aviasales par défaut). Pour `insurance`, `connectivity`, etc. : premier provider, premier widget.
- **contextual-affiliate-injector.js** : décide les placements (`flights`, `insurance`, `connectivity`) selon mots-clés et pattern.
- **affiliate-module-renderer.js** : pour `insurance` utilise `REAL_TRAVELPAYOUTS_WIDGETS.insurance.visitorCoverage.travelMedical`.

---

## Notes

1. **Locale** : `fr` ou `en` selon le widget (Aviasales/Kiwi souvent `fr`, Airalo `en`).
2. **Iframes** : Insubuy USA utilise des iframes `tp.media/content` ; le champ `script` peut contenir du HTML (iframe) et est injecté tel quel.
3. **Déduplication** (article-finalizer) : cible `script[src*="..."]` et `form` ; les iframes ne sont pas concernées par la même logique.

**Dernière mise à jour :** alignée sur la liste Travelpayouts fournie (Aviasales, Kiwi, Airalo, Insubuy USA, VisitorCoverage).
