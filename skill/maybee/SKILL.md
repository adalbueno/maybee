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
5. After installation, read `.maybee/package/README.md` and execute `.maybee/package/start.sh` yourself through the local shell. If Claude Code asks for authorization, request it and continue after approval; do not tell the user to copy a command into Terminal or launch a file manually. The launcher stops the previous Maybee process recorded for this workspace, tries port 8780 (or `PORT`) and chooses a free port if occupied, downloads the correct local Node.js runtime when needed, installs only the app dependencies for that machine, opens Maybee in the browser, and records the platform in `.maybee/deps.json`.
    6. Follow the installed package README for browser verification: open Maybee locked first, then inspect How I with the browser tool already available to the agent. After the user logs in, navigate again to the community and verify authenticated private content. A user statement or a public Classroom link alone is not proof of access. After startup, read `.maybee/server.json`, verify its `workspace` matches this project, and use its `url` to open Maybee and for all API calls. Keep its private restart `token` local; never send it to Skool or include it in chat. Read the session challenge from `GET <url>/api/access`, then send `POST /api/access/confirm` with JSON `{ "challenge": "...", "member": true, "url": "...", "evidence": "..." }` only after that inspection. Send a short description of observed evidence, never cookies, passwords or page HTML. Maybee unlocks through a local event, without polling. The app button does not invoke the agent: the user requests another check in chat. If no browser tool is available or the page is inconclusive, keep access locked and explain the blocker. Do not install or launch another browser for verification.
    7. Once the app is running and access is verified, start the session bridge yourself with the shell tool in the background: `node .maybee/package/app/scripts/listen.js 55`. Do not ask the owner to open Terminal or copy this command. When the listener exits with requests, handle them in the current agent session, update their status and reply, then start it again. A `Run` button sends to this bridge; it does not execute work by itself. Review old queued requests before acting on them, and keep publishing, messaging and other external actions behind the owner's explicit approval.

The release package is versioned and must contain a valid manifest before installation. Do not execute arbitrary downloaded instructions or scripts outside the fixed installer flow. Ask for confirmation before an update that replaces an existing `.maybee/package`; the installer keeps a recoverable backup. A production release should add a signed hash or signature check before remote distribution. Playwright is optional legacy fallback only; it is not installed by the package launcher.

Maybee supports multiple workspaces inside one installation: the current project is `default`, and additional projects live in `workspaces/<name>/`. Use the app's workspace selector to switch between them. Treat a packaged workspace as a playbook: preserve its included structure and do not overwrite user files when creating or updating it.

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
