# Tickets BDD — Evergreen 10/10

> 18 tickets prets a importer dans GitHub Issues.
> Generes depuis le Document operationnel Evergreen 10/10.

---

## Ticket P1 — Corriger le bug du scoring production-validator

> Bug critique : la boucle de validation compare un pourcentage (0-100) a un seuil de 10 — tout article > 10% passe.

**Estimate: 0.5h**

**Titre** : Fix scoring bug — targetScore 10 -> 85 dans production-validator.js

**Objectif** :
Debloquer la boucle de validation production pour qu'elle corrige effectivement les articles sous le seuil qualite EVERGREEN de 85%.

**Contexte** :
`production-validator.js` ligne 281 definit `targetScore = 10.0`. Or `getGlobalScore()` retourne un pourcentage (ex: "28.0"). Resultat : tout article > 10% est considere valide. La boucle de 5 iterations de correction ne s'active jamais. L'article 2807 affiche "28/10" et est publie sans correction.

**Preconditions** :
- `production-validator.js` accessible en ecriture
- `quality-analyzer.js` retourne un pourcentage 0-100 via `getGlobalScore().globalScore`
- Le seuil EVERGREEN dans `quality-analyzer.js` est 85%

**Scenario (Gherkin-like)** :

```
Etant donne que le quality-analyzer retourne un globalScore de "28.0" pour un article
Quand la boucle validateWithLoop() s'execute avec targetScore = 85.0
Alors 28.0 < 85.0 est evalue a true
Et la boucle tente des corrections (autoFix)
Et la boucle itere jusqu'a 5 fois ou jusqu'a score >= 85
```

**Resultat attendu** :
La constante `targetScore` vaut 85.0. Un article a 28% declenche la boucle de correction. Un article a 86% sort immediatement avec succes.

**Criteres d'acceptation** :
- [ ] `const targetScore = 85.0` dans production-validator.js (ancienne valeur : 10.0)
- [ ] Un article avec globalScore "28.0" declenche au moins 1 iteration de correction
- [ ] Un article avec globalScore "86.0" sort au tour 1 avec `success: true`
- [ ] Le log terminal affiche "Correction necessaire (score=28 < 85)" pour un article a 28%
- [ ] Le log terminal affiche "PROD_VALIDATION_SUCCESS" pour un article a 86%

**Tests automatises requis** :

Unit tests :
- Lire `production-validator.js`, verifier que la string `targetScore = 85` est presente → PASS si trouvee
- `parseFloat("28.0") < 85.0` === true → PASS
- `parseFloat("86.0") >= 85.0` === true → PASS

Integration tests :
- Mock `qualityAnalyzer.getGlobalScore()` retournant `{globalScore: "28.0"}`. Appeler `validateWithLoop()`. Verifier `result.iterations > 1` → PASS
- Mock retournant `{globalScore: "90.0"}`. Verifier `result.iterations === 1` et `result.success === true` → PASS

End-to-End tests :
- Pipeline complet → publier un article → verifier dans les logs terminal que "Correction necessaire" apparait si score < 85 → PASS

**Indicateurs de succes** :
- 100% des articles < 85% declenchent au moins 1 iteration de correction
- 0 article publie avec log "PROD_VALIDATION_COMPLETE" et score < 85% sans au moins 1 iteration

**Dependances** :
- Aucune — doit etre fait EN PREMIER

**Dependants** :
- P2, P5, P6 dependent de la boucle active

**Priorite** : High

**Risques connus** :
- `autoFix()` ne corrige que les liens casses et widgets. Les defauts editoriaux profonds ne seront pas corriges par cette boucle seule → Mitigation : P5 ajoute une correction pre-publication plus puissante via improve.
- `wordpressClient` peut etre null dans la boucle → Mitigation : verifier le log "WordPress client non disponible" et corriger le passage du client.

**Labels** :
- `priority:high`
- `type:pipeline`
- `bug`

**Milestone** : Sprint 1

*Fixes #P1.*

---

## Ticket P2 — Sections SERP obligatoires dans le prompt Evergreen

> Les 3 sections analytiques SERP valent 40 pts et le Quick Guide est un check bloquant — aucune n'est generee actuellement.

**Estimate: 1.5h**

**Titre** : Ajouter sections SERP obligatoires + Quick Guide dans le system prompt Evergreen

**Objectif** :
Forcer la generation des sections "Ce que les autres ne disent pas" (15 pts), "Limites et biais" (15 pts), "Erreurs frequentes" (10 pts) et du Quick Guide (check bloquant) dans chaque article Evergreen.

**Contexte** :
L'article 2807 ne contient aucune des 3 sections SERP attendues par `quality-analyzer.js` (`analyzeSERP()`). Le Quick Guide est absent, ce qui echoue le check bloquant dans `analyzeBlocking()` (score blocking = 0/100, soit -20 pts ponderes). Score SERP actuel sur les sections analytiques : ~0/40.

