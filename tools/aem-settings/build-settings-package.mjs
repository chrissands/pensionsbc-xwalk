#!/usr/bin/env node
/**
 * Builds a site's style settings pages as an AEM content package, for Package Manager:
 *
 *   node tools/aem-settings/build-settings-package.mjs <site>
 *   -> tools/aem-assets/<site>-settings-package.zip
 *
 * tools/aem-settings/<site>/:
 * - theme.plain.html: the Site theme page's starting content (a Site Theme block, read by
 *   scripts/site-theme.js), converted like a pushed page (html2md -> md2jcr with this repo's
 *   component models) into /content/pensionsbc-base/<site>/en/theme
 * The page is a local page of the site (not rolled out). Installing the package again replaces it,
 * so install once and edit in Universal Editor afterwards.
 */
/* eslint-disable import/no-extraneous-dependencies, no-console -- build tool (dev dependencies) */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { html2md } from '@adobe/helix-html2md';
import { md2jcr } from '@adobe/helix-md2jcr';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SITE_ROOT = '/content/pensionsbc-base';
const SILENT = {
  info() {}, debug() {}, trace() {}, warn() {}, error() {},
};

const site = process.argv[2];
const dir = join(ROOT, 'tools/aem-settings', site || '');
if (!site || !existsSync(join(dir, 'theme.plain.html'))) {
  console.error('Usage: build-settings-package.mjs <site> (with tools/aem-settings/<site>/theme.plain.html)');
  process.exit(1);
}

execFileSync('npm', ['run', '-s', 'build:json'], { cwd: ROOT, stdio: 'pipe' });
const models = {
  models: JSON.parse(readFileSync(join(ROOT, 'component-models.json'), 'utf8')),
  definition: JSON.parse(readFileSync(join(ROOT, 'component-definition.json'), 'utf8')),
  filters: JSON.parse(readFileSync(join(ROOT, 'component-filters.json'), 'utf8')),
};

/** a page's .content.xml from its plain HTML, as the push builds it */
async function pageXml(file) {
  const html = readFileSync(join(dir, file), 'utf8');
  const markdown = await html2md(`<body><main>${html}</main></body>`, { log: SILENT });
  return (await md2jcr(markdown, { ...models, log: SILENT }))
    // md2jcr wraps headings in rich text in a paragraph (<p><h1>..</h1></p>), as aem-push unwraps
    .replace(/&lt;p&gt;(&lt;(h[1-6])&gt;.*?&lt;\/\2&gt;)&lt;\/p&gt;/g, '$1');
}

const pages = [{ path: `${SITE_ROOT}/${site}/en/theme`, xml: await pageXml('theme.plain.html') }];

const zip = new JSZip();
pages.forEach(({ path, xml }) => zip.file(`jcr_root${path}/.content.xml`, xml));
zip.file('META-INF/vault/filter.xml', `<?xml version="1.0" encoding="UTF-8"?>
<workspaceFilter version="1.0">
${pages.map(({ path }) => `    <filter root="${path}"/>`).join('\n')}
</workspaceFilter>
`);
zip.file('META-INF/vault/properties.xml', `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
<entry key="group">pensionsbc</entry>
<entry key="name">pensionsbc-${site}-settings</entry>
<entry key="version">1.0</entry>
<entry key="description">PensionsBC ${site}: style settings pages (Site theme) for author-set styles (tools/aem-settings)</entry>
<entry key="packageType">content</entry>
<entry key="requiresRoot">false</entry>
</properties>
`);
const out = join(ROOT, 'tools/aem-assets', `${site}-settings-package.zip`);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Built ${out}\n${pages.map(({ path }) => `  page ${path}`).join('\n')}`);
