# ARGUS — Intelligence watch

> Watch a topic. Collect events. Save research. Read AI briefs.

ARGUS is a map-first intelligence app: pick a region and a question, pull in GDELT/RSS/your own clips, triage the feed, and generate briefs.

**Desktop** — full workspace: Map, Events, Research, Canvas, and more (⋯ menu).  
**Mobile** — project list → tap a project → AI brief history only (no map workspace).

Enable **Analyst tools** in Settings → App for velocity, ledger, incidents, and other pro panels (off by default).

Clone from GitHub and run — the map works **without** Mapbox (free OpenStreetMap via MapLibre). Add Mapbox later for a richer basemap; add AI keys only if you want generative briefs (rules briefs work without them).

Cloud operators: run all SQL in [`supabase/MIGRATIONS.md`](supabase/MIGRATIONS.md) before relying on journal sync, brief history, plots API, or snapshots.

---

## What's new (June 2026)

- **Analyst canvas** — import events, link them, run ACH (competing hypotheses), tidy layout, assessment brief
- **Cases** — bundle events; push a whole case to the canvas in one click
- **Feed ↔ canvas** — add events from feed/map/detail; events persist to the project so canvas cards survive refresh
- **ACH quick-start** — starter hypotheses from your project type; toasts when AI scoring/brief is unavailable
- **Export** — Markdown/PDF reports include canvas, cases, plots, forecasts; CSV/GeoJSON for forecasts and plots
- **Forecasts on project** — probabilistic claims sync with cloud backup (separate from formula **Ledger**)
- **Map plots** — scoped per project; hydrate from `project.plots` on load
- **Share snapshots** — public links include research question, cases, canvas summary, and optional AI assessment
- **Timeline scrubber** — docked on the map; replay events (and vessel/aviation snapshots) through time
- **Workspace AI** — briefs pull full source text, cases, ACH, plots, forecasts (not generic chat)
- **AI intelligence brief** — Export + PDF include IC-style assessment; country panel brief; canvas brief
- **Brief history** — briefs + NLQ answers auto-save; cloud mode syncs to Supabase (`intel_briefs`, `nlq_history`)
- **Demo fallback** — off by default (`NEXT_PUBLIC_DEMO_FALLBACK=true` for tagged sample events)
- **Demo projects** — off by default (`NEXT_PUBLIC_DEMO_PROJECTS=true` to pre-seed home screen)
- **IOC paste** — detected entities go straight to the canvas (legacy investigation graph removed)
- **UI pass** — workflow nav (Collect / Triage / Analyze / Output), unified `TimeTrack` for Chronology + Map replay, shared primitives (`PanelShell`, `SegControl`, `EmptyState`), design tokens in `docs/DESIGN.md`

---

## Getting started

### Prerequisites

