import { z } from 'zod';

/**
 * Zod schema for creating a legend. The service uses this to validate
 * incoming API payloads and agent inputs alike.
 */

const locationSchema = z.object({
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().min(1),
  timezone: z.string().min(1),
});

const bigFiveSchema = z.object({
  openness: z.number().int().min(1).max(10),
  conscientiousness: z.number().int().min(1).max(10),
  extraversion: z.number().int().min(1).max(10),
  agreeableness: z.number().int().min(1).max(10),
  neuroticism: z.number().int().min(1).max(10),
});

const typingStyleSchema = z.object({
  capitalization: z.enum(['proper', 'lowercase', 'mixed']),
  punctuation: z.enum(['correct', 'minimal', 'excessive']),
  commonTypos: z.array(z.string()).default([]),
  commonPhrases: z.array(z.string()).default([]),
  avoidedPhrases: z.array(z.string()).default([]),
  paragraphStyle: z.enum(['short', 'walls_of_text', 'varied']),
  listStyle: z.enum(['never', 'sometimes', 'frequently']),
  usesEmojis: z.boolean(),
  formality: z.number().int().min(1).max(10),
});

const activeHoursSchema = z.object({
  start: z.number().int().min(0).max(23),
  end: z.number().int().min(0).max(23),
});

const lifeDetailsSchema = z.object({
  maritalStatus: z.enum(['single', 'married', 'divorced', 'partner']),
  partnerName: z.string().optional(),
  children: z.number().int().nonnegative().optional(),
}).passthrough();

const professionalSchema = z.object({
  occupation: z.string().min(1),
  company: z.string().min(1),
  industry: z.string().min(1),
  yearsExperience: z.number().int().nonnegative(),
  education: z.string().min(1),
}).passthrough();

const productRelationshipSchema = z.object({
  discoveryStory: z.string().min(1),
  usageDuration: z.string().min(1),
  satisfactionLevel: z.number().int().min(1).max(10),
  complaints: z.array(z.string()).default([]),
  useCase: z.string().min(1),
  alternativesConsidered: z.array(z.string()).default([]),
});

export const legendInputSchema = z.object({
  productId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(['male', 'female', 'non-binary']),
  age: z.number().int().min(18).max(120),
  location: locationSchema,
  lifeDetails: lifeDetailsSchema,
  professional: professionalSchema,
  bigFive: bigFiveSchema,
  techSavviness: z.number().int().min(1).max(10),
  typingStyle: typingStyleSchema,
  activeHours: activeHoursSchema,
  activeDays: z.array(z.number().int().min(0).max(6)).min(1),
  averagePostLength: z.enum(['short', 'medium', 'long']),
  hobbies: z.array(z.string()).min(1),
  otherInterests: z.record(z.string(), z.unknown()).optional(),
  expertiseAreas: z.array(z.string()).min(1),
  knowledgeGaps: z.array(z.string()).default([]),
  productRelationship: productRelationshipSchema,
  opinions: z.record(z.string(), z.string()).default({}),
  neverDo: z.array(z.string()).default([]),
  maturity: z.enum(['lurking', 'engaging', 'established', 'promoting']).default('lurking'),
  agentId: z.string().uuid().optional(),
});

export type LegendInput = z.infer<typeof legendInputSchema>;

/** Update schema — everything optional. */
export const legendUpdateSchema = legendInputSchema.partial();

export type LegendUpdate = z.infer<typeof legendUpdateSchema>;
