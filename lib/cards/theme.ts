import type { ConceptCard } from '@/types/concept'

export type CardTheme = 'dark' | 'light'

export interface CardThemeVars {
  '--cm-bg': string
  '--cm-surface': string
  '--cm-text': string
  '--cm-accent': string
  '--cm-border': string
}

/**
 * Host-side CSS custom properties injected into every rendered card,
 * matching the five `--cm-*` variables defined in docs/card-spec.md.
 */
export const CARD_THEMES: Record<CardTheme, CardThemeVars> = {
  dark: {
    '--cm-bg': '#0b1020',
    '--cm-surface': '#141a2e',
    '--cm-text': '#e8ecff',
    '--cm-accent': '#7c5cff',
    '--cm-border': '#2a3150',
  },
  light: {
    '--cm-bg': '#f8fafc',
    '--cm-surface': '#ffffff',
    '--cm-text': '#0f172a',
    '--cm-accent': '#5b3df5',
    '--cm-border': '#cbd5e1',
  },
}

/**
 * Injects the host theme variables into a self-contained card HTML document
 * right before `</head>` so they override the card's default `:root` values.
 */
export function injectCardTheme(html: string, theme: CardTheme = 'dark'): string {
  const vars = Object.entries(CARD_THEMES[theme])
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
  const style = `<style data-cm-host-theme>:root{color-scheme:${theme};${vars}}</style>`
  const headClose = /<\/head>/i
  if (headClose.test(html)) {
    return html.replace(headClose, `${style}</head>`)
  }
  return style + html
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Builds a copy-ready sandboxed iframe embed snippet for a concept card.
 */
export function buildCardEmbedCode(
  card: Pick<ConceptCard, 'id' | 'title'>,
  origin: string,
  theme: CardTheme = 'dark',
): string {
  const safeId = encodeURIComponent(card.id)
  const safeTitle = escapeHtmlAttr(`${card.title} — ConceptMesh`)
  const border = CARD_THEMES[theme]['--cm-border']
  return `<iframe src="${origin}/embed/${safeId}?theme=${theme}" width="640" height="480" style="border:1px solid ${border};border-radius:12px" title="${safeTitle}" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy"></iframe>`
}
