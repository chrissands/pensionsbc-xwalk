import {
  createOptimizedPicture,
  decorateIcons,
  readBlockConfig,
} from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholders.js';
import {
  parseConfig,
  normalizeQuery,
  createRequestTracker,
  fetchResults,
  fetchAnswer,
} from './content-ai.js';

const searchParams = new URLSearchParams(window.location.search);

function findNextHeading(el) {
  let preceedingEl = el.parentElement.previousElement || el.parentElement.parentElement;
  let h = 'H2';
  while (preceedingEl) {
    const lastHeading = [...preceedingEl.querySelectorAll('h1, h2, h3, h4, h5, h6')].pop();
    if (lastHeading) {
      const level = parseInt(lastHeading.nodeName[1], 10);
      h = level < 6 ? `H${level + 1}` : 'H6';
      preceedingEl = false;
    } else {
      preceedingEl = preceedingEl.previousElement || preceedingEl.parentElement;
    }
  }
  return h;
}

function highlightTextElements(terms, elements) {
  elements.forEach((element) => {
    if (!element || !element.textContent) return;

    const matches = [];
    const { textContent } = element;
    terms.forEach((term) => {
      let start = 0;
      let offset = textContent.toLowerCase().indexOf(term.toLowerCase(), start);
      while (offset >= 0) {
        matches.push({ offset, term: textContent.substring(offset, offset + term.length) });
        start = offset + term.length;
        offset = textContent.toLowerCase().indexOf(term.toLowerCase(), start);
      }
    });

    if (!matches.length) {
      return;
    }

    matches.sort((a, b) => a.offset - b.offset);
    let currentIndex = 0;
    const fragment = matches.reduce((acc, { offset, term }) => {
      if (offset < currentIndex) return acc;
      const textBefore = textContent.substring(currentIndex, offset);
      if (textBefore) {
        acc.appendChild(document.createTextNode(textBefore));
      }
      const markedTerm = document.createElement('mark');
      markedTerm.textContent = term;
      acc.appendChild(markedTerm);
      currentIndex = offset + term.length;
      return acc;
    }, document.createDocumentFragment());
    const textAfter = textContent.substring(currentIndex);
    if (textAfter) {
      fragment.appendChild(document.createTextNode(textAfter));
    }
    element.innerHTML = '';
    element.appendChild(fragment);
  });
}

export async function fetchData(source) {
  const response = await fetch(source);
  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.error('error loading API response', response);
    return null;
  }

  const json = await response.json();
  if (!json) {
    // eslint-disable-next-line no-console
    console.error('empty API response', source);
    return null;
  }

  return json.data;
}

function renderResult(result, searchTerms, titleTag) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = result.path;
  if (result.image) {
    const wrapper = document.createElement('div');
    wrapper.className = 'search-result-image';
    const pic = createOptimizedPicture(result.image, '', false, [{ width: '375' }]);
    wrapper.append(pic);
    a.append(wrapper);
  }
  if (result.title) {
    const title = document.createElement(titleTag);
    title.className = 'search-result-title';
    const link = document.createElement('a');
    link.href = result.path;
    link.textContent = result.title;
    highlightTextElements(searchTerms, [link]);
    title.append(link);
    a.append(title);
  }
  if (result.description) {
    const description = document.createElement('p');
    description.textContent = result.description;
    highlightTextElements(searchTerms, [description]);
    a.append(description);
  }
  li.append(a);
  return li;
}

function clearSearchResults(block) {
  const searchResults = block.querySelector('.search-results');
  searchResults.innerHTML = '';
}

function clearSearch(block) {
  clearSearchResults(block);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = '';
    searchParams.delete('q');
    window.history.replaceState({}, '', url.toString());
  }
}

async function renderResults(block, config, filteredData, searchTerms) {
  clearSearchResults(block);
  const searchResults = block.querySelector('.search-results');
  const headingTag = searchResults.dataset.h;

  if (filteredData.length) {
    searchResults.classList.remove('no-results');
    filteredData.forEach((result) => {
      const li = renderResult(result, searchTerms, headingTag);
      searchResults.append(li);
    });
  } else {
    const noResultsMessage = document.createElement('li');
    searchResults.classList.add('no-results');
    noResultsMessage.textContent = config.placeholders.searchNoResults || 'No results found.';
    searchResults.append(noResultsMessage);
  }
}

function compareFound(hit1, hit2) {
  return hit1.minIdx - hit2.minIdx;
}

