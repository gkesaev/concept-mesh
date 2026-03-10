import { db } from './client'
import { concepts, connections } from './schema'

const SEED_CONCEPTS = [
  {
    id: 'binary-search',
    name: 'Binary Search',
    domain: 'Computer Science',
    explanation: 'An efficient O(log n) algorithm for finding a target in a sorted array by repeatedly halving the search space.',
    difficulty: 'beginner',
    metadata: {},
  },
  {
    id: 'derivatives',
    name: 'Derivatives',
    domain: 'Mathematics',
    explanation: 'The instantaneous rate of change of a function — measuring how quickly output changes as input changes at any point.',
    difficulty: 'intermediate',
    metadata: {},
  },
  {
    id: 'neural-networks',
    name: 'Neural Networks',
    domain: 'Computer Science',
    explanation: 'Layers of interconnected nodes that learn patterns from data, where each connection has a learnable weight.',
    difficulty: 'advanced',
    metadata: {},
  },
  {
    id: 'probability',
    name: 'Probability',
    domain: 'Mathematics',
    explanation: 'The mathematical study of randomness and uncertainty, measuring how likely events are to occur.',
    difficulty: 'beginner',
    metadata: {},
  },
  {
    id: 'velocity',
    name: 'Velocity',
    domain: 'Physics',
    explanation: 'Rate of change of position with respect to time, including both speed (magnitude) and direction.',
    difficulty: 'beginner',
    metadata: {},
  },
]

const SEED_CONNECTIONS = [
  { sourceId: 'neural-networks', targetId: 'derivatives',    reason: 'Backpropagation is the chain rule for derivatives applied through layers' },
  { sourceId: 'derivatives',     targetId: 'velocity',        reason: 'Velocity is the derivative of position with respect to time' },
  { sourceId: 'neural-networks', targetId: 'probability',     reason: 'Neural networks output probability distributions' },
  { sourceId: 'binary-search',   targetId: 'probability',     reason: 'Expected search length uses probability distributions' },
]

async function seed() {
  console.log('Seeding concepts...')
  await db.insert(concepts).values(SEED_CONCEPTS).onConflictDoNothing()

  console.log('Seeding connections...')
  await db.insert(connections).values(
    SEED_CONNECTIONS.map(c => ({
      ...c,
      type: 'related' as const,
      strength: 1.0,
      aiGenerated: false,
    }))
  ).onConflictDoNothing()

  console.log('Seed complete.')
}

seed().catch(console.error)
