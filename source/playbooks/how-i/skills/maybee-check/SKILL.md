---
name: maybee-check
description: Checks a text before the owner reviews it, running the four writing passes from system/writing-style.md (scrub, rhythm, real detail, self-check), the project's structure and pre-publish checks, a fact trace and a voice check against owner/voice.md. Edits drafts in place and records what changed; only reports on reviewed or later outputs. Use after maybee-writer, or when the owner asks to check, review or humanize a text (a post by day, range or file, or pasted text such as a reply or a message).
---

# maybee-check

Checks one or more texts. The rules live in `system/writing-style.md` (the four passes) and in the project's writing rules (`PROJECT.md` says where; they win over the system file). This skill applies them; it doesn't hold its own copy.

## Inputs

- The target: an output file (by name, day or range) or text pasted in the conversation
- `system/writing-style.md`
- The project's writing rules and draft checklist, the placeholder file and the brief sections they cite (from `PROJECT.md`)
- `knowledge/decisions.md` (*In force*, *Still open*), `knowledge/story-bank.md`, `knowledge/open-questions.md`, `owner/voice.md`, `owner/preferences.md`

## Edit or report

| Target | What the skill does |
|---|---|
| Output with `status: draft` | Edits the published part (in posts, the block under `## Post`) in place and adds a check note to *Review notes* |
| Output `reviewed` or later | **Report only.** The text goes out exactly as the owner reviewed it. If something must change, say so; editing sends it back to `draft` |
| Pasted text | Returns the checked text and the report in the conversation. Writes nothing |

Never changes status or frontmatter.

## Steps

1. **Read** the part that gets published and the *Review notes*, so you don't re-flag what's already noted or confirmed.
2. **The four passes** from `system/writing-style.md`, in order, **proportionally**: a clean draft gets two or three touches. Keep the owner's own phrasing (`owner/voice.md`) even if it looks like a marker. Pass 3 never invents: missing detail becomes a question. Pass 4: if the edits flattened the voice, dial back.
3. **Structure and pre-publish checks:** the project's checklist (length, structure, ending, title, format, placeholders, links). Never fill a placeholder.
4. **Fact trace.** For every factual claim (something done, a date, a number, a tool, a name, a result), find its source: brief, decision, story bank, voice note, or a confirmation in *Review notes*.
   - No source → a `**To confirm:**` note quoting the claim. Don't delete it; the owner may know it's true.
   - Claims about anything still open (decisions *Still open*, open questions, `[open]` / `[to confirm]` in the docs) can't be stated as fact; as a plan or a question they're fine.
5. **Voice check** against `owner/voice.md`, `owner/preferences.md` and, if the topic was discussed, the owner's raw words in `logs/conversations/`:
   - the text lost the owner's idea, example or stance (became generic) → restore it or note it;
   - a sentence contradicts a recorded opinion or preference → `**To confirm:**`;
   - a recorded opinion fits where the text has a generic line → suggest it in the notes (never insert opinions the owner didn't give for this topic).
6. **Notes (drafts only)**, under the existing *Review notes*:
   ```
   - Check (YYYY-MM-DD): <reads human | mixed | reads AI>. Changed: <short list by pass and rule>. Markers per paragraph: <e.g. 0, 1, 2→1, 0>.
   - **To confirm:** <one bullet per new item>
   ```
7. **Report** in the owner's language, short, per text:
   ```
   **<title>** (<reads human | mixed | reads AI>)
   - Changed: <2–5 items, by pass>
   - Blocks publishing: <placeholders without value, [X], open items> (or "nothing")
   - To confirm: <n> (new: <n>)
   ```
   For a `reviewed` text, say it wasn't edited and list what you would change.

If the owner answers a **To confirm** in the conversation, record the fact (story bank) or the opinion (voice), apply it to the draft and mark the note confirmed ("Confirmed by the owner (date): …"). When called on its own, log changed files in `logs/CHANGELOG.md`.

## Don'ts

- Don't rewrite a clean draft. Proportional edits only.
- Don't add confessions, hedges, rhythm "variety" or invented details.
- Don't fill placeholders.
- Don't edit a `reviewed` (or later) output; don't change status or frontmatter.
