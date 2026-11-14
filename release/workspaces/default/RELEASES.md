# What's new in Maybee

The newest version is at the top. Maybee keeps this file up to date when you update, so it always shows the full history. It is not part of your notes: edit your own files, not this one.

## 0.1.26 · 14 Nov 2026

**A badge for what changed, workspaces that show up on their own, and titles you can edit.**

- **A badge on Activity.** When something changes in the project, a small yellow number appears next to Activity. It goes away when you read the changes. What you edit yourself in Maybee does not count.
- **New workspaces appear without a reload.** A workspace created from outside the page, by your assistant for example, shows in the menu at the top within seconds, and right away when you open the menu or come back to the window.
- **The card title is the note's first heading.** Edit the `# title` inside the note and the card on the board follows. Before, a card without a `title` line showed the file name. The `title` line and then the file name are still the fallback.

## 0.1.25 · 13 Nov 2026

**Write an idea straight into Maybe, and arrange your cards by hand.**

- **A field at the bottom of the Maybe column.** Type an idea and press Enter: it becomes a card at the top of the column, and the field stays ready for the next one. Nothing is sent to your assistant.
- **Drag cards to put them in your own order.** In Maybe, Next and Now, drop a card above or below another one. The order is kept in the cards, so it travels with your files. A card you move to another column lands at the top of it.
- **Sort by priority, once.** A link under the Maybe title puts the column in priority order. After that you can still drag cards wherever you want.
- **One button less at the top.** The Story / Everything switch moved into Activity as "Project files", next to the filters. Files like STATE, README, owner/ and knowledge/ are always in the Vault, where you can open and edit them.
- **Maybee's own files stay out of sight.** Nothing inside the `.maybee` folder shows up in Activity, the Vault or search anymore, and notes can no longer open it. Before, a few of its files could appear in Activity with Project files on.
- **One dot for the assistant.** The Claude and Live buttons became a single dot at the top. Green: connected and a session is listening. Grey: connected, but nobody is listening. Red: the app is unreachable. Click it for the requests and the details.
- **Same page width everywhere.** Activity now has the width of the Vault and Overview.
- **Maybee opens on the Workspace.** It no longer reopens on the page you left. Workspace is now first in the menu, and Overview, now called About, is last.
- **About is now the project's cover.** It shows the project's name and summary, how many cards are in Now, Next, Maybe and done this week, shortcuts to the Workspace, Activity and Vault, and the project's own files (the brief, the state, the owner and knowledge notes). The long lists of focus, Now and decisions are gone from it: they live in the Workspace and in `knowledge/decisions.md`. "Waiting for you" stays when something needs a decision.
- **A clearer "Not listening".** The assistant's bridge lasts about 30 minutes, then your Claude session has to start it again. Maybee now says when the last one stopped and what to write in Claude to start it, and the session is told to restart it by itself when it ends.

## 0.1.24 · 13 Nov 2026

**Ask AI is now a chat at the bottom of every note, and notes are always ready to edit.**

- **A chat that floats at the bottom of the note.** Write to your assistant about the note you are reading, from anywhere on the page. The conversation about that note, with the answers, opens above it. Enter sends, Esc hides it. The button at the top of the note is gone.
- **Notes open ready to edit.** No Edit button: click and type. Your changes are saved a moment after you stop typing, and when you switch notes or tabs. Titles keep their yellow underline, and the links at the top of a note (Dashboard, Start here) stay out of the way while you edit.
- **Changes made elsewhere are taken in quietly.** If your assistant or the Settings tab changes the note while it is open, the change appears without losing what you typed. Only when the text itself changed on both sides, Maybee asks which version to keep.
- **The changelog stays readable.** Typing saves often, so a note adds one changelog line every 10 minutes at most.
- **Your assistant gets requests without gaps.** The bridge to your assistant can stay on and hand over each request as it comes, instead of stopping after every one.

## 0.1.23 · 13 Nov 2026

**Fixed: checking your membership no longer opens a pile of windows.**

If Maybee was restarted while its window stayed open, the next membership check could not connect to that window, opened another one, and every new window started the check again. Maybee now reuses the window that is already open, a check that fails to start is not repeated by itself, and a failed attempt waits a few seconds before it can be retried.

## 0.1.22 · 13 Nov 2026

**Ask AI and Run reach your assistant without gaps.**

