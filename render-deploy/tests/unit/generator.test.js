import { describe, it, expect, beforeEach } from 'vitest';
import { generateSingleBot } from '../../backend/generator.js';
import { checkDomainRelevance } from '../../backend/domainGuard.js';
import { isCurrentQuery } from '../../backend/currentInfo.js';

describe('Procedural bot generator (Checkpoint 0-3)', () => {
  it('generates a complete bot', async () => {
    const bot = await generateSingleBot();
    expect(bot.id).toBeTruthy();
    expect(bot.name).toBeTruthy();
    expect(bot.domain).toBeTruthy();
    expect(bot.subdomain).toBeTruthy();
    expect(bot.systemPrompt.length).toBeGreaterThan(50);
    expect(bot.designDna.theme).toBeTruthy();
    expect(bot.designDna.primaryColor).toMatch(/^#/);
    expect(Array.isArray(bot.starterQuestions)).toBe(true);
    expect(bot.starterQuestions.length).toBeGreaterThanOrEqual(3);
    expect(bot.domainProfile).toBeTruthy();
  });

  it('produces unique bots across calls', async () => {
    const a = await generateSingleBot();
    const b = await generateSingleBot();
    expect(a.id).not.toBe(b.id);
  });

  it('generates 10 bots without error', async () => {
    const bots = await Promise.all(Array.from({ length: 10 }, () => generateSingleBot()));
    expect(bots).toHaveLength(10);
  });
});

describe('Domain Guard (Checkpoint 0-3)', () => {
  let bot;
  beforeEach(async () => {
    bot = await generateSingleBot();
  });

  it('allows its own domain', async () => {
    const r = await checkDomainRelevance(bot, `Tell me about ${bot.subdomain}`, []);
    expect(r.relevant).toBe(true);
  });

  it('never refuses greetings', async () => {
    const r = await checkDomainRelevance(bot, 'hi', []);
    expect(r.kind).toBe('greeting');
    expect(r.relevant).toBe(true);
  });
});

describe('Current-info detection (Checkpoint 0)', () => {
  it('detects temporal queries', () => {
    expect(isCurrentQuery('who won the match yesterday')).toBe(true);
  });
  it('passes static queries', () => {
    expect(isCurrentQuery('explain photosynthesis')).toBe(false);
  });
});
