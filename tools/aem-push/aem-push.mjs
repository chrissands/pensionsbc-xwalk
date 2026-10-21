#!/usr/bin/env node
/**
 * Builds a site's imported pages into an AEM content package and (optionally) installs it
 * on AEM author through Package Manager, so nobody has to handle zip files by hand.
 *
 *   npm run aem:build -- <site>            build only (inspect tools/aem-push/build/<site>/)
 *   npm run aem:push  -- <site>            build, upload and install on AEM author
 *
 * <site> is a manifest in tools/aem-push/sites/<site>.json listing the pages to deliver.
 *
 * Pipeline per page: content/<path>.plain.html -> images downloaded and pointed at the DAM
 * (/content/dam/pensionsbc-base/<site>/) -> html2md -> md2jcr (with this repo's component
 * models) -> .content.xml under /content/pensionsbc-base/<path>.
 *
 * Filters (META-INF/vault/filter.xml):
 *  - a page: its cq:Page node and jcr:content subtree are replaced (child pages untouched);
 *    replacing jcr:content removes the MSM live relationship, so the page becomes LOCAL
 *  - a language root (<site>/<lang>, the homepage): only jcr:content/root is replaced so the
 *    live copy configuration on the page stays intact; title and description are set with a
 *    Sling POST after install
 *  - each asset: replaced; DAM folders: merge (created if missing, never overwritten)
 *
 * Authentication for push (never commit these):
 *   AEM_TOKEN=<local development access token from the AEM Developer Console>
 *   or AEM_USER + AEM_PASSWORD (local SDK)
 *   AEM_AUTHOR overrides the author host from .migration/project.json
 */
import {
  existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { html2md } from '@adobe/helix-html2md';
import { md2jcr } from '@adobe/helix-md2jcr';
import JSZip from 'jszip';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = join(ROOT, 'tools/aem-push');
const SITE_ROOT = '/content/pensionsbc-base';
const DAM_ROOT = '/content/dam/pensionsbc-base';
const PACKAGE_GROUP = 'pensionsbc';
const SILENT = {
  info() {}, debug() {}, trace() {}, warn() {}, error() {},
};
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
};

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const xmlUnescape = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
const fail = (msg) => { throw new Error(msg); };

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadManifest(site) {
  const path = join(TOOL, 'sites', `${site}.json`);
  if (!existsSync(path)) fail(`No manifest ${path}`);
  return readJson(path);
}

/** content/<site>/<lang>/index -> <site>/<lang>; everything else maps 1:1 */
function aemPathOf(contentPath) {
  return contentPath.replace(/\/index$/, '');
}

const isLanguageRoot = (aemPath) => aemPath.split('/').length === 2;

function models() {
  execFileSync('npm', ['run', '-s', 'build:json'], { cwd: ROOT, stdio: 'pipe' });
  return {
    models: readJson(join(ROOT, 'component-models.json')),
    definition: readJson(join(ROOT, 'component-definition.json')),
    filters: readJson(join(ROOT, 'component-filters.json')),
  };
}

