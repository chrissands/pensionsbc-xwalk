/* eslint-disable */
/* global WebImporter */

import heroSplitParser from "./parsers/hero-split.js";
import cardsLogoLinksParser from "./parsers/cards-logo-links.js";
import pensionsbcCleanupTransformer from "./transformers/pensionsbc-cleanup.js";
import pensionsbcSectionsTransformer from "./transformers/pensionsbc-sections.js";
import { useDamImages } from "./dam-assets.js";

const PAGE_TEMPLATE = {
  "name": "home",
  "urls": [
    "https://www.pensionsbc.ca/"
  ],
  "representativeUrl": "https://www.pensionsbc.ca/",
  "description": "PensionsBC homepage: hero band with banner image, plan-site selector cards",
  "blocks": [
    {
      "name": "hero-split",
      "instances": [
        ".lfr-layout-structure-item-60ee7d92-a4b1-4dec-6ffa-9af99f64b9ba"
      ]
    },
    {
      "name": "cards-logo-links",
      "instances": [
        ".plans"
      ]
    }
  ],
  "urlPattern": "/",
  "sections": [
    {
      "id": "section-1",
      "name": "Hero band",
      "selector": [
        ".lfr-layout-structure-item-60ee7d92-a4b1-4dec-6ffa-9af99f64b9ba"
      ],
      "style": null,
      "blocks": [
        "hero-split"
      ],
      "defaultContent": []
    },
    {
      "id": "section-2",
      "name": "Plan sites",
      "selector": [
        ".lfr-layout-structure-item-bf63d179-50ac-3208-da66-41d6860cec3d"
      ],
      "style": null,
      "blocks": [
        "cards-logo-links"
      ],
      "defaultContent": [
        "#portlet_com_liferay_journal_content_web_portlet_JournalContentPortlet_INSTANCE_cPuve9sBjqKo h2"
      ]
    }
  ]
};

const parsers = {
  "hero-split": heroSplitParser,
  "cards-logo-links": cardsLogoLinksParser,
};

const transformers = [pensionsbcCleanupTransformer, pensionsbcSectionsTransformer];

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
    // images already in AEM Assets are referenced by DAM path, so the push uploads nothing
    useDamImages(main, params.originalURL);

    const rawPath = new URL(params.originalURL).pathname
      .replace(/\/$/, "")
      .replace(/\.html?$/, "");
    // local content mirrors /content/pensionsbc-base; corporate-only pages are local to the corporate live copy
    const LANGUAGE_ROOT = "/corporate/en";
    const path = WebImporter.FileUtils.sanitizePath(`${LANGUAGE_ROOT}${rawPath === "" ? "/index" : rawPath}`);

    return [{
      element: main,
      path,
      report: { title: document.title, template: PAGE_TEMPLATE.name, blocks: pageBlocks.map((b) => b.name) },
    }];
  },
};