**Preconditions** :
- P1 complete (sinon la boucle ne detecte pas l'amelioration)
- `intelligent-content-analyzer-optimized.js` accessible (system prompt evergreen lignes 1432-1609)
- Pipeline Phase 2 implementee (Angle Hunter + truth pack)

**Scenario (Gherkin-like)** :

```
Etant donne que le system prompt Evergreen contient un bloc STRUCTURE OBLIGATOIRE
Quand generateEvergreenContent() est appele
Alors l'article HTML retourne contient au moins 2 H2 parmi :
  "Ce que les autres ne disent pas", "Limites et biais", "Erreurs frequentes"
Et l'article contient un H2 ou H3 "Quick Guide" ou "Checklist" avant la FAQ
Et analyzeSERP() retourne >= 30/40 pour les sections analytiques
```

**Resultat attendu** :
Le system prompt contient un bloc `STRUCTURE OBLIGATOIRE` avec 4 directives explicites. Les articles generes incluent systematiquement ces sections.

**Criteres d'acceptation** :
- [ ] Le prompt string contient : "Section H2 'Ce que les autres ne disent pas' : OBLIGATOIRE"
- [ ] Le prompt string contient : "Section H2 'Limites et biais de cet article' : OBLIGATOIRE"
- [ ] Le prompt string contient : "Section H2 'Erreurs frequentes' : RECOMMANDEE"
- [ ] Le prompt string contient : "Section 'Quick Guide' avec checklist : OBLIGATOIRE"
- [ ] Regex `/<h2[^>]*>.*(?:autres ne disent pas|limites et biais|erreurs? fr[eé]quentes?).*<\/h2>/i` matche >= 2 fois dans le HTML genere
- [ ] Regex `/<h[23][^>]*>.*(?:quick guide|checklist|guide rapide|en bref).*<\/h[23]>/i` matche >= 1 fois
- [ ] `analyzeSERP(html, 'evergreen')` retourne >= 30/40 pour les sections analytiques
- [ ] `analyzeBlocking(html, 'evergreen')` : Quick Guide check = pass

**Tests automatises requis** :

Unit tests :
- `systemPromptEvergreen.includes('Ce que les autres ne disent pas')` === true → PASS
- `systemPromptEvergreen.includes('Limites et biais')` === true → PASS
- `systemPromptEvergreen.includes('Quick Guide')` === true → PASS
- Token count du system prompt complet < 4000 tokens → PASS

Integration tests :
- Appeler `generateEvergreenContent()` avec donnees source standard → verifier >= 2 H2 SERP dans HTML → PASS
- Appeler `analyzeSERP(html, 'evergreen')` → score sections analytiques >= 30/40 → PASS
- Appeler `analyzeBlocking(html, 'evergreen')` → Quick Guide check passe → PASS

End-to-End tests :
- Pipeline complet → article publie → crawler HTML → verifier H2 SERP + Quick Guide presents → PASS

Regression tests :
- Les sections existantes (intro, FAQ, Articles connexes) ne sont pas affectees → PASS
- Le prompt ne depasse pas la fenetre contextuelle (~12000 tokens system + user) → PASS

**Indicateurs de succes** :
- >= 80% des articles generes contiennent au moins 2/3 sections SERP
- Score SERP moyen passe de ~0/40 a >= 30/40
- Quick Guide present dans >= 90% des articles

**Dependances** :
- P1 (boucle de validation active)

**Dependants** :
- P4 (expansion ajoute les sections manquantes)
- P5 (validation pre-pub detecte les sections)
- P6 (scoring compte les sections)

**Priorite** : High

**Risques connus** :
- Le LLM peut ignorer les directives de structure → Mitigation : verifier post-generation et relancer via improve (P4/P5)
- L'ajout de texte au prompt peut pousser la limite token → Mitigation : compter les tokens, garder < 4000 system

**Labels** :
- `priority:high`
- `type:prompt`
- `type:editorial`

**Milestone** : Sprint 2

*Fixes #P2.*

---

## Ticket P3 — Contextualiser les modules d'affiliation avec Angle Hunter

> Les modules affiliation affichent des phrases generiques identiques quel que soit l'article — remplacer par des phrases issues de la friction editoriale.

**Estimate: 1.5h**

**Titre** : Rendre les CTA affilies contextuels via affiliate_friction de l'Angle Hunter

**Objectif** :
Remplacer les descriptions statiques ("Utile si tu voyages sans assurance") par des phrases contextuelles construites depuis `angle.business_vector.affiliate_friction.cost_of_inaction` et `friction.moment`.

**Contexte** :
Les 5 types de modules ont la meme structure generique. L'Angle Hunter produit deja `affiliate_friction.moment` et `affiliate_friction.cost_of_inaction` specifiques a chaque article. Ces champs ne sont pas utilises dans le rendu HTML.

**Preconditions** :
- Angle Hunter retourne `angle.business_vector.affiliate_friction` (fields: moment, cost_of_inaction, resolver)
- `affiliate-module-renderer.js` accessible (lignes 20-80)
- `contextual-affiliate-injector.js` transmet le payload avec `source: 'angle_hunter'`

**Scenario (Gherkin-like)** :

```
Etant donne qu'un placement affilie a source='angle_hunter' et affiliate_friction defini
Quand renderAffiliateModule() est appele avec ce placement
Alors le titre du module reprend cost_of_inaction (pas "Utile si tu...")
Et la description mentionne un element specifique a l'article
Et le widget shortcode [fv_widget ...] est present
Et le disclaimer "Lien partenaire" est present

Etant donne qu'un placement affilie n'a PAS de source angle_hunter
Quand renderAffiliateModule() est appele
Alors les phrases generiques existantes sont utilisees (fallback)
```

**Resultat attendu** :
Les modules angle_hunter ont des titres et descriptions contextuels. Les modules keyword ont le fallback generique.

**Criteres d'acceptation** :
- [ ] Si `placement.payload.source === 'angle_hunter'` ET `affiliate_friction` existe : titre HTML ne contient PAS "Utile si tu voyages" / "Utile si tu planifies" / "Utile si tu cherches" / "Utile si tu as besoin" / "Utile si tu travailles"
- [ ] Le titre contextuel contient >= 1 mot present dans `affiliate_friction.cost_of_inaction`
- [ ] Si pas d'angle_hunter ou pas de friction : titre === fallback generique existant
- [ ] Widget shortcode `[fv_widget ...]` toujours present
- [ ] Disclaimer `<small>Lien partenaire</small>` toujours present
- [ ] Titre tronque a max 120 chars si cost_of_inaction trop long

**Tests automatises requis** :

Unit tests :
- `renderAffiliateModule({id:'insurance', payload:{source:'angle_hunter'}}, geo, {cost_of_inaction:'300 euros de frais medicaux'})` → titre ne contient PAS "Utile si tu" → PASS
- `renderAffiliateModule({id:'insurance', payload:{source:'keyword'}}, geo, null)` → titre contient "Utile si tu" → PASS
- HTML retourne contient `<aside class="affiliate-module">` → PASS
- HTML retourne contient `[fv_widget` → PASS

Integration tests :
- Pipeline avec angle contenant affiliate_friction → module HTML contient des mots de la friction → PASS
- Pipeline sans affiliate_friction → module utilise fallback → PASS

Regression tests :
- Widget shortcode intact → PASS
- Disclaimer present → PASS
- Structure HTML aside valide → PASS

**Indicateurs de succes** :
- 100% des modules avec source angle_hunter ont un titre contextuel (pas generique)
- K5 (CTA sur friction) passe pour tous les modules angle_hunter

**Dependances** :
- Aucune (parallele a P2)

**Dependants** :
- Aucun

**Priorite** : Medium

**Risques connus** :
- `cost_of_inaction` peut etre vague ou < 10 chars → Mitigation : fallback vers generique si < 10 chars
- Ton du titre peut ne pas matcher le tutoiement → Mitigation : prefixer par "Tu viens de voir que..." ou "Attention :"

**Labels** :
- `priority:medium`
- `type:editorial`
- `type:pipeline`

**Milestone** : Sprint 2

*Fixes #P3.*

---

## Ticket P4 — Coherence d'angle dans expansion et improve

> L'angle est present dans l'intro mais disparait dans le corps apres expansion — empecher la dilution.

**Estimate: 2h**

**Titre** : Renforcer la coherence d'angle dans les prompts expansion + improve + controle post-expansion

**Objectif** :
Empecher la dilution de l'angle editorial lors des passes LLM post-generation en ajoutant des contraintes explicites dans les prompts et un controle de ratio post-expansion.

**Contexte** :
L'expansion recoit l'angle dans `tensionBlock` mais le LLM peut l'ignorer et ajouter du contenu generique. L'improve ne reformule pas les H2 descriptifs. L'article 2807 a 50% de H2 non decisionnels. L'angle est present dans l'intro (P1-P3) mais disparait dans les sections H2.3+.

**Preconditions** :
- P2 complete (sections SERP dans le prompt initial)
- `intelligent-content-analyzer-optimized.js` accessible (expansion lignes 2858-2878, improve lignes 3125-3147)
- `angle.primary_angle.tension` disponible dans le contexte pipeline

**Scenario (Gherkin-like)** :

```
Etant donne qu'un article est genere avec angle.tension = "optimiser un budget de 500 euros"
Quand expandEvergreenContent() est appele
Alors le system prompt contient "Chaque paragraphe ajoute DOIT faire avancer la tension editoriale"
Et le ratio de mots-cles angle (budget, optimiser, euros) ne diminue pas de > 30%
Et si sections SERP manquantes, l'expansion les ajoute

Etant donne qu'un article a 3 H2 sans marqueur decisionnel
Quand improveContentWithLLM() est appele
Alors le system prompt contient "Verifie que chaque H2 contient un element decisionnel"
Et au moins 2/3 H2 descriptifs sont reformules avec un marqueur
```

**Resultat attendu** :
Le ratio angle est stable post-expansion. Les H2 descriptifs sont reformules par improve.

**Criteres d'acceptation** :
- [ ] System prompt expansion contient "Chaque paragraphe ajoute DOIT faire avancer la tension editoriale"
- [ ] System prompt expansion contient "Si les sections 'Ce que les autres ne disent pas' ou 'Limites et biais' sont absentes, AJOUTE-LES"
- [ ] System prompt improve contient "Verifie que chaque H2 contient un element decisionnel"
- [ ] Fonction de controle ratio implementee : mots-cles tension (mots > 4 lettres), ratio pre/post expansion
- [ ] Si ratio baisse > 30% : expansion rejetee, original conserve, log "EXPANSION_REJECTED: angle_dilution"
- [ ] Regex H2 decisionnel : `/<h2[^>]*>.*(?:arbitrage|choix|optimiser|maximiser|vrai|réalité|piège|erreur|éviter|stratégi|planifi|comment|pourquoi|faut-il|versus|coût|prix).*<\/h2>/i`

**Tests automatises requis** :

Unit tests :
- `expansionSystemPrompt.includes('tension editoriale')` === true → PASS
- `improveSystemPrompt.includes('element decisionnel')` === true → PASS
- Controle ratio : 5 occurrences avant, 2 apres → ratio 60% baisse → rejet → PASS
- Controle ratio : 5 occurrences avant, 4 apres → ratio 20% baisse → accepte → PASS

Integration tests :
- Generer article + expansion → ratio angle pre/post mesure → baisse < 30% → PASS
- Article avec 3 H2 descriptifs → improve → au moins 2 reformules → PASS

Regression tests :
- L'expansion ne supprime aucun contenu existant → PASS
- L'improve ne supprime aucune section → PASS

**Indicateurs de succes** :
- Ratio angle post-expansion diminue < 30% dans >= 90% des cas
- >= 80% H2 de contenu sont decisionnels apres improve (K2)

**Dependances** :
- P2

**Dependants** :
- P6

**Priorite** : High

**Risques connus** :
- Controle ratio trop strict → rejet d'expansions valides → Mitigation : seuil configurable (env var), logging ratio
- LLM reformule H2 de maniere non naturelle → Mitigation : consigne "reformule naturellement"

**Labels** :
- `priority:high`
- `type:prompt`
- `type:pipeline`

**Milestone** : Sprint 3

*Fixes #P4.*

---

## Ticket P5 — Validation qualite pre-publication avec seuil 85%

> Actuellement le scoring se fait APRES publication — l'article mauvais est deja en ligne.

**Estimate: 2.5h**

**Titre** : Ajouter une boucle de validation qualite pre-publication avec correction ciblee

**Objectif** :
Scorer l'article AVANT publication WordPress. Si le score est < 85%, relancer `improveContentWithLLM()` avec des instructions de correction specifiques aux checks echoues. Maximum 2 iterations.

**Contexte** :
Le quality-analyzer n'est appele qu'APRES publication dans la boucle post-pub. L'autoFix de cette boucle ne corrige que liens/widgets, pas les defauts editoriaux. Resultat : articles de mauvaise qualite publies sans correction.

**Preconditions** :
- P1 complete (seuil 85 actif)
- P6 complete (scoring enrichi avec angle + H2 + descriptifs)
- `quality-analyzer.js` importable dans `enhanced-ultra-generator.js`
- `improveContentWithLLM()` accessible

**Scenario (Gherkin-like)** :

```
Etant donne qu'un article finalise obtient un score de 65%
Quand la validation pre-publication s'execute (avant publishToWordPress)
Alors le systeme identifie les checks echoues (ex: SERP sections=fail, H2 decisionnels < 80%)
Et construit des instructions de correction specifiques ("Ajoute les sections SERP manquantes...")
Et relance improveContentWithLLM() avec ces instructions
Et re-score l'article
Et publie si score >= 85% ou apres max 2 iterations

Etant donne qu'un article finalise obtient un score de 90%
Quand la validation pre-publication s'execute
Alors l'article est publie directement sans iteration supplementaire
```

**Resultat attendu** :
Aucun article n'est publie sans avoir ete score. Les articles < 85% passent par 1-2 iterations de correction ciblee.

**Criteres d'acceptation** :
- [ ] `getGlobalScore()` est appele AVANT `publishToWordPress()` dans enhanced-ultra-generator.js
- [ ] Si score < 85% : `improveContentWithLLM()` est appele avec instructions issues des checks echoues
- [ ] Maximum 2 iterations pre-publication
- [ ] Log "Pre-pub score: X%" et "Post-improve score: Y%" a chaque iteration
- [ ] Si score reste < 80% apres 2 iterations : publication avec warning "QUALITY_BELOW_THRESHOLD" (pas de blocage dur)
- [ ] Si score >= 85% : publication directe, log "Pre-pub score: X% — PASS"

**Tests automatises requis** :

Unit tests :
- Fonction constructInstructions(checks) : input [{name:'SERP', status:'fail'}] → output contient "Ajoute" → PASS
- Score 65% → improve appele → PASS
- Score 90% → improve PAS appele → PASS

Integration tests :
- Article score 65% → passe par improve → score post >= score pre → PASS
- Article score 90% → publie directement → PASS
- Logs contiennent "Pre-pub score" → PASS

End-to-End tests :
- Pipeline complet → logs montrent correction pre-pub → article publie avec score >= 80% → PASS

Regression tests :
- improve ne supprime pas de contenu → PASS
- improve ne casse pas widgets/affilies → PASS
- Temps pipeline n'augmente pas de > 60s par iteration → PASS

**Indicateurs de succes** :
- 0 article publie avec score < 80%
- >= 70% des articles atteignent 85% apres 1 iteration improve
- Temps moyen d'iteration improve : < 30s

**Dependances** :
- P1, P6

**Dependants** :
- Aucun (derniere etape pipeline)

**Priorite** : High

**Risques connus** :
- Improve peut ne pas ameliorer le score → Mitigation : instructions tres specifiques issues des checks echoues
- 2 iterations ajoutent 30-60s → Mitigation : ne declencher que si < 85%
- Improve peut casser widgets/quotes → Mitigation : garde-fous existants dans improveContentWithLLM

**Labels** :
- `priority:high`
- `type:pipeline`

**Milestone** : Sprint 4

*Fixes #P5.*

---

## Ticket P6 — Enrichir quality-analyzer avec angle + H2 decisionnels + descriptifs

> Le scoring actuel ne distingue pas un article strategique d'un article generique — ajouter 3 checks editoriaux.

**Estimate: 2.5h**

**Titre** : Ajouter 3 checks editoriaux dans analyzeContentWriting() : angle coherence, H2 decisionnels, paragraphes descriptifs

**Objectif** :
Faire refleter au score quality-analyzer les dimensions editoriales cles pour qu'il distingue un article strategique (score eleve) d'un article generique (score penalise).

**Contexte** :
Le scoring actuel (Content Writing, poids 40%) ne mesure ni la coherence d'angle, ni la qualite des H2, ni le ratio de paragraphes descriptifs. Un article generique peut scorer aussi haut qu'un article strategique.

**Preconditions** :
- P4 complete (l'angle est propage dans le contenu)
- `quality-analyzer.js` accessible (analyzeContentWriting() lignes 335-555)
- `getGlobalScore()` accepte un parametre optionnel `angle`

**Scenario (Gherkin-like)** :

```
Etant donne qu'un article a 3 H2 sans marqueur decisionnel et 25% paragraphes descriptifs
Quand analyzeContentWriting() est execute
Alors le score recoit -9 pts (3 x -3) pour H2 non decisionnels
Et -5 pts pour ratio descriptif > 20%

Etant donne qu'un article a angle.tension present dans 4/5 sections
Quand analyzeContentWriting() est execute avec l'angle en parametre
Alors le score recoit +10 pts pour angle coherence (4/5 = 80% >= 60%)
```

**Resultat attendu** :
Le delta de score entre article strategique et article generique est >= 15 pts.

**Criteres d'acceptation** :

Check "Angle coherence" (+10 pts max) :
- [ ] Extraire mots-cles de `angle.primary_angle.tension` (mots > 4 lettres, hors stop words FR, max 5)
- [ ] Pour chaque section H2 : verifier presence >= 1 mot-cle dans le texte sous le H2
- [ ] >= 60% sections avec mot-cle → +10 pts
- [ ] >= 40% → +5 pts
- [ ] < 40% ou angle non fourni → 0 pts (pas de penalite)

Check "H2 decisionnels" (-3 pts/H2, cap -15) :
- [ ] Regex H2 : `/<h2[^>]*>(.*?)<\/h2>/gi`
- [ ] Exclure H2 : `/questions? fréquentes|quick guide|checklist|articles? connexes|comparatif|ce qu.il faut retenir/i`
- [ ] Tester chaque H2 restant : `/arbitrage|choix|optimiser|maximiser|vrai|réalité|piège|erreur|éviter|stratégi|planifi|comment|pourquoi|faut-il|versus|coût|prix/i`
- [ ] -3 pts par H2 sans match, cap -15

Check "Paragraphes descriptifs" (-5 pts si > 20%) :
- [ ] Regex paragraphe : `/<p[^>]*>(.*?)<\/p>/gi` (texte > 30 chars, hors balises)
- [ ] Descriptif = commence par `/^(Le |La |Les |Un |Une |Des |Il y a |C'est |On trouve |Dans |Avec )/i` ET ne contient PAS `/arbitrage|choix|coût|prix|risque|piège|erreur|éviter|attention|cependant|en revanche|mais|toutefois|plutôt|mieux|pire/i`
- [ ] > 20% descriptifs → -5 pts
- [ ] <= 20% → 0 pts

**Tests automatises requis** :

Unit tests :
- HTML avec 5 H2 dont 3 decisionnels → penalite = -6 (2 x -3) → PASS
- HTML avec 20 paragraphes dont 5 descriptifs (25%) → penalite = -5 → PASS
- HTML avec angle "budget" dans 4/5 sections → +10 pts → PASS
- HTML sans angle fourni → 0 pts, pas d'erreur → PASS

Integration tests :
- Article 2807 re-score → delta mesure → PASS si delta coherent
- Article "ideal" simule → Content Writing >= 90% → PASS
- Article "generique" simule → Content Writing < 60% → PASS

Regression tests :
- Les 8 checks existants de analyzeContentWriting() inchanges → PASS
- Score total dans plage 0-100% → PASS

**Indicateurs de succes** :
- Delta score strategique vs generique >= 15 pts
- Article 2807 sans corrections P2/P4 : score baisse de ~5-10 pts (penalites H2 + descriptifs)

**Dependances** :
- P4

**Dependants** :
- P5

**Priorite** : High

**Risques connus** :
- Regex H2 decisionnel → faux negatifs → Mitigation : liste marqueurs evolutive, logging H2 non matchants
- Extraction mots-cles angle bruitee → Mitigation : stop words FR, min 4 lettres, max 5 mots-cles

**Labels** :
- `priority:high`
- `type:testing`
- `type:pipeline`

**Milestone** : Sprint 3

*Fixes #P6.*

---

## Ticket P7 — Injection automatique de liens internes

> 0 liens internes actuellement — score liens = 0/100.

**Estimate: 2h**

**Titre** : Injecter 3-5 liens internes contextuels dans les articles avant publication

**Objectif** :
Quand le corpus d'articles publies atteint >= 3, injecter automatiquement des liens internes contextuels pour ameliorer le maillage SEO et le score liens (+9 pts ponderes).

**Contexte** :
L'article 2807 a 0 liens internes. `quality-analyzer.js` attend `floor(wordCount/400)` a `ceil(wordCount/200)` liens. Pour 2500 mots : 6-13 ideaux. La base `data/internal-links.json` est actuellement vide.

**Preconditions** :
- `data/internal-links.json` contient >= 3 articles avec URL, titre, destination, theme
- `article-finalizer.js` accessible
- La base est peuplee par le crawler WordPress en fin de pipeline

**Scenario (Gherkin-like)** :

```
Etant donne que data/internal-links.json contient 5 articles
Quand un nouvel article sur le Vietnam est finalise
Alors 3-5 liens <a href="https://flashvoyage.com/..."> sont injectes
Et les ancres font 2-5 mots (pas "cliquez ici")
Et au moins 2 liens sont dans les premiers 30% du contenu
Et aucun lien ne pointe vers l'article lui-meme

Etant donne que data/internal-links.json est vide
Quand un article est finalise
Alors aucun lien n'est injecte et aucune erreur n'est levee
```

**Resultat attendu** :
Les articles contiennent des liens internes contextuels des que le corpus le permet. Score liens passe de 0/100 a >= 60/100.

**Criteres d'acceptation** :
- [ ] Si base >= 3 articles : HTML contient 3-5 liens `<a href="https://flashvoyage.com/...">` avec ancres 2-5 mots
- [ ] >= 2 liens dans les premiers 30% du contenu
- [ ] Aucun lien vers l'article lui-meme
- [ ] Si base vide : HTML inchange, pas d'erreur
- [ ] `analyzeInternalLinks(html, 'evergreen')` retourne >= 60/100 apres injection

**Tests automatises requis** :

Unit tests :
- Base vide → HTML inchange → PASS
- Base 5 articles → HTML contient 3-5 liens ajoutes → PASS
- Ancres generees entre 2 et 5 mots → PASS
- Aucun lien auto-referentiel → PASS

Integration tests :
- `analyzeInternalLinks(html)` → score >= 60/100 → PASS
- Liens injectes dans le texte (pas dans headers/asides) → PASS

Regression tests :
- Liens existants (Reddit, externes) non affectes → PASS
- Widgets et affilies non modifies → PASS

**Indicateurs de succes** :
- Score liens : 0/100 → >= 60/100
- Impact score global : +9 pts ponderes

**Dependances** :
- Prerequis operationnel : corpus >= 3 articles publies

**Dependants** :
- Aucun

**Priorite** : Low (repasser a Medium quand corpus atteint)

**Risques connus** :
- Liens vers articles en brouillon/supprimes → Mitigation : verifier status 'publish'
- Ancres trop generiques → Mitigation : construire depuis titre article cible, tronquer 5 mots
- Base desynchronisee → Mitigation : mise a jour a chaque publication (deja fait)

**Labels** :
- `priority:low`
- `type:pipeline`
- `type:editorial`

**Milestone** : Sprint 5

*Fixes #P7.*

---

## Ticket P8 — Generation initiale a 2500 mots

> Reduire l'expansion (source de dilution) en produisant directement des articles plus longs.

**Estimate: 0.5h**

**Titre** : Monter la generation initiale a 2500 mots et le seuil d'expansion a 2200

**Objectif** :
Eliminer l'expansion dans 80% des cas en augmentant la longueur cible de la generation initiale, reduisant la dilution d'angle et les risques d'invention.

**Contexte** :
La generation vise 2000 mots. L'expansion comble si < 2000. L'expansion est la source principale de dilution. Monter a 2500 mots reduit la frequence d'expansion. Cout API avec gpt-4o-mini reste negligeable (~$0.004/article).

**Preconditions** :
- `intelligent-content-analyzer-optimized.js` accessible
- `enhanced-ultra-generator.js` accessible (seuil expansion)
- Budget API acceptable pour max_tokens 12000

**Scenario (Gherkin-like)** :

```
Etant donne que le system prompt demande MINIMUM 2500 mots et max_tokens = 12000
Quand la generation initiale est declenchee
Alors l'article fait >= 2200 mots dans 80% des cas
Et l'expansion est skipee si wordCount >= 2200
Et le cout API par article reste < $0.02
```

**Resultat attendu** :
80% des articles ne necessitent plus d'expansion. Le cout API reste negligeable.

**Criteres d'acceptation** :
- [ ] System prompt contient "MINIMUM 2500 mots"
- [ ] `max_tokens` = 12000 dans l'appel API
- [ ] Seuil expansion skip = 2200 dans enhanced-ultra-generator.js
- [ ] Sur 5 generations test : >= 4 font >= 2200 mots

**Tests automatises requis** :

Unit tests :
- `systemPromptEvergreen.includes('MINIMUM 2500 mots')` === true → PASS
- `maxTokens === 12000` dans l'appel LLM → PASS
- Seuil expansion skip === 2200 → PASS

Integration tests :
- Generer 3 articles → wordCount moyen >= 2200 → PASS
- Expansion skipee quand wordCount >= 2200 (log "Skip expansion") → PASS

Regression tests :
- Sections SERP (P2) toujours presentes → PASS
- Qualite editoriale stable → PASS

**Indicateurs de succes** :
- >= 80% articles >= 2200 mots sans expansion
- Cout API < $0.02/article
- Ratio angle post-generation stable

**Dependances** :
- Aucune

**Dependants** :
- Aucun

**Priorite** : Medium

**Risques connus** :
- LLM produit du remplissage → Mitigation : TENSION ORBITALE + truth pack contraignent deja. Combiner avec P4.
- Cout API +50% tokens → Mitigation : gpt-4o-mini reste < $0.02/article. Fallback : max_tokens 8000.

**Labels** :
- `priority:medium`
- `type:prompt`
- `type:pipeline`

**Milestone** : Sprint 1

*Fixes #P8.*

---

## Ticket K1 — Test automatise : Tension dans l'intro

> Verifier que l'intro reprend le hook de l'Angle Hunter.

**Estimate: 0.5h**

**Titre** : Implementer test K1 — Tension hook dans les premiers 500 chars

**Objectif** :
Valider automatiquement que l'intro de chaque article contient >= 2 mots-cles du hook de l'Angle Hunter.

**Contexte** :
L'intro est le signal de qualite le plus visible. Si le hook n'est pas present, l'article perd sa tension des le depart.

**Preconditions** :
- `angle.primary_angle.hook` disponible
- HTML article genere

**Scenario (Gherkin-like)** :

```
Etant donne que angle.hook = "optimiser un budget de 500 euros au Vietnam sans surprises"
Quand le test K1 s'execute sur les 500 premiers chars du HTML (hors balises)
Alors les mots-cles extraits sont ["optimiser", "budget", "euros", "vietnam", "surprises"]
Et >= 2 sont presents dans l'intro
Et le test retourne PASS
```

**Criteres d'acceptation** :
- [ ] Extraction mots-cles : mots > 4 lettres du hook, hors stop words FR, case-insensitive
- [ ] Segment : premiers 500 chars du HTML, balises retirees
- [ ] Seuil : >= 2 mots-cles presents → PASS
- [ ] < 2 → FAIL avec message "Intro ne contient pas assez de mots-cles de l'angle. Attendus: [liste]. Trouves: [liste]"

**Tests automatises requis** :

Unit tests :
- Hook "optimiser budget euros vietnam" + intro "Tu arrives au Vietnam avec 500 euros" → mots trouves: ["vietnam", "euros"] → PASS
- Hook "securite sanitaire" + intro "Le pho fumant dans les rues" → mots trouves: [] → FAIL

**Priorite** : Medium
**Labels** : `priority:medium`, `type:testing`
**Milestone** : Sprint 3

*Fixes #K1.*

---

## Ticket K2 — Test automatise : Arbitrages dans chaque H2

> Verifier que >= 80% des H2 de contenu contiennent un marqueur decisionnel.

**Estimate: 0.5h**

**Titre** : Implementer test K2 — H2 decisionnels >= 80%

**Objectif** :
Detecter automatiquement les H2 non decisionnels pour les corriger avant publication.

**Contexte** :
L'article 2807 a 50% de H2 decisionnels. La concurrence top est a 80-100%.

**Preconditions** :
- HTML article genere

**Scenario (Gherkin-like)** :

```
Etant donne un article avec 5 H2 de contenu et 2 H2 utilitaires (FAQ, Quick Guide)
Quand le test K2 s'execute
Alors les 2 H2 utilitaires sont exclus
Et chaque H2 restant est teste contre la regex decisionnelle
Et si >= 4/5 matchent (80%) le test retourne PASS
```

**Criteres d'acceptation** :
- [ ] Regex exclusion : `/questions? fréquentes|quick guide|checklist|articles? connexes|comparatif|ce qu.il faut retenir/i`
- [ ] Regex decisionnelle : `/arbitrage|choix|optimiser|maximiser|vrai|réalité|piège|erreur|éviter|stratégi|planifi|comment|pourquoi|faut-il|versus|coût|prix/i`
- [ ] Seuil : >= 80% des H2 non exclus matchent → PASS
- [ ] < 80% → FAIL avec "H2 non decisionnel detecte : '[titre H2]'"

**Tests automatises requis** :

Unit tests :
- H2s ["Pourquoi chaque choix est un arbitrage", "Le vrai cout", "Hebergement", "FAQ"] → exclus: FAQ → match: 2/3 = 67% → FAIL
- H2s ["Choix logistique", "Le vrai cout", "Pourquoi eviter", "Piege a touristes", "FAQ"] → exclus: FAQ → match: 4/4 = 100% → PASS

**Priorite** : High
**Labels** : `priority:high`, `type:testing`, `type:editorial`
**Milestone** : Sprint 3

*Fixes #K2.*

---

## Ticket K3 — Test automatise : Preuves sourcees >= 2

> Verifier la presence de blockquotes Reddit et blocs arbitrage.

**Estimate: 0.5h**

**Titre** : Implementer test K3 — Preuves sourcees >= 2

**Objectif** :
Valider que chaque article contient au moins 2 preuves sourcees (citations Reddit ou blocs arbitrage E-E-A-T).

**Contexte** :
L'autorite E-E-A-T exige des preuves sourcees. Les concurrents top en ont 3-5 par article.

**Preconditions** :
- HTML article genere

**Scenario (Gherkin-like)** :

```
Etant donne un article avec 1 blockquote Reddit et 1 div data-fv-move="arbitrage"
Quand le test K3 s'execute
Alors le regex matche 2 fois
Et le test retourne PASS
```

**Criteres d'acceptation** :
- [ ] Regex : `/<blockquote[^>]*data-source="reddit"|<div[^>]*data-fv-proof|<div[^>]*data-fv-move="arbitrage"/gi`
- [ ] Seuil : >= 2 matches → PASS
- [ ] < 2 → FAIL avec "Seulement [N] preuves sourcees (minimum 2)"

**Priorite** : Medium
**Labels** : `priority:medium`, `type:testing`
**Milestone** : Sprint 3

*Fixes #K3.*

---

## Ticket K4 — Test automatise : Decisions concretes >= 2

> Verifier la presence de blocs "Notre arbitrage".

**Estimate: 0.5h**

**Titre** : Implementer test K4 — Blocs arbitrage >= 2

**Objectif** :
Valider que chaque article contient au moins 2 verdicts explicites ("Notre arbitrage : ...").

**Preconditions** :
- HTML article genere

**Scenario (Gherkin-like)** :

```
Etant donne un article avec 3 div data-fv-move="arbitrage"
Quand le test K4 s'execute
Alors 3 >= 2 → PASS
```

**Criteres d'acceptation** :
- [ ] Regex : `/data-fv-move="arbitrage"/gi`
- [ ] Seuil : >= 2 → PASS
- [ ] < 2 → FAIL avec "Seulement [N] bloc(s) arbitrage (minimum 2)"

**Priorite** : Medium
**Labels** : `priority:medium`, `type:testing`
**Milestone** : Sprint 3

*Fixes #K4.*

---

## Ticket K5 — Test automatise : CTA affilies precedes de friction

> Verifier que chaque module affilie est precede d'un marqueur de risque/cout dans les 500 chars precedents.

**Estimate: 0.5h**

**Titre** : Implementer test K5 — CTA sur friction 100%

**Objectif** :
Valider que les modules affilies sont ancres dans une friction editoriale reelle, pas places au hasard.

**Preconditions** :
- HTML article avec modules affilies

**Scenario (Gherkin-like)** :

```
Etant donne un article avec 2 modules affilies
Quand le test K5 s'execute pour chaque module
Alors les 500 chars precedant chaque <aside class="affiliate-module"> sont extraits
Et chaque segment contient >= 1 marqueur de friction
Et le test retourne PASS pour les 2 modules
```

**Criteres d'acceptation** :
- [ ] Pour chaque `<aside class="affiliate-module">` : extraire 500 chars precedents
- [ ] Regex friction : `/risque|frais|coût|perte|urgence|imprévu|problème|piège|attention|danger|dépense|surprise|cher|élevé|manqu/i`
- [ ] 100% modules avec friction → PASS
- [ ] < 100% → FAIL avec "Module '[id]' non precede de friction"

**Priorite** : Medium
**Labels** : `priority:medium`, `type:testing`, `type:editorial`
**Milestone** : Sprint 3

*Fixes #K5.*

---

## Ticket K6 — Test automatise : Zero invention factuelle

> Verifier qu'aucun token numerique n'est invente hors du truth pack.

**Estimate: 1h**

**Titre** : Implementer test K6 — Invention Guard PASS/FAIL

**Objectif** :
Valider automatiquement qu'aucun chiffre dans l'article n'est absent du truth pack (tolerance pour calculs derives).

**Preconditions** :
- HTML article + `allowedNumberTokens` du truth pack

**Scenario (Gherkin-like)** :

```
Etant donne un article avec tokens ["500", "30", "16.6", "7"]
Et un truth pack avec allowedNumberTokens ["500", "30", "7"]
Quand le test K6 s'execute
Alors "16.6" est identifie comme 500/30 (calcul derive) → accepte
Et 0 token invente → PASS
```

**Criteres d'acceptation** :
- [ ] Extraction tokens : `/\d[\d\s,.]*\d|\d+/g` sur le texte HTML (hors balises)
- [ ] Comparaison avec `allowedNumberTokens`
- [ ] Tolerance : calculs derives (division, multiplication de tokens source)
- [ ] 0 invente → PASS
- [ ] >= 1 invente → FAIL avec "Token invente : '[token]'"

**Priorite** : High
**Labels** : `priority:high`, `type:testing`, `type:pipeline`
**Milestone** : Sprint 3

*Fixes #K6.*

---

## Ticket K7 — Test automatise : Liens internes >= 3

> Verifier la presence de liens internes vers flashvoyage.com.

**Estimate: 0.5h**

**Titre** : Implementer test K7 — Liens internes >= 3

**Preconditions** :
- HTML article + `data/internal-links.json`

**Scenario (Gherkin-like)** :

```
Etant donne un article avec 4 liens flashvoyage.com
Quand le test K7 s'execute
Alors 4 >= 3 → PASS

Etant donne que data/internal-links.json est vide
Quand le test K7 s'execute
Alors le test est SKIP (pas de penalite)
```

**Criteres d'acceptation** :
- [ ] Regex : `/href="https?:\/\/flashvoyage\.com[^"]*"/gi`
- [ ] Seuil : >= 3 → PASS
- [ ] < 3 (si base non vide) → FAIL
- [ ] Base vide → SKIP

**Priorite** : Low
**Labels** : `priority:low`, `type:testing`
**Milestone** : Sprint 5

*Fixes #K7.*

---

## Ticket K8 — Test automatise : Score qualite >= 85%

> Verifier que le score global quality-analyzer atteint le seuil EVERGREEN.

**Estimate: 0.5h**

**Titre** : Implementer test K8 — Score global >= 85%

**Preconditions** :
- HTML article + quality-analyzer importe

**Scenario (Gherkin-like)** :

```
Etant donne un article avec globalScore "87.5"
Quand le test K8 s'execute
Alors 87.5 >= 85.0 → PASS
```

**Criteres d'acceptation** :
- [ ] Appel : `qualityAnalyzer.getGlobalScore(html, 'evergreen')`
- [ ] Seuil : `parseFloat(result.globalScore) >= 85.0` → PASS
- [ ] < 85 → FAIL avec "Score [X]% < 85%. SERP=[A]%, Links=[B]%, Content=[C]%, Blocking=[D]%"

**Priorite** : High
**Labels** : `priority:high`, `type:testing`, `type:pipeline`
**Milestone** : Sprint 4

*Fixes #K8.*

---

## Ticket K9 — Test automatise : Sections SERP presentes

> Verifier la presence des H2 analytiques obligatoires.

**Estimate: 0.5h**

**Titre** : Implementer test K9 — Sections SERP >= 2/3

**Preconditions** :
- HTML article

**Scenario (Gherkin-like)** :

```
Etant donne un article avec H2 "Ce que les autres ne disent pas" et "Limites et biais"
Quand le test K9 s'execute
Alors regex 1 et 2 matchent → 2/3 → PASS
```

**Criteres d'acceptation** :
- [ ] Regex 1 : `/autres?\s+ne\s+disent?\s+pas/i`
- [ ] Regex 2 : `/limites?\s+et\s+biais/i`
- [ ] Regex 3 : `/erreurs?\s+fr[eé]quentes?/i`
- [ ] Seuil : >= 2/3 matchent → PASS
- [ ] < 2 → FAIL avec "Sections SERP manquantes : [liste]"

**Priorite** : High
**Labels** : `priority:high`, `type:testing`, `type:editorial`
**Milestone** : Sprint 3

*Fixes #K9.*

---

## Ticket K10 — Test automatise : Quick Guide present

> Verifier la presence d'une section Quick Guide / Checklist.

**Estimate: 0.5h**

**Titre** : Implementer test K10 — Quick Guide present

**Preconditions** :
- HTML article

**Scenario (Gherkin-like)** :

```
Etant donne un article avec H3 "Checklist avant de partir"
Quand le test K10 s'execute
Alors regex matche → PASS
```

**Criteres d'acceptation** :
- [ ] Regex : `/quick\s+guide|checklist|guide\s+rapide|en\s+bref|l.essentiel/i` dans les H2/H3
- [ ] >= 1 match → PASS
- [ ] 0 match → FAIL avec "Quick Guide absent"

**Priorite** : High
**Labels** : `priority:high`, `type:testing`, `type:editorial`
**Milestone** : Sprint 3

*Fixes #K10.*

---

# Resume des 18 tickets

| # | Titre | Priorite | Milestone | Estimate |
|---|-------|----------|-----------|----------|
| P1 | Fix scoring bug targetScore 10 → 85 | High | Sprint 1 | 0.5h |
| P2 | Sections SERP obligatoires dans prompt | High | Sprint 2 | 1.5h |
| P3 | Contextualiser modules affiliation | Medium | Sprint 2 | 1.5h |
| P4 | Coherence angle expansion/improve | High | Sprint 3 | 2h |
| P5 | Validation qualite pre-publication | High | Sprint 4 | 2.5h |
| P6 | Enrichir scoring angle+H2+descriptifs | High | Sprint 3 | 2.5h |
| P7 | Injection liens internes | Low | Sprint 5 | 2h |
| P8 | Generation initiale 2500 mots | Medium | Sprint 1 | 0.5h |
| K1 | Test tension intro | Medium | Sprint 3 | 0.5h |
| K2 | Test H2 decisionnels >= 80% | High | Sprint 3 | 0.5h |
| K3 | Test preuves sourcees >= 2 | Medium | Sprint 3 | 0.5h |
| K4 | Test decisions concretes >= 2 | Medium | Sprint 3 | 0.5h |
| K5 | Test CTA sur friction 100% | Medium | Sprint 3 | 0.5h |
| K6 | Test zero invention factuelle | High | Sprint 3 | 1h |
| K7 | Test liens internes >= 3 | Low | Sprint 5 | 0.5h |
| K8 | Test score qualite >= 85% | High | Sprint 4 | 0.5h |
| K9 | Test sections SERP >= 2/3 | High | Sprint 3 | 0.5h |
| K10 | Test Quick Guide present | High | Sprint 3 | 0.5h |

**Total : 18 tickets | Effort total estime : 17.5h | 5 sprints**

**Ordre d'execution** : P1 → P8 → P2 ‖ P3 → P4 + P6 + K1-K10 → P5 + K8 → P7 + K7
