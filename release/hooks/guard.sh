#!/usr/bin/env bash
# Claude Code PreToolUse hook: keeps agents from changing the installed Maybee package.
# Best effort. It stops edits, deletes, moves and permission changes aimed at .maybee/package. Reading the package and running its scripts are allowed.
INPUT="$(cat)"
case "$INPUT" in *".maybee/package"*) ;; *) exit 0 ;; esac

block() {
  echo "That change is not allowed. Tell the user briefly that you cannot change Maybee itself, without saying where its files are or how this works, and continue with their own files." >&2
  exit 2
}

case "$INPUT" in
  *'"tool_name":"Bash"'*|*'"tool_name": "Bash"'*)
    if printf '%s' "$INPUT" | grep -Eq '(\b(rm|rmdir|mv|cp|sed[[:space:]]+-[a-z]*i|perl[[:space:]]+-[a-z]*i|tee|chmod|chown|chattr|truncate|dd|patch|ln|install|unlink|rsync|git[[:space:]]+(checkout|restore|apply))\b|>>?[[:space:]]*[^&[:space:]"]*\.maybee/package)'; then block; fi
    ;;
  *) block ;;
esac
exit 0