/** A readable DAM name from an image URL (Liferay: /documents/<g>/<f>/<name>/<uuid>?t=) */
function assetName(src) {
  const url = new URL(src);
  const segments = url.pathname.split('/').map((s) => decodeURIComponent(s.replace(/\+/g, ' ')));
  const named = [...segments].reverse().find((s) => /\.(png|jpe?g|gif|svg|webp)$/i.test(s)) || segments.pop() || 'image';
  return named.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

async function download(src, cacheDir) {
  const file = join(cacheDir, Buffer.from(src).toString('base64url').slice(0, 120));
  if (existsSync(file)) return { body: readFileSync(file), type: readFileSync(`${file}.type`, 'utf8') };
  const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 (pensionsbc content migration)' } });
  if (!res.ok) fail(`Image ${src} -> HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const type = (res.headers.get('content-type') || '').split(';')[0];
  writeFileSync(file, body);
  writeFileSync(`${file}.type`, type);
  return { body, type };
}

/** Points every absolute <img> at its DAM path; collects the assets to package. */
async function localiseImages(html, damFolder, assets, cacheDir) {
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  let out = html.replace(/<source\b[^>]*>/g, '');
  for (const raw of sources) {
    const src = raw.replace(/&amp;/g, '&');
    if (!assets.has(src)) {
      const taken = new Set([...assets.values()].map((a) => a.name));
      let name = assetName(src);
      for (let i = 2; taken.has(name); i += 1) name = name.replace(/(-\d+)?(\.[a-z0-9]+)?$/, `-${i}$2`);
      // eslint-disable-next-line no-await-in-loop
      const { body, type } = await download(src, cacheDir);
      const ext = name.split('.').pop();
      assets.set(src, {
        name, body, mime: MIME[ext] || type || 'application/octet-stream', path: `${damFolder}/${name}`,
      });
    }
    out = out.split(`src="${raw}"`).join(`src="${assets.get(src).path}"`);
  }
  return out;
}

async function toJcr(html, componentModels) {
  const markdown = await html2md(`<body><main>${html}</main></body>`, { log: SILENT });
  const xml = await md2jcr(markdown, { ...componentModels, log: SILENT });
  // md2jcr wraps headings in rich text cells in a paragraph (<p><h1>..</h1></p>): unwrap them
  return xml.replace(/&lt;p&gt;(&lt;(h[1-6])&gt;.*?&lt;\/\2&gt;)&lt;\/p&gt;/g, '$1');
}

const attr = (xml, name) => {
  const value = xml.match(new RegExp(`<jcr:content\\b[^>]*\\s${name}="([^"]*)"`))?.[1];
  return value === undefined ? undefined : xmlUnescape(value);
};

/** Sets jcr:title (and an explicit manifest title) on the page's jcr:content. */
function withTitle(xml, title) {
  if (!title) return xml;
  const cleaned = xml.replace(/(<jcr:content\b[^>]*?)\s+jcr:title="[^"]*"/, '$1');
  return cleaned.replace('<jcr:content ', `<jcr:content jcr:title="${xmlEscape(title)}" `);
}

/** The jcr:content/root subtree of a page as its own docview file. */
function rootSubtree(xml) {
  const start = xml.indexOf('<root ');
  const end = xml.lastIndexOf('</root>');
  if (start < 0 || end < 0) fail('md2jcr output has no root node');
  const header = xml.match(/<jcr:root\b[^>]*>/)[0].replace(/\s+jcr:primaryType="[^"]*"/, '');
  const root = xml.slice(start, end + '</root>'.length).replace(/^<root /, `${header.slice(0, -1)} `).replace(/<\/root>$/, '</jcr:root>');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root}\n`;
}

function folderXml(title) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0"
    jcr:primaryType="sling:OrderedFolder" jcr:title="${xmlEscape(title)}"/>
`;
}

function assetXml(mime) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0" xmlns:dam="http://www.day.com/dam/1.0" xmlns:dc="http://purl.org/dc/elements/1.1/"
    jcr:primaryType="dam:Asset">
    <jcr:content jcr:primaryType="dam:AssetContent">
        <metadata jcr:primaryType="nt:unstructured" dc:format="${mime}"/>
        <related jcr:primaryType="nt:unstructured"/>
    </jcr:content>
</jcr:root>
`;
}

function renditionXml(mime) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:nt="http://www.jcp.org/jcr/nt/1.0"
    jcr:primaryType="nt:file">
    <jcr:content jcr:primaryType="nt:resource" jcr:mimeType="${mime}"/>
</jcr:root>
`;
}

const jcrDir = (path) => `jcr_root${path.split('/').map((s) => (s === 'jcr:content' ? '_jcr_content' : s)).join('/')}`;

