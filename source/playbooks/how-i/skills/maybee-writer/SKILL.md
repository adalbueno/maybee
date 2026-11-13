---
name: maybee-writer
description: Writes posts (or other texts the project publishes) for one or many items, in the owner's voice, using only real facts from the project's records. Asks the owner specific fact questions first, records the answers, logs tasks the owner must do first, saves the files as drafts and runs maybee-check on each. Use whenever the owner asks to write, draft or continue posts ("write the next posts", "write day 9", "escreve o dia 9", "escreve os próximos").
---

# maybee-writer

Writes the texts the project publishes. The goal is not only a text: it's texts that sound more like the owner every week. Every conversation is input: facts go to the story bank, opinions and phrasing to the voice notes, and the next text reads both.

Everything specific to the project (formats, structure, types, endings, CTA, file format, where files go) is in `PROJECT.md` and the writing rules it points to. Read them first; they win over anything here.

## Inputs (read before writing)

- `PROJECT.md` (output format and location, rules) and the project's writing rules
- The item's idea note in `ideas/` (what it teaches, type, planned day)
- `knowledge/brief.md` (the sections the writing rules cite), `knowledge/decisions.md` (*In force*, *Still open*)
- `system/writing-style.md`, `system/method.md` (translate, don't paraphrase)
- `knowledge/story-bank.md` (facts), `knowledge/open-questions.md` (good material for plans, never facts)
- `owner/voice.md`, `owner/preferences.md` (texts never contradict a preference)
- `logs/conversations/`: when the topic was discussed, the owner's raw words are the primary source
- Earlier outputs: the previous and next ones (continuity), and those already `reviewed` or later as the best voice examples
- Open tasks for the owner (`type: task`, stage `next`/`now`)

## Steps

### 1. Pick the items

An item named by the owner (a day, a range, an idea) → that one. Nothing named → the top of *Next in line* (`stage: next`, by planned day, then priority); if it's empty, offer 3–5 ideas by priority, pre-qualified, and let the owner pick. Skip items already written unless asked to rewrite a draft. Never touch a `reviewed` or later output; say so.

### 2. Plan each one (no writing yet)

- **What it teaches** in one sentence.
- **Type vs. reality:** never present as done something the sources don't show as done (the project's types say how to write plans and work in progress).
- **Facts needed:** every fact it would state, each marked *found* (with its source) or *missing*.
- **Things the owner must do first:** a step not done yet, a number to collect, a screenshot, a link, an open decision.
- **Opinion needed:** where the text needs the owner's view; check `owner/voice.md` first.

### 3. Ask the owner (before writing)

Ask for the missing facts and opinions in the conversation. In a batch, collect all questions first, grouped by item.

- **Specific questions only**, one fact each, with the context that makes it answerable. Not "anything to add?"
- **Ask for the why** when a decision's reason isn't written anywhere: that's where the voice is.
- Offer what you know so the owner only corrects ("The brief says X. Is that how it happened?").
- At most ~3 questions per item. The rest becomes `[X]` or a `**To confirm:**` note.

**Record every answer right away**, before writing: facts → story bank (when, what, source); opinions and explanations → `owner/voice.md` (their words + translation); expressions → `owner/voice.md` *Phrasing*; preferences → `owner/preferences.md`; raw messages that carry an idea → `logs/conversations/YYYY-MM-DD.md`.

If the owner doesn't know or prefers not to say, use `[X]` or leave the claim out. Never fill it in.

### 4. Log what the owner must do

A text that depends on something the owner must do or collect → a task note in `ideas/` (next free T number; `type: task`, `stage: next`, `owner: owner`, `kind` (Do · Collect · Decide · Review · Talk), `needed_by`, `for`). Don't duplicate an open task; add the item to its `for`.

### 5. Write

- Follow the project's structure, length, ending, title and link rules.
- **Translate, don't paraphrase:** when the owner explained the idea, the text is that explanation, clearer: same idea, stance, example and order of thought.
- **Facts:** only *found* facts, each traceable in the review notes. Never state as fact anything open or to confirm.
- **Voice:** `system/writing-style.md` + `owner/voice.md`; reuse the owner's phrasing where it fits, not in every text.
- **Continuity:** don't repeat the previous text's opening or steps.

### 6. Save

In the place and format `PROJECT.md` gives, with `status: draft`, a navigation line (links to the dashboard and to the previous/next items; update the previous item's *next* link) and *Review notes*:

```
- Facts: <each fact with its source>
- **To confirm:** <one per bullet>
- Tasks: <T-numbers>
- Placeholders: <keys used>
```

Link both ways: the idea note gets the output in a property (`post: "[[folder/Title]]"`), the output gets `idea: "[[ideas/Title]]"`. If it goes out this week, the idea moves to `stage: now` and the output gets its day or date.

### 7. Check, capture, log

- Run `maybee-check` on each new text.
- Anything done in this session that could teach someone → a new idea (`stage: maybe`, estimated reactions).
- `logs/CHANGELOG.md`: one line per text written; `STATE.md`: the affected lines.

### 8. Report (in the owner's language, short)

```
**Written** (N)
- <title> (<type>). <n> to confirm. <file>

**Blocked**
- <item>: <why> → task T<n> (<needed by>)

**Recorded**
- Story bank: <n> facts · Voice: <n> · Tasks: <T-numbers>

**Review first:** <the one with most to confirm, or the next to go out>
```

## Don'ts

- Don't invent experiences, numbers, dates, opinions or tool usage. A text can ship without a detail; it can't ship with a made-up one.
- Don't set `reviewed` or any owner-only field.
- Don't move items between days or put ideas in `next`/`now` without the owner's decision.
- Don't ask generic questions. Ask the one fact that changes the text.
