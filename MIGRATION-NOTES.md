# PensionsBC migration notes

Demo / proof of concept for BC Pension Corporation: six PensionsBC sites on AEM Edge Delivery
Services with AEM authoring (Universal Editor, "xwalk"). The sites never go to production: the demo
is always shown on the `aem.page` URLs below, and the pensionsbc.ca hostnames are only the sites they
represent. These notes are written so a partner can repeat the work in their own environment.

## Project type

- AEM as a Cloud Service author: `author-p129103-e1259800.adobeaemcloud.com`
- Content is authored in Universal Editor. It is not Document Authoring (da.live).
- One GitHub repo, `chrissands/pensionsbc-xwalk`, serves all six sites (repoless). Each site has its own
  Edge Delivery configuration whose content source is the same author, with a path mapping to its own
  folder (`/content/pensionsbc-base/<site>/:/`), so pages are served at `/en/...` and `/fr/...`.

| Site | Demo URL | AEM folder | Represents |
|---|---|---|---|
| Corporate | https://main--pensionsbc-xwalk--chrissands.aem.page/en/ | `corporate` | https://www.pensionsbc.ca/ |
| College | https://main--pensionsbc-college--chrissands.aem.page/en/ | `college` | https://college.pensionsbc.ca/ |
| Municipal | https://main--pensionsbc-mpp--chrissands.aem.page/en/ | `mpp` | https://mpp.pensionsbc.ca/ |
| Public Service | https://main--pensionsbc-pspp--chrissands.aem.page/en/ | `pspp` | https://pspp.pensionsbc.ca/ |
| Teachers' | https://main--pensionsbc-tpp--chrissands.aem.page/en/ | `tpp` | https://tpp.pensionsbc.ca/ |
| WorkSafeBC | https://main--pensionsbc-worksafe--chrissands.aem.page/en/ | `worksafe` | https://worksafe.pensionsbc.ca/ |

## Content structure (MSM)

```
/content/pensionsbc-base/
  language-masters/{en,fr}     blueprint: copyright, disclaimer, privacy, placeholders, default nav + footer
  <site>/{en,fr}               live copies, one per site
```

- No site serves `language-masters` directly. Shared pages reach a site only through MSM rollout to
  `<site>/en`.
- The homepage is the page **`<site>/en/index`**: Edge Delivery serves `/en/` from it. `<site>/en` is the
  language root, which holds the live copy configuration; nothing is ever written to it.
- **Local** per site: `<site>/en/index` (homepage), `<site>/en/nav`, `<site>/en/footer`, and plan-specific
  pages. Installing a local page replaces the live-copy page, which removes its MSM relationship (intended).
- **Shared** (inherited, never copied per site): copyright, disclaimer, privacy, placeholders.
- English only. French comes later through AEM translation.
- DAM: `/content/dam/pensionsbc-base/<site>/` for a site's own images, `/content/dam/pensionsbc-base/shared/`
  for images used on every site (BC Pension Corporation and BCI logos). Names are readable kebab-case.
- **Images are uploaded to AEM Assets first, then referenced by DAM path.** `tools/importer/dam-assets.js`
  maps each source image (by its file name) to its DAM path, and the importers write that path into the
  page. A push then only links to existing, processed assets. When the push button uploads images itself,
  it names them after the source URL, previews before AEM has processed them, drops the alt text, and
  once put the wrong logo in a footer slot. For a new site: upload its images to
  `/content/dam/pensionsbc-base/<site>/` (drag and drop in AEM Assets), add them to `dam-assets.js`,
  re-import.

## Links

- Same-site links are relative with the language prefix: `/en/...`.
- Content can't link to another demo site's `aem.page` URL: Edge Delivery rewrites `aem.page` / `aem.live`
  links in content into relative paths. So cross-site links are authored with the pensionsbc.ca hostname
  of the site they represent (`www`, `college`, `mpp`, `pspp`, `tpp`, `worksafe`).
