import type Anthropic from '@anthropic-ai/sdk'
import { MODEL } from './client'
import { suggestTechnique } from './techniqueMap'
import {
  SYSTEM_PROMPT,
  buildPlanPrompt,
  buildGeneratePrompt,
  buildFixPrompt,
  type CardPlan,
} from './prompts'
import { validateCardHtml, type ValidationResult } from './cardValidator'

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

export type PipelinePhase =
  | 'planning'
  | 'generating'
  | 'validating'
  | 'fixing'
  | 'saving'
  | 'done'

export type PipelineEvent =
  | { type: 'phase'; phase: PipelinePhase; message?: string }
  | { type: 'plan'; plan: CardPlan }
  | { type: 'token'; phase: 'generating' | 'fixing'; deltaChars: number; totalChars: number }
  | { type: 'validation'; result: ValidationResult; willRetry: boolean }
  | { type: 'card'; html: string; plan: CardPlan; modelId: string; validation: ValidationResult }
  | { type: 'error'; message: string }

export interface PipelineInput {
  client: Anthropic
  concept: { slug: string; title: string; domain: string; description: string }
  /** Caller-controlled cancellation signal. */
  signal?: AbortSignal
  /** Override model id; defaults to {@link MODEL}. */
  model?: string
}

// ──────────────────────────────────────────────────────────
// Tunables
// ──────────────────────────────────────────────────────────

const PLAN_MAX_TOKENS = 700
const GENERATE_MAX_TOKENS = 8000
const FIX_MAX_TOKENS = 8000
const TEMPERATURE = 0.7

// ──────────────────────────────────────────────────────────
// Public entrypoint — async generator yielding pipeline events.
// The SSE route forwards these directly; tests can iterate them
// without HTTP.
// ──────────────────────────────────────────────────────────

export async function* runCardPipeline(input: PipelineInput): AsyncGenerator<PipelineEvent> {
  const { client, concept, signal } = input
  const modelId = input.model ?? MODEL

  try {
    // ── 1. Plan ─────────────────────────────────────────────
    yield { type: 'phase', phase: 'planning' }
    const technique = suggestTechnique(concept)
    const plan = await runPlan({ client, modelId, concept, technique, signal })
    yield { type: 'plan', plan }

    // ── 2. Generate (streamed) ──────────────────────────────
    yield { type: 'phase', phase: 'generating' }
    let html = ''
    for await (const ev of runGenerate({ client, modelId, concept, plan, signal })) {
      if (ev.type === 'delta') {
        html += ev.delta
        yield { type: 'token', phase: 'generating', deltaChars: ev.delta.length, totalChars: html.length }
      } else if (ev.type === 'final') {
        html = ev.html
      }
    }

    // ── 3. Validate ─────────────────────────────────────────
    yield { type: 'phase', phase: 'validating' }
    let validation = validateCardHtml(html)
    yield { type: 'validation', result: validation, willRetry: !validation.ok }

    // ── 4. Fix once if needed ───────────────────────────────
    if (!validation.ok) {
      yield { type: 'phase', phase: 'fixing' }
      let fixed = ''
      for await (const ev of runFix({
        client, modelId, title: concept.title, previousHtml: html, errors: validation.errors, signal,
      })) {
        if (ev.type === 'delta') {
          fixed += ev.delta
          yield { type: 'token', phase: 'fixing', deltaChars: ev.delta.length, totalChars: fixed.length }
        } else if (ev.type === 'final') {
          fixed = ev.html
        }
      }
      html = fixed
      validation = validateCardHtml(html)
      yield { type: 'validation', result: validation, willRetry: false }
      if (!validation.ok) {
        yield { type: 'error', message: `Card failed validation after one fix attempt: ${validation.errors.join('; ')}` }
        return
      }
    }

    // ── 5. Hand off to caller for persistence ──────────────
    yield { type: 'phase', phase: 'saving' }
    yield { type: 'card', html, plan, modelId, validation }
    yield { type: 'phase', phase: 'done' }
  } catch (err) {
    yield { type: 'error', message: errorMessage(err) }
  }
}

// ──────────────────────────────────────────────────────────
// Internal phase runners
// ──────────────────────────────────────────────────────────

interface PlanArgs {
  client: Anthropic
  modelId: string
  concept: PipelineInput['concept']
  technique: ReturnType<typeof suggestTechnique>
  signal?: AbortSignal
}

