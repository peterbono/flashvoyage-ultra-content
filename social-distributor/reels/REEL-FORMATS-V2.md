# FlashVoyage Reels V2 — Strategie & Formats

> Analyse basee sur 42 reels (22 VoyagesPirates + 20 Trip.com), 4 agents specialistes.
> Date: 30 mars 2026

---

## SYNTHESE EXECUTIVE

6 formats proposes, 4 agents les ont challenge. Voici le plan consolide.

---

## LES 6 FORMATS

### FORMAT 1: HUMOR / SITUATION RELATABLE (Tier S)

**Concept**: Texte relatable en caps sur photo/video voyage + emoji reaction
**Duree**: 5-8s (single scene, pas de cuts)
**Inspiration**: VoyagesPirates (18.7K likes sur ce format)

**Structure scene par scene**:
| Scene | Duree | Contenu |
|-------|-------|---------|
| 1 (unique) | 5-8s | Photo/video Pexels en fond + texte relatable top + emoji reaction bottom-right |

**Texte overlay**:
- Situation: Montserrat 900, 72px, blanc, uppercase, top: 220px, centre, max 80 chars / 4 lignes
- Shadow: 4 directions 1px noir + blur 12px
- Fond: gradient bas 55% → rgba(0,0,0,0.85)

**Exemples de hooks** (generes par Haiku depuis les articles):
- "QUAND TU DECOUVRES QUE LE PAD THAI COUTE 1.50 EUR A BANGKOK"
- "MOI QUI EXPLIQUE MON ITINERAIRE DE 3 SEMAINES A MES COLLEGUES"
- "ARRIVER A KHAO SAN ROAD A 2H DU MAT SANS RESERVATION"

**Source contenu**: Articles flashvoyage.com → Haiku extrait situations relatables
**Pexels query**: "airport terminal", "backpacker hostel asia", "street food market"
**Audio**: Court stinger comedy (5-8s) ou silent
**Caption**: "Tag un pote qui fait EXACTEMENT la meme chose 😂\n\n#FlashVoyage #VoyageMeme #VoyageHumour #Backpacker"
**Automatisation**: 100% (Haiku genere le texte, Pexels le fond, emoji pioche en local)

> **POINT DE DEBAT (Growth Hacker)**:
> - PAS de meme faces (copyright + amateur pour un media editorial)
> - Utiliser des emoji reactions (😱🤣😭🫠) au lieu de visages decoupes
> - Le format "Quand tu..." marche mieux pour les 24-35 que les meme faces Gen Z

**Calendrier**: Mardi, Jeudi, Samedi a 18h Paris

---

### FORMAT 2: OU PARTIR EN [MOIS] (Tier S)

**Concept**: 5 destinations SE Asia recommandees pour le mois suivant
**Duree**: 15s (7 scenes)
**Inspiration**: Trip.com "Best places to visit in MARCH" (1,717 likes)