[Node.js](https://nodejs.org) v18+.

### Install & run

```bash
git clone https://github.com/zachary-adam/Argus-OSINT.git
cd Argus-OSINT
npm install
cp .env.example .env.local
# Map works with zero keys. Optionally add Mapbox / AI / Serper later.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `NEXT_PUBLIC_MODE=cloud`, sign in via GitHub.

---

## Environment

### Required

**Nothing to start.** The map uses a free OpenStreetMap basemap (MapLibre) when Mapbox is unset. AI is optional — rules-based briefs still run.

**Session secret** — only if you set `ARGUS_PASSWORD`:

```bash
openssl rand -hex 32
```

```env
ARGUS_SESSION_SECRET=<output>
```

### Optional

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Richer Mapbox basemap + 3D terrain (skip = free map) |
| `ARGUS_PASSWORD` | Password-protect your instance |
| `VAULT_MASTER_KEY` | Encrypt API keys saved in the in-app Vault |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Enrich, verify, NLQ, ACH scoring, canvas brief (optional) |
| `ACLED_EMAIL` + `ACLED_PASSWORD` | ACLED conflict & protest events |
| `AISSTREAM_API_KEY` | Live vessel tracking (maritime/conflict projects) |
| `NEXT_PUBLIC_SUPABASE_*` + `NEXT_PUBLIC_MODE=cloud` | Accounts + cross-device sync |

See `.env.example` for the full list.

---

## Day-to-day workflow

```
1. Create a project   → name, region, research question
2. Set your topic     → keywords, entities, place filter
3. Add sources        → paste articles, scrape URLs, turn on GDELT/RSS
4. Watch the feed     → filters, NLQ (⌘K), saved monitors
5. Triage             → incidents, cases, watch rules, correlations
6. Canvas             → events + ACH + notes → assessment brief
7. Export             → CSV, Markdown report, forecasts/plots, print/PDF
8. Share (optional)   → publish a read-only snapshot link (optional AI brief for readers)
```

### Automatic (no keys required)

- Ingest from GDELT, ReliefWeb, RSS, pasted text
- 14 correlation signals (thresholds per project)
- Anomaly detection on event rates
- NATO-style source grading; disinfo quarantine
- Live SSE refresh (~30s)

### AI helpers (optional keys)

| Feature | Where | What |
|---|---|---|
| **NLQ** | Map bar (⌘K) | Plain-language filters — "critical events in Sudan last 48h" |
| **Enrich** | Add Source | Re-geocode, pull actors, nudge severity |
| **Verify** | Event detail | Check a claim against your saved events |
| **ACH score** | Canvas | Rate events vs each hypothesis (full article text when available) |
| **Canvas brief** | Canvas | Turn canvas + ACH + workspace context into assessment |
| **AI project brief** | Export | IC-style BLUF from entire workspace (events, cases, plots, forecasts) |
| **Country brief** | Country panel | Per-country assessment with maritime/aviation + project context |
| **Timeline scrubber** | Advanced → Scrubber | Replay feed through time; Space = play, arrows = step events |

No general chat box — AI only shows up in those spots.

---

## Project templates

| Template | Typical use |
|---|---|
| Election Integrity | Violence, irregularities around polls |
| Civil Unrest | Protests, crackdowns |
| Armed Conflict | Battles, displacement, ceasefires |
| Economic Crisis | Currency, debt, sanctions |
| Political Stability | Coup risk, succession |
| Humanitarian | Displacement, aid access |

Maritime/aviation live layers turn on for maritime-security and armed-conflict templates.

---

## Data sources (default on)

| Source | Key | Provides |
|---|---|---|
| GDELT | — | Global conflict, political, social events |
| ReliefWeb | — | UN humanitarian reports |
| RSS / News | — | BBC, Reuters, Al Jazeera, regional outlets |
| ACLED | Free account | Georeferenced conflict & protest |
| Wikidata | — | Elections, offices, structured facts |

Hazard feeds (USGS, GDACS, WHO, NASA FIRMS) are off by default — set `hazardFeeds: true` in `lib/features.ts`.

> **Demo fallback:** off by default. If all feeds fail you get an empty feed (status bar shows failed sources). Set `NEXT_PUBLIC_DEMO_FALLBACK=true` in `.env.local` to inject tagged sample events for UI walkthroughs.

---

## Correlation signals

All 14 thresholds are editable per project (Alerts panel).

| Signal | Triggers when |
|---|---|
| Conflict Escalation | ≥ N conflict events in same country within T hours |
| Compound Crisis | 3+ crisis categories in one region |
| Regional Instability | Event density over threshold per 500 km² |
| Maritime Activity | Vessel clustering near conflict |
| Infrastructure Threat | Conflict within 50 km of critical infrastructure |
| Humanitarian Convergence | Multiple humanitarian events, same country |
| Political Destabilisation | Political + economic + social overlap |
| Conflict Spillover | Conflict in 2+ neighbours within 48 h |
| Cascading Failure | 3+ neighbours unstable at once |
| Sanctioned Vessel | OFAC-listed vessel near conflict |
| Military Aviation | 2+ military aircraft in 200 km zone |
| ISR Operations | Recon callsign near conflict |
| Combined Arms | Vessel + aviation + ground event converge |
| Dark Fleet | AIS-dark vessels clustering |

---

## Architecture

```
Feeds + pasted sources
        ↓
/api/events + /api/connectors/*
        ↓
/api/events/stream (SSE)
        ↓
mapStore (session) + projectStore (persisted)
        ↓
Mapbox + panels
```

- **mapStore** — live events, filters, layers, panels
- **projectStore** — projects, cases, canvas, watch rules, ledger, forecasts (`argus-projects` localStorage v3)
- **Cloud** — Supabase RLS, one row per user project; intelligence history in `intel_briefs` + `nlq_history` (run `supabase/migrations/20260622_intel_history.sql`)

---

## Hosting

**Railway** — best for always-on SSE and vessel cache.

**Vercel** — works; cold starts can interrupt SSE.

---

## Development

```bash
npm run dev        # dev server
npm run dev:clean  # wipe .next if chunks/CSS break after big changes
npm test           # vitest unit tests
npm run test:e2e   # Playwright UI + API smoke (dev server on :3001)
npm run test:e2e:ci  # same, but production build (matches CI)
npm run build      # production build
```

E2E runs in pure-local mode (no Supabase wipe). First run: `npx playwright install chromium`. If the dev cache is corrupt, `rm -rf .next` then re-run `npm run test:e2e`.

---

## Credits

Created by **[Zachary Adam](https://github.com/zachary-adam)** & **Maaz Ahmad**  
Published under **[Shama Research](https://shamaresearch.com/)**  
Contact: [hello@thezacharyadam.com](mailto:hello@thezacharyadam.com)

MIT License.
