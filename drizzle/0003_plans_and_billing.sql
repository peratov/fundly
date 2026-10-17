CREATE TABLE "billing_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"provider" text NOT NULL,
	"plan" text NOT NULL,
	"interval" text NOT NULL,
	"months" integer NOT NULL,
	"amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_through" date,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "plan" SET DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_expires_at" date;--> statement-breakpoint
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payments_reference_uq" ON "billing_payments" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "billing_payments_tenant_idx" ON "billing_payments" USING btree ("tenant_id","created_at");--> statement-breakpoint
-- Move existing funds to the new plans: trials become Free (forever, no expiry),
-- the old paid tiers map to Growth and Pro with no expiry (operator-managed).
UPDATE "tenants" SET "plan" = 'free', "status" = 'active' WHERE "plan" = 'trial' OR "status" = 'trial';--> statement-breakpoint
UPDATE "tenants" SET "plan" = 'growth' WHERE "plan" = 'standard';--> statement-breakpoint
UPDATE "tenants" SET "plan" = 'pro' WHERE "plan" = 'enterprise';
