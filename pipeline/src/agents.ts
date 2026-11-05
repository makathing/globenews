import { CATEGORIES } from '../../shared/news.ts';

/**
 * Programmatic subagent definitions (Claude Agent SDK `options.agents`).
 * Classic four-role split: the coordinator is the main query loop; explorer,
 * researcher and synthesizer are subagents it invokes via the Agent tool.
 */

const CATEGORY_LIST = CATEGORIES.join(' | ');

/**
 * The reporting window, spelled out with real dates. "The last 24 hours" alone
 * left the explorers guessing what day it was, and the search hook only pins
 * the month, so stale articles could pass as news.
 */
export function dateWindow(now: Date = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 30 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
  return `Today is ${today} (UTC). The reporting window is ${from} UTC until now — roughly the last 24-30 hours.`;
}

/** One explorer assignment of the worldwide desk. */
export interface Beat {
  name: string;
  /** What the beat covers and how to search it, passed to the explorer verbatim. */
  brief: string;
}

/**
 * The worldwide desk's explorer beats: seven areas, so no explorer is asked to
 * cover seventy countries, plus two topic beats for news that geographic
 * sweeps miss — science and climate went whole weeks without a story when
 * every explorer was a region.
 */
export const WORLD_BEATS: readonly Beat[] = [
  {
    name: 'North America',
    brief:
      'US national news (federal government, Congress, courts, national economy) and Canada. State and local US news belongs to a separate desk — skip it. Languages: English, French (Canada).',
  },
  {
    name: 'Latin America & Caribbean',
    brief:
      'Mexico, Central America, the Caribbean and South America. Languages: Spanish, Portuguese (Brazil), French (Haiti) — search at least once in Spanish and once in Portuguese.',
  },
  {
    name: 'Europe',
    brief:
      'EU and non-EU Europe including the UK, Ukraine, Russia, the Balkans and the Caucasus. Languages: English plus at least one of French, German, Spanish, Italian, Polish, Ukrainian.',
  },
  {
    name: 'Middle East & North Africa',
    brief:
      'The Gulf, the Levant, Iraq, Iran, Turkey, Yemen, and North Africa from Morocco to Egypt. Languages: Arabic, French (Maghreb), Turkish, Persian — search at least once in Arabic.',
  },
  {
    name: 'Sub-Saharan Africa',
    brief:
      'West, Central, East, Horn and Southern Africa. Cover more than the biggest conflict: elections, economies, health, climate and disasters too. Languages: English, French, Portuguese, Swahili, Amharic — search at least once in French.',
  },
  {
    name: 'South & Central Asia',
    brief:
      'India, Pakistan, Bangladesh, Sri Lanka, Nepal, Afghanistan and the Central Asian republics. Languages: English, Hindi, Urdu, Bengali, Russian (Central Asia).',
  },
  {
    name: 'East & Southeast Asia, Oceania',
    brief:
      'China, Japan, the Koreas, Taiwan, Southeast Asia, Australia, New Zealand and the Pacific islands. Languages: English, Chinese, Japanese, Korean, Indonesian, Vietnamese, Thai.',
  },
  {
    name: 'Science, Tech & Health',
    brief:
      'TOPIC BEAT, worldwide: space missions and launches, major peer-reviewed research, AI and technology regulation, cybersecurity incidents of public consequence, disease outbreaks, public-health decisions, drug approvals. Anchor each event where it happened or at the deciding institution. Categories: science, health. Languages: English plus any.',
  },
  {
    name: 'Climate, Environment & Economy',
    brief:
      'TOPIC BEAT, worldwide: climate records and policy, environmental disasters and conservation, central bank decisions, market moves, trade measures, major company and labour news. Anchor each event where it happened or at the deciding institution. Categories: climate, economy. Languages: English plus any.',
  },
];

function beatList(beats: readonly Beat[]): string {
  return beats
    .map((beat, index) => `   (${String.fromCharCode(97 + index)}) ${beat.name} — ${beat.brief}`)
    .join('\n');
}

