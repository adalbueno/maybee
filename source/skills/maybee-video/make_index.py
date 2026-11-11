"""Series index page: every video with its thumbnail, as one self-contained HTML file.

Usage: python3 system/skills/maybee-video/make_index.py
Reads videos.json in the project's video folder (knowledge/brand.json: video_dir;
one entry per video: date, title, description, thumbnail path relative to that
folder, youtube link once published) and writes index.html there with the thumbnails embedded, so the file can be uploaded
to any site as it is.
"""
import base64, datetime, html, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brand import B, ROOT as PROJECT, css_vars, mark_html

ROOT = os.path.join(PROJECT, B["video_dir"])
COMMUNITY = B["community_url"]
S = B["series"]
videos = json.load(open(os.path.join(ROOT, "videos.json")))


def thumb(path):
    src = os.path.normpath(os.path.join(ROOT, path))
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        out = f.name
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vf", "scale=960:-1", "-q:v", "4", out], check=True)
    data = base64.b64encode(open(out, "rb").read()).decode()
    os.unlink(out)
    return "data:image/jpeg;base64," + data


def esc(s):
    return html.escape(s)


cards = []
for n, v in enumerate(videos, 1):
    d = datetime.date.fromisoformat(v["date"])
    when = d.strftime("%B %-d, %Y")
    link = v.get("youtube")
    img = f'<img src="{thumb(v["thumbnail"])}" alt="{esc(v["title"])}" loading="lazy">'
    media = f'<a href="{esc(link)}" target="_blank" rel="noopener">{img}</a>' if link else img
    status = f'<a class="watch" href="{esc(link)}" target="_blank" rel="noopener">Watch on YouTube →</a>' if link else '<span class="soon">Coming soon</span>'
    cards.append(f"""<article class="ep">
  <div class="media">{media}</div>
  <div class="body">
    <div class="meta">Episode {n} · {when}</div>
    <h2>{esc(v["title"])}</h2>
    <p>{esc(v["description"])}</p>
    {status}
  </div>
</article>""")

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(S["page_title"])}</title>
<meta name="description" content="{esc(S["meta_description"])}">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{{{css_vars()}}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;line-height:1.5}}
.wrap{{max-width:1040px;margin:0 auto;padding:56px 16px 72px}}
.mark{{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:28px}}
.mark span{{color:var(--accent)}}
.eyebrow{{margin-top:28px;color:var(--accent);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:14px}}
h1{{font-family:Fraunces,Georgia,serif;font-weight:800;font-size:clamp(34px,6vw,60px);line-height:1.04;margin-top:10px;max-width:18ch}}
.lead{{color:var(--muted);font-size:clamp(17px,2vw,20px);margin-top:16px;max-width:60ch}}
.cta{{display:inline-block;margin-top:24px;background:var(--accent);color:var(--bg);font-weight:600;padding:12px 20px;border-radius:999px;text-decoration:none}}
.list{{display:flex;flex-direction:column;gap:20px;margin-top:48px}}
.ep{{display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:24px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:16px;align-items:center}}
.media img{{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px}}
.meta{{color:var(--accent);font-weight:600;font-size:13px;letter-spacing:.08em;text-transform:uppercase}}
h2{{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(21px,2.4vw,26px);line-height:1.15;margin-top:6px}}
.body p{{color:var(--muted);margin-top:8px}}
.watch{{display:inline-block;margin-top:12px;color:var(--accent);font-weight:600;text-decoration:none}}
.soon{{display:inline-block;margin-top:12px;color:var(--muted);font-size:14px;border:1px solid var(--line);border-radius:999px;padding:4px 12px}}
footer{{margin-top:56px;color:var(--muted);font-size:15px}}
footer a{{color:var(--accent)}}
@media (max-width:720px){{.ep{{grid-template-columns:1fr;gap:14px}}}}
</style>
</head>
<body>
<div class="wrap">
  {mark_html()}
  <div class="eyebrow">{esc(S["eyebrow"])}</div>
  <h1>{esc(S["title"])}</h1>
  <p class="lead">{esc(S["lead"])}</p>
  <a class="cta" href="{esc(COMMUNITY)}" target="_blank" rel="noopener">{esc(S["cta"])}</a>
  <section class="list">
{chr(10).join(cards)}
  </section>
  <footer>{esc(S["footer"])} <a href="{esc(COMMUNITY)}" target="_blank" rel="noopener">{esc(S["join"])}</a></footer>
</div>
</body>
</html>
"""
out = os.path.join(ROOT, "index.html")
open(out, "w").write(page)
print(os.path.normpath(out), len(videos), "videos")