- `scripts/scripts.js` `rewritePlanLinks()` points those links at
  `main--pensionsbc-<site>--chrissands.aem.page` when the page is served from `aem.page` / `aem.live`
  (PR #4). It runs in `decorateMain`, so nav and footer fragments are covered.
- External and unchanged: `employer.pensionsbc.ca`, My Account (`https://myaccount.pensionsbc.ca/`;
  the source's `myaccountmaint1` maintenance host is replaced).
- The importers share one host list: `tools/importer/plan-sites.js`.

## Code (shared by all six sites)

- `blocks/header/header.js`, `blocks/footer/footer.js` load `/<lang>/nav` and `/<lang>/footer` from the URL
  language prefix; header labels come from `/<lang>/placeholders.json`. No English strings in code.
- Nav page structure (every site): three sections named with Section Metadata **Brand** | **Sections** |
  **Tools**. Tools may be empty. Footer: one section.
- **Site themes:** `scripts.js` sets `body.site-<site>` from the aem.page host or the AEM path (Universal
  Editor), and `body.theme-plan` on the five plan sites, which share one source theme (1280px layout, 18px
  text, teal links, grey footer). Each plan only sets its accent colours (`--site-accent-color`,
  `--site-accent-dark-color`) in `styles/styles.css`. Authors set nothing.
- **Linked images** (logos) are authored as an Image followed by a Link; `joinLinkedImages()` in
  `scripts.js` joins them (header brand, footer).
- **Header:** a nav with section links (plan sites) gets two rows on desktop: logo + tools, then links.
  Tools are text links plus one primary button (bold link), e.g. Sign in to My Account; on small screens
  the button shows once the menu is open. A nav without links (corporate) has no menu button.
- **Footer:** plan footers are five sections with Section Metadata styles `footer-links`, `footer-about`,
  `footer-connect`, `footer-plans`, `footer-legal` (options in the section model). The corporate footer is
  one unstyled section and is laid out as before.
- Blocks reused so far: Hero (`split` style), Cards (`logos` style). Block models are in
  `blocks/<block>/_<block>.json`; run `npm run build:json` after changing them.
- Design tokens are CSS custom properties at the top of `styles/styles.css`. A rebrand is one edit there.
- Page metadata model (`models/_page.json`): title, description, keywords, plus `topic` and `audience`
  left empty for later tagging.

## Import → AEM pipeline

1. **Import** (source HTML to `content/<aem path>.plain.html`): scripts in `tools/importer/`
   (`import-<template>.js` + `parsers/` + `transformers/`), URL lists in `tools/importer/urls-*.txt`.
   Output paths mirror AEM 1:1: `content/<site>/en/index.plain.html` is the page `<site>/en/index`.
2. **Before the first install of a site:** in AEM, cancel inheritance on `<site>/en/index`, so a later
   rollout of the blueprint's placeholder homepage can't overwrite the migrated one.
3. **Push** to AEM author, in one of two ways:
   - **Push button in the migration tool** (what the site owner uses). It sends the workspace content
     pages and uploads their images itself, under a path built from the source image URL
     (`/content/dam/pensionsbc-base/documents/...`).
   - **`npm run aem:push`** (repeatable, scriptable; for the partner):
     ```bash
     npm run aem:build -- <site>    # build + inspect only: tools/aem-push/build/<site>/
     export AEM_TOKEN=...           # AEM Developer Console > Integrations > Local token (24 h); never commit it
     npm run aem:push  -- <site>    # build, upload and install through Package Manager
     ```
     `tools/aem-push/sites/<site>.json` lists the pages to deliver, plus optional `assets` overrides that
     send an image to a chosen DAM path (e.g. `shared/`). Per page, the push:
     - downloads its images into the DAM and points the page at them;
     - converts the page with html2md, then md2jcr using this repo's component models, into the same
       `core/franklin/components/*` structure Universal Editor writes.

     Package filters:
     - **Page:** the page node and its `jcr:content` are replaced. Child pages are untouched.
       Site and language roots are refused.
     - **Asset:** replaced.
     - **DAM folder:** merge (created if missing).

     `tools/aem-push/placement/<site>.md` is regenerated on every build: page, AEM path, title, local or
     shared, assets with their source URLs, and the inherited pages that need rollout. To install
     without the script, upload `tools/aem-push/build/<site>/*.zip` in Package Manager.
4. **Reprocess assets:** images installed by either route need AEM to process them before Edge Delivery
   can render them. Run **Reprocess Assets** on the folders if needed.
5. **Roll out** shared pages from `language-masters/en` to the site's live copy (AEM Sites > Rollout), then
   preview. Neither push route previews or publishes anything.

Notes:
- Only the pages a site needs should be in the workspace when using the push button. Old or sample pages
  in the workspace are pushed too.
- md2jcr wraps headings in rich text in a paragraph; `aem:push` unwraps `<p><hN>..</hN></p>`.

## Runbook: migrating the next site

Each plan site is migrated the same way, in its own session, after the previous site's PRs are merged.
Each phase stops for approval.

1. **Branch:** `migration/<site>` from an up-to-date `main` (fetch all branches: earlier work lives on
   branches other than `main`). Commit as the repo owner.
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
   - Add `tools/aem-push/sites/<site>.json` and run `npm run aem:build -- <site>` to check the pages
     convert and to generate `placement/<site>.md`.
   - The site owner cancels inheritance on `<site>/en/index`, pushes, reprocesses assets, rolls out the
     shared pages to `<site>/en`, then previews.
6. **PR:** summarise the changes and call out anything touching shared blocks, scripts or styles. Update
   the site's section below.

## Per-site status

### Corporate (`pensionsbc-xwalk`)

| Page | AEM path | Scope | Source |
|---|---|---|---|
| Homepage | `corporate/en/index` | local | https://www.pensionsbc.ca/ |
| Nav | `corporate/en/nav` | local | Empty Brand / Sections / Tools: www.pensionsbc.ca shows no navigation |
| Footer | `corporate/en/footer` | local | www.pensionsbc.ca footer (logos, legal links) |
| Copyright, Disclaimer, Privacy | `corporate/en/{copyright,disclaimer,privacy}` | inherited | `language-masters/en/*` |

Blueprint legal pages are imported from bcpensioncorp.ca (`tools/aem-push/sites/language-masters.json`).
The blueprint default nav and footer (`language-masters/en/nav`, `language-masters/en/footer`) are the
corporate ones, written by `import-blueprint-nav.js` / `import-blueprint-footer.js` from the same importers.
A live copy that hasn't authored its own nav or footer gets them by rollout.

Status (2026-10-21): homepage, nav and footer pushed with the push button. Images now reference the
assets installed by the first corporate package (`corporate/*.jpg`, `shared/*`), with alt text. After
the next push, preview `/en/`, `/en/nav` and `/en/footer`. Legal pages and placeholders not yet rolled
out to `corporate/en`.

Known gaps:
- Source hero subtitle is an `h2`; it is authored as a paragraph.
- The header hides its menu button when the nav has no links (corporate), so small screens show an empty bar like the source.
- Footer logos are an Image followed by a Link (Universal Editor has no linked image); `footer.js` joins them.

History: the first corporate package (before `tools/aem-push`) is on the `content-package` branch
(`PLACEMENT.md`, zips 1.0.0 to 1.1.0). It put nav and footer in `language-masters/en`; they are now
local per site.

### College (`pensionsbc-college`)

Demo: https://main--pensionsbc-college--chrissands.aem.page/en/

| Page | AEM path | Scope | Source |
|---|---|---|---|
| Nav | `college/en/nav` | local | college.pensionsbc.ca header |
| Footer | `college/en/footer` | local | college.pensionsbc.ca footer |
| Homepage | `college/en/index` | local | https://college.pensionsbc.ca/ (next) |
| Copyright, Privacy, Disclaimer | `college/en/{copyright,privacy,disclaimer}` | inherited | `language-masters/en/*` |

- Importers `tools/importer/import-plan-nav.js` and `import-plan-footer.js` work for every plan site (the
  site comes from the source host); run with `tools/importer/urls-college-global.txt`.
- Images: `tools/aem-assets/college-images.zip` (12 images, uploaded 2026-10-22), mapped in `dam-assets.js`.

Known gaps:
- Nav: Search (a Liferay search page) is not migrated. The source's sign-in button shows a "My Account"
  logo; it is text here.
- Footer: Co-browse (third-party script) is not migrated. "Register for My Account" goes to
  myaccount.pensionsbc.ca (the source's registration form is a Liferay page). Footer headings are h2
  (h4 on the source) so the heading order is valid.
- The nav and footer links point at pages that are not migrated yet (404 until they are).

### MPP, PSPP, TPP, WorkSafeBC

Not started. Scope: 15 pages per site (homepage included) plus nav and footer.

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-21 | The sites never go to production; the aem.page URLs are the demo. |
| 2026-10-21 | Content reaches AEM through the migration tool's push button; `npm run aem:push` is the scripted route for the partner. |
| 2026-10-21 | Each site's nav and footer are local pages at `<site>/en/nav` and `<site>/en/footer`; the blueprint nav and footer are defaults only. |
| 2026-10-21 | Cross-site links are authored with pensionsbc.ca hostnames and pointed at the aem.page demo sites at runtime (PR #4; PR #2 closed as a duplicate). |
| 2026-10-21 | Pilot scope: 15 pages per site, homepage included, plus nav and footer. |
