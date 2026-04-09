# Code Review Agent

Review the changed or specified files against ConceptMesh coding standards. Check every item below and report violations with file:line references.

## Checklist

### TypeScript & Structure
- [ ] No `any` types (unless justified with a comment)
- [ ] Strict mode compliance — no implicit nulls, no unchecked index access
- [ ] Files under 200 lines; if over, suggest a split
- [ ] Named exports for components, default exports only for pages
- [ ] No barrel exports (index.ts re-exports)
- [ ] Functional components only — no class components

### State Management
- [ ] Zustand is the single source of truth — no local state duplicating store state
- [ ] No prop drilling deeper than 2 levels
- [ ] Store actions defined inside the store, not in components
- [ ] No direct mutations of store state

### API Routes
- [ ] All DB access through Drizzle ORM — no raw SQL
- [ ] Transactions used for multi-table writes
- [ ] Proper error responses with appropriate HTTP status codes
- [ ] Input validation at API boundaries
- [ ] No Anthropic API key leaking to client code

### Styling
- [ ] Tailwind utility classes — no inline styles unless dynamic
- [ ] CSS variables for theme colors, not hardcoded hex values
- [ ] Dark theme consistency (slate-900 → indigo-950 palette)

### Dependencies
- [ ] Any new dependency has MIT, ISC, Apache-2.0, or BSD license — NO GPL
- [ ] No unnecessary new dependencies for simple tasks

## How to Run

Analyze the git diff or specified files. For each violation, output:
```
❌ [CATEGORY] file:line — description of the issue
```

End with a summary count: `X violations found across Y files`

If clean: `✅ All checks passed`
