import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DAILY_BUDGET_USD,
  PipelineError,
  RESCUE_RESERVE_USD,
  budgetFromEnv,
  coordinatorBudget,
  runBatchAgents,
  type CoordinatorConfig,
  type CoordinatorMessage,
} from '../src/batch.ts';
import {
  SubagentFindings,
  agentResultText,
  recordAgentFinding,
  rescueMaterial,
} from '../src/findings.ts';
import { rescuePrompt } from '../src/agents.ts';
import { RunLedger } from '../src/ledger.ts';

const validEvent = {
  headline: 'Parliament passes a major budget after a week of tense negotiations',
  summary:
    'A verified multi-source event summary that is comfortably within limits and describes what happened factually.',
  category: 'politics',
  severity: 3,
  lat: 52.52,
  lon: 13.4,
  locationName: 'Berlin, Germany',
  countryCode: 'DE',
  sources: [{ url: 'https://apnews.com/a' }, { url: 'https://www.reuters.com/b' }],
};

const RESEARCH = 'VERIFIED: Parliament passes budget | Berlin, Germany | politics | sev 3 | https://apnews.com/a https://www.reuters.com/b';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'globenews-rescue-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

type HookFn = (input: unknown) => Promise<unknown>;
interface Options {
  maxBudgetUsd?: number;
  allowedTools?: string[];
  hooks?: { PostToolUse?: { matcher: string; hooks: HookFn[] }[] };
}

/** Feed an Agent tool result through the hooks the coordinator was given, as the SDK would. */
async function returnFromSubagent(options: Options, agent: string, text: string): Promise<void> {
  const entry = options.hooks?.PostToolUse?.find((hook) => hook.matcher.split('|').includes('Agent'));
  if (!entry) throw new Error('no Agent PostToolUse hook was registered');
  for (const hook of entry.hooks) {
    await hook({
      hook_event_name: 'PostToolUse',
      tool_name: 'Agent',
      tool_input: { subagent_type: agent, prompt: '…' },
      tool_response: { status: 'completed', agentType: agent, content: [{ type: 'text', text }] },
    });
  }
}

/**
 * The coordinator returns `subagentResults` through its hooks, then stops on
 * the budget cap without staging. The second call is the rescue: it writes
 * `rescueWrites` (if any) to the path its prompt names.
 */
function capBeforeStaging(subagentResults: [string, string][], rescueWrites?: string) {
  const calls: { prompt: string; options: Options }[] = [];
  const config: CoordinatorConfig = {
    tag: 'daily',
    stagingStem: 'events',
    budgetUsd: 12,
    agents: {},
    stagingDir: dir,
    prompt: (path) => `write to ${path}`,
    rescuePrompt: (path, material) => rescuePrompt('SYNTH', path, material),
    query: ({ prompt, options }) => {
      const opts = (options ?? {}) as Options;
      calls.push({ prompt, options: opts });
      const isRescue = calls.length > 1;
      return (async function* (): AsyncGenerator<CoordinatorMessage> {
        if (!isRescue) {
          for (const [agent, text] of subagentResults) await returnFromSubagent(opts, agent, text);
          yield { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 10.51 };
          return;
        }
        const path = prompt.match(/absolute path: (\S+)/)?.[1];
        if (rescueWrites !== undefined && path) writeFileSync(path, rescueWrites);
        yield { type: 'result', subtype: 'success', total_cost_usd: 0.4 };
      })();
    },
  };
  return { config, calls };
}

