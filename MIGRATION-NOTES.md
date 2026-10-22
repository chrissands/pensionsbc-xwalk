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
- Blocks and styles so far:
  - Hero: `split` (corporate), `panel` (plan homepages: box of topic links over the image).
  - Cards on plan section pages: `featured` (grey boxes, accent titles), `links` (grey boxes),
    `link-list` (separated by rules), `events` (webinars with a date badge), `resources` (three-column
    course / video / article cards; the call-to-action link covers the card).
  - Event List: one item per Event content fragment (picked in Universal Editor), loaded with the
    persisted query `event-by-path` from AEM publish (author in Universal Editor) and shown as dated
    cards. An item can swap in another fragment for an audience (Local / Online), from the visitor's
    `?audience=` link, kept for the visit (`scripts/audience.js`). Setup, model and authoring:
    `tools/aem-cf/README.md`.
  - Section styles: `sidebar` (main column + 1/3 sidebar), `quick-links` (heading + links in a row),
    `accent-heading` (heading in the site accent with a rule above).
  - Section pages get breadcrumbs: page property **Show breadcrumbs** (`breadcrumbs`, in the page model),
    set by the section importer; the trail comes from the nav, its home label from the placeholders
    sheet (`breadcrumbs-home-label`) or else the site's logo text. The nav marks the current section
    with an underline.
  - Importer metadata keys must match page model field names exactly (lower case, e.g. `breadcrumbs`);
    md2jcr drops any other key, so it never reaches AEM.
  - Cards: `logos` (corporate), `tiles` (plan homepages: bordered tiles in two masonry columns, filled
    down the left column then the right). Each card has an optional **Card style** field; `highlight`
    is the yellow notice tile. In tiles, a paragraph holding only a YouTube link becomes an embedded
    player (youtube-nocookie, lazy), and an icon-sized image (≤ 120px, a 2x asset) sits beside the heading.
