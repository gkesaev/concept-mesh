import React, { useState, useEffect, useRef } from 'react';

// ============================================================================
// MULTI-SHOT AGENTIC VISUALIZATION PIPELINE
// ============================================================================

/*
PIPELINE OVERVIEW:
1. CONTEXT SHOT: Describe the project, provide full context, ask for concept analysis
2. PLANNING SHOT: Based on concept, plan the visualization approach and pick techniques
3. GENERATION SHOT: With the plan locked in, generate the actual code
4. (Optional) VALIDATION SHOT: If code fails, send error back for fix

This approach:
- Gives the model full context before asking for code
- Separates "what to build" from "how to build it"
- Allows domain-specific visualization strategies
- Produces more thoughtful, pedagogically-sound visualizations
*/

const PROJECT_CONTEXT = `
You are part of an AI-powered educational knowledge graph system. This system helps learners understand concepts through interactive visualizations.

THE PRODUCT:
- Users click on concepts (like "binary search", "derivatives", "neural networks")
- The system generates an interactive React visualization that teaches the concept
- Visualizations should create "aha moments" - making abstract ideas concrete and explorable

WHAT MAKES A GREAT VISUALIZATION:
1. CONCRETE REPRESENTATION: Abstract concepts shown as manipulable visual elements
2. INTERACTIVITY: Users can change parameters and see immediate effects
3. PROGRESSIVE DISCLOSURE: Start simple, let users explore complexity
4. VISUAL FEEDBACK: Color, animation, and layout that reinforce understanding
5. KEY INSIGHT: Every visualization should reveal ONE core insight about the concept

EXAMPLES OF EXCELLENT VISUALIZATIONS:
- Decimals: Grid squares for place value (green=whole, blue grid=hundredths), number line with position marker
- Binary Search: Array of numbered boxes, search space highlighted, step-by-step elimination with comparison counter
- Derivatives: Curve with draggable point, tangent line that updates, slope readout, secant line approaching tangent
- Neural Networks: Nodes as circles, weights as line thickness, activation flowing through layers with sliders for inputs
- Sorting: Bar chart where you can step through swaps, color coding for compared/sorted elements

TECHNICAL CONSTRAINTS:
- Must use React.createElement() syntax (NO JSX - no angle brackets for elements)
- Available: useState, useEffect, useRef, useCallback, useMemo
- Canvas is great for graphics (use useRef)
- Keep code under 200 lines ideally
- Must be self-contained (no external data)
`;

const VISUALIZATION_TECHNIQUES = {
  // Data structure visualizations
  arrays: {
    description: 'Show as horizontal bar chart or numbered boxes',
    pattern: 'Colored bars with values, highlight active elements, animate swaps/comparisons',
    examples: ['sorting', 'binary-search', 'two-pointers']
  },
  trees: {
    description: 'Node-link diagrams with hierarchical layout',
    pattern: 'Circles for nodes, lines for edges, highlight traversal path, animate insertions',
    examples: ['binary-trees', 'heaps', 'tries', 'decision-trees']
  },
  graphs: {
    description: 'Force-directed or grid layouts with nodes and edges',
    pattern: 'Draggable nodes, edge weights as thickness, BFS/DFS wavefront animation',
    examples: ['graph-traversal', 'shortest-path', 'network-flow']
  },
  
  // Mathematical visualizations
  numberLine: {
    description: 'Linear scale with markers and intervals',
    pattern: 'Horizontal line, tick marks, draggable points, zoom capability',
    examples: ['decimals', 'fractions', 'inequalities', 'limits']
  },
  coordinatePlane: {
    description: '2D graph with axes, gridlines, and plotted elements',
    pattern: 'X/Y axes, gridlines, plot functions, show tangent/secant lines',
    examples: ['functions', 'derivatives', 'integrals', 'linear-algebra']
  },
  areaModel: {
    description: 'Rectangular grids showing quantity relationships',
    pattern: 'Grid squares, color-coded regions, partial shading for fractions',
    examples: ['multiplication', 'fractions', 'probability', 'percentages']
  },
  
  // Process visualizations
  stepByStep: {
    description: 'Sequential state changes with controls',
    pattern: 'Play/pause, step forward/back, state display, operation counter',
    examples: ['algorithms', 'proofs', 'chemical-reactions', 'state-machines']
  },
  flowDiagram: {
    description: 'Connected stages showing transformation',
    pattern: 'Boxes for stages, arrows for flow, highlight current stage, animate data moving',
    examples: ['pipelines', 'recursion', 'compilers', 'neural-networks']
  },
  
  // Physics/dynamics visualizations
  simulation: {
    description: 'Real-time physics with parameter controls',
    pattern: 'Animated canvas, velocity/force vectors, energy bars, time controls',
    examples: ['projectile-motion', 'pendulum', 'waves', 'collisions']
  },
  vectorField: {
    description: 'Arrows showing magnitude and direction',
    pattern: 'Grid of arrows, color for magnitude, particle traces',
    examples: ['forces', 'electric-fields', 'fluid-flow', 'gradients']
  },
  
  // Comparative visualizations
  sideBySide: {
    description: 'Two related views for comparison',
    pattern: 'Split view, synchronized controls, highlight differences',
    examples: ['complexity-comparison', 'before-after', 'algorithm-races']
  },
  histogram: {
    description: 'Frequency distribution bars',
    pattern: 'Vertical bars, running totals, probability convergence',
    examples: ['probability', 'statistics', 'hash-distribution']
  }
};

