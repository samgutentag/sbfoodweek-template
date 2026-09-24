# around805.com food weeks: single-repo design

Drafted 2026-09-23. Execution happens in a later session. The redirect side
is in `migration/around805-migration.html`.

## Goal

One repository serves every food week map at
`around805.com/<type>week<year>`. It covers burger, coffee, sandwich, burrito,
and any type added later.

- Shared code (map, styling, stats, embed, admin) exists once. Bold the header
  and every event gets the change.
- A new event is a small config folder: the year, the dates, the list of
  restaurants, and any contact changes. No code.
- Every past event stays reachable forever. In 2030,
  `around805.com/burritoweek2026` still shows Burrito Week 2026.
- `around805.com/burritoweek` always loads the newest available year of
  that type (see "Latest-year aliases").

## Decisions

1. **This repo becomes the monorepo.** It already holds the shared code and
   the venue registry. The event repos get imported, then archived on GitHub.
   `sync-from-template.py` and `template-manifest.json` go away, because
   nothing is copied between repos anymore.
2. **One page shell, stamped per event at build time.** The page is one
   file. A build step writes a copy of it for each event with that event's
   slug and link-preview tags filled in. At runtime the code reads the slug
   and loads that event's data. A single runtime-routed page won't work for
   two reasons. A static host needs a real file at `/burritoweek2026/`, or it
   answers 404. And iMessage, Slack, and Facebook previews only read tags in
   the HTML itself. Today's pages set them with JavaScript, so previews
   already miss them.
3. **Host on Cloudflare, deploy from GitHub Actions.** around805.com already
   lives there, and Cloudflare's static hosting reads a `_redirects` file
   from the build. That keeps the latest-year aliases in the repo and out of
   the dashboard. GitHub Pages can't do this.
4. **Archived events render with current code, and CI protects them.** Every
   commit builds and smoke-tests every event, past ones included. A change
   that breaks Coffee Week 2026 fails the build before it ships. If a future
   change truly can't support old data, the escape hatch is pinning that one
   event to a frozen copy of the app (see "Keeping old events alive").

## Repo layout

```
app/                         shared code, the only place styling and behavior live
  index.html                 page shell (one file, stamped per event by the build)
  app.js  style.css  event-state.js  track.js
  stats/  embed/  admin/
types/<type>.json            per food type: name, emoji, item labels, tag filters,
                             OG lines, default map center
events/<slug>/event.json     per event: type, year, dates, source article,
                             dataLiveDate, archived, draft, trackUrl
events/<slug>/restaurants.json
                             venue ids from the registry, plus this event's
                             menu items, tags, and any contact overrides
events/<slug>/snapshots/     baked at wind-down (hourly data, tracking snapshot)
registry/restaurants.json    canonical venues: coordinates, contacts, map links (exists)
build.py                     events + types + registry  ->  dist/
```

A new year of an existing type is a copy of last year's folder, with the year,
dates, and restaurant list edited. Contacts come from the registry, so fixing a
phone number once fixes it for every future event.

## Build output

```
dist/
  index.html                 around805.com landing: every event, newest first
  _app/                      shared JS and CSS, one copy for all events
  burritoweek2026/
    index.html               shell with slug + OG tags stamped in
    event.js                 merged type + event + registry data
                             (what config.js + data-2026.js are today)
    stats/  embed/  admin/   stamped shells, same as the main page
    snapshots/
  _redirects                 latest-year aliases, generated (see below)
```

`/admin/` is only emitted for events that are not archived.

## Latest-year aliases

`around805.com/burritoweek` always loads the newest available Burrito Week.
Today that's 2026. Once `events/burritoweek2027/` ships, the same URL loads
2027, and 2026 stays at `/burritoweek2026`.

- **"Available" means the event folder exists and `event.json` doesn't set
  `"draft": true`.** Merging next year's folder flips the alias on that
  deploy. The pre-launch skeleton (venues, no menus) counts, so the alias
  moves when the event is announced, not when it ends. To stage next year
  without flipping the alias, set `draft` and the page builds at its own URL
  without taking over the alias.
