import {
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  getMetadata,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/**
 * Linked images are authored as an Image followed by a Link (Universal Editor has no
 * linked-image component). Joins each such pair so the picture becomes the link content;
 * the link text becomes the image's alt text when the image has none.
 * @param {Element} container The element to look in
 */
export function joinLinkedImages(container) {
  container?.querySelectorAll('p').forEach((imageP) => {
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
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

function autolinkModals(doc) {
  doc.addEventListener('click', async (e) => {
    const origin = e.target.closest('a');
    if (origin && origin.href && origin.href.includes('/modals/')) {
      e.preventDefault();
      const { openModal } = await import(`${window.hlx.codeBasePath}/blocks/modal/modal.js`);
      openModal(origin.href);
    }
  });
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks() {
  try {
    // TODO: add auto block, if needed
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

// The demo sites are served from aem.page only. Content links to the pensionsbc.ca site each
// demo site represents (Edge Delivery turns aem.page links in content into relative paths), and
// those links are pointed at the matching demo site here.
const PLAN_SITES = {
  'www.pensionsbc.ca': 'pensionsbc-xwalk',
  'pensionsbc.ca': 'pensionsbc-xwalk',
  'college.pensionsbc.ca': 'pensionsbc-college',
  'mpp.pensionsbc.ca': 'pensionsbc-mpp',
  'pspp.pensionsbc.ca': 'pensionsbc-pspp',
  'tpp.pensionsbc.ca': 'pensionsbc-tpp',
  'worksafe.pensionsbc.ca': 'pensionsbc-worksafe',
};
const EDS_HOST = /^([a-z0-9-]+)--([a-z0-9-]+)--([a-z0-9-]+)\.(aem\.page|aem\.live)$/;

const SITES = Object.fromEntries(Object.values(PLAN_SITES)
  .map((eds) => [eds, eds === 'pensionsbc-xwalk' ? 'corporate' : eds.replace(/^pensionsbc-/, '')]));

/**
 * The site a page belongs to: from the aem.page / aem.live host, or from the AEM path
 * (/content/pensionsbc-base/<site>/... in Universal Editor, /content/<site>/... locally).
 */
function siteOf({ hostname, pathname }) {
  const host = hostname.match(EDS_HOST);
  if (host) return SITES[host[2]] || '';
  const path = pathname.match(/^\/content\/(?:pensionsbc-base\/)?([a-z]+)\//);
  return path && Object.values(SITES).includes(path[1]) ? path[1] : '';
}

/** body.site-<site>, plus body.theme-plan on the plan sites (see the site themes in styles.css) */
function decorateSiteTheme() {
  const site = siteOf(window.location);
  if (!site) return;
  document.body.classList.add(`site-${site}`);
  if (site !== 'corporate') document.body.classList.add('theme-plan');
}

function rewritePlanLinks(main) {
  const current = window.location.hostname.match(EDS_HOST);
  if (!current) return;
  const [, ref, , owner] = current;
  main.querySelectorAll('a[href]').forEach((link) => {
    let url;
    try {
      url = new URL(link.href);
    } catch (e) {
      return;
    }
    const site = PLAN_SITES[url.hostname];
    // only site homes and migrated (/en/...) pages; other paths (e.g. e-learning files) stay real
    if (!site || !/^\/(en(\/.*)?)?$/.test(url.pathname)) return;
    url.protocol = 'https:';
    url.host = `${ref}--${site}--${owner}.aem.page`;
    link.href = url.href;
  });
}

function a11yLinks(main) {
  const links = main.querySelectorAll('a');
  links.forEach((link) => {
    let label = link.textContent;
    if (!label && link.querySelector('span.icon')) {
      const icon = link.querySelector('span.icon');
      label = icon ? icon.classList[1]?.split('-')[1] : label;
    }
    link.setAttribute('aria-label', label);
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  rewritePlanLinks(main);
  // add aria-label to links
  a11yLinks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  decorateSiteTheme();
  if (getMetadata('breadcrumbs').toLowerCase() === 'true') {
    doc.body.dataset.breadcrumbs = true;
  }
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  autolinkModals(doc);

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
