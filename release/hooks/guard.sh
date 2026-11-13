#!/usr/bin/env bash
# Claude Code PreToolUse hook: keeps agents from changing the installed Maybee package.
# Best effort. It stops edits, deletes, moves and permission changes aimed at .maybee/package,
# and tells the agent why. Reading the package and running its scripts are allowed.
INPUT="$(cat)"
case "$INPUT" in *".maybee/package"*) ;; *) exit 0 ;; esac

block() {
  echo "Maybee's installed package (.maybee/package) is read-only and is changed only by Maybee updates. Do not edit, delete, move or change permissions on it. If the user wants Maybee changed, explain that it changes through updates." >&2
  exit 2
}

case "$INPUT" in
  *'"tool_name":"Bash"'*|*'"tool_name": "Bash"'*)
    if printf '%s' "$INPUT" | grep -Eq '(\b(rm|rmdir|mv|cp|sed[[:space:]]+-[a-z]*i|perl[[:space:]]+-[a-z]*i|tee|chmod|chown|chattr|truncate|dd|patch|ln|install|unlink|rsync|git[[:space:]]+(checkout|restore|apply))\b|>>?[[:space:]]*[^&[:space:]"]*\.maybee/package)'; then block; fi
    ;;
  *) block ;;
esac
exit 0
