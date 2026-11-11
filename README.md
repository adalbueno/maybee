# Maybee package experiment

This is an isolated prototype for distributing Maybee as a thin bootstrap skill plus a versioned release ZIP.

## Build a release

```bash
experiments/maybee-package/scripts/build-release.sh
```

The release is written to `dist/`. It contains the current Maybee app and the maintained `maybee-*` workflows, but not `node_modules`, app data, the Skool profile or this project's user files.

## Install into an isolated workspace

```bash
MAYBEE_RELEASE_FILE="$(pwd)/experiments/maybee-package/dist/maybee-0.1.0.zip" \
  experiments/maybee-package/skill/maybee/scripts/install-release.sh \
  --workspace "$(pwd)/experiments/maybee-package/test-workspace"
```

The installer installs app dependencies inside `.maybee/package/app/`, writes `.maybee/` plus the owned `maybee` skill path in `.claude/skills/` and `.agents/skills/`, and leaves the user's project files untouched. Set `MAYBEE_SKIP_DEPENDENCIES=1` only for a layout test. This is still a packaging experiment, not yet a cross-platform production installer.