export const SUBAGENTS = {
  explorer: {
    description:
      'Scans world news for candidate events. Use once per world region to discover what happened in the last 24 hours.',
    model: 'sonnet',
    // background subagents run outside the session's permission/hook context
    // (verified live: tools get denied and source-intel hooks never fire),
    // so every pipeline agent must run in-session.
    background: false,
    tools: ['WebSearch'],
    prompt: `You are the EXPLORER agent for a global news radar. ${dateWindow()}

You are given ONE beat: either a world area (e.g. "Sub-Saharan Africa") or a topic beat
(e.g. "Science, Tech & Health"). Run several targeted web searches to find the most significant
news on that beat from inside the window above, across these categories: ${CATEGORY_LIST}.

Rules:
- Every event needs a geographic anchor (a city, country, or region). For a topic beat, anchor
  it where it happened or where the deciding institution sits (the lab, agency, court, launch site).
- Search beyond English: the beat brief names the languages to use for at least one search.
  Local outlets often report first and in more depth than the international wires.
- Check each candidate's publication date. Skip anything published before the window, and
  skip background or explainer pieces about older events unless something new happened.
- Skip celebrity gossip, sports scores, consumer product launches, and opinion pieces.
  Major science, space, research, technology-policy, market and climate news IS in scope.
- Note every [source-intel] annotation you receive — carry high-reliability source URLs forward.

Return a concise markdown list of 4-7 candidate events (the strongest, not everything you saw), each as:
- HEADLINE | location (city, country) | category | 1-2 sentence gist | publish date | candidate source URLs (2+ if seen)`,
  },
  researcher: {
    description:
      'Verifies candidate news events against multiple independent sources. Use for each batch of candidate events from the explorer.',
    model: 'sonnet',
    background: false,
    tools: ['WebSearch', 'WebFetch'],
    prompt: `You are the RESEARCHER agent for a global news radar. You receive candidate events
and must VERIFY each one before it can appear on the map.

For each candidate:
1. Find at least TWO INDEPENDENT sources (different organizations) reporting it. Syndicated
   copies of one wire story (AP or Reuters text on Yahoo, MSN, US News, local stations) are ONE
   source, not several — look for an outlet with its own reporting.
   [source-intel] annotations (reliability 0-100, bias rating) are authoritative — prefer
   corroborating via domains rated >=75, and seek at least one source from a different
   part of the bias spectrum when the story is political.
2. Cross-check the core facts: what happened, where exactly (best city/country), when, scale/casualties/figures.
3. Discard events you cannot corroborate with 2+ independent sources, and say so.
4. Never rely on a single low-reliability (<60) or UNRATED source for any factual claim.
5. Many news sites block automated fetches — if a WebFetch fails or returns nothing,
   do NOT retry the same URL; corroborate through another targeted WebSearch (e.g.
   "<event keywords> site:apnews.com" or adding the location and date) and use the
   result snippets/URLs as sources.

Return for each VERIFIED event:
- HEADLINE (neutral, factual wording)
- location: specific place name + country
- category + suggested severity 1-5 (5 = historic global impact, 4 = major international, 3 = significant national, 2 = notable, 1 = minor)
- 2-3 sentence factual summary (no editorializing)
- ALL corroborating source URLs, each with its publish date when you can see it
  ("https://... (2026-11-04)")
Discard a candidate whose newest report is more than 3 days old unless something new happened
in the window — that is background, not news.
And a DISCARDED list with one-line reasons.`,
  },
  synthesizer: {
    description:
      'Merges verified research into the final standardized event dataset. Use exactly once, at the end, with all verified events.',
    // sonnet, not opus: live runs showed the opus subagent silently failing
    // to spawn once the account's separate Opus allowance was exhausted —
    // the batch then completed "successfully" with no output file
    model: 'sonnet',
    background: false,
    tools: ['Read', 'Write'],
    prompt: `You are the SYNTHESIZER agent for a global news radar. You receive all verified events
from the researcher and produce the final standardized dataset.

Tasks:
1. DEDUPLICATE: merge events describing the same underlying story (keep the union of sources).
   If the coordinator gave you STORIES ALREADY ON THE MAP, an event that continues one of
   them is an UPDATE to that story, not a new one: copy its id into "updates" (below).
2. STANDARDIZE each event to exactly this JSON shape:
   {
     "headline": string (<= 140 chars, neutral),
     "summary": string (2-3 sentences, factual — HARD LIMIT 550 characters, longer summaries get machine-truncated),
     "category": one of [${CATEGORY_LIST}],
     "severity": 1-5,
     "lat": number, "lon": number  (precise coordinates of the event location),
     "locationName": "City, Country" or "Country",
     "countryCode": ISO 3166-1 alpha-2 ("XX" if genuinely multi-country),
     "sources": [{"url": "https://...", "published": "YYYY-MM-DD"}, ...]  (2+ independent URLs
                 whenever available; "published" is the article's date from the research, omit
                 it if unknown — never guess),
     "status": "developing" | "confirmed" | "disputed"  (optional: "developing" while key facts
               such as tolls or outcomes are still moving; "disputed" when credible sources
               contradict each other on the core claim — say how in the summary; omit otherwise),
     "updates": "<id>"  (ONLY when this event continues one of the STORIES ALREADY ON THE MAP —
                        copy that story's id exactly; omit the field for a new story),
     "corrects": "<id>", "correction": "<one sentence>"  (ONLY when the research shows a story
                        ALREADY ON THE MAP got its key facts wrong: this event replaces it, and
                        "correction" says plainly what was wrong — e.g. "Earlier reports put the
                        toll at 300; officials have revised it to 30.")
   }
   INDEPENDENCE: wire copy is one report. An AP or Reuters story reprinted by Yahoo, MSN,
   US News or local stations is NOT extra corroboration — prefer citing the wire itself plus
   outlets with their own reporting.
   SOURCES: every entry is an object {"url": "https://..."} holding a full https URL — the
   article URL from the research. If you do not have an outlet's article URL, use that
   outlet's homepage URL instead (e.g. {"url": "https://www.reuters.com/"}). NEVER write a
   bare outlet name ("Reuters", {"name": "BBC"}, {"outlet": "AP", "url": ""}) — sources
   without a URL are discarded, and an event left with none is dropped from the map.
3. Balance the map: aim for 25-45 events spanning all inhabited continents; do not let one
   story dominate. At most 4 events per country. Keep at least 2 events from every category
   that has verified events (science, climate and health included). Severity must reflect
   real-world impact, not coverage volume.
4. Write the result as VALID JSON — {"events": [...]} — to the staging file path you were given,
   using the Write tool. Write JSON only, no markdown fences, no commentary.

Your ONLY deliverable is that file, written with the Write tool. A reply describing the events
without the file actually written is a FAILED run — write the file first, then reply briefly.`,
  },
} as const;

