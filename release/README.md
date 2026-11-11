# Maybee release package

This directory is installed under `.maybee/package/` in the user's workspace.

- `app/` is the local visualization and bridge.
- `skills/` contains the versioned Maybee workflows and knowledge.
- `skill/maybee/` is the bootstrap skill that can install or update this package.
- `knowledge/` contains package-level documentation and defaults.
- User project files stay at the workspace root and are never replaced by an update.

Start the app with the workspace root as its project:

```bash
node .maybee/package/app/server.js --project "$PWD"
```

The installer installs the app dependencies and Playwright into `.maybee/package/app/node_modules`. Set `MAYBEE_SKIP_DEPENDENCIES=1` only for an archive/layout test.
