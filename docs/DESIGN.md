# ARGUS Design System (Phase 1)

ARGUS UI is built on CSS variables and `.ui-*` utilities in `app/globals.css`. Components should prefer tokens over inline hex.

## Workflow navigation

Header lanes mirror the analyst loop:

| Lane | Purpose |
|------|---------|
| **Collect** | Sources, topic, live feeds |
| **Triage** | Feed filters, cases, incidents, watch rules, anomalies |
| **Analyze** | Canvas, chronology, map replay, country context, velocity, forecasts |
| **Output** | Export, brief history |
| **Advanced** | Ledger, dev perf overlay |

Search (⌘K) and Alerts stay top-level.

## Typography

- **Kicker** (`.ui-kicker`) — lane or section label, 9–10px uppercase. Use in panel headers above the title.
- **Title** (`.ui-title`) — primary panel heading.
- **Subtitle** (`.ui-subtitle`) — secondary hint under the title (e.g. “Density view — does not filter map”).

## Primitives (`components/ui/`)

| Component | Use when |
|-----------|----------|
| `PanelShell` | Modal or rail with kicker + title + actions + optional footer |
| `TimeTrack` | Histogram + event markers + scrub cursor (timeline & scrubber) |
| `SegControl` | Mutually exclusive pill options (time window, scrubber speed) |
| `EmptyState` | Icon + title + hint + optional CTA |

## Time controls

**Chronology** (`TimelinePanel`) — density dossier; scrubbing filters the strip only, not the map.

**Map replay** (`TimelineScrubber`) — drives `mapStore.playback`; filters visible map events.

Both share identical track interior via `TimeTrack` and `.ui-time-track-*` classes.

## Severity

Use `--critical`, `--high`, `--medium`, `--low` and matching `--sev-*-bg` / chip classes. Never hardcode severity hex in new components.

## Panel types

1. **Rail** — `panel-right` / `panel-left` (feed, country, alerts)
2. **Dock** — bottom panels (chronology, map replay)
3. **Overlay** — `ui-modal-overlay` + `ui-command-palette` (export, settings)

## Map dock

- Bottom center: live ticker **or** map replay scrubber (never both)
- Bottom left: map query bar
- Right: layer controls (in `ArgusMap`)

## Intel cards

`.ui-intel-card` — brief blocks (country panel, share page). Accent variant: `.ui-intel-card--accent`.

## Spacing

8px grid via `--space-1` … `--space-8`. Panel header padding: `--space-3` / `--space-4`.
