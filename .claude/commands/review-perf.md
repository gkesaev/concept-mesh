# Performance Review Agent

Analyze the codebase or specified files for performance issues specific to ConceptMesh's architecture: a real-time graph canvas with AI-generated content.

## Critical Performance Paths

### 1. Canvas Rendering (React Flow)
- [ ] ConceptNode component is memoized (`React.memo` or stable props)
- [ ] ConnectionEdge component is memoized
- [ ] Zustand store selectors are granular — components only subscribe to what they render
- [ ] Node/edge arrays use stable references (not recreated every render)
- [ ] Zoom-level checks use the threshold constants, not arbitrary comparisons
- [ ] No heavy computation in render path (move to useMemo or effects)

### 2. Graph Layout (d3-force)
- [ ] d3-force simulation runs in Web Worker (not main thread) for graphs > 50 nodes
- [ ] Existing node positions are pinned — only new nodes need simulation
- [ ] Simulation tick count is bounded (max 300)
- [ ] Force parameters are tuned (charge -400, link distance 180, collision 100)

### 3. Data Loading
- [ ] Viewport-based queries use spatial bounds, not full-table scans
- [ ] API responses are paginated or bounded
- [ ] Concept search uses database indexes
- [ ] Vector similarity queries use pgvector indexes (ivfflat or hnsw)
- [ ] No waterfall requests — parallel fetch where possible

### 4. AI Generation
- [ ] SSE connections are properly closed on component unmount
- [ ] Generated viz code is cached (DB) — no re-generation on revisit
- [ ] Iframe blob URLs are revoked after use
- [ ] Only one generation runs per concept at a time

### 5. Memory
- [ ] Offscreen nodes are virtualized or simplified (React Flow handles this, but verify)
- [ ] Old SSE EventSource connections are closed
- [ ] Iframe cleanup on modal close (remove from DOM, revoke blob URL)
- [ ] Zustand store doesn't accumulate unbounded data

## Output

For each issue found:
```
⚡ [Impact: HIGH|MEDIUM|LOW] file:line — issue + suggested fix
```

End with top-3 priority fixes ranked by user-visible impact.
