---
description: One file per decision
---

# Decisions

One file per decision, named `YYYY-MM-DD-short-title.md` (for example `2026-11-14-focus-on-new-founders.md`). The agent reads these before it proposes anything, so a decision here beats its own ideas.

Use this shape. The title and the description are what About shows for the file:

```
---
title: Short title
description: What was decided, in one line
date: YYYY-MM-DD
status: in force
---

## Decision
What was decided, in one or two sentences.

## Why
The reason, so it is not undone for the wrong reason later.

## Related
Links to the files this decision shapes (audience, offer, a card).
```

`status` is `in force`, `replaced` or `dropped`.

When a decision changes, write a new file and mark the old one `replaced`, so the history stays.
