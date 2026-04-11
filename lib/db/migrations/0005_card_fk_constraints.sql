-- Migration: add missing foreign key constraints on card pointers
-- Ensures concepts.best_card_id and concept_cards.parent_card_id cannot
-- reference nonexistent cards; both clear to NULL when the referenced
-- card is deleted so concept rows and lineage degrade cleanly.

-- Clear orphaned pointers first so the ADD CONSTRAINT cannot fail
UPDATE "concepts"
  SET "best_card_id" = NULL
  WHERE "best_card_id" IS NOT NULL
    AND "best_card_id" NOT IN (SELECT "id" FROM "concept_cards");
--> statement-breakpoint
UPDATE "concept_cards"
  SET "parent_card_id" = NULL
  WHERE "parent_card_id" IS NOT NULL
    AND "parent_card_id" NOT IN (SELECT "id" FROM "concept_cards");
--> statement-breakpoint
ALTER TABLE "concepts"
  ADD CONSTRAINT "concepts_best_card_id_concept_cards_id_fk"
  FOREIGN KEY ("best_card_id") REFERENCES "public"."concept_cards"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "concept_cards"
  ADD CONSTRAINT "concept_cards_parent_card_id_concept_cards_id_fk"
  FOREIGN KEY ("parent_card_id") REFERENCES "public"."concept_cards"("id")
  ON DELETE set null ON UPDATE no action;
