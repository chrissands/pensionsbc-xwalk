/* eslint-disable */
/**
 * Clean-up helpers for plan site (Liferay journal article) content: keep the authored
 * structure (headings, paragraphs, lists, links, emphasis), drop layout markup and inline styles.
 */
import { siteHref } from '../plan-sites.js';

const INLINE = ['STRONG', 'B', 'EM', 'I', 'A', 'BR', 'SUP', 'SUB'];
const BLOCK = ['H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL'];
const SKIP = ['SCRIPT', 'STYLE', 'SVG', 'IMG', 'PICTURE', 'SOURCE', 'NOSCRIPT', 'LINK'];

const squash = (s) => s.replace(/\s+/g, ' ');

/** Copies inline content (text, emphasis, links) of node into target; links via siteHref. */
export function copyInline(document, node, target, base) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      target.append(document.createTextNode(squash(child.textContent)));
    } else if (child.nodeType === 1 && !SKIP.includes(child.tagName)) {
      if (INLINE.includes(child.tagName)) {
        const tag = { B: 'strong', I: 'em' }[child.tagName] || child.tagName.toLowerCase();
        const el = document.createElement(tag);
        if (tag === 'a') el.href = siteHref(child.getAttribute('href') || '', base);
        copyInline(document, child, el, base);
        if (tag === 'br' || el.textContent.trim()) target.append(el);
      } else {
        copyInline(document, child, target, base);
      }
    }
  });
  return target;
}

function trimmed(el) {
  // drop leading/trailing whitespace and <br>s
  while (el.firstChild && ((el.firstChild.nodeType === 3 && !el.firstChild.textContent.trim()) || el.firstChild.nodeName === 'BR')) el.firstChild.remove();
  while (el.lastChild && ((el.lastChild.nodeType === 3 && !el.lastChild.textContent.trim()) || el.lastChild.nodeName === 'BR')) el.lastChild.remove();
  if (el.firstChild?.nodeType === 3) el.firstChild.textContent = el.firstChild.textContent.replace(/^\s+/, '');
  if (el.lastChild?.nodeType === 3) el.lastChild.textContent = el.lastChild.textContent.replace(/\s+$/, '');
  return el;
}

/**
 * The authored content of a journal article as clean block elements. YouTube iframes become a
 * paragraph with a link to the video (the Cards tiles style plays it inline); a link or a
 * bold link outside any paragraph gets its own paragraph (rendered as a button).
 */
export function articleContent(document, article, base) {
  const out = [];
  const heading = article.querySelector('h2, h3, h4');
  const walk = (node) => {
    [...node.children].forEach((el) => {
      if (SKIP.includes(el.tagName)) return;
      if (el.tagName === 'IFRAME') {
        const id = (el.getAttribute('src') || '').match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/)?.[1];
        if (!id) return;
        const p = document.createElement('p');
        const a = document.createElement('a');
        a.href = `https://www.youtube.com/watch?v=${id}`;
        a.textContent = `Video: ${squash(heading?.textContent || 'YouTube').trim()}`;
        p.append(a);
        out.push(p);
      } else if (BLOCK.includes(el.tagName)) {
        if (['UL', 'OL'].includes(el.tagName)) {
          const list = document.createElement(el.tagName.toLowerCase());
          el.querySelectorAll(':scope > li').forEach((li) => {
            const item = trimmed(copyInline(document, li, document.createElement('li'), base));
            if (item.textContent.trim()) list.append(item);
          });
          if (list.children.length) out.push(list);
        } else {
          const block = trimmed(copyInline(document, el, document.createElement(el.tagName.toLowerCase()), base));
          if (block.textContent.trim()) out.push(block);
        }
      } else if (el.tagName === 'A' || (el.tagName === 'STRONG' && el.children.length === 1 && el.firstElementChild.tagName === 'A')) {
        const p = trimmed(copyInline(document, { childNodes: [el] }, document.createElement('p'), base));
        if (p.textContent.trim()) out.push(p);
      } else if (!INLINE.includes(el.tagName)) {
        walk(el);
      }
    });
  };
  walk(article);
  return out;
}
