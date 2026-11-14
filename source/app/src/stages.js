// What you can do with a card depends on where it is. Shared by the board, the note's top bar and the note chat.
// `primary` is the natural next move; the others are a step back or aside.
export const MOVES = {
  maybe: [{ to: 'next', label: 'Do it next', primary: true }, { to: 'not', label: 'Not now' }],
  next: [{ to: 'now', label: 'Start now', primary: true }, { to: 'maybe', label: 'Back to Maybe' }, { to: 'not', label: 'Not now' }],
  now: [{ to: 'done', label: 'Mark done', primary: true }, { to: 'next', label: 'Back to Next' }, { to: 'not', label: 'Not now' }],
  done: [{ to: 'now', label: 'Reopen' }],
  not: [{ to: 'maybe', label: 'Back to Maybe' }],
}
export const movesFor = stage => MOVES[stage] || MOVES.maybe

// Quick asks for the AI, by column: explore in Maybe, test and refine in Next, carry out in Now.
// "Do the next step" is one the bridge knows by name; the others are plain requests about the note.
export const QUICK = {
  maybe: ['Help me explore this idea', 'Who is this for, and why now?', 'What is the smallest first step?'],
  next: ['Look for gaps in this', 'Help me refine this', 'Is this ready to start?'],
  now: ['Do the next step', 'What is blocking this?', 'What should the next step be?'],
  done: ['Summarize what was done', 'What should come next?'],
  not: ['Why did I say no to this?', 'Should I reconsider this?'],
}
export const GENERIC_QUICK = ['Review this', 'What should change here?']
export const quickFor = stage => QUICK[stage] || GENERIC_QUICK
