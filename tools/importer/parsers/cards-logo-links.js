/* eslint-disable */
/* global WebImporter */
/**
 * Parser for the boilerplate Cards block, "logos" style (xwalk container
 * cards -> classes; item model: card -> image, imageAlt, text).
 * Source: .plans > .plan_card (img logo + .plan_names > p > a).
 * One row per card: [logo image (alt kept) | links, each in its own <p>]
 * Member-site links point at the plan's production hostname + /en/ (see plan-sites.js);
 * employer portal links stay as in the source.
 */
import { productionHref } from '../plan-sites.js';

export default function parse(element, { document }) {
  const cells = [];

  const cards = element.querySelectorAll(':scope > .plan_card');
  const items = cards.length ? cards : element.querySelectorAll('.plan_card');

  items.forEach((card) => {
    // Image cell (imageAlt collapses onto the img alt attribute)
    let imageCell = '';
    const img = card.querySelector(':scope > img') || card.querySelector('img');
    if (img) {
      imageCell = document.createDocumentFragment();
      imageCell.appendChild(document.createComment(' field:image '));
      imageCell.appendChild(img);
    }

    // Text cell: each link in its own paragraph, preserving href and title
    let textCell = '';
    const links = card.querySelectorAll('.plan_names a[href]');
    if (links.length) {
      textCell = document.createDocumentFragment();
      textCell.appendChild(document.createComment(' field:text '));
      links.forEach((link) => {
        const p = document.createElement('p');
        const a = document.createElement('a');
        a.href = productionHref(link.getAttribute('href'));
        const title = link.getAttribute('title');
        if (title) a.setAttribute('title', title);
        a.textContent = link.textContent.trim();
        p.appendChild(a);
        textCell.appendChild(p);
      });
    }

    cells.push([imageCell, textCell]);
  });

  const block = WebImporter.Blocks.createBlock(document, { name: 'Cards (logos)', cells });
  element.replaceWith(block);
}
