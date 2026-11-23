// The instructions an agent follows for a Maybee request. They are the same for every agent (Claude Code, Codex, ...):
// the listener adds them to what it prints, or passes them to the agent it starts. No agent is named here.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The About page's chat (gone; its old requests are handled like the Brain's)
export const ABOUT_SCOPE = '@about'

// The Brain chat: a question about the project is answered from its files; a request to change what the project knows is done (it took over the About chat).
export const BRAIN_SCOPE = '@brain'
export const BRAIN_RULES = 'This comes from the Brain page, the chat about what the project knows. A question: answer it from the workspace\'s files, after searching and reading what fits (PROJECT.md, STATE.md, knowledge/, decisions/, ideas/, outputs/, people/, logs/CHANGELOG.md); change nothing and make no card; if the files do not say, say so plainly instead of guessing. A request to change what the project knows (its goal, audience, offer, voice, a decision, the state): find the right file among PROJECT.md, STATE.md, knowledge/ and decisions/ (read them first), make the change straight away, keep the file\'s language and format, and add a line to logs/CHANGELOG.md in the form - YYYY-MM-DD HH:MM: what changed (local date and time now); a change to a decision is a new dated file in decisions/, not an overwrite; if it is not clear which file, ask in the reply instead of guessing; end the reply.js call with --changed followed by every file you changed. Work on a card belongs in that card\'s chat: say so instead of doing it. Anything that goes outside the project waits for the owner\'s OK. Answer short and plain, in the language of the owner, and name each file you used or changed in backticks with its path inside the workspace, for example `knowledge/brand/voice.md`, so the owner can open it from the answer.'

// The Inbox chat: the owner answers what needs them and acts on what Maybee made for them, from the Inbox.
export const INBOX_SCOPE = '@inbox'
export const INBOX_RULES = 'This comes from the Inbox chat, where the owner answers what needs them (the lines under "## Waiting on the owner" in STATE.md) and acts on what Maybee made for them (the outputs on the cards, listed in logs/CHANGELOG.md as "Ready on the card"). Read STATE.md first. If the request names an open card or file ("open beside the Inbox"), the message is most likely about it. An answer to something that needs the owner: write it into that item\'s card (or note), do what it unblocks when it is inside the project, and remove the line from "## Waiting on the owner" once it is settled; if more is needed, change the line to say what is still missing. A request about something that arrived (approve, change, schedule, sum up): do it on the card it came from, the way that card\'s own chat would. A question: answer it from the files. If it is not clear which item the owner means, ask in the reply instead of guessing. Never move a card to next or now on your own. Anything that goes outside the project (publishing, messages) waits for the owner\'s explicit OK. Add a line to logs/CHANGELOG.md for each change, in the form - YYYY-MM-DD HH:MM: what changed (path). Answer short and plain, in the language of the owner, naming each file you used or changed in backticks with its path inside the workspace, and end the reply.js call with --changed followed by every file you changed.'

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
const status = dir => 'node "' + path.join(dir, 'status.js') + '"'
const reply = dir => 'node "' + path.join(dir, 'reply.js') + '"'
const output = dir => 'node "' + path.join(dir, 'output.js') + '"'

// Everything the agent makes lives on a card, so the owner finds it where they look and is told it is ready.
export function showWork(dir = scriptsDir) {
  return 'Show the work: every file you make (a document, a draft, an image, a video, a PDF, a page) goes in outputs/ and on a card, never loose. Run ' + output(dir) + ' "<ideas/Card.md>" "<outputs/file>" "what it is" --request <id> for each one: it adds the file to the card under "## Work" (images, videos, PDFs and pages embedded, other files as links), writes the changelog line and lists the file under your reply. The card is the request\'s own note when its path is in ideas/. When the request comes from somewhere else (About, a file, the board) and you make a file, put it on the open card it belongs to, or, when none fits, create one card in ideas/ (stage maybe, a title and a description that start with a verb) and put it there; say which card in the reply. Answers and small edits that make no file need no card. One output is one thing: a set of pieces (20 posts, 10 emails) is one note per piece in a folder of outputs/, each with frontmatter for its status (draft, approved, scheduled, published) and dates, plus one note that lists the set; only that list goes on the card. When you need the owner\'s OK or action to go on, add one line to STATE.md under "## Waiting on the owner" (- **What to do**: why, with a link to the card or note); it shows on top of the Inbox. When the owner did it or answered, remove that line.'
}

// What to do for each kind of request, in one paragraph. Shared by the one-line and the multi-line forms.
export const ACTIONS = 'Do: "Do the next step" = the note\'s next_step, then write the following next_step. "Work on this now" (the Start button) = the same, and when next_step is empty, read the note, pick the first concrete step yourself, do it, then write the following next_step; "Run routine" = the routine the note describes, set last_done to today, anything external is drafted and waits for the owner\'s OK. Where the routine note says where: maybe, next or now, the cards you make for the owner (at most 3, after looking at the open cards so you do not repeat one) go in that column: a note in ideas/ with stage set to it and source: routine <the routine\'s title>; where: none, or no where, means you make no card. A request whose path is "@brain" (or "@about", from older versions) is not about a note: ' + BRAIN_RULES + ' ; a request whose path is "@inbox" is not about a note: ' + INBOX_RULES + ' ; "Explore this idea" = first make the title and description say the idea clearly (a quick capture is often a rough sentence; change the title and description fields, not the file name), then write into the note what it is, who it is for, why now, risks, the open questions with a proposed answer for each, and the smallest first step, then say whether it is worth moving to Next; "Get it ready to start" = find what would stop the card from starting well, fix in the note what you can work out yourself, turn what only the owner knows into at most 3 short questions with a proposed answer each, set a Done when and a concrete next_step that fits one sitting, then say either ready to Start or what is missing; "What comes next?" = sum up what was done and suggest a follow-up card or a routine, without creating it; any other action is a request about that note: read the note and answer it.'

// One request on one line: the request, what to do, and how to mark it running and done.
export function requestLine(r, dir = scriptsDir) {
  return 'MAYBEE REQUEST ' + JSON.stringify(r) + ' | ' + showWork(dir) + ' ' + ACTIONS + ' First: ' + status(dir) + ' start ' + r.id + ' . When done: ' + reply(dir) + ' ' + r.id + ' "short reply" (the app renders Markdown: short paragraphs, a list for several points, **bold** for the one thing to notice, no wall of text)'
}

// Several requests at once: the instructions once, after the requests.
export function batchInstructions(dir = scriptsDir) {
  return [
    showWork(dir),
    ACTIONS,
    'Before each one: ' + status(dir) + ' start <id> (the app shows it as running). When done: ' + reply(dir) + ' <id> "short reply"',
    'Every line you add to logs/CHANGELOG.md has the local date and the time: - YYYY-MM-DD HH:MM: what changed (ideas/Card title.md). The app shows the time in each card\'s Changes tab.',
    'Running a routine on your own (from the chat)? ' + status(dir) + ' start --path "<note path>" first, then reply.js <id> when done.',
  ]
}
