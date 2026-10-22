# Event content fragments

Webinars (and later other events) are **Event** content fragments, tagged by type. Pages show them with the
**Event List** block: the author adds an Event item per fragment and picks the fragment. The block loads
each fragment from AEM with the persisted GraphQL query `event-by-path`:

- on the aem.page / aem.live sites, from AEM publish (anonymous; the publish CORS policy already allows
  the `main--pensionsbc-*--chrissands` origins);
- in Universal Editor, from AEM author with the author's login.

The publish host and GraphQL configuration name are in `scripts/aem-config.js`.

| What | Where |
|---|---|
| Configuration | `/conf/pensionsbc-base` |
| Model | Event: `/conf/pensionsbc-base/settings/dam/cfm/models/event` |
| Fragments | `/content/dam/pensionsbc-base/<site>/events/<event>` |
| Tags | `pensionsbc:event-type/webinar`, `pensionsbc:event-type/in-person` (PensionsBC > Event type) |
| Persisted query | `pensionsbc-base/event-by-path` |

## One-time AEM setup (all sites)

Do these in order. Steps 1, 2 and 4 are in the AEM UI; step 3 installs the package.

### 1. Turn on Content Fragment models and GraphQL for the configuration

1. **Tools > General > Configuration Browser**, select **pensionsbc-base**, then **Properties**.
2. Check **Content Fragment Models** and **GraphQL Persisted Queries**. Save.

If there is no `pensionsbc-base` configuration, the sites use a different one: tell the developer its
name (it goes in `scripts/aem-config.js` and the package builder).

### 2. Create the Event model

**Tools > General > Content Fragment Models > pensionsbc-base > Create**, title **Event**. Add these
fields. The **Property Name** of each must be exactly as shown (the page code and the package use them).

| Field type | Field label | Property Name | Settings |
|---|---|---|---|
| Single line text | Title | `title` | Required |
| Date and time | Start date | `startDate` | Type: **Date** (no time) |
| Single line text | Duration | `duration` | e.g. "75 minutes" |
| Single line text | Location | `location` | e.g. "Online, live" or "In person, Victoria. …" (added 2026-10-22) |
| Multi line text | Description | `description` | Default type: **Plain text** |
| Single line text | Registration link | `registrationUrl` | |
| Single line text | Link text | `linkText` | e.g. "View available dates" |

Save. Make sure the model is **Enabled** (Content Fragment Models list: select it, **Enable** if shown).

### 3. Install the events package (per site)

**Tools > Deployment > Packages > Upload Package**, choose `tools/aem-assets/<site>-events-package.zip`
(e.g. `college-events-package.zip`), then **Install**. It creates:

- the tags Webinar and In person under PensionsBC > Event type (existing tags are kept);
- the folder `/content/dam/pensionsbc-base/<site>/events`, set to use the pensionsbc-base configuration
  so authors can create Event fragments there;
- one Event fragment per event in `tools/aem-cf/events/<site>.json` and the source page's webinar
  listing, tagged with its type. Reinstalling replaces these fragments (edits made to them in AEM are
  lost); other fragments in the folder are untouched.

Install it after step 2: the fragments refer to the Event model.

### 4. Save the persisted query

1. **Tools > General > GraphQL**: if there is no endpoint for pensionsbc-base, **Create** one (name
   `pensionsbc-base`, configuration pensionsbc-base).
2. **Tools > General > GraphQL Query Editor**, endpoint **pensionsbc-base**. Paste:

   ```graphql
   query ($path: String!) {
     eventByPath(_path: $path) {
       item {
         _path
         title
         startDate
         duration
         location
         description { plaintext }
         registrationUrl
         linkText
       }
     }
   }
   ```

3. **Save As**: `event-by-path`.

### 5. Publish

Publish, in this order: the **Event** model, the **Webinar** tag (Tools > General > Tagging), the
GraphQL endpoint, the persisted query (**Publish** in the query editor), then the fragments (Assets >
the events folder > select > **Quick Publish**). Then publish the page and preview it.

Published fragment changes can take a few minutes to show on the site: the query response is cached.

**Testing the query outside a browser:** always send an `Origin` header, e.g.
`curl -H "Origin: https://main--pensionsbc-college--chrissands.aem.page" "<url>"`. The AEM CDN caches a
response to a request without `Origin` with no CORS headers and no `Vary: Origin`, and serves that copy to
browsers too, so the event is missing on the sites until the cache expires (`s-maxage`, 2 hours).
Variables go in the URL as one encoded segment: `event-by-path%3Bpath%3D%2Fcontent%2Fdam%2F...`.
"Not found" responses (a fragment requested before it was published) are cached for 2 hours too.
To make the sites skip every cached response at once, change `QUERY_CACHE_VERSION` in
`scripts/aem-config.js` (it is sent as `?v=`) and merge.

## Authoring

- **New event:** Assets > `/content/dam/pensionsbc-base/<site>/events` > **Create > Content Fragment**,
  model Event. Add the **Webinar** tag (or another event type) in the fragment's properties. Publish.
- **On a page:** in Universal Editor add an **Event List** block to a section, add an **Event** item per
  event and pick its fragment. The block shows the fragments in the order of the items. A fragment that
  can't be loaded shows its path in Universal Editor and is left out on the site.
- **Swap per audience:** on an Event item, set **Swap for audience** (Local or Online) and pick
  **Fragment for that audience**. Visitors in that audience see that fragment in the item's place;
  everyone else sees the first one. If the audience's fragment can't be loaded, the first one shows.
  In Universal Editor both are shown, the audience's one outlined and labelled with the audience.

## Audiences

A visitor's audience comes from the link they arrive on and lasts for the visit (`scripts/audience.js`):

- `…/en/learning-resources?audience=local`: local visitors, e.g. from a regional email campaign;
- `…?audience=online`: online visitors;
- `…?audience=` (empty): clears it.

To demo, open the page with and without `?audience=local`. Audiences are a value list in the Event item
model (`blocks/event-list/_event-list.json`); add an option there for a new audience.

## Rebuilding the package

The events come from `tools/aem-cf/events/<site>.json` (the demo events, including in-person versions;
`type` is `webinar` or `in-person`) and the section import report
(`tools/importer/reports/<site>/en/*.report.json`, field `events`); the events file wins for the same
slug. After editing the events file or a re-import:

```bash
node tools/aem-cf/build-events-package.mjs <site>   # -> tools/aem-assets/<site>-events-package.zip
```

The source only shows weekday, month and day; the year is the first year (from the page's save date)
in which that day is that weekday.