- Plan theme buttons are outlined in the plan teal (#167183). The source's lighter teal (#37a2ac) is
  below 4.5:1 contrast on white and grey, so it is not used (WCAG 2.1 AA). Block models are in
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
| Homepage | `college/en/index` | local | https://college.pensionsbc.ca/ |
| Your pension | `college/en/your-pension` | local | https://college.pensionsbc.ca/your-pension |
| About us | `college/en/about-us` | local | https://college.pensionsbc.ca/about-us |
| Learning resources | `college/en/learning-resources` | local | https://college.pensionsbc.ca/learning-resources |
| Search | `college/en/search` | local | https://college.pensionsbc.ca/web/college/search |
| Copyright, Privacy, Disclaimer | `college/en/{copyright,privacy,disclaimer}` | inherited | `language-masters/en/*` |

- Importers `tools/importer/import-plan-nav.js` and `import-plan-footer.js` work for every plan site (the
  site comes from the source host); run with `tools/importer/urls-college-global.txt`.
- Images: `tools/aem-assets/college-images.zip` (12 images, uploaded 2026-10-22), mapped in `dam-assets.js`.
- Homepage importer `tools/importer/import-plan-home.js` (also for every plan site): hero -> Hero (panel),
  each two-column layout row -> Cards (tiles), separators -> section breaks, other articles -> default
  content. Run with `tools/importer/urls-college-home.txt`.
- On 2026-10-22 pensionsbc.ca started timing out for this environment (bot protection). The homepage
  was imported from the saved page at `tools/importer/bd-snapshots/college.pensionsbc.ca/index.html`
  (captured the same day); the import runner uses a saved page automatically when one exists.
- **Search** (decided 2026-10-22): the search page will become a Content AI search page. Until then
  `college/en/search` has the title and the Search block as a shell (search box, results area; with
  no index it shows its "no results" message). The nav's last section link goes to `/en/search`
  (shown at the right end of the nav row with a magnifier). Content AI mode is switched on by the Search
  block properties (`base-url`, `content-source`, `content-source-type`, `ai-search-mode-enabled`,
  `gen-search-error-retry-visible`, `disclaimer-text`, `results-size`, `results-layout`), authored in
  Universal Editor; with `base-url` empty the shell above stays, so the other sites are unaffected.
  Do not re-push `college/en/search` with `aem:push` after the properties are authored: the push
  replaces the page's `jcr:content` and would erase them. Labels come from the placeholders sheet
  (`search-placeholder`, `search-no-results`, plus `search-error`, `search-answer-title`,
  `search-answer-loading`, `search-answer-sources`, `search-answer-retry`, `search-results-found`);
  add those keys to `language-masters/en/placeholders`.
  The search block's xwalk definition referenced a `search` filter that doesn't exist; it was removed
  so pages with the block convert to AEM content.
- Section pages: `tools/importer/import-plan-section.js` (every plan site), with `urls-college-sections.txt`.
  Batch 1 (Your pension, About us, Learning resources) was imported from pages saved in a browser with
  SingleFile (2026-10-21) because the source was still blocking this environment.
  `tools/importer/prepare-snapshot.mjs <saved.html> <site> [--folder <dam folder>]` turns such a save into
  an import snapshot: embedded images already in AEM keep their DAM path, new ones are named from their
  alt text and staged for upload (zipped as `tools/aem-assets/college-batch1-images.zip`).
- Liferay duplicate addresses of the same page (`welcome-to-the-plan1`, `f-taking-time-off-...`) and
  the `/web/<site>/` prefix (`/web/college/search`) are normalised to the page's address.
- Page titles are "<page> - <plan name>"; the plan names are in `plan-sites.js` (`PLAN_NAMES`), because
  browser-saved pages drop the hidden plan switcher the name was read from. The homepage and nav were
  re-imported from the SingleFile homepage save (identical output); `prepare-snapshot.mjs` also maps
  CSS background images (the hero) and header images.
- **Webinars as content fragments** (2026-10-22): the Learning resources webinars are Event content
  fragments in `/content/dam/pensionsbc-base/college/events/`, tagged `pensionsbc:event-type/webinar`,
  shown by an Event List block. The section importer writes the block (fragment paths) and the event
  data to the report; `tools/aem-cf/build-events-package.mjs college` builds
  `tools/aem-assets/college-events-package.zip` (tag, folder, fragments). The Event model, GraphQL
  configuration and persisted query are set up in AEM first: `tools/aem-cf/README.md`.
  Set up and published on 2026-10-22. The query variables must be encoded as one segment
  (`%3Bpath%3D...`); AEM does not decode a value encoded on its own. Known risk: a request without an
  `Origin` header (curl, a crawler) is cached by the AEM CDN without CORS headers for 2 hours and blocks
  that event in browsers until it expires; always test with an `Origin` header. A permanent fix is a
  CDN rule adding `Vary: Origin` to `/graphql/execute.json` (Cloud Manager config pipeline).
- **Demo events and audience swap** (2026-10-22): `tools/aem-cf/events/college.json` adds 10 demo
  events (4 new webinar topics, and an in-person workshop in a BC city for each of the 6 topics,
  tagged `pensionsbc:event-type/in-person`), on top of the 2 real webinars. Only the 2 real webinars
  have Arlo pages; the others link to the plan's Arlo listing. The Event model gained a `location` field
  and the query returns it. On Learning resources each webinar swaps to its in-person workshop for
  `?audience=local` (the importer writes this for the college site: `EVENT_SWAPS` in
  `import-plan-section.js`).

Known gaps:
- Nav: the source's sign-in button shows a "My Account" logo; it is text here.
- Footer: Co-browse (third-party script) is not migrated. "Register for My Account" goes to
  myaccount.pensionsbc.ca (the source's registration form is a Liferay page). Footer headings are h2
  (h4 on the source) so the heading order is valid.
- The nav and footer links point at pages that are not migrated yet (404 until they are).
- Section pages: the library and card-type icons (course / video / article) are not migrated; webinar
  fragments are a copy of the 2026-10-21 listing (the source's registration system, Arlo, is not
  connected), and past events are not hidden automatically; the breadcrumb home label is the shared placeholder
  "Home" (the source shows "College").
- Homepage: the source's white bordered tiles (video, Pension Life) are grey like the others; the
  courses promo image contains text ("Learn about my pension!") but has no alt text on the source, and
  none here; the annual report image's alt was "Image" on the source and is empty here (decorative).

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
| 2026-10-22 | Events are content fragments (model Event) per site in `<site>/events`, tagged by type; authors pick them in an Event List block; delivered by a persisted GraphQL query from publish. |
| 2026-10-22 | Audience swaps are per Event List item (default fragment + audience + fragment for that audience); the visitor's audience comes from `?audience=` on the arrival link and lasts for the visit. No experimentation plugin or Target. |
