CREATE TABLE "circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"edit_token_hash" text NOT NULL,
	"lead_id" uuid,
	"organizer_name" text NOT NULL,
	"data" jsonb NOT NULL,
	"payments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"source" text NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"meta" jsonb,
	"converted_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circles" ADD CONSTRAINT "circles_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "circles_slug_uq" ON "circles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "circles_lead_idx" ON "circles" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_email_source_uq" ON "leads" USING btree ("email","source");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");