function filterXml({ pages, assets, damFolder }) {
  const lines = [];
  const folders = assets.size ? [DAM_ROOT, damFolder] : [];
  folders.forEach((f) => lines.push(`    <filter root="${f}" mode="merge"><include pattern="${f}"/></filter>`));
  [...assets.values()].forEach((a) => lines.push(`    <filter root="${a.path}"/>`));
  pages.forEach(({ aem }) => {
    const path = `${SITE_ROOT}/${aem}`;
    if (isLanguageRoot(aem)) {
      lines.push(`    <filter root="${path}/jcr:content/root"/>`);
    } else {
      lines.push(`    <filter root="${path}">\n      <include pattern="${path}"/>\n      <include pattern="${path}/jcr:content(/.*)?"/>\n    </filter>`);
    }
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workspaceFilter version="1.0">\n${lines.join('\n')}\n</workspaceFilter>\n`;
}

function propertiesXml(name, site) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
<entry key="group">${PACKAGE_GROUP}</entry>
<entry key="name">${name}</entry>
<entry key="version">1.0</entry>
<entry key="description">PensionsBC ${site} pages and assets, generated by tools/aem-push from content/*.plain.html</entry>
<entry key="packageType">content</entry>
<entry key="requiresRoot">false</entry>
<entry key="allowIndexDefinitions">false</entry>
</properties>
`;
}

function placementMd(manifest, pages, assets, damFolder) {
  const rows = pages.map((p) => `| ${p.title || '(from page metadata)'} | \`${SITE_ROOT}/${p.aem}\` | ${p.scope} | ${p.note || ''} |`);
  const inherited = (manifest.inherited || []).map((p) => `| \`${SITE_ROOT}/${p.aem}\` | \`${SITE_ROOT}/${p.from}\` |`);
  return `# PLACEMENT: ${manifest.site}

Generated by \`npm run aem:build -- ${manifest.site}\`. Do not edit by hand.

## Pages in this package

| Title | AEM path | Scope | Notes |
|---|---|---|---|
${rows.join('\n')}

Scope: **local** pages replace the live-copy page in AEM, which removes the MSM relationship.
For a language root (homepage), only \`jcr:content/root\` is replaced and the title and description are set
after install, so the live copy configuration stays intact. **shared** pages live in the blueprint.

## Assets (${assets.size}) in \`${damFolder}\`

${[...assets.values()].map((a) => `- \`${a.path}\` (${a.mime})`).join('\n') || '- none'}

${inherited.length ? `## Inherited, not in this package (roll out from the blueprint)

| Live copy page | Blueprint |
|---|---|
${inherited.join('\n')}
` : ''}`;
}

export async function build(site) {
  const manifest = loadManifest(site);
  const out = join(TOOL, 'build', site);
  const cacheDir = join(TOOL, 'build', '.image-cache');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(cacheDir, { recursive: true });
  const componentModels = models();
  const damFolder = `${DAM_ROOT}/${manifest.site}`;
  const assets = new Map();
  const zip = new JSZip();
  const pages = [];

  for (const page of manifest.pages) {
    const file = join(ROOT, 'content', `${page.content}.plain.html`);
    if (!existsSync(file)) fail(`Missing ${file}; run the import first`);
    const aem = aemPathOf(page.content);
    // eslint-disable-next-line no-await-in-loop
    const html = await localiseImages(readFileSync(file, 'utf8'), damFolder, assets, cacheDir);
    let xml;
    try {
      // eslint-disable-next-line no-await-in-loop
      xml = withTitle(await toJcr(html, componentModels), page.title);
    } catch (e) {
      fail(`${page.content}: md2jcr failed: ${e.message}`);
    }
    const props = {
      'jcr:title': page.title || attr(xml, 'jcr:title'),
      'jcr:description': attr(xml, 'jcr:description'),
    };
    if (isLanguageRoot(aem)) {
      zip.file(`${jcrDir(`${SITE_ROOT}/${aem}/jcr:content/root`)}/.content.xml`, rootSubtree(xml));
    } else {
      zip.file(`${jcrDir(`${SITE_ROOT}/${aem}`)}/.content.xml`, xml);
    }
    pages.push({
      ...page, aem, title: props['jcr:title'], props,
    });
  }

  if (assets.size) {
    zip.file(`${jcrDir(DAM_ROOT)}/.content.xml`, folderXml('PensionsBC'));
    zip.file(`${jcrDir(damFolder)}/.content.xml`, folderXml(manifest.site));
  }
  assets.forEach((a) => {
    const dir = jcrDir(a.path);
    zip.file(`${dir}/.content.xml`, assetXml(a.mime));
    zip.file(`${dir}/_jcr_content/renditions/original`, a.body);
    zip.file(`${dir}/_jcr_content/renditions/original.dir/.content.xml`, renditionXml(a.mime));
  });

  const name = `pensionsbc-${manifest.site}-content`;
  zip.file('META-INF/vault/filter.xml', filterXml({ pages, assets, damFolder }));
  zip.file('META-INF/vault/properties.xml', propertiesXml(name, manifest.site));

  mkdirSync(out, { recursive: true });
  const zipFile = join(out, `${name}.zip`);
  writeFileSync(zipFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  const placement = placementMd(manifest, pages, assets, damFolder);
  mkdirSync(join(TOOL, 'placement'), { recursive: true });
  writeFileSync(join(TOOL, 'placement', `${manifest.site}.md`), placement);

  console.log(`Built ${zipFile}`);
  pages.forEach((p) => console.log(`  page   ${SITE_ROOT}/${p.aem}${isLanguageRoot(p.aem) ? '  (language root: jcr:content/root only)' : ''}`));
  assets.forEach((a) => console.log(`  asset  ${a.path}`));
  return {
    manifest, pages, zipFile, name,
  };
}

function authorHost() {
  const project = readJson(join(ROOT, '.migration/project.json'));
  const configured = Object.values(project.sites || {})[0]?.contentHostUrl;
  const host = process.env.AEM_AUTHOR || configured || fail('Set AEM_AUTHOR');
  return host.startsWith('http') ? host.replace(/\/$/, '') : `https://${host}`;
}

