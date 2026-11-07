import type { HookInputLike } from './hooks.ts';

/**
 * What the coordinator's subagents handed back, kept as the run goes so a
 * budget stop is not a total loss.
 *
 * The coordinator's own spending cap can land before the synthesizer has
 * written the staging file — the explorers and researchers have done the
 * expensive part, and none of it reaches the map. A PostToolUse hook on the
 * Agent tool records each subagent's returned text here; when the cap hits
 * with nothing staged, the batch runner hands the best of it to a short
 * rescue synthesis instead of throwing the day away.
 */

export interface Finding {
  /** The subagent type that returned it: 'explorer', 'researcher', … */
  agent: string;
  text: string;
}

export class SubagentFindings {
  private readonly items: Finding[] = [];

  add(agent: string, text: string): void {
    const trimmed = text.trim();
    if (trimmed) this.items.push({ agent, text: trimmed });
  }

  of(agent: string): string[] {
    return this.items.filter((item) => item.agent === agent).map((item) => item.text);
  }

  get size(): number {
    return this.items.length;
  }
}

/** The text an Agent tool call returned (`AgentOutput.content[].text`), or '' when it holds none. */
export function agentResultText(response: unknown): string {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return '';
  const record = response as { status?: unknown; content?: unknown };
  if (record.status !== undefined && record.status !== 'completed') return '';
  if (!Array.isArray(record.content)) return '';
  return record.content
    .map((part) =>
      part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : '',
    )
    .filter(Boolean)
    .join('\n');
}

/** PostToolUse logic for the Agent tool ('Task' in older SDKs): keep what the subagent returned. */
export function recordAgentFinding(input: HookInputLike, findings: SubagentFindings): void {
  if (input.tool_name !== 'Agent' && input.tool_name !== 'Task') return;
  const response = input.tool_response ?? input.tool_output;
  const agentType =
    input.tool_input?.subagent_type ??
    (response && typeof response === 'object' ? (response as { agentType?: unknown }).agentType : undefined);
  findings.add(String(agentType ?? 'unknown'), agentResultText(response));
}

export interface RescueMaterial {
  /** Verified research when any came back; the explorers' raw candidates otherwise. */
  basis: 'researcher' | 'explorer';
  text: string;
}

/**
 * What a rescue synthesis should work from. Researcher output is verified, so
 * it wins whenever there is any; explorer candidates are a fallback, and the
 * rescue prompt keeps only those with two or more sources.
 */
export function rescueMaterial(findings: SubagentFindings): RescueMaterial | undefined {
  const researched = findings.of('researcher');
  if (researched.length > 0) return { basis: 'researcher', text: researched.join('\n\n---\n\n') };
  const explored = findings.of('explorer');
  if (explored.length > 0) return { basis: 'explorer', text: explored.join('\n\n---\n\n') };
  return undefined;
}
