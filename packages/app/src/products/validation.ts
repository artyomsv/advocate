import { z } from 'zod';

/**
 * Zod schema for creating a product. The service uses this to validate
 * incoming API payloads and agent inputs alike.
 *
 * `slug` matches DB check: lowercase alphanumeric + hyphen, 3-100 chars.
 */
export const productInputSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  description: z.string().min(1),
  url: z.string().url().optional(),
  status: z.enum(['draft', 'active', 'paused']).default('draft'),
  valueProps: z.array(z.string().min(1)).default([]),
  painPoints: z.array(z.string().min(1)).default([]),
  talkingPoints: z.array(z.string().min(1)).default([]),
  competitorComparisons: z
    .array(z.object({ name: z.string().min(1), comparison: z.string().min(1) }))
    .optional(),
  neverSay: z.array(z.string().min(1)).optional(),
  targetAudiences: z
    .array(z.object({ segment: z.string().min(1), platforms: z.array(z.string().min(1)) }))
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

/** Update schema — everything optional except `id` (which is the URL param). */
export const productUpdateSchema = productInputSchema.partial().extend({
  slug: productInputSchema.shape.slug.optional(),
});

export type ProductUpdate = z.infer<typeof productUpdateSchema>;