function authHeader() {
  if (process.env.AEM_TOKEN) return `Bearer ${process.env.AEM_TOKEN}`;
  if (process.env.AEM_USER && process.env.AEM_PASSWORD) {
    return `Basic ${Buffer.from(`${process.env.AEM_USER}:${process.env.AEM_PASSWORD}`).toString('base64')}`;
  }
  return fail('Set AEM_TOKEN (Developer Console local development token) or AEM_USER and AEM_PASSWORD');
}

async function aemFetch(host, path, init = {}) {
  const res = await fetch(`${host}${path}`, { ...init, headers: { Authorization: authHeader(), ...init.headers } });
  const text = await res.text();
  if (!res.ok) fail(`${init.method || 'GET'} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

export async function push(site) {
  const { pages, zipFile, name } = await build(site);
  const host = authorHost();
  const { token } = JSON.parse(await aemFetch(host, '/libs/granite/csrf/token.json'));
  const csrf = { 'CSRF-Token': token };

  const form = new FormData();
  form.append('file', new Blob([readFileSync(zipFile)], { type: 'application/zip' }), `${name}.zip`);
  form.append('name', name);
  form.append('force', 'true');
  form.append('install', 'true');
  console.log(`Uploading and installing ${name} on ${host} ...`);
  const result = await aemFetch(host, '/crx/packmgr/service.jsp', { method: 'POST', body: form, headers: csrf });
  const code = result.match(/<status code="(\d+)">([^<]*)<\/status>/);
  if (!code || code[1] !== '200') fail(`Package install failed: ${code ? `${code[1]} ${code[2]}` : result.slice(0, 500)}`);
  console.log('  installed');

  for (const page of pages.filter((p) => isLanguageRoot(p.aem))) {
    const body = new URLSearchParams({ _charset_: 'utf-8' });
    Object.entries(page.props).forEach(([k, v]) => { if (v) body.append(k, v); });
    // eslint-disable-next-line no-await-in-loop
    await aemFetch(host, `${SITE_ROOT}/${page.aem}/jcr:content`, { method: 'POST', body, headers: csrf });
    console.log(`  set title/description on ${SITE_ROOT}/${page.aem}`);
  }
  console.log('Done. Nothing was previewed or published.');
}

const [command, site] = process.argv.slice(2);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = { build, push }[command];
  if (!run || !site) {
    console.error('Usage: aem-push.mjs <build|push> <site>');
    process.exit(1);
  }
  run(site).catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
