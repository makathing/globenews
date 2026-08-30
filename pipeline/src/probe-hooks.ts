import { appendFileSync, writeFileSync } from 'node:fs';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { preToolUseLogic, postToolUseLogic, type HookInputLike } from './hooks.ts';
import { RunLedger } from './ledger.ts';

/**
 * Live diagnostic for the hook layer: runs a real query with instrumented
 * Pre/PostToolUse hooks and records exactly what the SDK hands us —
 * field names, tool_output shape, whether updatedInput / deny /
 * additionalContext take effect, and whether hooks fire inside subagents.
 *
 *   npx tsx src/probe-hooks.ts            # direct tools
 *   npx tsx src/probe-hooks.ts --subagent # via an Agent-tool subagent
 */

const LOG = new URL('../.staging/hook-probe.log', import.meta.url).pathname;
writeFileSync(LOG, '');
const log = (tag: string, value: unknown) => {
  const line = `[${tag}] ${JSON.stringify(value)?.slice(0, 1500)}`;
  console.log(line.slice(0, 300));
  appendFileSync(LOG, line + '\n');
};

const ledger = new RunLedger();

const hooks = {
  PreToolUse: [
    {
      matcher: 'WebSearch|WebFetch',
      hooks: [
        async (rawInput: unknown) => {
          const input = rawInput as HookInputLike & Record<string, unknown>;
          log('PRE-IN', {
            keys: Object.keys(input),
            tool_name: input.tool_name,
            tool_input: input.tool_input,
            agent_type: (input as Record<string, unknown>).agent_type,
          });
          const result = preToolUseLogic(input);
          log('PRE-OUT', result);
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
        async (rawInput: unknown) => {
          const input = rawInput as HookInputLike & Record<string, unknown>;
          const outputField =
            'tool_output' in input ? 'tool_output' : 'tool_response' in input ? 'tool_response' : 'MISSING';
          log('POST-IN', {
            keys: Object.keys(input),
            tool_name: input.tool_name,
            tool_input: input.tool_input,
            outputField,
            outputType: typeof (input.tool_output ?? input.tool_response),
            outputPreview: JSON.stringify(input.tool_output ?? input.tool_response)?.slice(0, 600),
          });
          const result = postToolUseLogic(input, ledger);
          log('POST-OUT', { hasContext: !!result.additionalContext, context: result.additionalContext?.slice(0, 300) });
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

const viaSubagent = process.argv.includes('--subagent');

const prompt = viaSubagent
  ? `Invoke the "prober" subagent once with this task: "Run the three steps you were configured for." Then reply DONE plus a one-line summary of what it reported.`
  : `Do these steps in order, then answer:
1. WebSearch for: earthquake news
2. WebFetch this URL and summarize its first paragraph in one line: http://www.reuters.com/world/?utm_source=probe&utm_campaign=x
3. Attempt to WebFetch https://www.theonion.com/ — if the fetch is refused, say REFUSED and why you think so.
Finally: state whether you received any bracketed source-intel annotations about domain reliability after your searches/fetches, and quote one if so.`;

const run = query({
  prompt,
  options: {
    model: 'sonnet',
    allowedTools: ['WebSearch', 'WebFetch', 'Agent'],
    agents: viaSubagent
      ? {
          prober: {
            description: 'Probe subagent used to test hook propagation.',
            model: 'haiku',
            tools: ['WebSearch', 'WebFetch'],
            prompt:
              'You are a probe. Step 1: WebSearch for "flood news". Step 2: WebFetch https://www.bbc.com/news and give a one-line summary. Step 3: report whether you received bracketed [source-intel] annotations, quoting one if so.',
          },
        }
      : undefined,
    permissionMode: 'dontAsk',
    maxTurns: 12,
    settingSources: [],
    hooks: hooks as never,
  },
});

for await (const message of run) {
  if (message.type === 'result') {
    log('RESULT', {
      subtype: message.subtype,
      cost: 'total_cost_usd' in message ? message.total_cost_usd : null,
      text: 'result' in message ? String(message.result).slice(0, 800) : null,
    });
  }
}
log('LEDGER', ledger.toJSON());
