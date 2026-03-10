import { VISUALIZATION_TECHNIQUES, getRecommendedTechniques } from './techniqueMap'

const PROJECT_CONTEXT = `You are part of an AI-powered visual concept exploration platform called ConceptMesh. This system renders an infinite mesh of concept cards connected by glowing threads. Users explore knowledge spatially — clicking a concept card opens an AI-generated interactive visualization that creates genuine understanding through play.

THE PRODUCT:
- Users click on concepts (like "binary search", "derivatives", "neural networks")
- The system generates an interactive React visualization that makes the concept tangible and explorable
- Visualizations should create "aha moments" — making abstract ideas concrete and manipulable

WHAT MAKES A GREAT VISUALIZATION:
1. CONCRETE REPRESENTATION: Abstract concepts shown as manipulable visual elements
2. INTERACTIVITY: Users can change parameters and see immediate effects
3. PROGRESSIVE DISCLOSURE: Start simple, let users explore complexity
4. VISUAL FEEDBACK: Color, animation, and layout that reinforce understanding
5. KEY INSIGHT: Every visualization should reveal ONE core insight about the concept

TECHNICAL CONSTRAINTS:
- Must use React.createElement() syntax ONLY — absolutely NO JSX (no angle brackets for elements)
- Available hooks: useState, useEffect, useRef, useCallback, useMemo (passed as parameters, use directly)
- Canvas is great for graphics (use useRef)
- Must be self-contained (no external data or imports)
- Target 150-200 lines`

export function planningPrompt(conceptId: string, conceptName: string, domain: string, explanation: string): string {
  const techniques = getRecommendedTechniques(conceptId)
  const techniqueDescriptions = techniques
    .map(t => VISUALIZATION_TECHNIQUES[t] ? `- ${t}: ${VISUALIZATION_TECHNIQUES[t].description}. Pattern: ${VISUALIZATION_TECHNIQUES[t].pattern}` : '')
    .filter(Boolean)
    .join('\n')

  return `${PROJECT_CONTEXT}

CONCEPT TO VISUALIZE:
- ID: ${conceptId}
- Name: ${conceptName}
- Domain: ${domain}
- Explanation: ${explanation}

RECOMMENDED VISUALIZATION TECHNIQUES:
${techniqueDescriptions}

YOUR TASK: Create a detailed visualization plan.

Respond in this exact format:

CORE_INSIGHT: [One sentence — the key takeaway]

VISUAL_ELEMENTS:
- [Element]: [Description]

INTERACTIVE_CONTROLS:
- [Control]: [slider/button/checkbox] — [what it controls]

ANIMATIONS:
- [Animation]: [trigger and what it shows]

STATE_VARIABLES:
- [variable]: [type] [range] — [purpose]

CANVAS_DRAWING_PLAN:
[Step by step what to draw]

Keep the plan focused and achievable in ~150 lines of React.createElement code.`
}

export function generationPrompt(conceptName: string, domain: string, explanation: string, plan: string): string {
  return `You are generating a React visualization component for ConceptMesh, a visual concept exploration platform.

${PROJECT_CONTEXT}

CONCEPT: ${conceptName} (${domain})
${explanation}

VISUALIZATION PLAN:
${plan}

NOW GENERATE THE CODE.

CRITICAL REQUIREMENTS:
1. Use React.createElement() ONLY — NO JSX whatsoever
2. Format: () => { ... return React.createElement(...); }
3. Define the styles object INSIDE the arrow function at the top
4. Canvas dimensions: 500x300 or 600x350

STYLE CONSTANTS (use these exactly):
const styles = {
  container: { padding: '1.5rem', background: 'rgba(15, 23, 42, 0.95)', borderRadius: '16px', border: '1px solid rgba(99, 102, 241, 0.2)', fontFamily: 'system-ui, sans-serif' },
  formulaBox: { padding: '1rem', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '10px', fontFamily: 'monospace', fontSize: '1.1rem', textAlign: 'center', color: '#e2e8f0', marginBottom: '1.25rem', border: '1px solid rgba(99, 102, 241, 0.3)' },
  canvas: { width: '100%', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', marginBottom: '1.25rem', display: 'block' },
  label: { display: 'block', marginBottom: '0.5rem', color: '#94a3b8', fontSize: '0.875rem' },
  slider: { width: '100%', accentColor: '#6366f1', cursor: 'pointer' },
  button: { padding: '0.5rem 1rem', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', color: '#c7d2fe', cursor: 'pointer', fontSize: '0.875rem', marginRight: '0.5rem' },
  infoBox: { marginTop: '1.25rem', padding: '1rem', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '10px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.6' },
};

COLORS: Primary '#6366f1', Success '#10b981', Warning '#f59e0b', Danger '#ef4444', Neutral '#475569', Text '#e2e8f0'

Return ONLY the arrow function code. No markdown, no backticks, no explanation.`
}

export function fixPrompt(conceptName: string, code: string, error: string): string {
  return `The following React visualization for "${conceptName}" has an error:

ERROR: ${error}

CODE:
${code}

Fix the code. Common issues:
1. JSX syntax used instead of React.createElement
2. Missing parentheses or brackets
3. Undefined variables
4. Incorrect hook usage

Return ONLY the fixed arrow function code. No markdown, no explanation.`
}

export function expandConceptPrompt(conceptId: string, conceptName: string, domain: string, explanation: string, existingConcepts: string[]): string {
  return `You are expanding a concept in ConceptMesh, an infinite visual exploration platform.

PARENT CONCEPT:
- ID: ${conceptId}
- Name: ${conceptName}
- Domain: ${domain}
- Explanation: ${explanation}

CONCEPTS ALREADY IN THE MESH (do not duplicate):
${existingConcepts.join(', ')}

Generate 4-6 sub-concepts or closely related concepts that would naturally branch from "${conceptName}". Include a mix of:
- Prerequisites (what you need to know first)
- Applications (what this concept enables)
- Related ideas in the same domain
- One surprising cross-domain connection

Return ONLY valid JSON array:
[
  {
    "id": "slug-format",
    "name": "Human Readable Name",
    "domain": "Mathematics|Computer Science|Physics|Chemistry|Biology|Economics|Philosophy",
    "explanation": "Clear 2-3 sentence explanation",
    "difficulty": "beginner|intermediate|advanced",
    "connectionReason": "Why this connects to ${conceptName}"
  }
]`
}

export function metadataPrompt(conceptId: string): string {
  return `Generate metadata for the educational concept: "${conceptId}"

Return ONLY valid JSON:
{
  "name": "Human Readable Name",
  "domain": "Mathematics|Computer Science|Physics|Chemistry|Biology|Economics|Philosophy",
  "explanation": "Clear 2-3 sentence explanation of the concept",
  "difficulty": "beginner|intermediate|advanced"
}`
}

export function serendipityPrompt(concept1Name: string, concept1Domain: string, concept2Name: string, concept2Domain: string): string {
  return `You are the serendipity engine for ConceptMesh, a visual exploration platform. Your job is to find genuine, surprising connections between concepts.

CONCEPT A: ${concept1Name} (${concept1Domain})
CONCEPT B: ${concept2Name} (${concept2Domain})

These two concepts appear unrelated but may share deep structural similarities, analogous mechanisms, or surprising historical connections.

Find the most surprising, genuine connection between them. This should be something that makes a curious person say "wait, really?"

If there IS a compelling connection, respond with JSON:
{
  "connected": true,
  "reason": "One vivid sentence explaining the surprising connection",
  "strength": 0.1-1.0
}

If there is NO genuine connection (don't force it), respond with:
{
  "connected": false
}

Return ONLY the JSON object.`
}
