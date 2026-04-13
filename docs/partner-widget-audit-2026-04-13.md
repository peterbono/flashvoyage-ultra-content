# FlashVoyage partner widget coverage audit

_Generated: 2026-04-13T10:08:28.263Z_

Read-only scan of published WordPress articles classifying partner widget coverage across 4 verticals (Flights, Hotels, Tours, eSIM).

## A. Summary

- **Articles scanned**: 133
- **Articles with at least 1 real Travelpayouts widget**: 33 (24.8%)
- **Articles with 2+ real widgets**: 4
- **Total fake affiliate cards to fix**: 0
- **High-opportunity absences (score >= 5)**: 5
- **Medium-opportunity absences (score 3-4)**: 50

### Per-vertical breakdown

| Vertical | REAL_WIDGET | FAKE_CARD | INLINE_LINK | ABSENT |
|---|---:|---:|---:|---:|
| flights | 10 | 0 | 1 | 122 |
| hotels | 0 | 0 | 0 | 133 |
| tours | 0 | 0 | 1 | 132 |
| esim | 27 | 0 | 1 | 105 |

### Widget IDs reference

- Flights: `promo_id=7879` (Aviasales / Kiwi via Travelpayouts)
- Hotels: variable (`hotellook`, Agoda, Booking via Travelpayouts)
- Tours / activities: `promo_id=3947` (GetYourGuide via Travelpayouts)
- eSIM: `promo_id=8588` (Airalo via Travelpayouts)
- Site marker: `shmarker=676421`, `trs=463418`

## B. Fake cards to fix

**No fake affiliate cards detected.** All styled CTA containers found embedding a partner URL already resolve to legitimate `tp.media` widgets or recognized containers.

Two articles do contain **unmonetized plain brand links** (`<a href="https://airalo.com">Airalo</a>` etc.) that are classified here as INLINE_LINK but are effectively leaking traffic without affiliate tracking. These are listed below as regressions worth converting:

| Slug | Vertical | Issue | Recommended action |
|---|---|---|---|
| esim-japon-combien-ca-te-coute-vraiment | esim | `<a href="https://airalo.com">` and `<a href="https://holafly.com">` with no affiliate tracking | Replace with real `promo_id=8588` widget or tp.media redirect (`tp.media/r?marker=676421&trs=463418&p=8588...`) |

## C. High-opportunity absences

Articles where a vertical widget is ABSENT but score >= 5 (title keyword match + article score >= 30 + destination + length signals).

| Slug | Score | Vertical missing | Keywords matched | Recommended widget ID |
|---|---:|---|---|---|
| esim-philippines-globe-smart-comparatif-2026 | 54 | esim | eSIM | 8588 |
| esim-vietnam-comparatif-forfait-2026-frais-caches | 44 | esim | eSIM | 8588 |
| esim-thailande-comparatif-ais-dtac-true-2026 | 34 | esim | eSIM | 8588 |
| choisir-le-bon-plan-esim-pour-bali-en-2026-ce-quon-ne-te-dit-pas | 28 | esim | eSIM | 8588 |
| voyager-au-japon-esim-et-frais-caches-a-connaitre | 14 | esim | eSIM | 8588 |

### Medium-opportunity absences (score 3-4, top 15)

Secondary candidates — worth queueing after HIGH are cleared.

| Slug | Score | Vertical | Keywords | Reco widget |
|---|---:|---|---|---|
| assurance-voyage-vietnam-rapatriement-frais-caches-2026 | 63 | flights | - | 7879 |
| assurance-voyage-vietnam-rapatriement-frais-caches-2026 | 63 | hotels | - | n/a (hotels) |
| assurance-voyage-vietnam-rapatriement-frais-caches-2026 | 63 | tours | - | 3947 |
| assurance-voyage-vietnam-rapatriement-frais-caches-2026 | 63 | esim | - | 8588 |
| voyage-thailande-pas-cher-2026-budget | 61 | hotels | - | n/a (hotels) |
| voyage-thailande-pas-cher-2026-budget | 61 | tours | - | 3947 |
| esim-philippines-globe-smart-comparatif-2026 | 54 | flights | - | 7879 |
| esim-philippines-globe-smart-comparatif-2026 | 54 | hotels | - | n/a (hotels) |
| esim-philippines-globe-smart-comparatif-2026 | 54 | tours | - | 3947 |
| esim-vietnam-comparatif-forfait-2026-frais-caches | 44 | flights | - | 7879 |
| esim-vietnam-comparatif-forfait-2026-frais-caches | 44 | hotels | - | n/a (hotels) |
| esim-vietnam-comparatif-forfait-2026-frais-caches | 44 | tours | - | 3947 |
| japon-couple-15-jours-budget-tout-compris-2026 | 41 | flights | - | 7879 |
| japon-couple-15-jours-budget-tout-compris-2026 | 41 | hotels | - | n/a (hotels) |
| japon-couple-15-jours-budget-tout-compris-2026 | 41 | tours | - | 3947 |

## D. Already well-covered

- **Articles with 2+ real widgets**: 4
- **Articles with at least 1 real widget (any vertical)**: 33
- **Coverage rate**: 24.8% of all published articles have at least one real Travelpayouts script widget.

## Notes & methodology

- **REAL_WIDGET** = content contains a `tp.media` `<script>` with both `shmarker=676421` and the vertical-specific `promo_id`. For hotels, falls back to detecting hotellook/agoda/trip.com containers with `shmarker`.
- **FAKE_CARD** = styled `<div>` (class matches `fv-(callout|cta|card|widget|box|promo|affiliate)` or inline style with `background` + `border-radius`) that contains a real `<a href>` to a partner URL **but no `shmarker` script**. FAQ accordions (`fv-faq-item`) and widget wrappers (`tp-flight-widget`, `tp-esim-widget`, `fv-byline`, `ez-toc-*`) are excluded from fake-card detection.
- **INLINE_LINK** = plain `<a href>` to a partner URL in prose, no styled CTA container.
- **ABSENT** = no partner URL or widget for that vertical. Plain text brand mentions (e.g., "Booking.com" as prose) are counted as ABSENT.
- Opportunity scoring: +3 title keyword match, +2 article score >= 30, +1 destination slug, +1 word count >= 1500. HIGH >= 5, MEDIUM 3-4, LOW <= 2.
- Scores sourced from `https://raw.githubusercontent.com/peterbono/flashvoyage-ultra-content/main/data/article-scores.json`.
- This is a read-only audit. No WordPress content was modified.
