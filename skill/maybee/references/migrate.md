# Moving files and keeping links correct

Read this when an update brings changes to where files live, and whenever you move, rename or delete a file or note in a workspace. Markdown links are relative, so a move that does not fix them leaves broken links and notes that no longer reach each other. The tool below moves the file and fixes the links in one step. Do not move files with `mv` or by rewriting paths by hand.

All commands run from the project folder and act on the active workspace. Add `--workspace <folder>` for another one. Paths are relative to the workspace.

```
node .maybee/package/app/scripts/migrate.js plan
node .maybee/package/app/scripts/migrate.js apply [id ...]
node .maybee/package/app/scripts/migrate.js move <from> <to>
node .maybee/package/app/scripts/migrate.js links
node .maybee/package/app/scripts/migrate.js fill
```

## After an update

An update can ship migrations: small, named moves of the user's files (for example a note that now lives in another folder). **The app applies them by itself** the next time it starts after the update, in every workspace. It moves the files, rewrites the links that pointed to them and the links inside them, keeps a copy of everything it touched in the workspace's `.maybee/backup/`, and records each migration as done, so it never runs twice. You do not need to ask the user first.

After you start Maybee following an update:

1. Run `plan`. It changes nothing. "Nothing to migrate" means everything was applied, and you are done.
2. If it still lists a migration, the app could not finish it. A `conflict` means both the old and the new file exist and differ, so that move was left alone for safety. Tell the user which two files, say what each holds if you can tell, and offer to merge them by hand; do not pick one for them.
3. Run `links` and fix or report any link that still points at nothing.

`apply [id ...]` runs the pending migrations by hand (for example after the user merged a conflict). It does what the app does.

## Whenever something moves

- **Move or rename a file:** `move <from> <to>`. Never `mv`. It refuses to overwrite and to leave the workspace.
- **Delete a file:** first run `links` to see what points at it, fix or remove those links, delete the file, then run `links` again.
- **After any change that adds, moves, renames or removes files or links:** run `links`. It prints each link that points at nothing, with its file and line, and exits with an error when there is one. Fix what you broke before you say you are done.

The tool works on Markdown links (`[text](path)`, `[text](<path with spaces>)` and `[text]: path`) and keeps `#section` anchors. It ignores web links and anything inside code. A path written as plain text, in backticks or in a card's frontmatter is not a link and is not rewritten: search for the old path and update those by hand.

## A workspace made before the template had the foundations

Workspaces created by an older version lack `knowledge/audience/`, `knowledge/offer/`, `knowledge/brand/` and `decisions/`. The About page offers to add them. You can do the same with `fill`: it adds only the template files the workspace is missing and never touches one that exists. Offer it when the user wants to describe their audience, offer or brand in a workspace that does not have those files yet.