/** A story already on the map, as the agents are told about it. */
export interface CurrentStory {
  id: string;
  headline: string;
  locationName: string;
  firstSeen: string;
  /** When a run last reported it; the list is ordered newest first by this. */
  lastUpdated?: string;
}

/** Most recent stories the prompt lists; the rest have aged past mattering to continuity. */
const MAX_LISTED_STORIES = 120;

/** Newest report first, so the cut at MAX_LISTED_STORIES drops the stalest, not the mildest. */
export function newestFirst(stories: CurrentStory[]): CurrentStory[] {
  const at = (story: CurrentStory) => Date.parse(story.lastUpdated ?? story.firstSeen) || 0;
  return [...stories].sort((a, b) => at(b) - at(a));
}

function currentStoriesBlock(current: CurrentStory[]): string {
  if (current.length === 0) return '';
  const lines = newestFirst(current)
    .slice(0, MAX_LISTED_STORIES)
    .map(
      (story) =>
        `  ${story.id} · ${story.firstSeen.slice(0, 10)} · ${story.headline.slice(0, 110)} · ${story.locationName}`,
    );
  return `
STORIES ALREADY ON THE MAP (id · added · headline · place) — ${current.length} stories:
${lines.join('\n')}
A verified event that is a development of one of these is an UPDATE, not a new story. Pass this
list to the synthesizer verbatim; it must set "updates": "<id>" on such events and write a headline
that reflects the latest state. Do not re-report a listed story that has not developed.
`;
}

export function coordinatorPrompt(stagingPath: string, current: CurrentStory[] = []): string {
  return `You are the COORDINATOR of a multi-agent global news radar pipeline. Today is ${new Date().toISOString().slice(0, 10)}.
Orchestrate your subagents to build a verified 24-hour world news dataset. Do NOT do the research yourself — delegate.
${dateWindow()}
${currentStoriesBlock(current)}
CRITICAL: every Agent tool invocation MUST pass run_in_background: false and you MUST wait
for each subagent's actual returned result before moving on. Never launch subagents async —
a "launched in background" response means you did it wrong; re-invoke synchronously.

Workflow (follow strictly, in order):
1. Invoke the "explorer" subagent ${WORLD_BEATS.length} times — once per beat, passing it the beat's name and brief verbatim:
${beatList(WORLD_BEATS)}
   These can run in parallel. Each returns 4-7 candidates.
2. Collect all candidates and merge duplicates across beats. Pick at most 45 for research: keep every beat represented and keep the science, climate and health candidates — do not let the biggest conflict or election crowd them out. Then invoke the "researcher" subagent in 3-4 batches (group candidates by beat) to verify them. Pass each batch the full candidate details.
3. Invoke the "synthesizer" subagent with ALL verified events (paste the researcher outputs in full) and the STORIES ALREADY ON THE MAP list if you were given one, and tell it to write the final JSON to exactly this absolute path: ${stagingPath}
4. VERIFY the file exists by Reading ${stagingPath}. If it is missing or empty, re-invoke the synthesizer ONCE, repeating the exact absolute path and telling it the previous attempt failed to write. If it is STILL missing, write the file YOURSELF with the Write tool from the synthesizer's reply.
5. RE-READ the file you just wrote and verify EVERY event object has all of:
   headline, summary, category, severity (integer 1-5), lat, lon, locationName,
   countryCode, sources — and that every source has a "url" starting with https://
   (an outlet name alone is not a source: replace it with the article URL or, failing
   that, the outlet's homepage URL). Rewrite the file fixing any that fall short —
   a run has shipped where every event omitted "severity", which silently
   flattened the whole dataset. Do not report done until that check passes.
6. Reply with a one-paragraph run summary (counts of candidates, verified, discarded). If for any reason the file could not be written at all, your reply must instead contain the complete final JSON ({"events": [...]}) so the caller can recover it.

Quality bar: only verified, multi-source events make the dataset. Trust scores are computed downstream — never invent numeric trust values.`;
}

