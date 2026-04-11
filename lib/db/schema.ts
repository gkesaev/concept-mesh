import {
  pgTable,
  text,
  real,
  boolean,
  integer,
  timestamp,
  uuid,
  unique,
  index,
  vector,
  primaryKey,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

// ──────────────────────────────────────────────────────────
// NextAuth tables
// ──────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:          text('name'),
  email:         text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image:         text('image'),
  encryptedApiKey: text('encrypted_api_key'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
})

export const accounts = pgTable('accounts', {
  userId:            text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type:              text('type').$type<AdapterAccountType>().notNull(),
  provider:          text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token:     text('refresh_token'),
  access_token:      text('access_token'),
  expires_at:        integer('expires_at'),
  token_type:        text('token_type'),
  scope:             text('scope'),
  id_token:          text('id_token'),
  session_state:     text('session_state'),
}, (t) => [
  primaryKey({ columns: [t.provider, t.providerAccountId] }),
])

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId:       text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires:      timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token:      text('token').notNull(),
  expires:    timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.identifier, t.token] }),
])

// ──────────────────────────────────────────────────────────
// Domain tables
// ──────────────────────────────────────────────────────────

export const concepts = pgTable('concepts', {
  slug:        text('slug').primaryKey(),
  title:       text('title').notNull(),
  domain:      text('domain').notNull(),
  description: text('description').notNull(),
  embedding:   vector('embedding', { dimensions: 1536 }),
  bestCardId:  uuid('best_card_id'),
  cardCount:   integer('card_count').default(0).notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('concepts_domain_idx').on(t.domain),
])

export const conceptCards = pgTable('concept_cards', {
  id:   uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().references(() => concepts.slug, { onDelete: 'cascade' }),
  version: integer('version').default(1).notNull(),

  // Concept metadata (denormalized for card self-containedness)
  title:       text('title').notNull(),
  domain:      text('domain').notNull(),
  description: text('description').notNull(),
  tags:        text('tags').array().default([]).notNull(),
  difficulty:  text('difficulty').$type<'beginner' | 'intermediate' | 'advanced'>(),

  // Visualization
  html:               text('html').notNull(),
  thumbnail:          text('thumbnail'),
  interactivityLevel: integer('interactivity_level').default(0).notNull(),

  // Quality & status
  status:                      text('status').$type<'draft' | 'validating' | 'published' | 'flagged'>().default('draft').notNull(),
  validationRenders:           boolean('validation_renders'),
  validationHasInteractivity:  boolean('validation_has_interactivity'),
  validationScreenshotHash:    text('validation_screenshot_hash'),

  // Provenance
  authorId:         text('author_id').references(() => users.id, { onDelete: 'set null' }),
  generatedWith:    text('generated_with'),
  generationPrompt: text('generation_prompt'),
  parentCardId:     uuid('parent_card_id'),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),

  // Community
  upvotes:    integer('upvotes').default(0).notNull(),
  views:      integer('views').default(0).notNull(),
  embedCount: integer('embed_count').default(0).notNull(),
}, (t) => [
  unique('concept_cards_slug_version').on(t.slug, t.version),
  index('concept_cards_slug_idx').on(t.slug),
  index('concept_cards_status_idx').on(t.status),
])

export const conceptEdges = pgTable('concept_edges', {
  id:           uuid('id').primaryKey().defaultRandom(),
  sourceSlug:   text('source_slug').notNull().references(() => concepts.slug, { onDelete: 'cascade' }),
  targetSlug:   text('target_slug').notNull().references(() => concepts.slug, { onDelete: 'cascade' }),
  relationship: text('relationship').$type<'related' | 'prerequisite' | 'application' | 'contrast' | 'analogy'>().default('related').notNull(),
  reason:       text('reason'),
  aiGenerated:  boolean('ai_generated').default(false).notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique('unique_edge').on(t.sourceSlug, t.targetSlug),
  index('concept_edges_source_idx').on(t.sourceSlug),
  index('concept_edges_target_idx').on(t.targetSlug),
])

// ──────────────────────────────────────────────────────────
// Supporting tables
// ──────────────────────────────────────────────────────────

export const nodePositions = pgTable('node_positions', {
  conceptSlug: text('concept_slug').primaryKey().references(() => concepts.slug, { onDelete: 'cascade' }),
  x:           real('x').notNull(),
  y:           real('y').notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

export const favorites = pgTable('favorites', {
  userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conceptSlug: text('concept_slug').notNull().references(() => concepts.slug, { onDelete: 'cascade' }),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.conceptSlug] }),
])

// ──────────────────────────────────────────────────────────
// Type exports
// ──────────────────────────────────────────────────────────

export type DbUser = typeof users.$inferSelect
export type DbConcept = typeof concepts.$inferSelect
export type DbConceptCard = typeof conceptCards.$inferSelect
export type DbConceptEdge = typeof conceptEdges.$inferSelect
export type DbNodePosition = typeof nodePositions.$inferSelect
export type DbFavorite = typeof favorites.$inferSelect
