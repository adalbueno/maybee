# Maybee release package

This directory is installed under `.maybee/package/` in the user's workspace. The distributable archive is named `maybee-package-<version>.zip`; the separate `maybee-<version>.zip` archive is only the bootstrap skill for Claude/Codex.

- `app/` is the local visualization and bridge.
- `skills/` contains the versioned Maybee workflows and knowledge.
- `skill/maybee/` is the bootstrap skill that can install or update this package.
- `knowledge/` contains package-level documentation and defaults.
- User project files stay at the workspace root and are never replaced by an update.

Start the app with the workspace root as its project. The first start prepares native dependencies for the current machine, so a package installed by a Linux agent can safely be started later on macOS:

```bash
Claude Code executes `$PWD/.maybee/package/start.sh` directly and requests authorization if needed. On macOS, `start.command` remains available as an optional Finder double-click shortcut.
```

`start.sh` installs a local Node.js runtime when needed, the app dependencies and Playwright into `.maybee/package/app/node_modules`, and Playwright's Chromium into `.maybee/browsers/<platform>`. It records the platform in `.maybee/deps.json` and refreshes native dependencies when the platform changes, then opens Maybee in the browser. Everything stays inside `.maybee/`; nothing is installed globally.
