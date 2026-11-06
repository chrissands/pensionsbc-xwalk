/*
 * Author-set styles, applied on every page with no code deployment. Two sources per site:
 * - the theme page (<language root>/theme, a Site theme block, edited in Universal Editor): button
 *   colours, button shape, link colour, accent colour;
 * - the Site styles spreadsheet (<language root>/styles, delivered as styles.json): fonts.
 * The values become CSS custom properties on <body> (and @font-face rules for fonts in AEM Assets);
 * empty or unreadable values keep the site's own styles. Guardrails: only known settings are read,
 * a colour that would make text hard to read (below WCAG AA contrast) is not applied, and a font is
 * either one shipped with the site or a .woff2/.woff file in AEM Assets.
 */
import { toClassName } from './aem.js';
import { aemHost } from './aem-config.js';

// sites with a theme page and a Site styles sheet: the others don't request them (a missing page
// would be a 404 on every visit). Styling a new site is this one-line switch plus its two pages;
// after that every change is an author edit.
export const THEMED_SITES = ['college'];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const WHITE = '#ffffff';
const BLACK = '#000000';
// WCAG 2.1 AA: 4.5:1 for text (buttons, links), 3:1 for large text and graphics (accent)
const AA_TEXT = 4.5;
const AA_LARGE = 3;
const SHAPES = { square: '0', rounded: '8px', pill: '999px' };
// fonts shipped with the site (styles/fonts.css); anything else needs a font file in AEM Assets
const SHIPPED_FONTS = ['Source Sans Pro', 'Roboto', 'Roboto Condensed'];
const FONT_NAME = /^[a-z0-9][a-z0-9 -]{0,39}$/i;
const FONT_FILE = /^\/content\/dam\/[\w\-./ ]+\.(woff2|woff)$/i;
const FONT_STACK = 'source-sans-pro-fallback, helvetica, sans-serif';
const FONT_ROLES = { body: '--body-font-family', heading: '--heading-font-family' };
const CACHE = 'site-styles';

/** #rgb / #rrggbb (with or without #) as #rrggbb, or '' */
function hex(value) {
  const m = (value || '').trim().match(HEX);
  if (!m) return '';
  const digits = m[1].length === 3 ? [...m[1]].map((d) => d + d).join('') : m[1];
  return `#${digits.toLowerCase()}`;
}

function channels(color) {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}

function luminance(color) {
  const [r, g, b] = channels(color).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colours (1 to 21) */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(color, toward, amount) {
  const [a, b] = [channels(color), channels(toward)];
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/** hover: the button colour moved away from its text colour, as far as contrast allows */
function hoverOf(button, text) {
  const toward = luminance(text) > luminance(button) ? BLACK : WHITE;
  return [0.2, 0.15, 0.1].map((a) => mix(button, toward, a))
    .find((c) => contrast(c, text) >= AA_TEXT) || button;
}

/** The theme settings of a Site theme block (key-value rows): { 'button-color': '#513f77', ... } */
export function readTheme(block) {
  const settings = {};
  [...block.children].forEach((row) => {
    const [key, value] = row.children;
    if (key && value) settings[toClassName(key.textContent)] = value.textContent.trim();
  });
  return settings;
}

/**
 * The CSS custom properties for theme settings, and the contrast checks behind them:
 * { vars: { '--button-color': '#513f77', ... }, checks: { button: { ratio, pass }, ... } }.
 * A setting that fails its check is left out of vars, so the site keeps its own style for it.
 */
export function themeVars(settings) {
  const vars = {};
  const checks = {};
  const button = hex(settings['button-color']);
  if (button) {
    // no text colour: white or black, whichever reads better
    const text = hex(settings['button-text-color'])
      || (contrast(button, WHITE) >= contrast(button, BLACK) ? WHITE : BLACK);
    const ratio = contrast(button, text);
    checks.button = { ratio, pass: ratio >= AA_TEXT };
    if (checks.button.pass) {
      vars['--button-color'] = button;
      vars['--button-text-color'] = text;
      vars['--button-hover-color'] = hoverOf(button, text);
      // outline buttons show the colour as text on the page background
      if (contrast(button, WHITE) >= AA_TEXT) vars['--button-outline-color'] = button;
    }
  }
  const shape = SHAPES[toClassName(settings['button-shape'] || '')];
  if (shape) vars['--button-radius'] = shape;
  const link = hex(settings['link-color']);
  if (link) {
    const ratio = contrast(link, WHITE);
    checks.link = { ratio, pass: ratio >= AA_TEXT };
    if (checks.link.pass) vars['--link-color'] = link;
  }
  const accent = hex(settings['accent-color']);
  if (accent) {
    const ratio = contrast(accent, WHITE);
    checks.accent = { ratio, pass: ratio >= AA_LARGE };
    if (checks.accent.pass) vars['--site-accent-color'] = accent;
  }
  return { vars, checks };
}

/** The rows of a Site styles sheet (columns Key and Value) as { 'heading-font': 'Roboto', ... } */
export function readStyles(json) {
  const settings = {};
  (json?.data || []).forEach((row) => {
    const entries = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), `${v}`]));
    const key = entries.key || entries.setting || entries.name;
    if (key) settings[toClassName(key)] = (entries.value ?? entries.text ?? '').trim();
  });
  return settings;
}

