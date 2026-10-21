/* eslint-disable */
/* global WebImporter */

/**
 * PensionsBC sections transformer.
 * Inserts <hr> section breaks between template sections (beforeTransform,
 * while section elements still exist) and Section Metadata for styled
 * sections (afterTransform).
 */
const MARKER = 'data-excat-section-id';

function findSectionElement(root, section) {
  const selectors = Array.isArray(section.selector) ? section.selector : [section.selector];
  for (const sel of selectors) {
    if (!sel) continue;
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch (e) {
      // invalid selector, try next
    }
  }
  return null;
}

export default function transform(hookName, element, payload) {
  const template = payload && payload.template;
  const sections = template && Array.isArray(template.sections) ? template.sections : [];
  if (sections.length < 2) return;

  const document = element.ownerDocument;

  if (hookName === 'beforeTransform') {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      const el = findSectionElement(element, section);
      if (!el) continue;
      if (i > 0) {
        const hr = document.createElement('hr');
        if (section.style) hr.setAttribute(MARKER, section.id);
        el.parentNode.insertBefore(hr, el);
      } else if (section.style) {
        // Temporary marker for styled first section; removed in afterTransform
        const hr = document.createElement('hr');
        hr.setAttribute(MARKER, section.id);
        hr.setAttribute('data-excat-first', 'true');
        el.parentNode.insertBefore(hr, el);
      }
    }
  }

  if (hookName === 'afterTransform') {
    for (let i = sections.length - 1; i >= 0; i -= 1) {
      const section = sections[i];
      if (!section.style) continue;
      const marker = element.querySelector(`hr[${MARKER}="${section.id}"]`);
      const sectionEl = findSectionElement(element, section);
      const anchor = sectionEl || marker;
      if (!anchor) continue;

      const metadata = WebImporter.Blocks.createBlock(document, {
        name: 'Section Metadata',
        cells: { style: section.style },
      });

      if (sectionEl) {
        sectionEl.after(metadata);
      } else {
        // Section element replaced by parser: place metadata before next break
        let next = marker.nextElementSibling;
        while (next && next.tagName !== 'HR') next = next.nextElementSibling;
        if (next) next.before(metadata);
        else marker.parentNode.appendChild(metadata);
      }
    }

    element.querySelectorAll(`hr[${MARKER}]`).forEach((hr) => {
      if (hr.getAttribute('data-excat-first') === 'true') {
        hr.remove();
      } else {
        hr.removeAttribute(MARKER);
      }
    });
  }
}
