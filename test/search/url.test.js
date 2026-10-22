import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl, labelFromUrl } from '../../blocks/search/url.js';

describe('isSafeUrl', () => {
  it('accepts absolute http and https URLs', () => {
    assert.equal(isSafeUrl('https://college.pensionsbc.ca/leaving-your-job'), true);
    assert.equal(isSafeUrl('http://college.pensionsbc.ca/'), true);
  });

  it('rejects other schemes and non-strings', () => {
    // eslint-disable-next-line no-script-url
    ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.example/', '', undefined, null, 42]
      .forEach((bad) => assert.equal(isSafeUrl(bad), false));
  });

  it('resolves relative URLs against a base', () => {
    assert.equal(isSafeUrl('/en/search', 'https://example.org'), true);
  });
});

describe('labelFromUrl', () => {
  it('derives a title from the last path segment', () => {
    assert.equal(labelFromUrl('https://college.pensionsbc.ca/pension-payments-and-dates'), 'Pension Payments And Dates');
    assert.equal(labelFromUrl('https://x.example/a/report_2025.html'), 'Report 2025');
  });

  it('returns the input when there is nothing to derive', () => {
    assert.equal(labelFromUrl('https://college.pensionsbc.ca/'), 'https://college.pensionsbc.ca/');
    assert.equal(labelFromUrl('not a url'), 'not a url');
  });

  it('does not throw on malformed percent-escapes', () => {
    assert.equal(labelFromUrl('https://x.example/bad%E0%A4%A'), 'https://x.example/bad%E0%A4%A');
  });
});
