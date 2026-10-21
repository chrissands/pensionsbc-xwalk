/* eslint-disable */
/**
 * Source images that already exist in AEM Assets, keyed by the file name in the source URL
 * (Liferay: /documents/<group>/<folder>/<file name>/<uuid>?t=...). Imported pages reference
 * these DAM paths directly, so a push only links to processed assets and uploads nothing.
 * The corporate assets were installed by the first corporate package (content-package branch).
 * Add a site's images here once they are in AEM Assets.
 */
export const DAM_ASSETS = {
  'banner_image.png': '/content/dam/pensionsbc-base/corporate/banner-image.jpg',
  'cpp_logo.jpg': '/content/dam/pensionsbc-base/corporate/cpp-logo.jpg',
  'mpp_logo.jpg': '/content/dam/pensionsbc-base/corporate/mpp-logo.jpg',
  'pspp_logo.jpg': '/content/dam/pensionsbc-base/corporate/pspp-logo.jpg',
  'tpp_logo.jpg': '/content/dam/pensionsbc-base/corporate/tpp-logo.jpg',
  'wsbc_logo.jpg': '/content/dam/pensionsbc-base/corporate/wsbc-logo.jpg',
  'logo-pensions-corp250x40.jpg': '/content/dam/pensionsbc-base/shared/bc-pension-corporation-logo.jpg',
  'IMG - BCI logo.png': '/content/dam/pensionsbc-base/shared/bci-logo.png',
};

/** The DAM path for a source image URL, or the URL unchanged when the image isn't in AEM yet. */
export function damSrc(src, base) {
  let url;
  try {
    url = new URL(src, base);
  } catch (e) {
    return src;
  }
  const segments = url.pathname.split('/').map((s) => decodeURIComponent(s.replace(/\+/g, ' ')));
  const name = segments.find((s) => DAM_ASSETS[s]);
  return name ? DAM_ASSETS[name] : src;
}

/** Points every <img> in element at its DAM path. */
export function useDamImages(element, base) {
  element.querySelectorAll('img[src]').forEach((img) => {
    img.setAttribute('src', damSrc(img.getAttribute('src'), base));
  });
}
