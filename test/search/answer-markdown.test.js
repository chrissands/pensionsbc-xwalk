/* eslint-disable no-script-url */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../blocks/search/answer-markdown.js';

describe('renderMarkdown', () => {
  it('renders bold, lists, and paragraphs', () => {
    assert.equal(renderMarkdown('**bold**'), '<p><strong>bold</strong></p>');
    assert.equal(renderMarkdown('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  });

  it('escapes HTML and ampersands', () => {
    const html = renderMarkdown('<script>alert(1)</script> & more');
    assert.ok(html.includes('&lt;script&gt;') && html.includes('&amp; more'));
    assert.ok(!html.includes('<script'));
  });

  it('links http(s) markdown links with safe attributes', () => {
    assert.equal(
      renderMarkdown('[College](https://college.pensionsbc.ca/x)'),
      '<p><a href="https://college.pensionsbc.ca/x" target="_blank" rel="noopener">College</a></p>',
    );
  });

  it('does not link unsafe schemes', () => {
    assert.ok(!renderMarkdown('[x](javascript:alert(1))').includes('<a'));
  });

  it('keeps quote-injection inside the escaped URL', () => {
    const html = renderMarkdown('[x](https://a.example/"onmouseover="alert(1))');
    assert.ok(!/<a[^>]*\sonmouseover/i.test(html));
  });

  it('linkifies bare URLs without the trailing punctuation', () => {
    assert.ok(renderMarkdown('See https://college.pensionsbc.ca/a.').includes('rel="noopener">https://college.pensionsbc.ca/a</a>.'));
  });

  it('returns an empty string for empty or non-string input', () => {
    assert.equal(renderMarkdown(''), '');
    assert.equal(renderMarkdown(undefined), '');
  });
});
