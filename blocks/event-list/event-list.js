import { aemHost, AEM_PUBLISH, persistedQuery } from '../../scripts/aem-config.js';
import getAudience from '../../scripts/audience.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Event list: each item references an Event content fragment (model "Event": title, startDate,
 * duration, location, description, registrationUrl, linkText). An item can also name an audience
 * and a second fragment that visitors in that audience see instead (scripts/audience.js), e.g. the
 * in-person session for local visitors. Fragments are loaded with the persisted query
 * "event-by-path" (see tools/aem-cf/README.md) and rendered as dated event cards.
 * All text comes from the fragment; dates are formatted for the page language.
 */
const QUERY = 'event-by-path';

/** A fragment reference cell: its link's path, or its text. */
function cellPath(cell) {
  if (!cell) return '';
  const link = cell.querySelector('a[href]');
  const raw = link ? new URL(link.href, window.location.href).pathname : cell.textContent.trim();
  return decodeURIComponent(raw).replace(/\.html$/, '');
}

/** Item fields, in model order: fragment | audience | audienceFragment. */
function readItem(row) {
  const [fragment, audience, alternative] = [...row.children];
  return {
    fragment: cellPath(fragment),
    audience: (audience?.textContent || '').trim().toLowerCase(),
    alternative: cellPath(alternative),
  };
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children.filter((c) => c !== null && c !== undefined && c !== ''));
  return e;
}

/** The date badge: weekday over month and day (a date-only value, so read as UTC). */
function dateBadge(iso) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const lang = document.documentElement.lang || 'en';
  const fmt = (opts) => new Intl.DateTimeFormat(lang, { timeZone: 'UTC', ...opts }).format(date);
  return el(
    'p',
    { className: 'event-list-date' },
    el('time', { dateTime: iso.slice(0, 10) }, el('span', {}, fmt({ weekday: 'short' })), el('strong', {}, fmt({ month: 'short', day: 'numeric' }))),
  );
}

function eventCard(item) {
  const description = item.description?.plaintext || item.description || '';
  return [
    item.startDate ? dateBadge(item.startDate) : null,
    el(
      'div',
      { className: 'event-list-body' },
      el('h3', {}, item.title || ''),
      item.duration ? el('p', {}, el('em', {}, item.duration)) : null,
      item.location ? el('p', { className: 'event-list-location' }, item.location) : null,
      description ? el('p', {}, description) : null,
      item.registrationUrl ? el('p', {}, el('a', { href: item.registrationUrl }, item.linkText || item.registrationUrl)) : null,
    ),
  ].filter(Boolean);
}

export default async function decorate(block) {
  const authoring = aemHost() !== AEM_PUBLISH;
  const visitor = getAudience();
  const ul = document.createElement('ul');
  const rows = [...block.children].map((row) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);
    const item = readItem(row);
    if (!item.audience) item.alternative = '';
    return { li, item };
  });
  block.textContent = '';
  block.append(ul);

  const paths = [...new Set(rows.flatMap(({ item }) => [item.fragment, item.alternative]))]
    .filter(Boolean);
  const results = await Promise.all(paths.map((path) => persistedQuery(QUERY, { path })));
  const loaded = Object.fromEntries(paths.map((path, i) => [path, results[i]?.eventByPath?.item]));

  rows.forEach(({ li, item }) => {
    // the audience's fragment replaces the default one; the default stays if it can't be loaded
    const swap = item.alternative && item.audience === visitor && loaded[item.alternative];
    const path = swap ? item.alternative : item.fragment;
    if (loaded[path]) {
      li.append(...eventCard(loaded[path]));
      ul.append(li);
    } else if (authoring) {
      // show which fragment could not be loaded so the author can fix it
      li.className = 'event-list-missing';
      li.append(el('p', {}, path || '—'));
      ul.append(li);
    }
    // in Universal Editor the audience's fragment is shown too, after the one it replaces
    if (authoring && item.alternative && item.alternative !== path) {
      const alt = el('li', { className: 'event-list-alternative' });
      alt.dataset.audience = item.audience;
      alt.append(...(loaded[item.alternative] ? eventCard(loaded[item.alternative])
        : [el('p', {}, item.alternative)]));
      ul.append(alt);
    }
  });
}
