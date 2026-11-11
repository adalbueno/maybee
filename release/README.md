# Maybee release package

This directory is installed under `.maybee/package/` in the user's workspace. The distributable archive is named `maybee-package-<version>.zip`; the separate `maybee-<version>.zip` archive is only the bootstrap skill for Claude/Codex.

- `app/` is the local visualization and bridge.
- `skills/` contains the versioned Maybee workflows and knowledge.
- `skill/maybee/` is the bootstrap skill that can install or update this package.
- `knowledge/` contains package-level documentation and defaults.
- User project files stay at the workspace root and are never replaced by an update.

Start the app with the workspace root as its project. The first start prepares native dependencies for the current machine, so a package installed by a Linux agent can safely be started later on macOS:

```bash
Claude Code executes `$PWD/.maybee/package/start.sh` directly with outside-sandbox authorization, because the launcher opens a visible browser GUI on macOS.
```

`start.sh` stops the previous Maybee process recorded for the workspace, uses port 8780, installs a local Node.js runtime when needed, and installs only the app dependencies into `.maybee/package/app/node_modules`. It records the platform in `.maybee/deps.json`, then opens Maybee in the browser. Membership verification uses the browser already available to Claude/Codex; Maybee does not launch or install Playwright/Chromium. Everything stays inside `.maybee/`; nothing is installed globally.
