#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Prepares a browser-saved page (SingleFile, images embedded as data: URIs) as an import snapshot,
 * for when the source site can't be fetched (bot protection) and someone saves pages instead.
 *
 *   node tools/importer/prepare-snapshot.mjs <saved.html> <site>
 *     [--folder <dam folder>] [--images <dir>] [--name <map.json>]
 *
 * - Writes tools/importer/bd-snapshots/<host>/<path>.html (host and path from the SingleFile
 *   header), which the import runner uses instead of the live page.
 * - Every embedded content image becomes a DAM path: an image already in AEM (same bytes as a
 *   file in --images, default the workspace's DAM mirror content/content/dam) keeps its path;
 *   a new one gets /content/dam/pensionsbc-base/<folder>/<name>, named from its alt text, and is
 *   written to tools/aem-assets/<site>-new/<folder>/ for upload (tools/aem-assets/UPLOAD.md).
 * - --name maps sha1 prefixes (10 chars) to a DAM path, for images whose alt text gives no name
 *   or that are other renditions of an asset already in AEM.
 * SVG images (logos, icons) are left as they are; the nav and footer importers map those by name.
 */
import {
  existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DAM = '/content/dam/pensionsbc-base';
const [file, site, ...rest] = process.argv.slice(2);
if (!file || !site) {
  console.error('Usage: prepare-snapshot.mjs <saved.html> <site> [--images <dir>] [--name <map.json>] [--folder <dam folder>]');
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
const imagesDir = opt('--images', join(ROOT, 'content/content/dam/pensionsbc-base'));
const names = opt('--name') ? JSON.parse(readFileSync(opt('--name'), 'utf8')) : {};
const folder = opt('--folder', site);

const sha = (buf) => createHash('sha1').update(buf).digest('hex');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const known = new Map();
if (existsSync(imagesDir)) {
  walk(imagesDir).forEach((p) => known.set(sha(readFileSync(p)), `${DAM}/${relative(imagesDir, p)}`));
}

const html = readFileSync(file, 'utf8');
const url = new URL(html.slice(0, 2000).match(/url: (\S+)/)[1]);
const kebab = (s) => s.toLowerCase().normalize('NFKD').replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60);
const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
};

// the whole page body: content, header logo, footer images
const start = html.indexOf('<body');
const end = html.length;
const outDir = join(ROOT, 'tools/aem-assets', `${site}-new`, folder);
const report = [];
const content = html.slice(start, end).replace(/<img\b([^>]*?)\bsrc=(?:"(data:[^"]+)"|(data:[^\s>]+))([^>]*)>/g, (tag, pre, q, uq, post) => {
  const data = q || uq;
  const [head, body] = data.split(',', 2);
  const mime = head.slice(5).split(';')[0];
  if (!EXT[mime]) return tag; // svg icons, empty placeholders
  const buf = head.includes(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body));
  if (!buf.length) return tag;
  const hash = sha(buf);
  const altMatch = `${pre} ${post}`.match(/\balt=(?:"([^"]*)"|([^\s>]*))/) || [];
  const alt = altMatch[1] ?? altMatch[2] ?? '';
  let path = names[hash.slice(0, 10)] || known.get(hash);
  let status = 'existing';
  if (!path) {
    const name = kebab(alt) || hash.slice(0, 10);
    path = `${DAM}/${folder}/${name}.${EXT[mime]}`;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${name}.${EXT[mime]}`), buf);
    status = 'NEW';
  }
  report.push(`${status.padEnd(8)} ${path}  (alt "${alt.slice(0, 40)}")`);
  return `<img${pre}src="${path}"${post}>`;
});

// CSS background images in style attributes (e.g. the hero) the same way, by bytes
const styled = content.replace(/url\((["']?)(data:image\/(?:jpeg|png|gif|webp)[^)"']+)\1\)/g, (all, q, data) => {
  const [head, body] = data.split(',', 2);
  const buf = Buffer.from(head.includes(';base64') ? body : decodeURIComponent(body), head.includes(';base64') ? 'base64' : 'utf8');
  const hash = sha(buf);
  let path = names[hash.slice(0, 10)] || known.get(hash);
  if (!path) {
    const ext = EXT[head.slice(5).split(';')[0]];
    path = `${DAM}/${folder}/background-${hash.slice(0, 10)}.${ext}`;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `background-${hash.slice(0, 10)}.${ext}`), buf);
    report.push(`NEW      ${path}  (CSS background)`);
  } else report.push(`existing ${path}  (CSS background)`);
  return `url(${path})`;
});

const pathPart = url.pathname.replace(/\/$/, '') || '/index';
const snapshot = join(ROOT, 'tools/importer/bd-snapshots', url.hostname, `${pathPart}.html`);
mkdirSync(dirname(snapshot), { recursive: true });
writeFileSync(snapshot, html.slice(0, start) + styled + html.slice(end));
console.log(`${url.href} -> ${relative(ROOT, snapshot)}`);
report.forEach((r) => console.log(`  ${r}`));