// Map concepts to recommended techniques
const CONCEPT_TECHNIQUE_MAP = {
  // Computer Science
  'binary-search': ['arrays', 'stepByStep'],
  'sorting': ['arrays', 'stepByStep'],
  'quick-sort': ['arrays', 'stepByStep'],
  'merge-sort': ['arrays', 'stepByStep'],
  'bubble-sort': ['arrays', 'stepByStep'],
  'binary-trees': ['trees', 'stepByStep'],
  'bst': ['trees', 'stepByStep'],
  'heaps': ['trees', 'arrays'],
  'graphs': ['graphs'],
  'bfs': ['graphs', 'stepByStep'],
  'dfs': ['graphs', 'stepByStep'],
  'hash-tables': ['arrays', 'histogram'],
  'linked-lists': ['flowDiagram'],
  'recursion': ['trees', 'flowDiagram'],
  'dynamic-programming': ['arrays', 'stepByStep'],
  'neural-networks': ['flowDiagram', 'simulation'],
  'machine-learning': ['coordinatePlane', 'stepByStep'],
  'complexity': ['sideBySide', 'coordinatePlane'],
  
  // Mathematics
  'algebra': ['coordinatePlane', 'areaModel'],
  'derivatives': ['coordinatePlane', 'stepByStep'],
  'integrals': ['coordinatePlane', 'areaModel'],
  'limits': ['coordinatePlane', 'numberLine'],
  'fractions': ['areaModel', 'numberLine'],
  'decimals': ['areaModel', 'numberLine'],
  'probability': ['histogram', 'simulation'],
  'statistics': ['histogram', 'sideBySide'],
  'linear-algebra': ['coordinatePlane', 'vectorField'],
  'matrices': ['areaModel', 'flowDiagram'],
  'trigonometry': ['coordinatePlane', 'simulation'],
  'logarithms': ['coordinatePlane', 'sideBySide'],
  'exponentials': ['coordinatePlane', 'simulation'],
  'sequences': ['numberLine', 'stepByStep'],
  
  // Physics
  'velocity': ['simulation', 'coordinatePlane'],
  'acceleration': ['simulation', 'coordinatePlane'],
  'forces': ['vectorField', 'simulation'],
  'momentum': ['simulation', 'sideBySide'],
  'energy': ['simulation', 'histogram'],
  'waves': ['simulation', 'coordinatePlane'],
  'electricity': ['flowDiagram', 'vectorField'],
  'optics': ['simulation', 'flowDiagram']
};

// Get recommended techniques for a concept
const getRecommendedTechniques = (conceptId) => {
  const id = conceptId.toLowerCase();
  
  // Direct match
  if (CONCEPT_TECHNIQUE_MAP[id]) {
    return CONCEPT_TECHNIQUE_MAP[id];
  }
  
  // Partial match
  for (const [key, techniques] of Object.entries(CONCEPT_TECHNIQUE_MAP)) {
    if (id.includes(key) || key.includes(id)) {
      return techniques;
    }
  }
  
  // Default
  return ['stepByStep', 'coordinatePlane'];
};

// ============================================================================
// AGENTIC GENERATION PIPELINE
// ============================================================================

