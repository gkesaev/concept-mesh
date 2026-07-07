import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { count, eq } from 'drizzle-orm'
import { db } from './client'
import { concepts, conceptEdges, conceptCards } from './schema'

const SEED_CONCEPTS = [
  {
    slug: 'binary-search',
    title: 'Binary Search',
    domain: 'Computer Science',
    description: 'An efficient O(log n) algorithm for finding a target in a sorted array by repeatedly halving the search space.',
  },
  {
    slug: 'derivatives',
    title: 'Derivatives',
    domain: 'Mathematics',
    description: 'The instantaneous rate of change of a function — measuring how quickly output changes as input changes at any point.',
  },
  {
    slug: 'neural-networks',
    title: 'Neural Networks',
    domain: 'Computer Science',
    description: 'Layers of interconnected nodes that learn patterns from data, where each connection has a learnable weight.',
  },
  {
    slug: 'probability',
    title: 'Probability',
    domain: 'Mathematics',
    description: 'The mathematical study of randomness and uncertainty, measuring how likely events are to occur.',
  },
  {
    slug: 'velocity',
    title: 'Velocity',
    domain: 'Physics',
    description: 'Rate of change of position with respect to time, including both speed (magnitude) and direction.',
  },
  {
    slug: 'compound-interest',
    title: 'Compound Interest',
    domain: 'Finance',
    description: 'Interest calculated on both the initial principal and accumulated interest from previous periods, creating exponential growth.',
  },
  {
    slug: 'natural-selection',
    title: 'Natural Selection',
    domain: 'Biology',
    description: 'The process by which organisms with traits better suited to their environment tend to survive and reproduce more successfully.',
  },
  {
    slug: 'supply-and-demand',
    title: 'Supply and Demand',
    domain: 'Economics',
    description: 'The relationship between the quantity of a good producers wish to sell and the quantity consumers wish to buy at various prices.',
  },
  {
    slug: 'wave-particle-duality',
    title: 'Wave-Particle Duality',
    domain: 'Physics',
    description: 'The concept that every quantum entity can be described as either a particle or a wave, depending on how it is observed.',
  },
  {
    slug: 'recursion',
    title: 'Recursion',
    domain: 'Computer Science',
    description: 'A technique where a function calls itself to solve smaller instances of the same problem until reaching a base case.',
  },
]

const SEED_EDGES = [
  { sourceSlug: 'neural-networks', targetSlug: 'derivatives',        reason: 'Backpropagation is the chain rule for derivatives applied through layers' },
  { sourceSlug: 'derivatives',     targetSlug: 'velocity',           reason: 'Velocity is the derivative of position with respect to time' },
  { sourceSlug: 'neural-networks', targetSlug: 'probability',        reason: 'Neural networks output probability distributions' },
  { sourceSlug: 'binary-search',   targetSlug: 'recursion',          reason: 'Binary search is a naturally recursive divide-and-conquer algorithm' },
  { sourceSlug: 'compound-interest', targetSlug: 'derivatives',      reason: 'Continuous compound interest is described by exponential functions and their derivatives' },
  { sourceSlug: 'natural-selection', targetSlug: 'probability',      reason: 'Natural selection is driven by probabilistic variation and survival' },
  { sourceSlug: 'supply-and-demand', targetSlug: 'compound-interest', reason: 'Interest rates are set by supply and demand for credit in financial markets' },
  { sourceSlug: 'wave-particle-duality', targetSlug: 'probability',  reason: 'Quantum measurements yield probabilistic outcomes described by wave functions' },
]

// Reference cards from the card spec (docs/card-spec.md, issue #8)
const SEED_CARDS = [
  {
    slug: 'binary-search',
    file: 'binary-search.html',
    tags: ['algorithms', 'trees'],
    difficulty: 'beginner' as const,
    interactivityLevel: 0,
  },
  {
    slug: 'compound-interest',
    file: 'compound-interest.html',
    tags: ['finance', 'exponential-growth'],
    difficulty: 'beginner' as const,
    interactivityLevel: 1,
  },
]

async function seedCards() {
  for (const sc of SEED_CARDS) {
    const concept = SEED_CONCEPTS.find(c => c.slug === sc.slug)
    if (!concept) continue

    const html = readFileSync(join(__dirname, 'seed-cards', sc.file), 'utf-8')

    await db.transaction(async (tx) => {
      await tx.insert(conceptCards).values({
        slug: sc.slug,
        version: 1,
        title: concept.title,
        domain: concept.domain,
        description: concept.description,
        tags: sc.tags,
        difficulty: sc.difficulty,
        html,
        interactivityLevel: sc.interactivityLevel,
        status: 'published',
        validationRenders: true,
        generatedWith: 'seed',
      }).onConflictDoNothing()

      const card = await tx.query.conceptCards.findFirst({
        where: (c, { and, eq }) => and(eq(c.slug, sc.slug), eq(c.version, 1)),
      })
      if (!card) return

      const [{ value: cardCount }] = await tx
        .select({ value: count() })
        .from(conceptCards)
        .where(eq(conceptCards.slug, sc.slug))

      await tx.update(concepts)
        .set({ bestCardId: card.id, cardCount, updatedAt: new Date() })
        .where(eq(concepts.slug, sc.slug))
    })
  }
}

async function seed() {
  console.log('Seeding concepts...')
  await db.insert(concepts).values(SEED_CONCEPTS).onConflictDoNothing()

  console.log('Seeding edges...')
  await db.insert(conceptEdges).values(
    SEED_EDGES.map(e => ({
      ...e,
      relationship: 'related' as const,
      aiGenerated: false,
    }))
  ).onConflictDoNothing()

  console.log('Seeding cards...')
  await seedCards()

  console.log('Seed complete.')
}

seed().catch(console.error)
