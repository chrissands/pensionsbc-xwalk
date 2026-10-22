/* eslint-disable */
/* global WebImporter */

import corporateNav from './import-nav.js';

/**
 * Blueprint default nav (language-masters/en/nav): the corporate nav, unchanged, at the
 * blueprint path. Live copies that haven't authored their own nav get it by rollout.
 * Run with tools/importer/urls-global.txt.
 */
export default {
  transform: (payload) => corporateNav.transform(payload)
    .map((result) => ({ ...result, path: '/language-masters/en/nav' })),
};
