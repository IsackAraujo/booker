ALTER TABLE "students" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "telegram_link_code" text;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_telegramLinkCode_unique" UNIQUE("telegram_link_code");