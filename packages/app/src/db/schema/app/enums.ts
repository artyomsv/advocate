import { pgEnum } from 'drizzle-orm/pg-core';

export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'paused']);

export const legendMaturityEnum = pgEnum('legend_maturity', [
  'lurking',
  'engaging',
  'established',
  'promoting',
]);

export const accountStatusEnum = pgEnum('account_status', [
  'active',
  'warming_up',
  'warned',
  'suspended',
  'banned',
]);

export const emailProviderEnum = pgEnum('email_provider', ['gmail', 'outlook', 'protonmail']);

export const communityStatusEnum = pgEnum('community_status', [
  'discovered',
  'approved',
  'active',
  'paused',
  'blacklisted',
]);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'planned',
  'active',
  'paused',
  'completed',
]);

export const contentPlanStatusEnum = pgEnum('content_plan_status', [
  'planned',
  'generating',
  'review',
  'approved',
  'rejected',
  'posted',
  'failed',
]);

export const contentTypeEnum = pgEnum('content_type', [
  'helpful_comment',
  'value_post',
  'problem_question',
  'comparison_question',
  'experience_share',
  'recommendation',
  'launch_post',
]);

export const warmUpPhaseEnum = pgEnum('warm_up_phase', [
  'lurking',
  'engaging',
  'established',
  'promoting',
]);

export const emailStatusEnum = pgEnum('email_status', ['active', 'locked', 'suspended']);
