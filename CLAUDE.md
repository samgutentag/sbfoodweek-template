# sbfoodweek-template

Source of truth for the SB food-week event maps (burger, coffee, sandwich,
burrito, …). Event repos are created with GitHub's "Use this template" and
stay aligned by file-based sync — never by git merge (no shared history).

## Ownership model

**Template-owned** (synced wholesale into event repos; listed in
`template-manifest.json`): `app.js`, `track.js`, `event-state.js`,
`style.css`, `index.html` and the other page shells, `stats/`, `admin/`,
`embed/`, `workers/track/index.js`, `.github/workflows/`, `apply-theme.py`,
`fetch-*.py`, `snapshot-hourly.*`, `scripts/`, icons, `data-template.js`.
Fix bugs HERE, then sync outward — never patch shared code in an event repo.

**Event-owned** (never synced): `config.js` (values only — no functions;
behavior lives in `event-state.js`), `data.js` + `data-<year>.js`,
`hours.json`, `place-ids.json`, `workers/track/wrangler.toml`, `CNAME`,
`og-image.*`, `snapshots/`, `docs/` history.

**Registry** (`registry/restaurants.json`): canonical venue database — areas
+ every restaurant's coordinates, contacts, and manually captured Apple/Google
Maps links, with participation history. Lives only here. `scripts/registry.py`
seeds it, prefills new events (`pull`), and absorbs event data back
(`writeback`).

## Data contract

See the header of `data-template.js`. Short version: every data file defines
`SOURCE_URL`, `AREA_COLORS`, `restaurants`; every restaurant carries the full
field set plus one boolean per active `tagFilters` key; `data.js` is the
pre-launch skeleton (empty `menuItems`).

## Event lifecycle

- **Start**: `python3 scripts/start-event.py` (validates everything, applies
  theme, prints the manual remainder). Workflows self-activate inside the
  event window via `scripts/workflow-gate.py` — never edit their crons.
- **Stop**: `python3 scripts/wind-down.py` (archives hourly data FIRST, then
  flips `archived: true`). Worker writes self-disable 6 days after
  `EVENT_END` (wrangler var, written by `apply-theme.py`).
- `getEventState()` phases are anchored to `THEME.timeZone`, not the
  viewer's clock. `archived`, not `trackUrl`, is what means "off-season".

## Gotchas learned the hard way

- Cloudflare 403s Python-urllib's default User-Agent — scripts set their own.
- Analytics Engine samples under load: always `SUM(_sample_interval)`,
  never `SUM(1)`.
- The Web Analytics GraphQL `siteTag` is NOT the beacon token
  (see `workers/track/wrangler.toml`).
- `new Date("YYYY-MM-DDTHH:MM:SS")` parses in the viewer's timezone — use
  `eventDate()` from `event-state.js` for any event-boundary math.

## Local dev

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Skeleton data renders by default (fresh checkout has no `data-<year>.js`;
loaders fall back to `data.js`). `mock_data.js` has realistic fake venues —
copy it over `data-<year>.js` to exercise menus/filters. On localhost the
"eyes" layer simulates ambient viewers by design.
