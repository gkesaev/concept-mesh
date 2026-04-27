// Heuristics that suggest a visualization technique for a concept based on its
// domain and a few keyword cues in title/description. The mapping is advisory:
// the planner prompt receives the suggestion and is free to override it.

export type Technique =
  | 'interactive-graph'      // adjustable axes / parameters → output curve
  | 'animated-process'       // step-through animation of an algorithm/process
  | 'particle-simulation'    // physics or agent-based simulation
  | 'tree-or-graph'          // node-link diagram with traversal
  | 'matrix-or-grid'         // 2D grid where cells encode state
  | 'comparison-toy'         // side-by-side toggle showing two regimes
  | 'fractal-or-recursion'   // self-similar / recursive drawing
  | 'flow-field'             // vector field with traceable paths
  | 'distribution-sampler'   // sample-and-histogram for randomness
  | 'phase-portrait'         // dynamical system trajectories

export interface TechniqueSuggestion {
  primary: Technique
  secondary: Technique[]
  rationale: string
}

const KEYWORD_HINTS: Array<{ technique: Technique; words: RegExp }> = [
  { technique: 'animated-process',     words: /\b(algorithm|sort|search|traversal|step|iter|recursion|loop)\b/i },
  { technique: 'particle-simulation',  words: /\b(particle|gas|fluid|flock|swarm|brownian|molecule|atom|gravity)\b/i },
  { technique: 'tree-or-graph',        words: /\b(tree|graph|network|node|edge|bfs|dfs|dijkstra|topology)\b/i },
  { technique: 'matrix-or-grid',       words: /\b(grid|cellular|automaton|matrix|tile|board|maze)\b/i },
  { technique: 'fractal-or-recursion', words: /\b(fractal|recursion|self.similar|mandelbrot|koch|sierpinski|l.system)\b/i },
  { technique: 'flow-field',           words: /\b(flow|field|vector|gradient|curl|divergence|stream)\b/i },
  { technique: 'distribution-sampler', words: /\b(probability|distribution|random|sample|monte.carlo|bayes|stochastic)\b/i },
  { technique: 'phase-portrait',       words: /\b(differential|dynamical|chaos|attractor|oscillat|pendulum|orbit)\b/i },
  { technique: 'comparison-toy',       words: /\b(compare|contrast|versus|vs\.?|trade.?off)\b/i },
  { technique: 'interactive-graph',    words: /\b(function|derivative|integral|curve|equation|graph of|plot)\b/i },
]

const DOMAIN_DEFAULTS: Record<string, Technique> = {
  Mathematics:        'interactive-graph',
  'Computer Science': 'animated-process',
  Physics:            'particle-simulation',
  Biology:            'particle-simulation',
  Chemistry:          'particle-simulation',
  Economics:          'distribution-sampler',
  Finance:            'distribution-sampler',
  Statistics:         'distribution-sampler',
  Music:              'flow-field',
  Art:                'fractal-or-recursion',
  Philosophy:         'comparison-toy',
}

export function suggestTechnique(input: {
  title: string
  domain: string
  description: string
}): TechniqueSuggestion {
  const haystack = `${input.title} ${input.description}`
  const matches = KEYWORD_HINTS.filter(h => h.words.test(haystack)).map(h => h.technique)
  const domainDefault = DOMAIN_DEFAULTS[input.domain] ?? 'interactive-graph'

  const primary: Technique = matches[0] ?? domainDefault
  const secondaryPool: Technique[] = [...matches.slice(1), domainDefault]
  const secondary = Array.from(new Set(secondaryPool)).filter(t => t !== primary).slice(0, 2)

  const rationale = matches.length > 0
    ? `Keyword cues in the description suggest ${primary}.`
    : `No strong keyword cues; defaulting to the ${input.domain} domain norm (${domainDefault}).`

  return { primary, secondary, rationale }
}
