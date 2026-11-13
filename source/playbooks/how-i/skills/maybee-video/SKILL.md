---
name: maybee-video
description: Writes the script and makes a ready thumbnail for a video from a post and the project's numbers, and builds an HTML slide deck the owner moves with the arrow keys while sharing their screen (text slides alternating with big lines and number cards, nothing on screen meant only for them). Flows between the topic, the project's progress and back to the topic, built to keep people watching. Use when the owner asks for today's video, the video script, the recording page, or to turn a post into a video ("o vídeo de hoje", "o roteiro do vídeo").
---

# maybee-video

Turns a post into a spoken video of about 8–12 minutes, as slides the owner reads from while sharing their screen. Rules: the owner's voice (`owner/voice.md`, *In force*), the project's writing rules, and the project's video rules and look (`PROJECT.md` says where; the look is `knowledge/brand.json`). Never invent facts.

## Inputs

- The post, its review notes and its idea note
- Today's numbers and the previous ones (for the change), if the project keeps them
- What happened since the last video: replies, story bank, new people (first names only if they agreed to be named; otherwise "a member")
- The owner's voice and preferences (*In force* blocks)

## Structure (about 10 minutes, ~1,300–1,600 spoken words)

| Time | Block | What it does |
|---|---|---|
| 0:00–0:20 | **Hook** | The post's tension in one or two lines, and what the viewer gets by staying |
| 0:20–1:00 | **Where I am** | What I'm building, day or week N; one number; one open loop ("one number this week surprised me, I'll come back to it") |
| 1:00–5:30 | **The topic** | The post's story told out loud in 3 beats, with more detail; a re-hook between beats (a question, a turn, "here's where it went wrong") |
| 5:30–8:00 | **The progress** | The numbers in detail, what changed, what people are doing; tied back to the topic |
| 8:00–9:30 | **Payoff** | The lesson, and close the open loop |
| 9:30–10:30 | **Close** | One easy question for the comments; one call to action |

Rules:
- **A viewer's first video:** a longer *Where I am*: the challenge, what I'm doing, since when. Still one topic.
- **Run the four passes** of `system/writing-style.md` on the script before showing it. Big-line slides are layout, but still no reveal bridges, "not X, it's Y", question-then-answer or one-word answers. Never add reactions or opinions the owner didn't give.
- **Spoken, not read:** short sentences, "I", contractions, one idea per sentence. No cues on the slides; the owner comments freely around the text.
- **1–2 open loops at most**, always closed. A change (question, screen, number) every 1–3 minutes.
- **The progress is proof of the topic, not a break.** Every number connects to the lesson.
- **Outside the project the viewer has no context:** name things the way a stranger understands them.
- Only real facts and numbers, with the date; nothing about people that they didn't make public.

## The page: slides

The page is a **slide deck** made for the viewer: no instructions, no cues, no time marks. Arrow keys, space or a click move; the URL keeps the slide number (`#12`).

- **Alternate:** text slides with a paragraph or two, and short slides with one strong line in large type (the turns). Numbers get their own slides as big cards, previous → now.
- **Order:** title → hook → where I am → numbers → topic (with big-line turns) → progress → payoff → question → end slide.
- **Real images where the script talks about them:** before/after, screenshots of real results and of what the script mentions. Take screenshots with the browser tool, save them under the project's images folder for that date, crop to the part that matters (`crop` with `w`, `h`, `top`, `bottom`, `left`, `right`) and check the rendered slide. Paths relative to the deck's folder; a caption with the date when it's not today. No private messages or details.
- **Photos of the owner:** real ones, or prompts for the owner to generate with AI (the project's video rules say how).
- **Build:** write the video's content file (`<video folder>/content/YYYY-MM-DD - Title.py` with `TITLE`, `slides` and `DESCRIPTION`; copy the previous one; kinds: `title`, `text`, `big`, `list`, `numbers`, `image`, `compare`, `crop`, `end`), then run `python3 system/skills/maybee-video/make_slides.py "<content file>" "<video folder>/YYYY-MM-DD - Title.html"`. The video description and pinned comment go in an HTML comment (not shown) and in the idea note.
- Obsidian hides `.html` files unless "Detect all file extensions" is on; open the deck in the browser.

## Thumbnail

1280 × 720 PNG: a photo plus 2–4 words, in the project's look.

1. **Text:** as the project's video rules say; the last words of the big text in the accent color (`<em>`).
2. **Photo:** a real photo, or a prompt for the owner to generate: a clear expression that matches the text, **empty space on one side** for the text, **no text in the image** (the text is added by code so it stays sharp).
3. **Build:** `python3 system/skills/maybee-video/make_thumb.py PHOTO "<video folder>/YYYY-MM-DD - Title.png" "Big <em>text</em>" "small line" --side left --focus 30% [--mark top --eyebrow "…" --size 80]`. Check: the text must not cover the face and must read at phone size.
4. Save it next to the deck; options in the images folder for that date.

## After

- Add the video to `<video folder>/videos.json` (date, title, description, thumbnail, link once published) and run `python3 system/skills/maybee-video/make_index.py`: it rebuilds the series index page with every thumbnail embedded, one file ready to upload anywhere.
- Link the deck from the idea note and from the publishing routine's log.
- Log it in `logs/CHANGELOG.md`; when the video is published, add its link to the deck, the idea note and the publishing log.

The video folder and the look come from `knowledge/brand.json` (`video_dir`, `colors`, `mark`, `series`).
