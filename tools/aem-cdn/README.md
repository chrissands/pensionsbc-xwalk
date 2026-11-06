# AEM CDN configuration (one-time, for an AEM admin)

`config/cdn.yaml` adds one response header on AEM publish (program p129103):

| Rule | Paths | Header | Why |
|---|---|---|---|
| `graphql-vary-origin` | `/graphql/execute.json/*` | `Vary: Origin` | The Event fragments' query. Without it the CDN can serve a copy cached for a request without `Origin` (no CORS headers) to browsers, which blocks events for up to 2 hours (seen 2026-10-22). |

Fonts in AEM Assets need no rule. AEM publish already sends `Access-Control-Allow-Origin: *` for .woff2 files on every request (checked 2026-11-06), so the sites can use fonts picked in the Site styles sheet.

## Deploy

1. **Cloud Manager:** open program **p129103** and the git repository its pipelines use.
2. **Add the file:** put `config/cdn.yaml` at `config/cdn.yaml` in that repository.
   - An environment has **one** `cdn.yaml`. If one exists, add this rule to its `responseTransformations.rules` list instead.
   - `metadata.envTypes` is `dev`. Add `stage` / `prod` if those environments need it.
3. **Create a config pipeline:** Cloud Manager > **Pipelines** > **Add** > **Add Non-Production Pipeline** (or Production) > **Targeted Deployment** > **Config**. Set the repository, branch and location `config`, then run it.
4. **Check:** after the pipeline finishes, request the events query with an `Origin` header and look for `vary: Origin` in the response headers.

Reference: https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/content-delivery/cdn-configuring-traffic
