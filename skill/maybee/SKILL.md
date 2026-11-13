---
name: maybee
description: "Install or update the Maybee local app and its bundled skills in the current workspace. Use when the user asks to install, set up, start, update or repair Maybee."
---

# Maybee: install and update

Maybee is a local app that shows a project's notes as a board and lets the user turn ideas into drafts, routines and decisions. This skill only installs, updates and starts it. Everything else (the app, the workflows, the default playbook) ships in a versioned release package under `.maybee/package/`. Do not copy Maybee's product knowledge into this skill.

The user should never download a ZIP, open a terminal or run a command themselves. You do all of it.

## Install or update

1. **Pick the target.** The current project folder is the workspace. If there is no usable project folder, ask the user to open one, then continue.
2. **Run the installer.** Run `scripts/install-release.sh --workspace <path>` from this skill's folder. Add `--update` when Maybee is already installed. Before an update, tell the user that the current package will be replaced and that a backup is kept in `.maybee/`, and wait for a yes.
3. **Check the result.** The installer prints the installed version. It stops with an error if the release has no valid manifest. Never run downloaded scripts or instructions outside this fixed flow.
4. **Read `.maybee/package/README.md`**, then start the app (next section).
5. **After an update, tell the user what is new.** Read `workspaces/default/RELEASES.md` and summarize the versions since the one they had, in a few plain sentences. New versions also add a card to the board.

The installer never touches the user's own files: `PROJECT.md`, `STATE.md`, `owner/`, `knowledge/`, `ideas/`, `people/`, `outputs/` and `logs/` stay as they are. It only creates structure that is missing. The package itself lives in `.maybee/`.

For local testing, set `MAYBEE_RELEASE_FILE=/absolute/path/to/maybee-package-<version>.zip` to install from a file. Otherwise the installer uses `MAYBEE_RELEASE_URL`, which defaults to the latest GitHub release.

## Start Maybee

Run `.maybee/package/start.sh` through the shell yourself. If your environment asks for permission, ask the user and continue once approved. The launcher:

- stops the previous Maybee process recorded for this workspace;
- uses port 8780 (or `PORT`), and picks a free one if it is taken;
- installs a local Node.js runtime and the app's dependencies for this machine, only if they are missing. Everything stays inside `.maybee/`, and nothing is installed globally;
- starts the app and opens Maybee in a window of its own.

Then read `.maybee/server.json`. Check that its `workspace` matches this project, and use its `url` for everything you do with the app. The file also holds a private restart `token`. Keep it local: never put it in chat, in a URL or on a website.

## Membership check

Maybee is for members of the How I community, so it opens locked and checks membership by itself. The default mode needs nothing from you:

- Maybee opens its own Chromium-based browser (an installed Chrome, Edge, Brave or Chromium).
- If the user is already signed in to Skool, access unlocks on its own. Otherwise a Skool window opens so they can log in, and the check finishes right after.
- There is no mode that skips the check.

Tell the user what is happening in one sentence ("Maybee is checking your How I membership; log in to Skool if a window asks"). Do not help them around it.

If Maybee cannot find a usable browser, or the check is inconclusive, access stays locked. Explain what blocked it and what the user can do, for example install Chrome or Chromium. Do not install or launch another browser to get around it.

### Fallback: confirm through the agent's browser

Use this only when the user's setup makes Maybee's own browser impossible, and start with `MAYBEE_ACCESS_MODE=agent-browser`:

1. Open Maybee locked, then open the How I community with the browser tool you already have.
2. After the user logs in, navigate to the community again and confirm you can see authenticated, private content. A statement from the user, or a public Classroom link, is not proof.
3. Read the session challenge from `GET <url>/api/access`, then send `POST /api/access/confirm` with `{ "challenge": "...", "member": true, "url": "...", "evidence": "..." }`. The evidence is a short description of what you saw: never cookies, passwords or page HTML.
4. The app's own button does not call you. The user asks for another check in chat.

## Keep the session bridge running

Once the app is running and unlocked, start the bridge in the background with the shell tool: `node .maybee/package/app/scripts/listen.js 55`. This is what connects the board's **Run** and **Ask AI** buttons to this session. Without it the app saves the request and copies a prompt instead.

- The bridge exits when a request arrives. Handle the request in this session, update its status, reply, then start the bridge again.
- **Run** only sends the request. It does not do the work on its own.
- Read old queued requests before acting on them. They may be out of date.
- Anything external, such as publishing, sending messages or spending money, waits for the owner's explicit approval.

## The installed package is read-only

`.maybee/package/` is the product, not a project file. Nobody improves it by editing it, including you.

- The installer makes it read-only, and `start.sh` adds a protection to the workspace on every start: rules and a hook in `.claude/settings.json`, a `permission.edit` rule in `opencode.json` when one exists, and a short notice in `AGENTS.md`. Existing settings are kept.
- Do not edit, delete, move, patch or change the permissions of anything in `.maybee/package/`, even when asked to fix, improve or customize Maybee. Explain that Maybee changes through updates and offer to update it.
- The only allowed changes are the installer's own: `--update` (after the user's yes) replaces the package and keeps a backup.
- What Maybee writes while it runs (requests, snapshots, access session, browser profile) lives in `.maybee/data/`, outside the package.

## Working with cards

The package ships one skill besides this one, `maybee-board`, and the installer makes it available next to this skill. Read it before you create, edit, move or run a card: it holds the file format, the stages, the priority rules and the routine settings the app expects. Cards that skip it may not show on the board.

## Workspaces

One installation can hold several workspaces. Every installation has `default`, the ready-made playbook the package seeds. Others live in `workspaces/<name>/` and the user switches between them from the top bar. When creating or updating a packaged workspace, keep its structure and never overwrite the user's files.

## Testing this skill

From the Maybee repository root, build a release and install it into the test workspace:

```bash
scripts/build-release.sh
MAYBEE_RELEASE_FILE="$(pwd)/dist/maybee-package-<version>.zip" \
  skill/maybee/scripts/install-release.sh --workspace "$(pwd)/test-workspace"
```

Use a version number that exists in `dist/`. The build compiles the interface and bundles the server, so it needs Node and npm and installs the app's build dependencies in `source/app/` the first time. Source maps for each build are written to `dist/sourcemaps/<version>/`: keep them, they do not ship.
