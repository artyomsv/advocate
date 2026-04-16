import { z } from 'zod';

export const accountStatusEnum = z.enum(['active', 'warming_up', 'warned', 'suspended', 'banned']);

export const warmUpPhaseEnum = z.enum(['lurking', 'engaging', 'established', 'promoting']);

/** Platform identifier — lowercase alphanumeric + hyphens + dot. */
const platformSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9.-]+$/);

export const legendAccountInputSchema = z.object({
  legendId: z.string().uuid(),
  platform: platformSchema,
  username: z.string().min(1).max(200),
  email: z.string().email().optional(),
  registeredAt: z.coerce.date().optional(),
  status: accountStatusEnum.default('warming_up'),
  karma: z.number().int().optional(),
  followers: z.number().int().nonnegative().optional(),
  postsCount: z.number().int().nonnegative().optional(),
  warmUpPhase: warmUpPhaseEnum.default('lurking'),
  warmUpStartedAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export type LegendAccountInput = z.infer<typeof legendAccountInputSchema>;

export const legendAccountUpdateSchema = legendAccountInputSchema.partial();
export type LegendAccountUpdate = z.infer<typeof legendAccountUpdateSchema>;

/**
 * Warm-up transitions are forward-only:
 *   lurking → engaging → established → promoting
 * Same-phase "transition" is a no-op and allowed (idempotency).
 */
export const WARM_UP_ORDER = ['lurking', 'engaging', 'established', 'promoting'] as const;
export type WarmUpPhase = (typeof WARM_UP_ORDER)[number];

export function canAdvanceWarmUp(from: WarmUpPhase, to: WarmUpPhase): boolean {
  if (from === to) return true;
  const fromIdx = WARM_UP_ORDER.indexOf(from);
  const toIdx = WARM_UP_ORDER.indexOf(to);
  return toIdx === fromIdx + 1;
}