**Structure scene par scene**:
| Scene | Duree | Contenu |
|-------|-------|---------|
| 1 Hook | 2s | Drone clip + "OU PARTIR EN" (blanc 42px) + "[MOIS]" (jaune #FFD700, 120px) |
| 2-6 Dest | 2s chaque | Clip destination + pin rouge + nom ville + one-liner |
| 7 CTA | 1s | Fond flou + "ENREGISTRE POUR [MOIS]" + logo |

**Texte overlay**:
- Hook: Montserrat 900, "OU PARTIR EN" 42px blanc / "[MOIS]" 120px #FFD700
- Destinations: Pin rouge SVG (28x36px, #FF3B30) + Montserrat 800, 56px, blanc + sous-titre 30px 80% blanc
- Gradient bas: 40% du frame → rgba(0,0,0,0.75)

**Source contenu**: Fichier statique `month-destinations.json` (12 mois × 5 destinations SE Asia)
**Pexels query**: "[ville] travel" par destination
**Audio**: tropical-summer-beach-04.mp3, 18% volume, fade-out 1.5s
**Caption**: "Ou partir en {{MOIS}} ? 5 destinations parfaites ☀️\n\n📍 {{DEST_1}} — {{REASON}}\n...\n\nTu pars ou ? Dis-le en commentaire 👇\n\n#FlashVoyage #OuPartirEn{{MOIS}} #VoyageAsie"
**Automatisation**: 95% (JSON statique a maintenir 1x/an)

> **POINT DE DEBAT (Growth Hacker)**:
> - Renommer en "Ou partir en [Mois] avec [Budget]" pour se differencier de VP/Trip
> - Publier le 20-25 du mois PRECEDENT (pas le 1er — trop tard pour planifier)
> - Restreindre a l'Asie du Sud-Est uniquement (pas worldwide)

**Calendrier**: 20-25 de chaque mois + rappel le 1er (2x/mois)

---

### FORMAT 3: BUDGET JOUR (Tier S)

**Concept**: Budget quotidien detaille d'une destination ("Bali a 35 EUR/jour")
**Duree**: 15-20s (6 scenes)
**Inspiration**: Trip.com Budget Grid adapte — mais avec les VRAIS budgets des articles FV

> **CHANGEMENT MAJEUR (Growth Hacker)**:
> Le format "Cheap Flights Grid" avec prix de vols a ete TUE.
> Raison: FlashVoyage n'est pas Skyscanner, les prix changent quotidiennement,
> et afficher des prix faux detruit la credibilite.
> REMPLACE par "Budget Jour" qui utilise les donnees des articles existants.

**Structure scene par scene**:
| Scene | Duree | Contenu |
|-------|-------|---------|
| 1 Hook | 2s | Drone clip + "BUDGET VOYAGE" badge dore + "[DESTINATION]" 72px blanc |
| 2-5 Categories | 3s chaque | Reveal progressif: Hebergement → Nourriture → Transport → Activites (pilule verte avec prix) |
| 6 Total | 3s | Ligne doree separatrice + TOTAL en pilule doree + CTA |

**Texte overlay**:
- Hook: Badge "BUDGET VOYAGE" (Montserrat 800, 28px, noir sur #FFD700, border-radius 30px)
- Destination: Montserrat 900, 72px, blanc
- Categories: Montserrat 700, 32px, blanc 80% (gauche) + pilule verte rgba(0,209,126,0.9) avec prix Montserrat 800, 36px blanc (droite)
- Total: Montserrat 900, 40px, #FFD700 + pilule doree #FFD700, prix Montserrat 900, 44px, noir
- Fond: gradient sombre 135deg rgba(10,14,26,0.88) → rgba(26,26,46,0.88)

**Exemple**:
```
BALI — 2 SEMAINES

🏠 Hebergement     12 €/nuit
🍜 Nourriture       8 €/jour
🛵 Transport        5 €/jour
🎯 Activites        10 €/jour
━━━━━━━━━━━━━━━━━━━
TOTAL              35 €/JOUR
```

**Source contenu**: Articles flashvoyage.com (donnees budget deja presentes)
**Pexels query**: "[destination] aerial" pour le hook seulement, scenes budget = fond sombre genere
**Audio**: chill-travel-lofi-01.mp3, 15% volume
**Caption**: "{{DESTINATION}} a {{TOTAL}} EUR par jour — voici le detail 💰\n\nEnregistre ce Reel pour ton voyage\n\n#FlashVoyage #Budget{{DESTINATION}} #VoyagePasCher #BudgetVoyage"
**Automatisation**: 100% (donnees des articles, Haiku formate)

**Calendrier**: Lundi, Mercredi a 12h30 Paris

---

### FORMAT 4: TRIP PICK — X SPOTS A NE PAS RATER (Tier A)

**Concept**: 5-7 spots incontournables dans un pays/ville, cuts rapides
**Duree**: 7-10s
**Inspiration**: Trip.com "6 places you can't miss in Sicily" (818 likes, 7s seulement)

**Structure scene par scene**:
| Scene | Duree | Contenu |
|-------|-------|---------|
| 1 Title | 2s | Fond sombre/texture + nom pays en serif + "X SPOTS A NE PAS RATER" en jaune |
| 2-6 Spots | 1-1.5s | Clip Pexels rapide + nom du spot bold + numero badge dore |
| 7 CTA | 1s | "ENREGISTRE CE REEL" + underline jaune |

**Texte overlay**:
- Title: Playfair Display 700, 80px, blanc + "X SPOTS..." Montserrat 700, 32px, #FFD700
- Spots: Montserrat 900, 56px, blanc, bottom: 350px + badge numero top-left (cercle dore 60px, Montserrat 900, 32px, noir)
- Sous-titre: Montserrat 600, 28px, blanc 70%
- Gradient bas: 45% → rgba(0,0,0,0.90)
- Vignette: radial center 30% clair → edges rgba(0,0,0,0.60)

**Source contenu**: Articles par pays → Haiku extrait les spots + types
**Pexels query**: "[spot name] [country]", fallback "[country] tourism"
**Audio**: upbeat-travel-energy-01.mp3 (a ajouter), 20% volume, pas de fade
**Caption**: "{{N}} spots a ne pas rater a {{DEST}} {{FLAG}}\n\nLequel tu visites en premier ? 👇\n\n#FlashVoyage #{{DESTINATION}} #SpotsVoyage #Travel{{COUNTRY}}"
**Automatisation**: 100% (reutilise 80% du pipeline listicle existant)

**Calendrier**: Lundi, Mercredi, Vendredi a 12h30 Paris

---

### FORMAT 5: ENGAGEMENT POLL — TU CHOISIS QUOI ? (Tier A → PROMU Tier S par Growth Hacker)

**Concept**: Question polarisante + options numerotees, optimise pour les COMMENTAIRES
**Duree**: 5s (single scene)
**Inspiration**: VoyagesPirates (ratio comments/likes de 50-100%, le plus eleve de tous les formats)

> **RECOMMANDATION GROWTH HACKER**:
> Ce format devrait etre Tier S, pas Tier A. C'est LE format le plus important
> pour un compte a 0 followers. Les commentaires sont le signal #1 de l'algo IG.
> Publier 3x/semaine minimum au debut.

**Structure scene par scene**:
| Scene | Duree | Contenu |
|-------|-------|---------|
| 1 (unique) | 5s | Photo/video voyage + overlay sombre 75% + question + 2-4 options numerotees |

**Texte overlay**:
- Label: Montserrat 800, 24px, #FFD700, letter-spacing 3px, centre ("SONDAGE VOYAGE")
- Question: Montserrat 900, 56px, blanc, uppercase, max 4 lignes, centre
- Separateur: ligne doree 100x5px
- Options: barres avec fond rgba(255,255,255,0.12) + bord dore 2px 40%, badge numero cercle dore 72px (Montserrat 900, 36px, noir) + texte Montserrat 800, 40px, blanc
- Footer: Montserrat 700, 28px, #FFD700, "COMMENTE TON NUMERO ↓"

**Exemples de questions** (generes par Haiku):
- "BALI OU THAILANDE POUR 2 SEMAINES ?"
- "TU NE PEUX EN CHOISIR QU'UN : 1. Street food a Hanoi 2. Plage a El Nido 3. Temples a Bagan 4. Riziere a Ubud"
- "TON BUDGET PAR JOUR EN ASIE ? 1. Moins de 20 EUR 2. 20-35 EUR 3. 35-50 EUR 4. Plus de 50 EUR"

**Source contenu**: Articles avec comparaisons → Haiku genere questions
**Pexels query**: "tropical beach sunset", "asia travel landscape" (fond generique, readability > beaute)
**Audio**: chill-ambient-soft-03.mp3, 15% volume
**Caption**: "{{QUESTION}} 🤔\n\n1️⃣ {{OPT_1}}\n2️⃣ {{OPT_2}}\n3️⃣ {{OPT_3}}\n4️⃣ {{OPT_4}}\n\nCommente ton numero ! 👇\n\n#FlashVoyage #Sondage #TuChoisissQuoi #VoyageAsie"
**Automatisation**: 100% (le plus simple a produire)

**Calendrier**: Dimanche, Mercredi a 18h Paris (peak engagement)

---

### FORMAT 6: TRAVEL DIARY — CARNET DE VOYAGE (Tier A)

**Concept**: Montage de 3 clips avec esthetique vintage, cursive doree, postcard overlay
**Duree**: 9s (4 scenes)
**Inspiration**: Trip.com "Europe Travel Diary" (385 likes)

**Structure scene par scene**:
| Scene | Duree | Contenu |
|-------|-------|---------|
| 1 Title | 2s | Clip drone + cadre postcard + "CARNET DE VOYAGE" cursive doree + destination |
| 2 Clip A | 2.5s | Footage + vignette + grain + cursive evocative |
| 3 Clip B | 2.5s | Footage + vignette + grain + cursive evocative |
| 4 CTA | 2s | Carte postcard style "PROCHAINE ESCALE ?" + logo |

**Texte overlay**:
- Label: Montserrat 800, 24px, #FFD700, letter-spacing 3px ("CARNET DE VOYAGE")
- Title: Playfair Display 700, 48px, blanc
- Cursive: Dancing Script 600, 44px, #FFD700, bottom: 340px
- Postcard: 900x600px, fond #FFF8E7, border-radius 8px, padding 40px
  - Destination: Dancing Script 700, 56px, #2C1810
  - Corps: Playfair Display 400, 30px, #5C3D2E
  - Tampon: cercle 120px, bord #C41E3A 4px, rotation 15deg
- ffmpeg vintage: `eq=saturation=0.85:contrast=1.1:brightness=0.02, colorbalance=rs=0.05:gs=-0.02:bs=-0.08, vignette=PI/4, noise=c0s=8:c0f=t`

**Source contenu**: Articles immersifs/guides → Haiku genere texte poetique
**Pexels query**: "[destination] golden hour", "[destination] temple/market/nature"
**Audio**: cinematic-nostalgic-piano-01.mp3 (a ajouter), 20% volume, fade-in 1s + fade-out 1.5s
**Caption**: "{{DESTINATION}} — carnet de voyage 📓\n\n{{POETIC_LINE}}\n\nQuelle destination pour ton prochain carnet ? ✍️\n\n#FlashVoyage #CarnetDeVoyage #TravelDiary #{{DESTINATION}}"
**Automatisation**: 90% (assets postcard = one-time creation, le reste est auto)

> **POINT DE DEBAT (Growth Hacker)**:
> - L'esthetique vintage est plus "Conde Nast" que "budget backpacker"
> - Risque de deconnexion avec l'audience 24-35 budget
> - Si on le garde: s'assurer que le contenu reste UTILE, pas juste joli
> - Alternative proposee: "Avant/Apres" (expectation vs reality) — plus dans le ton

**Calendrier**: Dimanche a 7h Paris (contenu contemplatif matinal)

---

## CALENDRIER HEBDOMADAIRE

| Jour | 7h Paris | 12h30 Paris | 18h Paris |
|------|----------|-------------|-----------|
| **Lundi** | — | Trip Pick | — |
| **Mardi** | — | — | Humor |
| **Mercredi** | — | Budget Jour + Trip Pick | Engagement Poll |
| **Jeudi** | — | — | Humor |
| **Vendredi** | — | Trip Pick | — |
| **Samedi** | — | — | Humor |
| **Dimanche** | Travel Diary | — | Engagement Poll |

**Total**: 9 reels/semaine

**Formats mensuels** (remplacent un slot regulier):
- 20-25 du mois: "Ou partir en [mois+1]" (remplace un Trip Pick)
- 1er du mois: Rappel "Ou partir en [mois]" (remplace un Trip Pick)

---

## STRATEGIE DE LANCEMENT (Growth Hacker)

**Mois 1**: 1 reel/jour max. Alterner Engagement Poll (3x) + Listicle/Trip Pick (3x) + Humor (1x)
**Mois 2**: 2 reels/jour. Ajouter Budget Jour + Ou Partir En
**Mois 3+**: 3 reels/jour si engagement tient. Ajouter Travel Diary

> NE PAS lancer les 6 formats simultanement. Tester 2-3 formats, mesurer, iterer.

---

## REGLES VISUELLES CROSS-FORMAT

### Branding
- **Logo**: JAMAIS dans la video (sauf CTA final, opacity 0.45)
- Raison: VP et Trip n'en mettent pas → contenu organique > contenu brande
- **Reconnaissance**: via #FFD700 jaune + Montserrat 900 uppercase + gradient bas

### Typographie
| Usage | Font | Weight | Taille | Couleur |
|-------|------|--------|--------|---------|
| Hooks/titres | Montserrat | 900 | 56-80px | Blanc |
| Accents/CTA | Montserrat | 800 | 28-44px | #FFD700 |
| Sous-titres | Montserrat | 600-700 | 28-36px | Blanc 80% |
| Serif (Trip Pick/Diary) | Playfair Display | 700 | 48-80px | Blanc |
| Cursive (Diary) | Dancing Script | 600-700 | 44-56px | #FFD700 |

### Couleurs
| Element | Hex | Usage |
|---------|-----|-------|
| Blanc texte | #FFFFFF | Tous les formats |
| Jaune accent | #FFD700 | Badges, accents, CTA, cursive |
| Pin rouge | #FF3B30 | Best in Month, Trip Pick |
| Pilule verte | rgba(0,209,126,0.9) | Budget Jour (prix) |
| Fond sombre | #0a0e1a → #1a1a2e | Budget Jour (scenes data) |
| Postcard creme | #FFF8E7 | Travel Diary |

### Safe Zones (1080x1920)
- Top: 200px (UI Instagram)
- Bottom: 280px (caption/boutons)
- Sides: 40px marges
- Zone utile: 1000x1440px centree

---

## ARCHITECTURE TECHNIQUE (Pipeline v2)

### Structure fichiers
```
reels/
  index.js                          # CLI (--format humor|month|budget|pick|poll|diary --test)
  config.js                         # Registry formats + constantes
  schedule.json                     # Calendrier hebdo/mensuel

  core/
    ffmpeg.js                       # Wrappers ffmpeg/ffprobe
    overlay-renderer.js             # node-html-to-image wrapper
    clip-preparer.js                # Crop 9:16, scale, normalize

  data/
    script-router.js                # Detecte format + delegue
    generators/
      humor.js                      # Prompt Haiku humor
      best-in-month.js              # Prompt Haiku mois
      budget-jour.js                # Prompt Haiku budget
      trip-pick.js                  # Prompt Haiku spots
      engagement-poll.js            # Prompt Haiku sondage
      travel-diary.js               # Prompt Haiku carnet
    hook-validator.js               # GARDER (Haiku reecrit les hooks)

  assets/
    video-fetcher.js                # Pexels video (unifie)
    photo-fetcher.js                # Pexels photo (pour Humor/Poll)
    audio-picker.js                 # Selection musique
    dedup-tracker.js                # Tracking assets utilises
    static/
      reaction-emojis/              # Emoji PNG 120px
      map-pins/                     # SVG pins rouge
      postcard-frame.png            # Cadre postcard

  composers/
    base-composer.js                # Classe abstraite
    humor-composer.js               # Photo + overlay
    best-in-month-composer.js       # 5 clips + labels
    budget-jour-composer.js         # Data card + footage
    trip-pick-composer.js           # Titre + clips rapides
    engagement-poll-composer.js     # Photo + question overlay
    travel-diary-composer.js        # 3 clips + postcard + vintage

  publisher.js                      # GARDER (deja format-agnostique)

  templates/
    humor-overlay.html
    best-in-month-hook-overlay.html
    best-in-month-overlay.html
    budget-jour-title-overlay.html
    budget-jour-overlay.html
    trip-pick-overlay.html
    engagement-poll-overlay.html
    travel-diary-overlay.html
    (garder les anciens listicle-*.html)

  data/
    month-destinations.json         # 12 mois × 5 destinations
    content-used.json               # Dedup articles
    pexels-used.json                # GARDER
    reel-history.jsonl              # GARDER

  audio/
    chill-travel-lofi-01.mp3        # GARDER
    chill-ambient-soft-03.mp3       # GARDER
    tropical-summer-beach-04.mp3    # GARDER
    comedy-stinger-01.mp3           # A AJOUTER
    upbeat-travel-energy-01.mp3     # A AJOUTER
    cinematic-nostalgic-piano-01.mp3 # A AJOUTER
```

### CLI
```bash
# Test un format specifique
node reels/index.js --format humor --test

# Generer le batch du jour (selon schedule.json)
node reels/index.js --daily

# Generer pour une date specifique
node reels/index.js --daily --date 2026-04-15

# Mode batch semaine complete
node reels/index.js --weekly --dry-run
```

### Cout estime
- Par reel: ~$0.005 (Haiku) + $0 (Pexels) + CPU ffmpeg 30-60s
- Par jour (3 reels): ~$0.015
- Par mois (90 reels): ~$0.45

---

## AUDIO: PROBLEME CRITIQUE

> **ALERTE GROWTH HACKER**:
> 3 tracks royalty-free en boucle = mort algorithmique.
> Instagram favorise MASSIVEMENT les reels avec trending audio.
>
> **Recommandation**: Publier les 100 premiers reels SANS audio.
> Mesurer. Puis A/B tester avec trending audio ajoute manuellement
> sur les top performers.
>
> Alternative: IG Music Library API (dispo depuis 2025 pour comptes business)

---

## DECISIONS PRISES (30 mars 2026)

1. **Travel Diary → REMPLACE par "Avant/Apres"** (expectation vs reality)
2. **Engagement Poll → PROMU Tier S** (3x/semaine)
3. **Audio → Silent d'abord** (100 premiers reels sans audio, puis A/B test trending audio sur top performers)
4. **Lancement → Progressif** : Mois 1 = Poll + Listicle, Mois 2 = +Humor +Budget Jour, Mois 3 = +Trip Pick +Avant/Apres
5. **Humor visuals → A/B test** : emoji reactions ET meme illustrations, laisser la data decider

---

## FORMAT 6 MIS A JOUR: AVANT/APRES (remplace Travel Diary)

**Concept**: Expectation vs reality sur les destinations SE Asia
**Duree**: 8-12s (2-3 scenes)
**Cible algo**: SHARES + COMMENTAIRES (les gens tagguent des potes)

**Structure scene par scene**:
| Scene | Duree | Contenu |
|-------|-------|---------|
| 1 Expectation | 3-4s | Image/clip "parfait" (plage vide, temple serein) + "CE QUE TU IMAGINES" |
| 2 Reality | 3-4s | Image/clip reel (foule, chaos, street food bordel) + "CE QUE TU VIS VRAIMENT" |
| 3 CTA (optionnel) | 2s | "ET TOI C'ETAIT COMMENT ?" + logo |

**Texte overlay**:
- "CE QUE TU IMAGINES": Montserrat 900, 52px, blanc, top: 250px, centre
- "CE QUE TU VIS VRAIMENT": Montserrat 900, 52px, #FFD700, top: 250px, centre
- Destination: Montserrat 800, 36px, blanc 80%, sous le titre

**Source contenu**: Haiku genere des paires expectation/reality depuis les articles
**Pexels queries**:
- Expectation: "[destination] beautiful aerial", "[destination] luxury"
- Reality: "[destination] crowded", "[destination] street market busy", "[destination] rain"
**Audio**: Silent (reco Growth Hacker)
**Caption**: "{{DESTINATION}} : expectation vs reality 😅\n\nEt toi c'etait comment ? Dis-le en com' 👇\n\n#FlashVoyage #AvantApres #ExpectationVsReality #{{DESTINATION}}"
**Automatisation**: 100%
**Calendrier**: Dimanche a 18h (slot ex-Travel Diary)

---

## CALENDRIER HEBDO FINAL (v2 post-decisions)

| Jour | 12h30 Paris | 18h Paris |
|------|-------------|-----------|
| **Lundi** | Trip Pick | — |
| **Mardi** | — | Humor/Meme |
| **Mercredi** | Budget Jour | Engagement Poll |
| **Jeudi** | — | Humor/Meme |
| **Vendredi** | Trip Pick | — |
| **Samedi** | — | Humor/Meme |
| **Dimanche** | — | Engagement Poll + Avant/Apres (alterner) |

**Total**: 9 reels/semaine (a plein regime mois 3+)

## PLAN DE LANCEMENT PROGRESSIF

### Mois 1 (avril 2026): 1 reel/jour — 2 formats
- Engagement Poll: 3x/sem (Mer, Ven, Dim 18h)
- Trip Pick / Listicle: 4x/sem (Lun, Mar, Jeu, Sam 12h30)
- Objectif: trouver le ton, mesurer engagement de base

### Mois 2 (mai 2026): 2 reels/jour — 4 formats
- Ajouter: Humor/Meme (3x/sem 18h)
- Ajouter: Budget Jour (2x/sem 12h30)
- Garder: Poll (3x/sem) + Trip Pick (3x/sem)
- Objectif: doubler le reach, identifier les formats winners

### Mois 3 (juin 2026): 9 reels/semaine — 6 formats
- Ajouter: Avant/Apres (1x/sem Dim)
- Ajouter: Ou Partir En [Mois] (2x/mois)
- Plein regime
- Objectif: 3 reels/jour, optimiser le mix base sur les data

### A/B Test Humor (des le mois 2)
- Semaine A: emoji reactions (😱🤣😭🫠)
- Semaine B: meme illustrations custom (a creer)
- Comparer: reach, saves, shares, comments
- Decision finale apres 4 semaines de data
