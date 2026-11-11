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
6. Maybee defaults to `agent-browser` access verification. When the app is locked, use the browser capability that is already available in the current Claude/Codex session (do not launch Playwright, Chrome for Testing, Chromium, or a second profile): open the `verificationTarget` from `GET http://127.0.0.1:8780/api/access`, inspect the visible How I page, and confirm membership only when the URL is inside `https://www.skool.com/how-i-9301/`, the account is not on login/join, and a member control such as `SETTINGS`, `LEAVE GROUP` or `CLASSROOM` is visible. Then POST only the result to `http://127.0.0.1:8780/api/access/confirm` with JSON `{ "challenge": "...", "member": true, "url": "...", "evidence": "..." }`, using the challenge returned by `/api/access`. Never send cookies, passwords or page HTML. If no browser capability is available, report that verification cannot be completed in this session; do not ask the user to install Playwright or run terminal commands.

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
