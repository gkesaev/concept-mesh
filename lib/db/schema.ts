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
} from 'drizzle-orm/pg-core'

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

export type DbConcept = typeof concepts.$inferSelect
export type DbConnection = typeof connections.$inferSelect
export type DbVisualization = typeof visualizations.$inferSelect
export type DbNodePosition = typeof nodePositions.$inferSelect
