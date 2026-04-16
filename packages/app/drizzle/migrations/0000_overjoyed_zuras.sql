CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'warming_up', 'warned', 'suspended', 'banned');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('planned', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."community_status" AS ENUM('discovered', 'approved', 'active', 'paused', 'blacklisted');--> statement-breakpoint
CREATE TYPE "public"."content_plan_status" AS ENUM('planned', 'generating', 'review', 'approved', 'rejected', 'posted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('helpful_comment', 'value_post', 'problem_question', 'comparison_question', 'experience_share', 'recommendation', 'launch_post');--> statement-breakpoint
CREATE TYPE "public"."email_provider" AS ENUM('gmail', 'outlook', 'protonmail');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('active', 'locked', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."legend_maturity" AS ENUM('lurking', 'engaging', 'established', 'promoting');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."warm_up_phase" AS ENUM('lurking', 'engaging', 'established', 'promoting');--> statement-breakpoint
CREATE TYPE "public"."agent_state" AS ENUM('idle', 'working', 'waiting_approval', 'sleeping', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."memory_consolidation_type" AS ENUM('raw', 'consolidated');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('request', 'response', 'notification', 'escalation');--> statement-breakpoint
CREATE TYPE "public"."safety_event_type" AS ENUM('rate_limit_hit', 'content_rejected', 'account_warned', 'account_suspended', 'kill_switch_activated');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('backlog', 'in_progress', 'in_review', 'approved', 'done', 'blocked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(300) NOT NULL,
	"description" text,
	"strategy" text,
	"legend_ids" jsonb NOT NULL,
	"community_ids" jsonb NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" "campaign_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"legend_id" uuid NOT NULL,
	"legend_account_id" uuid,
	"community_id" uuid NOT NULL,
	"content_type" "content_type" NOT NULL,
	"promotion_level" smallint DEFAULT 0 NOT NULL,
	"thread_url" text,
	"thread_context" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "content_plan_status" DEFAULT 'planned' NOT NULL,
	"generated_content" text,
	"quality_score" jsonb,
	"reviewed_by" varchar(200),
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(50) NOT NULL,
	"identifier" varchar(500) NOT NULL,
	"name" varchar(500) NOT NULL,
	"url" text,
	"subscriber_count" integer,
	"posts_per_day" numeric(8, 2),
	"relevance_score" numeric(3, 1),
	"activity_score" numeric(3, 1),
	"receptiveness_score" numeric(3, 1),
	"moderation_risk" numeric(3, 1),
	"culture_summary" text,
	"rules_summary" text,
	"best_posting_times" jsonb,
	"top_contributors" jsonb,
	"last_scanned_at" timestamp with time zone,
	"status" "community_status" DEFAULT 'discovered' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legend_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legend_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"username" varchar(200) NOT NULL,
	"email" varchar(200),
	"registered_at" timestamp with time zone,
	"status" "account_status" DEFAULT 'warming_up' NOT NULL,
	"karma" integer,
	"followers" integer,
	"posts_count" integer,
	"warm_up_phase" "warm_up_phase" DEFAULT 'lurking' NOT NULL,
	"warm_up_started_at" timestamp with time zone,
	"warm_up_completed_at" timestamp with time zone,
	"posts_today" integer DEFAULT 0 NOT NULL,
	"posts_this_week" integer DEFAULT 0 NOT NULL,
	"last_post_at" timestamp with time zone,
	"last_product_mention_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legend_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legend_account_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"encrypted_payload" text NOT NULL,
	"metadata" jsonb,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legend_email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legend_id" uuid NOT NULL,
	"provider" "email_provider" NOT NULL,
	"address" varchar(200) NOT NULL,
	"password_ciphertext" text NOT NULL,
	"recovery_phone_ciphertext" text,
	"recovery_email_ciphertext" text,
	"status" "email_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legend_email_accounts_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"agent_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"gender" varchar(20) NOT NULL,
	"age" integer NOT NULL,
	"location" jsonb NOT NULL,
	"life_details" jsonb NOT NULL,
	"professional" jsonb NOT NULL,
	"big_five" jsonb NOT NULL,
	"tech_savviness" integer NOT NULL,
	"typing_style" jsonb NOT NULL,
	"active_hours" jsonb NOT NULL,
	"active_days" jsonb NOT NULL,
	"average_post_length" varchar(20) NOT NULL,
	"hobbies" jsonb NOT NULL,
	"other_interests" jsonb,
	"expertise_areas" jsonb NOT NULL,
	"knowledge_gaps" jsonb NOT NULL,
	"product_relationship" jsonb NOT NULL,
	"opinions" jsonb NOT NULL,
	"never_do" jsonb NOT NULL,
	"maturity" "legend_maturity" DEFAULT 'lurking' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_metrics_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"upvotes" integer NOT NULL,
	"downvotes" integer NOT NULL,
	"replies_count" integer NOT NULL,
	"views" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_plan_id" uuid,
	"legend_account_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"platform_post_id" varchar(500),
	"platform_url" text,
	"content" text NOT NULL,
	"content_type" "content_type" NOT NULL,
	"promotion_level" smallint DEFAULT 0 NOT NULL,
	"posted_at" timestamp with time zone,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"was_removed" boolean DEFAULT false NOT NULL,
	"moderator_action" text,
	"last_metrics_update" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"url" varchar(500),
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"value_props" jsonb NOT NULL,
	"pain_points" jsonb NOT NULL,
	"talking_points" jsonb NOT NULL,
	"competitor_comparisons" jsonb,
	"never_say" jsonb,
	"target_audiences" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" varchar(100) NOT NULL,
	"soul" text NOT NULL,
	"model_config" jsonb NOT NULL,
	"memory_config" jsonb NOT NULL,
	"permissions" jsonb NOT NULL,
	"parent_id" uuid,
	"state" "agent_state" DEFAULT 'idle' NOT NULL,
	"metadata" jsonb,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "heartbeat_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"cron_pattern" varchar(100) NOT NULL,
	"job_type" varchar(100) NOT NULL,
	"job_data" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"task_type" varchar(100) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_millicents" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"quality_score" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consolidated_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"source_episode_ids" jsonb NOT NULL,
	"summary" text NOT NULL,
	"lessons" jsonb NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"consolidated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episodic_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"lesson" text,
	"sentiment" "sentiment" DEFAULT 'neutral' NOT NULL,
	"context" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relational_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"external_username" varchar(200) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"context" text NOT NULL,
	"sentiment" "sentiment" DEFAULT 'neutral' NOT NULL,
	"interaction_count" integer DEFAULT 1 NOT NULL,
	"last_interaction_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"tags" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_agent" uuid NOT NULL,
	"to_agent" uuid NOT NULL,
	"type" "message_type" NOT NULL,
	"subject" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"reply_to" uuid,
	"task_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "safety_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"event_type" "safety_event_type" NOT NULL,
	"details" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"type" varchar(100) NOT NULL,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"status" "task_status" DEFAULT 'backlog' NOT NULL,
	"assigned_to" uuid,
	"created_by" uuid NOT NULL,
	"depends_on" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_role" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_legend_id_legends_id_fk" FOREIGN KEY ("legend_id") REFERENCES "public"."legends"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_legend_account_id_legend_accounts_id_fk" FOREIGN KEY ("legend_account_id") REFERENCES "public"."legend_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legend_accounts" ADD CONSTRAINT "legend_accounts_legend_id_legends_id_fk" FOREIGN KEY ("legend_id") REFERENCES "public"."legends"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legend_credentials" ADD CONSTRAINT "legend_credentials_legend_account_id_legend_accounts_id_fk" FOREIGN KEY ("legend_account_id") REFERENCES "public"."legend_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legend_email_accounts" ADD CONSTRAINT "legend_email_accounts_legend_id_legends_id_fk" FOREIGN KEY ("legend_id") REFERENCES "public"."legends"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legends" ADD CONSTRAINT "legends_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legends" ADD CONSTRAINT "legends_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_metrics_history" ADD CONSTRAINT "post_metrics_history_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_content_plan_id_content_plans_id_fk" FOREIGN KEY ("content_plan_id") REFERENCES "public"."content_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_legend_account_id_legend_accounts_id_fk" FOREIGN KEY ("legend_account_id") REFERENCES "public"."legend_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "heartbeat_schedules" ADD CONSTRAINT "heartbeat_schedules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consolidated_memories" ADD CONSTRAINT "consolidated_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodic_memories" ADD CONSTRAINT "episodic_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relational_memories" ADD CONSTRAINT "relational_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_from_agent_agents_id_fk" FOREIGN KEY ("from_agent") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_to_agent_agents_id_fk" FOREIGN KEY ("to_agent") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_assigned_to_agents_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_created_by_agents_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_artifacts" ADD CONSTRAINT "task_artifacts_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_artifacts" ADD CONSTRAINT "task_artifacts_created_by_agents_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_product_idx" ON "campaigns" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_plans_campaign_idx" ON "content_plans" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_plans_legend_idx" ON "content_plans" USING btree ("legend_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_plans_status_idx" ON "content_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_plans_scheduled_approved_idx" ON "content_plans" USING btree ("scheduled_at","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "communities_platform_identifier_unique" ON "communities" USING btree ("platform","identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communities_platform_status_idx" ON "communities" USING btree ("platform","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communities_relevance_idx" ON "communities" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legend_accounts_legend_idx" ON "legend_accounts" USING btree ("legend_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legend_accounts_platform_idx" ON "legend_accounts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legend_accounts_status_idx" ON "legend_accounts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legend_credentials_account_idx" ON "legend_credentials" USING btree ("legend_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legend_email_accounts_legend_idx" ON "legend_email_accounts" USING btree ("legend_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legends_product_idx" ON "legends" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legends_agent_idx" ON "legends" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_metrics_history_post_measured_idx" ON "post_metrics_history" USING btree ("post_id","measured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_account_posted_idx" ON "posts" USING btree ("legend_account_id","posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_community_posted_idx" ON "posts" USING btree ("community_id","posted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_content_plan_idx" ON "posts" USING btree ("content_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_slug_idx" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_role_idx" ON "agents" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_parent_idx" ON "agents" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_state_idx" ON "agents" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_schedules_agent_idx" ON "heartbeat_schedules" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "heartbeat_schedules_enabled_idx" ON "heartbeat_schedules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_provider_idx" ON "llm_usage" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_task_type_idx" ON "llm_usage" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_created_idx" ON "llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_usage_agent_created_idx" ON "llm_usage" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consolidated_memories_agent_idx" ON "consolidated_memories" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodic_memories_agent_idx" ON "episodic_memories" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodic_memories_agent_created_idx" ON "episodic_memories" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relational_memories_agent_idx" ON "relational_memories" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relational_memories_lookup_idx" ON "relational_memories" USING btree ("agent_id","platform","external_username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_from_idx" ON "agent_messages" USING btree ("from_agent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_to_idx" ON "agent_messages" USING btree ("to_agent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_task_idx" ON "agent_messages" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_messages_created_idx" ON "agent_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "safety_events_type_idx" ON "safety_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "safety_events_agent_idx" ON "safety_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "safety_events_created_idx" ON "safety_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_tasks_status_idx" ON "agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_tasks_assigned_idx" ON "agent_tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_tasks_project_idx" ON "agent_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_artifacts_task_idx" ON "task_artifacts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_artifacts_type_idx" ON "task_artifacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_task_idx" ON "task_comments" USING btree ("task_id");