/* eslint-disable */
/* global WebImporter */

/**
 * Corporate footer (corporate/en/footer, LOCAL to the corporate live copy) from the
 * www.pensionsbc.ca footer:
 * BC Pension Corporation + BCI logo links (external) and the Copyright /
 * Disclaimer / Privacy links, which become relative /en/ links to the shared
 * legal pages (migrated into language-masters/en).
 * Each logo link is authored as an Image followed by a Link (Universal Editor has no
 * linked-image component); footer.js joins them back into a linked logo. The link
 * text is the source image alt text.
 */
const LEGAL_PATHS = {
  'https://www.bcpensioncorp.ca/copyright': '/en/copyright',
  'https://www.bcpensioncorp.ca/disclaimer': '/en/disclaimer',
  'https://www.bcpensioncorp.ca/privacy': '/en/privacy',
};

function logoLink(document, a, base) {
  const img = a.querySelector('img');
  const alt = img.getAttribute('alt') || '';
  const imageP = document.createElement('p');
  const image = document.createElement('img');
  // absolute, so the AEM push can fetch the logo into the DAM
  image.src = new URL(img.getAttribute('src'), base).href;
  image.alt = alt;
  imageP.append(image);
  const linkP = document.createElement('p');
  const link = document.createElement('a');
  link.href = a.getAttribute('href');
  if (a.title) link.title = a.title;
  link.textContent = alt;
  linkP.append(link);
  return [imageP, linkP];
}

export default {
  transform: ({ document, url, params }) => {
    const base = params?.originalURL || url;
    const footers = [...document.querySelectorAll('footer.footer_links')];
    const logos = footers.find((f) => f.querySelector('img'));
    const legal = footers.find((f) => f.querySelector('ul a'));
    if (!logos || !legal) throw new Error('Footer logos or legal links not found in source');

    const main = document.createElement('div');
    logos.querySelectorAll('a[href]').forEach((a) => main.append(...logoLink(document, a, base)));

    const ul = document.createElement('ul');
    legal.querySelectorAll('li > a[href]').forEach((a) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      const href = a.getAttribute('href').replace(/\/$/, '');
      link.href = LEGAL_PATHS[href] || a.getAttribute('href');
      if (a.title) link.title = a.title;
      link.textContent = a.textContent.trim();
      li.append(link);
      ul.append(li);
    });
    main.append(ul);

    return [{
      element: main,
      path: '/corporate/en/footer',
      report: { title: 'footer', logos: logos.querySelectorAll('img').length, links: ul.children.length },
    }];
  },
};
