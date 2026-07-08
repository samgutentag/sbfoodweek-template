# Wind-Down Runbook

Reusable post-event shutdown reference. `scripts/wind-down.py` automates the
ordered steps; this doc explains what "safely dark" means and how to verify it.
(Adapted from the SB Coffee Week 2026 wind-down audit.)

## Order matters

Archive **before** disabling: `snapshot-hourly.py` and the final tracking
snapshot need a live `trackUrl`. Nulling the config first permanently strands
the stats charts with no data source.

1. Run the final snapshot workflow (`gh workflow run "Snapshot Tracking Data"`)
2. `./snapshot-hourly.sh` — commit `snapshots/hourly-events.json` + `hourly-labels.json`
3. Set `cfAnalyticsToken: null` and `archived: true` in `config.js`
4. `python3 apply-theme.py`
5. Deploy the Worker if vars changed (`cd workers/track && wrangler deploy`) —
   POST writes self-disable after `EVENT_END` + grace, so this is usually a no-op
6. Commit and push

`trackUrl` may stay set after wind-down: it only names the Worker so the
stats/admin pages can keep reading historical aggregates. Event state comes
from `archived`, not from `trackUrl`.

## API call audit — what "safely dark" means

Every outbound call is gated. After wind-down, confirm each guard:

| Component | File | Guard |
|---|---|---|
| Tracking beacon | `track.js` | `THEME.trackUrl` null **or `THEME.archived`** → `window.track` never defined; LAN hosts always skipped |
| Upvote fetch (map + embed) | `app.js`, `embed/map/embed.js` | `if (THEME.trackUrl)` |
| Live activity / eyes polls | `app.js`, `stats/stats.js` | `THEME.archived \|\| !THEME.trackUrl` → no poll; loops also re-check the clock every tick (`canCastVotes()` / `getEventState()`) and clear their own timers past the grace window — this is what stops tabs cached during the event, which never see a redeployed `archived` flag. Background tabs skip polls (`visibilityState`), and a `{ disabled: true }` answer from the Worker kills the timer too |
| Hourly chart fetches | `stats/stats.js`, `stats/trends/trends-tab.js` | concluded events read `snapshots/hourly-*.json` instead of the Worker |
| Detail/RUM/admin fetches | `stats/stats.js`, `admin/admin.js` | `if (!THEME.trackUrl) return` |
| CF Web Analytics beacon | all `*.html` | removed by `apply-theme.py` when `cfAnalyticsToken` is null |
| Worker POST writes | `workers/track/index.js` | refuses writes after `EVENT_END` + grace window; live-only GETs (`?eyes`, `?active`) answer `{ disabled: true }` past the same cutoff |

## Verify

Serve locally, open the site with DevTools' network panel: zero requests to the
Worker or Cloudflare beacons from the main map; stats pages read only committed
snapshot files. Then check the live domain the same way after pushing.

## Delete the Worker

Once the verify pass shows the archived site reads only committed snapshots,
the Worker has no remaining job:

    cd workers/track && npx wrangler delete

The AE dataset lives on the account, not in the Worker, so `pull-data.sh` and
`generate_report.py` still work after deletion. `wrangler deploy` (plus
re-adding the `CF_API_TOKEN` secret) restores it any time. Stale tabs cached
during the event self-stop on their own clock checks, so deletion is tidiness
and defense in depth, not a requirement — but SB Sandwich Week 2026 showed a
single forgotten tab polling a live Worker ~2,000×/day for a week after the
event, so tidy up.
