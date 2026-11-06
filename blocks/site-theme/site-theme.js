import { fetchPlaceholders } from '../../scripts/placeholders.js';
import { languageRoot } from '../../scripts/scripts.js';
import {
  applyTheme, readTheme, themeVars,
} from '../../scripts/site-theme.js';

// the contrast check shown next to each colour setting
const CHECK_OF = {
  'button-color': 'button',
  'button-text-color': 'button',
  'link-color': 'link',
  'accent-color': 'accent',
};
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Site theme: the site's style settings (key-value: button-color, button-text-color, button-shape,
 * link-color, accent-color), read by every page through scripts/site-theme.js. On the theme page
 * itself (and live in Universal Editor) the settings apply at once, and each colour shows a swatch
 * and its contrast ratio, passed or failed (a failed colour isn't used on the site).
 * Optional placeholders: themeContrastPass, themeContrastFail (the badges' accessible names).
 */
export default async function decorate(block) {
  const settings = readTheme(block);
  const { vars, checks } = themeVars(settings);
  applyTheme(vars);

  const labels = await fetchPlaceholders(languageRoot() || 'default');
  [...block.children].forEach((row) => {
    const [key, value] = row.children;
    if (!key || !value) return;
    row.className = 'site-theme-setting';
    key.className = 'site-theme-key';
    value.className = 'site-theme-value';
    const raw = value.textContent.trim();
    const name = key.textContent.trim().toLowerCase();
    if (HEX.test(raw)) {
      const swatch = document.createElement('span');
      swatch.className = 'site-theme-swatch';
      swatch.style.backgroundColor = raw.startsWith('#') ? raw : `#${raw}`;
      value.prepend(swatch);
    }
    const check = checks[CHECK_OF[name]];
    if (check) {
      const badge = document.createElement('span');
      badge.className = `site-theme-check ${check.pass ? 'pass' : 'fail'}`;
      badge.textContent = `${check.pass ? '✓' : '✗'} ${check.ratio.toFixed(1)}:1`;
      const label = check.pass ? labels.themeContrastPass : labels.themeContrastFail;
      if (label) badge.title = label;
      value.append(badge);
    }
  });
}
