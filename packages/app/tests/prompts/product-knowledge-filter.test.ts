import { describe, expect, it } from 'vitest';
import type { Legend, Product } from '../../src/db/schema.js';
import { filterProductKnowledge } from '../../src/prompts/product-knowledge-filter.js';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Foreman',
    slug: 'foreman',
    description: 'AI phone answering for home service contractors',
    url: 'https://foreman.com',
    status: 'active',
    valueProps: ['$99/mo', '24/7 coverage', 'books appointments'],
    painPoints: ['missed calls = lost jobs', 'voicemail callback rate is 20%'],
    talkingPoints: ['first week paid for itself', "customers don't know it's AI"],
    competitorComparisons: [
      { name: 'Ruby Receptionists', comparison: '$400+/mo, human but limited hours' },
    ],
    neverSay: ['best answering service', 'replaces your receptionist'],
    targetAudiences: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

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
      discoveryStory: 'Karen found it while googling.',
      usageDuration: '2 months',
      satisfactionLevel: 8,
      complaints: ['sometimes asks one question too many'],
      useCase: 'answering phone while on jobs',
      alternativesConsidered: ['Ruby'],
    },
    opinions: {},
    neverDo: [],
    maturity: 'lurking',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Legend;
}

describe('filterProductKnowledge', () => {
  it('includes product name and description', () => {
    const text = filterProductKnowledge(makeProduct(), makeLegend());
    expect(text).toContain('Foreman');
    expect(text).toContain('AI phone answering');
  });

  it('includes value props', () => {
    const text = filterProductKnowledge(makeProduct(), makeLegend());
    expect(text).toContain('$99/mo');
    expect(text).toContain('24/7 coverage');
  });

  it('includes talking points', () => {
    const text = filterProductKnowledge(makeProduct(), makeLegend());
    expect(text).toContain('first week paid for itself');
  });

  it('includes pain points', () => {
    const text = filterProductKnowledge(makeProduct(), makeLegend());
    expect(text).toContain('missed calls');
  });

  it('includes competitor comparisons', () => {
    const text = filterProductKnowledge(makeProduct(), makeLegend());
    expect(text).toContain('Ruby Receptionists');
    expect(text).toContain('$400+/mo');
  });

  it('includes neverSay as negative constraints', () => {
    const text = filterProductKnowledge(makeProduct(), makeLegend());
    expect(text.toLowerCase()).toMatch(/never.*say|avoid|don.?t.*say/);
    expect(text).toContain('best answering service');
  });

  it('includes product relationship details from the legend', () => {
    const text = filterProductKnowledge(makeProduct(), makeLegend());
    expect(text).toContain('Karen found it');
    expect(text).toContain('2 months');
    expect(text).toContain('8'); // satisfaction level
    expect(text).toContain('one question too many');
  });

  it('omits competitor comparisons section when empty', () => {
    const product = makeProduct({ competitorComparisons: [] });
    const text = filterProductKnowledge(product, makeLegend());
    expect(text.toLowerCase()).not.toContain('vs ruby');
  });

  it('is deterministic for identical inputs', () => {
    const product = makeProduct();
    const legend = makeLegend();
    const a = filterProductKnowledge(product, legend);
    const b = filterProductKnowledge(product, legend);
    expect(a).toBe(b);
  });
});
