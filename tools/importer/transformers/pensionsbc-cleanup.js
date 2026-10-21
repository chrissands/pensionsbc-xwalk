/* eslint-disable */
/* global WebImporter */

/**
 * PensionsBC (Liferay) cleanup transformer.
 * Removes non-authorable site chrome, global footer portlets, Liferay
 * portlet chrome, and tracking pixels. Hero and plans rows are preserved.
 */
const PORTLET_ITEM = '[class*="lfr-layout-structure-item-com-liferay-journal-content"]';
const LAYOUT_ROW = '[class*="lfr-layout-structure-item-row"]';
const MEDIA = 'img, picture, video, iframe, svg, object, embed';

/** True when an element carries no visible text and no media (ignores <style>/<script>). */
function isEmptyNode(el) {
  if (el.querySelector(MEDIA)) return false;
  const clone = el.cloneNode(true);
  clone.querySelectorAll('style, script, noscript, link').forEach((n) => n.remove());
  return clone.textContent.replace(/ /g, ' ').trim() === '';
}

/**
 * Plan homepages (college, mpp, pspp, tpp, worksafe) share the Liferay
 * .homepageWrapper layout. Runs in beforeTransform so parsers see clean rows.
 */
function cleanupPlanHome(root, removeAll) {
  const wrapper = root.querySelector('.homepageWrapper');
  if (!wrapper) return;

  // Site chrome: header/nav, breadcrumbs, footer (incl. plan cross-links strip)
  removeAll([
    '#banner',
    'header#banner',
    'div.main-navigation',
    '.breadcrumb-navigation',
    '#breadcrumbs',
    '#footer',
    'footer',
    '#tooltipContainer',
    '#content > h1.hide-accessible',
  ]);

  // Images outside the page content (e.g. the hidden SVG icon sprite after the footer,
  // captured as an embedded image)
  const main = root.querySelector('#main-content') || wrapper;
  root.querySelectorAll('img').forEach((img) => {
    if (!main.contains(img)) img.remove();
  });

  // Inline <style> elements inside content portlets (.indent, .aspect-ratio iframe, ...)
  wrapper.querySelectorAll('style').forEach((s) => s.remove());

  // Horizontal-rule-only portlet before the "In case you missed it..." heading
  wrapper.querySelectorAll('hr').forEach((hr) => {
    if (hr.closest('.hero')) return;
    const portlet = hr.closest(PORTLET_ITEM);
    if (!portlet || !wrapper.contains(portlet)) return;
    const clone = portlet.cloneNode(true);
    clone.querySelectorAll('hr').forEach((h) => h.remove());
    if (isEmptyNode(clone)) portlet.remove();
  });

  // Empty spacer portlets
  wrapper.querySelectorAll(PORTLET_ITEM).forEach((portlet) => {
    if (!portlet.isConnected || portlet.closest('.hero') || portlet.querySelector('.hero, hr')) return;
    if (isEmptyNode(portlet)) portlet.remove();
  });

  // Empty layout rows left behind (never the hero or content rows)
  wrapper.querySelectorAll(LAYOUT_ROW).forEach((row) => {
    if (!row.isConnected || row.querySelector('.hero, hr')) return;
    if (isEmptyNode(row)) row.remove();
  });
}

export default function transform(hookName, element, payload) {
  const root = element;

  const removeAll = (selectors) => {
    selectors.forEach((sel) => {
      root.querySelectorAll(sel).forEach((el) => el.remove());
    });
  };

  if (hookName === 'beforeTransform') {
    // Plan homepages only (no-op on corporate home, which has no .homepageWrapper)
    cleanupPlanHome(root, removeAll);

    // Chrome that could interfere with block matching
    removeAll([
      '#ptuj_quickAccessNav',
      '[id$="_quickAccessNav"]',
      'nav.quick-access-nav',
      'header#banner',
      '#wrapper > div.main-navigation',
      'div.main-navigation',
      // Liferay portlet chrome (empty edit/config controls)
      '.portlet-header',
      '.visible-interaction',
      // Screen-reader page title
      '#content > h1.hide-accessible',
      // Empty spacer row
      '.lfr-layout-structure-item-b7364b2f-334b-710c-f138-474365108938',
      '#tooltipContainer',
      'form#hrefFm',
    ]);
  }

  if (hookName === 'afterTransform') {
    // Global footer portlets and site footer
    removeAll([
      '#portlet_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_7rkPUB5POX54',
      '#portlet_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_Y6gOozY3Kc3j',
      'footer.footer_links',
      '#wrapper > footer',
      'footer',
      'header',
      'nav',
      '#tooltipContainer',
      'script',
      'style',
      'noscript',
      'link',
      'iframe',
    ]);

    // Tracking pixels and stray theme icons
    root.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (/siteimproveanalytics/i.test(src)) {
        img.remove();
        return;
      }
      if (/loading\.gif|information\.svg/i.test(src)) {
        const inContent = img.closest(
          '.lfr-layout-structure-item-60ee7d92-a4b1-4dec-6ffa-9af99f64b9ba, '
          + '.lfr-layout-structure-item-bf63d179-50ac-3208-da66-41d6860cec3d, table',
        );
        if (!inContent) img.remove();
      }
    });

    // Strip tracking / Liferay data attributes
    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (/^(data-analytics|data-track|data-senna|data-qa-id|onclick)/i.test(attr.name)) {
          el.removeAttribute(attr.name);
        }
      });
    });

    // Embedded data: images (e.g. the self-service icon) arrive as blob: URLs (the importer
    // converts data: images before transform). Point them at a stable asset path
    // /media-da/inline-<djb2 of bytes>.<ext>; the file is extracted from the snapshot
    // into content/media-da with the same hash.
    root.querySelectorAll('img[src^="blob:"]').forEach((img) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', img.getAttribute('src'), false);
        xhr.overrideMimeType('text/plain; charset=x-user-defined');
        xhr.send();
        const bytes = xhr.responseText;
        let hash = 5381;
        for (let i = 0; i < bytes.length; i += 1) {
          // eslint-disable-next-line no-bitwise
          hash = ((hash << 5) + hash + (bytes.charCodeAt(i) & 0xff)) >>> 0;
        }
        const type = (xhr.getResponseHeader('Content-Type') || '').split(';')[0];
        const ext = { 'image/svg+xml': 'svg', 'image/jpeg': 'jpg' }[type] || type.split('/')[1] || 'png';
        img.setAttribute('src', `/media-da/inline-${hash.toString(16)}.${ext}`);
      } catch (e) {
        img.remove();
      }
    });
  }
}
