# Maybee package experiment

This is an isolated prototype for distributing Maybee as a thin bootstrap skill plus a versioned release ZIP.

Releases are built automatically by GitHub Actions when a matching version tag is pushed. The tag must match `release/manifest.json`, for example `v0.1.2` for version `0.1.2`.

## Intended user flow

The user installs only the `maybee` bootstrap skill from this public repository through their agent. They then ask the agent to install Maybee. The skill runs the fixed installer from its own folder; the installer downloads the current release, prepares the workspace and installs all local runtime dependencies under `.maybee/`.

For Codex, the skill path is `skill/maybee`. Once installed, the user can say: `Install Maybee in this workspace.` They should not need to download or run the release ZIP themselves.

## Build a release

```bash
experiments/maybee-package/scripts/build-release.sh
```

The release is written to `dist/`. It contains the current Maybee app and the maintained `maybee-*` workflows, but not `node_modules`, app data, the Skool profile or this project's user files. The same command also creates `maybee-<version>.zip`, which contains only the bootstrap skill and is the ZIP to upload to Claude Desktop. The full application archive is named `maybee-package-<version>.zip`.

## Install into an isolated workspace

```bash
MAYBEE_RELEASE_FILE="$(pwd)/experiments/maybee-package/dist/maybee-0.1.1.zip" \
  experiments/maybee-package/skill/maybee/scripts/install-release.sh \
  --workspace "$(pwd)/experiments/maybee-package/test-workspace"
```

The installer installs app dependencies inside `.maybee/package/app/`, writes `.maybee/` plus the owned `maybee` skill path in `.claude/skills/` and `.agents/skills/`, and leaves the user's project files untouched. Set `MAYBEE_SKIP_DEPENDENCIES=1` only for a layout test. This is still a packaging experiment, not yet a cross-platform production installer.
