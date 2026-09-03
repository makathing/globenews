# GlobeNews // Orbital Watch

A 3D news radar: Earth from space with pulsing, color-coded blips marking world news hotspots.
The dataset is produced by a multi-agent Claude pipeline that batches once every 24 hours, with an
hourly breaking-news monitor that only publishes when something of **global scale** (or affecting
the **entire US**) happens.

## How it works

```
                       ┌────────────────────────────────────────────┐
                       │        pipeline/ (Claude Agent SDK)        │
  Claude cloud Routine │                                            │
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

## Scheduling & billing: tokenless Claude cloud Routines

The pipeline is scheduled as **Claude Code cloud Routines** on the repo owner's Claude
account — no API key, no tokens stored in GitHub, usage billed to the owner's Claude
subscription:

- **GlobeNews daily news batch** — every day at 06:00 UTC: full multi-agent batch, commits
  `data/` to the branch it ran on.
- **GlobeNews breaking-news monitor** — hourly at :30: cheap sweep, commits only when a
  global-scale / entire-US event is verified.

Each firing spawns a fresh cloud session in this repo's environment that checks out `main`
(falling back to the feature branch pre-merge), runs the pipeline with the session's own
account credentials, and pushes only `data/` changes. A data push to `main` triggers the
Pages deploy workflow. Manage the Routines (pause, edit schedule, view run history) from
the Routines panel on claude.ai / the Claude app.

### How long a story stays

A story is not dropped just because the next batch did not mention it. Each event carries an
`expiresAt` set from its severity — 24h for a minor item, 36h / 48h / 4 days as it climbs, a week
for a severity-5 event — and stays on the map until then. `firstSeen` is when it was added and
never moves; `lastUpdated` moves only when a run re-reports it, which also resets the clock.

The coordinator is told what is already on the map, so a development gets reported as an update
(`"updates": "<id>"`) rather than a near-duplicate; the runner keeps the story's id and added
time, replaces the text, and unions the sources. When the agent forgets, a conservative fuzzy
match (same category, within 250 km, similar headline) catches a rewording — not a re-angled
story, which would risk swallowing a genuinely separate one; a missed match costs a duplicate for
a day, a false one loses a story. `stats.carried`, `updated` and
`expired` record what each run did. The rule lives in `shared/retention.ts` so the frontend fades
a story over the same span the pipeline keeps it.

### Why image enrichment happens at deploy time

Resolving article previews needs **internet, not intelligence**: it is `fetch`
plus a regex, with no model call and no API key in the path. The agent pipeline
runs on the owner's Claude subscription in an environment that cannot reach news
publishers, so that half resolves nothing and — by design — says nothing about
it. `deploy.yml` runs the same `enrichImages` pass on a runner with open egress.
The thinking stays tokenless; only the fetching moved.

It runs **in the build, and never commits**. Preview images are presentation,
not data: derived, best-effort, re-derivable at any time. `prebuild`'s
`copy-data.mjs` copies the enriched file into `public/`, and `vite-plugin-seo`
reads the same file for per-story `og:image`. The repo holds news; the build
adds art.

That boundary is load-bearing. Enrichment used to be its own workflow that
committed to `data/`, which collided with every pull request touching the
dataset — and since GitHub refuses to trigger workflows from a `GITHUB_TOKEN`
push, it also needed a `workflow_run` trigger on `deploy.yml` just to reach the
site. Both problems were caused by writing derived output back into the repo.
Neither exists now.

The tradeoff: builds are not byte-identical, since publisher availability
varies between deploys. The UI already degrades article image → outlet icon →
outlet name, so absence is handled; two deploys of one commit can simply differ
in how much art they carry.

Each pipeline run still records what it produced in `data/events.json` under
`stats`, and the UI shows dataset age rather than an unconditional LIVE badge —
a run that resolves nothing should not look like a run that had nothing to
resolve.

Aside from that, there are **no scheduled GitHub Actions workflows** — only `deploy.yml`
remains, which needs no Anthropic credentials. If you ever prefer GitHub-hosted scheduling,
restore the workflows from git history (`daily-batch.yml` / `breaking-monitor.yml`,
removed in the "tokenless scheduling" commit); they support `CLAUDE_CODE_OAUTH_TOKEN`
(subscription, via `claude setup-token`) or `ANTHROPIC_API_KEY` secrets.

Budget caps (`PIPELINE_MAX_BUDGET_USD` ~$8/batch, `MONITOR_MAX_BUDGET_USD` $0.50,
`ESCALATION_MAX_BUDGET_USD` $3) act as estimated-cost circuit breakers in every mode.

## Setup (one time, after merging to `main`)

1. **Enable Pages**: repo → Settings → Pages → Source: **GitHub Actions**.
2. The Routines above are already scheduled; the first daily batch replaces the bundled
   sample dataset. To force one now, fire the "GlobeNews daily news batch" Routine from
   the Routines panel.

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
| `.github/workflows/` | `deploy` (Pages build; scheduling lives in cloud Routines) |
