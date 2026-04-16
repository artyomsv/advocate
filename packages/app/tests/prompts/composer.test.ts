import { describe, expect, it } from 'vitest';
import type { Legend, Product } from '../../src/db/schema.js';
import { composePrompt } from '../../src/prompts/composer.js';
import type { ComposePromptInput, PromptContext } from '../../src/prompts/types.js';

function makeLegend(overrides: Partial<Legend> = {}): Legend {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    productId: '22222222-2222-4222-8222-222222222222',
    agentId: null,
    firstName: 'Dave',
    lastName: 'K',
    gender: 'male',
    age: 42,
    location: {
      city: 'Columbus',
      state: 'OH',
      country: 'USA',
      timezone: 'America/New_York',
    },
    lifeDetails: { maritalStatus: 'married' },
    professional: {
      occupation: 'Plumber',
      company: 'X',
      industry: 'Y',
      yearsExperience: 15,
      education: 'Z',
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
      commonTypos: [],
      commonPhrases: [],
      avoidedPhrases: [],
      paragraphStyle: 'varied',
      listStyle: 'never',
      usesEmojis: false,
      formality: 4,
    },
    activeHours: { start: 6, end: 19 },
    activeDays: [1, 2, 3, 4, 5],
    averagePostLength: 'medium',
    hobbies: ['football'],
    otherInterests: null,
    expertiseAreas: ['plumbing'],
    knowledgeGaps: ['tech'],
    productRelationship: {
      discoveryStory: 'Karen found it.',
      usageDuration: '2 months',
      satisfactionLevel: 8,
      complaints: [],
      useCase: 'answering phone',
      alternativesConsidered: [],
    },
    opinions: {},
    neverDo: [],
    maturity: 'lurking',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Legend;
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Foreman',
    slug: 'foreman',
    description: 'AI phone answering',
    url: 'https://foreman.com',
    status: 'active',
    valueProps: ['$99/mo'],
    painPoints: ['missed calls'],
    talkingPoints: ['first week pays'],
    competitorComparisons: null,
    neverSay: null,
    targetAudiences: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    task: {
      type: 'helpful_comment',
      promotionLevel: 0,
      instructions: 'Write a helpful comment.',
    },
    ...overrides,
  };
}

describe('composePrompt', () => {
  it('returns ComposedPrompt with systemPrompt and userPrompt', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: null,
      context: makeContext(),
    };
    const result = composePrompt(input);
    expect(result).toHaveProperty('systemPrompt');
    expect(result).toHaveProperty('userPrompt');
    expect(typeof result.systemPrompt).toBe('string');
    expect(typeof result.userPrompt).toBe('string');
  });

  it('systemPrompt contains Soul content (legend name)', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: null,
      context: makeContext(),
    };
    const result = composePrompt(input);
    expect(result.systemPrompt).toContain('Dave');
  });

  it('systemPrompt contains Product Knowledge when product provided', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: makeProduct(),
      context: makeContext(),
    };
    const result = composePrompt(input);
    expect(result.systemPrompt).toContain('Foreman');
    expect(result.systemPrompt).toContain('PRODUCT YOU USE');
  });

  it('systemPrompt omits Product Knowledge cleanly when product is null', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: null,
      context: makeContext(),
    };
    const result = composePrompt(input);
    expect(result.systemPrompt).not.toContain('PRODUCT YOU USE');
  });

  it('systemPrompt contains Context', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: null,
      context: makeContext(),
    };
    const result = composePrompt(input);
    expect(result.systemPrompt).toContain('CURRENT TASK');
    expect(result.systemPrompt).toContain('helpful_comment');
  });

  it('userPrompt equals task instructions', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: null,
      context: makeContext(),
    };
    const result = composePrompt(input);
    expect(result.userPrompt).toBe('Write a helpful comment.');
  });

  it('systemPrompt separates Soul + Product + Context with separator', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: makeProduct(),
      context: makeContext(),
    };
    const result = composePrompt(input);
    expect(result.systemPrompt).toContain('---');
  });

  it('deterministic for identical inputs', () => {
    const input: ComposePromptInput = {
      legend: makeLegend(),
      product: makeProduct(),
      context: makeContext(),
    };
    const a = composePrompt(input);
    const b = composePrompt(input);
    expect(a.systemPrompt).toBe(b.systemPrompt);
    expect(a.userPrompt).toBe(b.userPrompt);
  });
});
