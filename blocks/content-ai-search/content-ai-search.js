import { readBlockConfig } from '../../scripts/aem.js';

const LOADING_DISPLAY_DELAY = 300;
const TAB_RESULTS = 'search-results';
const TAB_AI = 'ai-mode';
const MAX_RESULTS_SIZE = 50;
const MAX_TOP_UP_REQUESTS = 3;
// Candidate pool of the vector query. Also caps how many results can be paged through
// for queries the full-text query does not match, so keep it well above the page size.
const VECTOR_NUM_CANDIDATES = 50;
// Only the result fields the block reads (paths are relative to each result's "data").
const RESULT_FIELDS = [
  'text',
  'source',
  'title',
  'name',
  'metadata.url',
  'metadata.source',
  'metadata.title',
  'metadata.description',
  'metadata.image',
  'metadata.meta.image',
];
// Pages without a meta description fall back to the start of their text.
const EXCERPT_LENGTH = 160;
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

function excerptFromText(value, title = '', length = EXCERPT_LENGTH) {
  if (typeof value !== 'string') return '';
  const heading = String(title).trim().toLowerCase();
  const line = value.split('\n')
    .map(stripMarkdown)
    .find((l) => l.length >= MIN_EXCERPT_LINE && l.toLowerCase() !== heading);
  if (!line) return '';
  if (line.length <= length) return line;
  const cut = line.slice(0, length);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,;:.-]+$/, '')}…`;
}

async function fetchMockAnswer() {
  const url = `${window.hlx.codeBasePath}/blocks/content-ai-search/mock-answer.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load mock answer: ${resp.status}`);
  return resp.json();
}

async function fetchMockResults() {
  const url = `${window.hlx.codeBasePath}/blocks/content-ai-search/mock-results.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load mock results: ${resp.status}`);
  return resp.json();
}

async function fetchSearchAnswer(baseUrl, contentSource, contentSourceType, query) {
  const url = `${baseUrl}/gensearch`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentSource: { name: contentSource, type: contentSourceType },
      query,
    }),
  });
  if (!resp.ok) throw new Error(`Content AI request failed: ${resp.status}`);
  return resp.json();
}

// Longer, natural-language queries are better served by the semantic vector match than by
// literal term matching, so the full-text boost shrinks with the number of words.
function fulltextBoost(query) {
  const tokens = query.trim().split(/\s+/).length;
  return tokens > 1 ? 1 / (5 * tokens) : 1;
}

function buildSearchQuery(text) {
  return {
    type: 'composite',
    operator: 'OR',
    queries: [
      { type: 'vector', text, options: { numCandidates: VECTOR_NUM_CANDIDATES, boost: 1 } },
      {
        type: 'fulltext',
        text,
        options: { boost: fulltextBoost(text), operator: 'AND', matchStrategy: 'COMBINED_FIELDS' },
      },
    ],
  };
}

async function fetchSearchResults(baseUrl, contentSource, contentSourceType, query, limit, cursor) {
  const url = `${baseUrl}/search`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentSource: { name: contentSource, type: contentSourceType },
      query: buildSearchQuery(query),
      queryOptions: {
        resultFields: { includes: RESULT_FIELDS },
        pagination: {
          limit,
          ...(cursor ? { cursor } : {}),
        },
      },
    }),
  });
  if (!resp.ok) throw new Error(`Content AI search failed: ${resp.status}`);
  return resp.json();
}

function toggleShow(el, show) {
  if (!el) return;
  if (show !== false) el.removeAttribute('hidden');
  else el.setAttribute('hidden', 'hidden');
}

function resolveMetadataUrl(meta) {
  return (meta && (meta.url || meta.source)) || '';
}

const DOCUMENT_EXT = /\.(pdf|docx?|pptx?|xlsx?)$/i;

function labelFromUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (!segments.length) return url;
    // Document URLs can end in an id (…/Report.pdf/dc1fa6af-…), so use the file name segment.
    const file = [...segments].reverse().find((segment) => DOCUMENT_EXT.test(segment));
    if (file) {
      const name = decodeURIComponent(file.replace(/\+/g, ' '))
        .replace(DOCUMENT_EXT, '')
        .replace(/^\(\w+\)\s*/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (name) return name;
    }
    const slug = decodeURIComponent(segments[segments.length - 1])
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    if (!slug) return url;
    return slug.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  } catch (error) {
    return url;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function linkifyBareUrls(html) {
  return html.split(/(<a\b[^>]*>.*?<\/a>)/g).map((part) => {
    if (/^<a\b/.test(part)) return part;
    return part.replace(/https?:\/\/[^\s<]+/g, (url) => {
      const trailingMatch = url.match(/[).,;:!?]+$/);
      const trailing = trailingMatch ? trailingMatch[0] : '';
      const cleanUrl = trailing ? url.slice(0, -trailing.length) : url;
      if (!isSafeUrl(cleanUrl)) return url;
      return `<a href="${cleanUrl}" target="_blank" rel="noopener">${cleanUrl}</a>${trailing}`;
    });
  }).join('');
}

function renderMarkdownInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => (
    isSafeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : label
  ));
  html = linkifyBareUrls(html);
  return html;
}

function renderMarkdownSummary(text) {
  const lines = String(text || '').split(/\r?\n/);
  let html = '';
  let listOpen = false;
  lines.forEach((line) => {
    const trimmed = line.replace(/^\s+/, '');
    if (/^[-*]\s+/.test(trimmed)) {
      if (!listOpen) {
        html += '<ul>';
        listOpen = true;
      }
      html += `<li>${renderMarkdownInline(trimmed.replace(/^[-*]\s+/, ''))}</li>`;
    } else {
      if (listOpen) {
        html += '</ul>';
        listOpen = false;
      }
      if (trimmed.length > 0) html += `<p>${renderMarkdownInline(trimmed)}</p>`;
    }
  });
  if (listOpen) html += '</ul>';
  return html;
}

// Skip-link anchors (page#main-content) point at the same page, so a crawl that indexed
// them as separate documents would otherwise show the page twice.
const SKIP_ANCHORS = ['#main-content', '#main', '#content', '#maincontent', '#skip-to-content'];

function isSkipAnchor(hash) {
  return SKIP_ANCHORS.includes(String(hash).toLowerCase());
}

function stripSkipAnchor(url) {
  const index = String(url).indexOf('#');
  return index >= 0 && isSkipAnchor(url.slice(index)) ? url.slice(0, index) : url;
}

function renderResultItem(item, layout) {
  const data = item.data || {};
  const meta = data.metadata || {};
  const url = data.source || resolveMetadataUrl(meta);
  const title = meta.title || (url ? labelFromUrl(url) : '') || item.id || 'Untitled';
  const description = (typeof meta.description === 'string' && meta.description.trim())
    || excerptFromText(data.text, title);
  const image = meta.image || '';
  const href = isSafeUrl(url) ? stripSkipAnchor(url) : '#';

  const li = document.createElement('li');
  li.className = 'cmp-content-ai-search__item';

  const link = document.createElement('a');
  link.className = layout === 'list' ? 'cmp-content-ai-search__row' : 'cmp-content-ai-search__card';
  link.href = href;

  if (image && isSafeUrl(image)) {
    const img = document.createElement('img');
    img.className = layout === 'list' ? 'cmp-content-ai-search__row-image' : 'cmp-content-ai-search__card-image';
    img.src = image;
    img.alt = '';
    img.loading = 'lazy';
    link.append(img);
  }

  const body = document.createElement('div');
  body.className = layout === 'list' ? 'cmp-content-ai-search__row-body' : 'cmp-content-ai-search__card-body';

  const titleEl = document.createElement('h3');
  titleEl.className = layout === 'list' ? 'cmp-content-ai-search__row-title' : 'cmp-content-ai-search__card-title';
  titleEl.textContent = title;
  body.append(titleEl);

  if (description) {
    const descriptionEl = document.createElement('p');
    descriptionEl.className = layout === 'list' ? 'cmp-content-ai-search__row-description' : 'cmp-content-ai-search__card-description';
    descriptionEl.textContent = description;
    body.append(descriptionEl);
  }

  link.append(body);
  li.append(link);
  return li;
}

function renderSourceChip(hit) {
  const meta = hit.metadata || {};
  const url = resolveMetadataUrl(meta);
  const safe = isSafeUrl(url);
  const label = meta.title || (url ? labelFromUrl(url) : '') || hit.id || 'Source';

  const li = document.createElement('li');
  const chip = document.createElement(safe ? 'a' : 'span');
  chip.className = 'cmp-content-ai-search__source-chip';
  chip.textContent = label;
  if (safe) {
    chip.href = url;
    chip.target = '_blank';
    chip.rel = 'noopener';
  }
  li.append(chip);
  return li;
}

function resolveItemImage(item) {
  const meta = (item.data && item.data.metadata) || {};
  const rawMeta = meta.meta && typeof meta.meta === 'object' ? meta.meta : {};
  const image = meta.image || rawMeta.image || '';
  return image && isSafeUrl(image) ? image : '';
}

function resolveItemUrl(item) {
  const data = item.data || {};
  const meta = data.metadata || {};
  const rawMeta = meta.meta && typeof meta.meta === 'object' ? meta.meta : {};
  return meta.canonicalUrl || meta.canonical || rawMeta.canonical || rawMeta['og:url']
    || resolveMetadataUrl(meta) || data.source || '';
}

function resolveImageLessIdentity(item) {
  const meta = (item.data && item.data.metadata) || {};
  const title = meta.title || resolveItemUrl(item) || item.id || '';
  return `${title}|${meta.description || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Identity used to spot duplicate results. Image-less results (e.g. nav/footer
// anchors like page.html#sign-in) collapse by page + text; image-backed results
// keep the URL fragment as a differentiator.
function resolveResultIdentity(item) {
  const image = resolveItemImage(item);
  const url = resolveItemUrl(item);
  const prefix = image ? 'content:' : 'image-less:';
  const suffix = image ? '' : `|${resolveImageLessIdentity(item)}`;
  if (!url || !isSafeUrl(url)) {
    return image ? `content-image:${image}` : `image-less:${resolveImageLessIdentity(item)}`;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    if (!image || isSkipAnchor(parsed.hash)) parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${prefix}${parsed.href}${suffix}`;
  } catch (error) {
    return `${prefix}${String(url).replace(/\/+$/, '').toLowerCase()}${suffix}`;
  }
}

// Keeps the first occurrence of each identity; a later duplicate replaces it only
// if it has an image the kept one lacks, or the same image state and a higher score.
function deduplicateResults(results) {
  const unique = [];
  const indexes = new Map();
  results.forEach((result) => {
    const identity = resolveResultIdentity(result);
    if (!indexes.has(identity)) {
      indexes.set(identity, unique.length);
      unique.push(result);
      return;
    }
    const index = indexes.get(identity);
    const existing = unique[index];
    const resultHasImage = !!resolveItemImage(result);
    const existingHasImage = !!resolveItemImage(existing);
    const resultScore = Number(result.score) || 0;
    const existingScore = Number(existing.score) || 0;
    if ((resultHasImage && !existingHasImage)
      || (resultHasImage === existingHasImage && resultScore > existingScore)) {
      unique[index] = result;
    }
  });
  return unique;
}

export default function decorate(block) {
  const config = readBlockConfig(block);
  const placeholder = config.placeholder || 'Search…';
  const { id } = config;
  const aiSearchModeEnabled = config['ai-search-mode-enabled'] !== 'false';
  const genSearchErrorRetryVisible = config['gen-search-error-retry-visible'] !== 'false';
  const disclaimerText = config['disclaimer-text'] || '';
  const baseUrl = (config['base-url'] || '').replace(/\/+$/, '');
  const contentSource = config['content-source'] || '';
  const contentSourceType = config['content-source-type'] || 'ACQUISITION';
  const resultsSize = Math.min(parseInt(config['results-size'], 10) || 10, MAX_RESULTS_SIZE);
  let resultsLayout = config['results-layout'] === 'list' ? 'list' : 'card';

  block.innerHTML = '';
  block.classList.add('cmp-content-ai-search', `cmp-content-ai-search--${resultsLayout}`);
  if (id) block.id = id;

  const idPrefix = id || `content-ai-search-${Math.random().toString(36).slice(2, 8)}`;

  const form = document.createElement('form');
  form.className = 'cmp-content-ai-search__form';
  form.setAttribute('role', 'search');

  const field = document.createElement('div');
  field.className = 'cmp-content-ai-search__field';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cmp-content-ai-search__input';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'cmp-content-ai-search__clear';
  clearButton.setAttribute('aria-label', 'Clear');
  clearButton.textContent = '×';
  clearButton.hidden = true;

  field.append(input, clearButton);
  form.append(field);

  let tabs;
  let tabResultsBtn;
  let tabAiBtn;
  let panelAi;
  let summaryLoading;
  let summaryEl;
  let summaryText;
  let sourcesEl;
  let errorEl;
  let retryButton;

  if (aiSearchModeEnabled) {
    tabs = document.createElement('div');
    tabs.className = 'cmp-content-ai-search__tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Search mode');

    tabResultsBtn = document.createElement('button');
    tabResultsBtn.type = 'button';
    tabResultsBtn.id = `${idPrefix}-tab-results`;
    tabResultsBtn.setAttribute('role', 'tab');
    tabResultsBtn.className = 'cmp-content-ai-search__tab';
    tabResultsBtn.setAttribute('aria-selected', 'true');
    tabResultsBtn.setAttribute('aria-controls', `${idPrefix}-panel-results`);
    tabResultsBtn.textContent = 'Search Results';

    tabAiBtn = document.createElement('button');
    tabAiBtn.type = 'button';
    tabAiBtn.id = `${idPrefix}-tab-ai`;
    tabAiBtn.setAttribute('role', 'tab');
    tabAiBtn.className = 'cmp-content-ai-search__tab';
    tabAiBtn.setAttribute('aria-selected', 'false');
    tabAiBtn.setAttribute('aria-controls', `${idPrefix}-panel-ai`);
    tabAiBtn.tabIndex = -1;
    tabAiBtn.textContent = 'AI Mode';

    tabs.append(tabResultsBtn, tabAiBtn);

    panelAi = document.createElement('div');
    panelAi.id = `${idPrefix}-panel-ai`;
    panelAi.className = 'cmp-content-ai-search__panel';
    panelAi.setAttribute('role', 'tabpanel');
    panelAi.setAttribute('aria-labelledby', tabAiBtn.id);
    panelAi.hidden = true;

    summaryLoading = document.createElement('div');
    summaryLoading.className = 'cmp-content-ai-search__summary-loading';
    summaryLoading.setAttribute('aria-live', 'polite');
    summaryLoading.hidden = true;
    summaryLoading.innerHTML = '<div class="cmp-content-ai-search__summary-card">'
      + '<div class="cmp-content-ai-search__summary-loading-content">'
      + '<span class="cmp-content-ai-search__summary-loading-indicator" aria-hidden="true"></span>'
      + '<p class="cmp-content-ai-search__summary-loading-text">Generating answer…</p>'
      + '</div></div>';

    summaryEl = document.createElement('div');
    summaryEl.className = 'cmp-content-ai-search__summary';
    summaryEl.setAttribute('role', 'status');
    summaryEl.setAttribute('aria-live', 'polite');
    summaryEl.hidden = true;

    const summaryCard = document.createElement('div');
    summaryCard.className = 'cmp-content-ai-search__summary-card';

    const summaryHeader = document.createElement('div');
    summaryHeader.className = 'cmp-content-ai-search__summary-header';
    summaryHeader.innerHTML = '<span class="cmp-content-ai-search__summary-icon" aria-hidden="true"></span>'
      + '<div class="cmp-content-ai-search__summary-heading">'
      + '<p class="cmp-content-ai-search__summary-title">Generative answer</p>'
      + '<p class="cmp-content-ai-search__summary-attribution">Powered by Content AI</p>'
      + '</div>';

    summaryText = document.createElement('div');
    summaryText.className = 'cmp-content-ai-search__summary-text';

    const sourcesSection = document.createElement('div');
    sourcesSection.className = 'cmp-content-ai-search__sources-section';
    const sourcesLabel = document.createElement('p');
    sourcesLabel.className = 'cmp-content-ai-search__sources-label';
    sourcesLabel.textContent = 'Sources';
    sourcesEl = document.createElement('ul');
    sourcesEl.className = 'cmp-content-ai-search__sources';
    sourcesSection.append(sourcesLabel, sourcesEl);

    summaryCard.append(summaryHeader, summaryText, sourcesSection);

    if (disclaimerText) {
      const disclaimer = document.createElement('p');
      disclaimer.className = 'cmp-content-ai-search__disclaimer';
      disclaimer.textContent = disclaimerText;
      summaryCard.append(disclaimer);
    }

    summaryEl.append(summaryCard);

    errorEl = document.createElement('div');
    errorEl.className = 'cmp-content-ai-search__error';
    errorEl.hidden = true;
    const errorMessage = document.createElement('p');
    errorMessage.textContent = 'Something went wrong generating the summary.';
    errorEl.append(errorMessage);
    if (genSearchErrorRetryVisible) {
      retryButton = document.createElement('button');
      retryButton.type = 'button';
      retryButton.textContent = 'Try again';
      errorEl.append(retryButton);
    }

    panelAi.append(summaryLoading, summaryEl, errorEl);
  }

  const panelResults = document.createElement('div');
  panelResults.className = 'cmp-content-ai-search__panel';
  if (aiSearchModeEnabled) {
    panelResults.id = `${idPrefix}-panel-results`;
    panelResults.setAttribute('role', 'tabpanel');
    panelResults.setAttribute('aria-labelledby', tabResultsBtn.id);
  }

  const resultsSection = document.createElement('div');
  resultsSection.className = 'cmp-content-ai-search__results-section';
  resultsSection.hidden = true;

  const resultsToolbar = document.createElement('div');
  resultsToolbar.className = 'cmp-content-ai-search__results-toolbar';

  const layoutToggle = document.createElement('div');
  layoutToggle.className = 'cmp-content-ai-search__layout-toggle';
  layoutToggle.setAttribute('role', 'group');
  layoutToggle.setAttribute('aria-label', 'Results layout');

  const layoutCardBtn = document.createElement('button');
  layoutCardBtn.type = 'button';
  layoutCardBtn.className = 'cmp-content-ai-search__layout-btn';
  layoutCardBtn.textContent = 'Cards';

  const layoutListBtn = document.createElement('button');
  layoutListBtn.type = 'button';
  layoutListBtn.className = 'cmp-content-ai-search__layout-btn';
  layoutListBtn.textContent = 'List';

  layoutToggle.append(layoutCardBtn, layoutListBtn);
  resultsToolbar.append(layoutToggle);

  const resultsList = document.createElement('ul');
  resultsList.className = 'cmp-content-ai-search__results';
  resultsList.setAttribute('aria-label', 'Search results');

  const loadMoreError = document.createElement('p');
  loadMoreError.className = 'cmp-content-ai-search__load-more-error';
  loadMoreError.textContent = 'Could not load more results. Please try again.';
  loadMoreError.hidden = true;

  const loadMoreButton = document.createElement('button');
  loadMoreButton.type = 'button';
  loadMoreButton.className = 'cmp-content-ai-search__load-more';
  loadMoreButton.textContent = 'Load more results';
  loadMoreButton.hidden = true;

  resultsSection.append(resultsToolbar, resultsList, loadMoreError, loadMoreButton);

  const resultsLoading = document.createElement('div');
  resultsLoading.className = 'cmp-content-ai-search__summary-loading cmp-content-ai-search__results-loading';
  resultsLoading.setAttribute('aria-live', 'polite');
  resultsLoading.hidden = true;
  resultsLoading.innerHTML = '<div class="cmp-content-ai-search__summary-loading-content">'
    + '<span class="cmp-content-ai-search__summary-loading-indicator" aria-hidden="true"></span>'
    + '<p class="cmp-content-ai-search__summary-loading-text">Searching…</p>'
    + '</div>';

  panelResults.append(resultsLoading, resultsSection);

  block.append(form);
  if (aiSearchModeEnabled) {
    block.append(tabs, panelAi, panelResults);
  } else {
    block.append(panelResults);
  }

  let activeTab = TAB_RESULTS;
  let allResults = [];
  let nextCursor = null;
  let currentQuery = '';
  let resultsRequestId = 0;
  let genSearchRequestId = 0;
  let visibleCount = 0;
  let pageSize = 0;
  let seenIds = new Set();

  function syncLayoutButtons() {
    layoutCardBtn.setAttribute('aria-pressed', resultsLayout === 'list' ? 'false' : 'true');
    layoutListBtn.setAttribute('aria-pressed', resultsLayout === 'list' ? 'true' : 'false');
  }

  function applyLayoutClass() {
    block.classList.remove('cmp-content-ai-search--card', 'cmp-content-ai-search--list');
    block.classList.add(resultsLayout === 'list' ? 'cmp-content-ai-search--list' : 'cmp-content-ai-search--card');
  }

  function renderResults(message) {
    resultsList.innerHTML = '';
    resultsSection.hidden = false;
    const visibleResults = allResults.slice(0, visibleCount);
    if (!visibleResults.length) {
      const empty = document.createElement('p');
      empty.className = 'cmp-content-ai-search__empty';
      empty.textContent = message || 'No results found.';
      resultsList.append(empty);
      loadMoreButton.hidden = true;
      return;
    }
    visibleResults.forEach((item) => resultsList.append(renderResultItem(item, resultsLayout)));
    loadMoreButton.hidden = !(nextCursor || allResults.length > visibleCount);
  }

  function setResultsLoading(loading) {
    resultsLoading.hidden = !loading;
    if (loading) resultsSection.hidden = true;
  }

  function clearResults() {
    setResultsLoading(false);
    currentQuery = '';
    allResults = [];
    nextCursor = null;
    visibleCount = 0;
    pageSize = 0;
    seenIds = new Set();
    resultsRequestId += 1;
    genSearchRequestId += 1;
    resultsList.innerHTML = '';
    resultsSection.hidden = true;
    loadMoreButton.hidden = true;
    loadMoreError.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (summaryLoading) summaryLoading.hidden = true;
    if (errorEl) errorEl.hidden = true;
  }

  function fetchResultsPage(query, cursor) {
    return baseUrl
      ? fetchSearchResults(baseUrl, contentSource, contentSourceType, query, resultsSize, cursor)
      : fetchMockResults();
  }

  function storeResults(data, cursor, append) {
    const results = data.results || [];
    const newResults = results.filter((item) => item.id == null || !seenIds.has(item.id));
    newResults.forEach((item) => seenIds.add(item.id));
    if (append) {
      allResults = deduplicateResults(allResults.concat(newResults));
      const cursorAdvanced = data.cursor && data.cursor !== cursor;
      nextCursor = (cursorAdvanced && newResults.length) ? data.cursor : null;
    } else {
      allResults = deduplicateResults(newResults);
      nextCursor = data.cursor || null;
    }
  }

  // Dropping duplicates can leave a page short of the configured results size;
  // pull follow-up pages (bounded) until it is filled or the index is exhausted.
  async function topUpResults(requestId, query, targetCount, remaining = MAX_TOP_UP_REQUESTS) {
    if (remaining <= 0 || !nextCursor || allResults.length >= targetCount) return;
    const cursor = nextCursor;
    const data = await fetchResultsPage(query, cursor);
    if (requestId !== resultsRequestId) return;
    storeResults(data, cursor, true);
    await topUpResults(requestId, query, targetCount, remaining - 1);
  }

  async function runResultsSearch(query) {
    resultsRequestId += 1;
    const requestId = resultsRequestId;
    loadMoreError.hidden = true;
    setResultsLoading(true);
    try {
      const data = await fetchResultsPage(query, null);
      if (requestId !== resultsRequestId) return;
      seenIds = new Set();
      storeResults(data, null, false);
      // The server returns the configured results size per page, so that raw count is
      // the target to restore after duplicates are dropped.
      pageSize = (data.results || []).length;
      visibleCount = pageSize;
      try {
        await topUpResults(requestId, query, pageSize);
      } catch (error) {
        // Keep the results we already have.
      }
      if (requestId !== resultsRequestId) return;
      setResultsLoading(false);
      renderResults();
    } catch (error) {
      if (requestId !== resultsRequestId) return;
      setResultsLoading(false);
      allResults = [];
      nextCursor = null;
      visibleCount = 0;
      renderResults('Something went wrong loading results. Please try again.');
    }
  }

  async function runLoadMore() {
    if (!nextCursor && allResults.length <= visibleCount) return;
    resultsRequestId += 1;
    const requestId = resultsRequestId;
    loadMoreError.hidden = true;
    const targetCount = visibleCount + pageSize;
    try {
      await topUpResults(requestId, currentQuery, targetCount);
      if (requestId !== resultsRequestId) return;
      visibleCount = targetCount;
      renderResults();
    } catch (error) {
      if (requestId !== resultsRequestId) return;
      loadMoreError.hidden = false;
    }
  }

  async function runGenSearch(query) {
    if (!summaryEl) return;
    genSearchRequestId += 1;
    const requestId = genSearchRequestId;
    const start = Date.now();
    if (errorEl) errorEl.hidden = true;
    summaryEl.hidden = true;
    summaryLoading.hidden = false;
    try {
      const data = baseUrl
        ? await fetchSearchAnswer(baseUrl, contentSource, contentSourceType, query)
        : await fetchMockAnswer();
      const elapsed = Date.now() - start;
      setTimeout(() => {
        if (requestId !== genSearchRequestId) return;
        summaryLoading.hidden = true;
        summaryText.innerHTML = renderMarkdownSummary(data.result || '');
        sourcesEl.innerHTML = '';
        (data.hits || []).forEach((hit) => sourcesEl.append(renderSourceChip(hit)));
        summaryEl.hidden = false;
      }, Math.max(0, LOADING_DISPLAY_DELAY - elapsed));
    } catch (error) {
      const elapsed = Date.now() - start;
      setTimeout(() => {
        if (requestId !== genSearchRequestId) return;
        summaryLoading.hidden = true;
        if (errorEl) errorEl.hidden = false;
      }, Math.max(0, LOADING_DISPLAY_DELAY - elapsed));
    }
  }

  function runQuery(query) {
    if (!query) {
      currentQuery = '';
      clearResults();
      return;
    }
    currentQuery = query;
    runResultsSearch(query);
    if (aiSearchModeEnabled) runGenSearch(query);
  }

  function activateTab(tab) {
    if (tab === activeTab) return;
    activeTab = tab;
    const showAi = tab === TAB_AI;
    tabAiBtn.setAttribute('aria-selected', showAi ? 'true' : 'false');
    tabAiBtn.tabIndex = showAi ? 0 : -1;
    tabResultsBtn.setAttribute('aria-selected', showAi ? 'false' : 'true');
    tabResultsBtn.tabIndex = showAi ? -1 : 0;
    toggleShow(panelAi, showAi);
    toggleShow(panelResults, !showAi);
  }

  if (aiSearchModeEnabled) {
    tabResultsBtn.addEventListener('click', () => activateTab(TAB_RESULTS));
    tabAiBtn.addEventListener('click', () => activateTab(TAB_AI));
    [tabResultsBtn, tabAiBtn].forEach((btn) => btn.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const next = activeTab === TAB_RESULTS ? TAB_AI : TAB_RESULTS;
      activateTab(next);
      (next === TAB_AI ? tabAiBtn : tabResultsBtn).focus();
    }));
    if (retryButton) {
      retryButton.addEventListener('click', () => runGenSearch(currentQuery));
    }
  }

  layoutCardBtn.addEventListener('click', () => {
    if (resultsLayout === 'card') return;
    resultsLayout = 'card';
    applyLayoutClass();
    syncLayoutButtons();
    renderResults();
  });

  layoutListBtn.addEventListener('click', () => {
    if (resultsLayout === 'list') return;
    resultsLayout = 'list';
    applyLayoutClass();
    syncLayoutButtons();
    renderResults();
  });

  loadMoreButton.addEventListener('click', runLoadMore);

  input.addEventListener('input', () => {
    clearButton.hidden = !input.value;
    if (!input.value) clearResults();
  });

  clearButton.addEventListener('click', () => {
    input.value = '';
    clearButton.hidden = true;
    clearResults();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runQuery(input.value.trim());
  });

  syncLayoutButtons();
}
