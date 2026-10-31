import type { StagedOutput } from './schema.ts';

/**
 * Sample staged events for MOCK_MODE and for seeding data/events.json before
 * the first real pipeline run. Placeholder stories (plausible, generic) —
 * replaced wholesale by the first live batch run.
 */
export const MOCK_STAGED: StagedOutput = {
  events: [
    {
      headline: 'Ceasefire negotiations resume amid renewed shelling in eastern frontline towns',
      summary:
        'Delegations returned to the negotiating table as artillery exchanges continued near contested frontline towns. Mediators said talks would focus on humanitarian corridors and prisoner exchanges.',
      category: 'conflict',
      severity: 4,
      lat: 48.4,
      lon: 31.2,
      locationName: 'Ukraine',
      countryCode: 'UA',
      sources: [
        { url: 'https://www.reuters.com/world/europe/sample-ceasefire-talks' },
        { url: 'https://www.bbc.com/news/world-europe-sample' },
        { url: 'https://apnews.com/article/sample-ceasefire' },
      ],
    },
    {
      headline: 'Magnitude 6.3 earthquake shakes northern Honshu; tsunami advisory briefly issued',
      summary:
        'A strong offshore earthquake rattled northern Japan, briefly triggering a tsunami advisory that was later lifted. Authorities reported minor injuries and localized power outages.',
      category: 'disaster',
      severity: 3,
      lat: 38.3,
      lon: 141.0,
      locationName: 'Sendai, Japan',
      countryCode: 'JP',
      sources: [
        { url: 'https://www.nhk.or.jp/news/sample-earthquake' },
        { url: 'https://www.reuters.com/world/asia-pacific/sample-quake' },
      ],
    },
    {
      headline: 'Coalition talks collapse, pushing bloc toward snap elections',
      summary:
        'Weeks of coalition negotiations ended without agreement, raising the likelihood of snap elections within months. Markets reacted with mild losses as investors weighed policy uncertainty.',
      category: 'politics',
      severity: 3,
      lat: 52.52,
      lon: 13.41,
      locationName: 'Berlin, Germany',
      countryCode: 'DE',
      sources: [
        { url: 'https://www.spiegel.de/politik/sample-koalition' },
        { url: 'https://www.ft.com/content/sample-coalition' },
        { url: 'https://www.politico.eu/article/sample-coalition' },
      ],
    },
    {
      headline: 'Central bank surprises with half-point rate cut as inflation cools faster than forecast',
      summary:
        'Policymakers delivered a larger-than-expected rate cut, citing rapidly cooling inflation and softening labor data. Equity indexes rallied while the currency slid against major peers.',
      category: 'economy',
      severity: 3,
      lat: 38.9,
      lon: -77.04,
      locationName: 'Washington, D.C., United States',
      countryCode: 'US',
      sources: [
        { url: 'https://www.bloomberg.com/news/articles/sample-rate-cut' },
        { url: 'https://www.wsj.com/economy/sample-rate-cut' },
        { url: 'https://www.reuters.com/markets/us/sample-rate-cut' },
      ],
    },
    {
      headline: 'Cholera outbreak spreads to third province as aid agencies warn of funding gap',
      summary:
        'Health officials confirmed cholera cases in a third province, with aid agencies warning that treatment centers are underfunded. Vaccination campaigns are being accelerated in affected districts.',
      category: 'health',
      severity: 3,
      lat: 15.5,
      lon: 32.56,
      locationName: 'Khartoum, Sudan',
      countryCode: 'SD',
      sources: [
        { url: 'https://www.who.int/emergencies/sample-cholera' },
        { url: 'https://www.aljazeera.com/news/sample-cholera' },
      ],
    },
    {
      headline: 'Reusable heavy-lift rocket completes first fully successful orbital flight test',
      summary:
        'The uncrewed test flight reached orbit and both stages were recovered intact for the first time. The milestone is expected to cut launch costs for planned lunar cargo missions.',
      category: 'science',
      severity: 3,
      lat: 25.99,
      lon: -97.16,
      locationName: 'Boca Chica, United States',
      countryCode: 'US',
      sources: [
        { url: 'https://www.nasa.gov/news/sample-launch' },
        { url: 'https://www.reuters.com/technology/space/sample-launch' },
        { url: 'https://www.bbc.com/news/science-environment-sample' },
      ],
    },
    {
      headline: 'Record marine heatwave bleaches large sections of northern reef systems',
      summary:
        'Scientists reported the most extensive coral bleaching event on record for the region after months of elevated sea temperatures. Emergency assessments of reef resilience are underway.',
      category: 'climate',
      severity: 3,
      lat: -18.29,
      lon: 147.7,
      locationName: 'Great Barrier Reef, Australia',
      countryCode: 'AU',
      sources: [
        { url: 'https://www.abc.net.au/news/sample-bleaching' },
        { url: 'https://www.theguardian.com/environment/sample-bleaching' },
        { url: 'https://www.noaa.gov/news/sample-bleaching' },
      ],
    },
    {
      headline: 'Nationwide teachers strike enters second week as talks stall',
      summary:
        'Schools remained closed across much of the country as unions and the government failed to reach a pay deal. Parents groups called for arbitration while both sides blamed each other for the impasse.',
      category: 'society',
      severity: 2,
      lat: 48.86,
      lon: 2.35,
      locationName: 'Paris, France',
      countryCode: 'FR',
      sources: [
        { url: 'https://www.lemonde.fr/societe/sample-greve' },
        { url: 'https://www.france24.com/en/sample-strike' },
      ],
    },
    {
      headline: 'Cross-border shelling escalates along disputed mountain frontier',
      summary:
        'Exchanges of artillery fire were reported along the disputed frontier for a third consecutive day. Both governments summoned ambassadors while regional powers urged restraint.',
      category: 'conflict',
      severity: 3,
      lat: 34.1,
      lon: 74.8,
      locationName: 'Kashmir, India',
      countryCode: 'IN',
      sources: [
        { url: 'https://www.thehindu.com/news/sample-loc' },
        { url: 'https://www.aljazeera.com/news/sample-loc' },
        { url: 'https://www.reuters.com/world/asia-pacific/sample-loc' },
      ],
    },
    {
      headline: 'Typhoon makes landfall with record winds; hundreds of thousands evacuated',
      summary:
        'A powerful typhoon came ashore with sustained winds among the strongest recorded for the region. Mass evacuations were credited with limiting casualties, though flooding cut off several coastal towns.',
      category: 'disaster',
      severity: 4,
      lat: 14.6,
      lon: 120.98,
      locationName: 'Manila, Philippines',
      countryCode: 'PH',
      sources: [
        { url: 'https://www.channelnewsasia.com/asia/sample-typhoon' },
        { url: 'https://apnews.com/article/sample-typhoon' },
        { url: 'https://www.bbc.com/news/world-asia-sample-typhoon' },
      ],
    },
    {
      headline: 'Opposition claims victory in disputed presidential vote as observers cite irregularities',
      summary:
        'Both leading candidates declared victory after a tense election marked by delayed results. International observers reported procedural irregularities in several regions and called for transparency.',
      category: 'politics',
      severity: 3,
      lat: 10.48,
      lon: -66.9,
      locationName: 'Caracas, Venezuela',
      countryCode: 'VE',
      sources: [
        { url: 'https://www.reuters.com/world/americas/sample-election' },
        { url: 'https://elpais.com/internacional/sample-eleccion' },
      ],
    },
    {
      headline: 'Chip manufacturing giant announces largest-ever foundry expansion',
      summary:
        'The company unveiled plans for a multibillion-dollar expansion of advanced chip production capacity, citing surging AI demand. Governments in three countries are competing to host the new fabs.',
      category: 'economy',
      severity: 2,
      lat: 24.77,
      lon: 120.99,
      locationName: 'Hsinchu, Taiwan',
      countryCode: 'TW',
      sources: [
        { url: 'https://www.bloomberg.com/news/articles/sample-fab' },
        { url: 'https://www.nikkei.com/article/sample-fab' },
      ],
    },
    {
      headline: 'Mpox vaccination drive expands as new variant detected in border provinces',
      summary:
        'Health authorities expanded vaccination to border provinces after genomic surveillance flagged a new variant. The WHO said current vaccines are expected to remain effective.',
      category: 'health',
      severity: 3,
      lat: -4.44,
      lon: 15.27,
      locationName: 'Kinshasa, Democratic Republic of the Congo',
      countryCode: 'CD',
      sources: [
        { url: 'https://www.who.int/news/sample-mpox' },
        { url: 'https://www.reuters.com/business/healthcare-pharmaceuticals/sample-mpox' },
      ],
    },
    {
      headline: 'Fusion experiment sustains net-positive reaction for record duration',
      summary:
        'Researchers reported sustaining a net-energy-positive fusion reaction for a record duration, a step toward practical fusion power. Independent verification of the results is pending peer review.',
      category: 'science',
      severity: 2,
      lat: 43.7,
      lon: 5.77,
      locationName: 'Cadarache, France',
      countryCode: 'FR',
      sources: [
        { url: 'https://www.nature.com/articles/sample-fusion' },
        { url: 'https://www.newscientist.com/article/sample-fusion' },
      ],
    },
    {
      headline: 'Amazon deforestation hits lowest level in a decade, satellite data shows',
      summary:
        'New satellite monitoring data showed annual deforestation falling to its lowest level in ten years. Officials credited stepped-up enforcement, while scientists cautioned degraded areas remain vulnerable.',
      category: 'climate',
      severity: 2,
      lat: -3.47,
      lon: -62.21,
      locationName: 'Amazonas, Brazil',
      countryCode: 'BR',
      sources: [
        { url: 'https://www.reuters.com/sustainability/sample-amazon' },
        { url: 'https://www.theguardian.com/environment/sample-amazon' },
      ],
    },
    {
      headline: 'Historic port district fire displaces thousands; cause under investigation',
      summary:
        'A fast-moving fire swept through a dense historic port district overnight, displacing thousands of residents. Investigators are examining an electrical fault as a possible cause.',
      category: 'disaster',
      severity: 2,
      lat: 6.52,
      lon: 3.38,
      locationName: 'Lagos, Nigeria',
      countryCode: 'NG',
      sources: [
        { url: 'https://www.bbc.com/news/world-africa-sample-fire' },
        { url: 'https://apnews.com/article/sample-lagos-fire' },
      ],
    },
    {
      headline: 'Mass protests over pension reform draw hundreds of thousands nationwide',
      summary:
        'Unions said hundreds of thousands marched in cities nationwide against proposed pension changes. The government signaled openness to amendments while defending the reform’s core provisions.',
      category: 'society',
      severity: 2,
      lat: -33.45,
      lon: -70.67,
      locationName: 'Santiago, Chile',
      countryCode: 'CL',
      sources: [
        { url: 'https://www.reuters.com/world/americas/sample-protests' },
        { url: 'https://elpais.com/america/sample-protestas' },
      ],
    },
    {
      headline: 'Arctic shipping lane sees record early opening as sea ice retreats',
      summary:
        'The northern shipping route opened weeks earlier than the historical average as sea-ice extent hit a seasonal record low. Shipping firms are weighing expanded transits against safety and insurance concerns.',
      category: 'climate',
      severity: 2,
      lat: 74.0,
      lon: 100.0,
      locationName: 'Arctic Ocean, Russia',
      countryCode: 'RU',
      sources: [
        { url: 'https://www.bloomberg.com/news/articles/sample-arctic' },
        { url: 'https://www.reuters.com/business/environment/sample-arctic' },
      ],
    },
    {
      headline: 'Peace deal signed ending decade-long insurgency in northern provinces',
      summary:
        'Government negotiators and rebel leaders signed a comprehensive peace accord ending a decade of insurgency. Disarmament is set to begin within 90 days under international monitoring.',
      category: 'conflict',
      severity: 3,
      lat: 12.37,
      lon: -1.53,
      locationName: 'Ouagadougou, Burkina Faso',
      countryCode: 'BF',
      sources: [
        { url: 'https://www.france24.com/en/africa/sample-peace' },
        { url: 'https://www.aljazeera.com/news/sample-peace-deal' },
      ],
    },
    {
      headline: 'AI safety summit ends with 40-nation agreement on frontier model testing',
      summary:
        'Delegates from more than 40 countries agreed to a shared framework for pre-deployment testing of frontier AI models. Implementation details were deferred to a technical working group.',
      category: 'science',
      severity: 2,
      lat: 51.51,
      lon: -0.13,
      locationName: 'London, United Kingdom',
      countryCode: 'GB',
      sources: [
        { url: 'https://www.ft.com/content/sample-ai-summit' },
        { url: 'https://www.theguardian.com/technology/sample-ai-summit' },
        { url: 'https://www.reuters.com/technology/sample-ai-summit' },
      ],
    },
    {
      headline: 'Grain export corridor reopens after month-long blockade, easing food price fears',
      summary:
        'The maritime grain corridor resumed operations after a negotiated end to a month-long blockade. Wheat futures fell sharply on the news, easing pressure on import-dependent economies.',
      category: 'economy',
      severity: 3,
      lat: 46.48,
      lon: 30.73,
      locationName: 'Odesa, Ukraine',
      countryCode: 'UA',
      sources: [
        { url: 'https://www.reuters.com/markets/commodities/sample-grain' },
        { url: 'https://www.bloomberg.com/news/articles/sample-grain' },
      ],
    },
  ],
};

