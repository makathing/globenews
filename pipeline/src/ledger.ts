import { rateDomain, normalizeDomain } from './source-ratings.ts';
import type { BiasRating } from '../../shared/news.ts';

export interface LedgerEntry {
  domain: string;
  reliability: number;
  bias: BiasRating;
  unrated: boolean;
  tool: string;
  seenAt: string;
}

/**
 * Run ledger: every domain the agents touch (via WebSearch results or WebFetch)
 * is recorded here by the PostToolUse hook. The runner uses it as the
 * deterministic record for final trust scoring — agents never self-report scores.
 */
export class RunLedger {
  readonly entries: LedgerEntry[] = [];

  record(domain: string, tool: string): LedgerEntry {
    const rating = rateDomain(domain);
    const entry: LedgerEntry = {
      domain: normalizeDomain(domain),
      reliability: rating.reliability,
      bias: rating.bias,
      unrated: rating.unrated,
      tool,
      seenAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  uniqueDomains(): string[] {
    return [...new Set(this.entries.map((entry) => entry.domain))];
  }

  toJSON(): LedgerEntry[] {
    return this.entries;
  }
}

/** Pull every http(s) URL out of an arbitrary tool output structure. */
export function extractUrls(value: unknown): string[] {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const matches = text.match(/https?:\/\/[^\s"'<>\\)\]}]+/g) ?? [];
  return [...new Set(matches)];
}

export function extractDomains(value: unknown): string[] {
  const domains = new Set<string>();
  for (const url of extractUrls(value)) {
    try {
      domains.add(normalizeDomain(new URL(url).hostname));
    } catch {
      // unparsable URL fragment — skip
    }
  }
  return [...domains];
}
