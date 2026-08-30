import { z } from 'zod';
import { BIAS_RATINGS, CATEGORIES, type NewsDataset } from '../../shared/news.ts';

export const NewsSourceSchema = z.object({
  url: z.url(),
  domain: z.string().min(3),
  reliability: z.number().min(0).max(100),
  bias: z.enum(BIAS_RATINGS),
  unrated: z.boolean().optional(),
});

export const NewsEventSchema = z.object({
  id: z.string().min(4),
  headline: z.string().min(8).max(200),
  summary: z.string().min(20).max(600),
  category: z.enum(CATEGORIES),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  locationName: z.string().min(2),
  countryCode: z.string().length(2),
  sources: z.array(NewsSourceSchema).min(1).max(10),
  trustScore: z.number().min(0).max(100),
  firstSeen: z.iso.datetime({ offset: true }),
  lastUpdated: z.iso.datetime({ offset: true }),
  isBreaking: z.boolean(),
});

export const NewsDatasetSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  mode: z.enum(['daily', 'breaking']),
  events: z.array(NewsEventSchema).max(100),
});

/**
 * Looser shape for what the synthesizer agent writes to the staging file.
 * The runner fills in trustScore / firstSeen / timestamps deterministically,
 * so agents are not asked to produce (or trusted to invent) those.
 */
export const StagedEventSchema = NewsEventSchema.omit({
  id: true,
  trustScore: true,
  firstSeen: true,
  lastUpdated: true,
  isBreaking: true,
}).extend({
  sources: z
    .array(z.object({ url: z.url() }).or(z.url().transform((url) => ({ url }))))
    .min(1)
    .max(10),
});

export const StagedOutputSchema = z.object({
  events: z.array(StagedEventSchema).min(1).max(100),
});

export type StagedEvent = z.infer<typeof StagedEventSchema>;
export type StagedOutput = z.infer<typeof StagedOutputSchema>;

export function validateDataset(data: unknown): NewsDataset {
  return NewsDatasetSchema.parse(data) as NewsDataset;
}
