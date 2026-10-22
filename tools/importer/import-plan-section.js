/* eslint-disable */
/* global WebImporter */

import { buildTiles } from './parsers/cards-tiles.js';
import {
  topicCards, resourceCards, eventData, eventListBlock,
} from './parsers/cards-topics.js';
import { articleContent } from './parsers/plan-content.js';
import { PLAN_HOSTS, siteHref, planNameOf } from './plan-sites.js';

/**
 * Plan site section pages (Your pension, Learning resources, About us, ... : LOCAL to the plan's
 * live copy) from the shared Liferay theme of the plan sites; the site comes from the source host
 * and the page path from the URL. The page is read in order and each source component becomes:
 * - the article with the h1          -> h1 (and breadcrumbs: true)
 * - an article that is only an h2    -> lead paragraph, when it follows the h1
 * - .featuredTopics                  -> Cards (featured)
 * - .row.topics                      -> Cards (link-list)
 * - other site-map portlets          -> Cards (links)
 * - .subnavQuickLinks                -> section styled quick-links: h2 + list of links
 * - .eventsListing                   -> Event list (items reference Event content fragments; the
 *                                      event data goes to the import report for tools/aem-cf)
 * - .featureCards                    -> Cards (resources)
 * - .search-bar                      -> Search block (the site's search page)
 * - a row with a 2/3 and a filled 1/3 column -> section styled sidebar: the main column's
 *   components, then the 1/3 column's articles as Cards (tiles)
 * - any other article                -> default content (its headings become h2)
 * Images are referenced by DAM path (dam-assets.js / prepare-snapshot.mjs), so they must be in
 * AEM Assets first. Run with tools/importer/urls-<site>-sections.txt.
 */

const UNIT = [
  '.featuredTopics', '.row.topics', '[class*="sitenavigationsitemapportlet"]', '.subnavQuickLinks',
  '.eventsListing', '.featureCards', '.journal-content-article', '.search-bar',
].join(', ');

const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
// blocks are still tables while the importer builds the page; section metadata is not a block
const isBlock = (el) => el?.tagName === 'TABLE' && !/section metadata/i.test(text(el.querySelector('th, td')));

function sectionStyle(document, style) {
  return WebImporter.Blocks.createBlock(document, { name: 'Section Metadata', cells: { style } });
}

/** Units in document order, outermost only (a unit inside another is part of it). */
function unitsIn(root) {
  const all = [...root.querySelectorAll(UNIT)]
    .filter((u) => text(u) || u.querySelector('img') || u.matches('.search-bar'));
  return all.filter((u) => !all.some((o) => o !== u && o.contains(u)));
}

function sidebarRows(root) {
  return [...root.querySelectorAll('.lfr-layout-structure-item-row > .row')].filter((row) => {
    const cols = [...row.children];
    const side = cols.find((c) => /col-(lg|md)-4\b/.test(c.className));
    return cols.some((c) => /col-(lg|md)-8\b/.test(c.className)) && side && (text(side) || side.querySelector('img'));
  });
}

