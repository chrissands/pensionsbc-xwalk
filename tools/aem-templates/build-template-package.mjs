#!/usr/bin/env node
/**
 * Builds an AEM page template (editable template in the pensionsbc-base configuration) as a
 * content package, so it shows in the Sites "Create Page" wizard next to the built-in Edge Delivery
 * templates.
 *
 *   node tools/aem-templates/build-template-package.mjs <template>
 *   -> tools/aem-assets/<template>-template-package.zip
 *
 * tools/aem-templates/<template>/:
 * - template.json: title, description, ranking
 * - content.plain.html: the starting content (sections, blocks with field hints, Metadata),
 *   converted like a pushed page (html2md -> md2jcr with this repo's component models) and used as
 *   the template's initial content
 * - thumbnail.png: the card image in the wizard
 * The template is /conf/pensionsbc-base/settings/wcm/templates/<template> (replaced on install).
 * The configuration needs Editable Templates on, and the site root's allowed templates must
 * include /conf/pensionsbc-base/settings/wcm/templates/.* (tools/aem-templates/README.md).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { html2md } from '@adobe/helix-html2md';
import { md2jcr } from '@adobe/helix-md2jcr';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TEMPLATES = '/conf/pensionsbc-base/settings/wcm/templates';
const PAGE_TYPE = 'core/franklin/components/page/v1/page';
const SILENT = {
  info() {}, debug() {}, trace() {}, warn() {}, error() {},
};
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const name = process.argv[2];
const dir = join(ROOT, 'tools/aem-templates', name || '');
if (!name || !existsSync(join(dir, 'template.json'))) {
  console.error('Usage: build-template-package.mjs <template> (with tools/aem-templates/<template>/template.json)');
  process.exit(1);
}
const meta = JSON.parse(readFileSync(join(dir, 'template.json'), 'utf8'));

// starting content, converted like a pushed page
execFileSync('npm', ['run', '-s', 'build:json'], { cwd: ROOT, stdio: 'pipe' });
const models = {
  models: JSON.parse(readFileSync(join(ROOT, 'component-models.json'), 'utf8')),
  definition: JSON.parse(readFileSync(join(ROOT, 'component-definition.json'), 'utf8')),
  filters: JSON.parse(readFileSync(join(ROOT, 'component-filters.json'), 'utf8')),
};
const html = readFileSync(join(dir, 'content.plain.html'), 'utf8');
const markdown = await html2md(`<body><main>${html}</main></body>`, { log: SILENT });
const page = (await md2jcr(markdown, { ...models, log: SILENT }))
  // md2jcr wraps headings in rich text in a paragraph (<p><h1>..</h1></p>), as aem-push unwraps
  .replace(/&lt;p&gt;(&lt;(h[1-6])&gt;.*?&lt;\/\2&gt;)&lt;\/p&gt;/g, '$1');

// the page's namespaces and its jcr:content (without the built-in template: AEM sets ours)
const namespaces = [...new Set(page.match(/xmlns:[a-z]+="[^"]+"/g))].join(' ');
const content = page.match(/<jcr:content\b[\s\S]*<\/jcr:content>/)?.[0];
if (!content) throw new Error('md2jcr output has no jcr:content');
const initial = content.replace(/\s+cq:template="[^"]*"/, '');

const templateXml = `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root ${namespaces}
    jcr:primaryType="cq:Template">
    <jcr:content
        jcr:primaryType="cq:PageContent"
        jcr:title="${xml(meta.title)}"
        jcr:description="${xml(meta.description)}"
        status="enabled"
        ranking="{Long}${meta.ranking || 20}"
        allowedPaths="[/content/pensionsbc-base(/.*)?]"
        sling:resourceType="${PAGE_TYPE}"/>
    <structure jcr:primaryType="cq:Page">
        <jcr:content
            jcr:primaryType="cq:PageContent"
            sling:resourceType="${PAGE_TYPE}">
            <root
                jcr:primaryType="nt:unstructured"
                sling:resourceType="core/franklin/components/root/v1/root"/>
        </jcr:content>
    </structure>
    <initial jcr:primaryType="cq:Page">
        ${initial}
    </initial>
    <policies jcr:primaryType="cq:Page">
        <jcr:content
            jcr:primaryType="nt:unstructured"
            sling:resourceType="wcm/core/components/policies/mappings"/>
    </policies>
</jcr:root>
`;

const path = `${TEMPLATES}/${name}`;
const zip = new JSZip();
zip.file(`jcr_root${path}/.content.xml`, templateXml);
if (existsSync(join(dir, 'thumbnail.png'))) zip.file(`jcr_root${path}/thumbnail.png`, readFileSync(join(dir, 'thumbnail.png')));
zip.file('META-INF/vault/filter.xml', `<?xml version="1.0" encoding="UTF-8"?>
<workspaceFilter version="1.0">
    <filter root="${path}"/>
</workspaceFilter>
`);
zip.file('META-INF/vault/properties.xml', `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
<entry key="group">pensionsbc</entry>
<entry key="name">pensionsbc-${name}-template</entry>
<entry key="version">${meta.version || '1.0'}</entry>
<entry key="description">PensionsBC page template "${xml(meta.title)}" for the Create Page wizard (tools/aem-templates)</entry>
<entry key="packageType">content</entry>
<entry key="requiresRoot">false</entry>
</properties>
`);
const out = join(ROOT, 'tools/aem-assets', `${name}-template-package.zip`);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Built ${out}\n  template ${path}`);
