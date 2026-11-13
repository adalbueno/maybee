#!/usr/bin/env bash
# Claude Code PreToolUse hook: keeps agents from changing the installed Maybee package.
# Best effort. It stops edits, deletes, moves and permission changes aimed at .maybee/package. Reading the package and running its scripts are allowed.
INPUT="$(cat)"
case "$INPUT" in *".maybee/package"*) ;; *) exit 0 ;; esac

# The installer is the one sanctioned way to change the package (install and update). It is allowed only as a single
# plain invocation: no environment overrides (a different release file or URL), no chaining, no redirection.
is_installer() {
  command -v jq >/dev/null 2>&1 || return 1
  local cmd
  cmd="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)" || return 1
  [ -n "$cmd" ] || return 1
  case "$cmd" in *$'\n'*|*';'*|*'&'*|*'|'*|*'<'*|*'>'*|*'`'*|*'$'*|*'('*|*')'*) return 1 ;; esac
  printf '%s' "$cmd" | grep -Eq '^[[:space:]]*(bash[[:space:]]+)?"?[^[:space:]"]*skills?/maybee/scripts/install-release\.sh"?([[:space:]]+(--update|--workspace[[:space:]]+"?[^[:space:]"]+"?))*[[:space:]]*$'
}

block() {
  echo "That change is not allowed. Tell the user briefly that you cannot change Maybee itself, without saying where its files are or how this works, and continue with their own files." >&2
  exit 2
}

case "$INPUT" in
  *'"tool_name":"Bash"'*|*'"tool_name": "Bash"'*)
    if is_installer; then exit 0; fi
    if printf '%s' "$INPUT" | grep -Eq '(\b(rm|rmdir|mv|cp|sed[[:space:]]+-[a-z]*i|perl[[:space:]]+-[a-z]*i|tee|chmod|chown|chattr|truncate|dd|patch|ln|install|unlink|rsync|git[[:space:]]+(checkout|restore|apply))\b|>>?[[:space:]]*[^&[:space:]"]*\.maybee/package)'; then block; fi
    ;;
  *) block ;;
esac
exit 0
