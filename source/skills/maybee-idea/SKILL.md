---
name: maybee-idea
description: Turns an idea into a clear Maybee note together with the owner, and offers the best ideas to work on next. Captures new ideas (asks what it is, why, what "done" looks like, the first step), writes the description, checks for duplicates, estimates the four reactions with reasons and asks the owner the quick questions; also improves weak descriptions and moves ideas between stages (task, done, not). Use when the owner has an idea ("I had an idea", "write this down", "tive uma ideia", "anota isso"), asks what to do next ("what should I do now?", "give me options", "o que vale mais a pena?"), or asks to describe, qualify or decide on an idea.
---

# maybee-idea

Every idea deserves to be considered. This skill makes each idea understandable on its own: anyone reading the note knows what to do, why, and when it's done. Rules: [board.md](../../board.md) (stages, reactions, priority). If the project has its own estimating rules, they are in `knowledge/` (see `PROJECT.md`).

Chat in the owner's language; notes in the project language. Never invent facts. Never leave anything that asks the owner to react: reactions come from the conversation.

## 1. Capture a new idea

1. **Listen first.** Keep the owner's words; record the raw message in `logs/conversations/YYYY-MM-DD.md`.
2. **Check duplicates.** Search `ideas/` for the key words (titles and descriptions). If one exists, show it and ask whether to merge or keep both.
3. **Ask only what's missing**, at most 3 short questions, one fact each:
   - What is it, in one sentence?
   - Why: for the people the project serves, for money, or because the owner wants it?
   - What does "done" look like? What's the first step?
   Offer your own guess so the owner only corrects ("I understood X, for Y. Done = Z. Right?").
4. **Write the note** `ideas/Title.md` (`id`: next free I number; no number in the file name) with the template below. `description` = one line that starts with a verb and says what to do and why.
5. **Estimate the reactions** (1–3 each, with a one-line reason each) and compute the priority.
6. **Show a short summary** (title, description, estimate, priority) and ask the quick questions: easy or hard? worth it for people? want to do it? Record the answers; if the owner says when ("now", "after X"), set the stage.
7. Default stage `maybe`. Only the owner sends an idea to `next` or `now`.

## 2. Improve a weak description

When an idea only has a title or a fact-like description, rewrite `description` as "verb + what + why" from the title and the body. If it's still unclear, ask one question. Never change the title's meaning.

## 3. Offer what to do next

1. Take the top ideas by priority (then score) in `maybe` (and `next`), skipping what doesn't fit right now (for example, something that depends on a step not done yet).
2. Offer 3–5, each as: **title** · one-line description · priority · why now (one line).
3. Ask which go to `next` or `now`, plus the quick questions for any estimate that looks off. Record answers and stages.

## 4. Move an idea

- **Becomes a task:** `type: task`, `owner` (owner · agent · both), `needed_by`, stage `next` or `now`; first step in the body.
- **Done:** `stage: done`, `done: YYYY-MM-DD`, one line on what was done (and links).
- **Not:** `stage: not` + a "Why not" section with the owner's reason.
- **Routine:** `type: routine`, `recurring`, `last_done`.

Log each change in `logs/CHANGELOG.md`.

## Template

```markdown
---
id: I123
title: "Short title"
type: idea            # idea · task · routine
area: post            # the project's own list
stage: maybe
owner:
description: "Verb + what + why, one line"
value_members: 2
value_money: 1
want: 3
hard: 2
captured: YYYY-MM-DD
source: "conversation YYYY-MM-DD"
---

> [Board rules](../system/board.md) · [Ideas board](ideas.base) · [Dashboard](../DASHBOARD.md)

# I123: Short title

**What:** …

**Why:** for people … / for money … / the owner wants it because …

**Done when:** …

**First step:** …

**Estimate (agent, YYYY-MM-DD):** people 2 (…), want 3 (…), money 1 (…), hard 2 (…) → score (5 + 5 + 2) ÷ 3 = 4 → priority 5.

**Open questions:** …
```
