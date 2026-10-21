/* eslint-disable */
/* global WebImporter */
/**
 * Parser for the boilerplate Hero block, "split" style (xwalk model: hero -> classes, image, imageAlt, text).
 * Source: two-column Liferay row; left column .stripe holds h1 + h2 subtitle,
 * right column holds img.banner_img.
 * Rows: [image] / [text richtext: h1 + p subtitle]
 */
export default function parse(element, { document }) {
  const cells = [];

  // Row: image (imageAlt collapses onto the image's alt attribute)
  const img = element.querySelector('img.banner_img') || element.querySelector('img');
  if (img) {
    const imageCell = document.createDocumentFragment();
    imageCell.appendChild(document.createComment(' field:image '));
    imageCell.appendChild(img);
    cells.push([imageCell]);
  } else {
    cells.push(['']);
  }

  // Row: text (h1 kept as heading, h2 subtitle authored as paragraph)
  const stripe = element.querySelector('.stripe') || element;
  const heading = stripe.querySelector('h1');
  const subtitle = stripe.querySelector('h2');
  const textNodes = [];
  if (heading) {
    const h1 = document.createElement('h1');
    h1.innerHTML = heading.innerHTML;
    textNodes.push(h1);
  }
  if (subtitle) {
    const p = document.createElement('p');
    p.innerHTML = subtitle.innerHTML;
    textNodes.push(p);
  }
  if (textNodes.length) {
    const textCell = document.createDocumentFragment();
    textCell.appendChild(document.createComment(' field:text '));
    textNodes.forEach((n) => textCell.appendChild(n));
    cells.push([textCell]);
  } else {
    cells.push(['']);
  }

  const block = WebImporter.Blocks.createBlock(document, { name: 'Hero (split)', cells });
  element.replaceWith(block);
}
