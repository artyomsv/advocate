ALTER TABLE "communities" ADD COLUMN "default_flair_id" varchar(200);--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "default_flair_text" varchar(200);--> statement-breakpoint
ALTER TABLE "legend_accounts" ADD COLUMN "label" varchar(100);--> statement-breakpoint
ALTER TABLE "legend_accounts" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;