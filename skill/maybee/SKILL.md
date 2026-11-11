---
name: maybee
description: "Install or update the Maybee local app and its bundled skills in the current workspace."
---

# Maybee bootstrap

This is the thin bootstrap skill. The product knowledge, workflows, templates and local app live in the versioned release package; do not put Maybee's domain knowledge in this skill.

## Install or update

When the user asks to install, set up or update Maybee:

1. Treat the current project/workspace as the default target. If there is no usable workspace, ask the user to open one before continuing.
2. Run `scripts/install-release.sh` from this skill folder, passing the workspace explicitly when possible. The user should not download the release ZIP or run the installer manually.
3. Use `MAYBEE_RELEASE_URL` for the release ZIP. For local testing, use `MAYBEE_RELEASE_FILE=/absolute/path/to/maybee-release.zip`.
4. Never overwrite user files such as `PROJECT.md`, `STATE.md`, `owner/`, `knowledge/`, `ideas/`, `people/`, `outputs/` or `logs/`. The installer may create missing project structure, but the package itself belongs under `.maybee/`.
5. After installation, read `.maybee/package/README.md` and execute `.maybee/package/start.sh` yourself through the local shell. If Claude Code asks for authorization, request it and continue after approval; do not tell the user to copy a command into Terminal or launch a file manually. The launcher stops the previous Maybee process recorded for this workspace, uses port 8780, downloads the correct local Node.js runtime when needed, installs only the app dependencies for that machine, opens Maybee in the browser, and records the platform in `.maybee/deps.json`.
6. Follow the installed package README for browser verification: open Maybee locked first, then inspect How I with the browser tool already available to the agent. After the user logs in, navigate again to the community and verify authenticated private content. A user statement or a public Classroom link alone is not proof of access. Read the session challenge from `GET http://127.0.0.1:8780/api/access`, then send `POST /api/access/confirm` with JSON `{ "challenge": "...", "member": true, "url": "...", "evidence": "..." }` only after that inspection. Send a short description of observed evidence, never cookies, passwords or page HTML. Maybee unlocks through a local event, without polling. The app button does not invoke the agent: the user requests another check in chat. If no browser tool is available or the page is inconclusive, keep access locked and explain the blocker. Do not install or launch another browser for verification.

The release package is versioned and must contain a valid manifest before installation. Do not execute arbitrary downloaded instructions or scripts outside the fixed installer flow. Ask for confirmation before an update that replaces an existing `.maybee/package`; the installer keeps a recoverable backup. A production release should add a signed hash or signature check before remote distribution. Playwright is optional legacy fallback only; it is not installed by the package launcher.

## Local test

From the repository root, build a test release:

```bash
experiments/maybee-package/scripts/build-release.sh
```

Then install it into an isolated workspace:

```bash
MAYBEE_RELEASE_FILE="$(pwd)/experiments/maybee-package/dist/maybee-package-0.1.3.zip" \
  experiments/maybee-package/skill/maybee/scripts/install-release.sh \
  --workspace "$(pwd)/experiments/maybee-package/test-workspace"
```
