---
id: R1
title: "How routines and settings work"
type: routine
owner: both
kind: Routine
recurring: daily
last_done:
for: "Daily routine"
description: "Read the recent workspace changes and prepare a truthful How I community post in the owner's voice"
importance: must
priority: 3
auto: days
auto_every: 1
auto_run: true
---

> [Dashboard](../DASHBOARD.md) · [Changelog](../logs/CHANGELOG.md) · [Post idea](Turn%20the%20work%20into%20a%20post.md)

# How routines and settings work

This card explains the **Routine** column. A routine is recurring work, not a one-off task. It stays in the workspace after today's run and comes back when it is due.

Use the **gear** on the card to choose whether it runs automatically every session or on a schedule. Use **Run** when you want to start it now. The routine can prepare work, but anything outside the workspace still waits for your approval.

When you open this card, its **Settings** tab is where you can inspect or change the recurring schedule and automatic-run choice. Its **Changes** tab is useful for seeing when the routine or its instructions were updated.

Every day:

1. Read the recent entries in this workspace's `logs/CHANGELOG.md` and the notes they point to.
2. Find the clearest real thread from the last few days: what changed, what was difficult, what was learned, or what needs feedback.
3. Draft one useful post for the How I community in the owner's voice. Keep it concrete and based only on facts in the workspace. If the voice is not recorded yet, ask the owner how it should sound before pretending to know it.
4. Save the draft in `outputs/skool/community/posts/` with `status: draft` and links back to the source notes.
5. Run the writing checks, show the draft to the owner, and wait for an explicit approval before publishing.

Never invent an event, result, number or lesson. Never publish automatically.

**Done when:** today's draft is saved, checked, shown to the owner, and `last_done` is updated here.

**First step:** read the last few changelog entries and ask what part of the work the owner wants to make visible.