export default {
  transform: ({ document, url, params }) => {
    const base = params?.originalURL || url;
    const source = new URL(base);
    const site = Object.keys(PLAN_HOSTS).find((s) => PLAN_HOSTS[s] === source.hostname && s !== 'corporate');
    if (!site) throw new Error(`${source.hostname} is not a plan site`);
    const root = document.querySelector('#main-content');
    if (!root) throw new Error('#main-content not found');

    const main = document.createElement('div');
    const events = [];
    let newSection = false;
    const startSection = () => {
      if (main.children.length && (newSection || isBlock(main.lastElementChild))) main.append(document.createElement('hr'));
      newSection = false;
    };
    const closeStyled = (style) => {
      main.append(sectionStyle(document, style));
      newSection = true;
    };

    const component = (unit) => {
      if (unit.matches('.featuredTopics')) return topicCards(document, unit, 'featured', base);
      if (unit.matches('.row.topics')) return topicCards(document, unit, 'link-list', base);
      if (unit.matches('[class*="sitenavigationsitemapportlet"]')) {
        if (unit.querySelector('.featuredTopics')) return topicCards(document, unit.querySelector('.featuredTopics'), 'featured', base);
        if (unit.querySelector('.row.topics')) return topicCards(document, unit.querySelector('.row.topics'), 'link-list', base);
        return topicCards(document, unit, 'links', base);
      }
      if (unit.matches('.eventsListing')) {
        // webinars become Event content fragments (built by tools/aem-cf from the import report),
        // referenced by an Event list block
        const data = eventData(document, unit, base);
        events.push(...data);
        return eventListBlock(document, data, `/content/dam/pensionsbc-base/${site}/events`);
      }
      if (unit.matches('.featureCards')) return resourceCards(document, unit, base);
      // Liferay search bar -> Search block (no index yet: Content AI search plugs in later)
      if (unit.matches('.search-bar')) return WebImporter.Blocks.createBlock(document, { name: 'Search', cells: [['']] });
      return null;
    };

    const rows = sidebarRows(root);
    const units = [...rows, ...unitsIn(root).filter((u) => !rows.some((r) => r.contains(u)))]
      .sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));

    let afterH1 = false;
    units.forEach((unit) => {
      if (rows.includes(unit)) {
        // a styled section of its own
        if (main.children.length) main.append(document.createElement('hr'));
        newSection = false;
        const cols = [...unit.children];
        cols.filter((c) => /col-(lg|md)-8\b/.test(c.className)).forEach((col) => {
          unitsIn(col).forEach((u) => {
            const block = component(u);
            if (block) main.append(block);
            else articleContent(document, u, base).forEach((n) => main.append(n));
          });
        });
        const side = cols.find((c) => /col-(lg|md)-4\b/.test(c.className));
        const articles = [...side.querySelectorAll('.journal-content-article')].filter((a) => text(a) || a.querySelector('img'));
        if (articles.length) main.append(buildTiles(document, articles, base));
        closeStyled('sidebar');
        return;
      }
      if (unit.matches('.subnavQuickLinks')) {
        if (main.children.length) main.append(document.createElement('hr'));
        const h2 = document.createElement('h2');
        h2.textContent = text(unit.querySelector('h2, h3, h4, [class*="title"]'));
        const ul = document.createElement('ul');
        unit.querySelectorAll('a[href]').forEach((a) => {
          const li = document.createElement('li');
          const link = document.createElement('a');
          link.href = siteHref(a.getAttribute('href'), base);
          link.textContent = text(a);
          li.append(link);
          ul.append(li);
        });
        main.append(h2, ul);
        closeStyled('quick-links');
        return;
      }
      const block = component(unit);
      if (block) {
        if (newSection) startSection();
        main.append(block);
        afterH1 = false;
        return;
      }
      // journal article
      const h1 = unit.querySelector('h1');
      if (h1) {
        startSection();
        const heading = document.createElement('h1');
        heading.textContent = text(h1);
        main.append(heading);
        afterH1 = true;
        return;
      }
      const content = articleContent(document, unit, base);
      if (afterH1 && content.length === 1 && content[0].tagName === 'H2') {
        const lead = document.createElement('p');
        lead.append(...content[0].childNodes);
        main.append(lead);
        afterH1 = false;
        return;
      }
      afterH1 = false;
      startSection();
      content.forEach((n) => {
        if (/^H[3-6]$/.test(n.tagName) && n === content.find((c) => /^H[2-6]$/.test(c.tagName))) {
          const h2 = document.createElement('h2');
          h2.append(...n.childNodes);
          main.append(h2);
        } else main.append(n);
      });
    });

    // metadata: the source title repeats the site name ("About us - College - College")
    const planName = planNameOf(document, site);
    const pageName = document.title.split(' - ')[0].trim();
    // metadata keys must match the page model field names (lower case) to reach AEM
    const meta = { Title: planName ? `${pageName} - ${planName}` : pageName, breadcrumbs: 'true' };
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content');
    if (description) meta.Description = description;
    main.append(document.createElement('hr'));
    main.append(WebImporter.Blocks.createBlock(document, { name: 'Metadata', cells: meta }));

    const path = siteHref(source.pathname, base).replace(/^\/en/, `/${site}/en`);
    return [{
      element: main,
      path,
      report: {
        title: meta.Title, site, blocks: main.querySelectorAll('table').length, ...(events.length ? { events: JSON.stringify(events) } : {}),
      },
    }];
  },
};
