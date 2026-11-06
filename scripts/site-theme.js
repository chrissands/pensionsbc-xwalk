/*
 * Site theme: button colours, button shape, link colour and accent colour that authors set on the
 * site's theme page (<language root>/theme, a Site theme block), so a style change needs no code
 * deployment. The values become CSS custom properties on <body>; empty or unreadable values keep
 * the site's own styles. Guardrail: a colour that would make text hard to read (below WCAG AA
 * contrast) is not applied.
 */
import { toClassName } from './aem.js';

// sites with a theme page: the others don't request one (a missing page would be a 404 on every
// visit). Theming a new site is this one-line switch; after that every change is an author edit.
export const THEMED_SITES = ['college'];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const WHITE = '#ffffff';
const BLACK = '#000000';
// WCAG 2.1 AA: 4.5:1 for text (buttons, links), 3:1 for large text and graphics (accent)
const AA_TEXT = 4.5;
const AA_LARGE = 3;
const SHAPES = { square: '0', rounded: '8px', pill: '999px' };
const VARS = [
  '--button-color', '--button-text-color', '--button-hover-color', '--button-outline-color',
  '--button-radius', '--link-color', '--site-accent-color',
];
const CACHE = 'site-theme';

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

/** Sets the theme's custom properties on <body> (replacing the previous theme's) */
export function applyTheme(vars) {
  const { style, classList } = document.body;
  VARS.forEach((name) => style.removeProperty(name));
  Object.entries(vars).forEach(([name, value]) => style.setProperty(name, value));
  classList.toggle('theme-buttons', Boolean(vars['--button-color']));
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

/**
 * Applies the site's theme. The last theme seen in this visit is applied at once (no flash of the
 * default colours) and refreshed from the theme page, so a published change shows on the next page
 * load. The first page of a visit waits for the theme page up to `wait` ms.
 * @param {string} site the site (siteOf), only THEMED_SITES have a theme page
 * @param {string} root the language root (languageRoot), where the theme page lives
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
  if (cached) applyTheme(cached);
  const fresh = fetchTheme(root).then((vars) => {
    applyTheme(vars);
    try {
      sessionStorage.setItem(key, JSON.stringify(vars));
    } catch (e) {
      // no storage
    }
  });
  if (!cached) {
    await Promise.race([fresh, new Promise((resolve) => { setTimeout(resolve, wait); })]);
  }
}
