/* eslint-disable */
/**
 * Source images that already exist in AEM Assets, keyed by the file name in the source URL
 * (Liferay: /documents/<group>/<folder>/<file name>/<uuid>?t=...). Imported pages reference
 * these DAM paths directly, so a push only links to processed assets and uploads nothing.
 * The corporate assets were installed by the first corporate package (content-package branch);
 * the others are uploaded from tools/aem-assets/<site>-images.zip (see tools/aem-assets/UPLOAD.md).
 * Add a site's images here once they are in AEM Assets.
 * A key is a file name (one path segment of the source URL) or, when it contains / or ?, a part
 * of the source path and query (for names that are not unique, e.g. Liferay's layout_set_logo).
 */
const DAM = '/content/dam/pensionsbc-base';
export const DAM_ASSETS = {
  // corporate
  'banner_image.png': `${DAM}/corporate/banner-image.jpg`,
  'cpp_logo.jpg': `${DAM}/corporate/cpp-logo.jpg`,
  'mpp_logo.jpg': `${DAM}/corporate/mpp-logo.jpg`,
  'pspp_logo.jpg': `${DAM}/corporate/pspp-logo.jpg`,
  'tpp_logo.jpg': `${DAM}/corporate/tpp-logo.jpg`,
  'wsbc_logo.jpg': `${DAM}/corporate/wsbc-logo.jpg`,
  // college
  'layout_set_logo?img_id=23968480': `${DAM}/college/college-pension-plan-logo.png`,
  'college-hero-banner-img-spr-2026.jpg': `${DAM}/college/hero-mountain-meadow.jpg`,
  '1233847/Web-homepage.jpg': `${DAM}/college/annual-report-2025.jpg`,
  'IMG Board message promo April 24, 2025.jpg': `${DAM}/college/board-message-2025.jpg`,
  // shared by several sites
  'logo-pensions-corp250x40.jpg': `${DAM}/shared/bc-pension-corporation-logo.jpg`,
  'IMG - BCI logo.png': `${DAM}/shared/bci-logo.png`,
  'MPP.svg': `${DAM}/shared/mpp-logo.png`,
  'PSPP.svg': `${DAM}/shared/pspp-logo.png`,
  'TPP.svg': `${DAM}/shared/tpp-logo.png`,
  'WSBC.svg': `${DAM}/shared/worksafebc-logo.png`,
  'YouTube - white.png': `${DAM}/shared/youtube-logo.png`,
  'global-summer-2026-banner': `${DAM}/shared/pension-life-summer-2026.jpg`,
  'all-plans-education-promo-light-mist.jpg': `${DAM}/shared/learn-about-my-pension.jpg`,
};

// inline SVG icons in source content (keyed by an element id inside the svg), as DAM PNGs
export const SVG_ICONS = {
  msgctrIcon: `${DAM}/shared/message-centre-icon.png`,
};

/** The DAM path for a source image URL, or the URL unchanged when the image isn't in AEM yet. */
export function damSrc(src, base) {
  let url;
  try {
    url = new URL(src, base);
  } catch (e) {
    return src;
  }
  const decode = (s) => decodeURIComponent(s.replace(/\+/g, ' '));
  const segments = url.pathname.split('/').map(decode);
  const pathAndQuery = decode(`${url.pathname}${url.search}`);
  const key = Object.keys(DAM_ASSETS).find((k) => (/[/?]/.test(k)
    ? pathAndQuery.includes(k)
    : segments.includes(k)));
  return key ? DAM_ASSETS[key] : src;
}

/**
 * Alt text with typographic apostrophes: a straight ' in imageAlt is escaped twice on the way
 * through AEM and renders as "Teacher&#39;s" on Edge Delivery.
 */
export const pushSafeAlt = (alt) => (alt || '').replace(/'/g, '\u2019');

/** Points every <img> in element at its DAM path, with push-safe alt text. */
export function useDamImages(element, base) {
  element.querySelectorAll('img[src]').forEach((img) => {
    img.setAttribute('src', damSrc(img.getAttribute('src'), base));
    if (img.hasAttribute('alt')) img.setAttribute('alt', pushSafeAlt(img.getAttribute('alt')));
  });
}
