import { aemHost, AEM_PUBLISH, persistedQuery } from '../../scripts/aem-config.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/*
 * Event list: each item references an Event content fragment (model "Event": title, startDate,
 * duration, description, registrationUrl, linkText). The fragment is loaded with the persisted
 * query "event-by-path" (see tools/aem-cf/README.md) and rendered as a dated event card.
 * All text comes from the fragment; dates are formatted for the page language.
 */
const QUERY = 'event-by-path';

function fragmentPath(row) {
  const link = row.querySelector('a[href]');
  const raw = link ? new URL(link.href, window.location.href).pathname : row.textContent.trim();
  return decodeURIComponent(raw).replace(/\.html$/, '');
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
      description ? el('p', {}, description) : null,
      item.registrationUrl ? el('p', {}, el('a', { href: item.registrationUrl }, item.linkText || item.registrationUrl)) : null,
    ),
  ].filter(Boolean);
}

export default async function decorate(block) {
  const ul = document.createElement('ul');
  const rows = [...block.children].map((row) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);
    return { li, path: fragmentPath(row) };
  });
  block.textContent = '';
  block.append(ul);

  const results = await Promise.all(rows.map(({ path }) => (path
    ? persistedQuery(QUERY, { path }) : Promise.resolve(null))));

  rows.forEach(({ li, path }, i) => {
    const item = results[i]?.eventByPath?.item;
    if (item) {
      li.append(...eventCard(item));
      ul.append(li);
    } else if (aemHost() !== AEM_PUBLISH) {
      // in Universal Editor, show which fragment could not be loaded so the author can fix it
      li.className = 'event-list-missing';
      li.append(el('p', {}, path || '—'));
      ul.append(li);
    }
  });
}
