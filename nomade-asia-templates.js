#!/usr/bin/env node

/**
 * Nomade Asia Templates - Templates ultra-niche pour digital nomades en Asie
 * Sujets variés : coliving, visa, budget, communauté, tech, sécurité
 */

class NomadeAsiaTemplates {
  constructor() {
    this.templates = {
      // Template hébergement & coliving
      nomade_hebergement: {
        title: "🏠 {title} - Nomade Asie",
        target_audience: "Digital nomades cherchant hébergement en Asie",
        ton: "Pratique, communautaire, rassurant",
        keywords: "coliving asie, hébergement nomade, digital nomad accommodation",
        cta: "Trouvez votre hébergement nomade en Asie",
        urgence: "Places limitées - Réservation recommandée",
        destinations: "Japon, Corée, Thaïlande, Vietnam, Indonésie, Singapour",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Si tu cherches un hébergement de qualité en Asie, cette info va t'aider à faire le bon choix. Chez Nomade Asie, on teste et on te recommande les meilleures options.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur {type} en Asie, c'est pas juste une info de plus. C'est le genre de conseil qui peut faire la différence entre un séjour productif et un cauchemar logistique.</p>

<p>On teste ces endroits parce qu'on sait que nos lecteurs nomades comptent sur nous pour dénicher les vraies bonnes adresses.</p>

<h5>Ce que tu dois retenir</h5>
<p>Voici les points clés :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Digital nomades en Asie</li>
<li><strong>Économies :</strong> 200-800€ par mois</li>
<li><strong>Communauté :</strong> Rencontres garanties</li>
</ul>

<h5>Notre conseil Nomade Asie</h5>
<p>On te conseille de réserver rapidement. Les bonnes adresses nomades partent vite, surtout en haute saison.</p>

<p>On te recommande de vérifier les équipements (wifi, bureau, cuisine) avant de réserver. C'est crucial pour ta productivité.</p>

<h5>Contexte Nomade Asie</h5>
<p>L'Asie devient de plus en plus attractive pour les nomades. Les infrastructures s'améliorent et les communautés grandissent.</p>

<p>C'est une excellente nouvelle pour les nomades français — plus d'options, meilleure qualité, prix compétitifs.</p>

<h5>Notre analyse</h5>
<p><strong>Score Nomade Asie :</strong> {relevance}/100 — Information cruciale</p>
<p><strong>Pourquoi c'est important :</strong> Impact direct sur ta productivité et ton confort</p>
<p><strong>Action recommandée :</strong> Réserver rapidement</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste du nomadisme en Asie.</em></p>
        `
      },

      // Template visa & formalités
      nomade_visa: {
        title: "✈️ {title} - Nomade Asie",
        target_audience: "Digital nomades cherchant visa longue durée en Asie",
        ton: "Expert, rassurant, pratique",
        keywords: "visa nomade asie, digital nomad visa, visa longue durée asie",
        cta: "Obtenez votre visa nomade en Asie",
        urgence: "Réglementation en évolution - Agissez maintenant",
        destinations: "Japon, Corée, Thaïlande, Singapour, Malaisie",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Si tu veux rester plus longtemps en Asie, cette info sur les visas va t'intéresser. Chez Nomade Asie, on suit les évolutions réglementaires de près.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur {type} en Asie, c'est pas juste une actualité de plus. C'est le genre d'info qui peut changer complètement tes plans de voyage.</p>

<p>On suit ces évolutions parce qu'on sait que nos lecteurs nomades ont besoin de stabilité pour travailler sereinement.</p>

<h5>Ce que tu dois retenir</h5>
<p>Voici les points clés :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Digital nomades en Asie</li>
<li><strong>Économies :</strong> 100-500€ en frais administratifs</li>
<li><strong>Durée :</strong> 6 mois à 2 ans selon le pays</li>
</ul>

<h5>Notre conseil Nomade Asie</h5>
<p>On te conseille de te renseigner rapidement. Les réglementations évoluent souvent et les délais peuvent être longs.</p>

<p>On te recommande de préparer tous tes documents à l'avance. Les administrations asiatiques sont parfois exigeantes.</p>

<h5>Contexte Nomade Asie</h5>
<p>L'Asie s'ouvre de plus en plus aux nomades. Les pays comprennent l'intérêt économique des digital nomades.</p>

<p>C'est une excellente nouvelle pour les nomades français — plus de stabilité, moins de stress administratif.</p>

<h5>Notre analyse</h5>
<p><strong>Score Nomade Asie :</strong> {relevance}/100 — Information cruciale</p>
<p><strong>Pourquoi c'est important :</strong> Impact direct sur ta capacité à rester et travailler</p>
<p><strong>Action recommandée :</strong> Se renseigner et préparer sa demande</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste du nomadisme en Asie.</em></p>
        `
      },

      // Template budget & coût de vie
      nomade_budget: {
        title: "💰 {title} - Nomade Asie",
        target_audience: "Digital nomades avec budget limité en Asie",
        ton: "Pratique, rassurant, économique",
        keywords: "budget nomade asie, coût de vie nomade, économiser asie",
        cta: "Optimisez votre budget nomade en Asie",
        urgence: "Prix en évolution - Profitez maintenant",
        destinations: "Thaïlande, Vietnam, Indonésie, Philippines, Malaisie",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Si tu veux optimiser ton budget en Asie, cette info va t'aider à faire des économies. Chez Nomade Asie, on déniche les meilleures astuces budget.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur {type} en Asie, c'est pas juste un conseil de plus. C'est le genre d'info qui peut te faire économiser des centaines d'euros par mois.</p>

<p>On partage ces astuces parce qu'on sait que nos lecteurs nomades veulent maximiser leur pouvoir d'achat.</p>

<h5>Ce que tu dois retenir</h5>
<p>Voici les points clés :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Digital nomades en Asie</li>
<li><strong>Économies :</strong> 200-600€ par mois</li>
<li><strong>Qualité :</strong> Maintien du confort</li>
</ul>

<h5>Notre conseil Nomade Asie</h5>
<p>On te conseille de tester ces astuces progressivement. Chaque nomade a ses priorités et son style de vie.</p>

<p>On te recommande de garder un équilibre entre économies et qualité de vie. C'est important pour ta productivité.</p>

<h5>Contexte Nomade Asie</h5>
<p>L'Asie offre encore d'excellents rapports qualité-prix. Mais les prix évoluent, il faut s'adapter.</p>

<p>C'est une bonne nouvelle pour les nomades français — on peut encore vivre très bien avec un budget raisonnable.</p>

<h5>Notre analyse</h5>
<p><strong>Score Nomade Asie :</strong> {relevance}/100 — Information utile</p>
<p><strong>Pourquoi c'est important :</strong> Impact direct sur ton budget mensuel</p>
<p><strong>Action recommandée :</strong> Tester ces astuces</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste du nomadisme en Asie.</em></p>
        `
      },

      // Template communauté & networking
      nomade_communaute: {
        title: "👥 {title} - Nomade Asie",
        target_audience: "Digital nomades cherchant communauté en Asie",
        ton: "Communautaire, chaleureux, encourageant",
        keywords: "communauté nomade asie, networking nomade, meetup nomade asie",
        cta: "Rejoignez la communauté nomade en Asie",
        urgence: "Événements limités - Inscrivez-vous maintenant",
        destinations: "Tokyo, Séoul, Bangkok, Ho Chi Minh, Singapour, Bali",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Si tu cherches à rencontrer d'autres nomades en Asie, cette info va t'aider à créer du lien. Chez Nomade Asie, on croit en la force de la communauté.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur {type} en Asie, c'est pas juste un événement de plus. C'est le genre d'info qui peut transformer ton expérience nomade.</p>

<p>On partage ces opportunités parce qu'on sait que la solitude peut être un défi pour les nomades.</p>

<h5>Ce que tu dois retenir</h5>
<p>Voici les points clés :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Digital nomades en Asie</li>
<li><strong>Bénéfices :</strong> Networking, amitiés, opportunités</li>
<li><strong>Communauté :</strong> Nomades internationaux</li>
</ul>

<h5>Notre conseil Nomade Asie</h5>
<p>On te conseille de participer activement. La communauté nomade est très accueillante et bienveillante.</p>

<p>On te recommande de ne pas hésiter à aller vers les autres. Tout le monde est dans la même situation.</p>

<h5>Contexte Nomade Asie</h5>
<p>La communauté nomade en Asie grandit rapidement. De plus en plus d'événements et d'espaces dédiés apparaissent.</p>

<p>C'est une excellente nouvelle pour les nomades français — plus d'opportunités de rencontres et de collaboration.</p>

<h5>Notre analyse</h5>
<p><strong>Score Nomade Asie :</strong> {relevance}/100 — Information importante</p>
<p><strong>Pourquoi c'est important :</strong> Impact sur ton bien-être et tes opportunités</p>
<p><strong>Action recommandée :</strong> Participer aux événements</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste du nomadisme en Asie.</em></p>
        `
      },

      // Template tech & équipement
      nomade_tech: {
        title: "💻 {title} - Nomade Asie",
        target_audience: "Digital nomades cherchant équipement tech en Asie",
        ton: "Expert, pratique, technique",
        keywords: "tech nomade asie, équipement nomade, matériel nomade asie",
        cta: "Équipez-vous pour le nomadisme en Asie",
        urgence: "Promotions limitées - Profitez maintenant",
        destinations: "Japon, Corée, Singapour, Hong Kong, Taïwan",
        
        content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Si tu cherches du matériel tech de qualité en Asie, cette info va t'aider à faire les bons choix. Chez Nomade Asie, on teste et on te recommande le meilleur équipement.</p>

<h5>Pourquoi cette info est cruciale pour toi</h5>
<p>Cette nouvelle sur {type} en Asie, c'est pas juste un test de plus. C'est le genre d'info qui peut améliorer ta productivité et ton confort de travail.</p>

<p>On teste ces équipements parce qu'on sait que nos lecteurs nomades ont besoin de matériel fiable et performant.</p>

<h5>Ce que tu dois retenir</h5>
<p>Voici les points clés :</p>

<ul>
<li><strong>{type} :</strong> {content}</li>
<li><strong>Validité :</strong> {validityPeriod}</li>
<li><strong>Pour qui :</strong> Digital nomades en Asie</li>
<li><strong>Économies :</strong> 100-500€ vs Europe</li>
<li><strong>Qualité :</strong> Testé et approuvé</li>
</ul>

<h5>Notre conseil Nomade Asie</h5>
<p>On te conseille de comparer les prix. L'Asie offre souvent de meilleurs prix que l'Europe.</p>

<p>On te recommande de vérifier la garantie internationale. C'est crucial pour un nomade.</p>

<h5>Contexte Nomade Asie</h5>
<p>L'Asie est un leader technologique. Les équipements sont souvent plus avancés et moins chers qu'en Europe.</p>

<p>C'est une excellente opportunité pour les nomades français — meilleur rapport qualité-prix et innovation.</p>

<h5>Notre analyse</h5>
<p><strong>Score Nomade Asie :</strong> {relevance}/100 — Information technique</p>
<p><strong>Pourquoi c'est important :</strong> Impact direct sur ta productivité</p>
<p><strong>Action recommandée :</strong> Comparer et acheter</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste du nomadisme en Asie.</em></p>
        `
      }
    };
  }

  // Obtenir un template selon le type d'article
  getTemplate(articleType) {
    // Détecter le type d'article et retourner le bon template
    if (articleType.includes('coliving') || articleType.includes('hébergement') || articleType.includes('dormir')) {
      return this.templates.nomade_hebergement;
    } else if (articleType.includes('visa') || articleType.includes('formalités') || articleType.includes('permis')) {
      return this.templates.nomade_visa;
    } else if (articleType.includes('budget') || articleType.includes('prix') || articleType.includes('coût') || articleType.includes('économiser')) {
      return this.templates.nomade_budget;
    } else if (articleType.includes('communauté') || articleType.includes('rencontrer') || articleType.includes('meetup') || articleType.includes('networking')) {
      return this.templates.nomade_communaute;
    } else if (articleType.includes('tech') || articleType.includes('matériel') || articleType.includes('équipement') || articleType.includes('laptop')) {
      return this.templates.nomade_tech;
    } else {
      // Par défaut, template hébergement
      return this.templates.nomade_hebergement;
    }
  }

  // Remplir un template avec les données d'un article
  fillTemplate(articleType, article) {
    const template = this.getTemplate(articleType);
    const validityPeriod = this.getValidityPeriod(article);
    
    // Nettoyer le titre pour éviter les doublons d'emojis
    const cleanTitle = article.title.replace(/^[🏠✈️💰👥💻]+/, '').trim();
    
    return {
      title: template.title.replace('{title}', cleanTitle),
      target_audience: template.target_audience,
      ton: template.ton,
      keywords: template.keywords,
      cta: template.cta,
      urgence: template.urgence,
      destinations: template.destinations,
      content: template.content
        .replace(/\{sourceLink\}/g, article.link || 'https://nomadeasie.com')
        .replace(/\{title\}/g, article.title)
        .replace(/\{source\}/g, article.source)
        .replace(/\{type\}/g, article.type || 'nomade')
        .replace(/\{content\}/g, article.content || article.title)
        .replace(/\{validityPeriod\}/g, validityPeriod)
        .replace(/\{relevance\}/g, article.relevance || 85)
    };
  }

  // Générer une période de validité appropriée
  getValidityPeriod(article) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    if (article.source.includes('Reddit')) {
      return 'Information récente - Source communautaire';
    } else if (article.type === 'news') {
      return `Actualité ${currentYear}`;
    } else {
      return `Information valide jusqu'en décembre ${currentYear}`;
    }
  }
}

export default NomadeAsiaTemplates;
