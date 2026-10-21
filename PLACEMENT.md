# PensionsBC corporate scope (en): content package placement

Packages (group `pensionsbc`):
- `pensionsbc-corporate-en-1.1.0.zip`: the full corporate scope (6 pages and 8 DAM assets), current content.
- `pensionsbc-corporate-en-links-1.0.1.zip`: **update for an existing 1.0.0 install**, with only the 2 pages whose plan links changed (see "Update 1.0.1" below).

Rebuild with `node migration-work/package/build-package.mjs [--only <paths>] [--no-assets] [--name] [--version]`,
then `python3 migration-work/package/zip-package.py <build dir> <zip>`.

## Update 1.0.1: cross-site plan links (if 1.0.0 is already installed)
Edge Delivery rewrites `*.aem.live` / `*.aem.page` links into relative paths, so the plan links now use the
production hostnames (`https://<plan>.pensionsbc.ca/en/`). The site code (PR #2) points them at the plan
Edge Delivery sites when the page is served from aem.page / aem.live.

**Reinstall these 2 pages only** (`pensionsbc-corporate-en-links-1.0.1.zip`, no assets; it references the DAM assets from 1.0.0):
| Page | AEM path | Change |
|---|---|---|
| Corporate homepage | `/content/pensionsbc-base/corporate/en/index` | 5 Member-site links: production hostnames |
| Header (nav) | `/content/pensionsbc-base/language-masters/en/nav` | 5 plan-switcher links: production hostnames |

Then roll out `language-masters/en` (nav) to all six live copies, merge PR #2, and preview.
Nothing else changed: footer, legal pages and assets stay as installed.

## Pages

| # | Page | AEM path | Title | Shared or local | Reaches the sites via |
|---|---|---|---|---|---|
| 1 | Corporate homepage | `/content/pensionsbc-base/corporate/en/index` | My Account - Home - PensionsBC | Corporate-only (local) | Corporate site `/en/` |
| 2 | Header (nav) | `/content/pensionsbc-base/language-masters/en/nav` | Header | Shared blueprint | MSM rollout, then `<site>/en/nav` |
| 3 | Footer | `/content/pensionsbc-base/language-masters/en/footer` | Footer | Shared blueprint | MSM rollout, then `<site>/en/footer` |
| 4 | Copyright | `/content/pensionsbc-base/language-masters/en/copyright` | Copyright - Corporate | Shared blueprint | MSM rollout, then `<site>/en/copyright` |
| 5 | Disclaimer | `/content/pensionsbc-base/language-masters/en/disclaimer` | Disclaimer - Corporate | Shared blueprint | MSM rollout, then `<site>/en/disclaimer` |
| 6 | Privacy | `/content/pensionsbc-base/language-masters/en/privacy` | Privacy - Corporate | Shared blueprint | MSM rollout, then `<site>/en/privacy` |

## Assets (DAM)

| Asset | Used by |
|---|---|
| `/content/dam/pensionsbc-base/corporate/banner-image.jpg` | Homepage hero |
| `/content/dam/pensionsbc-base/corporate/{cpp,mpp,pspp,tpp,wsbc}-logo.jpg` | Homepage plan cards |
| `/content/dam/pensionsbc-base/shared/bc-pension-corporation-logo.jpg` | Footer |
| `/content/dam/pensionsbc-base/shared/bci-logo.png` | Footer |

The filters cover exactly these pages and assets; nothing else is modified. The two DAM folders
use merge mode, so existing assets in them are never removed.

## Steps in AEM

1. **Before installing:** cancel inheritance on `corporate/en/index`, which is currently a live copy. This keeps a later rollout of `language-masters/en/index` (the blueprint placeholder) from overwriting the migrated homepage. Installing the package replaces that page node, so its live relationship is reset either way.
2. **Install** the package (Package Manager), then **reprocess** the 8 new DAM assets so renditions are generated.
3. **Create the placeholders sheet** at `/content/pensionsbc-base/language-masters/en/placeholders` (Edge Delivery spreadsheet), using `placeholders-language-masters-en.csv` (columns `Key`, `Text`). The header reads `/en/placeholders.json`. Without the sheet, the menu button has no accessible label and the skip link is not shown.
4. **Roll out** `language-masters/en` (nav, footer, copyright, disclaimer, privacy, placeholders) to the live copies: `corporate`, `college`, `mpp`, `pspp`, `tpp`, `worksafe`.
5. **Redirect** `/` to `/en/` on each site (site redirects sheet).
6. **Publish (preview):** `corporate/en/index` plus every rolled-out page. The new header and footer code only takes effect once the Phase 6 PR is merged.

## After this package
- **Plan navs:** each plan authors its own `<plan>/en/nav` later, with inheritance cancelled on that page. Until then every plan shows corporate's nav (brand plus plan switcher).
- **Not in this package:** plan homepages, old copies at `index` / `en/index`, and the boilerplate `en/nav`.
