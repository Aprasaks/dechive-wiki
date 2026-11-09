import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_staff_role" AS ENUM('editor', 'reviewer', 'publisher');
  CREATE TYPE "public"."enum_editorial_drafts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__editorial_drafts_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "staff_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "staff" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_staff_role" DEFAULT 'editor' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "editorial_drafts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stable_entity_id" varchar,
  	"title" varchar,
  	"body" varchar,
  	"supplemental_evidence" jsonb,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_editorial_drafts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_editorial_drafts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_stable_entity_id" varchar,
  	"version_title" varchar,
  	"version_body" varchar,
  	"version_supplemental_evidence" jsonb,
  	"version_created_by_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__editorial_drafts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "multi_source_reviews" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"draft_id" numeric NOT NULL,
  	"snapshot_hash" varchar NOT NULL,
  	"snapshot_entity_id" varchar NOT NULL,
  	"snapshot" jsonb NOT NULL,
  	"evidence" jsonb NOT NULL,
  	"media" jsonb NOT NULL,
  	"reviewer_id" varchar NOT NULL,
  	"editor_id" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"staff_id" integer,
  	"editorial_drafts_id" integer,
  	"multi_source_reviews_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"staff_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "editorial_drafts" ADD CONSTRAINT "editorial_drafts_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_editorial_drafts_v" ADD CONSTRAINT "_editorial_drafts_v_parent_id_editorial_drafts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."editorial_drafts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_editorial_drafts_v" ADD CONSTRAINT "_editorial_drafts_v_version_created_by_id_staff_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_editorial_drafts_fk" FOREIGN KEY ("editorial_drafts_id") REFERENCES "public"."editorial_drafts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_multi_source_reviews_fk" FOREIGN KEY ("multi_source_reviews_id") REFERENCES "public"."multi_source_reviews"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_staff_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "staff_sessions_order_idx" ON "staff_sessions" USING btree ("_order");
  CREATE INDEX "staff_sessions_parent_id_idx" ON "staff_sessions" USING btree ("_parent_id");
  CREATE INDEX "staff_updated_at_idx" ON "staff" USING btree ("updated_at");
  CREATE INDEX "staff_created_at_idx" ON "staff" USING btree ("created_at");
  CREATE UNIQUE INDEX "staff_email_idx" ON "staff" USING btree ("email");
  CREATE INDEX "editorial_drafts_created_by_idx" ON "editorial_drafts" USING btree ("created_by_id");
  CREATE INDEX "editorial_drafts_updated_at_idx" ON "editorial_drafts" USING btree ("updated_at");
  CREATE INDEX "editorial_drafts_created_at_idx" ON "editorial_drafts" USING btree ("created_at");
  CREATE INDEX "editorial_drafts__status_idx" ON "editorial_drafts" USING btree ("_status");
  CREATE INDEX "_editorial_drafts_v_parent_idx" ON "_editorial_drafts_v" USING btree ("parent_id");
  CREATE INDEX "_editorial_drafts_v_version_version_created_by_idx" ON "_editorial_drafts_v" USING btree ("version_created_by_id");
  CREATE INDEX "_editorial_drafts_v_version_version_updated_at_idx" ON "_editorial_drafts_v" USING btree ("version_updated_at");
  CREATE INDEX "_editorial_drafts_v_version_version_created_at_idx" ON "_editorial_drafts_v" USING btree ("version_created_at");
  CREATE INDEX "_editorial_drafts_v_version_version__status_idx" ON "_editorial_drafts_v" USING btree ("version__status");
  CREATE INDEX "_editorial_drafts_v_created_at_idx" ON "_editorial_drafts_v" USING btree ("created_at");
  CREATE INDEX "_editorial_drafts_v_updated_at_idx" ON "_editorial_drafts_v" USING btree ("updated_at");
  CREATE INDEX "_editorial_drafts_v_latest_idx" ON "_editorial_drafts_v" USING btree ("latest");
  CREATE INDEX "multi_source_reviews_updated_at_idx" ON "multi_source_reviews" USING btree ("updated_at");
  CREATE INDEX "multi_source_reviews_created_at_idx" ON "multi_source_reviews" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_staff_id_idx" ON "payload_locked_documents_rels" USING btree ("staff_id");
  CREATE INDEX "payload_locked_documents_rels_editorial_drafts_id_idx" ON "payload_locked_documents_rels" USING btree ("editorial_drafts_id");
  CREATE INDEX "payload_locked_documents_rels_multi_source_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("multi_source_reviews_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_staff_id_idx" ON "payload_preferences_rels" USING btree ("staff_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "staff_sessions" CASCADE;
  DROP TABLE "staff" CASCADE;
  DROP TABLE "editorial_drafts" CASCADE;
  DROP TABLE "_editorial_drafts_v" CASCADE;
  DROP TABLE "multi_source_reviews" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_staff_role";
  DROP TYPE "public"."enum_editorial_drafts_status";
  DROP TYPE "public"."enum__editorial_drafts_v_version_status";`)
}
