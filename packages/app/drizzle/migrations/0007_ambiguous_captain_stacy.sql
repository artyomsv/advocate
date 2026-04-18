-- Pre-migration cleanup: the new product_id column is NOT NULL, so we must
-- either backfill existing rows or delete them. Episodic memories already
-- tag productId inside context jsonb (orchestrator writes it); backfill from
-- there where possible, drop the rest.
DROP INDEX IF EXISTS "episodic_memories_agent_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relational_memories_lookup_idx";--> statement-breakpoint

-- Step 1: add the column nullable so we can backfill
ALTER TABLE "episodic_memories" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "relational_memories" ADD COLUMN "product_id" uuid;--> statement-breakpoint

-- Step 2: backfill episodic_memories from context->>'productId' when the
-- referenced product still exists. Delete rows we cannot associate safely.
UPDATE "episodic_memories"
SET "product_id" = (context->>'productId')::uuid
WHERE context->>'productId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM products WHERE products.id = (context->>'productId')::uuid);
--> statement-breakpoint
DELETE FROM "episodic_memories" WHERE "product_id" IS NULL;--> statement-breakpoint

-- Step 3: relational_memories has no product context today — truncate.
DELETE FROM "relational_memories";--> statement-breakpoint

-- Step 4: enforce NOT NULL
ALTER TABLE "episodic_memories" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "relational_memories" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodic_memories" ADD CONSTRAINT "episodic_memories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "relational_memories" ADD CONSTRAINT "relational_memories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodic_memories_product_idx" ON "episodic_memories" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodic_memories_agent_product_created_idx" ON "episodic_memories" USING btree ("agent_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relational_memories_product_idx" ON "relational_memories" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relational_memories_lookup_idx" ON "relational_memories" USING btree ("agent_id","product_id","platform","external_username");