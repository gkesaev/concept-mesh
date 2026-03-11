import {
  pgTable,
  text,
  real,
  boolean,
  integer,
  timestamp,
  jsonb,
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
  // Encrypted Anthropic API key (AES-256-GCM, base64-encoded)
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
// Favorites
// ──────────────────────────────────────────────────────────

export const favorites = pgTable('favorites', {
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conceptId: text('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.conceptId] }),
])

// ──────────────────────────────────────────────────────────
// Domain tables
// ──────────────────────────────────────────────────────────

export const concepts = pgTable('concepts', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  domain:      text('domain').notNull(),
  explanation: text('explanation').notNull(),
  difficulty:  text('difficulty'),
  metadata:    jsonb('metadata').$type<Record<string, unknown>>().default({}),
  embedding:   vector('embedding', { dimensions: 1536 }),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().notNull(),
})

export const connections = pgTable('connections', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sourceId:    text('source_id').references(() => concepts.id, { onDelete: 'cascade' }).notNull(),
  targetId:    text('target_id').references(() => concepts.id, { onDelete: 'cascade' }).notNull(),
  type:        text('type').default('related').notNull(),
  strength:    real('strength').default(1.0).notNull(),
  aiGenerated: boolean('ai_generated').default(false).notNull(),
  reason:      text('reason'),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  unique('unique_connection').on(t.sourceId, t.targetId),
  index('connections_source_idx').on(t.sourceId),
  index('connections_target_idx').on(t.targetId),
])

export const visualizations = pgTable('visualizations', {
  id:        uuid('id').primaryKey().defaultRandom(),
  conceptId: text('concept_id').references(() => concepts.id, { onDelete: 'cascade' }).notNull(),
  code:      text('code').notNull(),
  plan:      text('plan'),
  version:   integer('version').default(1).notNull(),
  isActive:  boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('viz_concept_idx').on(t.conceptId),
])

export const nodePositions = pgTable('node_positions', {
  conceptId: text('concept_id').primaryKey().references(() => concepts.id, { onDelete: 'cascade' }),
  x:         real('x').notNull(),
  y:         real('y').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type DbUser = typeof users.$inferSelect
export type DbConcept = typeof concepts.$inferSelect
export type DbConnection = typeof connections.$inferSelect
export type DbVisualization = typeof visualizations.$inferSelect
export type DbNodePosition = typeof nodePositions.$inferSelect
export type DbFavorite = typeof favorites.$inferSelect
