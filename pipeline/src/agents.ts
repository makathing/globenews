import { CATEGORIES } from '../../shared/news.ts';

/**
 * Programmatic subagent definitions (Claude Agent SDK `options.agents`).
 * Classic four-role split: the coordinator is the main query loop; explorer,
 * researcher and synthesizer are subagents it invokes via the Agent tool.
 */

const CATEGORY_LIST = CATEGORIES.join(' | ');

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
    prompt: `You are the EXPLORER agent for a global news radar.

Given a world region, run several targeted web searches to find the most significant
news events there from roughly the LAST 24 HOURS, across these categories: ${CATEGORY_LIST}.

Rules:
- Prefer events with clear geographic anchors (a city, country, or region).
- Skip celebrity gossip, sports scores, product launches, and opinion pieces.
- Note every [source-intel] annotation you receive — carry high-reliability source URLs forward.

Return a concise markdown list of 5-10 candidate events, each as:
- HEADLINE | location (city, country) | category | 1-2 sentence gist | candidate source URLs (2+ if seen)`,
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
1. Find at least TWO INDEPENDENT sources (different organizations) reporting it.
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
- ALL corroborating source URLs
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
2. STANDARDIZE each event to exactly this JSON shape:
   {
     "headline": string (<= 140 chars, neutral),
     "summary": string (2-3 sentences, factual — HARD LIMIT 550 characters, longer summaries get machine-truncated),
     "category": one of [${CATEGORY_LIST}],
     "severity": 1-5,
     "lat": number, "lon": number  (precise coordinates of the event location),
     "locationName": "City, Country" or "Country",
     "countryCode": ISO 3166-1 alpha-2 ("XX" if genuinely multi-country),
     "sources": [{"url": "https://..."}, ...]  (2+ independent URLs whenever available)
   }
3. Balance the map: aim for 25-45 events spanning all inhabited continents; do not let one
   story dominate. Severity must reflect real-world impact, not coverage volume.
4. Write the result as VALID JSON — {"events": [...]} — to the staging file path you were given,
   using the Write tool. Write JSON only, no markdown fences, no commentary.

Your ONLY deliverable is that file, written with the Write tool. A reply describing the events
without the file actually written is a FAILED run — write the file first, then reply briefly.`,
  },
} as const;

export function coordinatorPrompt(stagingPath: string): string {
  return `You are the COORDINATOR of a multi-agent global news radar pipeline. Today is ${new Date().toISOString().slice(0, 10)}.
Orchestrate your subagents to build a verified 24-hour world news dataset. Do NOT do the research yourself — delegate.

CRITICAL: every Agent tool invocation MUST pass run_in_background: false and you MUST wait
for each subagent's actual returned result before moving on. Never launch subagents async —
a "launched in background" response means you did it wrong; re-invoke synchronously.

Workflow (follow strictly, in order):
1. Invoke the "explorer" subagent 4 times — once per region: (a) Americas, (b) Europe, (c) Middle East & Africa, (d) Asia-Pacific. These can run in parallel.
2. Collect all candidates, then invoke the "researcher" subagent in 2-4 batches (group candidates by region) to verify them. Pass each batch the full candidate details.
3. Invoke the "synthesizer" subagent with ALL verified events (paste the researcher outputs in full), and tell it to write the final JSON to exactly this absolute path: ${stagingPath}
4. VERIFY the file exists by Reading ${stagingPath}. If it is missing or empty, re-invoke the synthesizer ONCE, repeating the exact absolute path and telling it the previous attempt failed to write. If it is STILL missing, write the file YOURSELF with the Write tool from the synthesizer's reply.
5. Reply with a one-paragraph run summary (counts of candidates, verified, discarded). If for any reason the file could not be written at all, your reply must instead contain the complete final JSON ({"events": [...]}) so the caller can recover it.

Quality bar: only verified, multi-source events make the dataset. Trust scores are computed downstream — never invent numeric trust values.`;
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
