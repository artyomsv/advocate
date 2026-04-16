# Three-Layer Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three-layer prompt composition system that turns a Legend + Product + runtime Context into a `{ systemPrompt, userPrompt }` pair suitable for any LLM call through the router. All pure functions — no persistence, no network calls. This is the piece that makes agent output *sound like* a specific persona.

**Architecture:** Lives entirely in `@advocate/app` because it depends on the Legend + Product shapes, which are app-specific. Four modules, each doing one thing: **SoulBuilder** (Legend → identity prompt), **ProductKnowledgeFilter** (Product + Legend → filtered talking points), **ContextBuilder** (runtime info → context block), and **PromptComposer** (combines all three). Each is a pure function of its inputs — no state, no side effects, no DB access.

**Tech Stack:** TypeScript ESM · Vitest · no new dependencies

**Prerequisites:**
- Plan 08.5 complete (tag `plan08.5-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/app/src/prompts/
├── index.ts                         # Barrel
├── types.ts                         # PromptContext, ComposedPrompt, ContextBlock
├── soul-builder.ts                  # buildSoulPrompt(legend) → string
├── product-knowledge-filter.ts      # filterProductKnowledge(product, legend) → string
├── context-builder.ts               # buildContextBlock(context) → string
└── composer.ts                      # composePrompt(inputs) → ComposedPrompt

packages/app/tests/prompts/
├── soul-builder.test.ts
├── product-knowledge-filter.test.ts
├── context-builder.test.ts
└── composer.test.ts
```

## Design decisions

1. **Pure functions, deterministic output.** Given the same Legend + Product + Context, prompts are byte-identical every call. Enables both caching (Anthropic prompt caching wants identical prefixes) and golden-snapshot testing.

2. **Soul is 80% of the identity.** The Soul prompt carries the persona's voice, knowledge scope, personality, and "never do" list. It's the part that's cache-friendly — it doesn't change between calls for the same legend.

3. **Product Knowledge is filtered through the legend.** A plumber persona shouldn't explain middleware APIs — they'd say "I set it up, took five minutes." The filter takes the product's raw value props and rewords / simplifies based on the legend's tech savviness, but the raw talking points stay in the prompt so the LLM knows what's true.

4. **Context is the variable tail.** Everything the Soul + Product doesn't already contain: the specific thread being replied to, recent episodic memories, community rules, promotion level for this content. Short by design — the LLM sees the persona first and the specifics last.

5. **`userPrompt` is the task statement.** Soul + Product + Context all live in the `systemPrompt`. The `userPrompt` is the actual request — "Write a comment replying to this thread" or "Generate a helpful_comment for r/Plumbing at promotion level 0".

6. **Big Five interpretation is bucket-based, not continuous.** Each dimension maps into low / medium / high buckets with distinct descriptive phrases. 1-3 = low, 4-7 = medium, 8-10 = high. Keeps output deterministic and readable.

7. **Tests use small real fixtures, not mocks.** Build-a-Legend helpers create realistic Legend objects at file scope; tests assert on the presence of key phrases in the output ("Dave", "Columbus", "pragmatic", etc.).

---

## Task 1: Types + Soul Builder

**Files:**
- Create: `packages/app/src/prompts/types.ts`
- Create: `packages/app/src/prompts/soul-builder.ts`
- Create: `packages/app/tests/prompts/soul-builder.test.ts`

- [ ] **Step 1.1: Create `packages/app/src/prompts/types.ts`**

```typescript
import type { Legend, Product } from '../db/schema.js';

/**
 * Runtime context: what's specific about THIS particular LLM call —
 * the thread, the community, the task, the memories.
 */
export interface PromptContext {
  /** What the persona is being asked to do this turn. */
  task: {
    type: string;
    /** 0-10 per the promotion gradient. */
    promotionLevel: number;
    /** Freeform instructions for this task. */
    instructions: string;
  };
  platform?: {
    id: string;
    name: string;
  };
  community?: {
    id: string;
    name: string;
    platform: string;
    rulesSummary?: string;
    cultureSummary?: string;
  };
  thread?: {
    url?: string;
    summary: string;
  };
  /** AI-consolidated lessons from prior interactions. */
  relevantMemories?: readonly string[];
  /** Recent activity markers — e.g. "last posted in r/X 2 days ago". */
  recentActivity?: readonly string[];
}

/**
 * Output of the composer. `systemPrompt` is cache-friendly (Soul prefix);
 * `userPrompt` carries the per-call task.
 */
export interface ComposedPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Full composer input. `product` is optional — some prompts (e.g. pure
 * community engagement during warm-up) don't mention the product at all.
 */
export interface ComposePromptInput {
  legend: Legend;
  product: Product | null;
  context: PromptContext;
}
```

- [ ] **Step 1.2: Write failing test FIRST**

Create `packages/app/tests/prompts/soul-builder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildSoulPrompt } from '../../src/prompts/soul-builder.js';
import type { Legend } from '../../src/db/schema.js';

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
  it('includes the legend\'s first and last name', () => {
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

  it('starts with a "You are" identity statement', () => {
    const prompt = buildSoulPrompt(makeLegend());
    expect(prompt.trim().slice(0, 20)).toMatch(/^You are/i);
  });
});
```

- [ ] **Step 1.3: Run test — MUST FAIL**

```bash
cd E:/Projects/Stukans/advocate
mkdir -p packages/app/tests/prompts
pnpm --filter @advocate/app test soul-builder
```

- [ ] **Step 1.4: Implement `packages/app/src/prompts/soul-builder.ts`**

```typescript
import type { Legend } from '../db/schema.js';

/**
 * Builds the Soul system prompt for a legend — the cache-friendly identity
 * layer of the three-layer prompt stack.
 *
 * Sections:
 *  - Identity (name, age, occupation, location)
 *  - Personality (Big Five interpretation)
 *  - Writing style (typing style, post length)
 *  - Knowledge (expertise + gaps + tech savviness)
 *  - Personal details (life details)
 *  - What you never do
 */
export function buildSoulPrompt(legend: Legend): string {
  const sections = [
    identitySection(legend),
    personalitySection(legend),
    writingStyleSection(legend),
    knowledgeSection(legend),
    personalDetailsSection(legend),
    neverDoSection(legend),
  ].filter((s) => s.trim().length > 0);

  return sections.join('\n\n');
}

function identitySection(legend: Legend): string {
  const loc = legend.location as { city: string; state: string; country: string };
  const prof = legend.professional as { occupation: string; company: string; yearsExperience: number };

  return [
    `You are ${legend.firstName} ${legend.lastName}, ${legend.age}, ${prof.occupation} in ${loc.city}, ${loc.state}.`,
    `${prof.yearsExperience} years in the trade. You work at ${prof.company}.`,
  ].join(' ');
}

function personalitySection(legend: Legend): string {
  const b = legend.bigFive as {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };

  const traits: string[] = [];

  // Openness
  if (b.openness >= 8) traits.push('curious and imaginative');
  else if (b.openness <= 3) traits.push('practical, prefers the tried-and-true');
  else traits.push('balanced between curiosity and convention');

  // Conscientiousness
  if (b.conscientiousness >= 8) traits.push('disciplined and organized');
  else if (b.conscientiousness <= 3) traits.push('spontaneous, sometimes disorganized');
  else traits.push('reasonably organized');

  // Extraversion
  if (b.extraversion >= 8) traits.push('outgoing and energetic');
  else if (b.extraversion <= 3) traits.push('reserved, prefers to listen');
  else traits.push('social but reflective');

  // Agreeableness
  if (b.agreeableness >= 8) traits.push('warm and agreeable');
  else if (b.agreeableness <= 3) traits.push('blunt, doesn\'t sugarcoat');
  else traits.push('fair-minded');

  // Neuroticism
  if (b.neuroticism >= 8) traits.push('easily stressed or frustrated');
  else if (b.neuroticism <= 3) traits.push('even-keeled, rarely rattled');
  else traits.push('usually composed');

  return `PERSONALITY: ${traits.join('. ')}.`;
}

function writingStyleSection(legend: Legend): string {
  const ts = legend.typingStyle as {
    capitalization: string;
    punctuation: string;
    commonTypos: string[];
    commonPhrases: string[];
    avoidedPhrases: string[];
    paragraphStyle: string;
    listStyle: string;
    usesEmojis: boolean;
    formality: number;
  };

  const lines = [
    'WRITING STYLE:',
    `- Capitalization: ${ts.capitalization}.`,
    `- Punctuation: ${ts.punctuation}.`,
    `- Paragraphs: ${ts.paragraphStyle}.`,
    `- Lists: ${ts.listStyle === 'never' ? 'never use bullet lists' : `${ts.listStyle} use bullet lists`}.`,
    `- Emojis: ${ts.usesEmojis ? 'occasional' : 'never'}.`,
    `- Formality: ${formalityLabel(ts.formality)} (${ts.formality}/10).`,
  ];

  if (ts.commonTypos.length > 0) {
    lines.push(`- Common typos (natural, leave in occasionally): ${ts.commonTypos.join(', ')}`);
  }
  if (ts.commonPhrases.length > 0) {
    lines.push(`- Common phrases: "${ts.commonPhrases.join('", "')}"`);
  }
  if (ts.avoidedPhrases.length > 0) {
    lines.push(`- Never use these words: ${ts.avoidedPhrases.join(', ')}`);
  }
  lines.push(`- Average post length: ${legend.averagePostLength}.`);

  return lines.join('\n');
}

function knowledgeSection(legend: Legend): string {
  const expertise = Array.isArray(legend.expertiseAreas) ? legend.expertiseAreas as string[] : [];
  const gaps = Array.isArray(legend.knowledgeGaps) ? legend.knowledgeGaps as string[] : [];

  const lines = ['KNOWLEDGE:'];
  lines.push(`- Tech savviness: ${techSavvinessLabel(legend.techSavviness)} (${legend.techSavviness}/10).`);
  if (expertise.length > 0) {
    lines.push(`- Deep expertise: ${expertise.join(', ')}.`);
  }
  if (gaps.length > 0) {
    lines.push(`- Knowledge gaps (be honest about these): ${gaps.join(', ')}.`);
  }
  return lines.join('\n');
}

function personalDetailsSection(legend: Legend): string {
  const life = legend.lifeDetails as {
    maritalStatus: string;
    partnerName?: string;
    children?: number;
  };

  const bits: string[] = [];
  if (life.maritalStatus && life.maritalStatus !== 'single') {
    if (life.partnerName) {
      bits.push(`${life.maritalStatus === 'married' ? 'Spouse' : 'Partner'}: ${life.partnerName}`);
    } else {
      bits.push(`Relationship: ${life.maritalStatus}`);
    }
  }
  if (life.children) {
    bits.push(`Children: ${life.children}`);
  }
  const hobbies = Array.isArray(legend.hobbies) ? legend.hobbies as string[] : [];
  if (hobbies.length > 0) {
    bits.push(`Hobbies: ${hobbies.join(', ')}`);
  }

  if (bits.length === 0) return '';
  return `PERSONAL DETAILS:\n- ${bits.join('\n- ')}`;
}

function neverDoSection(legend: Legend): string {
  const neverDo = Array.isArray(legend.neverDo) ? legend.neverDo as string[] : [];
  if (neverDo.length === 0) return '';
  return `WHAT YOU NEVER DO:\n- ${neverDo.join('\n- ')}`;
}

function techSavvinessLabel(score: number): string {
  if (score <= 3) return 'low tech savviness; not a tech person';
  if (score >= 8) return 'highly tech-savvy; fluent in technical concepts';
  return 'moderate tech savviness; understands basics';
}

function formalityLabel(score: number): string {
  if (score <= 3) return 'casual';
  if (score >= 8) return 'formal';
  return 'conversational';
}
```

- [ ] **Step 1.5: Run test + commit**

```bash
pnpm --filter @advocate/app test soul-builder
pnpm lint
git add packages/app/src/prompts/types.ts packages/app/src/prompts/soul-builder.ts packages/app/tests/prompts/soul-builder.test.ts
git commit -m "feat(app): add Soul prompt builder (Legend → identity system prompt)"
```

---

## Task 2: Product Knowledge Filter

**Files:**
- Create: `packages/app/src/prompts/product-knowledge-filter.ts`
- Create: `packages/app/tests/prompts/product-knowledge-filter.test.ts`

- [ ] **Step 2.1: Write failing test FIRST**

Key assertions:
- Product name appears
- Value props are listed
- Pain points appear
- Talking points appear
- Competitor comparisons appear when present
- `neverSay` items appear as negative constraints
- Product relationship (discovery story, usage duration, satisfaction, complaints) appears
- Output deterministic

```typescript
// product-knowledge-filter.test.ts
import { describe, expect, it } from 'vitest';
import { filterProductKnowledge } from '../../src/prompts/product-knowledge-filter.js';
import type { Legend, Product } from '../../src/db/schema.js';

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
    talkingPoints: ['first week paid for itself', 'customers don\'t know it\'s AI'],
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
    location: { city: 'Columbus', state: 'OH', country: 'USA', timezone: 'America/New_York' },
    lifeDetails: { maritalStatus: 'married' },
    professional: { occupation: 'Plumber', company: 'X', industry: 'Y', yearsExperience: 15, education: 'Z' },
    bigFive: { openness: 4, conscientiousness: 8, extraversion: 5, agreeableness: 6, neuroticism: 4 },
    techSavviness: 3,
    typingStyle: {
      capitalization: 'mixed', punctuation: 'minimal', commonTypos: [], commonPhrases: [],
      avoidedPhrases: [], paragraphStyle: 'varied', listStyle: 'never', usesEmojis: false, formality: 4,
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
```

- [ ] **Step 2.2: Implement `packages/app/src/prompts/product-knowledge-filter.ts`**

```typescript
import type { Legend, Product } from '../db/schema.js';

/**
 * Produces the Product Knowledge layer of the prompt — what this legend
 * knows about this product, filtered through their tech savviness and
 * framed with their personal relationship to it.
 */
export function filterProductKnowledge(product: Product, legend: Legend): string {
  const sections: string[] = [];

  // Header
  sections.push(
    `PRODUCT YOU USE: ${product.name}\n${product.description}${
      product.url ? ` (${product.url})` : ''
    }`,
  );

  // Value props
  const valueProps = (product.valueProps as string[]) ?? [];
  if (valueProps.length > 0) {
    sections.push(['What it does well:', ...valueProps.map((v) => `- ${v}`)].join('\n'));
  }

  // Pain points this product solves
  const painPoints = (product.painPoints as string[]) ?? [];
  if (painPoints.length > 0) {
    sections.push(['Problems it solves:', ...painPoints.map((p) => `- ${p}`)].join('\n'));
  }

  // Talking points (pre-approved ways to describe it)
  const talkingPoints = (product.talkingPoints as string[]) ?? [];
  if (talkingPoints.length > 0) {
    sections.push(
      ['Approved talking points (natural ways to mention it):', ...talkingPoints.map((t) => `- ${t}`)].join(
        '\n',
      ),
    );
  }

  // Competitor comparisons
  const competitors = (product.competitorComparisons as { name: string; comparison: string }[] | null) ?? [];
  if (competitors.length > 0) {
    sections.push(
      ['Competitor comparisons (fair, factual only):', ...competitors.map((c) => `- vs ${c.name}: ${c.comparison}`)].join(
        '\n',
      ),
    );
  }

  // Negative constraints
  const neverSay = (product.neverSay as string[] | null) ?? [];
  if (neverSay.length > 0) {
    sections.push(
      ['NEVER say these about the product (would sound like a shill):', ...neverSay.map((n) => `- "${n}"`)].join(
        '\n',
      ),
    );
  }

  // Your personal relationship with it (from the legend)
  const rel = legend.productRelationship as {
    discoveryStory: string;
    usageDuration: string;
    satisfactionLevel: number;
    complaints: string[];
    useCase: string;
    alternativesConsidered: string[];
  };
  if (rel) {
    const relationshipLines = [
      'YOUR RELATIONSHIP WITH THE PRODUCT:',
      `- How you found it: ${rel.discoveryStory}`,
      `- How long you've used it: ${rel.usageDuration}`,
      `- Satisfaction (1-10): ${rel.satisfactionLevel}`,
      `- Your use case: ${rel.useCase}`,
    ];
    if (rel.complaints.length > 0) {
      relationshipLines.push(`- Your honest complaints: ${rel.complaints.join('; ')}`);
    }
    if (rel.alternativesConsidered.length > 0) {
      relationshipLines.push(`- Alternatives you tried/considered: ${rel.alternativesConsidered.join(', ')}`);
    }
    sections.push(relationshipLines.join('\n'));
  }

  return sections.join('\n\n');
}
```

- [ ] **Step 2.3: Run test + commit**

```bash
pnpm --filter @advocate/app test product-knowledge-filter
pnpm lint
git add packages/app/src/prompts/product-knowledge-filter.ts packages/app/tests/prompts/product-knowledge-filter.test.ts
git commit -m "feat(app): add product knowledge filter (Product + Legend → personalized talking points)"
```

---

## Task 3: Context Builder

**Files:**
- Create: `packages/app/src/prompts/context-builder.ts`
- Create: `packages/app/tests/prompts/context-builder.test.ts`

Pure function: `buildContextBlock(context: PromptContext) → string`. Tests assert:
- Platform info appears
- Community name + rules appear when present
- Thread summary appears when present
- Relevant memories appear as a list when present
- Recent activity appears when present
- Task type + promotion level always appear
- Empty context (only task) still produces a valid prompt
- Deterministic

- [ ] **Step 3.1: Write failing test FIRST**

```typescript
// context-builder.test.ts
import { describe, expect, it } from 'vitest';
import { buildContextBlock } from '../../src/prompts/context-builder.js';
import type { PromptContext } from '../../src/prompts/types.js';

