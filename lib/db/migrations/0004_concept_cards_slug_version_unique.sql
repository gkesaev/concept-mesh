-- Migration: add unique constraint on concept_cards(slug, version)
-- Prevents duplicate card versions for the same concept.

ALTER TABLE "concept_cards"
  ADD CONSTRAINT "concept_cards_slug_version" UNIQUE ("slug", "version");
