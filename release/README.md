# Maybee release package

This directory is installed under `.maybee/package/` in the user's workspace. The distributable archive is named `maybee-package-<version>.zip`; the separate `maybee-<version>.zip` archive is only the bootstrap skill for Claude/Codex.

- `app/` is the local visualization and bridge, delivered built and minified (`web/` is the pre-compiled interface; the server and the agent scripts are single bundled files). Only `playwright-core` is installed on the user's machine.
- `skill/maybee/` is the one skill the package ships. Its `SKILL.md` routes to references: `install.md` (install, update, start), `board.md` (the card format and rules) and `write.md` (writing for the project) and `migrate.md` (moving files, migrations and link checks). The installer makes it available to the agent clients in the workspace.
- `skill/maybee/` is the bootstrap skill that can install or update this package.
- `workspaces/default/` is the ready-made default playbook: project, state, dashboard, onboarding cards, routines and supporting folders.
- `knowledge/` contains package-level documentation and defaults.
- User project files stay at the workspace root and are never replaced by an update.
- The installed package is read-only and changes only through updates. Maybee's own working data is kept in `.maybee/data/`, outside the package.

Start the app with the workspace root as its project. The first start prepares native dependencies for the current machine, so a package installed by a Linux agent can safely be started later on macOS:

The agent executes `.maybee/package/start.sh --no-open` and reads the server metadata after startup: the name of the active workspace is in `.maybee/active-workspace.json` (`default` on a fresh install), and the metadata is `workspaces/<name>/.maybee/server.json`. Check that `workspace` is that workspace's folder, then open `<url>/workspace` using its available browser tool. Use this same base URL for every access check and confirmation; never assume port 8780. Do not share the private restart `token` with websites or include it in chat. Request execution authorization only when required by the environment. Show the locked Maybee page first, then verify How I in another tab.

After login, the user tells the assistant to check again. The assistant must navigate back to the community and observe authenticated private content before sending its local confirmation. The locked page receives an access event and unlocks in place without polling or refreshing. The app button does not itself invoke an assistant. This assisted prototype is not independent server-side proof of a paid subscription.

When the Maybee skill starts a session, it also starts the local agent bridge in the background with `app/scripts/listen.js`. The bridge is what makes the board's `Run` and `Ask AI` buttons reach the current Claude/Codex session. It exits when a request arrives so the agent can handle it, then the skill starts it again. If no agent session is listening, the app saves the request and copies a prompt instead; the owner never needs to run a terminal command.

`start.sh` stops the previous Maybee process recorded for the workspace, tries port 8780 (or `PORT`) and chooses a free port if occupied, installs a local Node.js runtime when needed, and installs only the app dependencies into `.maybee/package/app/node_modules`. It records the platform in `.maybee/deps.json`, then opens Maybee in the browser. Membership verification uses the browser already available to Claude/Codex; Maybee does not launch or install Playwright/Chromium. Everything stays inside `.maybee/`; nothing is installed globally.

Maybee can contain multiple workspaces in one installation. The original project is `default`; new workspaces live in `workspaces/<name>/` and can be switched from the selector in the top bar. Each workspace keeps its own notes, routines, preferences and history. A package may include prebuilt workspaces, which is the basis for distributing playbooks. The current app keeps one server and one access session while changing the active workspace.

On a fresh install, the installer seeds `workspaces/default/` from the package. Existing files are preserved, so updating Maybee never replaces a user's playbook or notes.

Workspace routes are addressable directly: `http://127.0.0.1:<port>/<workspace>/overview` (for example `/playbook-demo/overview`). Opening a workspace URL selects that workspace automatically.

- `migrations/` holds the moves of workspace files an update can ask for, one JSON file each (`id`, `version`, `title`, `moves`). The app applies the pending ones to every workspace when it starts after an update: files are moved, links are fixed, a backup is kept in the workspace's `.maybee/backup/`, and a file that cannot be moved safely is left alone. `migrate.js plan` shows what is left. The engine lives in `app/lib/migrations.js`.
