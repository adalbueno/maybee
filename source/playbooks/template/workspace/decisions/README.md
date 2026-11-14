# Decisions

One file per decision, named `YYYY-MM-DD-short-title.md` (for example `2026-11-14-focus-on-new-founders.md`). The agent reads these before it proposes anything, so a decision here beats its own ideas.

Use this shape:

```
# Short title

- **Date:** YYYY-MM-DD
- **Status:** in force | replaced | dropped

## Decision
What was decided, in one or two sentences.

## Why
The reason, so it is not undone for the wrong reason later.

## Related
Links to the files this decision shapes (audience, offer, a card).
```

When a decision changes, write a new file and mark the old one `replaced`, so the history stays.
