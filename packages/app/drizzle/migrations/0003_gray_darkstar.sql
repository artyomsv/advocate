ALTER TABLE "content_plans" ADD COLUMN "trace_task_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_trace_task_id_agent_tasks_id_fk" FOREIGN KEY ("trace_task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_plans_trace_task_idx" ON "content_plans" USING btree ("trace_task_id");