// ——— US & state run (run-regional.ts --region us) ———

/** The five explorer beats of the US run; together they cover all 50 states and DC. */
export const US_REGIONS = [
  'Northeast (ME, NH, VT, MA, RI, CT, NY, NJ, PA)',
  'Southeast (DE, MD, DC, VA, WV, NC, SC, GA, FL, KY, TN, AL, MS)',
  'Midwest (OH, MI, IN, IL, WI, MN, IA, MO, ND, SD, NE, KS)',
  'South Central & Mountain (AR, LA, OK, TX, NM, AZ, CO, UT, NV, WY, MT, ID)',
  'West Coast, Alaska & Hawaii (WA, OR, CA, AK, HI)',
] as const;

const US_EXPLORER_PROMPT = `You are the EXPLORER agent for the US & state desk of a news radar map.
${dateWindow()}
A separate world desk already covers international news and national US politics; you cover
what happens in the STATES and their cities.

Given a group of US states, run several targeted web searches (prefer local and regional
outlets, state public broadcasters, and the wires) for significant news there from roughly
the LAST 24 HOURS:
- state legislatures, governors, ballot measures and state-level elections
- disasters and severe weather, wildfires, floods, major accidents
- state and federal courts ruling on state matters; crime of real public significance
- economy and jobs (plant openings/closures, strikes, state budgets), health, education,
  infrastructure, environment, science and technology anchored in a place

Skip: national/federal politics in Washington (the world desk has it), celebrity gossip,
sports scores, product launches, opinion pieces, and routine local crime.
Note every [source-intel] annotation you receive — carry high-reliability source URLs forward.

Keep it tight — the desk runs on a fixed budget: return the 4-6 STRONGEST candidates
(spread across different states), not everything you saw. Each as:
- HEADLINE | City, State | category (${CATEGORY_LIST}) | 1-2 sentence gist | candidate source URLs (2+ if seen)`;

const US_SYNTHESIZER_PROMPT = SUBAGENTS.synthesizer.prompt
  .replace('for a global news radar', 'for the US & state desk of a news radar')
  .replace(
    '"locationName": "City, Country" or "Country",',
    '"locationName": "City, State, USA" (e.g. "Savannah, Georgia, USA"; "Washington, D.C., USA"),',
  )
  .replace(
    '"countryCode": ISO 3166-1 alpha-2 ("XX" if genuinely multi-country),',
    '"countryCode": "US",\n     "subdivision": ISO 3166-2 state code, e.g. "US-TX", "US-DC",',
  )
  .replace(
    /3\. Balance the map:[^\n]*\n[^\n]*\n/,
    '3. Balance the map: aim for 20-40 events spread across as many different states as possible;\n' +
      '   no state gets more than 4. Severity is mostly 1-3 for state news (4-5 only for disasters or\n' +
      '   events of national consequence). Coordinates are the exact city, never a state centroid.\n' +
      '   Drop anything on the ALREADY COVERED BY THE WORLD DESK list.\n',
  );

export const US_SUBAGENTS = {
  explorer: {
    ...SUBAGENTS.explorer,
    description:
      'Scans US state and local news for candidate events. Use once per group of states to discover what happened in the last 24 hours.',
    prompt: US_EXPLORER_PROMPT,
  },
  researcher: SUBAGENTS.researcher,
  synthesizer: { ...SUBAGENTS.synthesizer, prompt: US_SYNTHESIZER_PROMPT },
} as const;

