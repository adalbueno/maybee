---
name: maybee-shorts
description: Makes and posts short vertical videos (Reels, YouTube Shorts) with the owner's AI avatar and text boxes on top. Writes the copy (tangible, a scene you can picture), generates the clips itself in ElevenLabs when new ones are needed (and tells the owner, with the credits spent), burns the text and the series track on with a script, keeps the posting list, and posts one a day on YouTube and Instagram after the owner's OK. Use when the owner asks for more shorts, Reels or Shorts, new avatar videos, scene prompts, today's short, or to post the next one ("faz mais desses vídeos", "posta o short de hoje", "preciso de prompts").
---

# maybee-shorts

Short vertical videos in one recognisable format: the same AI avatar of the owner (same face, same signature item), a scene that shows what the hook says, the text in boxes on the lower part, the same music track. The project files say **what** (where the files live, the copy rules, the look, the accounts); this skill says **how**. In How I: `outputs/video/short/adal-avatar/` (`Shorts to post.md`, `Scene prompts.md`, `make_shorts.py`), the decision on the format and copy, and the lessons on copy (`knowledge/lessons.md`).

## The format (what made them work)

- **Avatar:** the owner, AI-generated from reference photos; the same signature item every time (cap, glasses…), clothes change with the scene.
- **Framing:** head at the very top (cap touching the top edge, eyes ~15% down), medium shot, body turned ~30°, head back to the lens; **no arm, hand or selfie stick** in the frame; the lower three quarters calm, for text.
- **Scene = the hook:** "Instead of watching Netflix tonight" → on the sofa with the TV; "before your coffee gets cold" → kitchen with a steaming mug.
- **Text:** one coloured hook box from the first frame, then one cream box per line, one per second; below the chin, never over the mouth; balanced line breaks.
- **Sound:** the series track, from 0:00, cut at the clip's end with a short fade.

## Copy rules (the owner's corrections)

1. **Tangible.** A concrete step, tool or thing to finish; numbered lists. Accountability rides on a concrete action ("send it to one friend; tomorrow they'll ask"), never the topic on its own.
2. **Scenic.** A moment you can picture: tonight, before coffee, on your commute, Sunday night.
3. **Day 1, Day 7**, never calendar dates.
4. **No results of the owner's own project** while they're small. Real facts only (story bank); made-up examples are said to be made up.
5. Patterns that work: list + promise · "Is this you?" · contrarian · tonight/before X · AI prompt ("paste this into Claude") · short true story without numbers.
6. Mostly jabs (teach); the invite is a right hook now and then, at the end.

## Steps

### A. New copies
1. Read the project's copy rules and the posting list. Write ideas as: hook / box / box… (in chat when the owner asks to see them; then in the scene prompts file).
2. Pair each copy with a scene. Reuse clips first: the clip library in the scene prompts file says which clip fits which copy; never the same clip two posts in a row.

### B. New clips → make them in ElevenLabs, tell the owner
When a copy needs a scene no clip has, or **when 3 or fewer drafts are left** in the posting list, generate the clips yourself in ElevenLabs (the project's decision on who makes clips; in How I, D237), then tell the owner what was made and the credits spent:
1. **First frame** (ElevenLabs image model, check `creative_get_flow_node_types` and the model guide): the base framing above + the owner's face reference photos (upload them to the flow) + the scene + outfit + mood. If the model centres the face: "zoom out, his head touching the top edge". One flow for the whole scene, so the frame feeds the video.
2. **Motion** (ElevenLabs video model, image-to-video from that frame, ~10 s, no speech): one small action that fits the scene, "mouth closed, he does not speak, no text".
3. Pick the best variation (face consistent, arm hidden, face high), download it.
Add the prompts used to the scene prompts file.

### C. Clips → videos
1. Save the clips into the project's `clips/` with a scene name (clips the owner downloads himself: usually `~/Downloads`; copy, don't delete or move the originals unless the owner says so).
2. Look at each clip (contact sheet: `ffmpeg -i clip.mp4 -vf "fps=0.4,scale=270:-1,tile=4x1" -frames:v 1 sheet.jpg`): face high? arm hidden? face consistent? where's the chin?
3. Add the short to the script (clip, text top in px below the chin, boxes) and run it. Check a frame at ~8 s: nothing over the mouth, nothing in the bottom ~250 px.
4. Add it to the posting list with its caption (same CTA rotation: comment → save → share → invite).

### D. Post one a day (routine)
1. Take the next draft in the posting list; show the owner the file and caption; post only after their OK for that post.
2. **Instagram** (check the logged-in account): Create → Post → upload; crop **Original**; caption; **AI label on** (check the switch is really on); not shared to Facebook; Share. Get the link from the profile's Reels tab.
3. **YouTube Studio** (check the channel): upload; title = the hook; description = the caption with "Link on the channel page." (Shorts descriptions don't have clickable links); **not made for kids**; "Mostrar mais" → **AI use = yes**; Public; Publish; copy the link.
4. Write date and both links in the posting list and the publishing log; mark the routine done.

## Never

- Post without the owner's OK for that post, or with the AI label off.
- Put the owner's project results or calendar dates in the copy while the rules say so.
- Invent facts in a "my story" short.
