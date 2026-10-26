/* eslint-disable */
/* global WebImporter */

/**
 * A Metadata block with the page's Title, for pages that have no title of their own (nav, footer).
 * The push turns it into the AEM page's jcr:title, which AEM needs, e.g. to translate the page.
 * The header and footer ignore it when they load the page as a fragment (fragment.js).
 */
export function pageTitle(document, title) {
  return WebImporter.Blocks.createBlock(document, { name: 'Metadata', cells: { Title: title } });
}
