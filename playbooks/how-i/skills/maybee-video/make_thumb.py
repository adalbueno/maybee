"""YouTube thumbnail (1280 x 720 PNG): the owner's photo + 2-4 words of text, in the project's look (knowledge/brand.json).

Usage:
  python3 make_thumb.py PHOTO OUT.png "BIG TEXT" ["small line"] [--side left|right] [--focus 50%]
      [--eyebrow "Build in public · Week 1"] [--mark top|bottom] [--size 80]   (the project mark on top or below; eyebrow; title size)

PHOTO: a generated image or a real photo. --side is where the text goes;
the photo is anchored to the other side. --focus is the photo's vertical focus
(CSS object-position y, e.g. 30% to keep a face that sits high).
Rendered with headless Chromium, so fonts and layout match the slides.
"""
import html, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brand import B, css_vars, mark_html

args = sys.argv[1:]
opts = {"--side": "left", "--focus": "40%", "--eyebrow": "", "--mark": "", "--size": "116"}
for k in list(opts):
    if k in args:
        i = args.index(k); opts[k] = args[i + 1]; del args[i:i + 2]
photo, out, big = args[0], args[1], args[2]
small = args[3] if len(args) > 3 else ""
side = opts["--side"]
photo_x = "100%" if side == "left" else "0%"
fade = "to right" if side == "left" else "to left"

page = f"""<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,800&family=Inter:wght@600&display=swap" rel="stylesheet">
<style>
:root{{{css_vars()}}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:1280px;height:720px;overflow:hidden;background:var(--bg);position:relative}}
img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:{photo_x} {opts["--focus"]};filter:saturate(.8) sepia(.12)}}
.fade{{position:absolute;inset:0;background:linear-gradient({fade},color-mix(in srgb,var(--bg) 96%,transparent) 0%,color-mix(in srgb,var(--bg) 85%,transparent) 38%,transparent 66%)}}
.txt{{position:absolute;top:0;bottom:0;{side}:0;width:56%;padding:0 64px;display:flex;flex-direction:column;justify-content:center;gap:22px;text-align:{side}}}
.eyebrow{{font-family:Inter,system-ui,sans-serif;font-weight:600;font-size:30px;color:var(--accent);letter-spacing:.14em;text-transform:uppercase}}
.mark{{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:40px;color:var(--ink)}}
.mark span{{color:var(--accent)}}
.big{{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:{opts["--size"]}px;line-height:.98;color:var(--ink);letter-spacing:-1px;text-shadow:0 4px 18px rgba(0,0,0,.45)}}
.big em{{font-style:normal;color:var(--accent)}}
.small{{font-family:Inter,system-ui,sans-serif;font-weight:600;font-size:34px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}}
</style></head><body>
<img src="file://{html.escape(os.path.abspath(photo))}"><div class="fade"></div>
<div class="txt">{mark_html() if opts["--mark"] == "top" else ''}{f'<div class="eyebrow">{html.escape(opts["--eyebrow"])}</div>' if opts["--eyebrow"] else ''}<div class="big">{big}</div>{f'<div class="small">{html.escape(small)}</div>' if small else ''}{mark_html() if opts["--mark"] and opts["--mark"] != "top" else ''}</div>
</body></html>"""

with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
    f.write(page)
subprocess.run(["chromium", "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                "--virtual-time-budget=8000", "--window-size=1280,720", f"--screenshot={os.path.abspath(out)}", f"file://{f.name}"],
               check=True, capture_output=True)
os.unlink(f.name)
print(out)
