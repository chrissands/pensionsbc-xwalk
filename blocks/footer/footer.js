import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  // const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const lang = window.location.pathname.split('/')[1];
  const root = /^[a-z]{2}$/.test(lang) ? `/${lang}` : '';
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : `${root}/footer`;
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  // linked logos: authored as an Image followed by a Link (no linked-image component in
  // Universal Editor); join them so the picture becomes the link content
  footer.querySelectorAll('p').forEach((imageP) => {
    const picture = imageP.querySelector(':scope > picture');
    const linkP = imageP.nextElementSibling;
    if (!picture || imageP.textContent.trim() || linkP?.tagName !== 'P') return;
    const link = linkP.querySelector(':scope > a[href]');
    const linkOnly = link && linkP.children.length === 1
      && linkP.textContent.trim() === link.textContent.trim();
    if (!linkOnly) return;
    const img = picture.querySelector('img');
    if (img && !img.alt) img.alt = link.textContent.trim();
    link.className = '';
    link.replaceChildren(picture);
    linkP.className = '';
    imageP.remove();
  });

  block.append(footer);
}
