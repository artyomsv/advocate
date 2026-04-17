CREATE TABLE IF NOT EXISTS "platform_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_secrets_category_key_unique" ON "platform_secrets" USING btree ("category","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_secrets_category_idx" ON "platform_secrets" USING btree ("category");