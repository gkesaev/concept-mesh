import type { TechniqueSuggestion } from './techniqueMap'

// ──────────────────────────────────────────────────────────
// System prompt — kept stable so it can be cached.
// Caching saves ~3–5x on input tokens for repeat generations.
// ──────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You design and build interactive concept-explainer cards for ConceptMesh.

A card is a single self-contained HTML document that renders inside a sandboxed iframe (\`sandbox="allow-scripts"\`, no same-origin, no parent access, no network). The viewer should learn one specific insight by playing with the card for ~30 seconds.

Hard requirements for any HTML you produce:
- Output a complete document starting with \`<!DOCTYPE html>\` and a single \`<html>\` root.
- Inline CSS and JS only. No external resources of any kind:
  - no \`<script src="…">\`, no \`<link href="…">\`, no \`@import\`, no remote URLs in any attribute.
  - no \`fetch\`, \`XMLHttpRequest\`, \`WebSocket\`, \`navigator.sendBeacon\`, \`import("…")\`, or \`importScripts\`.
- No \`document.cookie\`, \`localStorage\`, \`sessionStorage\`, or \`window.open\`.
- No \`<iframe>\`, \`<object>\`, \`<embed>\`, \`<form action>\`, or \`<meta http-equiv="refresh">\`.
- No \`eval\`, no \`new Function\`, no \`setTimeout\`/\`setInterval\` strings (functions only).
- Use vanilla JS, the Canvas 2D API, and CSS. SVG is fine. WebGL is allowed but not required.

After the card mounts, post a single message to the parent so the host knows render succeeded:
\`\`\`
window.parent.postMessage({ type: 'concept-mesh-ready' }, '*')
\`\`\`
If your code throws during init, also post \`{ type: 'concept-mesh-error', message }\`.

Design rules:
- Pick one insight and make it tangible. Don't try to teach the whole concept.
- Provide at least one interactive control (slider, button, drag, click). Reading a static figure is not enough.
- Honor a dark space theme: deep slate/indigo background, soft glow, high-contrast typography. Use \`system-ui\` font stack.
- Be self-contained: cards must render in any size from 400×300 up to 1200×900. Use \`100%\`/\`100vh\` plus \`overflow: hidden\`.
- Be calm. Subtle animation is good; flashing or aggressive motion is not.

Output rules:
- When asked to PLAN, return a single JSON object — no prose, no markdown fences.
- When asked to GENERATE or FIX, return only the HTML document. No commentary, no markdown fences.`

// ──────────────────────────────────────────────────────────
// Plan
// ──────────────────────────────────────────────────────────

export interface PlanInput {
  title: string
  domain: string
  description: string
  technique: TechniqueSuggestion
}

export interface CardPlan {
  technique: string
  insight: string
  controls: string[]
  visualElements: string[]
  successCriterion: string
}

export function buildPlanPrompt(input: PlanInput): string {
  return `Concept: ${input.title}
Domain: ${input.domain}
Description: ${input.description}

Suggested technique: ${input.technique.primary} (alternatives: ${input.technique.secondary.join(', ') || 'none'})
Why: ${input.technique.rationale}

Plan an interactive card. Respond with a single JSON object matching this TypeScript type — no prose, no code fences:

{
  "technique": string,            // chosen technique (you may override the suggestion)
  "insight": string,              // the ONE thing the user should walk away understanding (1 sentence)
  "controls": string[],           // 1-3 interactive controls, each described concretely (e.g. "slider for radius (0.1–5)")
  "visualElements": string[],     // 2-5 visual elements that change in response to controls
  "successCriterion": string      // a short sentence describing what "the card works" looks like
}`
}

// ──────────────────────────────────────────────────────────
// Generate
// ──────────────────────────────────────────────────────────

export interface GenerateInput {
  title: string
  domain: string
  description: string
  plan: CardPlan
}

export function buildGeneratePrompt(input: GenerateInput): string {
  return `Concept: ${input.title}
Domain: ${input.domain}
Description: ${input.description}

Plan:
- Technique: ${input.plan.technique}
- Insight: ${input.plan.insight}
- Controls: ${input.plan.controls.map(c => `\n    • ${c}`).join('')}
- Visual elements: ${input.plan.visualElements.map(v => `\n    • ${v}`).join('')}
- Success criterion: ${input.plan.successCriterion}

Build the card now. Respond with the complete HTML document only — no prose, no markdown fences. Remember to call \`window.parent.postMessage({ type: 'concept-mesh-ready' }, '*')\` once mounted.`
}

// ──────────────────────────────────────────────────────────
// Fix (one retry on validation failure)
// ──────────────────────────────────────────────────────────

export interface FixInput {
  title: string
  previousHtml: string
  errors: string[]
}

export function buildFixPrompt(input: FixInput): string {
  return `Your previous card for "${input.title}" failed validation. Fix the issues below and return a corrected HTML document. Keep the same overall design — only change what's necessary.

Validation errors:
${input.errors.map(e => `- ${e}`).join('\n')}

Previous card:
${input.previousHtml}

Return only the corrected HTML document.`
}
