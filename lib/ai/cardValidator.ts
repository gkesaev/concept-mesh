// Static safety + structure checks for AI-generated card HTML.
//
// This is a defense-in-depth layer — the iframe sandbox is the primary
// boundary (`sandbox="allow-scripts"` with no `allow-same-origin` means a
// unique opaque origin, no parent DOM access, no cookies, and CORS blocks
// most network use). The validator additionally:
//   1. Rejects content that would hit the network or persist user data.
//   2. Catches structural mistakes (missing <html>, oversize payloads).
//   3. Surfaces descriptive errors so the Fix prompt can repair them.

export interface ValidationResult {
  ok: boolean
  errors: string[]
  /** Heuristic interactivity signal — used to populate
   *  `concept_cards.validation_has_interactivity` for the draft card. */
  hasInteractivity: boolean
  /** Best-effort byte length of the (UTF-8) HTML payload. */
  byteLength: number
}

const MAX_BYTES = 200 * 1024  // 200 KB — generous; typical cards land 5-30 KB
const MAX_BYTES_HARD = 1_000_000

interface DenyRule {
  /** Pattern to test against the HTML. Use a sticky-free, case-insensitive RegExp. */
  pattern: RegExp
  /** Explanation included in the error message — written for the Fix prompt. */
  message: string
}

// Patterns we never want to see in a card. The pipeline can reasonably ask the
// model to remove any of these.
const DENY_RULES: DenyRule[] = [
  // External resources
  { pattern: /<script\b[^>]*\bsrc\s*=/i,                   message: 'Remove external <script src=…>; inline scripts only.' },
  { pattern: /<link\b[^>]*\bhref\s*=\s*["']?(?:https?:|\/\/|data:)/i,
                                                            message: 'Remove external <link href=…>; inline <style> only.' },
  { pattern: /@import\b/i,                                  message: 'Remove CSS @import; inline styles only.' },
  { pattern: /\bsrc\s*=\s*["']?(?:https?:|\/\/)/i,          message: 'No external URLs in src attributes.' },
  { pattern: /\bhref\s*=\s*["']?(?:https?:|\/\/)/i,         message: 'No external URLs in href attributes.' },

  // Network APIs
  { pattern: /\bfetch\s*\(/i,                               message: 'Remove fetch(); the card must work offline.' },
  { pattern: /\bXMLHttpRequest\b/i,                         message: 'Remove XMLHttpRequest; the card must work offline.' },
  { pattern: /\bWebSocket\b/i,                              message: 'Remove WebSocket; the card must work offline.' },
  { pattern: /\bEventSource\b/i,                            message: 'Remove EventSource; the card must work offline.' },
  { pattern: /\bnavigator\.sendBeacon\b/i,                  message: 'Remove navigator.sendBeacon.' },

  // Dynamic code execution
  { pattern: /\beval\s*\(/i,                                message: 'Remove eval().' },
  { pattern: /\bnew\s+Function\s*\(/i,                      message: 'Remove `new Function(…)`.' },
  { pattern: /\bimportScripts\s*\(/i,                       message: 'Remove importScripts().' },
  { pattern: /\bimport\s*\(\s*["']https?:/i,                message: 'No dynamic import() of remote URLs.' },

  // Persistence / identity
  { pattern: /\bdocument\.cookie\b/i,                       message: 'Do not read or write document.cookie.' },
  { pattern: /\b(?:local|session)Storage\b/i,               message: 'Do not use localStorage/sessionStorage.' },
  { pattern: /\bindexedDB\b/i,                              message: 'Do not use indexedDB.' },
  { pattern: /\bnavigator\.(?:credentials|geolocation)\b/i, message: 'Do not access credentials or geolocation.' },

  // Embedding / framing
  { pattern: /<iframe\b/i,                                  message: 'Do not embed nested <iframe> elements.' },
  { pattern: /<object\b/i,                                  message: 'Do not use <object>.' },
  { pattern: /<embed\b/i,                                   message: 'Do not use <embed>.' },
  { pattern: /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i,  message: 'Do not use <meta http-equiv="refresh">.' },
  { pattern: /<form\b[^>]*\baction\s*=/i,                   message: 'Do not use <form action=…>; handle interactions in JS.' },
  { pattern: /\bwindow\.open\s*\(/i,                        message: 'Do not call window.open.' },
  { pattern: /\btop\.location\b/i,                          message: 'Do not touch top.location.' },

  // String-form timers (treated as eval)
  { pattern: /\bset(?:Timeout|Interval)\s*\(\s*["'`]/i,     message: 'Pass a function to setTimeout/setInterval, not a string.' },
]

const INTERACTIVITY_HINTS = [
  /\baddEventListener\s*\(\s*["'](?:click|input|change|pointerdown|pointermove|mousedown|mousemove|touchstart|touchmove|keydown|wheel)/i,
  /\bonclick\s*=/i,
  /\boninput\s*=/i,
  /\bonchange\s*=/i,
  /<input\b[^>]*type\s*=\s*["']?(?:range|number|checkbox|radio)/i,
  /<button\b/i,
]

export function validateCardHtml(html: string): ValidationResult {
  const errors: string[] = []
  const byteLength = byteLengthOf(html)

  if (byteLength === 0) {
    errors.push('HTML is empty.')
    return { ok: false, errors, hasInteractivity: false, byteLength }
  }

  if (byteLength > MAX_BYTES_HARD) {
    errors.push(`HTML is ${Math.round(byteLength / 1024)} KB; hard limit is ${Math.round(MAX_BYTES_HARD / 1024)} KB.`)
    return { ok: false, errors, hasInteractivity: false, byteLength }
  }

  if (byteLength > MAX_BYTES) {
    errors.push(`HTML is ${Math.round(byteLength / 1024)} KB; aim for under ${Math.round(MAX_BYTES / 1024)} KB. Trim assets, simplify the design, or shorten the script.`)
  }

  if (!/<!doctype\s+html/i.test(html)) {
    errors.push('Missing `<!DOCTYPE html>` at the top of the document.')
  }
  if (!/<html\b/i.test(html) || !/<\/html\s*>/i.test(html)) {
    errors.push('Missing `<html>…</html>` root element.')
  }
  if (!/<body\b/i.test(html) || !/<\/body\s*>/i.test(html)) {
    errors.push('Missing `<body>…</body>` element.')
  }

  for (const rule of DENY_RULES) {
    if (rule.pattern.test(html)) errors.push(rule.message)
  }

  if (!/concept-mesh-ready/.test(html)) {
    errors.push("Missing the ready handshake. Once the card has rendered, call `window.parent.postMessage({ type: 'concept-mesh-ready' }, '*')`.")
  }

  const hasInteractivity = INTERACTIVITY_HINTS.some(p => p.test(html))
  if (!hasInteractivity) {
    errors.push('No interactive controls detected. Add at least one slider, button, or pointer interaction.')
  }

  return {
    ok: errors.length === 0,
    errors,
    hasInteractivity,
    byteLength,
  }
}

function byteLengthOf(s: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length
  // Fallback: approximate UTF-8 byte length without TextEncoder.
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i++ }
    else bytes += 3
  }
  return bytes
}
