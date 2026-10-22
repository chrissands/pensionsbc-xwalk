/* eslint-disable */
/* global WebImporter */

import corporateFooter from './import-footer.js';

/**
 * Blueprint default footer (language-masters/en/footer): the corporate footer, unchanged, at the
 * blueprint path. Live copies that haven't authored their own footer get it by rollout.
 * Run with tools/importer/urls-global.txt.
 */
export default {
  transform: (payload) => corporateFooter.transform(payload)
    .map((result) => ({ ...result, path: '/language-masters/en/footer' })),
};
