/* eslint-disable no-script-url */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, fetchResults, fetchAnswer } from '../../blocks/search/content-ai.js';

const BASE = 'https://ns.example/api/v1/web/content-ai';
const config = parseConfig({
  'base-url': `${BASE}/`,
  'content-source': 'pensionsbc-college',
  'results-size': '5',
});

const stub = (body, { ok = true, status = 200 } = {}) => {
  const calls = [];
  return {
    calls,
    impl: async (url, init) => {
      calls.push({ url, init });
      return { ok, status, json: async () => body };
    },
  };
};

describe('fetchResults', () => {
  it('POSTs the search body to {base}/search with only a Content-Type header', async () => {
    const { impl, calls } = stub({ results: [] });
    await fetchResults(config, 'leaving your job', impl);
    assert.equal(calls[0].url, `${BASE}/search`);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      contentSource: { name: 'pensionsbc-college', type: 'ACQUISITION' },
      query: { type: 'vector', text: 'leaving your job', options: {} },
      queryOptions: { pagination: { limit: 5 } },
    });
  });

  it('maps results, drops unusable items, and tolerates a missing results key', async () => {
    const ok = 'https://college.pensionsbc.ca/leaving-your-job';
    const { impl } = stub({
      results: [
        { data: { source: ok, metadata: { title: 'Leaving your job' } } },
        { data: { source: 'javascript:x' } },
      ],
    });
    assert.deepEqual((await fetchResults(config, 'q', impl)).map((r) => r.path), [ok]);
    assert.deepEqual(await fetchResults(config, 'q', stub({}).impl), []);
  });

  it('rejects on HTTP errors, thrown fetches, and invalid JSON', async () => {
    await assert.rejects(fetchResults(config, 'q', stub({}, { ok: false, status: 500 }).impl), /Content AI search failed: 500/);
    await assert.rejects(fetchResults(config, 'q', async () => { throw new TypeError('Failed to fetch'); }), TypeError);
    await assert.rejects(
      fetchResults(config, 'q', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })),
      SyntaxError,
    );
  });
});

describe('fetchAnswer', () => {
  it('POSTs {contentSource, query} to {base}/gensearch', async () => {
    const { impl, calls } = stub({ result: 'Hi', hits: [] });
    await fetchAnswer(config, 'leaving your job', impl);
    assert.equal(calls[0].url, `${BASE}/gensearch`);
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      contentSource: { name: 'pensionsbc-college', type: 'ACQUISITION' },
      query: 'leaving your job',
    });
  });

  it('renders the answer and maps sources', async () => {
    const url = 'https://college.pensionsbc.ca/leaving-your-job';
    const { impl } = stub({
      result: 'Hello **world**',
      hits: [
        { id: '1', metadata: { title: 'Leaving your job', url } },
        { id: '2', metadata: { url: 'javascript:alert(1)' } },
      ],
    });
    const a = await fetchAnswer(config, 'q', impl);
    assert.ok(a.html.includes('<strong>world</strong>'));
    assert.deepEqual(a.sources, [{ label: 'Leaving your job', url }, { label: '2', url: '' }]);
  });

  it('rejects on HTTP errors and invalid JSON', async () => {
    await assert.rejects(fetchAnswer(config, 'q', stub({}, { ok: false, status: 502 }).impl), /Content AI request failed: 502/);
    await assert.rejects(
      fetchAnswer(config, 'q', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })),
      SyntaxError,
    );
  });
});