/**
 * Fonts from Site styles settings: <role>-font (a font name), and for a font that isn't shipped
 * with the site, <role>-font-file (regular) and <role>-font-file-bold (bold), AEM Assets paths of
 * .woff2/.woff files. Roles: body, heading. { vars, faces: [{ family, url, weight }] }
 */
export function styleVars(settings) {
  const vars = {};
  const faces = [];
  Object.entries(FONT_ROLES).forEach(([role, prop]) => {
    const name = (settings[`${role}-font`] || '').trim().replace(/\s+/g, ' ');
    if (!FONT_NAME.test(name)) return;
    const shipped = SHIPPED_FONTS.find((f) => f.toLowerCase() === name.toLowerCase());
    if (shipped) {
      vars[prop] = `'${shipped}', ${FONT_STACK}`;
      return;
    }
    const files = [['', '400'], ['-bold', '600 700']]
      .map(([suffix, weight]) => ({ path: (settings[`${role}-font-file${suffix}`] || '').trim(), weight }))
      .filter(({ path }) => FONT_FILE.test(path));
    if (!files.length) return;
    const family = `site ${name}`;
    files.forEach(({ path, weight }) => faces.push({ family, url: `${aemHost()}${encodeURI(path)}`, weight }));
    vars[prop] = `'${family}', ${FONT_STACK}`;
  });
  return { vars, faces };
}

// custom properties set by each source, so one source's update doesn't clear the other's
const applied = {};

function applyVars(source, vars) {
  const { style } = document.body;
  (applied[source] || []).forEach((name) => style.removeProperty(name));
  Object.entries(vars).forEach(([name, value]) => style.setProperty(name, value));
  applied[source] = Object.keys(vars);
}

/** Sets the theme's custom properties on <body> (replacing the previous theme's) */
export function applyTheme(vars) {
  applyVars('theme', vars);
  document.body.classList.toggle('theme-buttons', Boolean(vars['--button-color']));
}

/** Sets the Site styles fonts: custom properties, and @font-face rules for fonts in AEM Assets */
export function applyStyles({ vars = {}, faces = [] } = {}) {
  applyVars('styles', vars);
  let sheet = document.getElementById('site-styles-fonts');
  if (!faces.length) {
    sheet?.remove();
    return;
  }
  if (!sheet) {
    sheet = document.createElement('style');
    sheet.id = 'site-styles-fonts';
    document.head.append(sheet);
  }
  // swap: text shows in the site's font until the file has loaded
  sheet.textContent = faces.map(({ family, url, weight }) => `@font-face { font-family: '${family}'; font-weight: ${weight}; font-display: swap; src: url('${url}') format('${url.endsWith('.woff') ? 'woff' : 'woff2'}'); }`).join('\n');
}

async function fetchTheme(root) {
  try {
    const resp = await fetch(`${root}/theme.plain.html`);
    if (!resp.ok) return {};
    const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
    const block = doc.querySelector('.site-theme');
    return block ? themeVars(readTheme(block)).vars : {};
  } catch (e) {
    return {};
  }
}

async function fetchStyles(root) {
  try {
    const resp = await fetch(`${root}/styles.json`);
    if (!resp.ok) return {};
    return styleVars(readStyles(await resp.json()));
  } catch (e) {
    return {};
  }
}

/**
 * Applies the site's theme page and Site styles. The last values seen in this visit apply at once
 * (no flash of the default style) and are refreshed, so a published change shows on the next page
 * load. The first page of a visit waits for them up to `wait` ms.
 * @param {string} site the site (siteOf), only THEMED_SITES have a theme page and Site styles
 * @param {string} root the language root (languageRoot), where both live
 */
export async function loadSiteTheme(site, root, wait = 400) {
  if (!THEMED_SITES.includes(site) || !root) return;
  const key = `${CACHE}:${root}`;
  let cached = null;
  try {
    cached = JSON.parse(sessionStorage.getItem(key));
  } catch (e) {
    // no storage: fetch every time
  }
  if (cached) {
    applyTheme(cached.theme || {});
    applyStyles(cached.styles);
  }
  const fresh = Promise.all([fetchTheme(root), fetchStyles(root)]).then(([theme, styles]) => {
    applyTheme(theme);
    applyStyles(styles);
    try {
      sessionStorage.setItem(key, JSON.stringify({ theme, styles }));
    } catch (e) {
      // no storage
    }
  });
  if (!cached) {
    await Promise.race([fresh, new Promise((resolve) => { setTimeout(resolve, wait); })]);
  }
}
