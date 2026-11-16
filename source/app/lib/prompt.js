// The instructions an agent follows for a Maybee request. They are the same for every agent (Claude Code, Codex, ...):
// the listener adds them to what it prints, or passes them to the agent it starts. No agent is named here.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The About chat is not about one file: it asks to change the project's foundations by words.
export const ABOUT_SCOPE = '@about'
export const ABOUT_RULES = 'This is a request to change the project, from the About page. Find the right file among PROJECT.md, STATE.md, knowledge/audience, knowledge/offer, knowledge/brand (voice included), the other notes in knowledge/ and decisions/ (read them first), make the change straight away, keep the file\'s language and format, and add a line to logs/CHANGELOG.md. A change to a decision is a new dated file in decisions/, not an overwrite. If it is not clear which file, or the request is about the app\'s own settings, ask in the reply instead of guessing. Anything that goes outside the project waits for the owner\'s OK. In the reply say which file changed and what the new line says, and end the reply.js call with --changed followed by every file you changed, as paths inside the workspace, for example: --changed knowledge/brand/voice.md PROJECT.md (the About page marks those files as updated).'

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts')
const status = dir => 'node "' + path.join(dir, 'status.js') + '"'
const reply = dir => 'node "' + path.join(dir, 'reply.js') + '"'

// What to do for each kind of request, in one paragraph. Shared by the one-line and the multi-line forms.
export const ACTIONS = 'Do: "Do the next step" = the note\'s next_step, then write the following next_step. "Work on this now" (the Start button) = the same, and when next_step is empty, read the note, pick the first concrete step yourself, do it, then write the following next_step; "Run routine" = the routine the note describes, set last_done to today, anything external is drafted and waits for the owner\'s OK; a request whose path is "@about" is not about a note: ' + ABOUT_RULES + ' ; any other action (Help me explore this idea, Look for gaps in this, ...) is a request about that note: read the note and answer it.'

// One request on one line: the request, what to do, and how to mark it running and done.
export function requestLine(r, dir = scriptsDir) {
  return 'MAYBEE REQUEST ' + JSON.stringify(r) + ' | ' + ACTIONS + ' First: ' + status(dir) + ' start ' + r.id + ' . When done: ' + reply(dir) + ' ' + r.id + ' "short reply" (the app renders Markdown: short paragraphs, a list for several points, **bold** for the one thing to notice, no wall of text)'
}

// Several requests at once: the instructions once, after the requests.
export function batchInstructions(dir = scriptsDir) {
  return [
    '"Do the next step" / "Work on this now" = do what the note\'s next_step field says, then write the following next_step in the note. "Work on this now" (the Start button) is the same, and when next_step is empty you read the note, pick the first concrete step yourself, do it, and write the following next_step. Either way, anything external is drafted and waits for the owner\'s OK.',
    '"Run routine" = do the routine that note describes (its skill, if it names one) for today, set last_done to today in the note when done; anything that goes outside (DMs, posts, comments) is drafted and waits for the owner\'s OK in the chat (D241).',
    'Before each one: ' + status(dir) + ' start <id> (the app shows it as running). When done: ' + reply(dir) + ' <id> "short reply"',
    'Running a routine on your own (from the chat)? ' + status(dir) + ' start --path "<note path>" first, then reply.js <id> when done.',
  ]
}
