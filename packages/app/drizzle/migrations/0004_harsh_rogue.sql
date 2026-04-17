CREATE TABLE IF NOT EXISTS "discoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"community_id" uuid NOT NULL,
	"platform_thread_id" varchar(200) NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"author" varchar(200),
	"snippet" text,
	"score" numeric(3, 1) NOT NULL,
	"dispatched" boolean DEFAULT false NOT NULL,
	"dispatch_reason" text,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discoveries" ADD CONSTRAINT "discoveries_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discoveries_product_scanned_idx" ON "discoveries" USING btree ("product_id","scanned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discoveries_community_scanned_idx" ON "discoveries" USING btree ("community_id","scanned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discoveries_score_idx" ON "discoveries" USING btree ("score");