- **`build.py` computes the aliases.** For each type it takes the highest
  non-draft year and writes one `_redirects` line:
  `/burritoweek/* /burritoweek2027/:splat 302`. Nobody edits the aliases by
  hand, so they can't go stale. Deep links follow too:
  `/burritoweek/stats/` lands on `/burritoweek2027/stats/`.
- **Redirect, don't serve in place.** The address bar ends on the year URL,
  so a bookmark or shared link from inside the page points at that specific
  year. The alias uses 302 because browsers cache a 301 and would keep
  sending people to last year.
- **The landing page follows the same rule.** `around805.com/` lists each
  type's newest event first, with past years under it.
- **CI checks it.** The smoke test requests every `/<type>week` alias and
  asserts it lands on the highest non-draft year for that type.

## Code changes the migration needs

1. **Year comes from the event, never the clock.** `index.html:343` loads
   `data-<current year>.js`, and `app.js:38` and `app.js:2557` fall back to
   `new Date().getFullYear()`. In 2030, Burrito Week 2026 would ask for 2030
   data. All three read the year from `event.json` instead.
2. **No root-absolute links.** Seven `href`/`src` values in `index.html`,
   `embed/index.html`, and `embed/map/index.html` start with `/stats` or
   `/embed`. Those resolve to `around805.com/stats`, which doesn't exist.
   Make them relative. The JS-built links already use `THEME.siteUrl` and
   work as-is.
3. **Shared assets load from `_app/`.** Each stamped shell points at
   `../_app/...`, and at `../../_app/...` for the stats, embed, and admin
   shells.
4. **One browser origin for every event.** `storageKey` is derived as
   `around805-<slug>`, never hand-set, so two events can't collide.
5. **One tracking Worker, not one per event.** An `around805-track` Worker
   tags every write with the event slug and only accepts writes for events
   inside their window. Web Analytics also becomes one site for all of
   around805.com, so its queries filter by path prefix. Archived events never
   call the Worker. Their stats read `snapshots/`, as they do today.

## Keeping old events alive

- **Data contract version.** `event.json` carries `schema: 1`. When the data
  shape changes, `build.py` upgrades older schemas while building, so the
  files on disk for past events never need hand edits.
- **CI builds every event on every commit** and runs a headless smoke test
  per event. The page loads with no console errors, the marker count matches
  `restaurants.json`, and archived stats render from snapshots.
- **Frozen escape hatch.** `"appVersion": "<git tag>"` in an event's
  `event.json` makes the build serve that event with the shared code from
  that tag. It's for the rare breaking change, not the default.

## Migration order (next session)

1. **Restructure this repo** into `app/`, `types/`, `events/`, and
   `build.py`. Bring in Burrito Week 2026 first. It launched 2026-09-24 from
   the `burritoweek2026` repo on an interim Worker (route
   `around805.com/burritoweek2026*`), so importing it is a like-for-like
   swap. Delete that Worker and route when around805.com attaches to the new
   project. Make the code changes above. Check `feat/subpath-hosting` first:
   it already makes the root-absolute links relative and adds
   `basemapTiles()` with a CARTO API key and OSM fallback (CARTO raster tiles
   need a key since 2026-09-23).
2. **Stand up hosting.** Create the Cloudflare project and the Actions deploy
   with the build and smoke test. Test on the preview URL. around805.com's
   Phase 1 redirects keep working the whole time.
3. **Import burger, coffee, and sandwich 2026.** Bring over each repo's
   `config.js`, `data-2026.js`, `snapshots/`, and `tracking-snapshot.js`.
   Compare each preview page against its live old domain.
4. **Point around805.com at the new site** and retire the gutentag.world
   catch-all. The root becomes the event landing page.
5. **Cut over one event at a time** with the runbook's Phase 2. Remove its
   Phase 1 entry, then proxy the old domain.
6. **Retire** the event repos (archive on GitHub), the per-event Workers,
   `sync-from-template.py`, and `template-manifest.json`. Update the README,
   the CLAUDE.md, and `docs/event-runbook.md` to the new lifecycle.

## Open question

Sandwich Week 2025 appears in the registry, but `sbsandwichweekmap.com` now
serves 2026. `sandwichweek2025` needs its data and snapshots recovered from
that repo's git history. Without them, it gets no page.