describe('rescue synthesis after a budget stop with nothing staged', () => {
  it('publishes what the researchers found', async () => {
    const { config, calls } = capBeforeStaging(
      [
        ['explorer', 'CANDIDATE: something in Europe'],
        ['researcher', RESEARCH],
      ],
      JSON.stringify({ events: [validEvent] }),
    );
    const result = await runBatchAgents(config, new RunLedger());

    expect(result.staged.events).toHaveLength(1);
    expect(result.stoppedEarly).toBe('error_max_budget_usd+rescue');
    expect(calls).toHaveLength(2);
    // the coordinator spends the budget less the reserve; the rescue spends the reserve
    expect(calls[0].options.maxBudgetUsd).toBe(12 - RESCUE_RESERVE_USD);
    expect(calls[1].options.maxBudgetUsd).toBe(RESCUE_RESERVE_USD);
    expect(calls[1].options.allowedTools).toEqual(['Write']);
    // researcher output is the material; explorer candidates are not
    expect(calls[1].prompt).toContain(RESEARCH);
    expect(calls[1].prompt).not.toContain('CANDIDATE: something in Europe');
    expect(calls[1].prompt).toContain('VERIFIED research');
  });

  it('falls back to explorer candidates when no research came back', async () => {
    const { config, calls } = capBeforeStaging(
      [['explorer', 'CANDIDATE: Parliament budget | Berlin | 2 sources']],
      JSON.stringify({ events: [validEvent] }),
    );
    const result = await runBatchAgents(config, new RunLedger());
    expect(result.staged.events).toHaveLength(1);
    expect(calls[1].prompt).toContain('CANDIDATE: Parliament budget');
    expect(calls[1].prompt).toContain('two or more independent source URLs');
  });

  it('still fails, without a rescue call, when no subagent returned anything', async () => {
    const { config, calls } = capBeforeStaging([], JSON.stringify({ events: [validEvent] }));
    const error = await runBatchAgents(config, new RunLedger()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PipelineError);
    expect((error as PipelineError).retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('still fails when the rescue writes nothing usable', async () => {
    const { config, calls } = capBeforeStaging([['researcher', RESEARCH]], '{"events": []}');
    const error = await runBatchAgents(config, new RunLedger()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PipelineError);
    expect((error as PipelineError).message).toContain('error_max_budget_usd');
    expect(calls).toHaveLength(2);
  });

  it('prefers what the synthesizer already staged over a rescue', async () => {
    const calls: Options[] = [];
    const config: CoordinatorConfig = {
      tag: 'daily',
      stagingStem: 'events',
      budgetUsd: 12,
      agents: {},
      stagingDir: dir,
      prompt: (path) => path,
      rescuePrompt: (path, material) => rescuePrompt('SYNTH', path, material),
      query: ({ prompt, options }) => {
        calls.push((options ?? {}) as Options);
        return (async function* (): AsyncGenerator<CoordinatorMessage> {
          await returnFromSubagent((options ?? {}) as Options, 'researcher', RESEARCH);
          writeFileSync(prompt, JSON.stringify({ events: [validEvent] }));
          yield { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 10.5 };
        })();
      },
    };
    const result = await runBatchAgents(config, new RunLedger());
    expect(result.stoppedEarly).toBe('error_max_budget_usd');
    expect(calls).toHaveLength(1);
  });
});

describe('daily budget', () => {
  it('defaults to $12 and honours PIPELINE_MAX_BUDGET_USD', () => {
    expect(DEFAULT_DAILY_BUDGET_USD).toBe(12);
    expect(budgetFromEnv('PIPELINE_MAX_BUDGET_USD', DEFAULT_DAILY_BUDGET_USD, {})).toBe(12);
    expect(budgetFromEnv('PIPELINE_MAX_BUDGET_USD', DEFAULT_DAILY_BUDGET_USD, { PIPELINE_MAX_BUDGET_USD: '15' })).toBe(15);
  });

  it('reserves the rescue budget only when a rescue is configured', () => {
    expect(coordinatorBudget({ budgetUsd: 12 })).toBe(12);
    expect(coordinatorBudget({ budgetUsd: 12, rescuePrompt: () => '' })).toBe(10.5);
    // a tiny override never hands the coordinator less than half
    expect(coordinatorBudget({ budgetUsd: 2, rescuePrompt: () => '' })).toBe(1);
  });
});

describe('subagent findings', () => {
  it('reads the text an Agent tool call returned', () => {
    expect(agentResultText({ status: 'completed', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('a\nb');
    expect(agentResultText({ status: 'async_launched', agentId: 'x' })).toBe('');
    expect(agentResultText('plain')).toBe('plain');
    expect(agentResultText(null)).toBe('');
  });

  it('records only Agent/Task results, by subagent type', () => {
    const findings = new SubagentFindings();
    recordAgentFinding({ tool_name: 'WebSearch', tool_response: 'ignored' }, findings);
    recordAgentFinding(
      { tool_name: 'Task', tool_input: { subagent_type: 'researcher' }, tool_response: 'verified stuff' },
      findings,
    );
    recordAgentFinding(
      { tool_name: 'Agent', tool_response: { status: 'completed', agentType: 'explorer', content: [{ type: 'text', text: 'cands' }] } },
      findings,
    );
    expect(findings.size).toBe(2);
    expect(rescueMaterial(findings)).toEqual({ basis: 'researcher', text: 'verified stuff' });
    expect(findings.of('explorer')).toEqual(['cands']);
  });
});
