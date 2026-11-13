"""The project's look for videos: read from knowledge/brand.json (neutral defaults if missing)."""
import html
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DEFAULTS = {
    "mark": "",
    "mark_suffix": "",
    "colors": {"bg": "#1E1E1E", "ink": "#F5F5F5", "muted": "#BDBDBD", "accent": "#F0B35E", "card": "#2A2A2A", "line": "#444444"},
    "video_dir": "outputs/video",
    "community_url": "",
    "series": {"page_title": "Videos", "meta_description": "", "eyebrow": "", "title": "Videos", "lead": "", "cta": "", "footer": "", "join": ""},
}


def load():
    path = os.path.join(ROOT, "knowledge", "brand.json")
    data = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    out = dict(DEFAULTS)
    out.update({k: v for k, v in data.items() if not k.startswith("_")})
    out["colors"] = dict(DEFAULTS["colors"], **data.get("colors", {}))
    out["series"] = dict(DEFAULTS["series"], **data.get("series", {}))
    return out


B = load()


def css_vars():
    return ";".join("--%s:%s" % (k, v) for k, v in B["colors"].items())


def mark_html():
    if not B["mark"]:
        return ""
    return '<div class="mark">%s<span>%s</span></div>' % (html.escape(B["mark"]), html.escape(B["mark_suffix"]))
