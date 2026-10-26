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
import { aemHost, AEM_PUBLISH } from './aem-config.js';
import getAudience from './audience.js';
import {
  isExperimentationEnabled, runExperimentation, runExperimentationLazy,
} from './experiment-loader.js';

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

/**
 * The current page's language root, where its nav, footer and placeholders live: the path up to
 * and including the language segment. /en on the sites, /content/pensionsbc-base/<site>/en in
 * Universal Editor and AEM author, /content/<site>/en in the local preview; '' if there is none.
 */
export function languageRoot(pathname = window.location.pathname) {
  const segments = pathname.split('/');
  const lang = segments.findIndex((s, i) => i > 0 && /^[a-z]{2}(-[a-z]{2})?$/.test(s.replace(/\.html$/, '')));
  return lang > 0 ? segments.slice(0, lang + 1).join('/').replace(/\.html$/, '') : '';
}

/** A site's demo host (main--pensionsbc-<site>--chrissands.aem.page): the sites never go live. */
function demoHost(site) {
  const eds = Object.keys(SITES).find((key) => SITES[key] === site);
  return eds ? `main--${eds}--chrissands.aem.page` : '';
}

/*
 * Experimentation (plugins/experimentation; loaded only on pages with an experiment).
 * prodHost is the site's aem.page demo host, where the demo's visits (and so the experiment's
 * results) are. The engine still treats *.page as preview, so its simulation tools load there; in
 * Universal Editor the panel is the A/B extension.
 */
const experimentationConfig = {
  prodHost: window.location.hostname.match(EDS_HOST)
    ? window.location.hostname.replace(/\.aem\.live$/, '.aem.page')
    : demoHost(siteOf(window.location)),
  simulationUI: aemHost() !== AEM_PUBLISH ? 'universal-editor' : 'auto',
  storage: window.sessionStorage,
};

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
 * Sections with a "Show to" audience (section metadata "show-to") are shown only to visitors in
 * that audience (scripts/audience.js); the others are removed. In Universal Editor all are shown,
 * outlined and labelled with their audience.
 * @param {Element} main The main element
 */
function decorateAudienceSections(main) {
  // sections saved before the setting was renamed from "audience" (a name the experimentation
  // engine reserves): AEM delivers it as data-audience
  main.querySelectorAll(':scope > .section[data-audience]:not([data-show-to])').forEach((section) => {
    section.dataset.showTo = section.dataset.audience;
  });
  const sections = [...main.querySelectorAll(':scope > .section[data-show-to]')]
    .filter((section) => section.dataset.showTo.trim());
  if (!sections.length) return;
  if (aemHost() !== AEM_PUBLISH) {
    sections.forEach((section) => section.classList.add('audience-preview'));
    return;
  }
  sections.forEach((section) => section.classList.add('audience-pending'));
  getAudience().then((audience) => sections.forEach((section) => {
    if (section.dataset.showTo.trim().toLowerCase() === audience) section.classList.remove('audience-pending');
    else section.remove();
  }));
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
  decorateAudienceSections(main);
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
  // swaps in the visitor's variant (replaces main) before the page is decorated
  await runExperimentation(doc, experimentationConfig);
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

  // the demo runs on *.page, which the engine treats as preview: load its preview tools only on
  // pages with an experiment (the eager step already answers the editor panel on other pages)
  if (isExperimentationEnabled()) await runExperimentationLazy(doc, experimentationConfig);
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
