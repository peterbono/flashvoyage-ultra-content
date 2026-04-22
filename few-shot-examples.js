/**
 * FV-110: Few-shot examples for micro-prompt pipeline.
 *
 * These exemplary snippets are injected into the LLM prompts so the model
 * can calibrate tone, density and editorial posture before generating.
 *
 * Eight categories:
 *   hook             – cinematic opening (sensory, in-scene, no meta)
 *   decisionalH2     – H2 title with decisional verb + first paragraph
 *   verdict          – trenchant conclusion with conditional recommendation
 *   seoTitle         – input/output pair for SEO title generation
 *   bodySection      – complete H2 section (~350 words) with citation, prices, CTA
 *   faq              – 3 FAQ items in <details><summary> format
 *   recommendation   – "Nos recommandations" block with 3 tiered options
 *   comparisonTable  – HTML <table> comparing 3-4 options with prices
 */

export const FEW_SHOT_EXAMPLES = {

  // Style A: Contrarian — pattern interrupt + false assumption reversal
  hookContrarian: `<p>La Thaïlande est la destination la moins chère d'Asie du Sud-Est. C'est aussi celle où les expatriés crament leur budget le plus vite.</p>
<p>Marc, 32 ans, développeur freelance, s'est installé à Bangkok avec un tableur de dépenses millimétré et un budget de 1 800 €/mois. Quatre mois plus tard, son compte Wise affiche 1 847 € — le budget d'un seul mois, pas quatre. Sur 12 témoignages de freelances ayant fait le même calcul, 9 arrivent au même constat : les frais invisibles (border runs, assurance, visa extensions) ajoutent 35 à 50 % au budget prévu.</p>
<p>Parce que le vrai coût de la Thaïlande, ce n'est pas le pad thaï à 1,50 €. C'est tout ce que tu n'as pas budgété autour.</p>`,

  // Style B: Stat Bomb + Promise Stack — data-first, high intent-match
  hookStatBomb: `<p>À Bangkok, un studio climatisé coûte 350 €/mois. À Bali, le même te revient à 580 €. Mais ajoute le coworking, les visas et les transferts bancaires — l'écart réel tombe à 12 %, pas 40 %.</p>
<p>Marc, 32 ans, freelance, a testé Bangkok pendant quatre mois. On a croisé son expérience avec les retours de 12 expatriés ayant fait le même arbitrage. Résultat : le budget « officiel » des blogs sous-estime la réalité de 35 à 50 %, principalement à cause de trois postes que personne ne détaille.</p>
<p>Ce qu'on couvre ici : les vrais chiffres poste par poste, les pièges de trésorerie que les guides ignorent, et comment recalculer ton budget avant de réserver.</p>`,

  // Legacy hook kept for backwards compatibility
  hook: `<p>L'écran du distributeur affiche 220 bahts de frais — tu calcules mentalement pendant que la queue s'allonge derrière toi dans la chaleur moite de Silom. Ton compte Wise indique 1 847 € : le budget du mois, censé couvrir le loyer, le coworking et les trois border runs que tu n'avais pas anticipés.</p>
<p>Ce voyageur, développeur freelance installé à Bangkok depuis quatre mois, pensait avoir tout prévu. « J'avais un tableur avec chaque ligne de dépense, raconte-t-il sur un forum de voyageurs. Sauf que personne ne t'explique que le vrai coût de la Thaïlande, c'est les frais que tu ne vois pas. »</p>`,

  // Concrete, specific, no "arbitrage"/"dilemme"/"crucial" — names the places, names the numbers,
  // ends with a grounded detail instead of a rhetorical framing.
  decisionalH2: `<h2>Chiang Mai contre Bali à 1 500 € par mois : où l'argent part vraiment</h2>
<p>Un studio climatisé à Nimman revient à 350 € par mois. Le même, à Canggu, coûte 580 €. Le coworking Punspace à Chiang Mai ? 85 € mensuels, contre 160 € chez Dojo Bali. Mais si tu factures en Europe et que tes clients veulent t'appeler à 17h heure de Paris, Chiang Mai te réveille à 22h là-bas. Bali passe à 20h. Sur trois mois, cette seule différence a fait rentrer Marc chez lui trois semaines plus tôt que prévu.</p>`,

  verdict: `<p>Si ton budget plafonne à 1 500 € par mois et que tu travailles en asynchrone, privilégie Chiang Mai de novembre à janvier puis bascule sur Da Nang pendant la saison des brûlis. En revanche, si tu factures plus de 4 000 € mensuels et que tu as besoin de networking régulier, Bali reste un investissement — pas une dépense. Le vrai piège, c'est de choisir une destination pour son image Instagram plutôt que pour sa compatibilité avec ton rythme de travail.</p>`,

  seoTitle: {
    input: "Article about budget travel in Thailand — 3 weeks, Bangkok + Chiang Mai + islands",
    // Deliberately specific title that names real places, real prices, real duration.
    // NO "arbitrages", "pièges cachés", "secrets", "crucial", "dilemme", "optimiser chaque X".
    // NO formulaic "[Number] trucs/pièges/secrets/erreurs" clickbait openers.
    output: {
      titre: "Thaïlande 3 semaines : on a dépensé 1 680 € à deux, voici le détail",
      title_tag: "Thaïlande 3 semaines à deux : 1 680 € détaillés"
    }
  },

  // H2 no longer starts with "Comment arbitrer" (banned pattern). Frames as a direct reader question.
  bodySection: `<h2>Ryokan à 85 € ou auberge à 28 € : ce que Marie a recalculé à Kyoto</h2>
<p>Tu arrives à Kyoto avec un budget hébergement de 45 € par nuit. Sur Booking, les auberges de jeunesse affichent 28 € en dortoir mixte, les ryokans « économiques » démarrent à 85 €. Le choix semble évident — sauf que tu oublies trois postes cachés.</p>
<p>En auberge, tu paies 28 € la nuit mais tu dînes dehors : 12 à 18 € par repas dans le quartier de Gion. En ryokan, le tarif de 85 € inclut le kaiseki du soir et le petit-déjeuner japonais. « J'ai fait le calcul après cinq jours, confie un voyageur sur r/japantravel. Le ryokan me revenait à 85 € tout compris contre 28 + 15 + 8 = 51 € en auberge — soit 34 € d'écart, pas 57. »</p>
<p>Deuxième poste invisible : le temps. Les auberges bon marché à Kyoto se concentrent autour de la gare, à 25 minutes en bus des temples du nord. Un ryokan à Higashiyama te place à pied de Kiyomizu-dera — tu économises 45 minutes et 4,80 € de transport par jour.</p>
<p>Troisième facteur, souvent ignoré : la fatigue. Après trois semaines de dortoirs aux Philippines et au Vietnam, le futon d'un ryokan avec onsen privé n'est pas un luxe — c'est une question de récupération qui conditionne ta capacité à profiter des dix derniers jours.</p>
<!-- FV:CTA_SLOT reason="comparateur hébergement Kyoto" -->
<p>Le vrai arbitrage n'est donc pas « 28 € contre 85 € » mais « 51 € sans repos contre 85 € avec récupération ». Sur trois nuits à Kyoto, l'écart réel tombe à 102 € — le prix d'un déjeuner par jour pendant tout ton séjour au Japon.</p>`,

  faq: `<details><summary>Combien coûte réellement une semaine au Japon en haute saison ?</summary><p>En juin-juillet, compte entre 420 € et 680 € par semaine pour un voyageur solo en mode backpacker. Ce budget inclut l'hébergement en mix auberge/ryokan (35-85 €/nuit), les transports locaux hors JR Pass (8-15 €/jour) et trois repas (18-30 €/jour). Les ryokans doublent leurs tarifs en haute saison — un « économique » à 80 € passe à 160 €.</p></details>
<details><summary>Le JR Pass vaut-il le coup pour un itinéraire Tokyo–Kyoto–Takayama ?</summary><p>Le JR Pass 14 jours coûte 280 € et couvre le Shinkansen Tokyo–Kyoto (aller simple : 120 €) ainsi que la ligne principale vers Kanazawa. Mais les trains privés vers Takayama via la Vallée de Kiso ne sont pas inclus — prévois 40 € supplémentaires. Si tu fais moins de trois trajets longue distance, des billets individuels reviennent moins cher.</p></details>
<details><summary>Faut-il réserver les ryokans à l'avance en été ?</summary><p>Oui, minimum trois semaines avant ton arrivée. En juillet, les ryokans de Kinosaki Onsen et Hakone affichent complet deux à trois semaines à l'avance. Les auberges de jeunesse à Tokyo saturent aussi vite. Réserve sur Booking ou Japanican avec annulation gratuite, puis ajuste ton itinéraire une fois sur place.</p></details>`,

  recommendation: `<h2>Nos recommandations : par où commencer ?</h2>
<p><strong>Budget serré (moins de 50 €/jour) :</strong> Privilégie les auberges de jeunesse en réservant trois semaines à l'avance. Évite les ryokans en haute saison. Achète des pass régionaux (Kansai Area Pass à 22 €/jour) plutôt que le JR Pass national. Mange dans les konbini — un repas complet chez Lawson ou 7-Eleven revient à 4-6 €.</p>
<p><strong>Budget confortable (50-100 €/jour) :</strong> Alterne deux nuits en auberge, une nuit en ryokan. Le JR Pass 7 jours (200 €) devient rentable si tu fais au moins Tokyo–Kyoto aller-retour plus un trajet vers Hiroshima. Réserve les ryokans sur Japanican pour accéder aux tarifs locaux — souvent 15 à 20 % moins chers que sur Booking.</p>
<p><strong>Budget large (plus de 100 €/jour) :</strong> Réserve des ryokans haut de gamme à Kinosaki Onsen ou Hakone (150-250 €/nuit, kaiseki inclus). Prends le Green Car sur les Shinkansen pour 40 € de supplément — les sièges 2+2 valent le surcoût sur les trajets de plus de deux heures. Envisage un pocket Wi-Fi plutôt qu'une SIM locale — à 5 €/jour, c'est plus fiable dans les zones rurales.</p>`,

  // "Verdict Flash Voyage : à qui c'est vraiment destiné" is a template tell. Reframe as
  // a natural paragraph; let the model decide if it even needs a verdict section.
  verdictBlock: `<h2>Notre recommandation concrète</h2>
<p>Si ton budget plafonne à 1 500 € par mois et que tu bosses en asynchrone, Chiang Mai de novembre à janvier est probablement ton meilleur choix. Punspace à 85 €, appart à 350 €, et des vols directs vers Bangkok en 1h pour les week-ends. Au-delà de 3 000 € mensuels ou si tu as besoin de networking tech régulier, Bali reprend l'avantage malgré le surcoût — mais budgète les 40 % en plus sans te mentir.</p>`,

  // Checklist Flash Voyage — screenshot-worthy
  checklistBlock: `<div class="fv-checklist" style="background:#f7fafc;border:2px solid #3182CE;border-radius:12px;padding:24px;margin:24px 0;">
<h3 style="margin-top:0;color:#3182CE;">✈️ Checklist — Thaïlande 3 mois</h3>
<h4>Avant de partir</h4>
<p>✔️ Ouvrir Wise + Revolut — 0 % frais de change vs 3-5 % en banque classique</p>
<p>✔️ Assurance couvrant les scooters — Visa Premier ne suffit pas (franchise 150 €)</p>
<p>✔️ Réserver la première semaine seulement — chercher l'appart sur place (-20 à 40 %)</p>
<h4>Sur place</h4>
<p>✔️ Tester le DAB dès l'aéroport — frais réels : 220 THB (5,50 €) par retrait</p>
<p>✔️ Négocier au mois, pas à la semaine — économie de 25 à 40 %</p>
<p>✔️ Grab/Bolt au lieu des taxis — 30-50 % moins cher</p>
<h4>À éviter</h4>
<p>❌ Payer en euros (DCC) — surcoût 3 à 7 % par transaction</p>
<p>❌ Tours aux comptoirs touristiques — 30-50 % plus cher que l'app locale</p>
<p>❌ Change à l'aéroport — taux 8-12 % pire qu'en ville</p>
</div>`,

  comparisonTable: `<table>
<thead>
<tr><th>Option</th><th>Coût / nuit</th><th>Repas inclus</th><th>Localisation</th><th>Verdict</th></tr>
</thead>
<tbody>
<tr><td>Auberge de jeunesse (dortoir)</td><td>28 €</td><td>Non</td><td>Gare de Kyoto (25 min des temples)</td><td>Budget max, confort minimal</td></tr>
<tr><td>Ryokan économique</td><td>85 € (160 € en haute saison)</td><td>Dîner kaiseki + petit-déj</td><td>Higashiyama (à pied des sites)</td><td>Meilleur rapport si tu comptes les repas</td></tr>
<tr><td>Hôtel business</td><td>55-75 €</td><td>Petit-déjeuner buffet</td><td>Centre-ville</td><td>Compromis pratique, zéro charme</td></tr>
<tr><td>Airbnb (studio)</td><td>45-65 €</td><td>Cuisine disponible</td><td>Variable</td><td>Idéal pour séjours de 4+ nuits</td></tr>
</tbody>
</table>`

};