async function runPlan(args: PlanArgs): Promise<CardPlan> {
  const response = await args.client.messages.create(
    {
      model: args.modelId,
      max_tokens: PLAN_MAX_TOKENS,
      temperature: TEMPERATURE,
      system: cachedSystem(),
      messages: [{ role: 'user', content: buildPlanPrompt({ ...args.concept, technique: args.technique }) }],
    },
    args.signal ? { signal: args.signal } : undefined,
  )
  const text = collectText(response.content)
  return parsePlanJson(text)
}

interface GenerateArgs {
  client: Anthropic
  modelId: string
  concept: PipelineInput['concept']
  plan: CardPlan
  signal?: AbortSignal
}

async function* runGenerate(args: GenerateArgs): AsyncGenerator<{ type: 'delta'; delta: string } | { type: 'final'; html: string }> {
  const stream = args.client.messages.stream(
    {
      model: args.modelId,
      max_tokens: GENERATE_MAX_TOKENS,
      temperature: TEMPERATURE,
      system: cachedSystem(),
      messages: [{ role: 'user', content: buildGeneratePrompt({ ...args.concept, plan: args.plan }) }],
    },
    args.signal ? { signal: args.signal } : undefined,
  )

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'delta', delta: event.delta.text }
    }
  }

  const final = await stream.finalMessage()
  yield { type: 'final', html: stripFences(collectText(final.content)) }
}

interface FixArgs {
  client: Anthropic
  modelId: string
  title: string
  previousHtml: string
  errors: string[]
  signal?: AbortSignal
}

async function* runFix(args: FixArgs): AsyncGenerator<{ type: 'delta'; delta: string } | { type: 'final'; html: string }> {
  const stream = args.client.messages.stream(
    {
      model: args.modelId,
      max_tokens: FIX_MAX_TOKENS,
      temperature: 0.4,
      system: cachedSystem(),
      messages: [
        { role: 'user', content: buildFixPrompt({ title: args.title, previousHtml: args.previousHtml, errors: args.errors }) },
      ],
    },
    args.signal ? { signal: args.signal } : undefined,
  )

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield { type: 'delta', delta: event.delta.text }
    }
  }

  const final = await stream.finalMessage()
  yield { type: 'final', html: stripFences(collectText(final.content)) }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

// Cache the system prompt across requests so repeat generations stay cheap.
function cachedSystem() {
  return [{ type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }]
}

function collectText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

// The model is told not to fence its output, but if it does anyway we'll
// strip a single leading/trailing fence pair before validation.
function stripFences(s: string): string {
  const trimmed = s.trim()
  const fenceMatch = trimmed.match(/^```(?:html|HTML)?\s*\n([\s\S]*?)\n```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

function parsePlanJson(raw: string): CardPlan {
  const trimmed = raw.trim()
  // Tolerate the model fencing its JSON.
  const candidate = trimmed.startsWith('```')
    ? (trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i)?.[1] ?? trimmed)
    : trimmed

  // Find the first balanced JSON object so trailing commentary doesn't break us.
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Planner did not return a JSON object.')
  }
  const json = candidate.slice(start, end + 1)

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(`Planner returned invalid JSON: ${errorMessage(err)}`)
  }

  return assertPlanShape(parsed)
}

function assertPlanShape(value: unknown): CardPlan {
  if (!value || typeof value !== 'object') throw new Error('Plan is not an object.')
  const v = value as Record<string, unknown>
  const technique = stringField(v, 'technique')
  const insight = stringField(v, 'insight')
  const successCriterion = stringField(v, 'successCriterion')
  const controls = stringArrayField(v, 'controls')
  const visualElements = stringArrayField(v, 'visualElements')
  return { technique, insight, controls, visualElements, successCriterion }
}

function stringField(v: Record<string, unknown>, k: string): string {
  const x = v[k]
  if (typeof x !== 'string' || x.length === 0) throw new Error(`Plan field "${k}" must be a non-empty string.`)
  return x
}

function stringArrayField(v: Record<string, unknown>, k: string): string[] {
  const x = v[k]
  if (!Array.isArray(x) || x.length === 0 || !x.every(s => typeof s === 'string' && s.length > 0)) {
    throw new Error(`Plan field "${k}" must be a non-empty string[]`)
  }
  return x as string[]
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown error'
}