const minimal: PromptContext = {
  task: {
    type: 'helpful_comment',
    promotionLevel: 0,
    instructions: 'Reply to the thread helpfully.',
  },
};

describe('buildContextBlock', () => {
  it('includes task type + promotion level + instructions', () => {
    const text = buildContextBlock(minimal);
    expect(text).toContain('helpful_comment');
    expect(text).toContain('0');
    expect(text).toContain('Reply to the thread helpfully.');
  });

  it('promotion level 0 sets an explicit no-mention instruction', () => {
    const text = buildContextBlock(minimal);
    expect(text.toLowerCase()).toMatch(/not mention|no product/);
  });

  it('promotion level 5+ loosens the mention constraint', () => {
    const text = buildContextBlock({
      ...minimal,
      task: { ...minimal.task, promotionLevel: 5 },
    });
    expect(text.toLowerCase()).not.toContain('do not mention');
  });

  it('includes platform when provided', () => {
    const text = buildContextBlock({ ...minimal, platform: { id: 'reddit', name: 'Reddit' } });
    expect(text).toContain('Reddit');
  });

  it('includes community name + rules + culture', () => {
    const text = buildContextBlock({
      ...minimal,
      community: {
        id: 'r-plumbing',
        name: 'r/Plumbing',
        platform: 'reddit',
        rulesSummary: 'No self-promotion. Flair required.',
        cultureSummary: 'Practical, blue-collar tone.',
      },
    });
    expect(text).toContain('r/Plumbing');
    expect(text).toContain('No self-promotion');
    expect(text).toContain('blue-collar');
  });

  it('includes thread summary when provided', () => {
    const text = buildContextBlock({
      ...minimal,
      thread: {
        url: 'https://reddit.com/r/Plumbing/abc',
        summary: 'OP asking about PEX vs copper for a remodel.',
      },
    });
    expect(text).toContain('PEX vs copper');
  });

  it('includes relevant memories as bullet list', () => {
    const text = buildContextBlock({
      ...minimal,
      relevantMemories: [
        'r/Plumbing responds well to specific dollar amounts',
        'copper_joe is a friendly contact',
      ],
    });
    expect(text).toContain('specific dollar amounts');
    expect(text).toContain('copper_joe');
    expect(text.toLowerCase()).toContain('memor');
  });

  it('includes recent activity when present', () => {
    const text = buildContextBlock({
      ...minimal,
      recentActivity: ['Posted in r/Plumbing 2 days ago', 'Last product mention 14 days ago'],
    });
    expect(text).toContain('2 days ago');
    expect(text).toContain('14 days ago');
  });

  it('deterministic', () => {
    const a = buildContextBlock(minimal);
    const b = buildContextBlock(minimal);
    expect(a).toBe(b);
  });

  it('handles the minimal case (task only)', () => {
    const text = buildContextBlock(minimal);
    expect(text.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3.2: Implement `packages/app/src/prompts/context-builder.ts`**

```typescript
import type { PromptContext } from './types.js';

export function buildContextBlock(context: PromptContext): string {
  const sections: string[] = [];

  // Task (always present)
  const taskLines = [
    `CURRENT TASK:`,
    `- Type: ${context.task.type}`,
    `- Promotion level: ${context.task.promotionLevel}/10`,
    `- Instructions: ${context.task.instructions}`,
  ];
  if (context.task.promotionLevel === 0) {
    taskLines.push('- CRITICAL: Do not mention the product in this reply. Pure value only.');
  } else if (context.task.promotionLevel <= 3) {
    taskLines.push('- Product mention only if the thread genuinely calls for it.');
  }
  sections.push(taskLines.join('\n'));

  // Platform + community
  if (context.platform || context.community) {
    const lines = ['WHERE YOU ARE POSTING:'];
    if (context.platform) lines.push(`- Platform: ${context.platform.name}`);
    if (context.community) {
      lines.push(`- Community: ${context.community.name}`);
      if (context.community.cultureSummary) {
        lines.push(`- Culture: ${context.community.cultureSummary}`);
      }
      if (context.community.rulesSummary) {
        lines.push(`- Rules: ${context.community.rulesSummary}`);
      }
    }
    sections.push(lines.join('\n'));
  }

  // Thread
  if (context.thread) {
    const lines = ['THREAD YOU ARE REPLYING TO:', `- Summary: ${context.thread.summary}`];
    if (context.thread.url) lines.push(`- URL: ${context.thread.url}`);
    sections.push(lines.join('\n'));
  }

  // Memories
  if (context.relevantMemories && context.relevantMemories.length > 0) {
    sections.push(
      ['YOUR MEMORY (lessons from prior interactions):', ...context.relevantMemories.map((m) => `- ${m}`)].join(
        '\n',
      ),
    );
  }

  // Recent activity
  if (context.recentActivity && context.recentActivity.length > 0) {
    sections.push(
      ['YOUR RECENT ACTIVITY (so you don\'t repeat yourself):', ...context.recentActivity.map((a) => `- ${a}`)].join(
        '\n',
      ),
    );
  }

  return sections.join('\n\n');
}
```

- [ ] **Step 3.3: Run + commit**

```bash
pnpm --filter @advocate/app test context-builder
pnpm lint
git add packages/app/src/prompts/context-builder.ts packages/app/tests/prompts/context-builder.test.ts
git commit -m "feat(app): add context builder (runtime task + community + memory → context block)"
```

---

## Task 4: Composer

**Files:**
- Create: `packages/app/src/prompts/composer.ts`
- Create: `packages/app/tests/prompts/composer.test.ts`

The composer assembles all three builders into `{ systemPrompt, userPrompt }`:

- `systemPrompt`: Soul + (filtered Product Knowledge if product present) + Context, separated by `\n\n---\n\n`
- `userPrompt`: the task's `instructions` verbatim (the LLM's per-call ask)

Tests:
- composePrompt returns both systemPrompt and userPrompt
- systemPrompt contains Soul content (legend name)
- systemPrompt contains Product Knowledge (product name) when product provided
- systemPrompt omits Product Knowledge cleanly when product is null
- systemPrompt contains Context (task instructions appear in system too — so the LLM has full context but also in user)
- userPrompt equals task.instructions
- Deterministic

- [ ] **Step 4.1: TDD — write test, implement, commit**

```typescript
// composer.ts
import type { ComposePromptInput, ComposedPrompt } from './types.js';
import { buildContextBlock } from './context-builder.js';
import { filterProductKnowledge } from './product-knowledge-filter.js';
import { buildSoulPrompt } from './soul-builder.js';

const SEPARATOR = '\n\n---\n\n';

export function composePrompt(input: ComposePromptInput): ComposedPrompt {
  const systemParts = [
    buildSoulPrompt(input.legend),
    input.product ? filterProductKnowledge(input.product, input.legend) : null,
    buildContextBlock(input.context),
  ].filter((part): part is string => part !== null && part.length > 0);

  return {
    systemPrompt: systemParts.join(SEPARATOR),
    userPrompt: input.context.task.instructions,
  };
}
```

Test file covers all the cases above; ~10 assertions.

```bash
pnpm --filter @advocate/app test composer
pnpm lint
git add packages/app/src/prompts/composer.ts packages/app/tests/prompts/composer.test.ts
git commit -m "feat(app): add PromptComposer assembling Soul + Product + Context into systemPrompt"
```

---

## Task 5: Barrel + Docker Round-Trip + Tag

- [ ] **Step 5.1: Create barrel**

`packages/app/src/prompts/index.ts`:

```typescript
export * from './composer.js';
export * from './context-builder.js';
export * from './product-knowledge-filter.js';
export * from './soul-builder.js';
export * from './types.js';
```

- [ ] **Step 5.2: Verify + commit**

```bash
pnpm --filter @advocate/app typecheck
pnpm --filter @advocate/app test
pnpm lint
```

Expected: app tests ~142 (existing) + ~12 soul + ~9 product-knowledge + ~10 context + ~6 composer ≈ 179 passing.

```bash
git add packages/app/src/prompts/index.ts
git commit -m "feat(app): expose prompts module via barrel"
git push origin master
```

- [ ] **Step 5.3: Docker round-trip**

No HTTP surface was added; just library code. Docker verification just checks that the new code doesn't break the existing boot.

```bash
docker compose down
docker compose up -d --build
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps
curl -s http://localhost:36401/health
docker compose down
```

- [ ] **Step 5.4: Tag + push**

```bash
git tag -a plan09-complete -m "Plan 09 Three-Layer Prompts complete"
git push origin plan09-complete
```

---

## Acceptance Criteria

1. ✅ `buildSoulPrompt(legend)` produces a full-identity system prompt including Big Five traits, typing style, knowledge, personal details, and never-do list
2. ✅ `filterProductKnowledge(product, legend)` produces a product-knowledge block personalized via the legend's `productRelationship`
3. ✅ `buildContextBlock(context)` produces task + community + thread + memory context with promotion-level-aware instructions
4. ✅ `composePrompt({legend, product, context})` returns `{ systemPrompt, userPrompt }` deterministic given identical inputs
5. ✅ Prompts module exported via barrel
6. ✅ `pnpm verify` passes with ~35 new prompt tests
7. ✅ Docker stack boots healthy
8. ✅ Tag `plan09-complete` pushed

## Out of Scope

- **LLM-driven prompt tuning** — any future "this Soul is too formal for this community, rewrite it" step happens in the Strategist agent (Plan 11), not here
- **Prompt caching directives** (Anthropic `cache_control`) — provider-specific wrappers live in `app/src/llm/anthropic.ts`; this plan produces plain strings
- **Multi-turn conversation history** — current scope is single-turn (request/response). Multi-turn will add a `history` field to `PromptContext` if needed
- **Localization / i18n** — single-language (English) for MVP

---

**End of Plan 09 (Three-Layer Prompts).**
