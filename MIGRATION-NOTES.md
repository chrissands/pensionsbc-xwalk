# PensionsBC migration notes

Demo / proof of concept for BC Pension Corporation: six PensionsBC sites on AEM Edge Delivery
Services with AEM authoring (Universal Editor, "xwalk"). There is no go-live. These notes are
written so a partner can repeat the work in their own environment.

## Project type

- AEM as a Cloud Service author: `author-p129103-e1259800.adobeaemcloud.com`
- Content is authored in Universal Editor. It is not Document Authoring (da.live).
- One GitHub repo, `chrissands/pensionsbc-xwalk`, serves all six sites (repoless). Each site has its own
  Edge Delivery configuration whose content source is the same author, with a path mapping to its own
  folder (`/content/pensionsbc-base/<site>/:/`), so pages are served at `/en/...` and `/fr/...`.

| Site | Edge Delivery site | AEM folder | Source |
|---|---|---|---|
| Corporate | `pensionsbc-xwalk` | `corporate` | https://www.pensionsbc.ca/ |
| College | `pensionsbc-college` | `college` | https://college.pensionsbc.ca/ |
| Municipal | `pensionsbc-mpp` | `mpp` | https://mpp.pensionsbc.ca/ |
| Public Service | `pensionsbc-pspp` | `pspp` | https://pspp.pensionsbc.ca/ |
| Teachers' | `pensionsbc-tpp` | `tpp` | https://tpp.pensionsbc.ca/ |
| WorkSafeBC | `pensionsbc-worksafe` | `worksafe` | https://worksafe.pensionsbc.ca/ |

Preview: `https://main--<eds-site>--chrissands.aem.page/en/`

## Content structure (MSM)

```
/content/pensionsbc-base/
  language-masters/{en,fr}     blueprint: copyright, disclaimer, privacy, placeholders, default nav + footer
  <site>/{en,fr}               live copies, one per site
```

- No site serves `language-masters` directly. Shared pages reach a site only through MSM rollout to
  `<site>/en`.
- **Local** per site: `<site>/en` (homepage), `<site>/en/nav`, `<site>/en/footer`, and plan-specific
  pages. Installing a local page replaces the live-copy page, which removes its MSM relationship (intended).
- **Shared** (inherited, never copied per site): copyright, disclaimer, privacy, placeholders.
- English only. French comes later through AEM translation.

## Links

- Same-site links are relative with the language prefix: `/en/...`.
- Cross-site links use **production** hostnames (`www`, `college`, `mpp`, `pspp`, `tpp`, `worksafe`
  `.pensionsbc.ca`). Edge Delivery rewrites `aem.page` / `aem.live` links in content into relative
  paths, so those can't be used for cross-site links.
- `scripts/scripts.js` `rewritePlanLinks()` points production plan links at
  `main--pensionsbc-<site>--chrissands.<tier>` only when the page is served from `aem.page` / `aem.live`,
  keeping the tier (preview to preview, live to live). It runs in `decorateMain`, so nav and footer
  fragments are covered.
