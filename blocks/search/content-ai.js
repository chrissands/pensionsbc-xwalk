import { isSafeUrl, labelFromUrl } from './url.js';

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

export function mapResultItem(item, base) {
  const data = item?.data;
  if (!data || typeof data !== 'object') return null;
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const path = [data.source, meta.url].find((candidate) => isSafeUrl(candidate, base));
  if (!path) return null;
  const title = typeof meta.title === 'string' && meta.title.trim()
    ? meta.title
    : labelFromUrl(path, base);
  return {
    path,
    title,
    description: typeof meta.description === 'string' ? meta.description : '',
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
