/* eslint-disable */
/* global WebImporter */

import heroPanelParser from './parsers/hero-panel.js';
import { buildTiles } from './parsers/cards-tiles.js';
import { articleContent } from './parsers/plan-content.js';
import { PLAN_HOSTS } from './plan-sites.js';

/**
 * Plan site homepage (<site>/en/index, LOCAL to the plan's live copy) from the shared Liferay
 * theme of the plan sites; the site comes from the source host. The page is read in order:
 * - .hero                         -> Hero (panel)
 * - a layout row of two columns   -> Cards (tiles): the left column's articles, then the right's
 * - an article that is only <hr>  -> section break
 * - any other article             -> default content; a heading coloured on the source (the
 *   "In case you missed it..." h2) gives its section the accent-heading style
 * Empty layout fragments are skipped. Images are referenced by DAM path (dam-assets.js), so the
 * site's images must be in AEM Assets first (tools/aem-assets/UPLOAD.md).
 * Run with tools/importer/urls-<site>-home.txt.
 */

// blocks are still tables while the importer builds the page
const isBlock = (el) => el?.tagName === 'TABLE'
  && !/section metadata/i.test((el.querySelector('th, td')?.textContent || ''));

function articlesIn(el) {
  return [...el.querySelectorAll('.journal-content-article')]
    .filter((a) => a.textContent.trim() || a.querySelector('img, svg, iframe'));
}

export default {
  transform: ({ document, url, params }) => {
    const base = params?.originalURL || url;
    const host = new URL(base).hostname;
    const site = Object.keys(PLAN_HOSTS).find((s) => PLAN_HOSTS[s] === host && s !== 'corporate');
    if (!site) throw new Error(`${host} is not a plan site`);
    const source = document.querySelector('#main-content');
    if (!source) throw new Error('#main-content not found');

    const main = document.createElement('div');
    const last = () => main.lastElementChild;

    // hero
    const hero = source.querySelector('.hero');
    if (hero) {
      const holder = document.createElement('div');
      holder.append(hero.cloneNode(true));
      heroPanelParser(holder.firstElementChild, { document, base });
      main.append(holder.firstElementChild);
    }

    // two-column rows and standalone articles, in document order
    const rows = [...source.querySelectorAll('.lfr-layout-structure-item-row > .row')]
      .filter((r) => r.querySelectorAll(':scope > [class*="col-lg-6"]').length === 2);
    const standalone = articlesIn(source)
      .filter((a) => !a.closest('.hero') && !a.querySelector('.hero') && !rows.some((r) => r.contains(a)));
    const units = [...rows, ...standalone].sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));

    units.forEach((unit) => {
      if (rows.includes(unit)) {
        const articles = [...unit.querySelectorAll(':scope > [class*="col-lg-6"]')].flatMap(articlesIn);
        if (!articles.length) return;
        if (isBlock(last())) main.append(document.createElement('hr'));
        main.append(buildTiles(document, articles, base));
      } else if (!unit.textContent.trim() && unit.querySelector('hr')) {
        if (last() && last().tagName !== 'HR') main.append(document.createElement('hr'));
      } else {
        if (isBlock(last())) main.append(document.createElement('hr'));
        articleContent(document, unit, base).forEach((el) => main.append(el));
        // a heading coloured on the source (e.g. "In case you missed it...") -> accent heading section
        if (unit.querySelector('h2[style*="color"], h3[style*="color"]')) {
          main.append(WebImporter.Blocks.createBlock(document, { name: 'Section Metadata', cells: { style: 'accent-heading' } }));
        }
      }
    });

    // metadata: the source title repeats the site name ("College home - College - College")
    const planName = (document.querySelector('.global-navigation li.active img')?.getAttribute('alt') || '')
      .replace(/\s*Home Page$/i, '').trim();
    const pageName = document.title.split(' - ')[0].trim();
    const meta = { Title: planName ? `${pageName} - ${planName}` : pageName };
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    if (description) meta.Description = description;
    main.append(document.createElement('hr'));
    main.append(WebImporter.Blocks.createBlock(document, { name: 'Metadata', cells: meta }));

    return [{
      element: main,
      path: `/${site}/en/index`,
      report: { title: meta.Title, site, tiles: main.querySelectorAll('.cards').length },
    }];
  },
};
