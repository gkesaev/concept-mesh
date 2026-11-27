export const MAX_CARD_BYTES = 500 * 1024

const REQUIRED_THEME_VARS = [
  '--cm-bg',
  '--cm-surface',
  '--cm-text',
  '--cm-accent',
  '--cm-border',
] as const

const PROHIBITED_JS_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /\b(?:new\s+)?Function\s*\(/, label: 'Function constructor' },
  { pattern: /\bimport\s*\(/, label: 'dynamic import()' },
  { pattern: /\bfetch\s*\(/, label: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { pattern: /\bWebSocket\b/, label: 'WebSocket' },
  { pattern: /\bEventSource\b/, label: 'EventSource' },
  { pattern: /\bsendBeacon\s*\(/, label: 'navigator.sendBeacon()' },
  { pattern: /\b(?:Shared|Service)?Worker\b/, label: 'Web Worker' },
  { pattern: /\bimportScripts\s*\(/, label: 'importScripts()' },
  { pattern: /\blocalStorage\b/, label: 'localStorage' },
  { pattern: /\bsessionStorage\b/, label: 'sessionStorage' },
  { pattern: /\bindexedDB\b/, label: 'indexedDB' },
  { pattern: /\bdocument\.cookie\b/, label: 'document.cookie' },
  {
    pattern: /\blocation\s*\.\s*(?:href\s*=|replace\s*\(|assign\s*\()/,
    label: 'location redirect',
  },
]

function isAllowedResourceUri(raw: string): boolean {
  const value = raw.trim().toLowerCase()
  return value === '' || value.startsWith('#') || value.startsWith('data:')
}

function stripJsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}

function extractTagBodies(html: string, tag: 'style' | 'script'): string[] {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const matches: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    matches.push(match[1])
  }
  return matches
}

function checkExternalResources(html: string, errors: string[]): void {
  if (/<link\b/i.test(html)) {
    errors.push('Prohibited <link> tag detected (external resources are not allowed)')
  }
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) {
    errors.push('Prohibited external <script src> detected')
  }
  if (/<script\b[^>]*\btype\s*=\s*["']?module["']?/i.test(html)) {
    errors.push('Prohibited module script (type="module") detected')
  }
  if (/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?refresh["']?/i.test(html)) {
    errors.push('Prohibited <meta http-equiv="refresh"> redirect detected')
  }

  // Check resource-loading attributes on embedded media / SVG elements
  const attrRegex =
    /<(img|video|audio|source|iframe|embed|object|use|image)\b([^>]*)>/gi
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = attrRegex.exec(html)) !== null) {
    const tagName = tagMatch[1].toLowerCase()
    const attrs = tagMatch[2]
    const valueRegex =
      /\b(src|srcset|poster|data|href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = valueRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase()
      const rawVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
      if (attrName === 'srcset') {
        const urls = rawVal.split(',').map(part => part.trim().split(/\s+/)[0] ?? '')
        if (urls.some(u => !isAllowedResourceUri(u))) {
          errors.push(`Prohibited external URL in <${tagName} srcset>`)
        }
      } else if (!isAllowedResourceUri(rawVal)) {
        errors.push(`Prohibited external resource in <${tagName} ${attrName}>`)
      }
    }
  }
}

function checkCss(html: string, errors: string[]): void {
  const styleBlocks = extractTagBodies(html, 'style')
  const combinedCss = styleBlocks.join('\n')

  for (const variable of REQUIRED_THEME_VARS) {
    if (!new RegExp(`${variable}\\s*:`).test(combinedCss)) {
      errors.push(`Missing required CSS theme variable declaration ${variable}`)
    }
  }

  if (/@import\b/i.test(combinedCss)) {
    errors.push('Prohibited CSS @import detected')
  }

  // Scan url(...) in <style> blocks and inline style attributes
  const urlSources = [...styleBlocks]
  const inlineStyleRegex = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  let inlineMatch: RegExpExecArray | null
  while ((inlineMatch = inlineStyleRegex.exec(html)) !== null) {
    urlSources.push(inlineMatch[1] ?? inlineMatch[2] ?? '')
  }

  const urlRegex = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi
  for (const css of urlSources) {
    if (/\bimage-set\s*\(/i.test(css) && /https?:|\/\//i.test(css)) {
      errors.push('Prohibited external URL in CSS image-set()')
    }
    let urlMatch: RegExpExecArray | null
    while ((urlMatch = urlRegex.exec(css)) !== null) {
      const target = urlMatch[1] ?? urlMatch[2] ?? urlMatch[3] ?? ''
      if (!isAllowedResourceUri(target)) {
        errors.push('Prohibited external URL in CSS url()')
        break
      }
    }
  }
}

function checkScripts(html: string, errors: string[]): void {
  const scriptBlocks = extractTagBodies(html, 'script')
  for (const raw of scriptBlocks) {
    const code = stripJsComments(raw)
    for (const { pattern, label } of PROHIBITED_JS_PATTERNS) {
      if (pattern.test(code)) {
        errors.push(`Prohibited JavaScript API detected: ${label}`)
      }
    }
  }
}

/**
 * Runs fast synchronous card-spec compliance checks before launching Chromium.
 */
export function runStaticChecks(html: string): string[] {
  const errors: string[] = []
  if (typeof html !== 'string' || html.trim().length === 0) {
    return ['Card HTML is empty']
  }

  const byteLength = Buffer.byteLength(html, 'utf8')
  if (byteLength > MAX_CARD_BYTES) {
    errors.push(`Card HTML exceeds maximum size of 500 KB (${byteLength} bytes)`)
    return errors
  }

  if (!/<!doctype\s+html\b/i.test(html)) {
    errors.push('Missing <!doctype html> declaration')
  }
  if (!/<html\b/i.test(html)) errors.push('Missing <html> element')
  if (!/<head\b/i.test(html)) errors.push('Missing <head> element')
  if (!/<body\b/i.test(html)) errors.push('Missing <body> element')

  const mainMatch = html.match(/<main\b([^>]*)>/i)
  if (!mainMatch) {
    errors.push('Missing <main> root element')
  } else if (!/\b(?:aria-label|aria-labelledby)\s*=\s*(?:"[^"]+"|'[^']+')/i.test(mainMatch[1])) {
    errors.push('<main> element must provide an accessible name (aria-label or aria-labelledby)')
  }

  checkExternalResources(html, errors)
  checkCss(html, errors)
  checkScripts(html, errors)

  return Array.from(new Set(errors))
}
