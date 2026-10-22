/* eslint-disable */
/* global WebImporter */
/**
 * Parser for the Hero block, "panel" style (xwalk model: hero -> classes, image, imageAlt, text).
 * Source (plan sites): .hero > .hero__image (background-image) > .hero__topics with an h2 and,
 * per topic, a div holding a link paragraph and a description.
 * Rows (library convention): [background image] / [text richtext: h2 title, then per topic a
 * link paragraph + a description paragraph]
 */
import { damSrc } from '../dam-assets.js';
import { siteHref } from '../plan-sites.js';
import { copyInline } from './plan-content.js';

export default function parse(element, { document, base }) {
  const cells = [];

  // Row: image, from the background image (decorative: empty alt)
  const bg = (element.querySelector('.hero__image')?.getAttribute('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/);
  if (bg) {
    const imageCell = document.createDocumentFragment();
    imageCell.appendChild(document.createComment(' field:image '));
    const img = document.createElement('img');
    img.src = damSrc(new URL(bg[1], base).href, base);
    img.alt = '';
    imageCell.appendChild(img);
    cells.push([imageCell]);
  } else {
    cells.push(['']);
  }

  // Row: text
  const topics = element.querySelector('.hero__topics') || element;
  const textCell = document.createDocumentFragment();
  textCell.appendChild(document.createComment(' field:text '));
  const h2 = topics.querySelector('h2');
  if (h2) {
    const heading = document.createElement('h2');
    heading.textContent = h2.textContent.trim().replace(/\s+/g, ' ');
    textCell.appendChild(heading);
  }
  topics.querySelectorAll(':scope > div').forEach((topic) => {
    const a = topic.querySelector('a[href]');
    if (!a) return;
    const linkP = document.createElement('p');
    const link = document.createElement('a');
    link.href = siteHref(a.getAttribute('href'), base);
    link.textContent = a.textContent.trim().replace(/\s+/g, ' ');
    linkP.append(link);
    textCell.appendChild(linkP);
    const rest = topic.cloneNode(true);
    rest.querySelector('a[href]')?.closest('p')?.remove();
    const desc = copyInline(document, rest, document.createElement('p'), base);
    desc.innerHTML = desc.innerHTML.trim();
    if (desc.textContent.trim()) textCell.appendChild(desc);
  });
  cells.push([textCell]);

  const block = WebImporter.Blocks.createBlock(document, { name: 'Hero (panel)', cells });
  element.replaceWith(block);
}
