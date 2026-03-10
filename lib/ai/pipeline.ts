import Anthropic from '@anthropic-ai/sdk'
import { planningPrompt, generationPrompt, fixPrompt } from './prompts'

const client = new Anthropic()
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'

export type ProgressEvent =
  | { type: 'progress'; message: string }
  | { type: 'plan'; plan: string }
  | { type: 'code'; code: string; plan: string }
  | { type: 'error'; message: string }

function cleanCode(raw: string): string {
  return raw.trim()
    .replace(/^```(?:javascript|jsx|js|tsx|ts)?\n?/, '')
    .replace(/\n?```$/, '')
    .replace(/^const\s+\w+\s*=\s*/, '')
    .trim()
}

function validateCode(code: string): void {
  // Try basic syntax check — not a full eval, just Function parsing
  new Function('React', 'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'Math',
    `'use strict'; return (${code});`
  )
}

export async function* generateVisualizationPipeline(
  conceptId: string,
  conceptName: string,
  domain: string,
  explanation: string
): AsyncGenerator<ProgressEvent> {
  // Shot 1: Planning
  yield { type: 'progress', message: 'Planning visualization...' }

  const planResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: planningPrompt(conceptId, conceptName, domain, explanation) }],
  })

  const plan = (planResponse.content[0] as Anthropic.TextBlock).text
  yield { type: 'plan', plan }

  // Shot 2: Code generation
  yield { type: 'progress', message: 'Generating visualization code...' }

  const codeResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: generationPrompt(conceptName, domain, explanation, plan) }],
  })

  let code = cleanCode((codeResponse.content[0] as Anthropic.TextBlock).text)

  // Validate locally
  yield { type: 'progress', message: 'Validating...' }

  try {
    validateCode(code)
  } catch (err) {
    // Shot 3: Fix attempt
    yield { type: 'progress', message: 'Fixing code...' }

    const fixResponse = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: fixPrompt(conceptName, code, (err as Error).message) }],
    })

    code = cleanCode((fixResponse.content[0] as Anthropic.TextBlock).text)

    try {
      validateCode(code)
    } catch (finalErr) {
      yield { type: 'error', message: `Validation failed after fix attempt: ${(finalErr as Error).message}` }
      return
    }
  }

  yield { type: 'code', code, plan }
}
