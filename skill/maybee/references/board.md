# Maybee board rules

A Maybee board is a folder of Markdown files. The app reads them, shows them as cards and writes back the small changes the user makes (moving a card, changing a setting). You and the app edit the same files, so keep to this format and the board stays correct.

## Where cards live

- Each card is one file directly inside `ideas/` of the active workspace: `workspaces/default/ideas/` for the default workspace, `workspaces/<name>/ideas/` for any other. Files in subfolders are ignored.
- The file name is the card's title, with spaces: `Choose the next step.md`. No number prefix.
- A card starts with YAML frontmatter between `---` lines, then ordinary Markdown. The app needs the frontmatter, so never remove it, and keep it valid YAML (quote values that contain a colon).

## Fields

| Field | Values | Meaning |
|---|---|---|
| `id` | a short unique code, such as `T2` | Used to point at a card. Reuse the workspace's pattern. |
| `title` | text | Shown on the card. Defaults to the file name. |
| `type` | `idea`, `task`, `routine` | An idea is not committed yet, a task is, a routine repeats. |
| `stage` | `maybe`, `next`, `now`, `done`, `not` | The column. Missing or unknown means `maybe`. |
| `owner` | `owner`, `agent`, `both` | Who does the work: the user, you, or both. |
| `description` | one line | Starts with a verb and says what to do and why. Shown under the title. |
| `kind` | free label | A small tag on the card, such as `Do`, `Decide` or `Routine`. |
| `next_step` | text | The first concrete action. |
| `needed_by` | date | When it matters. |
| `rank` | a number | Order inside Maybe, Next and Now by hand (lower is higher up). The app writes it when the user drags a card; leave it alone. Cards without one come after, in the usual order. |
| `captured`, `done` | `YYYY-MM-DD` | When the idea was written down, and when it was finished. |
| `importance` | `must`, `should`, `nice` | Weight of a routine or task. Missing counts as `should`. |

Anything else in the frontmatter is kept and ignored. If a card has no description, the app uses the first plain paragraph of the body, so a good body still reads well on the board.

## The stages

- **Maybe:** ideas worth keeping that nobody has committed to. Sorted by priority.
- **Next:** the short queue of tasks the user chose to do. Ready, but not started.
- **Now:** what is being worked on today.
- **Done:** finished work, kept visible as history. Set `done: YYYY-MM-DD`.
- **Not:** set aside on purpose. Hidden from the board by default. Add a short "Why not" section with the user's reason, so it is not forgotten for the wrong reason.

Routines have their own Routines column on the board. What puts a card there is `type: routine`, not `stage`: a routine's `stage` is ignored, except `stage: not`, which hides it.

**Moving cards is the user's call.** Offer, don't decide: never move a card to `next` or `now` on your own. Moving to `done` after you finished something the user asked for is fine, with the date.

## Priority for ideas

Four reactions, each 1 to 3, decide the order in Maybe: `value_members`, `value_money`, `want` and `hard`. Write them in the frontmatter, and write the reason for each in the body, so the user can disagree.

| Reaction | 1 | 2 | 3 |
|---|---|---|---|
| `value_members` | 3 points | 5 | 8 |
| `want` | 2 | 3 | 5 |
| `value_money` | 2 | 3 | 5 |
| `hard` | 2 | 3 | 5 |

Score = (`value_members` + `want` + `value_money`) points ÷ `hard` points. The priority is the next number in 2, 3, 5, 8, 13 at or above the score. The card shows a priority only when all four reactions are set. Ask the user the quick questions (easy or hard? worth it for people? worth it for money? want to do it?) and don't fill the reactions with guesses they haven't seen. Cards outside Maybee are ordered by most recently changed.

## Routines

A routine is a card with `type: routine`. It shows in the Routines column, not in Maybe, Next, Now or Done, and it does not need a `stage` (leave it out; `stage: not` hides the routine).

| Field | Values | Meaning |
|---|---|---|
| `recurring` | `daily`, `weekly (Friday)`, `every other day` | When it is due. |
| `last_done` | `YYYY-MM-DD` | Set it to today when a run finishes. This is what marks it done. |
| `auto` | `off`, `session`, `hours`, `days`, `weeks`, `months` | Whether it runs by itself, and at what rhythm. |
| `auto_every` | a number | Every N hours, days, weeks or months. |
| `auto_days` | `mon-wed-fri` | Weekdays for a weekly routine. |
| `auto_mday` | 1 to 31 | Day of the month for a monthly one. |
| `auto_since` | date | Anchors "every N weeks or months". |
| `priority` | a number | Order on the board, which is also the run order. |
| `at` | `13:00` | Not before that time. |
| `needs` | a routine id | Only after that routine is done today. |
| `not_today` | date | Skips it for that one day without touching `last_done`. |
| `deliverable`, `deliverable_on` | file path, date | The file this run produced, shown as a link for that day. |

A routine that is `auto` runs on its own only while an agent is connected. Without one, the app saves the request and the user presses **Run**.

## Changing a card safely

1. Read the whole file first. Change only the fields you need, and leave the body and the other fields exactly as they were.
2. Don't invent facts. Facts in a card come from the user, from the workspace's files, or from what you just did.
3. Keep the card's links: the line under the frontmatter points back to the dashboard and the overview.
4. Add one line to `logs/CHANGELOG.md` for each change, in the form `- YYYY-MM-DD: what changed (ideas/Card title.md)`. The app shows these lines in each card's **Changes** tab and in the feed.
5. External actions, such as publishing or sending something, wait for the user's explicit OK. A card that asks for one still needs it.
6. The installed program in `.maybee/package/` is read-only. Never edit it, even to fix a card problem: change the card instead.

## A minimal card

```markdown
---
id: I12
title: "Write the pricing page"
type: idea
stage: maybe
owner: both
description: "Draft the pricing page so visitors see what each plan includes"
value_members: 2
value_money: 3
want: 3
hard: 2
captured: 2026-11-13
---

# Write the pricing page

**Why:** visitors leave without knowing what the plans include (members 2: they ask about it often).

**Done when:** a draft is saved and the user has read it.

**First step:** list what each plan includes.
```