function filterData(searchTerms, data) {
  // no index yet (e.g. before Content AI search is connected): no results, no error
  if (!data) return [];
  const foundInHeader = [];
  const foundInMeta = [];

  data.forEach((result) => {
    let minIdx = -1;

    searchTerms.forEach((term) => {
      const idx = (result.header || result.title).toLowerCase().indexOf(term);
      if (idx < 0) return;
      if (minIdx < idx) minIdx = idx;
    });

    if (minIdx >= 0) {
      foundInHeader.push({ minIdx, result });
      return;
    }

    const metaContents = `${result.title} ${result.description} ${result.path.split('/').pop()}`.toLowerCase();
    searchTerms.forEach((term) => {
      const idx = metaContents.indexOf(term);
      if (idx < 0) return;
      if (minIdx < idx) minIdx = idx;
    });

    if (minIdx >= 0) {
      foundInMeta.push({ minIdx, result });
    }
  });

  return [
    ...foundInHeader.sort(compareFound),
    ...foundInMeta.sort(compareFound),
  ].map((item) => item.result);
}

async function handleSearch(e, block, config) {
  const searchValue = e.target.value;
  searchParams.set('q', searchValue);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = searchParams.toString();
    window.history.replaceState({}, '', url.toString());
  }

  if (searchValue.length < 3) {
    clearSearch(block);
    return;
  }
  const searchTerms = searchValue.toLowerCase().split(/\s+/).filter((term) => !!term);

  const data = await fetchData(config.source);
  const filteredData = filterData(searchTerms, data);
  await renderResults(block, config, filteredData, searchTerms);
}

function searchResultsContainer(block) {
  const results = document.createElement('ul');
  results.className = 'search-results';
  results.dataset.h = findNextHeading(block);
  return results;
}

function searchInput(block, config) {
  const input = document.createElement('input');
  input.setAttribute('type', 'search');
  input.className = 'search-input';

  const searchPlaceholder = config.placeholders.searchPlaceholder || 'Search...';
  input.placeholder = searchPlaceholder;
  input.setAttribute('aria-label', searchPlaceholder);

  if (!config.contentAi?.enabled) {
    input.addEventListener('input', (e) => {
      handleSearch(e, block, config);
    });
  }

  input.addEventListener('keyup', (e) => { if (e.code === 'Escape') { clearSearch(block); } });

  return input;
}

function searchIcon() {
  const icon = document.createElement('span');
  icon.classList.add('icon', 'icon-search');
  return icon;
}

function searchBox(block, config) {
  const box = document.createElement('div');
  box.classList.add('search-box');
  box.append(
    searchIcon(),
    searchInput(block, config),
  );

  return box;
}

/*
 * Content AI mode: switched on by the block properties (see content-ai.js parseConfig).
 * Runs on submit, not on every keystroke, because each run also requests a generated answer.
 */
const MIN_QUERY_LENGTH = 3;
const panels = new WeakMap();
const trackers = new WeakMap();

