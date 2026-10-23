import { isSafeUrl, labelFromUrl } from './url.js';
import { renderMarkdown } from './answer-markdown.js';

export const CONFIG_KEYS = [
  'base-url',
  'content-source',
  'content-source-type',
  'ai-search-mode-enabled',
  'gen-search-error-retry-visible',
  'disclaimer-text',
  'results-size',
  'results-layout',
];

export const MAX_RESULTS_SIZE = 50;
export const MAX_QUERY_LENGTH = 500;
const DEFAULT_RESULTS_SIZE = 10;
const DEFAULT_SOURCE_TYPE = 'ACQUISITION';

function text(value) {
  const first = Array.isArray(value) ? value[0] : value;
  return String(first ?? '').trim();
}

export function parseConfig(raw = {}) {
  const rawBase = text(raw['base-url']);
  const enabled = /^https?:\/\//i.test(rawBase) && isSafeUrl(rawBase);
  const size = parseInt(text(raw['results-size']), 10);
  return {
    enabled,
    baseUrl: enabled ? rawBase.replace(/\/+$/, '') : '',
    contentSource: text(raw['content-source']),
    contentSourceType: text(raw['content-source-type']) || DEFAULT_SOURCE_TYPE,
    aiMode: text(raw['ai-search-mode-enabled']) !== 'false',
    retryVisible: text(raw['gen-search-error-retry-visible']) !== 'false',
    disclaimer: text(raw['disclaimer-text']),
    resultsSize: size > 0 ? Math.min(size, MAX_RESULTS_SIZE) : DEFAULT_RESULTS_SIZE,
    layout: text(raw['results-layout']) === 'list' ? 'list' : 'card',
  };
}

export function normalizeQuery(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, MAX_QUERY_LENGTH);
}

export const EXCERPT_LENGTH = 160;
const MIN_EXCERPT_LINE = 40;

function stripMarkdown(line) {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[\s>#*\-+\d.)]+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerptFromText(value, title = '', length = EXCERPT_LENGTH) {
  if (typeof value !== 'string') return '';
  const heading = title.trim().toLowerCase();
  const line = value.split('\n')
    .map(stripMarkdown)
    .find((l) => l.length >= MIN_EXCERPT_LINE && l.toLowerCase() !== heading);
  if (!line) return '';
  if (line.length <= length) return line;
  const cut = line.slice(0, length);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,;:.-]+$/, '')}…`;
}

export function mapResultItem(item, base) {
  const data = item?.data;
  if (!data || typeof data !== 'object') return null;
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const path = [data.source, meta.url].find((candidate) => isSafeUrl(candidate, base));
  if (!path) return null;
  const title = typeof meta.title === 'string' && meta.title.trim()
    ? meta.title
    : labelFromUrl(path, base);
  const metaDescription = typeof meta.description === 'string' ? meta.description.trim() : '';
  return {
    path,
    title,
    description: metaDescription || excerptFromText(data.text, title),
    image: isSafeUrl(meta.image, base) ? meta.image : '',
  };
}

export function createRequestTracker() {
  let latest = 0;
  return {
    next() {
      latest += 1;
      return latest;
    },
    isCurrent(id) {
      return id === latest;
    },
  };
}

async function post(url, body, errorLabel, fetchImpl) {
  const resp = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`${errorLabel}: ${resp.status}`);
  return resp.json();
}

function contentSource(config) {
  return { name: config.contentSource, type: config.contentSourceType };
}

export async function fetchResults(config, query, fetchImpl = fetch) {
  const data = await post(`${config.baseUrl}/search`, {
    contentSource: contentSource(config),
    query: { type: 'vector', text: query, options: {} },
    queryOptions: { pagination: { limit: config.resultsSize } },
  }, 'Content AI search failed', fetchImpl);
  return (Array.isArray(data?.results) ? data.results : [])
    .map((item) => mapResultItem(item))
    .filter(Boolean);
}

function mapSource(hit) {
  const meta = hit?.metadata && typeof hit.metadata === 'object' ? hit.metadata : {};
  const url = [meta.url, meta.source].find((candidate) => isSafeUrl(candidate)) || '';
  const title = typeof meta.title === 'string' ? meta.title.trim() : '';
  return { label: title || (url ? labelFromUrl(url) : '') || hit?.id || 'Source', url };
}

export async function fetchAnswer(config, query, fetchImpl = fetch) {
  const data = await post(`${config.baseUrl}/gensearch`, {
    contentSource: contentSource(config),
    query,
  }, 'Content AI request failed', fetchImpl);
  return {
    html: renderMarkdown(data?.result),
    sources: (Array.isArray(data?.hits) ? data.hits : []).map(mapSource),
  };
}
