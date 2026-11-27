import { randomBytes } from 'node:crypto'
import type { BrowserContext, ConsoleMessage } from 'playwright'
import { closeValidationBrowser, getValidationBrowser } from '@/lib/cards/browser'
import { analyzeScreenshot } from '@/lib/cards/screenshot'
import { runStaticChecks } from '@/lib/cards/static-checks'
import type { ValidateCardOptions, ValidationResult } from '@/lib/cards/validate-types'

const CARD_WIDTH = 600
const CARD_HEIGHT = 400
const DEFAULT_TIMEOUT_MS = 10_000
const SETTLE_DELAY_MS = 250
const CONTEXT_CLOSE_TIMEOUT_MS = 2_000
const HOST_URL = 'https://validator.conceptmesh.local/'

const DEFAULT_THEME_STYLE =
  '<style data-cm-host-theme>:root{color-scheme:dark;--cm-bg:#0b1020;--cm-surface:#141a2e;--cm-text:#e8ecff;--cm-accent:#7c5cff;--cm-border:#2a3150}</style>'

function buildProbeScript(nonce: string): string {
  return `<script data-cm-val-probe>(function(){
var N="${nonce}",sent=false,orig=EventTarget.prototype.addEventListener;
function post(k,m){try{window.parent.postMessage({__cmVal:N,kind:k,message:m||""},"*");}catch(_){}}
orig.call(window,"error",function(e){post("error",(e&&e.message)?String(e.message):"Uncaught runtime error");});
orig.call(window,"unhandledrejection",function(e){var r=e&&e.reason;post("error",r?(r.message||String(r)):"Unhandled promise rejection");});
EventTarget.prototype.addEventListener=function(){
if(!sent){sent=true;post("interactive","");}
return orig.apply(this,arguments);
};
})();</script>`
}

function instrumentCardHtml(html: string, nonce: string): string {
  const probe = buildProbeScript(nonce)
  const output = /<head\b[^>]*>/i.test(html)
    ? html.replace(/<head\b[^>]*>/i, match => `${match}${probe}`)
    : `${probe}${html}`

  if (/<\/head>/i.test(output)) {
    return output.replace(/<\/head>/i, match => `${DEFAULT_THEME_STYLE}${match}`)
  }
  if (/<\/body>/i.test(output)) {
    return output.replace(/<\/body>/i, match => `${DEFAULT_THEME_STYLE}${match}`)
  }
  if (/<\/html>/i.test(output)) {
    return output.replace(/<\/html>/i, match => `${DEFAULT_THEME_STYLE}${match}`)
  }
  return `${output}${DEFAULT_THEME_STYLE}`
}

function isAllowedRequestUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower === 'about:blank' || lower === 'about:srcdoc' || lower.startsWith('data:')
}

async function closeContextSafely(context: BrowserContext): Promise<void> {
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      context.close(),
      new Promise<never>((_, reject) => {
        closeTimer = setTimeout(() => reject(new Error('close timeout')), CONTEXT_CLOSE_TIMEOUT_MS)
      }),
    ])
  } catch {
    await closeValidationBrowser()
  } finally {
    if (closeTimer) clearTimeout(closeTimer)
  }
}

/**
 * Validates a self-contained ConceptMesh HTML card via static card-spec checks
 * and headless Chromium rendering inside a `sandbox="allow-scripts"` iframe.
 */
