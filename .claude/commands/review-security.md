# Security Review Agent

Review code for security vulnerabilities specific to ConceptMesh's architecture. This project runs AI-generated code in sandboxed iframes and handles user input through API routes.

## Critical Attack Surfaces

### 1. Visualization Sandbox Escapes
- [ ] iframe uses `sandbox="allow-scripts"` — NO `allow-same-origin`
- [ ] No `postMessage` handlers that trust origin blindly — validate `event.origin`
- [ ] Generated viz code cannot access parent window, localStorage, cookies, or network
- [ ] Blob URLs are revoked after iframe load
- [ ] No `eval()` or `new Function()` on the main thread with user/AI content

### 2. AI Pipeline Injection
- [ ] Prompt templates in `prompts.ts` do not allow user input to break out of template structure
- [ ] Generated code is validated (syntax check) before storage
- [ ] Model name comes from env var, not user input
- [ ] SSE streams do not leak internal errors or stack traces to client

### 3. API Route Security
- [ ] No SQL injection — all queries via Drizzle ORM parameterized queries
- [ ] Concept IDs (slugs) are validated/sanitized before DB lookup
- [ ] Request body size is bounded (Next.js default or explicit limit)
- [ ] No SSRF via user-supplied URLs
- [ ] CORS headers are appropriate (not `*` in production)

### 4. Environment & Secrets
- [ ] `ANTHROPIC_API_KEY` never imported in client components (no `use client` files)
- [ ] `.env` is in `.gitignore`
- [ ] No secrets in `NEXT_PUBLIC_*` variables
- [ ] Docker images don't bake in secrets (use runtime env)

### 5. Dependencies
- [ ] No known CVEs in current dependency versions
- [ ] No dependencies pulling in native code that bypasses sandbox

## Output Format

For each finding:
```
🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🔵 LOW
[Category] file:line — description + remediation
```

End with severity summary table.
