import html, sys, json
from brand import css_vars, mark_html

"""Builds a video slide deck.

Usage: python3 make_slides.py CONTENT.py OUT.html
CONTENT.py defines TITLE, slides (list of (kind, data)) and DESCRIPTION;
one file per video in outputs/video/content/.
"""
CONTENT, OUT = sys.argv[1], sys.argv[2]
ns = {}
exec(open(CONTENT).read(), ns)
TITLE, slides, DESCRIPTION = ns["TITLE"], ns["slides"], ns["DESCRIPTION"]


def esc(s):
    return html.escape(s, quote=False)


def render(kind, data):
    if kind == "title":
        return f'<div class="eyebrow">{esc(data["eyebrow"])}</div><h1>{esc(data["title"])}</h1>{mark_html()}'
    if kind == "text":
        return "".join(f"<p>{esc(x)}</p>" for x in data)
    if kind == "big":
        return "".join(f'<p class="big">{esc(x)}</p>' for x in data)
    if kind == "list":
        return '<ul>' + "".join(f"<li>{esc(x)}</li>" for x in data) + '</ul>'
    if kind == "numbers":
        cards = "".join(f'<div class="card"><div class="n">{esc(n)}</div><div class="l">{esc(l)}</div><div class="d">{esc(d)}</div></div>' for n, l, d in data)
        return f'<div class="cards c{len(data)}">{cards}</div>'
    if kind == "image":
        cap = f'<figcaption>{esc(data["caption"])}</figcaption>' if data.get("caption") else ""
        return f'<figure><img src="{esc(data["src"])}" alt="">{cap}</figure>'
    if kind == "compare":
        return '<div class="compare">' + "".join(f'<figure><img src="{esc(src)}" alt=""><figcaption>{esc(cap)}</figcaption></figure>' for src, cap in data) + '</div>'
    if kind == "crop":
        t, b = data["top"], data["bottom"]
        h = b - t
        W, H = data.get("w", 2778), data.get("h", 1604)
        x0, x1 = data.get("left", 0), data.get("right", 1)
        return (f'<figure><div class="crop" style="aspect-ratio:{int(W*(x1-x0))}/{int(H*h)};max-width:min(100%,{72*W*(x1-x0)/(H*h):.1f}vh)"><img src="{esc(data["src"])}" alt="" '
                f'style="top:-{t/h*100:.2f}%;height:{100/h:.2f}%;left:-{x0/(x1-x0)*100:.2f}%;width:{100/(x1-x0):.2f}%"></div><figcaption>{esc(data["caption"])}</figcaption></figure>')
    if kind == "end":
        return f'<p class="big">{esc(data["line1"])}</p><p class="sub">{esc(data["line2"])}</p><p class="big">{data["sign"]}</p>'


sections = "\n".join(f'<section class="slide k-{k}">{render(k, d)}</section>' for k, d in slides)

page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(TITLE)}</title>
<!-- Video description (not shown):
{esc(DESCRIPTION)}
-->
<style>
:root{{{css_vars()}}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{height:100%;background:var(--bg);color:var(--ink);overflow:hidden;font-family:Georgia,'Times New Roman',serif}}
.slide{{position:absolute;inset:0;display:none;flex-direction:column;justify-content:center;align-items:flex-start;padding:7vh 9vw;gap:3.2vh}}
.slide.on{{display:flex}}
p{{font-size:clamp(24px,3vw,44px);line-height:1.38;max-width:34ch}}
.k-text p+p{{color:var(--muted)}}
.k-text p:only-child{{font-size:clamp(30px,4.2vw,60px);max-width:24ch;color:var(--ink)}}
.big{{font-size:clamp(44px,8vw,120px);line-height:1.05;font-weight:700;color:var(--accent);max-width:20ch}}
.sub{{font-family:system-ui,sans-serif;font-size:clamp(20px,2.4vw,34px);color:var(--muted)}}
.eyebrow{{font-family:system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;font-size:clamp(16px,1.8vw,26px)}}
h1{{font-size:clamp(48px,7.5vw,112px);line-height:1.02;max-width:14ch}}
.mark{{font-size:clamp(22px,2.4vw,34px);font-weight:600}}
.mark span{{color:var(--accent)}}
ul{{list-style:none;display:flex;flex-direction:column;gap:2.4vh}}
li{{font-size:clamp(28px,4.4vw,60px);line-height:1.2;padding-left:1.1em;position:relative}}
li:before{{content:"";position:absolute;left:0;top:.45em;width:.42em;height:.42em;border-radius:50%;background:var(--accent)}}
.cards{{display:grid;gap:2.4vw;width:100%}}
.cards.c4{{grid-template-columns:repeat(2,1fr)}}
.cards.c2{{grid-template-columns:repeat(2,1fr)}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:3.2vh 2.4vw}}
.n{{font-size:clamp(44px,6.4vw,96px);font-weight:700;color:var(--accent);line-height:1}}
.l{{font-family:system-ui,sans-serif;font-size:clamp(18px,2vw,30px);margin-top:1.2vh}}
.d{{font-family:system-ui,sans-serif;font-size:clamp(14px,1.5vw,22px);color:var(--muted);margin-top:.6vh}}
figure{{width:100%;display:flex;flex-direction:column;align-items:center;gap:2vh}}
figure img{{max-width:100%;max-height:72vh;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.45)}}
figcaption{{font-family:system-ui,sans-serif;font-size:clamp(18px,2vw,30px);color:var(--muted)}}
.compare{{display:grid;grid-template-columns:1fr 1fr;gap:2.4vw;width:100%}}
.compare img{{max-height:60vh}}
.crop{{position:relative;width:100%;max-width:min(100%,130vh);overflow:hidden;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.45)}}
.crop img{{position:absolute;left:0;width:100%;max-width:none;max-height:none;border-radius:0;box-shadow:none}}
.slide.k-image,.slide.k-compare,.slide.k-crop{{align-items:center}}
#bar{{position:fixed;left:0;bottom:0;height:5px;background:var(--accent);transition:width .25s}}
</style>
</head>
<body>
{sections}
<div id="bar"></div>
<script>
const s=[...document.querySelectorAll('.slide')];let i=0;
function show(n){{i=Math.max(0,Math.min(s.length-1,n));s.forEach((e,k)=>e.classList.toggle('on',k===i));document.getElementById('bar').style.width=((i+1)/s.length*100)+'%';history.replaceState(null,'','#'+(i+1));}}
document.addEventListener('keydown',e=>{{if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(e.key)){{e.preventDefault();show(i+1)}}else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(e.key)){{e.preventDefault();show(i-1)}}else if(e.key==='Home')show(0);else if(e.key==='End')show(s.length-1);}});
document.addEventListener('click',e=>show(e.clientX>innerWidth/3?i+1:i-1));
let x0=null;document.addEventListener('touchstart',e=>x0=e.touches[0].clientX);document.addEventListener('touchend',e=>{{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40)show(dx<0?i+1:i-1);x0=null;}});
show((parseInt(location.hash.slice(1))||1)-1);
</script>
</body>
</html>
"""
open(OUT, "w").write(page)
print(len(slides))
