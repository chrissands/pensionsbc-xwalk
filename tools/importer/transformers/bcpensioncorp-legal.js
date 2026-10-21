/* eslint-disable */
/* global WebImporter */

/**
 * bcpensioncorp.ca legal pages (copyright, disclaimer, privacy) -> shared pages in
 * language-masters/en. Only runs for www.bcpensioncorp.ca sources.
 * - keeps the page's first journal article (the legal text); drops the decorative
 *   "Footer Image" article and inline styles
 * - promotes headings one level (source starts at h2 with no visible h1), so each page
 *   has a single h1 and headings stay in order
 * - makes site-relative links (e.g. the Privacy Policy PDF) absolute to bcpensioncorp.ca,
 *   since those documents are not part of this migration
 */
const SOURCE_HOST = 'www.bcpensioncorp.ca';

function isLegalSource(payload) {
  try {
    return new URL(payload.params.originalURL).hostname.toLowerCase() === SOURCE_HOST;
  } catch (e) {
    return false;
  }
}

export default function transform(hookName, element, payload) {
  if (hookName !== 'beforeTransform' || !isLegalSource(payload)) return;

  const document = element.ownerDocument;
  const main = element.querySelector('#main-content') || element;
  const article = main.querySelector('.journal-content-article');
  if (!article) return;

  const content = document.createElement('div');
  [...article.children].forEach((child) => {
    if (child.tagName !== 'STYLE') content.append(child.cloneNode(true));
  });

  // h2 -> h1, h3 -> h2, ... (process top-down so each heading is promoted once)
  content.querySelectorAll('h2, h3, h4, h5, h6').forEach((h) => {
    const level = Number(h.tagName[1]) - 1;
    const promoted = document.createElement(`h${level}`);
    promoted.innerHTML = h.innerHTML;
    h.replaceWith(promoted);
  });

  content.querySelectorAll('a[href^="/"]').forEach((a) => {
    a.setAttribute('href', new URL(a.getAttribute('href'), `https://${SOURCE_HOST}`).href);
  });

  element.innerHTML = '';
  element.append(content);
}
