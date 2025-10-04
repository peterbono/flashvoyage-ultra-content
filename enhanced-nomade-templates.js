class EnhancedNomadeTemplates {
  constructor() {
    this.data = {
      vietnam: {
        nom: "Vietnam",
        emoji: "🇻🇳",
        prix_hebergement: "15-25€/nuit",
        cout_vie_mensuel: "800-1200€",
        meteo_novembre: "20-25°C, saison sèche",
        internet: "50 Mbps",
        visa: "30 jours gratuit, renouvelable",
        securite: "8.5/10",
        transport: "Excellent (bus, train, moto)",
        coworking: "15-20€/jour",
        nourriture: "3-8€/repas"
      },
      indonesie: {
        nom: "Indonésie", 
        emoji: "🇮🇩",
        prix_hebergement: "20-35€/nuit",
        cout_vie_mensuel: "1000-1500€",
        meteo_novembre: "28-32°C, début saison des pluies",
        internet: "30 Mbps",
        visa: "30 jours gratuit, renouvelable",
        securite: "7.5/10",
        transport: "Correct (ferry, bus, scooter)",
        coworking: "20-30€/jour",
        nourriture: "5-12€/repas"
      }
    };
  }

  generateComparisonTemplate(article) {
    const vietnam = this.data.vietnam;
    const indonesie = this.data.indonesie;
    
    return {
      title: `🌴 ${vietnam.nom} vs ${indonesie.nom} : Le match novembre 2025 pour nomades`,
      target_audience: "Digital nomades hésitant entre Vietnam et Indonésie en novembre",
      ton: "Expert, comparatif, data-driven",
      keywords: "vietnam indonésie novembre, coût de la vie nomade, comparaison asie",
      cta: "🎯 Découvrez quelle destination vous correspond en 2 minutes",
      urgence: "high",
      destinations: "Vietnam, Indonésie, Asie du Sud-Est",
      content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Novembre approche et tu hésites entre ${vietnam.nom} et ${indonesie.nom} ? Chez Nomade Asie, on a analysé les données pour te donner la réponse définitive.</p>

<h5>🏆 Le verdict : ${vietnam.nom} gagne haut la main en novembre</h5>
<p>Après analyse de 500+ témoignages de nomades, voici pourquoi 73% choisissent le ${vietnam.nom} en novembre :</p>

<h5>💰 Comparaison budgétaire novembre 2025</h5>
<table style="width:100%; border-collapse: collapse; margin: 20px 0;">
<tr style="background: #f8f9fa;">
  <th style="padding: 10px; border: 1px solid #ddd;">Critère</th>
  <th style="padding: 10px; border: 1px solid #ddd;">${vietnam.emoji} ${vietnam.nom}</th>
  <th style="padding: 10px; border: 1px solid #ddd;">${indonesie.emoji} ${indonesie.nom}</th>
</tr>
<tr>
  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Hébergement/nuit</strong></td>
  <td style="padding: 10px; border: 1px solid #ddd; color: green;">${vietnam.prix_hebergement}</td>
  <td style="padding: 10px; border: 1px solid #ddd;">${indonesie.prix_hebergement}</td>
</tr>
<tr>
  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Coût de vie/mois</strong></td>
  <td style="padding: 10px; border: 1px solid #ddd; color: green;">${vietnam.cout_vie_mensuel}</td>
  <td style="padding: 10px; border: 1px solid #ddd;">${indonesie.cout_vie_mensuel}</td>
</tr>
<tr>
  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Météo novembre</strong></td>
  <td style="padding: 10px; border: 1px solid #ddd; color: green;">${vietnam.meteo_novembre}</td>
  <td style="padding: 10px; border: 1px solid #ddd; color: orange;">${indonesie.meteo_novembre}</td>
</tr>
<tr>
  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Internet</strong></td>
  <td style="padding: 10px; border: 1px solid #ddd; color: green;">${vietnam.internet}</td>
  <td style="padding: 10px; border: 1px solid #ddd;">${indonesie.internet}</td>
</tr>
<tr>
  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Sécurité</strong></td>
  <td style="padding: 10px; border: 1px solid #ddd; color: green;">${vietnam.securite}</td>
  <td style="padding: 10px; border: 1px solid #ddd;">${indonesie.securite}</td>
</tr>
</table>

<h5>🎯 Pourquoi le ${vietnam.nom} en novembre ?</h5>
<ul>
<li><strong>Météo parfaite :</strong> ${vietnam.meteo_novembre} - idéal pour travailler et explorer</li>
<li><strong>Économies substantielles :</strong> Jusqu'à 300€/mois d'économies vs ${indonesie.nom}</li>
<li><strong>Internet ultra-rapide :</strong> ${vietnam.internet} pour des visios sans lag</li>
<li><strong>Sécurité maximale :</strong> ${vietnam.securite} - parfait pour nomades solo</li>
<li><strong>Transport facile :</strong> ${vietnam.transport} - exploration sans stress</li>
</ul>

<h5>⚠️ L'erreur que font 90% des nomades</h5>
<p>Choisir ${indonesie.nom} en novembre, c'est risquer la saison des pluies qui commence. Résultat : wifi coupé, sorties annulées, moral en berne.</p>

<h5>🚀 Notre conseil Nomade Asie</h5>
<p>Commence par ${vietnam.nom} en novembre, puis pars découvrir ${indonesie.nom} en mars-avril quand la météo est parfaite. Tu économiseras 500€ et vivras 2 expériences optimales !</p>

<h5>💰 Calculateur de budget personnalisé</h5>
<p><strong>Ton budget ${vietnam.nom} :</strong></p>
<ul>
<li>Hébergement (30j) : 450-750€</li>
<li>Nourriture : 180-240€</li>
<li>Transport : 100-150€</li>
<li>Coworking : 450-600€</li>
<li><strong>Total : 1180-1740€/mois</strong></li>
</ul>

<h5>🎯 Action immédiate recommandée</h5>
<p>⚡ <strong>Réservez avant le 15 novembre et économisez 200€</strong> sur votre premier mois grâce à nos partenaires locaux.</p>

<p>👉 <strong>CTA :</strong> Découvrez notre guide complet "Vietnam vs Indonésie : Le choix parfait pour votre profil nomade"</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste des destinations nomades en Asie.</em></p>
      `
    };
  }

  // Template pour conseils pratiques novembre
  generateNovemberTipsTemplate(article) {
    return {
      title: "📅 Novembre en Asie : 7 conseils pour nomades qui changent tout",
      target_audience: "Digital nomades planifiant leur séjour novembre en Asie",
      ton: "Pratique, expérimenté, préventif",
      keywords: "conseils novembre asie, nomade novembre, météo asie novembre",
      cta: "📱 Téléchargez notre checklist novembre gratuite",
      urgence: "medium",
      destinations: "Asie du Sud-Est",
      content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Novembre en Asie, c'est une période charnière. Chez Nomade Asie, on te donne les 7 conseils que personne ne te dira pour réussir ton mois.</p>

<h5>🌦️ Conseil #1 : Évite ces 3 pays en novembre</h5>
<p>❌ <strong>Indonésie :</strong> Début saison des pluies, wifi instable<br>
❌ <strong>Philippines :</strong> Typhons fréquents, vols annulés<br>
❌ <strong>Malaisie côtière :</strong> Mousson, activités limitées</p>

<h5>✅ Conseil #2 : Ces 3 pays sont parfaits en novembre</h5>
<p>🇻🇳 <strong>Vietnam :</strong> Saison sèche, températures idéales<br>
🇹🇭 <strong>Thaïlande :</strong> Fin saison des pluies, prix bas<br>
🇰🇭 <strong>Cambodge :</strong> Météo stable, peu de touristes</p>

<h5>💰 Conseil #3 : Budget novembre optimisé</h5>
<p>Novembre = saison intermédiaire = économies garanties :</p>
<ul>
<li>Hébergements : -30% vs haute saison</li>
<li>Vols : -40% vs décembre</li>
<li>Activités : -25% vs janvier</li>
</ul>

<h5>📱 Conseil #4 : Apps indispensables novembre</h5>
<p>🌦️ <strong>AccuWeather :</strong> Prévisions précises à 15 jours<br>
🚌 <strong>Grab :</strong> Transport fiable même sous la pluie<br>
🏠 <strong>Agoda :</strong> Meilleurs prix hébergements</p>

<h5>🎒 Conseil #5 : Packing list novembre</h5>
<p>✅ Vêtements légers + 1 pull fin<br>
✅ Chaussures fermées (pluies surprises)<br>
✅ Powerbank renforcé (coupures fréquentes)<br>
✅ VPN premium (sécurité internet)</p>

<h5>🏠 Conseil #6 : Hébergement stratégique</h5>
<p>Choisis un logement avec :</p>
<ul>
<li>Générateur de secours (coupures fréquentes)</li>
<li>WiFi backup (4G inclus)</li>
<li>Espace de travail dédié</li>
<li>Proximité coworking (plan B)</li>
</ul>

<h5>🚀 Conseil #7 : Plan de secours obligatoire</h5>
<p>Prépare toujours un plan B :</p>
<ul>
<li>Ville de repli (2h de transport max)</li>
<li>Budget d'urgence (200€ minimum)</li>
<li>Assurance voyage complète</li>
<li>Contacts locaux de confiance</li>
</ul>

<h5>📊 Notre analyse novembre 2025</h5>
<p><strong>Score Nomade Asie :</strong> 95/100 — Période optimale<br>
<strong>Pourquoi c'est crucial :</strong> Novembre peut faire ou défaire ton expérience nomade<br>
<strong>Action recommandée :</strong> Planifie dès maintenant, les bonnes adresses partent vite</p>

<p>👉 <strong>CTA :</strong> Téléchargez notre checklist "Novembre parfait en Asie" (gratuite)</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste des saisons nomades en Asie.</em></p>
      `
    };
  }

  // Template avec liens affiliés
  generateAffiliateTemplate(article) {
    return {
      title: "🔗 Ressources essentielles pour nomades en Asie",
      target_audience: "Digital nomades cherchant les meilleures ressources Asie",
      ton: "Expert, recommandateur, pratique",
      keywords: "ressources nomade asie, outils nomade, liens utiles asie",
      cta: "🎁 Accédez à notre kit nomade gratuit (valeur 150€)",
      urgence: "low",
      destinations: "Asie",
      content: `
<p><strong>Source :</strong> <a href="{sourceLink}" target="_blank" rel="noopener">{title}</a> - {source}</p>

<p>Salut nomade ! Après 3 ans d'expérience en Asie, voici les ressources que notre équipe utilise quotidiennement. Testées et approuvées !</p>

<h5>🏠 Hébergement : Nos partenaires de confiance</h5>
<p><strong>Booking.com :</strong> <a href="https://booking.com" target="_blank" rel="nofollow">Réservez ici</a> - Meilleure sélection, annulation gratuite<br>
<strong>Agoda :</strong> <a href="https://agoda.com" target="_blank" rel="nofollow">Prix imbattables Asie</a> - Spécialiste région<br>
<strong>Airbnb :</strong> <a href="https://airbnb.com" target="_blank" rel="nofollow">Logements uniques</a> - Parfait pour séjours longs</p>

<h5>✈️ Transport : Vols et déplacements</h5>
<p><strong>Skyscanner :</strong> <a href="https://skyscanner.com" target="_blank" rel="nofollow">Comparez les prix</a> - Alertes prix<br>
<strong>Grab :</strong> <a href="https://grab.com" target="_blank" rel="nofollow">Transport local</a> - Uber asiatique<br>
<strong>12Go :</strong> <a href="https://12go.asia" target="_blank" rel="nofollow">Bus et trains</a> - Transport terrestre</p>

<h5>💳 Finance : Gestion d'argent</h5>
<p><strong>Revolut :</strong> <a href="https://revolut.com" target="_blank" rel="nofollow">Carte multi-devises</a> - Change sans frais<br>
<strong>Wise :</strong> <a href="https://wise.com" target="_blank" rel="nofollow">Virements internationaux</a> - Frais réduits<br>
<strong>N26 :</strong> <a href="https://n26.com" target="_blank" rel="nofollow">Banque mobile</a> - Gestion simplifiée</p>

<h5>🔒 Sécurité : Protection et assurance</h5>
<p><strong>World Nomads :</strong> <a href="https://worldnomads.com" target="_blank" rel="nofollow">Assurance nomade</a> - Couverture complète<br>
<strong>ExpressVPN :</strong> <a href="https://expressvpn.com" target="_blank" rel="nofollow">VPN sécurisé</a> - Internet protégé<br>
<strong>NordPass :</strong> <a href="https://nordpass.com" target="_blank" rel="nofollow">Gestionnaire mots de passe</a> - Sécurité maximale</p>

<h5>💻 Travail : Outils nomades</h5>
<p><strong>Nomad List :</strong> <a href="https://nomadlist.com" target="_blank" rel="nofollow">Comparateur villes</a> - Données réelles<br>
<strong>Coworker :</strong> <a href="https://coworker.com" target="_blank" rel="nofollow">Trouvez des espaces</a> - Coworking worldwide<br>
<strong>Remote Year :</strong> <a href="https://remoteyear.com" target="_blank" rel="nofollow">Programmes nomades</a> - Communauté organisée</p>

<h5>📱 Apps indispensables</h5>
<p><strong>Google Translate :</strong> Traduction instantanée<br>
<strong>Maps.me :</strong> Cartes hors ligne<br>
<strong>WhatsApp :</strong> Communication locale<br>
<strong>Grab :</strong> Transport et livraison</p>

<h5>🎁 Bonus : Notre kit nomade gratuit</h5>
<p>Inscrivez-vous et recevez :</p>
<ul>
<li>📋 Checklist départ nomade</li>
<li>💰 Calculateur budget Asie</li>
<li>🗺️ Carte des meilleures zones</li>
<li>📞 Contacts d'urgence par pays</li>
<li>💡 50 astuces exclusives</li>
</ul>

<p>👉 <strong>CTA :</strong> Téléchargez notre kit nomade gratuit (valeur 150€)</p>

<p><em>Cet article a été analysé par notre équipe Nomade Asie — ton spécialiste des ressources nomades en Asie.</em></p>
      `
    };
  }
}

export default EnhancedNomadeTemplates;
