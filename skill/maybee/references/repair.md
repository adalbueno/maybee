# When Maybee fails: repair it, then report it

When a Maybee command, the app or the bridge fails, fix it yourself before you hand it to the user. Most failures come from the machine, not from Maybee, and each has a known fix. Change only the machine, the environment and the files listed here; never the package (see "Maybee itself is off limits" in SKILL.md).

## 1. Look

- Run `.maybee/package/maybee.sh status --agent <you>` (Codex: outside the sandbox, see install.md). Codex inside its sandbox sees nothing running, so never trust a status taken from there.
- Read the last lines of `.maybee/data/listener.log` (a bridge started in the background writes there) and the error the command printed.

## 2. Match it and fix it

| What you see | Cause | Fix |
|---|---|---|
| `A resume listener is already running (pid N)` while status says not running | A listener died and left its lock behind | `maybee.sh stop`, then start again. If it still refuses, delete `.maybee/data/listener.pid` and `.maybee/data/listening`, then start again. |
| `requires an installed app`, or a Codex run ends "without an answer" on Windows | Codex from the Microsoft Store cannot run commands when the bridge starts it | The bridge retries once by itself. If it still fails: install the standalone Codex (`npm install -g @openai/codex`), and start the listener again with `MAYBEE_AGENT_BIN` set to that `codex` when the Store one comes first on the PATH. |
| `Codex cannot write its own folder`, `read-only file system` | The command ran inside Codex's sandbox | Run it again outside the sandbox (ask the user for that permission). |
| `No Chromium-based browser found` | No Chrome, Edge, Brave or Chromium on the machine | Ask the user to install one, or set `MAYBEE_BROWSER_EXECUTABLE` to the browser's program. |
| `The Maybee browser did not start` | Another window is using Maybee's browser profile | Ask the user to close the Maybee browser windows, then try again. |
| The app does not come up, or its port is taken | A Maybee app from an earlier run is still alive | `maybee.sh restart`. |
| The app says Not listening | The bridge stopped (Claude: the Monitor timed out) | Start the listener again, as install.md says for your agent. |

After a fix, run the command that failed again and check that it works before you say it is fixed. Tell the user in one or two sentences what was wrong and what you did.

## 3. Report what you could not fix

When none of the fixes above work, or the failure is a bug in Maybee itself, prepare a report for the Maybee team. Do not try to work around it by changing Maybee.

1. Run `node .maybee/package/app/scripts/report.js "<short title>" "<what happened, the error, what you tried>"`. It prints the report and a GitHub link with the report already filled in. It removes personal data (the home folder, the user name, emails, session ids, tokens).
2. Show the report to the user and read it once more yourself: nothing private may go out. If something private is still there, say so and run it again with a cleaner description.
3. Give the user the link. They open it, read it on GitHub and submit it there with their own account. Never submit it for them, and never open it without their OK: this goes to a public page.
4. If the user has no GitHub account, give them the report text to send to the Maybee team in the community instead.
