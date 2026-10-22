/* eslint-disable */
/* global WebImporter */
/**
 * Cards builders for plan site section pages (xwalk: container cards -> classes; item card ->
 * image, imageAlt, text, variant). Rows follow the library convention: [image | text], the
 * image cell kept even when empty.
 * - topicCards: Liferay site-map items (a link + <description>) -> Cards (featured | links | link-list)
 *   text: [p > a title] [p description]
 * - eventCards: .eventItem (webinar listing) -> Cards (events)
 *   text: [p day<br><strong>date</strong>] [h3 title] [p duration] [p description] [p > a link]
 * - resourceCards: .featureCard (course / video / article) -> Cards (resources)
 *   image; text: [h3 title] [p duration] [p description] [p > a call to action (covers the card)]
 */
import { damSrc, pushSafeAlt } from '../dam-assets.js';
import { siteHref } from '../plan-sites.js';
import { articleContent } from './plan-content.js';

const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

function el(document, tag, children = [], props = {}) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

function textCell(document, nodes) {
  const cell = document.createDocumentFragment();
  cell.appendChild(document.createComment(' field:text '));
  nodes.forEach((n) => cell.appendChild(n));
  return cell;
}

function imageCell(document, img, base) {
  if (!img) return '';
  const cell = document.createDocumentFragment();
  cell.appendChild(document.createComment(' field:image '));
  const out = document.createElement('img');
  out.src = damSrc(new URL(img.getAttribute('src'), base).href, base);
  out.alt = pushSafeAlt((img.getAttribute('alt') || '').trim());
  cell.appendChild(out);
  return cell;
}

/** Site-map topics: every <description> with the link of its item. */
export function topicCards(document, container, style, base) {
  const cells = [...container.querySelectorAll('description')].map((d) => {
    const item = d.closest('.featuredTopicCard, [class*="col-md-12"], .container-fluid') || d.parentElement;
    const a = item.querySelector('a[href]');
    if (!a) return null;
    return ['', textCell(document, [
      el(document, 'p', [el(document, 'a', [text(a)], { href: siteHref(a.getAttribute('href'), base) })]),
      el(document, 'p', [text(d)]),
    ])];
  }).filter(Boolean);
  return WebImporter.Blocks.createBlock(document, { name: `Cards (${style})`, cells });
}

/** Webinar listing; items the source hides (SingleFile: .sf-hidden) are left out. */
export function eventCards(document, container, base) {
  const cells = [...container.querySelectorAll('.eventItem')]
    .filter((item) => !item.matches('.sf-hidden, [hidden]') && text(item))
    .map((item) => {
      const date = el(document, 'p', [
        text(item.querySelector('[class*="dayOfWeek"]')),
        document.createElement('br'),
        el(document, 'strong', [text(item.querySelector('[class*="month"]'))]),
      ]);
      // the event title is the card heading (h3)
      const details = articleContent(document, item.querySelector('.eventItem__details') || item, base)
        .map((n) => (/^H[2-6]$/.test(n.tagName) ? el(document, 'h3', [...n.childNodes]) : n));
      return ['', textCell(document, [date, ...details])];
    });
  return WebImporter.Blocks.createBlock(document, { name: 'Cards (events)', cells });
}

/** Course / video / article cards: the whole source card is one link. */
export function resourceCards(document, container, base) {
  const cells = [...container.querySelectorAll('.featureCard')].map((card) => {
    const link = card.querySelector('a[href]');
    const nodes = [el(document, 'h3', [text(card.querySelector('[class*="--title"]'))])];
    const duration = text(card.querySelector('[class*="--duration"]'));
    if (duration) nodes.push(el(document, 'p', [duration]));
    const description = text(card.querySelector('[class*="--description"]'));
    if (description) nodes.push(el(document, 'p', [description]));
    nodes.push(el(document, 'p', [el(document, 'a', [text(card.querySelector('[class*="--link"]')) || 'Learn more'], {
      href: siteHref(link.getAttribute('href'), base),
    })]));
    return [imageCell(document, card.querySelector('[class*="__top"] img, img'), base), textCell(document, nodes)];
  });
  return WebImporter.Blocks.createBlock(document, { name: 'Cards (resources)', cells });
}

export default function parse(element, { document, base }) {
  element.replaceWith(topicCards(document, element, 'links', base));
}
