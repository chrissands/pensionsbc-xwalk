# AEM CDN configuration (one-time, for an AEM admin)

`config/cdn.yaml` adds two response headers on AEM publish (program p129103):

| Rule | Paths | Header | Why |
|---|---|---|---|
| `dam-fonts-cors` | `/content/dam/pensionsbc-base/fonts/*` | `Access-Control-Allow-Origin: *` | Fonts uploaded to AEM Assets and picked in a site's **Site styles** sheet load on the Edge Delivery sites, another origin. Browsers refuse a cross-origin font without this header. Today AEM publish doesn't send it for Assets files. |
| `graphql-vary-origin` | `/graphql/execute.json/*` | `Vary: Origin` | The Event fragments' query. Without it the CDN can serve a copy cached for a request without `Origin` (no CORS headers) to browsers, which blocks events for up to 2 hours (seen 2026-10-22). |

## Deploy

1. **Cloud Manager:** open program **p129103** and the git repository its pipelines use.
2. **Add the file:** put `config/cdn.yaml` at `config/cdn.yaml` in that repository.
   - An environment has **one** `cdn.yaml`. If one exists, add these two rules to its `responseTransformations.rules` list instead.
   - `metadata.envTypes` is `dev`. Add `stage` / `prod` if those environments need it.
3. **Create a config pipeline:** Cloud Manager > **Pipelines** > **Add** > **Add Non-Production Pipeline** (or Production) > **Targeted Deployment** > **Config**. Set the repository, branch and location `config`, then run it.
4. **Check:** after the pipeline finishes, open a font's publish URL and look for `access-control-allow-origin: *` in the response headers, for example in the browser's Network panel:
   `https://publish-p129103-e1259800.adobeaemcloud.com/content/dam/pensionsbc-base/fonts/<file>.woff2`

Until this is deployed, a font from AEM Assets falls back to the site's own font. Fonts shipped with the site (Source Sans Pro, Roboto, Roboto Condensed) need nothing.

Reference: https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/cdn-configuring-traffic
