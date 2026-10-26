/**
 * News topics: a finer grain than categories, used to pick an illustrative
 * photo (shared/photoLibrary.ts) for a story whose own sources carry no
 * usable picture. A topic is what a generic photo can honestly depict —
 * "a flooded street", "a ballot box" — never the specific event.
 *
 * Matching is deterministic keyword scoring, so the same story always gets
 * the same topic on the pipeline and in the browser. It must stay
 * dependency-free so both workspaces can import it directly.
 */

import type { Category } from './news.ts';

export interface TopicDef {
  id: string;
  label: string;
  /** The category this topic usually belongs to; a match in it scores a small bonus. */
  category: Category;
  /**
   * Whole-word, case-insensitive. A trailing "s"/"es" is tolerated, so list
   * the singular. A multi-word phrase weighs one per word: a phrase hit is
   * stronger evidence than a single loose word ("general strike" > "strike").
   */
  keywords: readonly string[];
  /** Wikimedia Commons search queries that yield generic, non-event photos. */
  search: readonly string[];
}

/**
 * Order matters: ties go to the earlier topic. Specific before generic —
 * disasters and diseases first, broad buckets (government, society) last.
 */
export const TOPICS = [
  // ── disaster ───────────────────────────────────────────────────────────
  {
    id: 'earthquake',
    label: 'Earthquake',
    category: 'disaster',
    keywords: ['earthquake', 'quake', 'tremor', 'aftershock', 'seismic', 'magnitude', 'tsunami'],
    search: ['earthquake damage building', 'earthquake rubble rescue', 'collapsed house earthquake'],
  },
  {
    id: 'volcano',
    label: 'Volcano',
    category: 'disaster',
    keywords: ['volcano', 'volcanic', 'eruption', 'erupt', 'erupts', 'lava', 'ash cloud', 'ash plume'],
    search: ['volcano eruption', 'lava flow', 'volcanic ash plume'],
  },
  {
    id: 'wildfire',
    label: 'Wildfire',
    category: 'disaster',
    keywords: ['wildfire', 'bushfire', 'forest fire', 'brush fire', 'grass fire', 'firefighting aircraft'],
    search: ['wildfire forest fire', 'bushfire smoke', 'firefighting aircraft wildfire'],
  },
  {
    id: 'flood',
    label: 'Flood',
    category: 'disaster',
    keywords: ['flood', 'flooding', 'flooded', 'flash flood', 'landslide', 'mudslide', 'heavy rain', 'downpour', 'monsoon', 'deluge'],
    search: ['flooded street', 'flood water houses', 'flooding river town'],
  },
  {
    id: 'storm',
    label: 'Storm',
    category: 'disaster',
    keywords: ['storm', 'hurricane', 'typhoon', 'cyclone', 'tropical storm', 'tropical depression', 'depression', 'tornado', 'landfall', 'gale', 'blizzard', 'winds'],
    search: ['hurricane damage', 'storm waves coast', 'typhoon damage trees'],
  },
  {
    id: 'emergency',
    label: 'Fire & emergency',
    category: 'disaster',
    keywords: ['fire', 'blaze', 'explosion', 'blast', 'collapse', 'collapses', 'collapsed', 'building collapse', 'derailment', 'derail', 'firefighter', 'gas leak', 'chemical leak'],
    search: ['firefighters building fire', 'fire engine emergency', 'rescue workers collapsed building'],
  },
  // ── climate ────────────────────────────────────────────────────────────
  {
    id: 'heatwave-drought',
    label: 'Heatwave & drought',
    category: 'climate',
    keywords: ['heatwave', 'heat wave', 'drought', 'extreme heat', 'record heat', 'record temperature', 'water shortage', 'dry spell', 'desertification'],
    search: ['drought cracked earth', 'dry riverbed drought', 'dried up lake'],
  },
  {
    id: 'air-pollution',
    label: 'Air pollution',
    category: 'climate',
    keywords: ['haze', 'smog', 'air pollution', 'air quality', 'pollution', 'particulate'],
    search: ['smog city skyline', 'air pollution smoke stacks', 'haze over city'],
  },
  {
    id: 'climate-policy',
    label: 'Climate policy',
    category: 'climate',
    keywords: ['climate', 'climate change', 'climate summit', 'emission', 'carbon', 'net zero', 'cop29', 'cop30', 'cop31', 'paris agreement', 'renewable', 'global warming', 'greenhouse gas'],
    search: ['wind turbines', 'solar panels field', 'climate protest'],
  },
  {
    id: 'nature',
    label: 'Nature & wildlife',
    category: 'climate',
    keywords: ['deforestation', 'wildlife', 'species', 'biodiversity', 'ocean', 'coral', 'reef', 'rainforest', 'forest', 'endangered', 'extinction', 'conservation', 'glacier', 'ice sheet', 'poaching'],
    search: ['tropical rainforest', 'coral reef', 'deforestation logging'],
  },
  // ── health ─────────────────────────────────────────────────────────────
  {
    id: 'outbreak',
    label: 'Disease outbreak',
    category: 'health',
    keywords: ['outbreak', 'epidemic', 'pandemic', 'virus', 'ebola', 'cholera', 'dengue', 'measles', 'mpox', 'malaria', 'chikungunya', 'flu', 'avian flu', 'bird flu', 'influenza', 'h5n1', 'h9n2', 'covid', 'infection', 'cases', 'contacts monitored', 'strain', 'pathogen', 'marburg', 'polio'],
    search: ['health workers protective suits', 'laboratory sample testing', 'mosquito aedes'],
  },
  {
    id: 'vaccine',
    label: 'Vaccines',
    category: 'health',
    keywords: ['vaccine', 'vaccination', 'vaccinate', 'immunisation', 'immunization', 'jab', 'booster', 'inoculation'],
    search: ['vaccination syringe', 'vaccine vial', 'child vaccination'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    category: 'health',
    keywords: ['hospital', 'doctor', 'nurse', 'patient', 'healthcare', 'health care', 'health system', 'clinic', 'surgery', 'medicine', 'drug prices', 'mental health', 'abortion'],
    search: ['hospital ward', 'operating room surgery', 'ambulance'],
  },
  // ── conflict ───────────────────────────────────────────────────────────
  {
    id: 'airstrike',
    label: 'Strikes & missiles',
    category: 'conflict',
    keywords: ['airstrike', 'air strike', 'strike', 'missile', 'ballistic missile', 'drone', 'drone strike', 'bombing', 'bombardment', 'shelling', 'rocket fire', 'intercepted', 'air defence', 'air defense'],
    search: ['destroyed building war', 'bombed building ruins', 'missile launch'],
  },
  {
    id: 'ceasefire',
    label: 'Ceasefire & peace talks',
    category: 'conflict',
    keywords: ['ceasefire', 'cease-fire', 'truce', 'peace talks', 'peace deal', 'peace plan', 'peace agreement', 'armistice', 'hostage deal', 'prisoner exchange', 'prisoner swap'],
    search: ['peace conference table', 'diplomats handshake', 'negotiation table meeting'],
  },
  {
    id: 'naval',
    label: 'Naval & maritime security',
    category: 'conflict',
    keywords: ['navy', 'naval', 'warship', 'destroyer', 'frigate', 'aircraft carrier', 'blockade', 'strait', 'coast guard', 'shoal', 'piracy', 'pirates', 'tanker seized'],
    search: ['warship at sea', 'navy destroyer', 'naval vessel patrol'],
  },
  {
    id: 'combat',
    label: 'Armed conflict',
    category: 'conflict',
    keywords: ['troops', 'soldier', 'army', 'fighting', 'fighter', 'offensive', 'militant', 'militia', 'rebel', 'insurgent', 'jihadist', 'clashes', 'battle', 'frontline', 'front line', 'war', 'armed men', 'gunmen', 'landmine', 'incursion', 'siege', 'military'],
    search: ['soldiers patrol', 'infantry exercise', 'armored vehicle'],
  },
  {
    id: 'refugees',
    label: 'Humanitarian crisis',
    category: 'conflict',
    keywords: ['refugee', 'displaced', 'displacement', 'humanitarian', 'aid convoy', 'food aid', 'famine', 'hunger', 'starvation', 'wheat', 'food shortage', 'evacuee', 'shelter', 'relief'],
    search: ['refugee camp tents', 'humanitarian aid distribution', 'food aid sacks'],
  },
  // ── science & tech ─────────────────────────────────────────────────────
  {
    id: 'space',
    label: 'Space',
    category: 'science',
    keywords: ['space', 'launch', 'rocket', 'satellite', 'nasa', 'esa', 'spacex', 'starlink', 'starshield', 'orbit', 'astronaut', 'moon', 'mars', 'spacecraft', 'telescope'],
    search: ['rocket launch', 'satellite orbit earth', 'launch pad rocket'],
  },
  {
    id: 'cyberattack',
    label: 'Cyberattack',
    category: 'science',
    keywords: ['cyberattack', 'cyber attack', 'cyber', 'hack', 'hacker', 'hacked', 'ransomware', 'data breach', 'malware', 'phishing'],
    search: ['computer code screen', 'server room', 'computer keyboard'],
  },
  {
    id: 'technology',
    label: 'Technology',
    category: 'science',
    keywords: ['ai', 'artificial intelligence', 'chip', 'semiconductor', 'tech', 'technology', 'software', 'smartphone', 'robot', 'quantum', 'data center', 'internet', 'social media'],
    search: ['data center servers', 'semiconductor wafer', 'circuit board'],
  },
  // ── economy ────────────────────────────────────────────────────────────
  {
    id: 'central-bank',
    label: 'Money & central banks',
    category: 'economy',
    keywords: ['central bank', 'interest rate', 'rate cut', 'rate hike', 'inflation', 'currency', 'peso', 'rupee', 'lira', 'yen', 'exchange rate', 'imf', 'bailout', 'loan', 'debt', 'financing', 'federal reserve', 'ecb', 'bond market', 'bond yields'],
    search: ['central bank building', 'banknotes currency', 'coins money'],
  },
  {
    id: 'energy',
    label: 'Energy',
    category: 'economy',
    keywords: ['oil', 'gas', 'opec', 'crude', 'diesel', 'petrol', 'fuel', 'power grid', 'power outage', 'blackout', 'electricity', 'pipeline', 'nuclear plant', 'refinery', 'lng'],
    search: ['oil refinery', 'oil pumpjack', 'electricity pylons'],
  },
  {
    id: 'trade',
    label: 'Trade',
    category: 'economy',
    keywords: ['tariff', 'export', 'import', 'trade', 'trade war', 'trade deal', 'shipping', 'seaport', 'harbour', 'harbor', 'container', 'supply chain', 'customs', 'export controls', 'outbound investment'],
    search: ['container ship port', 'shipping containers terminal', 'cargo port cranes'],
  },
  {
    id: 'sanctions',
    label: 'Sanctions',
    category: 'economy',
    keywords: ['sanction', 'sanctions', 'embargo', 'asset freeze', 'blacklist'],
    search: ['customs inspection', 'cargo containers stacked', 'banknotes'],
  },
  {
    id: 'labour',
    label: 'Labour & jobs',
    category: 'economy',
    keywords: ['strike action', 'general strike', 'walkout', 'union', 'trade union', 'workers', 'jobs', 'unemployment', 'layoffs', 'wages', 'minimum wage', 'picket', 'truckers'],
    search: ['workers picket line', 'trade union rally', 'factory workers'],
  },
  {
    id: 'markets',
    label: 'Markets & economy',
    category: 'economy',
    keywords: ['stocks', 'shares', 'investor', 'investment', 'stock market', 'markets', 'economy', 'gdp', 'growth', 'recession', 'earnings', 'profit', 'billion', 'forecast', 'conference'],
    search: ['stock exchange trading floor', 'financial district skyscrapers', 'stock market display'],
  },
  // ── politics ───────────────────────────────────────────────────────────
  {
    id: 'election',
    label: 'Election',
    category: 'politics',
    keywords: ['election', 'vote', 'voter', 'voting', 'ballot', 'runoff', 'polls', 'polling', 'campaign', 'candidate', 'referendum', 'presidential race', 'electoral'],
    search: ['ballot box', 'polling station voting', 'election ballot paper'],
  },
  {
    id: 'protest',
    label: 'Protest',
    category: 'society',
    keywords: ['protest', 'protester', 'protestor', 'rally', 'rallies', 'demonstration', 'demonstrator', 'march', 'marchers', 'riot police', 'tear gas', 'unrest', 'uprising'],
    search: ['protest crowd street', 'demonstrators placards', 'protest march city'],
  },
  {
    id: 'court',
    label: 'Courts & justice',
    category: 'politics',
    keywords: ['court', 'trial', 'pre-trial', 'judge', 'ruling', 'verdict', 'indicted', 'indictment', 'prosecutor', 'sentenced', 'convicted', 'lawsuit', 'probe', 'fraud', 'money laundering', 'corruption', 'detention', 'acquitted'],
    search: ['courtroom', 'judge gavel', 'court building justice'],
  },
  {
    id: 'migration',
    label: 'Migration',
    category: 'society',
    keywords: ['migrant', 'migration', 'immigrant', 'immigration', 'asylum', 'border crossing', 'deportation', 'deported', 'xenophobic', 'xenophobia', 'evacuates citizens'],
    search: ['migrants boat', 'border fence', 'border crossing checkpoint'],
  },
  {
    id: 'crime',
    label: 'Crime & policing',
    category: 'society',
    keywords: ['police', 'arrest', 'arrested', 'gang', 'gang violence', 'shooting', 'gunman', 'murder', 'homicide', 'killed in shooting', 'prison', 'inmate', 'prison riot', 'cartel', 'drug', 'kidnap', 'kidnapping', 'hostage', 'extradite', 'extradites', 'extradited', 'suspect', 'robbery', 'stabbing'],
    search: ['police car', 'police officers street', 'police tape'],
  },
  {
    id: 'diplomacy',
    label: 'Diplomacy',
    category: 'politics',
    keywords: ['summit', 'talks', 'envoy', 'ambassador', 'diplomat', 'diplomatic', 'un', 'united nations', 'security council', 'foreign minister', 'pact', 'treaty', 'deal', 'bilateral', 'negotiate', 'negotiation', 'embassy', 'nato', 'g7', 'g20'],
    search: ['united nations general assembly hall', 'conference room diplomats', 'embassy building'],
  },
  {
    id: 'government',
    label: 'Government',
    category: 'politics',
    keywords: ['parliament', 'minister', 'prime minister', 'cabinet', 'president', 'government', 'administration', 'congress', 'senate', 'legislature', 'opposition', 'coup', 'impeachment', 'decree', 'law', 'bill', 'resign', 'resigns'],
    search: ['parliament chamber', 'parliament building', 'government building'],
  },
  // ── society ────────────────────────────────────────────────────────────
  {
    id: 'sport',
    label: 'Sport',
    category: 'society',
    keywords: ['sport', 'football', 'soccer', 'olympics', 'olympic', 'world cup', 'tournament', 'championship', 'football match', 'athlete', 'cricket', 'tennis', 'marathon', 'league'],
    search: ['football stadium match', 'athletes running track', 'sports stadium crowd'],
  },
  {
    id: 'society',
    label: 'Society & culture',
    category: 'society',
    keywords: ['education', 'school', 'student', 'university', 'religion', 'religious', 'church', 'mosque', 'temple', 'festival', 'culture', 'museum', 'heritage', 'housing', 'pilgrim', 'pilgrimage'],
    search: ['school classroom', 'street market crowd', 'festival celebration'],
  },
] as const satisfies readonly TopicDef[];

export type TopicId = (typeof TOPICS)[number]['id'];

export const TOPIC_IDS: readonly TopicId[] = TOPICS.map((topic) => topic.id);

/** The fallback when nothing in a story's text matches a topic. */
export const CATEGORY_DEFAULT_TOPIC: Record<Category, TopicId> = {
  conflict: 'combat',
  disaster: 'emergency',
  politics: 'government',
  economy: 'markets',
  health: 'healthcare',
  science: 'technology',
  climate: 'nature',
  society: 'society',
};

export function isTopicId(value: string): value is TopicId {
  return (TOPIC_IDS as readonly string[]).includes(value);
}

/** A headline hit, per phrase word. */
const HEADLINE_WEIGHT = 4;
/**
 * Summary hits add one per phrase word, capped below a single headline hit: summaries
 * are long and wander (a protest story mentions schools, housing and police),
 * so they break ties between headline topics rather than outvote them.
 */
const SUMMARY_CAP = 3;
const CATEGORY_BONUS = 1;

/**
 * A text broken into lower-case words, ready for whole-word tests. Anything
 * that is not a letter or digit separates words: "Pre-Trial" → "pre trial",
 * "War's" → "war s". One split per text rather than a regex per keyword —
 * the matcher runs in the browser for every story on screen.
 */
interface Words {
  set: Set<string>;
  /** The words joined by single spaces and padded, for phrase tests. */
  joined: string;
}

function toWords(text: string): Words {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return { set: new Set(words), joined: ` ${words.join(' ')} ` };
}

interface CompiledKeyword {
  /**
   * The forms that count as a hit — bare, +"s", +"es" — precomputed so the
   * hot path builds no strings. Single words are looked up in the word set;
   * phrases are space-padded for a substring test on the joined text.
   */
  forms: readonly string[];
  /** Words in the phrase — the hit's weight. */
  words: number;
}

const COMPILED: readonly { id: TopicId; category: Category; keywords: CompiledKeyword[] }[] =
  TOPICS.map((topic) => ({
    id: topic.id,
    category: topic.category,
    keywords: topic.keywords.map((keyword) => {
      const words = keyword.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const phrase = words.join(' ');
      const forms = [phrase, `${phrase}s`, `${phrase}es`];
      return { forms: words.length === 1 ? forms : forms.map((form) => ` ${form} `), words: words.length };
    }),
  }));

/** Whole-word (or whole-phrase) hit, tolerating a trailing "s"/"es". */
function contains(text: Words, { forms, words }: CompiledKeyword): boolean {
  return words === 1
    ? forms.some((form) => text.set.has(form))
    : forms.some((form) => text.joined.includes(form));
}

/** Phrase weights of the distinct keywords found in `text`. */
function hits(keywords: readonly CompiledKeyword[], text: Words): number[] {
  return keywords.filter((keyword) => contains(text, keyword)).map((keyword) => keyword.words);
}

/** Every topic's score for a story, in TOPICS order. Exposed for tuning and tests. */
export function scoreTopics(event: {
  headline: string;
  summary?: string;
  category: Category;
}): { id: TopicId; score: number }[] {
  const headlineText = toWords(event.headline);
  const summaryText = toWords(event.summary ?? '');
  return COMPILED.map((topic) => {
    // the strongest headline phrase, not the sum: a headline naming three
    // police words is no more about policing than one naming one
    const headline = hits(topic.keywords, headlineText);
    const summary = hits(topic.keywords, summaryText);
    const text =
      HEADLINE_WEIGHT * Math.max(0, ...headline) +
      Math.min(SUMMARY_CAP, summary.reduce((sum, words) => sum + words, 0));
    // the bonus only breaks near-ties between topics the text actually hit;
    // on its own it would make every story match its category's first topic
    const bonus = text > 0 && topic.category === event.category ? CATEGORY_BONUS : 0;
    return { id: topic.id, score: text + bonus };
  });
}

/**
 * The topic a story's illustrative photo should depict. Deterministic: same
 * text, same topic, on the pipeline and in the browser. Headline words weigh
 * more than summary words; ties go to the earlier topic in TOPICS; a story
 * that matches nothing falls back to its category's default.
 */
export function matchTopic(event: { headline: string; summary?: string; category: Category }): TopicId {
  let best: { id: TopicId; score: number } | null = null;
  for (const candidate of scoreTopics(event)) {
    if (candidate.score > 0 && (!best || candidate.score > best.score)) best = candidate;
  }
  return best ? best.id : CATEGORY_DEFAULT_TOPIC[event.category];
}
