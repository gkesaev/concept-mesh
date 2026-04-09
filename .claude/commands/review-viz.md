# Visualization Review Agent

Review AI-generated visualization code or the VizRenderer pipeline for correctness and safety. This agent validates that generated React component code will render properly in the sandbox.

## Validation Checks

### Code Structure
- [ ] Code is a single arrow function expression (not a declaration, not JSX)
- [ ] Uses only `React.createElement` — no JSX syntax
- [ ] Function signature accepts destructured props: `({ React, useState, useEffect, useRef, useCallback, useMemo, Math })`
- [ ] Returns a valid React element tree
- [ ] No import/require statements (everything is injected)

### Allowed APIs
- [ ] Only uses provided hooks: useState, useEffect, useRef, useCallback, useMemo
- [ ] Only uses Math for calculations
- [ ] No DOM manipulation (document.*, window.*)
- [ ] No network calls (fetch, XMLHttpRequest, WebSocket)
- [ ] No timers that leak (setInterval without cleanup in useEffect return)
- [ ] No localStorage, sessionStorage, cookies

### Rendering Safety
- [ ] No infinite loops in render path
- [ ] useEffect dependencies are correct (no missing deps causing infinite re-renders)
- [ ] SVG elements use valid attributes (camelCase for React)
- [ ] Colors use CSS values, not undefined variables
- [ ] Component handles zero/empty state gracefully

### Educational Quality
- [ ] Visualization actually demonstrates the concept (not just decorative)
- [ ] Has interactive elements (buttons, sliders, hover states)
- [ ] Includes labels/annotations explaining what's shown
- [ ] Appropriate for the concept's difficulty level

## Usage

Run on: a visualization code string, a concept's active visualization from DB, or the VizRenderer component itself.

Output a pass/fail report with specific line references for any issues found.
