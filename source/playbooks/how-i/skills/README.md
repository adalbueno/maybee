# How I playbook skills

> These skills are not part of the Maybee package. They hold the How I content workflow (posts, ads, shorts, publishing) and refer to files and decisions from that project. To distribute them, build a separate workspace playbook that ships them together with the files they need. The skills Maybee ships are in `source/skills/`.

> [Dashboard](../../DASHBOARD.md) · [AGENTS](../../AGENTS.md) · [Guide](../guide.md) · [Setup](../setup.md)

One folder per skill, `<name>/SKILL.md`, in the open Agent Skills format (a `name` and a `description` in the frontmatter, then the instructions). Every agent finds them through a link to this folder (`.claude/skills`, `.agents/skills`, `.opencode/skills`), created by the setup ([system/setup.md](../setup.md)).

Skills are part of the system: they say **how** to do a task. **What** is specific to a project (formats, channels, rules, owner) lives in that project's files (`PROJECT.md`, `knowledge/`, `owner/`), and the skill reads it there.

- [maybee-today](maybee-today/SKILL.md): daily briefing: what goes out, what waits for the owner, what to do next
- [maybee-idea](maybee-idea/SKILL.md): turns an idea into a clear note and offers what to do next
- [maybee-writer](maybee-writer/SKILL.md): writes posts in the owner's voice from real facts
- [maybee-check](maybee-check/SKILL.md): checks a text before the owner reviews it (writing passes, structure, facts, voice)
- [maybee-publisher](maybee-publisher/SKILL.md): publishes reviewed posts on Skool through a browser, after the owner's OK
- [maybee-video](maybee-video/SKILL.md): script, slide deck and thumbnail for a video from a post
- [maybee-shorts](maybee-shorts/SKILL.md): short vertical videos with the owner's AI avatar and text boxes: copy, prompts, render, post one a day
- [maybee-ads](maybee-ads/SKILL.md): paid-ad creatives (Meta): angles, image line and ad text, renders in the safe area, small tests with the owner's OK, reading the winner

## Adding a skill

Create `system/skills/<name>/SKILL.md`, never inside an agent's hidden folder. Keep project specifics out of it: point to the project file that holds them. Add it to this list and to the guide.
