/* eslint-disable no-script-url */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_KEYS,
  MAX_RESULTS_SIZE,
  MAX_QUERY_LENGTH,
  parseConfig,
  normalizeQuery,
  mapResultItem,
  excerptFromText,
  createRequestTracker,
} from '../../blocks/search/content-ai.js';

const BASE = 'https://ns.example/api/v1/web/content-ai';

describe('parseConfig', () => {
  it('is disabled with defaults when empty', () => {
    assert.deepEqual(parseConfig({}), {
      enabled: false,
      baseUrl: '',
      contentSource: '',
      contentSourceType: 'ACQUISITION',
      aiMode: true,
      retryVisible: true,
      disclaimer: '',
      resultsSize: 10,
      layout: 'card',
    });
  });

  it('enables with a valid base-url and strips trailing slashes', () => {
    const c = parseConfig({ 'base-url': `${BASE}//`, 'content-source': 'pensionsbc-college' });
    assert.equal(c.enabled, true);
    assert.equal(c.baseUrl, BASE);
    assert.equal(c.contentSource, 'pensionsbc-college');
  });

  it('stays disabled for non-http or unparseable base-url', () => {
    ['javascript:alert(1)', 'not a url'].forEach((v) => {
      const c = parseConfig({ 'base-url': v });
      assert.equal(c.enabled, false);
      assert.equal(c.baseUrl, '');
    });
  });

  it('reads flags, layout and size', () => {
    const c = parseConfig({
      'ai-search-mode-enabled': 'false',
      'gen-search-error-retry-visible': 'false',
      'results-layout': 'list',
      'results-size': '25',
    });
    assert.deepEqual([c.aiMode, c.retryVisible, c.layout, c.resultsSize], [false, false, 'list', 25]);
  });

  it('caps or defaults results-size', () => {
    assert.equal(parseConfig({ 'results-size': '999' }).resultsSize, MAX_RESULTS_SIZE);
    ['abc', '0', '-5'].forEach((v) => assert.equal(parseConfig({ 'results-size': v }).resultsSize, 10));
  });

  it('uses the first value when readBlockConfig returns an array', () => {
    assert.equal(parseConfig({ 'base-url': [BASE, 'https://b.example'] }).baseUrl, BASE);
  });

  it('lists the eight property keys', () => {
    assert.deepEqual(CONFIG_KEYS, [
      'base-url',
      'content-source',
      'content-source-type',
      'ai-search-mode-enabled',
      'gen-search-error-retry-visible',
      'disclaimer-text',
      'results-size',
      'results-layout',
    ]);
  });
});

describe('normalizeQuery', () => {
  it('trims, caps at 500 characters, and rejects non-strings', () => {
    assert.equal(normalizeQuery('  leaving your job  '), 'leaving your job');
    assert.equal(normalizeQuery('a'.repeat(1000)).length, MAX_QUERY_LENGTH);
    assert.equal(normalizeQuery(undefined), '');
  });
});

describe('mapResultItem', () => {
  const SOURCE = 'https://college.pensionsbc.ca/leaving-your-job';

  it('maps a full item', () => {
    assert.deepEqual(mapResultItem({
      id: 'a',
      data: {
        source: SOURCE,
        metadata: { title: 'Leaving your job', description: 'd', image: 'https://college.pensionsbc.ca/i.jpg' },
      },
    }), {
      path: SOURCE,
      title: 'Leaving your job',
      description: 'd',
      image: 'https://college.pensionsbc.ca/i.jpg',
    });
  });

  it('falls back to metadata.url and a URL-derived title', () => {
    const r = mapResultItem({ data: { metadata: { url: SOURCE, title: 42 } } });
    assert.deepEqual([r.path, r.title, r.description, r.image], [SOURCE, 'Leaving Your Job', '', '']);
  });

  it('uses a text excerpt when there is no description', () => {
    const text = '# Nearing retirement - College\n\n# Guide for plan members\n\n'
      + '## College Pension Plan is committed to helping you make the most of your pension.\n\nMore text.';
    const r = mapResultItem({ data: { source: SOURCE, text, metadata: { title: 'Nearing retirement - College' } } });
    assert.equal(r.description, 'College Pension Plan is committed to helping you make the most of your pension.');
  });

  it('keeps the metadata description over the text excerpt', () => {
    const r = mapResultItem({ data: { source: SOURCE, text: 'x'.repeat(100), metadata: { description: ' d ' } } });
    assert.equal(r.description, 'd');
  });

  it('drops unsafe images and returns null for unusable items', () => {
    assert.equal(mapResultItem({ data: { source: SOURCE, metadata: { image: 'javascript:x' } } }).image, '');
    [null, {}, { id: 'x' }, { data: { source: 'javascript:alert(1)' } }]
      .forEach((i) => assert.equal(mapResultItem(i), null));
  });
});

describe('excerptFromText', () => {
  it('skips short headings, the title line and markdown, and cuts at a word', () => {
    const text = '# Title here\n\n![img](https://x/i.jpg)\n\n'
      + '**Learn** about [your pension](https://x/p) options so you can make decisions with confidence and plan ahead for later.';
    const out = excerptFromText(text, 'Title here', 60);
    assert.equal(out, 'Learn about your pension options so you can make decisions…');
    assert.ok(out.length <= 61);
  });

  it('returns an empty string when nothing is usable', () => {
    assert.equal(excerptFromText(undefined), '');
    assert.equal(excerptFromText('# Short\n\nTiny'), '');
  });
});

describe('createRequestTracker', () => {
  it('only the latest request is current', () => {
    const t = createRequestTracker();
    const first = t.next();
    const second = t.next();
    assert.equal(t.isCurrent(first), false);
    assert.equal(t.isCurrent(second), true);
  });
});
