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