const generateVisualization = async (conceptId, conceptName, conceptDomain, conceptExplanation, onProgress) => {
  const techniques = getRecommendedTechniques(conceptId);
  const techniqueDescriptions = techniques.map(t => {
    const tech = VISUALIZATION_TECHNIQUES[t];
    return tech ? `- ${t}: ${tech.description}. Pattern: ${tech.pattern}` : '';
  }).filter(Boolean).join('\n');

  // ============ SHOT 1: PLANNING ============
  onProgress('Planning visualization approach...');
  
  const planningPrompt = `${PROJECT_CONTEXT}

CONCEPT TO VISUALIZE:
- ID: ${conceptId}
- Name: ${conceptName}
- Domain: ${conceptDomain}
- Explanation: ${conceptExplanation}

RECOMMENDED VISUALIZATION TECHNIQUES for this concept:
${techniqueDescriptions}

YOUR TASK:
Analyze this concept and create a detailed visualization plan. Think about:

1. CORE INSIGHT: What is the ONE key thing learners should understand from this visualization?

2. VISUAL METAPHOR: What concrete, visual representation will make this abstract concept tangible?

3. INTERACTIVITY: What should users be able to control/manipulate? What parameters matter?

4. ANIMATION: What should animate? What cause-effect relationships should be shown?

5. LAYOUT: Describe the visual layout (top to bottom, what elements go where)

6. STATE: What state variables do we need? What are their ranges?

Respond with a structured plan in this format:

CORE_INSIGHT: [One sentence describing the key takeaway]

VISUAL_ELEMENTS:
- [Element 1]: [Description]
- [Element 2]: [Description]
...

INTERACTIVE_CONTROLS:
- [Control 1]: [Type (slider/button/checkbox)]: [What it controls]
...

ANIMATIONS:
- [Animation 1]: [What triggers it, what it shows]
...

STATE_VARIABLES:
- [variable]: [type]: [range]: [purpose]
...

CANVAS_DRAWING_PLAN:
[Step by step what to draw on the canvas]

Keep the plan focused and achievable in ~150 lines of React.createElement code.`;

  const planResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: planningPrompt }]
    })
  });

  const planData = await planResponse.json();
  const plan = planData.content[0].text;
  
  // ============ SHOT 2: CODE GENERATION ============
  onProgress('Generating visualization code...');
  
  const generationPrompt = `You are generating a React visualization component. Here is the full context and plan:

${PROJECT_CONTEXT}

CONCEPT: ${conceptName} (${conceptDomain})
${conceptExplanation}

VISUALIZATION PLAN:
${plan}

NOW GENERATE THE CODE.

CRITICAL TECHNICAL REQUIREMENTS:
1. Use React.createElement() ONLY - absolutely NO JSX (no < or > for elements)
2. Arrow function format: () => { ... return React.createElement(...); }
3. Available hooks: useState, useEffect, useRef, useCallback, useMemo (passed as parameters, use directly)
4. For canvas: const canvasRef = useRef(null); then ref: canvasRef in the canvas element

STYLE CONSTANTS (use these exactly):
const styles = {
  container: { padding: '1.5rem', background: 'rgba(15, 23, 42, 0.95)', borderRadius: '16px', border: '1px solid rgba(99, 102, 241, 0.2)', fontFamily: 'system-ui, sans-serif' },
  formulaBox: { padding: '1rem', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '10px', fontFamily: 'monospace', fontSize: '1.1rem', textAlign: 'center', color: '#e2e8f0', marginBottom: '1.25rem', border: '1px solid rgba(99, 102, 241, 0.3)' },
  canvas: { width: '100%', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', marginBottom: '1.25rem', display: 'block' },
  controlGroup: { marginBottom: '1rem' },
  label: { display: 'block', marginBottom: '0.5rem', color: '#94a3b8', fontSize: '0.875rem', fontWeight: '500' },
  slider: { width: '100%', accentColor: '#6366f1', cursor: 'pointer' },
  button: { padding: '0.5rem 1rem', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', color: '#c7d2fe', cursor: 'pointer', fontSize: '0.875rem', marginRight: '0.5rem' },
  buttonActive: { padding: '0.5rem 1rem', background: 'rgba(99, 102, 241, 0.5)', border: '1px solid #6366f1', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', marginRight: '0.5rem' },
  infoBox: { marginTop: '1.25rem', padding: '1rem', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '10px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' },
  row: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' },
  statsBox: { display: 'flex', gap: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.875rem' },
  stat: { color: '#6ee7b7' }
};

CANVAS DRAWING COLORS:
- Primary: '#6366f1' (indigo)
- Secondary: '#a855f7' (purple)  
- Success/Found: '#10b981' (green)
- Warning/Active: '#f59e0b' (amber)
- Danger/Eliminated: '#ef4444' (red)
- Neutral: '#475569' (gray)
- Text: '#e2e8f0' (light)
- Subtle text: '#94a3b8'

EXAMPLE STRUCTURE:
() => {
  const [value, setValue] = useState(50);
  const [running, setRunning] = useState(false);
  const canvasRef = useRef(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);
    // Draw your visualization here
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(50, 50, value * 2, 40);
    
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px system-ui';
    ctx.fillText('Value: ' + value, 50, 120);
  }, [value]);
  
  return React.createElement('div', { style: styles.container },
    React.createElement('div', { style: styles.formulaBox }, 
      'Key Formula or Concept Display'
    ),
    React.createElement('canvas', {
      ref: canvasRef,
      width: 500,
      height: 300,
      style: styles.canvas
    }),
    React.createElement('div', { style: styles.controlGroup },
      React.createElement('label', { style: styles.label }, 'Control: ' + value),
      React.createElement('input', {
        type: 'range',
        min: 0,
        max: 100,
        value: value,
        onChange: function(e) { setValue(Number(e.target.value)); },
        style: styles.slider
      })
    ),
    React.createElement('div', { style: styles.infoBox },
      '• Key insight point 1',
      React.createElement('br'),
      '• Key insight point 2'
    )
  );
}

IMPORTANT:
- Define the styles object INSIDE the arrow function at the top
- The canvas should be 500x300 or 600x350 for good visibility
- Include meaningful labels and a legend/info box
- Make sure all state changes trigger visual updates

Return ONLY the arrow function code. No markdown, no backticks, no explanation.`;

  const codeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: generationPrompt }]
    })
  });

  const codeData = await codeResponse.json();
  let code = codeData.content[0].text.trim()
    .replace(/^```(?:javascript|jsx|js)?\n?/, '')
    .replace(/\n?```$/, '');

  return { code, plan };
};

