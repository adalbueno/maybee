---
name: maybee-today
description: Daily briefing for a Maybee project. Says what goes out today, what waits for the owner's review, what to do next and what is needed from the owner; checks statuses and blockers; runs the project's daily routines (such as recording numbers). Use when the owner asks what to do today ("what should I do today?", "o que faço hoje?", "status", "what's missing?"), or starts a work session.
---

# maybee-today

Gives the owner a short, actionable picture of where the project stands today.

This skill **reads and reports**. It writes only: idea stages that follow a published output (step 2), new blockers as task notes in `ideas/`, routine records (step 4), the daily numbers if the project keeps them, `STATE.md` and the changelog. It never edits the text of an output, never sets an owner-only field and never publishes.

## Inputs

- `STATE.md` and `PROJECT.md` (rhythm, channels, owner-only fields, where outputs live, project files to read)
- Outputs: their frontmatter (`status`, dates, `day` if the project numbers them) and *Review notes*
- `ideas/`: ideas and tasks in `next` and `now`, routines (`type: routine`)
- `knowledge/decisions.md` (*In force*), and the project's placeholder file if it uses one (named in `PROJECT.md`)

## Steps

### 1. Today's position

Today's date from the environment. If the project has a rhythm (a launch date, a day count, publishing days; see `PROJECT.md` and the files it points to), work out what is due today. Before launch, say so: no "today's output", only what to review and do next.

### 2. Check statuses

Status order: `draft` < `reviewed` < `scheduled` < `published`.

- An output marked `scheduled` or `published` needs a date and a link (or a publishing log entry). Missing → report it.
- An idea whose output is `published` → set the idea's stage to `done` (log it in the changelog).
- Never set `reviewed` or any other owner-only field.

### 3. Check what's blocking

For every `reviewed` output and everything due in the next 7 days:

- placeholders with no value (link keys, `[X]`, `[link]`, `[name]`)
- `[to confirm]` or `[open]` in the text
- open items in *Review notes* (bullets starting with **To confirm**)

Don't run the full writing check here; that's `maybee-check`.

### 4. Routines

Read the routines (`type: routine`). List the daily ones not done today. If the project records daily numbers, do it once a day as its files say (for example a platform operations file in `knowledge/`), only if today's record doesn't exist yet. When a routine is done in the session, set `last_done` to today and record what it produced (`outputs` and its *Log*).

### 5. Report (in the owner's language, short)

Skip empty sections:

```
## Today — <date> (<day N | pre-launch>)

**Goes out today**
- <output>, <status>. <ready | blocked by: …>

**Waiting for your review** (<count>)
- <output>, <how many items to confirm>

**Next to do**
- <next items in order, with the facts or steps they need>

**I need from you**
- <tasks in next/now due in the next 7 days or overdue, with dates>
- <missing values, facts, decisions blocking the next 7 days>

**To talk about**
- <open tasks of kind Talk>

**Updated**
- <stages and records changed in this run>

**Suggestion for today:** <one concrete action, the one that unblocks the most>
```

- At most 7 items per section ("+N" for the rest). Name outputs so the owner can open them.
- Overdue tasks first. When suggesting what to do, offer 1–3 ideas pre-qualified (estimate + reason) and ask the quick questions (easy or hard? worth it?). Never list ideas as "waiting for reactions".
- If a blocker has no task yet, add it as a task note.

### 6. Close

Update the affected lines of `STATE.md` and add the changelog lines.

## Don'ts

- Don't rewrite or "improve" outputs. Point to them.
- Don't invent dates, facts or links.
- Don't move ideas to `next` or `now`; offer them.
