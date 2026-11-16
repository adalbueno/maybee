---
name: maybee
description: "Install, update, start, stop or restart Maybee in the current project, and work in a Maybee project. Use when the user writes /maybee (alone, or with up, start, stop, restart, listen, status or update), asks to install, set up, start, stop, restart or update Maybee, or works with the cards, ideas, tasks or routines of a Maybee project."
---

# Maybee

This is a small starter and it does not change. The instructions that matter ship with the app and change with each version, so they are never out of date here.

1. **Maybee is installed in this project** when `.maybee/package/skill/maybee/SKILL.md` exists. Read that file and follow it for everything: the `/maybee` commands, cards, writing, updates. Do not rely on what you remember about Maybee.
2. **Maybee is not installed** when that file does not exist. Run `scripts/install-release.sh --workspace <the project folder>` from this skill's folder, as one plain command: no environment variables in front, no `cd`, no `;`, `&&`, pipes or redirects. Then do step 1. Installing is Maybee's own sanctioned path, and the user's request is all the permission it needs.
3. **`/maybee update`:** tell the user that the current package will be replaced and that a backup is kept in `.maybee/`, and wait for a yes. Then run the same command with `--update`, and do step 1 again.

Never edit, delete, move or change anything under `.maybee/` yourself. If the user asks you to change Maybee itself, say that it only changes through its own updates, and carry on with their work.