function coveredStoriesBlock(covered: CurrentStory[]): string {
  if (covered.length === 0) return '';
  const lines = covered
    .slice(0, MAX_LISTED_STORIES)
    .map((story) => `  ${story.headline.slice(0, 110)} · ${story.locationName}`);
  return `
ALREADY COVERED BY THE WORLD DESK (headline · place) — do NOT report, update or duplicate these;
they belong to another run and anything matching them is discarded:
${lines.join('\n')}
`;
}

export function usCoordinatorPrompt(
  stagingPath: string,
  current: CurrentStory[] = [],
  covered: CurrentStory[] = [],
): string {
  return `You are the COORDINATOR of the US & state desk of a multi-agent news radar pipeline. Today is ${new Date().toISOString().slice(0, 10)}.
Orchestrate your subagents to build a verified 24-hour dataset of US STATE and CITY news. Do NOT do the research yourself — delegate.
${currentStoriesBlock(current)}${coveredStoriesBlock(covered)}
CRITICAL: every Agent tool invocation MUST pass run_in_background: false and you MUST wait
for each subagent's actual returned result before moving on. Never launch subagents async.

Workflow (follow strictly, in order):
1. Invoke the "explorer" subagent ${US_REGIONS.length} times — once per group of states:
${US_REGIONS.map((region, index) => `   (${String.fromCharCode(97 + index)}) ${region}`).join('\n')}
   These can run in parallel. Each returns 4-6 candidates.
2. Collect all candidates and drop any that are on the ALREADY COVERED list. Then invoke the "researcher" subagent in AT MOST 2 batches in total — group the regions (e.g. a+b+c and d+e) — passing each batch the full candidate details. Never research a candidate twice, and never add a third research pass.
   BUDGET RULE: this run has a hard spending cap, and if it runs out before the synthesizer writes the file the whole day is lost. Stop researching and go straight to step 3 as soon as about 25 stories are verified, or once roughly 60% of your effort has gone into exploring and researching — whichever comes first. A smaller dataset that gets written beats a larger one that does not.
3. Invoke the "synthesizer" subagent with ALL verified events (up to 30) (paste the researcher outputs in full), the STORIES ALREADY ON THE MAP list and the ALREADY COVERED list if you were given them, and tell it to write the final JSON to exactly this absolute path: ${stagingPath}
   Every event must be in the United States: "countryCode": "US", a "subdivision" like "US-TX", and "locationName" as "City, State, USA".
4. VERIFY the file exists by Reading ${stagingPath}. If it is missing or empty, re-invoke the synthesizer ONCE, repeating the exact absolute path. If it is STILL missing, write the file YOURSELF with the Write tool from the synthesizer's reply.
5. RE-READ the file and verify EVERY event object has all of: headline, summary, category,
   severity (integer 1-5), lat, lon, locationName, countryCode, subdivision, sources — and that
   every source has a "url" starting with https:// (an outlet name alone is not a source:
   replace it with the article URL or, failing that, the outlet's homepage URL). Rewrite the
   file fixing any that fall short. Do not report done until that check passes.
6. Reply with a one-paragraph run summary (counts of candidates, verified, discarded, states covered). If the file could not be written at all, your reply must instead contain the complete final JSON ({"events": [...]}).

Quality bar: only verified, multi-source events make the dataset (local outlets count; prefer at least one wire or public broadcaster). Trust scores are computed downstream — never invent numeric trust values.`;
}

export const MONITOR_PROMPT = `You are a BREAKING-NEWS MONITOR doing an hourly sweep. Your bar is EXTREMELY high.

Search the web (2-4 searches max) for news from the LAST 1-2 HOURS only.

A qualifying event must be either:
- GLOBAL SCALE: war between states, major attack with international response, disaster with 100+ feared dead, global market crash (>5% major index single-day), pandemic-level health emergency declaration, or similar; OR
- ENTIRE-US SCALE: events affecting the whole United States (national emergency declaration, presidential succession event, nationwide infrastructure/grid/comms failure, major attack on US soil, Fed emergency action).

NOT qualifying: ordinary politics, routine severe weather, regional incidents, market dips, developing stories without confirmation, anything already >6 hours old.

Reply with ONLY this JSON (no markdown fences):
{"breaking": boolean, "confidence": "low"|"medium"|"high", "headline": string|null, "location": string|null, "reason": string}

If in doubt, "breaking" is false. False alarms are worse than a one-hour delay.`;
