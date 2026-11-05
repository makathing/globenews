# GlobeNews // Orbital Watch

A 3D news radar: a dotted Earth from space where the dots light up in category colours wherever world news is happening.
The dataset is produced by a multi-agent Claude pipeline: a worldwide **morning edition** once
every 24 hours, a lighter worldwide **update desk** in the evening that re-checks the biggest
stories and catches what broke since, and a separate daily **US & state** batch with its own
budget that adds state and metro news without taking room from the rest of the world. A
breaking-news **monitor** for events of **global scale** or affecting the **entire US** can run
every few hours beside them (see the Routines table).

## How it works

```
                       ┌────────────────────────────────────────────┐
                       │        pipeline/ (Claude Agent SDK)        │
  Claude cloud Routine │                                            │
  daily 05:51 UTC ──▶  │  COORDINATOR (sonnet)                      │
                       │   ├─ explorer ×9 beats: 7 world areas +    │
                       │   │    science/tech/health, climate/economy│
                       │   ├─ researcher batches (sonnet, verify    │
                       │   │    each event w/ 2+ indep. sources)    │
                       │   └─ synthesizer (opus, dedupe +           │
                       │        standardize JSON)                   │
                       │                                            │
  daily 15:15 UTC ──▶  │  US & STATE COORDINATOR (sonnet)           │
                       │   ├─ explorer ×5 US regions                │
                       │   └─ same researcher + synthesizer;        │
                       │      writes only "scope": "us" stories     │
                       │                                            │
  daily 17:51 UTC ──▶  │  UPDATE DESK (sonnet) — re-checks serious, │
                       │    developing & storyline stories; one     │
                       │    explorer for what broke since morning   │
                       │                                            │
  every 3h (opt.) ──▶  │  MONITOR (haiku) — extremely high bar;     │
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
corroboration, average source reliability, and a cross-spectrum bonus. Corroboration counts
**independent newsrooms, not domains**: `pipeline/src/syndication.ts` maps every source to its
`origin`, so an AP or Reuters story reprinted by Yahoo, MSN, US News or local stations counts once,
and a citation of an outlet's homepage (not an article) counts half. The cross-spectrum bonus needs a
left-leaning and a right-leaning outlet, or three distinct center newsrooms. Stories with fewer
than two independent reports are capped at 40 ("unverified"). Carried stories are re-scored every
run, so a ratings-table change reaches the whole map. The synthesizer never invents trust numbers.

**Coverage is balanced, and checked** — the world desk's nine explorer beats each search in the
area's own languages within an explicit dated window. `finalize.ts` keeps at most four minor
stories per country (per state on the US desk) per run, and when a scope is over its cap the top
two stories of every category and the top story of every world area (`shared/areas.ts`) keep their
places first. Every run records `stats.health` — new and updated counts, categories and areas
covered, and `warnings` for a thin or lopsided run — so a bad day is visible instead of silent.
`npm run report-unrated -w pipeline` lists the outlets the agents cite that the ratings table does
not know yet.

**Stories develop, and can be corrected** — sources carry a `published` date (a new story whose
sources are all older than 72h is dropped as background). A story carries an optional `status`
(`developing`, `confirmed`, `disputed`, `corrected`); a synthesizer `corrects` entry replaces a
story and keeps its `correction` note for the rest of its life on the map. Updates record
`whatChanged` and push the previous headline onto a `timeline` (last 6). Ongoing stories share a
`storyline` (`{id, label}`), which readers can follow; minor storyline stories stay at least 72h.

**Frontend** — `frontend/`: react-three-fiber globe with day/night shader, clouds, atmosphere,
Natural Earth country outlines, a starfield whose stars streak with camera velocity (plus a
full-frame motion smear), bloom, and a game-console HUD: legend filters, priority ticker,
per-event panel with trust meter and per-source bias spectrum. Reader tools: search (`?q=`), a
briefing view, "since your last visit" badges, following places and storylines, opt-in near-me
sorting (coarse, never stored), and per-story timeline, what-changed line, corrections and
related stories.

## Scheduling & billing: tokenless Claude cloud Routines

The pipeline is scheduled as **Claude Code cloud Routines** on the repo owner's Claude
account — no API key, no tokens stored in GitHub, usage billed to the owner's Claude
subscription. All Routines fire into the same long-lived session, **"GlobeNews pipeline
runner"**, which has this repo attached: that attachment is what gives the session push
credentials (a fresh session per firing has none and gets a 403 from the git proxy). Because
they share one session, a firing that arrives while another run is still working waits for
it to finish — no two runs ever write at the same time.

| Routine | Schedule (UTC) | Runs | Budget |
| --- | --- | --- | --- |
| **GlobeNews daily news batch** | `51 5 * * *` (05:51) | `PIPELINE_GIT_SYNC=1 npm run daily -w pipeline` | `PIPELINE_MAX_BUDGET_USD`, default $10 |
| **GlobeNews US & state news batch** | `15 15 * * *` (15:15) | `PIPELINE_GIT_SYNC=1 npm run regional:us -w pipeline` | `REGIONAL_MAX_BUDGET_USD`, default $8 |
| **GlobeNews update desk** *(new — create it)* | `51 17 * * *` (17:51) | `PIPELINE_GIT_SYNC=1 npm run update -w pipeline` | `UPDATE_MAX_BUDGET_USD`, default $4 |
| **GlobeNews breaking monitor** *(optional)* | `7 */3 * * *` | `PIPELINE_GIT_SYNC=1 npm run monitor -w pipeline` | `MONITOR_MAX_BUDGET_USD` $0.50 + `ESCALATION_MAX_BUDGET_USD` $3 when it escalates |

The scripts only write files; the **Routine session** checks the result, commits `data/` and
pushes to `main` (never force). A data push to `main` triggers the Pages deploy workflow.
The old hourly breaking-news monitor Routine and an earlier fresh-session daily Routine are
**retired** (disabled, kept for their run history): a fresh session cannot push. The monitor
now re-merges onto origin and archives like the batch runs, so it is safe to schedule again in
the shared runner session; most of its firings cost only the $0.50 sweep. Manage the
Routines (pause, edit, view run history) from the Routines panel on claude.ai / the Claude app.

### Scopes: the world desk and the US desk

Every story belongs to one run's **scope**. Worldwide stories (the daily batch, and the monitor
if it is ever re-enabled) carry no `scope` field at all, so their bytes in `events.json` never
change because the US run exists; US & state stories carry `"scope": "us"`. US stories from
either run also carry an ISO 3166-2 `subdivision` (`"US-TX"`, `"US-DC"`), from the place name via
the gazetteer, else the model's, else the nearest known city's.

- A run only adds, updates, carries or caps stories in **its own scope**. Other stories pass
  through as the exact same objects; the one thing every run does to them is drop any whose
  `expiresAt` has passed.
- A staged story that matches a story in the **other** scope (named id, exact id, or the fuzzy
  headline match) is **dropped**, in both directions: the US run never duplicates a world story,
  and the world run never edits a US one. The US coordinator is shown the world desk's US
  stories as "already covered".
- Caps are per scope — **120 global, 40 US** — so neither run can push the other's stories off
  the map. The schema allows 170.
- Daily runs clear `isBreaking` on their own scope only.
- `PIPELINE_GIT_SYNC=1` (set by the Routines; off for local and mock runs): just before writing,
  the run fetches `origin/main`, fast-forwards the checkout if it is clean with no local commits,
  and re-merges **this run's scope from its own result, everything else from origin's latest**
  (`remergeScope`, pure and unit-tested). It never commits, pushes, stashes or resets.
- Archives: the daily batch writes `data/archive/<date>.json`, the US run
  `data/archive/<date>-us.json`. Archives are write-only; nothing reads them back.

### The US & state run

`pipeline/src/run-regional.ts --region us` (`npm run regional:us -w pipeline`, or
`npm run pipeline:us` at the root): five explorers (Northeast; Southeast; Midwest; South
Central & Mountain; West Coast, Alaska & Hawaii) each return their 4–6 strongest candidates for state and metro news from the last
24 hours — legislatures and governors, disasters and weather, courts, economy, health,
education, infrastructure — skipping national politics the world desk covers. The same
researcher (2+ independent sources) and severity scale apply, in at most two batches; the
coordinator stops researching once about 25 stories are verified or roughly 60% of its effort
is spent, so the synthesizer always gets to write the file inside the $8 cap. The synthesizer
aims for 20–40 stories (in practice up to 30) across as many states as possible, as
`"City, State, USA"` with a `subdivision`.
`--mock` publishes bundled sample US stories without any API call; `--remerge-only` re-merges
the last finished result (`pipeline/.staging/us.final.json`) onto the current file without
running agents, for a push that lost a race.

### Routine prompts

The daily Routine's prompt is unchanged except that step 3 reads
`` `PIPELINE_GIT_SYNC=1 npm run daily -w pipeline` `` and step 4 adds the **health check** below.

**Health check (add to step 4 of every Routine prompt):** after the existing checks, read
`stats.health.warnings` in data/events.json. If it is non-empty, still commit and push (a thin
map beats no map), but begin the final message with the single word `WARNING`, then list the
warnings, so the run history shows the bad day.

The **update desk** Routine ("GlobeNews update desk", cron `51 17 * * *`, same persistent
session) uses the US prompt below with these changes: the title line is `World update desk run.`;
step 3 runs `PIPELINE_GIT_SYNC=1 npm run update -w pipeline` ($4 default cap,
`UPDATE_MAX_BUDGET_USD`, allow up to 25 minutes; it writes `data/archive/<date>-update.json`);
step 4 requires at least one event WITHOUT a "scope" field to have `lastUpdated` equal to
`generatedAt` and that every event WITH `"scope": "us"` in `git show HEAD:data/events.json` whose
`expiresAt` is still in the future is present and unchanged; the commit message is
`data: world update desk <today's UTC date>`; and there is no `--remerge-only` path — on a
rebase conflict abort, reset to origin/main and report FAILED.

