#!/usr/bin/env node
/**
 * Builds a site's style settings pages as AEM content packages, one per page, for Package Manager:
 *
 *   node tools/aem-settings/build-settings-package.mjs <site> [theme] [styles]
 *   -> tools/aem-assets/<site>-<page>-package.zip (both pages when none is named)
 *
 * tools/aem-settings/<site>/:
 * - theme.plain.html: the Site theme page's starting content (a Site Theme block, read by
 *   scripts/site-theme.js), converted like a pushed page (html2md -> md2jcr with this repo's
 *   component models) into /content/pensionsbc-base/<site>/en/theme
 * - styles.json: the Site styles sheet ({ title, columns, rows }), an AEM spreadsheet page (the
 *   built-in Spreadsheet template, one row_<n> node per row, as AEM stores the placeholders) at
 *   /content/pensionsbc-base/<site>/en/styles, delivered as /en/styles.json once the site's
 *   public.json maps it
 * The pages are local pages of the site (not rolled out). Installing a package again replaces its
 * page, so install once and edit in AEM afterwards.
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
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
// a property name in .content.xml; values in a multi-value property escape commas
const multi = (values) => `[${values.map((v) => xml(v).replace(/,/g, '\\,')).join(',')}]`;

const [site, ...named] = process.argv.slice(2);
const dir = join(ROOT, 'tools/aem-settings', site || '');
if (!site || !existsSync(dir)) {
  console.error('Usage: build-settings-package.mjs <site> [theme] [styles] (tools/aem-settings/<site>/)');
  process.exit(1);
}

/** the Site theme page's .content.xml from its plain HTML, as the push builds a page */
async function themeXml() {
  execFileSync('npm', ['run', '-s', 'build:json'], { cwd: ROOT, stdio: 'pipe' });
  const models = {
    models: JSON.parse(readFileSync(join(ROOT, 'component-models.json'), 'utf8')),
    definition: JSON.parse(readFileSync(join(ROOT, 'component-definition.json'), 'utf8')),
    filters: JSON.parse(readFileSync(join(ROOT, 'component-filters.json'), 'utf8')),
  };
  const html = readFileSync(join(dir, 'theme.plain.html'), 'utf8');
  const markdown = await html2md(`<body><main>${html}</main></body>`, { log: SILENT });
  return (await md2jcr(markdown, { ...models, log: SILENT }))
    // md2jcr wraps headings in rich text in a paragraph (<p><h1>..</h1></p>), as aem-push unwraps
    .replace(/&lt;p&gt;(&lt;(h[1-6])&gt;.*?&lt;\/\2&gt;)&lt;\/p&gt;/g, '$1');
}

/** the Site styles sheet's .content.xml: a spreadsheet page with one row_<n> node per row */
function stylesXml() {
  const { title, columns, rows } = JSON.parse(readFileSync(join(dir, 'styles.json'), 'utf8'));
  const rowNodes = rows.map((cells, i) => `    <row_${i + 1}
        jcr:primaryType="nt:unstructured"
${columns.map((c, j) => `        ${c}="${xml(cells[j] ?? '')}"`).join('\n')}/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="cq:Page">
  <jcr:content
      jcr:primaryType="cq:PageContent"
      jcr:title="${xml(title)}"
      cq:template="/libs/core/franklin/templates/spreadsheet"
      sling:resourceType="core/franklin/components/spreadsheet/v1/spreadsheet"
      hideInNav="{Boolean}true"
      columns="${multi(columns)}">
${rowNodes}
  </jcr:content>
</jcr:root>
`;
}

const PAGES = {
  theme: { source: 'theme.plain.html', build: themeXml, label: 'Site theme page' },
  styles: { source: 'styles.json', build: stylesXml, label: 'Site styles sheet' },
};
const names = (named.length ? named : Object.keys(PAGES)).filter((n) => {
  if (!PAGES[n]) throw new Error(`Unknown page "${n}" (theme, styles)`);
  return existsSync(join(dir, PAGES[n].source));
});

await Promise.all(names.map(async (name) => {
  const path = `${SITE_ROOT}/${site}/en/${name}`;
  const zip = new JSZip();
  zip.file(`jcr_root${path}/.content.xml`, await PAGES[name].build());
  zip.file('META-INF/vault/filter.xml', `<?xml version="1.0" encoding="UTF-8"?>
<workspaceFilter version="1.0">
    <filter root="${path}"/>
</workspaceFilter>
`);
  zip.file('META-INF/vault/properties.xml', `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
<entry key="group">pensionsbc</entry>
<entry key="name">pensionsbc-${site}-${name}</entry>
<entry key="version">1.0</entry>
<entry key="description">PensionsBC ${site}: ${PAGES[name].label} for author-set styles (tools/aem-settings)</entry>
<entry key="packageType">content</entry>
<entry key="requiresRoot">false</entry>
</properties>
`);
  const out = join(ROOT, 'tools/aem-assets', `${site}-${name}-package.zip`);
  writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log(`Built ${out}\n  page ${path}`);
}));
