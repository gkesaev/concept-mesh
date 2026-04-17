# ConceptMesh Card Specification

Version: 1.0

A **ConceptMesh card** is a single, self-contained HTML document that renders an interactive visualization of one concept. This spec is the contract between the generation pipeline (AI producers) and the rendering pipeline (iframe consumers).

## Goals

- **Self-contained**: one HTML string — no network, no external assets, no build step.
- **Safe to render**: runs inside a sandboxed iframe with no same-origin access.
- **Themable**: the host mesh controls colors via CSS custom properties.
- **Portable**: the same HTML can be stored, diffed, embedded elsewhere, or shared via URL.

## Document shape

A card is a complete HTML document. It MUST:

- Start with `<!doctype html>` and include `<html>`, `<head>`, `<body>`.
- Declare `<meta charset="utf-8">`.
- Include a `<title>` matching the concept title.
- Include exactly one top-level `<main>` element in `<body>` as the visualization root.
- Apply `box-sizing: border-box` to all elements.
- Render legibly at viewport widths between **320px** and **1200px**.

### Minimal skeleton

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Concept Title</title>
    <style>
      :root {
        --cm-bg: #0b1020;
        --cm-surface: #141a2e;
        --cm-text: #e8ecff;
        --cm-accent: #7c5cff;
        --cm-border: #2a3150;
      }
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; background: var(--cm-bg); color: var(--cm-text); font: 14px/1.5 system-ui, sans-serif; }
      main { padding: 16px; }
    </style>
  </head>
  <body>
    <main aria-label="Concept visualization">
      <!-- visualization -->
    </main>
    <script>
      // optional, inline only
    </script>
  </body>
</html>
```

## CSS

- All styles MUST be **inline** via `<style>` blocks in `<head>` or `style="..."` attributes. No `<link rel="stylesheet">`.
- No `@import`, no `url(...)` referencing external origins. `url("data:...")` is allowed.
- No `@font-face` with external URLs. Use system font stacks (`system-ui, -apple-system, Segoe UI, sans-serif`).

### Theme variables (CSS custom properties)

Every card MUST respect these variables, declared on `:root` with the defaults shown and used throughout:

| Variable | Role | Default |
|---|---|---|
| `--cm-bg` | Page background | `#0b1020` |
| `--cm-surface` | Card panels, controls, inputs | `#141a2e` |
| `--cm-text` | Primary text color | `#e8ecff` |
| `--cm-accent` | Highlights, focus ring, primary action | `#7c5cff` |
| `--cm-border` | Dividers, outlines | `#2a3150` |

The host mesh overrides these variables on the iframe's `:root` at render time. Cards that hardcode hex values instead of variables will look wrong when embedded.

Cards MAY define additional `--cm-*` variables for internal use, but MUST NOT shadow the five above with different meanings.

## JavaScript

- All JS MUST be **inline** via `<script>` blocks. No `<script src="...">`.
- No module scripts (`type="module"`) — iframes cannot resolve module specifiers in a sandbox.
- No `eval`, no `new Function`, no dynamic `import()`.
- No network APIs: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `Worker`, `SharedWorker`, `ServiceWorker`, `importScripts` are disallowed.
- No storage APIs: `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` writes.
- `window.parent` communication is allowed **only** via `postMessage` with the host-documented message schema.

### Host ↔ card messages

Cards MAY receive a theme-update message:

```json
{ "type": "cm:theme", "vars": { "--cm-bg": "#...", "--cm-text": "#..." } }
```

Cards handling this should apply the variables to `document.documentElement.style`.

Cards MAY send:

```json
{ "type": "cm:ready" }
{ "type": "cm:resize", "height": 420 }
{ "type": "cm:error", "message": "..." }
```

All other message types are ignored by the host.

## No external resources

The following are **prohibited** anywhere in the card:

- `<link>` to external stylesheets, fonts, icons, or preconnect hints.
- `<script src>` pointing to any URL.
- `<img src>`, `<video src>`, `<audio src>`, `<source src>`, `<iframe src>`, `<embed src>`, `<object data>` pointing to any URL.
- `background-image: url(https://...)` or similar in CSS.
- Any `fetch`/`XHR`/`WebSocket` call from JS.

**Allowed**: `data:` URIs (inline SVG, base64 images), and inline `<svg>` elements.

## Size limits

- Total card HTML MUST be **≤ 500 KB** (UTF-8 byte length).
- The validation pipeline rejects cards above this size.
- Inline base64 images should be used sparingly — prefer inline `<svg>` for diagrams.

## Accessibility baseline

Cards MUST:

- Set `<html lang="...">`.
- Provide `aria-label` or `aria-labelledby` on `<main>` describing the visualization.
- Give every interactive control (`<button>`, `<input>`, custom widgets) an accessible name via label, `aria-label`, or `aria-labelledby`.
- Give sliders both `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and a visible label (native `<input type="range">` satisfies this automatically if labeled).
- Maintain a contrast ratio of **≥ 4.5:1** for body text against `--cm-bg`/`--cm-surface`.
- Support keyboard use: every interactive element reachable via `Tab`, operable via `Enter`/`Space`/arrow keys as appropriate.
- Respect `prefers-reduced-motion: reduce` — animations must shorten or disable under this media query.
- Avoid color-only signaling — pair color with shape, text, or iconography.

## Iframe sandbox (host contract)

The host mesh renders cards inside:

```html
<iframe
  sandbox="allow-scripts"
  srcdoc="<card html>"
  referrerpolicy="no-referrer"
  loading="lazy"
></iframe>
```

Explicitly **not granted**:

- `allow-same-origin` — the iframe is a null origin. Cards cannot read cookies, storage, or parent DOM.
- `allow-popups` — `window.open` is blocked.
- `allow-forms`, `allow-downloads`, `allow-modals`, `allow-top-navigation` — all blocked.
- `allow-pointer-lock`, `allow-presentation`, `allow-orientation-lock` — all blocked.

Card authors must not rely on any of the blocked capabilities.

## Interactivity levels

The `interactivityLevel` field on `concept_cards` classifies the card:

| Level | Meaning | Example |
|---|---|---|
| 0 | Static | Inline SVG diagram, no JS |
| 1 | Input-driven | Sliders, toggles update visual state |
| 2 | Animated / simulation | Continuous animation loop, playable simulation |

Cards SHOULD declare their level honestly — the validation pipeline checks for the presence of interactive elements.

## Validation checklist

The server-side validation pipeline rejects cards that fail any of:

- [ ] Byte length ≤ 500 KB
- [ ] Valid HTML5 (parses without errors)
- [ ] Contains `<!doctype html>`, `<html>`, `<head>`, `<body>`, `<main>`
- [ ] No external `src`, `href`, or `url(http...)` references
- [ ] No prohibited JS APIs (`fetch`, `eval`, etc.) — detected by AST scan
- [ ] Declares all five `--cm-*` variables on `:root`
- [ ] Renders in a headless Chromium without uncaught errors
- [ ] Produces a non-blank screenshot (pixel entropy above threshold)
- [ ] `<main>` has an accessible name
- [ ] Interactive elements have accessible names (when `interactivityLevel ≥ 1`)

## Reference examples

Three reference cards live in [docs/examples/](examples/):

- [`card-static.html`](examples/card-static.html) — static SVG diagram (level 0): binary-search tree
- [`card-sliders.html`](examples/card-sliders.html) — input-driven (level 1): compound-interest calculator
- [`card-animation.html`](examples/card-animation.html) — animated (level 2): sine-wave oscillator

These examples are the canonical targets — generated cards should match their structure, theming, and accessibility.