- External and unchanged: `employer.pensionsbc.ca`, My Account (`https://myaccount.pensionsbc.ca/`;
  the source's `myaccountmaint1` maintenance host is replaced).
- The importers share one host list: `tools/importer/plan-sites.js`.

## Code (shared by all six sites)

- `blocks/header/header.js`, `blocks/footer/footer.js` load `/<lang>/nav` and `/<lang>/footer` from the URL
  language prefix; header labels come from `/<lang>/placeholders.json`. No English strings in code.
- Nav page structure (every site): three sections named with Section Metadata **Brand** | **Sections** |
  **Tools**. Tools may be empty. Footer: one section.
- Blocks reused so far: Hero (`split` style), Cards (`logos` style). Block models are in
  `blocks/<block>/_<block>.json`; run `npm run build:json` after changing them.
- Design tokens are CSS custom properties at the top of `styles/styles.css`. A rebrand is one edit there.
- Page metadata model (`models/_page.json`): title, description, keywords, plus `topic` and `audience`
  left empty for later tagging.

## Import → AEM pipeline

1. **Import** (source HTML to `content/<aem path>.plain.html`): scripts in `tools/importer/`
   (`import-<template>.js` + `parsers/` + `transformers/`), URL lists in `tools/importer/urls-*.txt`.
   Output paths mirror AEM: `content/<site>/en/index.plain.html` is the `<site>/en` homepage.
2. **Push** (to AEM author, no manual zip handling):
   ```bash
   npm run aem:build -- <site>    # build + inspect only: tools/aem-push/build/<site>/
   export AEM_TOKEN=...           # AEM Developer Console > Integrations > Local token (24 h); never commit it
   npm run aem:push  -- <site>    # build, upload and install through Package Manager
   ```
   `tools/aem-push/sites/<site>.json` lists the pages to deliver. Per page, the push:
   - downloads its images into `/content/dam/pensionsbc-base/<site>/` and points the page at them;
   - converts the page with html2md, then md2jcr using this repo's component models, into the same
     `core/franklin/components/*` structure Universal Editor writes.

   Package filters:
   - **Local leaf page:** the page node and its `jcr:content` are replaced. Child pages are untouched.
   - **Language root (homepage):** only `jcr:content/root` is replaced, so the live copy configuration
     on that page survives. Title and description are then set with a Sling POST.
   - **Asset:** replaced.
   - **DAM folder:** merge (created if missing).

   `tools/aem-push/placement/<site>.md` is regenerated on every build: page, AEM path, title, local or
   shared, assets, and the inherited pages that need rollout.
3. **Roll out** shared pages from `language-masters/en` to the site's live copy (AEM Sites > Rollout), then
   preview and publish. Pushing never previews or publishes anything.

Install packages without the script: upload `tools/aem-push/build/<site>/*.zip` in Package Manager.

### Known caveats of the push

- Assets installed from a package are not processed by Asset Compute (no thumbnails). Run **Reprocess
  Assets** on `/content/dam/pensionsbc-base/<site>` if the Universal Editor asset picker needs previews.
- The homepage keeps its live relationship (only its content tree is replaced). Don't roll out the
  language root page itself, or suspend inheritance on that page only, or a rollout will overwrite it.
  Re-running `aem:push` restores it.
- md2jcr wraps headings in rich text in a paragraph; the push unwraps `<p><hN>..</hN></p>`.

## Runbook: migrating the next site

Each plan site is migrated the same way, in its own session, after the previous site's PRs are merged.
Each phase stops for approval.

1. **Branch:** `migration/<site>` from an up-to-date `main`. Commit as the repo owner.
2. **Plan:**
   - 15 pages, homepage included, plus nav and footer; take them from the source nav and sitemap.
   - Mark each page local or shared. Legal pages are always shared; never copy them into the site.
   - List blocks to reuse or add. New blocks get generic names so all six sites can use them, with
     an xwalk model in `blocks/<block>/_<block>.json`.
   - List the site's own nav and footer links.
3. **Nav and footer:**
   - Write `tools/importer/import-<site>-nav.js` and `import-<site>-footer.js`, writing to `/<site>/en/nav`
     and `/<site>/en/footer`.
   - Use the same Brand | Sections | Tools structure as `import-nav.js`; footer is one section.
   - Cross-site links go through `plan-sites.js` (`productionHref`).
4. **Pages:**
   - Homepage first, then batches of up to 5. Output paths are `/<site>/en/...`, homepage
     `/<site>/en/index`.
   - Report fidelity gaps and anything not imported.
5. **Deliver:**
   - Add `tools/aem-push/sites/<site>.json`, run `npm run aem:build -- <site>` and check
     `placement/<site>.md`.
   - The site owner runs `npm run aem:push -- <site>`, rolls out the shared pages to `<site>/en`,
     then previews.
6. **PR:** summarise the changes and call out anything touching shared blocks, scripts or styles. Update
   the site's section below.

## Per-site status

### Corporate (`pensionsbc-xwalk`)

| Page | AEM path | Scope | Source |
|---|---|---|---|
| Homepage | `corporate/en` | local | https://www.pensionsbc.ca/ |
| Nav | `corporate/en/nav` | local | www.pensionsbc.ca header (plan switcher, My Account) |
| Footer | `corporate/en/footer` | local | www.pensionsbc.ca footer (logos, legal links) |
| Copyright, Disclaimer, Privacy | `corporate/en/{copyright,disclaimer,privacy}` | inherited | `language-masters/en/*` |

Blueprint legal pages are imported from bcpensioncorp.ca (`tools/aem-push/sites/language-masters.json`).

Known gaps:
- Source hero subtitle is an `h2`; it is authored as a paragraph.
- Footer logos are an Image followed by a Link (Universal Editor has no linked image); `footer.js` joins them.
- On preview (2026-10-21), corporate `/en/nav` and `/en/footer` still showed boilerplate and the legal pages
  were not previewed: the push and rollout must run, then preview.

### College, MPP, PSPP, TPP, WorkSafeBC

Not started. Scope: 15 pages per site (homepage included) plus nav and footer.

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-21 | Content reaches AEM through `npm run aem:push` (Package Manager HTTP API with the user's own token); zips remain available as build artifacts. |
| 2026-10-21 | Each site's nav and footer are local pages at `<site>/en/nav` and `<site>/en/footer`; the blueprint nav and footer are defaults only. |
| 2026-10-21 | Cross-site links use production hostnames, rewritten at runtime on aem.page/aem.live to the same tier. |
| 2026-10-21 | Pilot scope: 15 pages per site, homepage included, plus nav and footer. |
