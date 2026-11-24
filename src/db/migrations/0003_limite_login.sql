CREATE TABLE "login_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_failures_email_created_at_index" ON "login_failures" USING btree ("email","created_at");