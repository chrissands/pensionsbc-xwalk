/* eslint-disable */
/* global WebImporter */

/**
 * Corporate nav (corporate/en/nav, LOCAL to the corporate live copy).
 * www.pensionsbc.ca shows no navigation in its header (the plan switcher in its markup is
 * not displayed), so the corporate nav is the shared brand | sections | tools structure
 * with all three sections empty. Plan sites author their own links in the same structure.
 * Each section carries a Section Metadata "name" so authors see Brand / Sections / Tools
 * in the Universal Editor content tree and can add content later.
 */

function sectionName(document, name) {
  return WebImporter.Blocks.createBlock(document, { name: 'Section Metadata', cells: { name } });
}

export default {
  transform: ({ document }) => {
    const main = document.createElement('div');
    ['Brand', 'Sections', 'Tools'].forEach((name, i) => {
      if (i) main.append(document.createElement('hr'));
      main.append(sectionName(document, name));
    });

    return [{
      element: main,
      path: '/corporate/en/nav',
      report: { title: 'nav', links: 0 },
    }];
  },
};
