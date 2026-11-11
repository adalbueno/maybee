---
name: maybee-ads
description: "Writes and makes paid-ad creatives (Meta: Instagram and Facebook) for the project's offer, and keeps the test running: picks angles, writes the image line, ad text, headline and description in the project's ad rules, renders single images (and briefs videos) inside the placement's safe area, checks them, sets up a small test with the owner's OK, and reads the results to decide the next round. Use when the owner asks for ads, ad creatives, ad copy, a new ad test, which ad is winning, or what to make next (\"faz os criativos\", \"escreve os anúncios\", \"qual anúncio ganhou?\", \"próximo teste\")."
---

# maybee-ads

Ads that look like the project and follow what is proven: one idea per ad set, a few creatives per idea, open targeting, decide after 5-7 days, iterate on the winner. The project files say **what** (offer, audience, budget, accounts, the ad rules, past tests); this skill says **how**. In How I: the ads idea note, `outputs/ads/meta/` (`Ad creative rules.md`, `Ad Library research.md`, one folder per test with its campaign file and render scripts), the lessons file.

## Before writing

1. Read the project's ad rules file, the last test's results and the lessons. Don't propose an angle a past test already lost with.
2. Know: the offer and price, the destination page (read it: the ad must say what the page says), the budget, what can be measured (pixel or not), the placements.
3. If the destination can't report signups to the ad platform, the test judges **ads** (cost per landing page view, CTR, which ad gets the spend), not cost per member. Say so to the owner.

## Write

1. **Angles first.** Pick 2-3 angles for the test (pain, identity call-out, outcome, value-first such as a ready AI prompt, contrarian). One angle = one ad set. Within an ad set, vary the hook and the format, never just the wording.
2. **Image line:** one big sentence the reader gets in a second; at most one short line under it. Nothing small (no eyebrows, page numbers, code blocks). Call out who it's for in the first words when the angle is identity.
3. **Ad text:** the hook in the first ~125 characters; value before the ask; the price and trial said plainly; real facts only (the project's records), no invented numbers or quotes. For an offer ad, use the template in the rules file (for whom → why alone fails → "Inside… members get:" ✅ ×5 → "Stop… Start…").
4. **Headline** ≤40 characters, **description** ≤30. Each must make sense with any image (the platform mixes them).
5. Run the writing checks in the rules file (no "It's not X, it's Y", no colon reveals, no "Stop scrolling", no em dashes, no all caps).

## Make

1. **Format:** start with single images (quickest to make and to change). Add a 9:16 video for Reels/Stories when one fits the angle. Carousels only when the idea needs steps, with one big line per slide. With a small budget, test format inside the same angle (one image + one video), so the test shows which format the audience prefers; record the answer as a lesson.
2. **Safe area:** 4:5 (1080×1350) for Feed and Explore, text inside ~84px margins; 9:16 (1080×1920) for Reels and Stories, text inside y 270-1250 and x 65-1015. Check the numbers in the rules file and in the Ads Manager preview.
3. **Look:** the project's brand (the avatar or the owner's photo, the same colours and boxes as the organic posts). Ask the owner for photos when a real one would do better (face to camera, at work, with the product on screen); say which and why.
4. Render with a script in the test's folder (HTML → PNG with headless chromium), never by hand, so a change is one edit. Make a preview sheet and show it.

## Check

Before showing the owner: read every line at phone size (preview scaled to ~400px wide); text off the face; nothing in an unsafe area; ad text and page say the same thing; every fact traced. Then show the preview, the texts and the setup, and wait for the owner's OK on each.

## Launch and read (with the owner's OK every time)

1. Build the campaign **paused** in Ads Manager (browser), with the settings in the test's campaign file; the owner turns it on. Spending money, budget changes and turning ads on are always the owner's call.
2. Daily while it runs: spend, landing page views, cost per view, CTR per ad; log them in the test file. Don't change anything for 5-7 days unless something is broken or rejected.
3. At the end: name the winner (most spend + best cost per result), write what it teaches as a lesson, and propose the next round: 3 variations of the winner as a new ad set, or a new angle.

## Never

- Launch, turn on, or change a budget without the owner's OK for that action.
- Invent results, testimonials or numbers; promise what the page doesn't deliver.
- Put small text in an ad, or text in a placement's unsafe area.
