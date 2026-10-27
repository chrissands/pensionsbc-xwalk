import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { joinLinkedImages, languageRoot } from '../../scripts/scripts.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment: <language root>/footer (on the sites, in Universal Editor and locally)
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : `${languageRoot()}/footer`;
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  joinLinkedImages(footer);
  // footers have no buttons: a link alone in a paragraph stays a plain link
  footer.querySelectorAll('.button-container').forEach((p) => p.classList.remove('button-container'));
  footer.querySelectorAll('a.button').forEach((a) => a.classList.remove('button', 'primary', 'secondary'));

  block.append(footer);
}
