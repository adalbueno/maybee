# Moving files and keeping links correct

Read this when an update brings changes to where files live, and whenever you move, rename or delete a file or note in a workspace. Markdown links are relative, so a move that does not fix them leaves broken links and notes that no longer reach each other. The tool below moves the file and fixes the links in one step. Do not move files with `mv` or by rewriting paths by hand.

All commands run from the project folder and act on the active workspace. Add `--workspace <folder>` for another one. Paths are relative to the workspace.

```
node .maybee/package/app/scripts/migrate.js plan
node .maybee/package/app/scripts/migrate.js apply [id ...]
node .maybee/package/app/scripts/migrate.js move <from> <to>
node .maybee/package/app/scripts/migrate.js links
```

## After an update

An update can ship migrations: small, named moves of the user's files (for example a note that now lives in another folder). They never run on their own, because they touch the user's files.

1. Run `plan`. It changes nothing. If it says "Nothing to migrate", you are done.
2. Tell the user, in plain words, what would move and where, and how many notes have links to fix. Mention any `conflict`: both the old and the new file exist and differ, so that move is left alone and they can merge it by hand.
3. Wait for a yes. Then run `apply`. It moves the files, rewrites the links that pointed to them (and the links inside them), keeps a copy of everything it touched in `.maybee/backup/`, and records the migration as done, so it never runs twice.
4. Read what `apply` printed. If it lists links that still point at nothing, fix them or tell the user which ones; do not leave them.

## Whenever something moves

- **Move or rename a file:** `move <from> <to>`. Never `mv`. It refuses to overwrite and to leave the workspace.
- **Delete a file:** first run `links` to see what points at it, fix or remove those links, delete the file, then run `links` again.
- **After any change that adds, moves, renames or removes files or links:** run `links`. It prints each link that points at nothing, with its file and line, and exits with an error when there is one. Fix what you broke before you say you are done.

The tool works on Markdown links (`[text](path)`, `[text](<path with spaces>)` and `[text]: path`) and keeps `#section` anchors. It ignores web links and anything inside code. A path written as plain text, in backticks or in a card's frontmatter is not a link and is not rewritten: search for the old path and update those by hand.
