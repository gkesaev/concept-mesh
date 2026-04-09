# Pull Request Review Agent

Perform a thorough review of the current branch's changes against main. Combine code quality, security, and architectural checks into a single PR-ready review.

## Steps

1. Run `git diff main...HEAD` to see all changes
2. Identify which files changed and categorize them (API, component, store, lib, config)
3. For each changed file, check against the relevant review criteria below

## Review Dimensions

### Architecture Alignment
- Changes follow the project structure defined in CLAUDE.md
- No new patterns that contradict existing conventions
- State flows correctly: API → Store → Component
- AI pipeline changes maintain the Plan → Generate → Validate → Fix flow
- New API endpoints follow the existing REST conventions

### Breaking Changes
- Database schema changes have a migration
- API response shape changes are backward-compatible or intentionally breaking
- Store shape changes are reflected in all consuming components
- Type changes propagate correctly

### Performance
- No N+1 queries in API routes
- React Flow nodes/edges use stable references (useMemo where needed)
- No unnecessary re-renders from store subscriptions (use selectors)
- d3-force simulation doesn't block the main thread for large graphs
- Images/assets are optimized

### Completeness
- New features have corresponding API routes AND client integration
- Error states are handled in UI
- Loading states exist for async operations
- New concepts/connections flow through the full pipeline (DB → API → Store → Canvas)

## Output Format

Structure the review as:

```markdown
## Summary
One paragraph overview of what this PR does.

## Findings

### Must Fix
- [ ] [severity] file:line — issue description

### Should Fix
- [ ] file:line — issue description

### Nitpicks
- [ ] file:line — suggestion

## Architecture Notes
Any observations about how changes fit the overall system design.
```
