import { isSafeUrl } from './url.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function anchor(url, label) {
  return `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
}

function linkifyBareUrls(html) {
  return html.split(/(<a\b[^>]*>.*?<\/a>)/g).map((part) => {
    if (/^<a\b/.test(part)) return part;
    return part.replace(/https?:\/\/[^\s<]+/g, (url) => {
      const trailing = url.match(/[).,;:!?]+$/)?.[0] ?? '';
      const clean = trailing ? url.slice(0, -trailing.length) : url;
      return isSafeUrl(clean) ? `${anchor(clean, clean)}${trailing}` : url;
    });
  }).join('');
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => (
    isSafeUrl(url) ? anchor(url, label) : label
  ));
  return linkifyBareUrls(html);
}

// eslint-disable-next-line import/prefer-default-export
export function renderMarkdown(text) {
  if (typeof text !== 'string') return '';
  let html = '';
  let listOpen = false;
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const item = trimmed.match(/^[-*]\s+(.*)$/);
    if (item) {
      if (!listOpen) {
        html += '<ul>';
        listOpen = true;
      }
      html += `<li>${renderInline(item[1])}</li>`;
      return;
    }
    if (listOpen) {
      html += '</ul>';
      listOpen = false;
    }
    if (trimmed) html += `<p>${renderInline(trimmed)}</p>`;
  });
  if (listOpen) html += '</ul>';
  return html;
}