- The bridge between the board and your assistant can now stay alive and hand over each request as it arrives, instead of stopping after every one. Before, a request sent while your assistant was busy waited with "Not listening" until the bridge was started again.
- Your assistant is now told how to start the bridge so that requests wake it up. A bridge started the wrong way showed "listening" but never delivered anything.

## 0.1.21 · 13 Nov 2026

**Fixed: updating Maybee no longer gets blocked by its own protection.**

Maybee's protection stopped your assistant from running the update, even after you said yes. Updates now go through, and the protection still stops any other change to Maybee's files.

## 0.1.20 · 13 Nov 2026

**Fixed: "Ask AI" and "Run" now work without asking your assistant to start Maybee first.**

Opening a session with your assistant in this workspace now starts Maybee if it is not running and connects the board's Run and Ask AI buttons to that session. Before, the buttons only saved the request ("Not listening") until the assistant had been asked to start Maybee.

## 0.1.19 · 13 Nov 2026

**A cleaner tab, and a short answer when asked to change Maybee.**

- The browser tab now says "Maybee", without another project's name.
- If you ask your assistant to change Maybee itself, it now declines in a sentence and keeps working on your files, without going into details.

## 0.1.18 · 13 Nov 2026

**Fixed: the starter cards now show up on a new install.**

On a fresh install, Maybee opened your project folder instead of the Default workspace, so the board looked empty even though the starter cards were there. It now opens Default and remembers it.

## 0.1.17 · 13 Nov 2026

**Maybee's program files are protected, and every update tells you what changed.**

- When Maybee updates, a card appears in Now with what is new. If you skip a few versions, you get a card for each of the latest ones. Read it and move it to Done.
- Maybee's program files are now read-only, and your assistant is told not to change them, even if you ask it to improve Maybee. Maybee gets better through updates. Your own notes, ideas and files are not affected.
- What Maybee saves while it runs now lives in `.maybee/data/`, next to the program and not inside it. Your existing data is carried over.
- Maybee is now delivered pre-built: a smaller download that sets up with a single dependency instead of dozens.
- Your assistant now has a short guide to how cards work (`maybee-board`), so the cards it creates or changes show up on the board the way they should.
- The workspace list shows Default and the workspaces you created, nothing else.
- Fixed stray folder paths that showed up inside sentences in the starter cards.

## 0.1.16 · 13 Nov 2026

Nothing changes inside the app. We fixed how Maybee is published, so the latest version can always be downloaded from one stable address.

## 0.1.15 · 13 Nov 2026

**Maybee checks your membership with its own browser, and opens in its own window.**

- When you open Maybee, it checks that you are a member of the How I community. It does this on its own now, with a Chromium-based browser it launches (Chrome, Edge, Brave or Chromium, whichever you have installed), without needing your assistant to browse for you.
- If you are already signed in to Skool, the check finishes by itself. A Skool window opens only when you need to log in.
- Maybee keeps only what it needs to confirm access: your user, the community, your role and when you were approved. It never stores cookies or passwords.
- The app now opens in that same browser as a window of its own, instead of a tab in your default browser.
- The demo mode that skipped the check is gone. There is no way around the membership check.

This release was tested on Linux only.

## 0.1.14 · 11 Nov 2026

**The default workspace comes with a ready-made starting playbook.**

A new workspace starts with a short path of cards that teach the board while you use it: choosing a next step, keeping an idea in Maybe, setting up a routine, finishing the tour, and where "Not" lives. It also includes a daily routine that reads your recent changes and drafts a How I community post for you to review. Nothing is published without your approval.

## 0.1.13 · 11 Nov 2026

**Easier installs.** Maybee can now be installed or updated from a stable "latest" address, so you no longer need to look for the right version first.

## 0.1.12 · 11 Nov 2026

**A more reliable first start, and workspaces that find their way.**

- Starting Maybee now picks the right workspace and server by itself, and stops the previous session cleanly before starting a new one.
- The workspace selector in the top bar and the onboarding panel were reworked to match.

## 0.1.3 to 0.1.11 · 11 Nov 2026

**The membership check, made dependable.**

Across these versions we refined how Maybee confirms you belong to the How I community. The check got steadier when you log in to Skool, more careful about asking your permission before opening a browser window, and better at recovering when an older Maybee session was still running. You do not need to do anything different, it just works more often.

## 0.1.0 to 0.1.2 · 11 Nov 2026

**The first release.** Maybee, its board and its installer, ready to add to a Claude or Codex workspace.
