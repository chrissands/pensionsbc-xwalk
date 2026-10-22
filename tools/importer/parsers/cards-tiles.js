/* eslint-disable */
/* global WebImporter */
/**
 * Builds a Cards block, "tiles" style, from plan site journal articles (xwalk: container cards ->
 * classes; item card -> image, imageAlt, text, variant). One row per article (library
 * convention, empty cells kept): [image or icon | text: headings, paragraphs, lists, links,
 * video links | variant]. variant is this project's card model field: "highlight" for Liferay
 * alert boxes (.portlet-msg-alert), the yellow notice tile.
 * Articles are passed in reading order: down the left column, then the right.
 */
import { damSrc, pushSafeAlt, SVG_ICONS } from '../dam-assets.js';
import { articleContent } from './plan-content.js';

// placeholder alt text from the source that says nothing about the image
const MEANINGLESS_ALT = /^(image|img|photo|picture)?$/i;

function imageOf(document, article, base) {
  const img = article.querySelector('img');
  if (img) {
    const out = document.createElement('img');
    out.src = damSrc(new URL(img.getAttribute('src'), base).href, base);
    const alt = (img.getAttribute('alt') || '').trim();
    out.alt = MEANINGLESS_ALT.test(alt) ? '' : pushSafeAlt(alt);
    return out;
  }
  const icon = [...article.querySelectorAll('svg [id]')].map((e) => SVG_ICONS[e.id]).find(Boolean);
  if (icon) {
    const out = document.createElement('img');
    out.src = icon;
    out.alt = '';
    return out;
  }
  return null;
}

export function buildTiles(document, articles, base) {
  const cells = articles.map((article) => {
    const image = imageOf(document, article, base);
    let imageCell = '';
    if (image) {
      imageCell = document.createDocumentFragment();
      imageCell.appendChild(document.createComment(' field:image '));
      imageCell.appendChild(image);
    }
    const textCell = document.createDocumentFragment();
    textCell.appendChild(document.createComment(' field:text '));
    articleContent(document, article, base).forEach((el) => textCell.appendChild(el));
    let variantCell = '';
    if (article.querySelector('.portlet-msg-alert')) {
      variantCell = document.createDocumentFragment();
      variantCell.appendChild(document.createComment(' field:variant '));
      variantCell.appendChild(document.createTextNode('highlight'));
    }
    return [imageCell, textCell, variantCell];
  });
  return WebImporter.Blocks.createBlock(document, { name: 'Cards (tiles)', cells });
}

export default function parse(element, { document, base, articles }) {
  element.replaceWith(buildTiles(document, articles || [element], base));
}
