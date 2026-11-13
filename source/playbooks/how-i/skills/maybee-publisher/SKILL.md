---
name: maybee-publisher
description: Publishes reviewed posts on a Skool community through the agent's browser tool, exactly as the owner reviewed them. Replaces placeholders with real links, runs the pre-publish checks, shows the owner the final text and waits for an explicit OK, then posts (and pins when asked) and records status, date and link in the post file, the idea and the publishing log. Use when the owner asks to publish or post ("publish today's post", "publish day 8", "publica o post de hoje", "pode publicar").
---

# maybee-publisher

Publishes one or more `reviewed` posts on the project's Skool community. The project's publishing spec, placeholder file and checklist are named in `PROJECT.md`; if this skill and the spec disagree, the spec wins. How to operate Skool's pages is in the project's Skool operations file (also named in `PROJECT.md`).

**Review is the gate.** This skill never writes, edits or improves text. It moves a reviewed text to Skool, character for character, after swapping placeholders for links.

**Needs a browser tool** with the owner logged in to Skool. Without one, show the owner the final text and links to post by hand, and record the result when they send the link.

## Inputs

- The post file: frontmatter and the published block (in posts, the ```` ```text ```` block under `## Post`). Never the review notes.
- The placeholder file (values for `{{key}}`, including the community URL); `{{post:N}}` comes from the `link` of the post with `day: N`
- `logs/publishing.md`: earlier runs

## Mode

- **In conversation (default):** the owner is in the chat. **Always** show the final text and wait for an explicit OK for each post before publishing. One OK doesn't cover the next post.
- **Scheduled:** only if the owner decided it (a decision in `knowledge/decisions.md`). Until then, a run without the owner only reports what it would publish.

## Steps

### 1. Pick the posts

From what the owner asked. Each needs `status: reviewed` in its frontmatter; otherwise stop and say why (never set it yourself). Skip posts that already have a `link`.

### 2. Build the final text

- The first line of the block is the **title**; the rest, after the blank line, is the **body**.
- Links are embedded as `[anchor text]({{key}})`. Resolve each key; in the text you type keep only the anchor text (the URL goes on those words in step 5). A key with no value → stop and say which.
- Change nothing else: no rewording, spacing or emoji changes.

### 3. Pre-publish checks

- [ ] No `[X]`, `[link]`, `[name]` or other bracket placeholder left (embedded links are not placeholders)
- [ ] No bare URL, no bare `{{key}}`
- [ ] No `[to confirm]` or `[open]`
- [ ] Affiliate links come with the project's disclosure sentence
- [ ] The project's ending and format rules (from its checklist)
- [ ] Plain text, no markdown

Any failure: don't publish. Report it; don't fix the text.

### 4. Show the owner and wait

Show the **title** and **body exactly as they will be posted**, each link as `anchor text → URL` under the block, the category, and whether it will be pinned. Ask for the OK and wait for an explicit yes.

### 5. Publish

- Open a **new tab** (never reuse the owner's tabs). Go to the community. A login page → stop: the owner logs in, never the agent.
- Open the composer, type the title and the body, keep the line breaks, embed each link on its anchor words, pick the category (the default unless the owner said otherwise). Find elements by reading the page each time; the interface changes.
- Before posting, check (screenshot) that title and body match the approved text. Post once. Never trigger browser dialogs; an unexpected modal → stop and report.
- Pin only if the owner approved it in step 4. Open the published post, copy its URL, close the tab.

One attempt per step. If a step fails twice, stop and report.

### 6. Record (same turn)

- Post file: `status: published`, `published: YYYY-MM-DD`, `link: <url>`.
- Its idea → `stage: done`, `done: YYYY-MM-DD`. Publishing routines → the file in `outputs`, a dated line in their *Log*, `last_done`.
- Every place that mentions the post (spokes, comments, logs) gets its link.
- `logs/publishing.md`: `| date | day | title | result | link |` (create it with that header if missing).
- `logs/CHANGELOG.md` one line; `STATE.md` the affected lines. Say which posts that point to this one (`{{post:N}}`) can now go out.

### 7. Report (in the owner's language, short)

```
Published: <title> → <link>
Pinned: yes/no
Recorded: post, idea, log
Next: <what's unblocked>
```

## Don'ts

- Don't publish anything not `reviewed`, or without the owner's explicit OK in the chat.
- Don't edit the text, fix typos or reformat. Report and stop.
- Don't log in, type passwords or accept terms for the owner.
- Don't publish the review notes.
