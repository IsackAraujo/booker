CREATE TYPE "public"."class_reservation_status" AS ENUM('ativa', 'cancelada', 'atendida');--> statement-breakpoint
CREATE TYPE "public"."copy_status" AS ENUM('disponivel', 'emprestado', 'separado', 'perdido', 'danificado');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('aguardando', 'avisado', 'expirada', 'atendida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('lembrete', 'cobranca', 'reserva_disponivel');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('enviado', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."return_condition" AS ENUM('ok', 'perdido', 'danificado');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('ativo', 'transferido');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('bibliotecaria', 'professor', 'coordenacao');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" integer,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"category" text NOT NULL,
	"age_range" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacher_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"class_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"activity_date" date NOT NULL,
	"status" "class_reservation_status" DEFAULT 'ativa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "class_reservations_quantity_positive" CHECK ("class_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "copies" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"code" text NOT NULL,
	"status" "copy_status" DEFAULT 'disponivel' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "hold_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"status" "hold_status" DEFAULT 'aguardando' NOT NULL,
	"copy_id" integer,
	"notified_at" timestamp with time zone,
	"hold_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"copy_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"teacher_id" integer,
	"loaned_at" timestamp with time zone NOT NULL,
	"due_date" date NOT NULL,
	"returned_at" timestamp with time zone,
	"return_condition" "return_condition",
	"returned_late" boolean,
	"created_by" integer NOT NULL,
	"returned_by" integer
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"loan_id" integer,
	"hold_id" integer,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"status" "notification_status" NOT NULL,
	"error" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"loan_days" integer DEFAULT 14 NOT NULL,
	"max_active_loans" integer DEFAULT 2 NOT NULL,
	"block_when_overdue" boolean DEFAULT true NOT NULL,
	"hold_pickup_days" integer DEFAULT 2 NOT NULL,
	"reminder_days_before" integer DEFAULT 3 NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"registration" text NOT NULL,
	"name" text NOT NULL,
	"class_name" text NOT NULL,
	"guardian_phone" text NOT NULL,
	"status" "student_status" DEFAULT 'ativo' NOT NULL,
	"transferred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_registration_unique" UNIQUE("registration")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_reservations" ADD CONSTRAINT "class_reservations_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_reservations" ADD CONSTRAINT "class_reservations_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copies" ADD CONSTRAINT "copies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hold_queue" ADD CONSTRAINT "hold_queue_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hold_queue" ADD CONSTRAINT "hold_queue_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hold_queue" ADD CONSTRAINT "hold_queue_copy_id_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_copy_id_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_returned_by_users_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_hold_id_hold_queue_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."hold_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_index" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_user_id_index" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "class_reservations_activity_date_index" ON "class_reservations" USING btree ("activity_date");--> statement-breakpoint
CREATE INDEX "copies_book_id_index" ON "copies" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hold_queue_one_active_per_student" ON "hold_queue" USING btree ("book_id","student_id") WHERE "hold_queue"."status" in ('aguardando', 'avisado');--> statement-breakpoint
CREATE UNIQUE INDEX "loans_one_open_per_copy" ON "loans" USING btree ("copy_id") WHERE "loans"."returned_at" is null;--> statement-breakpoint
CREATE INDEX "loans_student_id_index" ON "loans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "loans_due_date_index" ON "loans" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_one_reminder_per_loan" ON "notifications" USING btree ("loan_id") WHERE "notifications"."kind" = 'lembrete' and "notifications"."status" = 'enviado';--> statement-breakpoint
CREATE INDEX "notifications_loan_id_index" ON "notifications" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "students_class_name_index" ON "students" USING btree ("class_name");