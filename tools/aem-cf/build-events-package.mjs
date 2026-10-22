#!/usr/bin/env node
/**
 * Builds a content package of a site's Event content fragments, for Package Manager.
 *
 *   node tools/aem-cf/build-events-package.mjs <site>
 *   -> tools/aem-assets/<site>-events-package.zip
 *
 * The events come from the import reports (tools/importer/reports/<site>/en/*.report.json, field
 * "events", written by import-plan-section.js from the source's webinar listing). The package has:
 * - the tag pensionsbc:event-type/webinar (namespace and parent created if missing, never replaced)
 * - the folder /content/dam/pensionsbc-base/<site>/events, using the /conf/pensionsbc-base
 *   configuration (so authors can create Event fragments there); created if missing
 * - one fragment per event (model /conf/pensionsbc-base/settings/dam/cfm/models/event), tagged
 *   webinar; each is replaced on install
 * The Event model itself, the GraphQL configuration and the persisted query are set up in AEM
 * first (tools/aem-cf/README.md).
 */
import {
  existsSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CONF = '/conf/pensionsbc-base';
const MODEL = `${CONF}/settings/dam/cfm/models/event`;
const TAG = { id: 'pensionsbc:event-type/webinar', path: ['pensionsbc', 'event-type', 'webinar'], titles: ['PensionsBC', 'Event type', 'Webinar'] };
const NS = 'xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0" xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0" xmlns:dam="http://www.day.com/dam/1.0"';

const site = process.argv[2];
if (!site) {
  console.error('Usage: build-events-package.mjs <site>');
  process.exit(1);
}
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
// FileVault: a value starting with [ would be read as a multi-value list
const value = (s) => xml(s).replace(/^\[/, '\\[');

const reports = join(ROOT, 'tools/importer/reports', site, 'en');
const events = existsSync(reports) ? readdirSync(reports).filter((f) => f.endsWith('.report.json')).flatMap((f) => {
  const r = JSON.parse(readFileSync(join(reports, f), 'utf8'));
  return r.events ? JSON.parse(r.events) : [];
}) : [];
if (!events.length) {
  console.error(`No events in ${reports}; run the section import first`);
  process.exit(1);
}

const folder = `/content/dam/pensionsbc-base/${site}/events`;
const zip = new JSZip();
const filters = [];

// tag namespace, parent and tag
TAG.path.forEach((name, i) => {
  const path = `/content/cq:tags/${TAG.path.slice(0, i + 1).join('/')}`;
  zip.file(`jcr_root/content/_cq_tags/${TAG.path.slice(0, i + 1).join('/')}/.content.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root ${NS}
    jcr:primaryType="cq:Tag" jcr:title="${xml(TAG.titles[i])}" sling:resourceType="cq/tagging/components/tag"/>
`);
  filters.push(`    <filter root="${path}" mode="merge"><include pattern="${path}"/></filter>`);
});

// events folder with the configuration
zip.file(`jcr_root${folder}/.content.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root ${NS}
    jcr:primaryType="sling:OrderedFolder" jcr:title="Events">
    <jcr:content jcr:primaryType="nt:unstructured" cq:conf="${CONF}" jcr:title="Events"/>
</jcr:root>
`);
filters.push(`    <filter root="${folder}" mode="merge">\n      <include pattern="${folder}"/>\n      <include pattern="${folder}/jcr:content"/>\n    </filter>`);

// fragments
events.forEach((e) => {
  const path = `${folder}/${e.slug}`;
  zip.file(`jcr_root${path}/.content.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root ${NS}
    jcr:primaryType="dam:Asset">
    <jcr:content jcr:primaryType="dam:AssetContent" contentFragment="{Boolean}true" jcr:title="${xml(e.title)}">
        <data jcr:primaryType="nt:unstructured" cq:model="${MODEL}">
            <master jcr:primaryType="nt:unstructured"
                title="${value(e.title)}"
                startDate="{Date}${e.startDate}T00:00:00.000Z"
                duration="${value(e.duration)}"
                description="${value(e.description)}"
                description_x0040_ContentType="text/plain"
                registrationUrl="${value(e.registrationUrl)}"
                linkText="${value(e.linkText)}"/>
        </data>
        <metadata jcr:primaryType="nt:unstructured" cq:tags="[${TAG.id}]" dc:title="${xml(e.title)}" xmlns:dc="http://purl.org/dc/elements/1.1/"/>
        <related jcr:primaryType="nt:unstructured"/>
    </jcr:content>
</jcr:root>
`);
  filters.push(`    <filter root="${path}"/>`);
});

const name = `pensionsbc-${site}-events`;
zip.file('META-INF/vault/filter.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<workspaceFilter version="1.0">\n${filters.join('\n')}\n</workspaceFilter>\n`);
zip.file('META-INF/vault/properties.xml', `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
<entry key="group">pensionsbc</entry>
<entry key="name">${name}</entry>
<entry key="version">1.0</entry>
<entry key="description">PensionsBC ${site}: webinar tag, events folder and Event content fragments (tools/aem-cf)</entry>
<entry key="packageType">content</entry>
<entry key="requiresRoot">false</entry>
</properties>
`);

const out = join(ROOT, 'tools/aem-assets', `${site}-events-package.zip`);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Built ${out}`);
events.forEach((e) => console.log(`  fragment ${folder}/${e.slug}  (${e.startDate}, tag ${TAG.id})`));
