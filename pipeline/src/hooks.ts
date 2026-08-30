import { isBlockedDomain, rateDomain, normalizeDomain } from './source-ratings.ts';
import { RunLedger, extractDomains } from './ledger.ts';

/**
 * Pre/PostToolUse hooks for the Claude Agent SDK.
 *
 * PreToolUse (WebSearch|WebFetch): standardizes inputs before the tool runs —
 * forces https, strips tracking params, nudges searches toward recency — and
 * denies fetches of satire/fabrication domains outright.
 *
 * PostToolUse (WebSearch|WebFetch): scores every domain the tool touched
 * against the bundled source-ratings table, injects the scores back into the
 * agent's context as `[source-intel]` lines, and records each sighting in the
 * run ledger used for deterministic trust scoring.
 *
 * Hook shapes follow the SDK contract (input.tool_name / tool_input /
 * tool_output; output via hookSpecificOutput). Typed loosely on purpose so the
 * logic is unit-testable without importing SDK internals.
 */

export interface HookInputLike {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  tool_response?: unknown;
}

const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'igshid',
  'ref',
  'smid',
  'partner',
];

export function sanitizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol === 'http:') url.protocol = 'https:';
  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

/** Append a recency qualifier unless the query already pins a timeframe. */
export function standardizeQuery(query: string, now = new Date()): string {
  const trimmed = query.replace(/\s+/g, ' ').trim();
  const hasTimeframe =
    /\b(20\d{2}|today|yesterday|this week|breaking|latest|past \d+|last \d+|hours?)\b/i.test(
      trimmed,
    );
  if (hasTimeframe) return trimmed;
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${trimmed} ${month} ${now.getUTCFullYear()}`;
}

export function preToolUseLogic(input: HookInputLike): {
  decision: 'allow' | 'deny';
  reason?: string;
  updatedInput?: Record<string, unknown>;
} {
  const toolInput = input.tool_input ?? {};

  if (input.tool_name === 'WebFetch') {
    const rawUrl = String(toolInput.url ?? '');
    try {
      const domain = normalizeDomain(new URL(rawUrl).hostname);
      if (isBlockedDomain(domain)) {
        return {
          decision: 'deny',
          reason: `Domain ${domain} is blocklisted (satire/fabrication). Use a reputable news source instead.`,
        };
      }
      const sanitized = sanitizeUrl(rawUrl);
      if (sanitized !== rawUrl) {
        return { decision: 'allow', updatedInput: { ...toolInput, url: sanitized } };
      }
      return { decision: 'allow' };
    } catch {
      return { decision: 'deny', reason: `Unparsable URL: ${rawUrl}` };
    }
  }

  if (input.tool_name === 'WebSearch') {
    const query = String(toolInput.query ?? '');
    const blocked = query.match(/site:([\w.-]+)/i);
    if (blocked && isBlockedDomain(blocked[1])) {
      return {
        decision: 'deny',
        reason: `Refusing to search blocklisted domain ${blocked[1]}.`,
      };
    }
    const standardized = standardizeQuery(query);
    if (standardized !== query) {
      return { decision: 'allow', updatedInput: { ...toolInput, query: standardized } };
    }
    return { decision: 'allow' };
  }

  return { decision: 'allow' };
}

export function postToolUseLogic(
  input: HookInputLike,
  ledger: RunLedger,
): { additionalContext?: string } {
  const output = input.tool_output ?? input.tool_response;
  const domains = new Set<string>(extractDomains(output));

  if (input.tool_name === 'WebFetch') {
    const rawUrl = String(input.tool_input?.url ?? '');
    try {
      domains.add(normalizeDomain(new URL(rawUrl).hostname));
    } catch {
      // ignore
    }
  }

  if (domains.size === 0) return {};

  const lines: string[] = [];
  for (const domain of domains) {
    const rating = rateDomain(domain);
    ledger.record(domain, input.tool_name ?? 'unknown');
    const tag = rating.unrated ? ' UNRATED(conservative default)' : '';
    lines.push(`[source-intel] ${domain} reliability=${rating.reliability}/100 bias=${rating.bias}${tag}`);
  }

  return {
    additionalContext:
      `Source reliability & bias assessment for domains just accessed (authoritative — use these ` +
      `scores, do not invent your own):\n${lines.join('\n')}\n` +
      `Prefer corroborating claims across domains rated >=75, and treat single-source or ` +
      `low-reliability claims as unverified.`,
  };
}

/** Build the SDK `options.hooks` object wired to a run ledger. */
export function buildHooks(ledger: RunLedger) {
  return {
    PreToolUse: [
      {
        matcher: 'WebSearch|WebFetch',
        hooks: [
          async (input: unknown) => {
            const result = preToolUseLogic(input as HookInputLike);
            if (result.decision === 'deny') {
              return {
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse' as const,
                  permissionDecision: 'deny' as const,
                  permissionDecisionReason: result.reason,
                },
              };
            }
            if (result.updatedInput) {
              return {
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse' as const,
                  permissionDecision: 'allow' as const,
                  updatedInput: result.updatedInput,
                },
              };
            }
            return {};
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'WebSearch|WebFetch',
        hooks: [
          async (input: unknown) => {
            const result = postToolUseLogic(input as HookInputLike, ledger);
            if (!result.additionalContext) return {};
            return {
              hookSpecificOutput: {
                hookEventName: 'PostToolUse' as const,
                additionalContext: result.additionalContext,
              },
            };
          },
        ],
      },
    ],
  };
}
