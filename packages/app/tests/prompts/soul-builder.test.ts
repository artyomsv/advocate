import { describe, expect, it } from 'vitest';
import type { Legend } from '../../src/db/schema.js';
import { buildSoulPrompt } from '../../src/prompts/soul-builder.js';

function makeLegend(overrides: Partial<Legend> = {}): Legend {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    agentId: null,
    firstName: 'Dave',
    lastName: 'Kowalski',
    gender: 'male',
    age: 42,
    location: {
      city: 'Columbus',
      state: 'OH',
      country: 'USA',
      timezone: 'America/New_York',
    },
    lifeDetails: { maritalStatus: 'married', partnerName: 'Karen' },
    professional: {
      occupation: 'Plumber',
      company: 'Kowalski Plumbing',
      industry: 'Home services',
      yearsExperience: 15,
      education: 'Trade school',
    },
    bigFive: {
      openness: 4,
      conscientiousness: 8,
      extraversion: 5,
      agreeableness: 6,
      neuroticism: 4,
    },
    techSavviness: 3,
    typingStyle: {
      capitalization: 'mixed',
      punctuation: 'minimal',
      commonTypos: ['definately'],
      commonPhrases: ['to be honest'],
      avoidedPhrases: ['leverage'],
      paragraphStyle: 'varied',
      listStyle: 'never',
      usesEmojis: false,
      formality: 4,
    },
    activeHours: { start: 6, end: 19 },
    activeDays: [1, 2, 3, 4, 5, 6],
    averagePostLength: 'medium',
    hobbies: ['football', 'grilling'],
    otherInterests: null,
    expertiseAreas: ['plumbing', 'small business operations'],
    knowledgeGaps: ['web development', 'marketing jargon'],
    productRelationship: {
      discoveryStory: 'Karen found it.',
      usageDuration: '2 months',
      satisfactionLevel: 8,
      complaints: ['sometimes too many questions'],
      useCase: 'Phone answering service',
      alternativesConsidered: ['Ruby Receptionists'],
    },
    opinions: { 'ai in trades': 'cautiously optimistic' },
    neverDo: ['use marketing jargon', 'pretend to know webdev'],
    maturity: 'lurking',
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  } as Legend;
}

describe('buildSoulPrompt', () => {
  it("includes the legend's first and last name", () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt).toContain('Dave');
    expect(prompt).toContain('Kowalski');
  });

  it('includes age and location', () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt).toContain('42');
    expect(prompt).toContain('Columbus');
    expect(prompt).toContain('OH');
  });

  it('includes occupation', () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt.toLowerCase()).toContain('plumber');
  });

  it('describes high conscientiousness + low openness as pragmatic/cautious', () => {
    const prompt = buildSoulPrompt(makeLegend());
    // Default fixture: conscientiousness=8 (high), openness=4 (medium)
    expect(prompt).toMatch(/disciplined|organized|conscientious/i);
  });

  it('describes low tech savviness', () => {
    const prompt = buildSoulPrompt(makeLegend({ techSavviness: 2 }));
    expect(prompt.toLowerCase()).toMatch(/not.*tech|tech.*illiter|low tech|non-tech/);
  });

  it('describes high tech savviness', () => {
    const prompt = buildSoulPrompt(makeLegend({ techSavviness: 9 }));
    expect(prompt.toLowerCase()).toMatch(/tech-savvy|technical|fluent/);
  });

  it('includes typing style markers (capitalization + punctuation hints)', () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt.toLowerCase()).toMatch(/capitalization|punctuation|typing/);
    expect(prompt).toContain('definately'); // common typo included
  });

  it('includes expertise areas and knowledge gaps', () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt).toContain('plumbing');
    expect(prompt).toContain('web development');
  });

  it('includes partner name when present (life detail)', () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt).toContain('Karen');
  });

  it('includes the "never do" list verbatim', () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt).toContain('use marketing jargon');
    expect(prompt).toContain('pretend to know webdev');
  });

  it('is byte-identical for identical inputs (deterministic)', () => {
    const legend = makeLegend();
    const a = buildSoulPrompt(legend);
    const b = buildSoulPrompt(legend);
    expect(a).toBe(b);
  });

  it("starts with a 'You are' identity statement", () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt.trim().slice(0, 20)).toMatch(/^You are/i);
  });
});
