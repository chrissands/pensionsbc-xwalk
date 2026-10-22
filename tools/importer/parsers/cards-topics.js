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

const kebab = (s) => s.toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The page's reference date: the SingleFile save date when present, else today. */
function referenceDate(document) {
  const comment = [...document.documentElement.childNodes, ...document.childNodes].find((n) => n.nodeType === 8 && /saved date:/.test(n.textContent));
  const saved = comment && new Date(comment.textContent.match(/saved date:\s*(.+?\d{4})/)?.[1]);
  return saved && !Number.isNaN(saved.getTime()) ? saved : new Date();
}

/**
 * The webinar listing as Event content fragment data. The source shows weekday + month and day
 * only ("Thu", "Oct 29"): the year is the first one, from the reference date's year, in which that
 * day falls on that weekday.
 */
export function eventData(document, container, base) {
  const ref = referenceDate(document);
  return [...container.querySelectorAll('.eventItem')]
    .filter((item) => !item.matches('.sf-hidden, [hidden]') && text(item))
    .map((item) => {
      const weekday = text(item.querySelector('[class*="dayOfWeek"]')).slice(0, 3).toLowerCase();
      const monthDay = text(item.querySelector('[class*="month"]'));
      let startDate = '';
      for (let y = ref.getFullYear() - 1; y <= ref.getFullYear() + 6 && !startDate; y += 1) {
        const d = new Date(`${monthDay} ${y} 12:00 UTC`);
        if (!Number.isNaN(d.getTime()) && d >= new Date(ref.getTime() - 31 * 864e5)
          && d.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }).toLowerCase() === weekday) {
          startDate = d.toISOString().slice(0, 10);
        }
      }
      const details = item.querySelector('.eventItem__details') || item;
      const title = text(details.querySelector('h2, h3, h4'));
      const link = details.querySelector('a[href]');
      const paragraphs = [...details.querySelectorAll('p')].map(text).filter(Boolean);
      const duration = text(details.querySelector('em'));
      return {
        slug: kebab(title),
        title,
        startDate,
        duration,
        description: paragraphs.find((p) => p !== duration) || '',
        registrationUrl: link ? siteHref(link.getAttribute('href'), base) : '',
        linkText: text(link),
      };
    });
}

/** Event list block: one item per event, referencing its fragment in folder (a DAM path). */
export function eventListBlock(document, events, folder) {
  const cells = events.map((e) => {
    const cell = document.createDocumentFragment();
    cell.appendChild(document.createComment(' field:fragment '));
    const a = el(document, 'a', [`${folder}/${e.slug}`], { href: `${folder}/${e.slug}` });
    cell.appendChild(a);
    return [cell];
  });
  return WebImporter.Blocks.createBlock(document, { name: 'Event List', cells });
}
