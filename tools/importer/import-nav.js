/* eslint-disable */
/* global WebImporter */

/**
 * Shared nav (language-masters/en/nav) from the www.pensionsbc.ca plan switcher
 * (header nav.global-navigation). Boilerplate nav structure: brand | sections | tools.
 * - brand: home link (/en/) labelled with the source og:site_name; each live copy
 *   can override it with its own brand
 * - sections: plan switcher links, link text = source link title (the source shows
 *   logo artwork only); plan links use the plans' production hostnames with /en/
 *   (scripts.js points them at the plan Edge Delivery sites on aem.page / aem.live)
 * - tools: empty in the blueprint (corporate has no tools); kept as a named section so
 *   plan navs (authored locally per live copy) reuse the same brand | sections | tools layout
 * Each section carries a Section Metadata "name" so authors see Brand / Sections / Tools
 * in the Universal Editor content tree.
 */
const PLAN_SITE_BY_HREF = {
  '/web/college': 'college',
  'https://mppmaint1.pensionsbc.ca': 'mpp',
  '/web/public-service': 'pspp',
  '/web/teachers': 'tpp',
  'https://worksafemaint1.pensionsbc.ca': 'worksafe',
};

const planSiteUrl = (site) => `https://${site}.pensionsbc.ca/en/`;

function sectionName(document, name) {
  return WebImporter.Blocks.createBlock(document, { name: 'Section Metadata', cells: { name } });
}

function brandSection(document) {
  const siteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (!siteName) throw new Error('og:site_name not found in source');
  const p = document.createElement('p');
  const a = document.createElement('a');
  a.href = '/en/';
  a.textContent = siteName.trim();
  p.append(a);
  return p;
}

export default {
  transform: ({ document }) => {
    const source = document.querySelector('nav.global-navigation');
    if (!source) throw new Error('Plan switcher (nav.global-navigation) not found in source');

    const main = document.createElement('div');

    // brand
    main.append(brandSection(document));
    main.append(sectionName(document, 'Brand'));
    main.append(document.createElement('hr'));

    // sections: plan switcher
    const ul = document.createElement('ul');
    source.querySelectorAll('li > a[href]').forEach((a) => {
      const href = a.getAttribute('href').replace(/\/$/, '');
      const site = PLAN_SITE_BY_HREF[href];
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = site ? planSiteUrl(site) : a.getAttribute('href');
      link.textContent = (a.getAttribute('title') || a.textContent).trim();
      li.append(link);
      ul.append(li);
    });
    main.append(ul);
    main.append(sectionName(document, 'Sections'));
    main.append(document.createElement('hr'));

    // tools: none on corporate; named, otherwise empty section keeps the layout
    main.append(sectionName(document, 'Tools'));

    return [{
      element: main,
      path: '/language-masters/en/nav',
      report: { title: 'nav', links: ul.children.length },
    }];
  },
};
