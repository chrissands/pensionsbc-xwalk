# Experimentation (A/B tests)

AEM Contextual Experimentation on the PensionsBC sites:
[Experience League](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/sites/contextual-experimentation).

An experiment is page-level (one per page): a **control** (the page) and one or more **challengers**
(copies of the page with one change). Visitors are split between them; results come from the sites'
Operational Telemetry (RUM), and the goal is **conversion**: clicks on the page.

## What is installed

| Part | Where |
|---|---|
| Engine | `plugins/experimentation`, [adobe/aem-experimentation](https://github.com/adobe/aem-experimentation) **v2.0.0** (git subtree) |
| Loader | `scripts/experiment-loader.js` (from the engine README) |
| Wiring | `scripts/scripts.js`: `runExperimentation` in `loadEager` (before the page is decorated), `runExperimentationLazy` in `loadLazy` |
| Sampling | `head.html`: pages with an experiment record 1 visit in 10 for RUM (default 1 in 100) |

- Shared by all six sites, but **off unless a page has an experiment**: other pages load none of the
  engine.
- `prodHost` is the site's `aem.page` demo host (the sites never go live), so results are read from
  the demo's visits. The engine treats `*.page` as preview, so its preview tools load there on
  experiment pages; in Universal Editor the panel is the A/B extension (`simulationUI`).
- The variant a visitor gets is kept for the visit (session storage).

Updating the engine (v2 is on the engine's `main` branch; there is no `v2` branch any more):

```bash
git subtree pull --squash --prefix plugins/experimentation https://github.com/adobe/aem-experimentation.git main
```

## Running an experiment (Universal Editor)

1. Open the page in AEM Sites and **Edit** it in Universal Editor. If there is no **A/B** icon,
   enable the A/B extension in the Extension Manager (or request it for the organization).
2. **A/B** > **Create New**: name the experiment (type A/B test, goal Conversion).
3. **Add New** challenger: a copy of the page. Edit the copy in context and make **one** change.
4. Back in the panel: traffic split (50/50 to start), optional start and end dates.
5. **Save as draft**, then **Activate** (publishes the challenger and starts collecting data).
6. Preview the page from Sidekick.
7. When the results are significant, **Promote** the winner: it becomes the control.

Checking each variant: add `?experiment=<experiment-id>/control` or
`?experiment=<experiment-id>/challenger-1` to the page URL (the id is the experiment name in lower
case with hyphens, e.g. `hero-task-links`).

The engine reads the experiment from page metadata: `experiment`, `experiment-variants`,
`experiment-split`, `experiment-status`, `experiment-start-date`, `experiment-end-date`. **To verify
on the first draft:** the previewed page's `<head>` must have `<meta name="experiment">` and
`<meta name="experiment-variants">`. If AEM does not output them, the page model
(`models/_page.json`) needs fields for them (as with `breadcrumbs`).

## First experiment: College homepage hero task links

- Page: `college/en/index` (demo https://main--pensionsbc-college--chrissands.aem.page/en/)
- Area: the "What can we help you with?" panel in the hero (three task links).
- Challenger ideas (pick one): reword the heading ("How can we help you today?"); reorder the
  links (payment dates first); add a fourth link, "I want to see my pension details" → Sign in to
  My Account.
- Measure: clicks on the panel's links.

Other candidates: tile button wording ("Read the report" / "See the 2025 highlights"), the
buying-service tile as an embedded video or a thumbnail and link, tile order (the survey tile is out
of date), Learning resources "View available dates" / "Register for a session".

## Cautions

- **Don't push a page that has an experiment** with the migration tool's push button: the push
  replaces the page (`jcr:content`), which removes the experiment.
- **Challengers are copies:** later edits to the control are not copied to them. Keep experiments
  short, or edit both.
- **Header and footer are separate pages** (nav, footer): a page experiment cannot change them.
- **Demo traffic is low:** results will not reach significance; the demo shows the set-up, the
  variants and the panel.
- **Names the engine reserves:** section settings and page metadata named `experiment…`,
  `campaign…` or `audience…` are read by the engine on experiment pages. The sections' **Show to**
  setting is stored as `show-to` for that reason. It was `audience`, which crashed the engine (blank
  page) in the local preview, where section settings are a Section Metadata table; AEM delivers them
  as attributes (`data-audience`), which the engine doesn't read, and pages saved with the old name
  still work. The page model's empty `audience` placeholder field
  should be renamed before anyone fills it in on a page with an experiment.
- Location audiences (in BC / outside BC, `scripts/audience.js`) are separate from experiments and
  work alongside them.
