/**
 * FV-110: Few-shot examples for micro-prompt pipeline.
 *
 * These exemplary snippets are injected into the LLM prompts so the model
 * can calibrate tone, density and editorial posture before generating.
 *
 * Three categories:
 *   hook           – cinematic opening (sensory, in-scene, no meta)
 *   decisionalH2   – H2 title with decisional verb + first paragraph
 *   verdict        – trenchant conclusion with conditional recommendation
 */

export const FEW_SHOT_EXAMPLES = {

  hook: `<p>L'écran du distributeur affiche 220 bahts de frais — tu calcules mentalement pendant que la queue s'allonge derrière toi dans la chaleur moite de Silom. Ton compte Wise indique 1 847 € : le budget du mois, censé couvrir le loyer, le coworking et les trois border runs que tu n'avais pas anticipés.</p>
<p>Ce voyageur, développeur freelance installé à Bangkok depuis quatre mois, pensait avoir tout prévu. « J'avais un tableur avec chaque ligne de dépense, raconte-t-il sur r/digitalnomad. Sauf que personne ne t'explique que le vrai coût de la Thaïlande, c'est les frais que tu ne vois pas. »</p>`,

  decisionalH2: `<h2>Pourquoi Chiang Mai coûte 40 % moins cher que Bali — et ce que tu sacrifies en échange</h2>
<p>Sur le papier, le calcul est simple : un studio climatisé à Nimman revient à 350 € par mois contre 580 € pour un équivalent à Canggu. Le coworking Punspace facture 85 € mensuels là où Dojo Bali en demande 160. Mais ce différentiel masque un arbitrage que peu de guides mentionnent. À Chiang Mai, tu gagnes en budget ce que tu perds en réseau international : la communauté est plus petite, les événements tech moins fréquents, et les vols directs vers l'Europe inexistants. Si ton activité dépend de rencontres clients en personne ou de connexions avec des startups, ce « rabais » de 40 % a un prix invisible que ton tableur ne capture pas.</p>`,

  verdict: `<p>Si ton budget plafonne à 1 500 € par mois et que tu travailles en asynchrone, privilégie Chiang Mai de novembre à janvier puis bascule sur Da Nang pendant la saison des brûlis. En revanche, si tu factures plus de 4 000 € mensuels et que tu as besoin de networking régulier, Bali reste un investissement — pas une dépense. Le vrai piège, c'est de choisir une destination pour son image Instagram plutôt que pour sa compatibilité avec ton rythme de travail.</p>`

};
