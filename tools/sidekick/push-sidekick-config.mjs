#!/usr/bin/env node
/*
 * Pushes the sidekick config (project name + Universal Editor edit URL) for every PensionsBC site
 * to the AEM Configuration Service, keeping any other sidekick settings already stored there.
 *
 * Usage:
 *   AEM_AUTH_TOKEN=... node tools/sidekick/push-sidekick-config.mjs [--dry-run] [--site=<site>]
 *
 * Env:
 *   AEM_AUTH_TOKEN  required unless --dry-run: the auth_token cookie from admin.hlx.page
 *   EC_ORG          optional: Experience Cloud org slug used in the Universal Editor URL
 */

const ADMIN = 'https://admin.hlx.page';
const ORG = 'chrissands';
const AUTHOR_HOST = 'author-p129103-e1259800.adobeaemcloud.com';
const CONTENT_ROOT = '/content/pensionsbc-base';
const EC_ORG = process.env.EC_ORG || 'demoonecloud';

const SITES = [
  { site: 'pensionsbc-xwalk', folder: 'corporate', project: 'PensionsBC Corporate' },
  { site: 'pensionsbc-college', folder: 'college', project: 'PensionsBC College' },
  { site: 'pensionsbc-mpp', folder: 'mpp', project: 'PensionsBC Municipal' },
  { site: 'pensionsbc-pspp', folder: 'pspp', project: 'PensionsBC Public Service' },
  { site: 'pensionsbc-tpp', folder: 'tpp', project: 'PensionsBC Teachers\'' },
  { site: 'pensionsbc-worksafe', folder: 'worksafe', project: 'PensionsBC WorkSafeBC' },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlySite = args.find((a) => a.startsWith('--site='))?.split('=')[1];
const token = process.env.AEM_AUTH_TOKEN;

if (!dryRun && !token) {
  console.error('Set AEM_AUTH_TOKEN to your admin.hlx.page auth_token cookie, or use --dry-run.');
  process.exit(1);
}

const headers = {
  'content-type': 'application/json',
  ...(token ? { cookie: `auth_token=${token}` } : {}),
};

// Author-hosted UE: the experience.adobe.com canvas can't load the author page in its frame.
const editUrlPattern = (folder) => `https://${AUTHOR_HOST}/ui#/@${EC_ORG}/aem/universal-editor/canvas/${AUTHOR_HOST}${CONTENT_ROOT}/${folder}{{pathname}}.html`;

async function readSidekick(site) {
  if (!token) return {};
  const res = await fetch(`${ADMIN}/config/${ORG}/sites/${site}/sidekick.json`, { headers });
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`GET ${site}: ${res.status} ${res.headers.get('x-error') || ''}`);
  return res.json();
}

async function pushSite({ site, folder, project }) {
  const current = await readSidekick(site);
  const next = {
    ...current,
    project,
    editUrlLabel: 'Universal Editor',
    editUrlPattern: editUrlPattern(folder),
  };

  console.log(`\n${site}\n${JSON.stringify(next, null, 2)}`);
  if (dryRun) return;

  const res = await fetch(`${ADMIN}/config/${ORG}/sites/${site}/sidekick.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify(next),
  });
  if (!res.ok) throw new Error(`POST ${site}: ${res.status} ${res.headers.get('x-error') || ''}`);
  console.log(`-> updated (${res.status})`);
}

const targets = onlySite ? SITES.filter((s) => s.site === onlySite) : SITES;
if (!targets.length) {
  console.error(`Unknown site: ${onlySite}`);
  process.exit(1);
}

const failed = await targets.reduce(async (prev, target) => {
  const count = await prev;
  try {
    await pushSite(target);
    return count;
  } catch (e) {
    console.error(`!! ${e.message}`);
    return count + 1;
  }
}, Promise.resolve(0));
process.exit(failed ? 1 : 0);
