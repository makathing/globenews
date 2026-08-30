# GlobeNews // Orbital Watch

A 3D news radar: Earth from space with pulsing, color-coded blips marking world news hotspots.
The dataset is produced by a multi-agent Claude pipeline that batches once every 24 hours, with an
hourly breaking-news monitor that only publishes when something of **global scale** (or affecting
the **entire US**) happens.

## How it works

```
                       ┌────────────────────────────────────────────┐
                       │        pipeline/ (Claude Agent SDK)        │
  GitHub Actions cron  │                                            │
  daily 06:00 UTC ──▶  │  COORDINATOR (sonnet)                      │
                       │   ├─ explorer ×4 regions (sonnet, search)  │
                       │   ├─ researcher batches (sonnet, verify    │
                       │   │    each event w/ 2+ indep. sources)    │
                       │   └─ synthesizer (opus, dedupe +           │
                       │        standardize JSON)                   │
                       │                                            │
  hourly :30 ───────▶  │  MONITOR (haiku) — extremely high bar;     │
                       │    escalates to researcher+synthesizer     │
                       │    only for global / entire-US events      │
                       └───────────────┬────────────────────────────┘
                                       │ hooks + deterministic scoring
                                       ▼
                            data/events.json  ──commit──▶  GitHub Pages
                                       ▲                       │
                            frontend/ (React + three.js) ◀─────┘
```

**Hooks (the standardization & scoring layer)** — `pipeline/src/hooks.ts`:

- **PreToolUse** on `WebSearch|WebFetch`: forces https, strips tracking params, appends recency
  qualifiers to timeless queries, and **denies** satire/fabrication domains outright.
- **PostToolUse**: rates every domain the agents touch against the bundled source table
  (`pipeline/src/source-ratings.ts`, reliability 0–100 + bias rating), injects
  `[source-intel] reuters.com reliability=95/100 bias=center` context back into the agents, and
  records everything in a run ledger.

**Hardened against real-world failure modes** (all found via live test runs):

- Subagents are pinned to `background: false` — background subagents run outside the session's
  permission/hook context (tools get denied, source-intel never fires).
- `permissionMode: 'dontAsk'` + an explicit tool allowlist instead of `bypassPermissions`
  (least privilege, and bypass refuses to run as root in containers).
- The synthesizer's staging file goes through a **salvage parser** (`parseStagedOutput`):
  over-long text is truncated, severity clamped, and broken events dropped individually —
  one malformed event never fails (and re-bills) a whole batch.
- Budget-exhaustion errors are never retried; the monitor's JSON verdict parsing tolerates
  fences and surrounding prose.
- Unrated `.gov` / `.int` domains get a high-reliability default; the ratings table covers
  the regional and state-linked outlets that real runs actually surfaced.

**Trust is computed, not vibes** — `pipeline/src/trust.ts` scores each event deterministically from
corroboration count, average source reliability, and a cross-spectrum bonus (left + right outlets
agreeing). Single-source stories are capped at 40 ("unverified"). The synthesizer never invents
trust numbers.

**Frontend** — `frontend/`: react-three-fiber globe with day/night shader, clouds, atmosphere,
Natural Earth country outlines, a starfield whose stars streak with camera velocity (plus a
full-frame motion smear), bloom, and a game-console HUD: legend filters, priority ticker,
per-event panel with trust meter and per-source bias spectrum.

## Setup (one time, after merging to `main`)

1. **Add the API key**: repo → Settings → Secrets and variables → Actions →
   `ANTHROPIC_API_KEY`.
2. **Enable Pages**: repo → Settings → Pages → Source: **GitHub Actions**.
3. Optionally trigger the first real dataset: Actions → *Daily news batch* → Run workflow.
   Until then the site shows the bundled sample dataset.

Cron workflows only run on the default branch. Budget caps default to ~$8/daily batch,
$0.50/monitor sweep, $3/escalation (`PIPELINE_MAX_BUDGET_USD` etc.) — roughly $1–4/day in
typical operation.

## Local development

```bash
npm install
npm run pipeline:daily -- --mock   # seed data/events.json with sample events (no API key needed)
npm run dev                        # globe at http://localhost:5173
npm test                           # pipeline unit tests (hooks, trust math, finalizer)
```

Run the real pipeline locally with `ANTHROPIC_API_KEY` set:
`npm run pipeline:daily` / `npm run pipeline:monitor`.

### Live diagnostics (small, cheap, real API runs)

```bash
cd pipeline
npx tsx src/smoke.ts                 # auth check (~$0.04); --search adds a WebSearch probe
npx tsx src/probe-hooks.ts           # verifies hook wiring against the live SDK (~$0.20)
npx tsx src/probe-hooks.ts --subagent#  …and that hooks fire inside subagents
npx tsx src/probe-pipeline.ts        # scoped 1-region explorer→researcher→synthesizer run (~$2)
```

The probes log to `pipeline/.staging/` and print a findings report — use them after SDK
upgrades or prompt changes before trusting a full batch.

## Repo layout

| Path | What |
| --- | --- |
| `shared/news.ts` | Single source of truth: categories, colors, dataset types |
| `pipeline/src/agents.ts` | Explorer / researcher / synthesizer / monitor prompts + models |
| `pipeline/src/hooks.ts` | Pre/PostToolUse hooks (standardization, source-intel injection) |
| `pipeline/src/source-ratings.ts` | Domain reliability/bias table + blocklist |
| `pipeline/src/trust.ts` | Deterministic trust scoring |
| `pipeline/src/run-daily.ts` | 24h batch entry point |
| `pipeline/src/run-monitor.ts` | Hourly breaking-news monitor + escalation |
| `frontend/src/scene/` | Earth, clouds, atmosphere, borders, starfield, blips, effects |
| `frontend/src/ui/` | HUD: top bar, legend, ticker, event panel, tooltip, boot |
| `data/events.json` | The dataset the globe renders (committed by the pipeline) |
| `.github/workflows/` | `daily-batch`, `breaking-monitor`, `deploy` |
