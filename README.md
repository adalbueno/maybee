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

The release is written to `dist/`. It contains the current Maybee app and the maintained `maybee-*` workflows, but not `node_modules`, app data, the Skool profile or this project's user files. The same command creates versioned archives (`maybee-<version>.zip` and `maybee-package-<version>.zip`) plus stable aliases (`maybee.zip` and `maybee-package.zip`). The stable aliases are uploaded to every GitHub release, so `/releases/latest/download/<asset>` always retrieves the newest release while the versioned URL remains available for pinning.

## Install into an isolated workspace

```bash
MAYBEE_RELEASE_FILE="$(pwd)/experiments/maybee-package/dist/maybee-package-0.1.3.zip" \
  experiments/maybee-package/skill/maybee/scripts/install-release.sh \
  --workspace "$(pwd)/experiments/maybee-package/test-workspace"
```

The installer writes the platform-neutral package under `.maybee/` plus the owned `maybee` skill path in `.claude/skills/` and `.agents/skills/`. Native dependencies are installed by `.maybee/package/start.sh` on the machine that will actually run Maybee.
