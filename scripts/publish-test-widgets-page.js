#!/usr/bin/env node

/**
 * Publie une page de test "Test Injector" sur WordPress
 * avec tous les widgets TravelPayouts pour verification visuelle.
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const TRS = '463418';
const SHMARKER = '676421';

const WIDGETS = [
  {
    label: 'Flights — Aviasales Search Form (40%)',
    html: `<script async src="https://trpwdg.com/content?currency=eur&trs=${TRS}&shmarker=${SHMARKER}&show_hotels=true&powered_by=true&locale=fr&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100" charset="utf-8"></script>`
  },
  {
    label: 'Flights — Aviasales Pricing Calendar (40%)',
    html: `<script async src="https://trpwdg.com/content?currency=eur&trs=${TRS}&shmarker=${SHMARKER}&searchUrl=www.aviasales.com%2Fsearch&locale=fr&powered_by=true&one_way=false&only_direct=false&period=year&range=7%2C14&primary=%230C73FE&color_background=%23ffffff&dark=%23000000&light=%23FFFFFF&achieve=%2345AD35&promo_id=4041&campaign_id=100" charset="utf-8"></script>`
  },
  {
    label: 'Flights — Aviasales Popular Routes (40%)',
    html: `<script async src="https://trpwdg.com/content?currency=eur&trs=${TRS}&shmarker=${SHMARKER}&target_host=www.aviasales.com%2Fsearch&locale=fr&limit=6&powered_by=true&primary=%230085FF&promo_id=4044&campaign_id=100" charset="utf-8"></script>`
  },
  {
    label: 'Flights — Aviasales Prices on Map (40%)',
    html: `<script async src="https://trpwdg.com/content?currency=eur&trs=${TRS}&shmarker=${SHMARKER}&lat=51.51&lng=0.06&powered_by=true&search_host=www.aviasales.com%2Fsearch&locale=en&origin=PAR&value_min=0&value_max=1000000&round_trip=true&only_direct=false&radius=1&draggable=true&disable_zoom=false&show_logo=false&scrollwheel=false&primary=%233FABDB&secondary=%233FABDB&light=%23ffffff&width=1500&height=500&zoom=2&promo_id=4054&campaign_id=100" charset="utf-8"></script>`
  },
  {
    label: 'eSIM — Airalo Search Form (12%)',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&locale=en&powered_by=true&color_button=%2332a8dd&color_focused=%2332a8dd&secondary=%23FFFFFF&dark=%23262626&light=%23FFFFFF&special=%23C4C4C4&border_radius=0&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>`
  },
  {
    label: 'Insurance — VisitorCoverage Travel Medical',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&type=visitor&theme=small-theme1&powered_by=true&campaign_id=153&promo_id=4652" charset="utf-8"></script>`
  },
  {
    label: 'Insurance — Insubuy USA Horizontal ($1.50-$150/policy)',
    html: `<iframe src="https://tp.media/content?campaign_id=165&promo_id=4792&shmarker=${SHMARKER}&trs=${TRS}&widget=670x119" width="670" height="119" frameborder="0" style="max-width:100%;"></iframe>`
  },
  {
    label: 'Insurance — Insubuy Schengen Visa ($1.50-$150/policy)',
    html: `<iframe src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&powered_by=true&locale=fr&promo_id=4797&campaign_id=111" width="100%" height="320" frameborder="0" style="max-width:100%;"></iframe>`
  },
  {
    label: 'Transfers — Kiwitaxi Shuttles Search (9-11%)',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&powered_by=true&locale=fr&promo_id=2949&campaign_id=111" charset="utf-8"></script>`
  },
  {
    label: 'Tours — Tiqets Popular Tours (3.5-8%)',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&powered_by=true&language=fr&promo_id=3947&campaign_id=111" charset="utf-8"></script>`
  },
  {
    label: 'Car Rental — EconomyBookings Search (60%)',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&powered_by=true&locale=fr&promo_id=4480&campaign_id=111" charset="utf-8"></script>`
  },
  {
    label: 'Bikes — BikesBooking Search (4%)',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&powered_by=true&locale=fr&promo_id=5472&campaign_id=111" charset="utf-8"></script>`
  },
  {
    label: 'Flight Compensation — AirHelp Search (15-16.6%)',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&powered_by=true&locale=fr&promo_id=8679&campaign_id=111" charset="utf-8"></script>`
  },
  {
    label: 'Events — TicketNetwork Schedule (6-12.5%)',
    html: `<script async src="https://trpwdg.com/content?trs=${TRS}&shmarker=${SHMARKER}&powered_by=true&locale=fr&promo_id=6086&campaign_id=111" charset="utf-8"></script>`
  },
];

function buildPageContent() {
  let html = `<p><strong>Page de test — Tous les widgets TravelPayouts partner (scripts directs).</strong></p>
<hr />
`;

  for (const w of WIDGETS) {
    html += `
<h2>${w.label}</h2>
<!-- wp:html -->
${w.html}
<!-- /wp:html -->
<hr />
`;
  }

  html += `
<p><em>Fin — ${WIDGETS.length} widgets.</em></p>`;

  return html;
}

async function main() {
  const wpUrl = process.env.WORDPRESS_URL?.replace(/\/$/, '');
  const wpUser = process.env.WORDPRESS_USERNAME;
  const wpPass = process.env.WORDPRESS_APP_PASSWORD;

  if (!wpUrl || !wpUser || !wpPass) {
    console.error('❌ WordPress credentials manquantes');
    process.exit(1);
  }

  const auth = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
  const content = buildPageContent();

  console.log(`📄 Creation de la page "Test Injector" sur ${wpUrl}...`);
  console.log(`   ${WIDGETS.length} widgets inclus\n`);

  // Check if page already exists
  try {
    const existing = await axios.get(`${wpUrl}/wp-json/wp/v2/pages`, {
      params: { search: 'Test Injector', per_page: 5 },
      headers: { Authorization: `Basic ${auth}` }
    });

    const found = existing.data.find(p => p.title.rendered === 'Test Injector');
    if (found) {
      console.log(`   Page existante trouvee (ID=${found.id}), mise a jour...`);
      const updated = await axios.post(`${wpUrl}/wp-json/wp/v2/pages/${found.id}`, {
        content,
        status: 'draft'
      }, {
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
      });
      console.log(`✅ Page mise a jour: ${updated.data.link}`);
      console.log(`   Status: draft (preview uniquement)`);
      return;
    }
  } catch (e) {
    // ignore search errors
  }

  // Create new page
  const response = await axios.post(`${wpUrl}/wp-json/wp/v2/pages`, {
    title: 'Test Injector',
    content,
    status: 'draft',
    slug: 'test-injector'
  }, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
  });

  console.log(`✅ Page creee: ${response.data.link}`);
  console.log(`   ID: ${response.data.id}`);
  console.log(`   Status: draft (preview uniquement)`);
  console.log(`   Slug: test-injector`);
}

main().catch(err => {
  console.error('❌ Erreur:', err.response?.data?.message || err.message);
  process.exit(1);
});
