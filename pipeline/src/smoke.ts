import { query } from '@anthropic-ai/claude-agent-sdk';

/** Minimal auth/tool smoke test: `npx tsx src/smoke.ts [--search]` */
const useSearch = process.argv.includes('--search');

const run = query({
  prompt: useSearch
    ? 'Use WebSearch once for "Reuters world news today" and reply with just the first result URL you saw.'
    : 'Reply with exactly: SMOKE_OK',
  options: {
    model: 'haiku',
    allowedTools: useSearch ? ['WebSearch'] : [],
    permissionMode: 'dontAsk',
    
    maxTurns: 4,
    settingSources: [],
  },
});

for await (const message of run) {
  if (message.type === 'result') {
    console.log('subtype:', message.subtype);
    if ('result' in message) console.log('result:', String(message.result).slice(0, 400));
    if ('total_cost_usd' in message) console.log('cost:', message.total_cost_usd);
  }
}
