/* eslint-disable */
/* global WebImporter */

import { PLAN_HOSTS, siteHref, MY_ACCOUNT_URL, planNameOf } from './plan-sites.js';
import { damSrc, pushSafeAlt } from './dam-assets.js';
import { pageTitle } from './page-title.js';

/**
 * Plan site nav (<site>/en/nav, LOCAL to the plan's live copy) from the shared Liferay theme
 * of the plan sites (college, mpp, pspp, tpp, worksafe); the site comes from the source host.
 * Nav structure shared by all six sites: brand | sections | tools.
 * - brand: plan logo (DAM asset, see dam-assets.js) followed by a link to /en/; header.js joins
 *   them into a linked logo (Universal Editor has no linked-image component)
 * - sections: the main navigation links (.main-navigation__inner), as relative /en/ links
 * - Search: the last section link, to the site's /en/search page (Search block; Content AI search
 *   plugs in later), shown at the right of the nav row
 * - tools: Employer (external) and Sign in to My Account (a primary button)
 * Run with tools/importer/urls-<site>-global.txt.
 */

function sectionName(document, name) {
  return WebImporter.Blocks.createBlock(document, { name: 'Section Metadata', cells: { name } });
}

function para(document, ...children) {
  const p = document.createElement('p');
  p.append(...children);
  return p;
}

function link(document, href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  return a;
}

export default {
  transform: ({ document, url, params }) => {
    const base = params?.originalURL || url;
    const host = new URL(base).hostname;
    const site = Object.keys(PLAN_HOSTS).find((s) => PLAN_HOSTS[s] === host && s !== 'corporate');
    if (!site) throw new Error(`${host} is not a plan site`);

    const header = document.querySelector('.page-header');
    const logo = header?.querySelector('a.logo img');
    const menu = document.querySelector('.main-navigation__inner');
    if (!logo || !menu) throw new Error('Plan header (.page-header logo, .main-navigation__inner) not found');

    // the plan's full name, from the (hidden) plan switcher entry for this site
    const planName = planNameOf(document, site);

    const main = document.createElement('div');

    // brand
    const img = document.createElement('img');
    img.src = damSrc(new URL(logo.getAttribute('src'), base).href, base);
    img.alt = pushSafeAlt(planName);
    main.append(para(document, img));
    main.append(para(document, link(document, '/en/', planName)));
    main.append(sectionName(document, 'Brand'));
    main.append(document.createElement('hr'));

    // sections
    const ul = document.createElement('ul');
    menu.querySelectorAll('[role="menuitem"][href], li > a[href]:not(.button)').forEach((a) => {
      const text = a.textContent.trim().replace(/\s+/g, ' ');
      if (!text || [...ul.querySelectorAll('a')].some((x) => x.textContent === text)) return;
      const li = document.createElement('li');
      li.append(link(document, siteHref(a.getAttribute('href'), base), text));
      ul.append(li);
    });
    const search = header.querySelector('.page-header__link-list a[href*="search"]')
      || menu.querySelector('a[href*="search"]');
    if (search) {
      const li = document.createElement('li');
      li.append(link(document, siteHref(search.getAttribute('href'), base), 'Search'));
      ul.append(li);
    }
    main.append(ul);
    main.append(sectionName(document, 'Sections'));
    main.append(document.createElement('hr'));

    // tools
    const employer = [...header.querySelectorAll('.page-header__link-list a')]
      .find((a) => /employer/i.test(a.textContent));
    if (employer) main.append(para(document, link(document, employer.getAttribute('href'), employer.textContent.trim())));
    const strong = document.createElement('strong');
    strong.append(link(document, MY_ACCOUNT_URL, 'Sign in to My Account'));
    main.append(para(document, strong));
    main.append(sectionName(document, 'Tools'));
    main.append(pageTitle(document, 'Navigation'));

    return [{
      element: main,
      path: `/${site}/en/nav`,
      report: { title: 'nav', site, links: ul.children.length },
    }];
  },
};
