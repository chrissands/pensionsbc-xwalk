# Page templates (AEM Create Page wizard)

Custom page templates for the PensionsBC sites, listed in AEM Sites > **Create > Page** next to the
built-in Edge Delivery templates (Page, Placeholders, Spreadsheet, …). AEM's own templates are in
`/libs/core/franklin/templates` (read-only on AEM as a Cloud Service); ours are **editable templates**
in the configuration, so every site under `/content/pensionsbc-base` can use them.

| Template | Path | Starting content |
|---|---|---|
| Press release | `/conf/pensionsbc-base/settings/wcm/templates/press-release` | Hero (image) · title (h1) + date line · body copy (lead, subheading, quote, media contact) · "Upcoming events" with an Event List and one Event · page settings: title, description, Template = Press release |

A template folder (`tools/aem-templates/<template>/`) has `template.json` (title, description,
ranking, version), `content.plain.html` (the starting content, written like an imported page:
sections, blocks with field hints, Metadata) and `thumbnail.png` (the wizard card). The builder
converts the content like a pushed page (html2md -> md2jcr with this repo's component models), so
the blocks are what Universal Editor expects:

```bash
node tools/aem-templates/build-template-package.mjs press-release
# -> tools/aem-assets/press-release-template-package.zip
```

The page setting **Template** (`template`, page model) is set to `press-release` on pages created
from it; `scripts/aem.js` adds it to `<body>` as a class, for the press release styles in
`styles/styles.css`.

## Set up in AEM (once)

1. **Code first:** the Template page setting must be on `main` (merge the PR).
2. **Editable templates on:** Tools > General > **Configuration Browser** > pensionsbc-base >
   **Properties** > tick **Editable Templates** > Save & Close.
3. **Install the package:** Tools > Deployment > **Packages** > Upload Package >
   `press-release-template-package.zip` > **Install**.
4. **Allow the template:** Sites > select the **PensionsBC Base** site root (`/content/pensionsbc-base`)
   > **Properties** > **Advanced** > **Templates** > **Allowed Templates**: keep the existing entry
   (`/libs/core/franklin/templates/.*`) and **Add** `/conf/pensionsbc-base/settings/wcm/templates/.*`.
   Save & Close. (Pages below inherit it unless they set their own list.)
5. **Try it:** Sites > `language-masters/en` (or any site's `en`) > **Create > Page**: the
   **Press release** card should show. Create a page, open it in Universal Editor and fill in the
   placeholders; pick the Event's fragment in its properties.

If the card doesn't show, check steps 2–4 (template status is `enabled`; the allowed templates
include the `/conf` path). Fallback: a "Press release template" page that authors copy.

## Notes

- Reinstalling the package replaces the template; pages already created from it don't change.
- The template's starting content is copied into each new page: editing the template later only
  affects new pages.
- Editable templates are an AEM feature that isn't documented for Universal Editor (Edge Delivery)
  sites; this one keeps to the built-in Page template's structure (Edge Delivery page, root and
  section components).