// Attempt to fix broken code
const attemptCodeFix = async (code, error, conceptName, onProgress) => {
  onProgress('Attempting to fix code...');
  
  const fixPrompt = `The following React visualization code for "${conceptName}" has an error:

ERROR: ${error}

CODE:
${code}

Please fix the code. Common issues:
1. JSX syntax used instead of React.createElement
2. Missing parentheses or brackets
3. Undefined variables
4. Incorrect hook usage

Return ONLY the fixed arrow function code. No markdown, no explanation.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: fixPrompt }]
    })
  });

  const data = await response.json();
  return data.content[0].text.trim()
    .replace(/^```(?:javascript|jsx|js)?\n?/, '')
    .replace(/\n?```$/, '');
};

// ============================================================================
// CACHING
// ============================================================================

const conceptCache = new Map();
const saveToCache = (id, data) => conceptCache.set(id, { ...data, cachedAt: new Date().toISOString() });
const loadFromCache = (id) => conceptCache.get(id) || null;

// ============================================================================
// SAFE CODE EVALUATION
// ============================================================================

const evaluateComponent = (code) => {
  try {
    let componentCode = code.trim()
      .replace(/^```(?:javascript|jsx|js)?\n?/, '')
      .replace(/\n?```$/, '')
      .replace(/^const\s+\w+\s*=\s*/, '');
    
    const scope = { 
      React, 
      useState: React.useState, 
      useEffect: React.useEffect, 
      useRef: React.useRef,
      useCallback: React.useCallback,
      useMemo: React.useMemo,
      Math 
    };
    
    const func = new Function(
      ...Object.keys(scope),
      `'use strict'; return (${componentCode});`
    );
    
    return func(...Object.values(scope));
  } catch (error) {
    console.error('Evaluation failed:', error);
    throw error;
  }
};

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Network: () => React.createElement('svg', { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    React.createElement('circle', { cx: 12, cy: 5, r: 3 }),
    React.createElement('circle', { cx: 5, cy: 19, r: 3 }),
    React.createElement('circle', { cx: 19, cy: 19, r: 3 }),
    React.createElement('line', { x1: 12, y1: 8, x2: 5, y2: 16 }),
    React.createElement('line', { x1: 12, y1: 8, x2: 19, y2: 16 })
  ),
  Book: () => React.createElement('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }),
    React.createElement('path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' })
  ),
  Loader: () => React.createElement('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, style: { animation: 'spin 1s linear infinite' } },
    React.createElement('path', { d: 'M21 12a9 9 0 11-6.219-8.56' })
  ),
  X: () => React.createElement('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
    React.createElement('line', { x1: 6, y1: 6, x2: 18, y2: 18 })
  ),
  Zap: () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
  ),
  AlertTriangle: () => React.createElement('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('path', { d: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' }),
    React.createElement('line', { x1: 12, y1: 9, x2: 12, y2: 13 }),
    React.createElement('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 })
  ),
  ChevronRight: () => React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('polyline', { points: '9 18 15 12 9 6' })
  ),
  RefreshCw: () => React.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('polyline', { points: '23 4 23 10 17 10' }),
    React.createElement('polyline', { points: '1 20 1 14 7 14' }),
    React.createElement('path', { d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' })
  ),
  Brain: () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('path', { d: 'M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54' }),
    React.createElement('path', { d: 'M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54' })
  ),
  Lightbulb: () => React.createElement('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
    React.createElement('path', { d: 'M9 18h6' }),
    React.createElement('path', { d: 'M10 22h4' }),
    React.createElement('path', { d: 'M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14' })
  )
};

// ============================================================================
// MAIN APP
// ============================================================================

export default function KnowledgeGraph() {
  const [concepts, setConcepts] = useState({});
  const [selected, setSelected] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [path, setPath] = useState([]);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [currentPlan, setCurrentPlan] = useState(null);

  // Initialize seed concepts
  useEffect(() => {
    const seeds = {
      'binary-search': {
        id: 'binary-search',
        name: 'Binary Search',
        domain: 'Computer Science',
        explanation: 'An efficient O(log n) algorithm for finding a target in a sorted array by repeatedly halving the search space.',
        prerequisites: ['arrays', 'algorithms'],
        applications: ['databases', 'search-engines'],
        difficulty: 'beginner'
      },
      'derivatives': {
        id: 'derivatives',
        name: 'Derivatives',
        domain: 'Mathematics',
        explanation: 'The instantaneous rate of change of a function—measuring how quickly output changes as input changes at any point.',
        prerequisites: ['algebra', 'limits'],
        applications: ['optimization', 'physics', 'integrals'],
        difficulty: 'intermediate'
      },
      'neural-networks': {
        id: 'neural-networks',
        name: 'Neural Networks',
        domain: 'Computer Science',
        explanation: 'Layers of interconnected nodes that learn patterns from data, where each connection has a learnable weight.',
        prerequisites: ['machine-learning', 'linear-algebra'],
        applications: ['deep-learning', 'computer-vision'],
        difficulty: 'advanced'
      },
      'probability': {
        id: 'probability',
        name: 'Probability',
        domain: 'Mathematics',
        explanation: 'The mathematical study of randomness and uncertainty, measuring how likely events are to occur.',
        prerequisites: ['fractions', 'counting'],
        applications: ['statistics', 'machine-learning'],
        difficulty: 'beginner'
      },
      'velocity': {
        id: 'velocity',
        name: 'Velocity',
        domain: 'Physics',
        explanation: 'Rate of change of position with respect to time, including both speed (magnitude) and direction.',
        prerequisites: ['displacement', 'time'],
        applications: ['acceleration', 'kinematics'],
        difficulty: 'beginner'
      }
    };
    
    const loaded = {};
    Object.keys(seeds).forEach(id => {
      loaded[id] = loadFromCache(id) || seeds[id];
    });
    setConcepts(loaded);
  }, []);

  const generate = async (id, existingConcept = null) => {
    setGenerating(id);
    setError(null);
    setCurrentPlan(null);

    try {
      // Get or generate concept metadata
      let concept = existingConcept || concepts[id];
      
      if (!concept || !concept.name) {
        setProgress('Analyzing concept...');
        
        const metaResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 800,
            messages: [{ role: 'user', content: `Generate metadata for educational concept: "${id}"

Return ONLY JSON:
{
  "name": "Human Readable Name",
  "domain": "Mathematics|Computer Science|Physics|Chemistry|Biology|Economics",
  "explanation": "Clear 2-3 sentence explanation",
  "prerequisites": ["concept-id-1"],
  "applications": ["concept-id-2"],
  "difficulty": "beginner|intermediate|advanced"
}` }]
          })
        });

        const metaData = await metaResponse.json();
        const metadata = JSON.parse(metaData.content[0].text.match(/\{[\s\S]*\}/)[0]);
        concept = { id, ...metadata };
      }

      // Run multi-shot pipeline
      const { code, plan } = await generateVisualization(
        concept.id,
        concept.name,
        concept.domain,
        concept.explanation,
        setProgress
      );

      setCurrentPlan(plan);
      setProgress('Validating...');

      // Try to evaluate
      let finalCode = code;
      let Component;
      
      try {
        Component = evaluateComponent(code);
      } catch (evalError) {
        // Attempt fix
        console.warn('First attempt failed:', evalError.message);
        try {
          finalCode = await attemptCodeFix(code, evalError.message, concept.name, setProgress);
          Component = evaluateComponent(finalCode);
        } catch (fixError) {
          console.error('Fix attempt failed:', fixError);
          throw new Error(`Visualization code failed: ${fixError.message}`);
        }
      }

      const fullConcept = {
        ...concept,
        visualization: {
          code: finalCode,
          plan: plan,
          generatedAt: new Date().toISOString()
        }
      };

      saveToCache(id, fullConcept);
      setConcepts(prev => ({ ...prev, [id]: fullConcept }));
      setSelected(fullConcept);
      setProgress('');

    } catch (err) {
      console.error('Generation failed:', err);
      setError(err.message);
    } finally {
      setGenerating(null);
    }
  };

  const handleClick = (id) => {
    const cached = loadFromCache(id);
    if (cached?.visualization) {
      setConcepts(prev => ({ ...prev, [id]: cached }));
      setSelected(cached);
      setCurrentPlan(cached.visualization.plan || null);
      setPath(prev => prev.includes(id) ? prev : [...prev, id]);
      return;
    }
    
    if (concepts[id]?.visualization) {
      setSelected(concepts[id]);
      setCurrentPlan(concepts[id].visualization.plan || null);
      setPath(prev => prev.includes(id) ? prev : [...prev, id]);
      return;
    }
    
    generate(id, concepts[id]);
    setPath(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const handleRegenerate = (id) => {
    conceptCache.delete(id);
    const concept = concepts[id];
    setConcepts(prev => {
      const updated = { ...prev };
      if (updated[id]) delete updated[id].visualization;
      return updated;
    });
    setError(null);
    setCurrentPlan(null);
    generate(id, { ...concept, visualization: undefined });
  };

  // Dynamic Visualization Renderer
  const DynamicViz = ({ concept, onRegenerate }) => {
    const [Component, setComponent] = useState(null);
    const [renderError, setRenderError] = useState(null);

    useEffect(() => {
      if (!concept?.visualization?.code) return;
      try {
        const Comp = evaluateComponent(concept.visualization.code);
        setComponent(() => Comp);
        setRenderError(null);
      } catch (err) {
        console.error('Render failed:', err);
        setRenderError(err.message);
      }
    }, [concept]);

    if (renderError) {
      return React.createElement('div', {
        style: {
          padding: '1.5rem',
          background: 'rgba(239, 68, 68, 0.1)',
          borderRadius: '12px',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }
      },
        React.createElement('div', { style: { textAlign: 'center', marginBottom: '1rem' } },
          React.createElement('div', { style: { color: '#ef4444', marginBottom: '0.5rem' } }, React.createElement(Icons.AlertTriangle)),
          React.createElement('p', { style: { color: '#fca5a5', margin: '0.5rem 0', fontWeight: '600' } }, 'Visualization failed to render'),
          React.createElement('p', { style: { color: '#94a3b8', fontSize: '0.8rem' } }, renderError)
        ),
        React.createElement('button', {
          onClick: () => onRegenerate(concept?.id),
          style: {
            width: '100%',
            padding: '0.75rem',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#fca5a5',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }
        },
          React.createElement(Icons.RefreshCw),
          ' Regenerate'
        )
      );
    }

    if (!Component) {
      return React.createElement('div', {
        style: {
          padding: '2rem',
          background: 'rgba(51, 65, 85, 0.3)',
          borderRadius: '12px',
          textAlign: 'center',
          color: '#94a3b8'
        }
      }, 'Click to generate visualization');
    }

    return React.createElement(Component);
  };

  // Main styles
  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#e2e8f0',
    padding: '1.5rem'
  };

  return React.createElement('div', { style: containerStyle },
    // Header
    React.createElement('div', { style: { maxWidth: '1400px', margin: '0 auto 1.5rem' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' } },
        React.createElement('span', { style: { color: '#6366f1' } }, React.createElement(Icons.Network)),
        React.createElement('h1', {
          style: {
            fontSize: '1.75rem',
            fontWeight: '700',
            margin: 0,
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }
        }, 'AI Knowledge Graph')
      ),
      React.createElement('p', { style: { color: '#94a3b8', margin: 0, fontSize: '0.9rem' } },
        'Multi-shot agentic pipeline: Plan → Generate → Validate → Visualize'
      )
    ),

    // Progress indicator
    generating && React.createElement('div', {
      style: {
        maxWidth: '1400px',
        margin: '0 auto 1rem',
        padding: '1rem',
        background: 'rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }
    },
      React.createElement('span', { style: { color: '#6366f1' } }, React.createElement(Icons.Brain)),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontWeight: '600', color: '#c7d2fe', marginBottom: '0.25rem' } }, 'Generating visualization...'),
        React.createElement('div', { style: { fontSize: '0.85rem', color: '#94a3b8' } }, progress)
      ),
      React.createElement('span', { style: { color: '#6366f1' } }, React.createElement(Icons.Loader))
    ),

    // Path breadcrumb
    path.length > 0 && React.createElement('div', {
      style: {
        maxWidth: '1400px',
        margin: '0 auto 1rem',
        padding: '0.75rem 1rem',
        background: 'rgba(30, 41, 59, 0.5)',
        borderRadius: '10px',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
        fontSize: '0.85rem'
      }
    },
      React.createElement('span', { style: { color: '#64748b' } }, 'Path:'),
      ...path.map((id, idx) => React.createElement(React.Fragment, { key: id },
        React.createElement('span', {
          style: { padding: '0.2rem 0.6rem', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '6px', color: '#a5b4fc' }
        }, concepts[id]?.name || id),
        idx < path.length - 1 && React.createElement('span', { style: { color: '#475569' } }, React.createElement(Icons.ChevronRight))
      ))
    ),

    // Main grid
    React.createElement('div', {
      style: {
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: selected ? '380px 1fr' : '1fr',
        gap: '1.5rem',
        alignItems: 'start'
      }
    },
      // Concepts list
      React.createElement('div', {
        style: {
          background: 'rgba(30, 41, 59, 0.4)',
          borderRadius: '16px',
          padding: '1.25rem',
          border: '1px solid rgba(99, 102, 241, 0.15)'
        }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', color: '#6366f1' } },
          React.createElement(Icons.Book),
          React.createElement('h2', { style: { margin: 0, fontSize: '1.1rem', fontWeight: '600' } }, 'Concepts')
        ),
        
        ...Object.entries(concepts).map(([id, concept]) =>
          React.createElement('div', {
            key: id,
            onClick: () => generating !== id && handleClick(id),
            style: {
              background: selected?.id === id ? 'rgba(99, 102, 241, 0.2)' : 'rgba(51, 65, 85, 0.3)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '0.75rem',
              border: `2px solid ${selected?.id === id ? '#6366f1' : 'transparent'}`,
              cursor: generating === id ? 'wait' : 'pointer',
              opacity: generating === id ? 0.7 : 1,
              transition: 'all 0.2s'
            }
          },
            generating === id && React.createElement('div', {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                marginBottom: '0.5rem',
                padding: '0.3rem 0.6rem',
                background: 'rgba(99, 102, 241, 0.25)',
                borderRadius: '6px'
              }
            },
              React.createElement('span', { style: { color: '#6366f1' } }, React.createElement(Icons.Loader)),
              React.createElement('span', { style: { fontSize: '0.75rem', color: '#a5b4fc' } }, 'Working...')
            ),
            
            React.createElement('h3', { style: { fontSize: '1rem', fontWeight: '600', margin: '0 0 0.4rem' } },
              concept.name || id
            ),
            
            React.createElement('div', { style: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' } },
              React.createElement('span', {
                style: { fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(168, 85, 247, 0.2)', borderRadius: '4px', color: '#c4b5fd' }
              }, concept.domain),
              concept.visualization && React.createElement('span', {
                style: { fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '4px', color: '#6ee7b7' }
              }, '✓ Ready')
            ),
            
            concept.explanation && React.createElement('p', {
              style: { fontSize: '0.8rem', color: '#cbd5e1', margin: '0 0 0.6rem', lineHeight: '1.5' }
            }, concept.explanation),
            
            (concept.prerequisites?.length > 0 || concept.applications?.length > 0) &&
            React.createElement('div', { style: { borderTop: '1px solid rgba(71, 85, 105, 0.3)', paddingTop: '0.5rem', fontSize: '0.75rem' } },
              concept.prerequisites?.length > 0 && React.createElement('div', { style: { marginBottom: '0.3rem' } },
                React.createElement('span', { style: { color: '#64748b' } }, 'Prerequisites: '),
                ...concept.prerequisites.map((prereq, idx) => React.createElement('span', { key: prereq },
                  React.createElement('button', {
                    onClick: (e) => { e.stopPropagation(); handleClick(prereq); },
                    style: {
                      background: 'none', border: 'none',
                      color: generating === prereq ? '#475569' : '#6366f1',
                      textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit'
                    }
                  }, prereq),
                  idx < concept.prerequisites.length - 1 ? ', ' : ''
                ))
              ),
              concept.applications?.length > 0 && React.createElement('div', null,
                React.createElement('span', { style: { color: '#64748b' } }, 'Applications: '),
                ...concept.applications.map((app, idx) => React.createElement('span', { key: app },
                  React.createElement('button', {
                    onClick: (e) => { e.stopPropagation(); handleClick(app); },
                    style: {
                      background: 'none', border: 'none',
                      color: generating === app ? '#475569' : '#10b981',
                      textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit'
                    }
                  }, app),
                  idx < concept.applications.length - 1 ? ', ' : ''
                ))
              )
            )
          )
        )
      ),

      // Detail panel
      selected && React.createElement('div', {
        style: {
          background: 'rgba(30, 41, 59, 0.4)',
          borderRadius: '16px',
          padding: '1.25rem',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          position: 'sticky',
          top: '1.5rem',
          maxHeight: 'calc(100vh - 3rem)',
          overflowY: 'auto'
        }
      },
        // Header
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' } },
          React.createElement('div', null,
            React.createElement('h2', { style: { margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: '700' } }, selected.name),
            React.createElement('span', { style: { fontSize: '0.8rem', color: '#64748b' } }, selected.domain)
          ),
          React.createElement('button', {
            onClick: () => { setSelected(null); setCurrentPlan(null); },
            style: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.5rem' }
          }, React.createElement(Icons.X))
        ),

        // Explanation
        selected.explanation && React.createElement('div', {
          style: {
            padding: '0.875rem',
            background: 'rgba(99, 102, 241, 0.1)',
            borderRadius: '10px',
            borderLeft: '4px solid #6366f1',
            marginBottom: '1.25rem'
          }
        },
          React.createElement('p', { style: { margin: 0, lineHeight: '1.6', fontSize: '0.9rem' } }, selected.explanation)
        ),

        // Generating state
        generating === selected.id ? React.createElement('div', {
          style: { padding: '3rem 2rem', textAlign: 'center', background: 'rgba(15, 23, 42, 0.8)', borderRadius: '12px' }
        },
          React.createElement('div', { style: { color: '#6366f1', marginBottom: '1rem' } }, React.createElement(Icons.Loader)),
          React.createElement('p', { style: { fontWeight: '600', margin: '0 0 0.5rem' } }, 'Multi-Shot Generation'),
          React.createElement('p', { style: { color: '#94a3b8', fontSize: '0.875rem', margin: 0 } }, progress)
        ) :
        // Visualization
        React.createElement(React.Fragment, null,
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#a855f7' } },
              React.createElement(Icons.Zap),
              React.createElement('h3', { style: { margin: 0, fontSize: '0.95rem', fontWeight: '600' } }, 'Interactive Visualization')
            ),
            selected.visualization && React.createElement('button', {
              onClick: () => handleRegenerate(selected.id),
              style: {
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.75rem',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '6px', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.75rem'
              }
            },
              React.createElement(Icons.RefreshCw),
              ' Regenerate'
            )
          ),
          React.createElement(DynamicViz, { concept: selected, onRegenerate: handleRegenerate }),
          
          // Show plan if available
          currentPlan && React.createElement('details', {
            style: { marginTop: '1.25rem' }
          },
            React.createElement('summary', {
              style: { cursor: 'pointer', color: '#64748b', fontSize: '0.8rem', marginBottom: '0.5rem' }
            }, 'View Generation Plan'),
            React.createElement('pre', {
              style: {
                padding: '1rem',
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px',
                fontSize: '0.7rem',
                color: '#94a3b8',
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
                maxHeight: '300px'
              }
            }, currentPlan)
          )
        ),

        // Error
        error && React.createElement('div', {
          style: {
            marginTop: '1rem', padding: '1rem',
            background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }
        },
          React.createElement('p', { style: { color: '#fca5a5', margin: 0, fontSize: '0.85rem' } }, '❌ ' + error)
        )
      )
    ),

    // Styles
    React.createElement('style', null, `
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      details summary::-webkit-details-marker { display: none; }
      details summary::before { content: '▶ '; font-size: 0.7em; }
      details[open] summary::before { content: '▼ '; }
    `)
  );
}