export async function validateCard(
  html: string,
  options: ValidateCardOptions = {},
): Promise<ValidationResult> {
  const staticErrors = runStaticChecks(html)
  if (staticErrors.length > 0 || options.staticOnly) {
    return {
      renders: staticErrors.length === 0,
      errors: staticErrors,
      hasInteractivity: false,
      thumbnail: null,
      screenshotHash: null,
    }
  }

  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()
  const nonce = randomBytes(8).toString('hex')
  const instrumentedHtml = instrumentCardHtml(html, nonce)
  const hostDocument = `<!doctype html><html><body style="margin:0;padding:0;overflow:hidden;background:#0b1020"><iframe id="cm-card" sandbox="allow-scripts" referrerpolicy="no-referrer" style="width:${CARD_WIDTH}px;height:${CARD_HEIGHT}px;border:0;display:block"></iframe></body></html>`

  const browser = await getValidationBrowser()
  const errors = new Set<string>()
  let hasInteractivity = false
  let context: BrowserContext | null = null
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null

  const deadlinePromise = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(() => {
      reject(new Error(`Validation timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    const runRender = async (): Promise<ValidationResult> => {
      context = await browser.newContext({
        viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
        deviceScaleFactor: 1,
      })

      const page = await context.newPage()
      let servedHost = false

      // Serve only the initial synthetic host shell; block all external requests
      await page.route('**/*', route => {
        const req = route.request()
        const url = req.url()
        if (!servedHost && url === HOST_URL && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
          servedHost = true
          return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: hostDocument })
        }
        if (isAllowedRequestUrl(url)) return route.continue()
        errors.add(`Blocked external network request: ${url}`)
        return route.abort('blockedbyclient')
      })

      page.on('console', (msg: ConsoleMessage) => {
        if (msg.type() === 'error') errors.add(`Console error: ${msg.text()}`)
      })
      page.on('pageerror', (err: Error) => {
        errors.add(`Runtime error: ${err.message}`)
      })

      let resolveLoaded!: () => void
      const loadedPromise = new Promise<void>(resolve => {
        resolveLoaded = resolve
      })

      await page.exposeFunction('__cmReport', (kind: string, message: string) => {
        if (kind === 'interactive') hasInteractivity = true
        else if (kind === 'error' && message) errors.add(`Runtime error: ${message}`)
      })
      await page.exposeFunction('__cmLoaded', () => resolveLoaded())

      await page.goto(HOST_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs })

      await page.evaluate(
        ({ cardHtml, token }) => {
          const iframe = document.getElementById('cm-card') as HTMLIFrameElement | null
          if (!iframe) throw new Error('Validation host iframe missing')
          const win = window as unknown as {
            __cmReport: (kind: string, message: string) => void
            __cmLoaded: () => void
          }
          window.addEventListener('message', (e: MessageEvent) => {
            if (e.origin !== 'null' || e.source !== iframe.contentWindow) return
            const data = e.data as { __cmVal?: string; kind?: string; message?: string } | null
            if (!data || data.__cmVal !== token || typeof data.kind !== 'string') return
            win.__cmReport(data.kind, typeof data.message === 'string' ? data.message : '')
          })
          iframe.addEventListener('load', () => win.__cmLoaded(), { once: true })
          iframe.srcdoc = cardHtml
        },
        { cardHtml: instrumentedHtml, token: nonce },
      )

      await loadedPromise

      const remainingBeforeSettle = timeoutMs - (Date.now() - startedAt)
      if (remainingBeforeSettle > SETTLE_DELAY_MS) {
        await page.waitForTimeout(SETTLE_DELAY_MS)
      }

      const remainingForShot = Math.max(500, timeoutMs - (Date.now() - startedAt))
      const thumbnail = await page
        .locator('#cm-card')
        .screenshot({ type: 'png', timeout: remainingForShot })

      const analysis = analyzeScreenshot(thumbnail)
      if (analysis.isBlank) {
        errors.add('Rendered card appears blank (single uniform color)')
      }

      const errorList = Array.from(errors)
      return {
        renders: errorList.length === 0,
        errors: errorList,
        hasInteractivity,
        thumbnail,
        screenshotHash: analysis.hash,
      }
    }

    return await Promise.race([runRender(), deadlinePromise])
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : 'Card validation failed'
    errors.add(rawMsg.split('\n')[0] || 'Card validation failed')
    return {
      renders: false,
      errors: Array.from(errors),
      hasInteractivity,
      thumbnail: null,
      screenshotHash: null,
    }
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer)
    if (context) await closeContextSafely(context)
  }
}
