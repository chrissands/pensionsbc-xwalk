/* eslint-disable */
/* global WebImporter */

import { PLAN_HOSTS, siteHref, productionHref } from './plan-sites.js';
import { damSrc, pushSafeAlt } from './dam-assets.js';

/**
 * Plan site footer (<site>/en/footer, LOCAL to the plan's live copy) from the shared Liferay
 * theme of the plan sites; the site comes from the source host. Five sections, each with a
 * Section Metadata style that footer.css lays out (and a name for the Universal Editor tree):
 * - footer-links: the link columns (heading + list each)
 * - footer-about: plan logo and description
 * - footer-connect: "Connect with us": hours, links, YouTube
 * - footer-plans: "Looking for a different pension plan?" with the other plans' logos
 * - footer-legal: Copyright / Privacy / Disclaimer (shared pages) and © BC Pension Corporation
 * Linked images are authored as an Image followed by a Link; footer.js joins them.
 * Co-browse (a third-party script widget) is not migrated.
 * Run with tools/importer/urls-<site>-global.txt.
 */

const text = (el) => (el?.textContent || '').trim().replace(/\s+/g, ' ');

function section(document, main, name, style, children) {
  if (main.children.length) main.append(document.createElement('hr'));
  main.append(...children);
  main.append(WebImporter.Blocks.createBlock(document, { name: 'Section Metadata', cells: { name, style } }));
}

function el(document, tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => { e[k] = v; });
  e.append(...children);
  return e;
}

/** An image paragraph followed by a link paragraph (joined into a linked image by footer.js). */
function linkedImage(document, src, base, href, label) {
  const img = el(document, 'img', { src: damSrc(new URL(src, base).href, base), alt: '' });
  return [el(document, 'p', {}, img), el(document, 'p', {}, el(document, 'a', { href }, label))];
}

function linkList(document, links, base) {
  return el(document, 'ul', {}, ...links.map((a) => el(document, 'li', {},
    el(document, 'a', { href: siteHref(a.getAttribute('href'), base) }, text(a)))));
}

export default {
  transform: ({ document, url, params }) => {
    const base = params?.originalURL || url;
    const host = new URL(base).hostname;
    const site = Object.keys(PLAN_HOSTS).find((s) => PLAN_HOSTS[s] === host && s !== 'corporate');
    if (!site) throw new Error(`${host} is not a plan site`);
    const footer = document.querySelector('footer .page-footer__column-1');
    if (!footer) throw new Error('Plan footer (footer .page-footer__column-1) not found');
    const headings = [...footer.querySelectorAll('h4.footer-item-header')];
    const main = document.createElement('div');

    // link columns
    const columns = headings.filter((h) => h.nextElementSibling?.matches('ul.footer-list'));
    section(document, main, 'Link columns', 'footer-links', columns.flatMap((h) => [
      el(document, 'h2', {}, text(h)),
      linkList(document, [...h.nextElementSibling.querySelectorAll('a[href]')], base),
    ]));

    // about
    const logo = [...footer.querySelectorAll('img')].find((i) => /logo/i.test(i.alt) && !i.closest('.footer-plans, .socialmedia'));
    const aboutCol = logo?.closest('.col-md-6');
    const about = text([...(aboutCol?.querySelectorAll('.col') || [])].find((c) => !c.querySelector('img')));
    const logoImg = el(document, 'img', { src: damSrc(new URL(logo.getAttribute('src'), base).href, base), alt: pushSafeAlt(logo.alt) });
    section(document, main, 'About', 'footer-about', [el(document, 'p', {}, logoImg), el(document, 'p', {}, about)]);

    // connect
    const connectHeading = headings.find((h) => /connect/i.test(text(h)));
    const connect = connectHeading.closest('.col-md-6');
    const hours = connect.querySelector('strong').parentElement;
    const hoursP = el(document, 'p', {}, el(document, 'strong', {}, text(hours.querySelector('strong'))));
    [...hours.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
      .forEach((n) => hoursP.append(document.createElement('br'), n.textContent.trim()));
    const youtube = connect.querySelector('a[href*="youtube"]');
    const planName = (document.querySelector('.global-navigation li.active img')?.getAttribute('alt') || '')
      .replace(/\s*Home Page$/i, '').trim() || logo.alt.replace(/\s*logo$/i, '');
    section(document, main, 'Connect with us', 'footer-connect', [
      el(document, 'h2', {}, text(connectHeading)),
      hoursP,
      linkList(document, [...connect.querySelectorAll('ul a[href]')], base),
      ...(youtube ? linkedImage(document, youtube.querySelector('img').getAttribute('src'), base,
        youtube.getAttribute('href'), pushSafeAlt(`${planName} on YouTube`)) : []),
    ]);

    // other plans
    const plansHeading = headings.find((h) => /different pension plan/i.test(text(h)));
    const plans = [...footer.querySelectorAll('.footer-plans:not(.d-none) a[href]')];
    section(document, main, 'Other plans', 'footer-plans', [
      el(document, 'h2', {}, text(plansHeading)),
      ...plans.flatMap((a) => linkedImage(document, a.querySelector('img').getAttribute('src'), base,
        productionHref(a.getAttribute('href'), base), pushSafeAlt(a.querySelector('img').alt.replace(/\s*logo$/i, '')))),
    ]);

    // legal
    const legal = [...footer.querySelectorAll('ul.bcpc-legal-footer a[href]')];
    const corp = [...footer.querySelectorAll('a[href]')].find((a) => /bcpensioncorp/.test(a.getAttribute('href')));
    section(document, main, 'Legal', 'footer-legal', [
      linkList(document, legal, base),
      el(document, 'p', {}, el(document, 'a', { href: corp.getAttribute('href') }, text(corp))),
    ]);

    return [{
      element: main,
      path: `/${site}/en/footer`,
      report: { title: 'footer', site, links: main.querySelectorAll('a').length },
    }];
  },
};