function createEl(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function contentAiAnswerPanel(config, placeholders) {
  const label = (key, fallback) => placeholders[key] || fallback;
  const element = createEl('div', 'search-answer');
  element.hidden = true;
  element.setAttribute('aria-live', 'polite');

  const loading = createEl('p', 'search-answer-loading', label('searchAnswerLoading', 'Generating answer…'));
  const card = createEl('div', 'search-answer-card');
  const body = createEl('div', 'search-answer-text');
  const sources = createEl('ul', 'search-answer-sources');
  const sourcesSection = createEl('div', 'search-answer-sources-section');
  sourcesSection.append(createEl('p', 'search-answer-sources-label', label('searchAnswerSources', 'Sources')), sources);
  card.append(createEl('p', 'search-answer-title', label('searchAnswerTitle', 'Generative answer')), body, sourcesSection);
  if (config.disclaimer) card.append(createEl('p', 'search-answer-disclaimer', config.disclaimer));

  const error = createEl('div', 'search-answer-error');
  error.append(createEl('p', 'search-answer-error-text', label('searchError', 'Something went wrong generating the answer.')));
  let retry;
  if (config.retryVisible) {
    retry = createEl('button', 'search-answer-retry', label('searchAnswerRetry', 'Try again'));
    retry.type = 'button';
    error.append(retry);
  }

  element.append(loading, card, error);

  const show = (section) => {
    element.hidden = false;
    [loading, card, error].forEach((part) => { part.hidden = part !== section; });
  };

  return {
    element,
    showLoading() {
      show(loading);
    },
    showAnswer(answer) {
      body.innerHTML = answer.html;
      sources.innerHTML = '';
      answer.sources.forEach((source) => {
        const li = document.createElement('li');
        if (source.url) {
          const a = createEl('a', 'search-answer-source', source.label);
          a.href = source.url;
          a.target = '_blank';
          a.rel = 'noopener';
          li.append(a);
        } else {
          li.append(createEl('span', 'search-answer-source', source.label));
        }
        sources.append(li);
      });
      sourcesSection.hidden = !answer.sources.length;
      show(card);
    },
    showError(onRetry) {
      if (retry) retry.onclick = onRetry;
      show(error);
    },
    clear() {
      element.hidden = true;
    },
  };
}

function renderMessage(block, message) {
  clearSearchResults(block);
  const searchResults = block.querySelector('.search-results');
  const li = document.createElement('li');
  searchResults.classList.add('no-results');
  li.textContent = message;
  searchResults.append(li);
}

function setStatus(block, message) {
  const status = block.querySelector('.search-status');
  if (status) status.textContent = message;
}

function resetContentAiSearch(block) {
  const { results, answer } = trackers.get(block);
  results.next();
  answer.next();
  clearSearch(block);
  panels.get(block)?.clear();
  setStatus(block, '');
}

function startAnswer(block, config, query) {
  const panel = panels.get(block);
  if (!panel) return Promise.resolve();
  const tracker = trackers.get(block).answer;
  const id = tracker.next();
  panel.showLoading();
  return fetchAnswer(config.contentAi, query).then((answer) => {
    if (!tracker.isCurrent(id)) return;
    if (answer.html) panel.showAnswer(answer);
    else panel.clear();
  }).catch(() => {
    if (!tracker.isCurrent(id)) return;
    panel.showError(() => startAnswer(block, config, query));
  });
}

async function startResults(block, config, query, searchTerms) {
  const tracker = trackers.get(block).results;
  const id = tracker.next();
  try {
    const items = await fetchResults(config.contentAi, query);
    if (!tracker.isCurrent(id)) return;
    await renderResults(block, config, items, searchTerms);
    setStatus(block, `${config.placeholders.searchResultsFound || 'Results found:'} ${items.length}`);
  } catch (error) {
    if (!tracker.isCurrent(id)) return;
    const message = config.placeholders.searchError || 'Something went wrong. Please try again.';
    renderMessage(block, message);
    setStatus(block, message);
  }
}

async function runContentAiSearch(block, config, rawQuery) {
  const query = normalizeQuery(rawQuery);
  if (query.length < MIN_QUERY_LENGTH) {
    resetContentAiSearch(block);
    return;
  }
  searchParams.set('q', query);
  if (window.history.replaceState) {
    const url = new URL(window.location.href);
    url.search = searchParams.toString();
    window.history.replaceState({}, '', url.toString());
  }
  const searchTerms = query.toLowerCase().split(/\s+/).filter((term) => !!term);
  const pending = [startResults(block, config, query, searchTerms)];
  if (config.contentAi.aiMode) pending.push(startAnswer(block, config, query));
  await Promise.all(pending);
}

function contentAiForm(block, config) {
  const form = document.createElement('form');
  form.className = 'search-form';
  form.setAttribute('role', 'search');
  const box = searchBox(block, config);
  const input = box.querySelector('input');
  form.append(box);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runContentAiSearch(block, config, input.value);
  });
  input.addEventListener('keyup', (e) => { if (e.code === 'Escape') resetContentAiSearch(block); });
  return form;
}

/*
 * The PensionsBC search pages use this block as the shell (search box + results area) until
 * Content AI search is connected: that replaces fetchData()/filterData() above with a call to
 * the search service and keeps renderResults() for the results list.
 */
export default async function decorate(block) {
  const placeholders = await fetchPlaceholders();
  const contentAi = parseConfig(readBlockConfig(block));
  const source = block.querySelector('a[href]')?.href || `${window.hlx.codeBasePath}/query-index.json`;
  block.innerHTML = '';

  if (contentAi.enabled) {
    const config = { source, placeholders, contentAi };
    if (contentAi.layout === 'list') block.classList.add('minimal');
    trackers.set(block, { results: createRequestTracker(), answer: createRequestTracker() });
    const status = createEl('p', 'search-status');
    status.setAttribute('role', 'status');
    block.append(contentAiForm(block, config), status);
    if (contentAi.aiMode) {
      const panel = contentAiAnswerPanel(contentAi, placeholders);
      panels.set(block, panel);
      block.append(panel.element);
    }
    block.append(searchResultsContainer(block));
    const initialQuery = searchParams.get('q');
    if (initialQuery) {
      block.querySelector('input').value = initialQuery;
      runContentAiSearch(block, config, initialQuery);
    }
    decorateIcons(block);
    return;
  }

  block.append(
    searchBox(block, { source, placeholders }),
    searchResultsContainer(block),
  );

  if (searchParams.get('q')) {
    const input = block.querySelector('input');
    input.value = searchParams.get('q');
    input.dispatchEvent(new Event('input'));
  }

  decorateIcons(block);
}