The optional **breaking monitor** Routine ("GlobeNews breaking monitor", cron `7 */3 * * *`,
same session): pull main, `npm ci`, run `PIPELINE_GIT_SYNC=1 npm run monitor -w pipeline`; if
`git status` shows changes under data/, commit only data/ as `data: breaking update <UTC time>`
and push (on rejection: `git pull --rebase origin main`, and on a conflict abort, reset to
origin/main and report FAILED). If nothing changed, reply `quiet` and commit nothing.

The US Routine ("GlobeNews US & state news batch", cron `15 15 * * *`, bound to the same
persistent session as the daily batch) uses exactly this prompt:

```text
US & state GlobeNews run.

The repository is already checked out in this session at ~/globenews on main. That attached checkout is what gives this session push credentials — a session without it gets a 403 from the git proxy — so work in it and never clone a second copy somewhere else.

1. `cd ~/globenews && git checkout main && git pull origin main`
2. `npm ci` at the repo root (npm workspace). Allow several minutes.
3. `PIPELINE_GIT_SYNC=1 npm run regional:us -w pipeline` — the budget-capped US & state batch ($8 default cap, `REGIONAL_MAX_BUDGET_USD`), on this session's own Claude credentials. If it reaches the cap after staging its stories it still publishes them (the log says "budget reached after staging") — that is a success, not a failure. It only adds, updates or expires stories with "scope": "us", and writes data/events.json plus data/archive/<date>-us.json. Allow it up to 40 minutes and do not interrupt it; it prints its own progress.
4. Check the result before committing: data/events.json parses, its `generatedAt` is within the last hour, at least 5 events have "scope": "us" and a `lastUpdated` equal to `generatedAt`, and `stats.severityDefaulted` is 0. Also compare with `git show HEAD:data/events.json`: every event there WITHOUT a "scope" field whose `expiresAt` is still in the future must be present and unchanged. If any check fails, treat the run as failed. Then read `stats.health.warnings`: if it is non-empty, carry on and publish, but begin your final message with the single word WARNING and list the warnings.
5. If `git status` shows changes under data/: commit ONLY the data/ directory with message "data: US & state news batch <today's UTC date>" and `git push origin main`. If the push is rejected: `git pull --rebase origin main`. If that stops on a conflict in data/, run `git rebase --abort`, then `git reset --hard origin/main`, then `PIPELINE_GIT_SYNC=1 npm run regional:us -w pipeline -- --remerge-only` (re-applies this run's US stories onto the new main without running any agents), then commit data/ and push again. Never force-push. The GitHub Pages deploy triggers itself on the push — do not run it yourself.
6. On any failure: commit nothing, and begin your final message with the single word FAILED, then the step number and the last ~20 lines of output. Do not retry a run that failed on budget exhaustion.

Keep this session lean, since it is shared with the daily batch and reused every day: clean up scratch files, start no background tasks, open no pull requests, and touch nothing outside data/.
```

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
`expired` record what each run did (`expired` counts only the run's own scope). A story in an
ongoing `storyline` stays at least 72h whatever its severity, so slow crises survive quiet days. The rule lives in `shared/retention.ts` so the frontend fades
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

### Illustrative photos

A story card needs a picture, and many stories' own sources carry no usable
`og:image`. For those, the site shows an **illustrative** photo of the story's
*topic* — a flooded street, a ballot box, a container port — never presented
as a photo of the event itself.

- **Topics** — `shared/topics.ts` lists ~36 topics with keywords, and
  `matchTopic()` scores a story's headline (weighted) and summary against them,
  deterministically, falling back to a per-category default. The pipeline tests
  run it over every story in `data/events.json`.
- **Library** — `data/photo-library.json` holds up to four photos per topic:
  hotlinked Wikimedia Commons thumbnails (Commons permits hotlinking) with
  title, author, licence and a link to the file page.
- **Refresh** — the *Refresh photo library* workflow (`photo-library.yml`,
  manual) runs `npm run pipeline:photo-library` on a runner that can reach
  Commons, searches each topic's queries, filters and ranks the hits
  (Commons' featured / quality / valued images first), and opens or updates a
  pull request from `photo-library/refresh`. The PR body is the rendered
  gallery (`data/photo-library.md`) so a reviewer sees every picture. Topics
  whose searches fail keep their current photos; an unreachable Commons fails
  the run without touching the file. It needs *Settings → Actions → General →
  Allow GitHub Actions to create and approve pull requests* enabled.
- **Review** — to reject a photo, add its id to `blocked` in
  `data/photo-library.json` (or delete it) before merging; blocked ids never
  come back on later refreshes. Re-running the workflow force-updates the
  review branch, so merge or close an open refresh PR before running another,
  or put blocks on the default branch first.

The rules:

- **Licences:** only CC0, public domain (including PD-\*), CC BY and CC BY-SA.
  GFDL-only, non-commercial, no-derivatives, fair-use and unlicensed files are
  refused, as are maps, logos, flags, charts, posters, portraits and
  screenshots, and anything small or not landscape.
- **Labelling:** an illustrative photo is always labelled *Illustrative* and
  credited (author, licence, link to its Commons page) wherever it appears.
- **Precedence:** a story's own article image always wins; the library is only
  the fallback.

There are **no scheduled GitHub Actions workflows** — `deploy.yml` and the manual
`photo-library.yml` need no Anthropic credentials. If you ever prefer GitHub-hosted scheduling,
restore the workflows from git history (`daily-batch.yml` / `breaking-monitor.yml`,
removed in the "tokenless scheduling" commit); they support `CLAUDE_CODE_OAUTH_TOKEN`
(subscription, via `claude setup-token`) or `ANTHROPIC_API_KEY` secrets.

Budget caps (`PIPELINE_MAX_BUDGET_USD` $10/daily batch, `REGIONAL_MAX_BUDGET_USD` $8/US batch,
`UPDATE_MAX_BUDGET_USD` $4/update desk,
`MONITOR_MAX_BUDGET_USD` $0.50, `ESCALATION_MAX_BUDGET_USD` $3) act as estimated-cost circuit
breakers in every mode. If a daily or US batch hits its cap (or its turn limit) after the synthesizer
has already written the staged stories, the run publishes those instead of failing — it logs
`[us] budget reached after staging — publishing N staged stories` and records
`stats.stoppedEarly` (e.g. `"error_max_budget_usd"`) in `data/events.json`. A cap hit before
anything was staged still fails the run, and is never retried.

## Setup (one time, after merging to `main`)

1. **Enable Pages**: repo → Settings → Pages → Source: **GitHub Actions**.
2. The Routines above are scheduled in the runner session; the first daily batch replaces the bundled
   sample dataset. To force one now, fire the "GlobeNews daily news batch" Routine from
   the Routines panel.

## Local development

```bash
npm install
npm run pipeline:daily -- --mock   # seed data/events.json with sample events (no API key needed)
npm run pipeline:us -- --mock      # add sample US & state stories on top (no API key needed)
npm run dev                        # globe at http://localhost:5173
npm test                           # pipeline unit tests (hooks, trust math, finalizer)
```

Run the real pipeline locally with `ANTHROPIC_API_KEY` set:
`npm run pipeline:daily` / `npm run pipeline:us` / `npm run pipeline:monitor`.

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
| `shared/areas.ts` | The seven world areas: explorer beats, balance and health checks |
| `pipeline/src/agents.ts` | Explorer / researcher / synthesizer / monitor prompts + models |
| `pipeline/src/hooks.ts` | Pre/PostToolUse hooks (standardization, source-intel injection) |
| `pipeline/src/source-ratings.ts` | Domain reliability/bias table + blocklist |
| `pipeline/src/trust.ts` | Deterministic trust scoring (independent newsrooms) |
| `pipeline/src/syndication.ts` | Source → origin newsroom (wire copy, aggregators) |
| `pipeline/src/report-unrated.ts` | Most-cited outlets missing from the ratings table |
| `pipeline/src/run-daily.ts` | Worldwide morning edition; `--update` for the update desk |
| `pipeline/src/run-regional.ts` | US & state batch (`--region us`) |
| `pipeline/src/batch.ts` | Shared coordinator retry loop + publish step |
| `pipeline/src/finalize.ts` | Scoped merge, per-scope caps, `remergeScope` |
| `pipeline/src/git-sync.ts` | `PIPELINE_GIT_SYNC=1` fetch + re-merge before writing |
| `pipeline/src/gazetteer.ts` | Offline place names: countries, cities, 50 states + DC |
| `pipeline/src/run-monitor.ts` | Breaking-news monitor + escalation (optional Routine) |
| `frontend/src/lib/reader.ts` | Search, since-visit, follows, briefing, near me, related stories |
| `frontend/src/scene/` | Dotted Earth with story dots and picking, starfield, sun, effects |
| `frontend/src/ui/` | HUD: top bar, legend, ticker, event panel, tooltip, boot |
| `data/events.json` | The dataset the globe renders (committed by the pipeline) |
| `shared/topics.ts` | News topics + `matchTopic()` for illustrative photos |
| `pipeline/src/build-photo-library.ts` | Commons search → `data/photo-library.json` + review gallery |
| `.github/workflows/` | `deploy` (Pages build; scheduling lives in cloud Routines), `photo-library` (manual refresh PR) |
