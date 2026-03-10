export const VISUALIZATION_TECHNIQUES: Record<string, { description: string; pattern: string }> = {
  arrays:          { description: 'Show as horizontal bar chart or numbered boxes', pattern: 'Colored bars with values, highlight active elements, animate swaps/comparisons' },
  trees:           { description: 'Node-link diagrams with hierarchical layout', pattern: 'Circles for nodes, lines for edges, highlight traversal path, animate insertions' },
  graphs:          { description: 'Force-directed or grid layouts with nodes and edges', pattern: 'Draggable nodes, edge weights as thickness, BFS/DFS wavefront animation' },
  numberLine:      { description: 'Linear scale with markers and intervals', pattern: 'Horizontal line, tick marks, draggable points, zoom capability' },
  coordinatePlane: { description: '2D graph with axes, gridlines, and plotted elements', pattern: 'X/Y axes, gridlines, plot functions, show tangent/secant lines' },
  areaModel:       { description: 'Rectangular grids showing quantity relationships', pattern: 'Grid squares, color-coded regions, partial shading for fractions' },
  stepByStep:      { description: 'Sequential state changes with controls', pattern: 'Play/pause, step forward/back, state display, operation counter' },
  flowDiagram:     { description: 'Connected stages showing transformation', pattern: 'Boxes for stages, arrows for flow, highlight current stage, animate data moving' },
  simulation:      { description: 'Real-time physics with parameter controls', pattern: 'Animated canvas, velocity/force vectors, energy bars, time controls' },
  vectorField:     { description: 'Arrows showing magnitude and direction', pattern: 'Grid of arrows, color for magnitude, particle traces' },
  sideBySide:      { description: 'Two related views for comparison', pattern: 'Split view, synchronized controls, highlight differences' },
  histogram:       { description: 'Frequency distribution bars', pattern: 'Vertical bars, running totals, probability convergence' },
}

const CONCEPT_TECHNIQUE_MAP: Record<string, string[]> = {
  'binary-search':   ['arrays', 'stepByStep'],
  'sorting':         ['arrays', 'stepByStep'],
  'binary-trees':    ['trees', 'stepByStep'],
  'graphs':          ['graphs'],
  'bfs':             ['graphs', 'stepByStep'],
  'dfs':             ['graphs', 'stepByStep'],
  'hash-tables':     ['arrays', 'histogram'],
  'linked-lists':    ['flowDiagram'],
  'recursion':       ['trees', 'flowDiagram'],
  'neural-networks': ['flowDiagram', 'simulation'],
  'machine-learning':['coordinatePlane', 'stepByStep'],
  'algebra':         ['coordinatePlane', 'areaModel'],
  'derivatives':     ['coordinatePlane', 'stepByStep'],
  'integrals':       ['coordinatePlane', 'areaModel'],
  'limits':          ['coordinatePlane', 'numberLine'],
  'fractions':       ['areaModel', 'numberLine'],
  'probability':     ['histogram', 'simulation'],
  'statistics':      ['histogram', 'sideBySide'],
  'linear-algebra':  ['coordinatePlane', 'vectorField'],
  'trigonometry':    ['coordinatePlane', 'simulation'],
  'velocity':        ['simulation', 'coordinatePlane'],
  'forces':          ['vectorField', 'simulation'],
  'waves':           ['simulation', 'coordinatePlane'],
}

export function getRecommendedTechniques(conceptId: string): string[] {
  const id = conceptId.toLowerCase()
  if (CONCEPT_TECHNIQUE_MAP[id]) return CONCEPT_TECHNIQUE_MAP[id]
  for (const [key, techniques] of Object.entries(CONCEPT_TECHNIQUE_MAP)) {
    if (id.includes(key) || key.includes(id)) return techniques
  }
  return ['stepByStep', 'coordinatePlane']
}