/**
 * Sample staged output of the US & state run (`run-regional.ts --region us
 * --mock`): placeholder state and metro stories across the map, with one
 * deliberately missing its `subdivision` so the gazetteer has to fill it.
 */
export const MOCK_US_STAGED: StagedOutput = {
  events: [
    {
      headline: 'Texas lawmakers open special session on property tax relief',
      summary:
        'Legislators convened in Austin for a special session called by the governor to consider property tax cuts. Leaders of both chambers said they expect votes on competing plans within two weeks.',
      category: 'politics',
      severity: 2,
      lat: 30.27,
      lon: -97.74,
      locationName: 'Austin, Texas, USA',
      countryCode: 'US',
      subdivision: 'US-TX',
      sources: [
        { url: 'https://www.texastribune.org/sample-special-session' },
        { url: 'https://apnews.com/article/sample-texas-session' },
      ],
    },
    {
      headline: 'Washington state wildfire forces evacuations east of the Cascades',
      summary:
        'A fast-moving grass fire prompted level 3 evacuation orders for several rural communities. State fire officials said crews had contained part of the perimeter by evening.',
      category: 'disaster',
      severity: 3,
      lat: 47.04,
      lon: -122.9,
      locationName: 'Olympia, Washington, USA',
      countryCode: 'US',
      subdivision: 'US-WA',
      sources: [
        { url: 'https://www.seattletimes.com/sample-wildfire' },
        { url: 'https://www.kuow.org/stories/sample-wildfire' },
      ],
    },
    {
      headline: 'Port of Savannah approves expansion of container terminal',
      summary:
        'The Georgia Ports Authority board approved a terminal expansion meant to raise annual capacity. Officials said construction would begin next year and add hundreds of jobs.',
      category: 'economy',
      severity: 2,
      lat: 32.08,
      lon: -81.09,
      locationName: 'Savannah, Georgia, USA',
      countryCode: 'US',
      subdivision: 'US-GA',
      sources: [
        { url: 'https://www.ajc.com/sample-port-savannah' },
        { url: 'https://www.savannahnow.com/sample-port' },
      ],
    },
    {
      headline: 'California regulators adopt new rules for statewide water conservation',
      summary:
        'The state water board adopted long-term conservation targets for urban suppliers. Utilities will have several years to meet the new standards, which vary by local climate.',
      category: 'climate',
      severity: 2,
      lat: 38.58,
      lon: -121.49,
      locationName: 'Sacramento, California, USA',
      countryCode: 'US',
      subdivision: 'US-CA',
      sources: [
        { url: 'https://calmatters.org/sample-water-rules' },
        { url: 'https://www.latimes.com/california/sample-water' },
      ],
    },
    {
      headline: 'New York court upholds state congestion pricing program',
      summary:
        'A state appeals court rejected a challenge to the tolling program for lower Manhattan. Transit officials said revenue would continue to fund subway upgrades.',
      category: 'society',
      severity: 2,
      lat: 42.65,
      lon: -73.76,
      locationName: 'Albany, NY, USA',
      countryCode: 'US',
      subdivision: 'US-NY',
      sources: [
        { url: 'https://www.timesunion.com/sample-congestion' },
        { url: 'https://www.nytimes.com/sample-congestion-court' },
      ],
    },
    {
      headline: 'Tampa Bay hospitals expand storm-season backup power plans',
      summary:
        'Regional hospital systems announced investments in backup generation after outages during recent storms. State health officials said the plans exceed new minimum requirements.',
      category: 'health',
      severity: 1,
      lat: 27.95,
      lon: -82.46,
      locationName: 'Tampa, Florida, USA',
      countryCode: 'US',
      subdivision: 'US-FL',
      sources: [
        { url: 'https://www.tampabay.com/sample-hospitals' },
        { url: 'https://www.wusf.org/sample-hospitals' },
      ],
    },
    {
      headline: 'Colorado university researchers report early snowpack gains',
      summary:
        'Researchers said early-season snowfall had pushed mountain snowpack above the long-term median. Water managers cautioned that spring conditions would decide supply.',
      category: 'science',
      severity: 1,
      lat: 40.01,
      lon: -105.27,
      locationName: 'Boulder, Colorado, USA',
      countryCode: 'US',
      sources: [
        { url: 'https://www.denverpost.com/sample-snowpack' },
        { url: 'https://www.cpr.org/sample-snowpack' },
      ],
    },
  ],
};
