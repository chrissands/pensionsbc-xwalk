/* eslint-disable */
/**
 * Production hostnames of the six PensionsBC sites. Cross-site links in content always use
 * these (Edge Delivery turns aem.page / aem.live links in content into relative paths);
 * scripts/scripts.js points them at the matching Edge Delivery site on aem.page / aem.live.
 * Same-site links stay relative (/en/...).
 */
export const PLAN_HOSTS = {
  corporate: 'www.pensionsbc.ca',
  college: 'college.pensionsbc.ca',
  mpp: 'mpp.pensionsbc.ca',
  pspp: 'pspp.pensionsbc.ca',
  tpp: 'tpp.pensionsbc.ca',
  worksafe: 'worksafe.pensionsbc.ca',
};

// Source hosts that are aliases of a plan host (maintenance hosts, legacy /web/<plan> paths)
const SOURCE_ALIASES = {
  'mppmaint1.pensionsbc.ca': 'mpp',
  'worksafemaint1.pensionsbc.ca': 'worksafe',
  'www.pensionsbc.ca/web/college': 'college',
  'www.pensionsbc.ca/web/public-service': 'pspp',
  'www.pensionsbc.ca/web/teachers': 'tpp',
};

// The member portal is a real external link; the maintenance host is replaced by production
const MY_ACCOUNT_HOSTS = ['myaccount.pensionsbc.ca', 'myaccountmaint1.pensionsbc.ca'];
export const MY_ACCOUNT_URL = 'https://myaccount.pensionsbc.ca/';

export const planHomeUrl = (site) => `https://${PLAN_HOSTS[site]}/en/`;

/**
 * The plan site whose home page a source link points at, or null. Deep links into another
 * plan site are not matched: their source paths do not exist on the migrated sites.
 */
export function planSiteOf(href, base = 'https://www.pensionsbc.ca/') {
  let url;
  try {
    url = new URL(href, base);
  } catch (e) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/$/, '');
  const alias = SOURCE_ALIASES[`${host}${path}`] || (path === '' && SOURCE_ALIASES[host]);
  if (alias) return alias;
  if (path !== '') return null;
  return Object.keys(PLAN_HOSTS).find((site) => PLAN_HOSTS[site] === host && site !== 'corporate') || null;
}

// Liferay pages on a plan host that are part of My Account, not of the plan site
const MY_ACCOUNT_PATHS = ['/web/my-account/registration'];

/**
 * A link as it should appear on the migrated site. Links to the page's own site become
 * relative /en/<path> (the root becomes /en/); everything else goes through productionHref.
 */
export function siteHref(href, base) {
  let url;
  try {
    url = new URL(href, base);
  } catch (e) {
    return href;
  }
  const path = url.pathname.replace(/\/$/, '');
  if (MY_ACCOUNT_PATHS.includes(path)) return MY_ACCOUNT_URL;
  if (url.hostname !== new URL(base).hostname) return productionHref(url.href, base);
  // Liferay duplicate friendly URLs of the same page (welcome-to-the-plan1, f-taking-time-off-...)
  const page = path.replace(/\/f-([a-z])/g, '/$1').replace(/([a-z])1$/, '$1');
  return `/en${page || '/'}${url.hash}`;
}

/** Rewrites a source link to its production target: plan home, My Account, or unchanged. */
export function productionHref(href, base) {
  const site = planSiteOf(href, base);
  if (site) return planHomeUrl(site);
  try {
    if (MY_ACCOUNT_HOSTS.includes(new URL(href, base).hostname.toLowerCase())) return MY_ACCOUNT_URL;
  } catch (e) {
    // relative or malformed: keep as-is
  }
  return href;
}
