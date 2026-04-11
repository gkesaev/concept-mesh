-- Migration: v2 ConceptCard schema
-- Reshapes concepts table, replaces connections with concept_edges,
-- adds concept_cards table, updates supporting tables.

-- ────────────────────────────────────────────────────────
-- 1. Reshape concepts table (before creating new tables so FKs can reference concepts.slug)
--    - Rename PK column: id → slug (existing values are already slug-formatted, e.g. "binary-search")
--    - Rename columns: name → title, explanation → description
--    - Drop columns: difficulty, metadata
--    - Add columns: best_card_id, card_count
-- ────────────────────────────────────────────────────────

ALTER TABLE "concepts" RENAME COLUMN "id" TO "slug";
--> statement-breakpoint
ALTER TABLE "concepts" RENAME COLUMN "name" TO "title";
--> statement-breakpoint
ALTER TABLE "concepts" RENAME COLUMN "explanation" TO "description";
--> statement-breakpoint
ALTER TABLE "concepts" DROP COLUMN IF EXISTS "difficulty";
--> statement-breakpoint
ALTER TABLE "concepts" DROP COLUMN IF EXISTS "metadata";
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "best_card_id" uuid;
--> statement-breakpoint
ALTER TABLE "concepts" ADD COLUMN "card_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX "concepts_domain_idx" ON "concepts" USING btree ("domain");
--> statement-breakpoint

-- ────────────────────────────────────────────────────────
-- 2. Reshape node_positions: rename concept_id → concept_slug
-- ────────────────────────────────────────────────────────

ALTER TABLE "node_positions" RENAME COLUMN "concept_id" TO "concept_slug";
--> statement-breakpoint

-- ────────────────────────────────────────────────────────
-- 3. Reshape favorites: rename concept_id → concept_slug
-- ────────────────────────────────────────────────────────

ALTER TABLE "favorites" DROP CONSTRAINT IF EXISTS "favorites_user_id_concept_id_pk";
--> statement-breakpoint
ALTER TABLE "favorites" DROP CONSTRAINT IF EXISTS "favorites_concept_id_concepts_id_fk";
--> statement-breakpoint
ALTER TABLE "favorites" RENAME COLUMN "concept_id" TO "concept_slug";
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_concept_slug_pk" PRIMARY KEY ("user_id", "concept_slug");
--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_concept_slug_concepts_slug_fk" FOREIGN KEY ("concept_slug") REFERENCES "public"."concepts"("slug") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- ────────────────────────────────────────────────────────
-- 4. Create concept_cards table
-- ────────────────────────────────────────────────────────

CREATE TABLE "concept_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "title" text NOT NULL,
  "domain" text NOT NULL,
  "description" text NOT NULL,
  "tags" text[] DEFAULT '{}' NOT NULL,
  "difficulty" text,
  "html" text NOT NULL,
  "thumbnail" text,
  "interactivity_level" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "validation_renders" boolean,
  "validation_has_interactivity" boolean,
  "validation_screenshot_hash" text,
  "author_id" text,
  "generated_with" text,
  "generation_prompt" text,
  "parent_card_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "upvotes" integer DEFAULT 0 NOT NULL,
  "views" integer DEFAULT 0 NOT NULL,
  "embed_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "concept_cards" ADD CONSTRAINT "concept_cards_slug_concepts_slug_fk" FOREIGN KEY ("slug") REFERENCES "public"."concepts"("slug") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "concept_cards" ADD CONSTRAINT "concept_cards_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "concept_cards_slug_idx" ON "concept_cards" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "concept_cards_status_idx" ON "concept_cards" USING btree ("status");
--> statement-breakpoint

-- ────────────────────────────────────────────────────────
-- 5. Create concept_edges table (replaces connections)
-- ────────────────────────────────────────────────────────

CREATE TABLE "concept_edges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_slug" text NOT NULL,
  "target_slug" text NOT NULL,
  "relationship" text DEFAULT 'related' NOT NULL,
  "reason" text,
  "ai_generated" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "unique_edge" UNIQUE("source_slug", "target_slug")
);
--> statement-breakpoint
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_source_slug_concepts_slug_fk" FOREIGN KEY ("source_slug") REFERENCES "public"."concepts"("slug") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_target_slug_concepts_slug_fk" FOREIGN KEY ("target_slug") REFERENCES "public"."concepts"("slug") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "concept_edges_source_idx" ON "concept_edges" USING btree ("source_slug");
--> statement-breakpoint
CREATE INDEX "concept_edges_target_idx" ON "concept_edges" USING btree ("target_slug");
--> statement-breakpoint

-- ────────────────────────────────────────────────────────
-- 6. Migrate existing connections data, then drop old table
--    Maps: source_id → source_slug, target_id → target_slug, type → relationship
--    Note: the old "strength" column has no equivalent and is intentionally dropped.
-- ────────────────────────────────────────────────────────

INSERT INTO "concept_edges" ("source_slug", "target_slug", "relationship", "reason", "ai_generated", "created_at")
SELECT "source_id", "target_id", COALESCE("type", 'related'), "reason", COALESCE("ai_generated", false), COALESCE("created_at", now())
FROM "connections"
ON CONFLICT ON CONSTRAINT "unique_edge" DO NOTHING;
--> statement-breakpoint
DROP TABLE IF EXISTS "connections" CASCADE;
