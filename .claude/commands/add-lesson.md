---
description: Record a lesson learned from a mistake to CLAUDE-LESSONS.md
---

# Add Lesson

Append an entry to `CLAUDE-LESSONS.md` documenting a discovered mistake or recurring pattern so
future work (human or agent) avoids it.

## When to use

- A bug slipped past lint / type-check / build.
- A review revealed a recurring pattern.
- A mistake was made that others should avoid.

## Entry format

```markdown
### YYYY-MM-DD: Brief Title

- **Problem:** What went wrong (be specific).
- **Root Cause:** Why it happened (the underlying issue).
- **Fix:** The correct approach (actionable guidance).
- **Files:** Where it occurred (paths).
- **Automated:** Yes/No (if a check was added, name it).
```

## Usage

```bash
/add-lesson                                   # all fields prompted
/add-lesson "Brief Title" "Problem description"   # remaining fields prompted
```

First argument → title (used in the `### YYYY-MM-DD: Title` heading). Second → Problem. The
rest (Root Cause, Fix, Files, Automated) are prompted.

## After adding — can it be automated?

Prefer a machine check over a doc note whenever possible:

1. **ESLint can catch it?** → add a rule to `eslint.config.mjs`, then set
   `**Automated:** Yes (ESLint rule: <rule-id>)`.
2. **Type system can catch it?** → tighten the types (`types/**`, Drizzle `$type<>()`), then note it.
3. **Build-time only / visual?** → keep it as a checklist item and mark `**Automated:** No`.

Always update the entry's `Automated` field with the specific rule id or location so reviewers
can find the automation.
