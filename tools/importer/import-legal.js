/* eslint-disable */
/* global WebImporter */

import pensionsbcCleanupTransformer from "./transformers/pensionsbc-cleanup.js";
import pensionsbcSectionsTransformer from "./transformers/pensionsbc-sections.js";
import bcpensioncorpLegalTransformer from "./transformers/bcpensioncorp-legal.js";

const PAGE_TEMPLATE = {
  "name": "legal",
  "urls": [
    "https://www.bcpensioncorp.ca/copyright",
    "https://www.bcpensioncorp.ca/disclaimer",
    "https://www.bcpensioncorp.ca/privacy"
  ],
  "representativeUrl": "https://www.bcpensioncorp.ca/copyright",
  "description": "Shared legal pages (copyright, disclaimer, privacy) from bcpensioncorp.ca; default content only, placed in language-masters/en",
  "blocks": [],
  "sections": []
};

const parsers = {};

const transformers = [pensionsbcCleanupTransformer, pensionsbcSectionsTransformer, bcpensioncorpLegalTransformer];

function executeTransformers(hookName, element, payload) {
  const enhancedPayload = { ...payload, template: PAGE_TEMPLATE };
  transformers.forEach((fn) => {
    try { fn(hookName, element, enhancedPayload); }
    catch (e) { console.error(`Transformer failed at ${hookName}:`, e); }
  });
}

function findBlocksOnPage(document, template) {
  const pageBlocks = [];
  template.blocks.forEach((blockDef) => {
    blockDef.instances.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        pageBlocks.push({ name: blockDef.name, selector, element });
      });
    });
  });
  return pageBlocks;
}

export default {
  transform: (payload) => {
    const { document, url, params } = payload;
    const main = document.body;

    executeTransformers("beforeTransform", main, payload);

    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);
    pageBlocks.forEach((block) => {
      if (!block.element.parentNode) return;
      const parser = parsers[block.name];
      if (!parser) return;
      try { parser(block.element, { document, url, params }); }
      catch (e) { console.error(`Failed to parse ${block.name} (${block.selector}):`, e); }
    });

    executeTransformers("afterTransform", main, payload);

    main.appendChild(document.createElement("hr"));
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // shared pages live in the MSM blueprint (language-masters/en) and roll out to every site
    const slug = new URL(params.originalURL).pathname
      .replace(/\/$/, "")
      .replace(/\.html?$/, "")
      .split("/")
      .pop();
    const path = WebImporter.FileUtils.sanitizePath(`/language-masters/en/${slug}`);

    return [{
      element: main,
      path,
      report: { title: document.title, template: PAGE_TEMPLATE.name, blocks: pageBlocks.map((b) => b.name) },
    }];
  },
};
