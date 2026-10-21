/* eslint-disable */
/* global WebImporter */

import { productionHref } from './plan-sites.js';

/**
 * Corporate nav (corporate/en/nav, LOCAL to the corporate live copy) from the
 * www.pensionsbc.ca plan switcher (header nav.global-navigation).
 * Nav structure shared by all six sites: brand | sections | tools.
 * - brand: home link (/en/) labelled with the source og:site_name
 * - sections: plan switcher links, link text = source link title (the source shows
 *   logo artwork only); plan links use the production plan hostnames (see plan-sites.js),
 *   My Account uses the production member portal
 * - tools: none on corporate; kept as a named, empty section so every site's nav has the
 *   same brand | sections | tools layout
 * Each section carries a Section Metadata "name" so authors see Brand / Sections / Tools
 * in the Universal Editor content tree.
 */

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
  transform: ({ document, url, params }) => {
    const base = params?.originalURL || url;
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
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = productionHref(a.getAttribute('href'), base);
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
      path: '/corporate/en/nav',
      report: { title: 'nav', links: ul.children.length },
    }];
  },
};
