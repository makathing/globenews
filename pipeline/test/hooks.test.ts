import { describe, expect, it } from 'vitest';
import { preToolUseLogic, postToolUseLogic, sanitizeUrl, standardizeQuery } from '../src/hooks.ts';
import { RunLedger } from '../src/ledger.ts';

describe('PreToolUse hook', () => {
  it('denies blocklisted satire/fabrication domains', () => {
    const result = preToolUseLogic({
      tool_name: 'WebFetch',
      tool_input: { url: 'https://www.theonion.com/some-story' },
    });
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('theonion.com');
  });

  it('upgrades http to https and strips tracking params', () => {
    const result = preToolUseLogic({
      tool_name: 'WebFetch',
      tool_input: { url: 'http://reuters.com/world/story?utm_source=x&fbclid=abc&page=2' },
    });
    expect(result.decision).toBe('allow');
    const url = String(result.updatedInput?.url);
    expect(url.startsWith('https://')).toBe(true);
    expect(url).not.toContain('utm_source');
    expect(url).not.toContain('fbclid');
    expect(url).toContain('page=2');
  });

  it('denies searches scoped to blocklisted domains', () => {
    const result = preToolUseLogic({
      tool_name: 'WebSearch',
      tool_input: { query: 'site:infowars.com breaking news' },
    });
    expect(result.decision).toBe('deny');
  });

  it('appends recency qualifier to timeless queries only', () => {
    const updated = preToolUseLogic({
      tool_name: 'WebSearch',
      tool_input: { query: 'earthquake japan' },
    });
    expect(String(updated.updatedInput?.query)).toMatch(/earthquake japan \w+ 20\d{2}/);

    const untouched = preToolUseLogic({
      tool_name: 'WebSearch',
      tool_input: { query: 'earthquake japan today' },
    });
    expect(untouched.updatedInput).toBeUndefined();
  });

  it('leaves unrelated tools alone', () => {
    expect(preToolUseLogic({ tool_name: 'Write', tool_input: {} }).decision).toBe('allow');
  });
});

describe('PostToolUse hook', () => {
  it('injects source-intel context and records the ledger', () => {
    const ledger = new RunLedger();
    const result = postToolUseLogic(
      {
        tool_name: 'WebSearch',
        tool_input: { query: 'x' },
        tool_output:
          'Results: https://www.reuters.com/a and https://www.breitbart.com/b and https://tiny-unknown-blog.example/c',
      },
      ledger,
    );
    expect(result.additionalContext).toContain('reuters.com reliability=95/100 bias=center');
    expect(result.additionalContext).toContain('breitbart.com reliability=40/100 bias=right');
    expect(result.additionalContext).toContain('UNRATED');
    expect(ledger.uniqueDomains()).toContain('reuters.com');
    expect(ledger.entries.length).toBe(3);
  });

  it('rates the fetched domain itself for WebFetch', () => {
    const ledger = new RunLedger();
    const result = postToolUseLogic(
      {
        tool_name: 'WebFetch',
        tool_input: { url: 'https://www.bbc.com/news/article' },
        tool_output: 'Article text with no links',
      },
      ledger,
    );
    expect(result.additionalContext).toContain('bbc.com reliability=90/100');
  });

  it('returns nothing when no domains are present', () => {
    const result = postToolUseLogic({ tool_name: 'WebSearch', tool_output: 'nothing' }, new RunLedger());
    expect(result.additionalContext).toBeUndefined();
  });
});

describe('helpers', () => {
  it('sanitizeUrl preserves meaningful params', () => {
    expect(sanitizeUrl('http://a.com/x?utm_campaign=z&id=7')).toBe('https://a.com/x?id=7');
  });

  it('standardizeQuery respects existing timeframes', () => {
    expect(standardizeQuery('floods pakistan last 24 hours')).toBe('floods pakistan last 24 hours');
    expect(standardizeQuery('floods   pakistan', new Date('2026-08-30T00:00:00Z'))).toBe(
      'floods pakistan August 2026',
    );
  });
});
