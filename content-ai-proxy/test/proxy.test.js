jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');
const { createProxy } = require('../actions/lib/proxy');
const { isRateLimited, buckets } = require('../actions/lib/rate-limit');

const base = {
  apiKey: 'k',
  baseUrl: 'https://up/adobe/contentAI',
  defaultContentSource: 'pensionsbc-college',
  allowedContentSources: 'pensionsbc-college',
  contentSourceType: 'ACQUISITION',
  allowedOrigin: 'https://ok.example',
  __ow_headers: { origin: 'https://ok.example', 'x-forwarded-for': '1.1.1.1' },
};

beforeEach(() => { fetch.mockReset(); buckets.clear(); });

test('pins the source and injects the key', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ results: [] }) });
  const main = createProxy('search', { passQueryOptions: true });
  const res = await main({ ...base, contentSource: { name: 'other' }, query: { text: 'x' }, queryOptions: { a: 1 } });
  const [url, opts] = fetch.mock.calls[0];
  expect(url).toBe('https://up/adobe/contentAI/content-sources/search');
  expect(opts.headers['x-api-key']).toBe('k');
  expect(JSON.parse(opts.body)).toEqual({ contentSource: { name: 'pensionsbc-college', type: 'ACQUISITION' }, query: { text: 'x' }, queryOptions: { a: 1 } });
  expect(res.headers['Access-Control-Allow-Origin']).toBe('https://ok.example');
});

test('gensearch drops queryOptions; missing query is 400', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  const main = createProxy('gensearch', { passQueryOptions: false });
  await main({ ...base, query: 'q', queryOptions: { a: 1 } });
  expect(JSON.parse(fetch.mock.calls[0][1].body).queryOptions).toBeUndefined();
  expect((await main({ ...base })).statusCode).toBe(400);
});

test('upstream failure is 502 and rate limit is 429', async () => {
  fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
  const main = createProxy('search', { passQueryOptions: true });
  expect((await main({ ...base, query: {} , rateLimitPerMinute: '1' })).statusCode).toBe(502);
  expect((await main({ ...base, query: {}, rateLimitPerMinute: '1' })).statusCode).toBe(429);
});

test('limiter resets after the window', () => {
  expect(isRateLimited('a', 1, 1000, 0)).toBe(false);
  expect(isRateLimited('a', 1, 1000, 10)).toBe(true);
  expect(isRateLimited('a', 1, 1000, 2000)).toBe(false);
});
