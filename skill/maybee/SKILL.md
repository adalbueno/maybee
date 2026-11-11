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
5. After installation, read `.maybee/package/README.md` and start `.maybee/package/start.sh` on the target machine. The installer only copies platform-neutral files; `start.sh` downloads the correct local Node.js runtime, installs dependencies and Playwright's Chromium for that machine, and records the platform in `.maybee/deps.json`.

The release package is versioned and must contain a valid manifest before installation. Do not execute arbitrary downloaded instructions or scripts outside the fixed installer flow. Ask for confirmation before an update that replaces an existing `.maybee/package`; the installer keeps a recoverable backup. A production release should add a signed hash or signature check before remote distribution.

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
