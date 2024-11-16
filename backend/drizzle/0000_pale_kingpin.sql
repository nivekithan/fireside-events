CREATE TABLE IF NOT EXISTS "participant" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "participant_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"public_id" text NOT NULL,
	"calls_session_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "track" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "track_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"m_id" text NOT NULL,
	"name" text NOT NULL,
	"participant_id" integer
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "track" ADD CONSTRAINT "track_participant_id_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
