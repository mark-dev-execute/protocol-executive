#!/usr/bin/env python3
"""Static site builder for Protocol.

    python3 build.py

Page content lives in src/pages/, shared snippets in src/partials/, client
reviews in src/reviews.json, and site-wide settings in SITE below. Every build
overwrites the generated files (index.html, */index.html, 404.html,
sitemap.xml, robots.txt and the redirect stubs), so edit the sources, not the
output. No dependencies beyond Python 3.8+.
"""
import datetime
import hashlib
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"

SITE = {
    # Path prefix the site is served under: "/protocol-executive" on GitHub
    # Pages. Set to "" (and update "origin") when moving to a custom domain.
    "base": "/protocol-executive",
    "origin": "https://mark-dev-execute.github.io",
    "name": "Protocol",
    "email": "mark.parfenov@gmail.com",
    "linkedin": "https://www.linkedin.com/in/parfenov-mark/",
    "preply": "https://preply.com/en/tutor/4745825",
    "calendar": "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2eS5Lf6RGvLqM1pWFJ0GsXA_FqX1tS_AikzrszcPdrp7m0Z0qSzaYY6Ge5_8584UGuAfR-041o?gv=true",
    "video_id": "eWnjK1nXoSw",
    "video_embed": "https://www.youtube.com/embed/eWnjK1nXoSw?si=3QB_lXE4hLbpUrE2",
    # Local cover image, so no request goes to YouTube until the visitor presses play.
    "video_thumbnail": "thumbnail.jpg",
    "og_image": "assets/og-protocol.jpg",
    # Google Analytics 4 measurement ID, e.g. "G-XXXXXXXXXX". Empty = no analytics.
    "ga_id": "",
}

NAV = [
    ("interview", "Interview", "interview-coaching/"),
    ("communication", "Communication", "professional-communication/"),
    ("leadership", "Leadership", "leadership-coaching/"),
    ("corporate", "Corporate", "corporate/"),
    ("guides", "Guides", "guides/"),
    ("about", "About", "about/"),
]

FOOTER = [
    ("Coaching", [
        ("Interview coaching", "interview-coaching/"),
        ("Tech interview coaching", "tech-interview-coaching/"),
        ("Career coaching", "career-coaching/"),
        ("Professional communication", "professional-communication/"),
        ("Business English", "business-english/"),
        ("Leadership coaching", "leadership-coaching/"),
        ("Executive coaching", "executive-coaching/"),
    ]),
    ("Protocol", [
        ("About Mark", "about/"),
        ("Client results", "results/"),
        ("Guides", "guides/"),
        ("Corporate programs", "corporate/"),
        ("Contact", "contact/"),
        ("Book a free call", "book/"),
    ]),
]

# Old campaign URLs that still receive traffic -> current pages.
REDIRECTS = {
    "interview-prep.html": "interview-coaching/",
    "par-toolkit.html": "interview-coaching/",
    "executive-presence.html": "executive-coaching/",
    "corporate-training.html": "corporate/",
    "syllabus.html": "professional-communication/",
}

YEAR = datetime.date.today().year
esc = html.escape


def asset_version(name):
    return hashlib.sha1((ROOT / name).read_bytes()).hexdigest()[:8]


def url(path=""):
    """Site-relative URL for a route such as "book/" or "" (home)."""
    return f"{SITE['base']}/{path}"


def absolute(path=""):
    return SITE["origin"] + url(path)


def parse_page(path):
    text = path.read_text(encoding="utf-8")
    match = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not match:
        sys.exit(f"{path}: missing front matter")
    meta = {}
    for line in match.group(1).splitlines():
        if line.strip():
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip()
    for key in ("path", "title", "description"):
        if key not in meta:
            sys.exit(f"{path}: front matter needs '{key}'")
    meta["path"] = "" if meta["path"] == "/" else meta["path"]
    return meta, text[match.end():]


def video_html():
    vid = SITE["video_id"]
    return (
        '<div class="hero-video">'
        f'<a class="video-embed video-facade" href="https://www.youtube.com/watch?v={vid}" '
        f'data-video="{esc(SITE["video_embed"])}" aria-label="Play video: an introduction from Mark">'
        f'<img src="{url(SITE["video_thumbnail"])}" alt="" width="1024" height="576">'
        '<span class="play" aria-hidden="true"></span></a></div>'
    )


def reviews_html(names, reviews):
    items = []
    for name in names:
        review = reviews[name]
        source = f"Five-star review on {review['platform']}" if review.get("platform") else "Five-star review"
        items.append(
            '<blockquote class="quote">'
            '<div class="stars" role="img" aria-label="5 out of 5 stars">★★★★★</div>'
            f'<p>“{esc(review["text"])}”</p>'
            f'<footer><b>{esc(review["name"])}</b>{esc(review["role"])} · {source}</footer>'
            '</blockquote>'
        )
    return f'<div class="testimonials">{"".join(items)}</div>'


def expand(body, source):
    reviews = json.loads((SRC / "reviews.json").read_text(encoding="utf-8"))

    def partial(match):
        path = SRC / "partials" / f"{match.group(1)}.html"
        if not path.exists():
            sys.exit(f"{source}: unknown partial '{match.group(1)}'")
        return path.read_text(encoding="utf-8").strip()

    for _ in range(3):  # partials may include partials
        body = re.sub(r"\{\{>\s*([\w-]+)\s*\}\}", partial, body)

    tokens = {
        "base": SITE["base"],
        "calendar": esc(SITE["calendar"]),
        "email": SITE["email"],
        "linkedin": SITE["linkedin"],
        "preply": SITE["preply"],
        "video": video_html(),
        "year": str(YEAR),
    }

    def token(match):
        name, arg = match.group(1), match.group(2)
        if name == "reviews":
            return reviews_html([n.strip() for n in arg.split(",")], reviews)
        if name not in tokens:
            sys.exit(f"{source}: unknown token '{{{{{name}}}}}'")
        return tokens[name]

    return re.sub(r"\{\{\s*(\w+)(?::([^}]*))?\s*\}\}", token, body)


def faq_entries(body):
    entries = []
    for q, a in re.findall(r'<details class="faq-item"><summary>(.*?)</summary>\s*<div class="faq-a">(.*?)</div>\s*</details>', body, re.S):
        clean = lambda s: html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s))).strip()
        entries.append({"@type": "Question", "name": clean(q),
                        "acceptedAnswer": {"@type": "Answer", "text": clean(a)}})
    return entries


def structured_data(meta, body):
    org_id = absolute() + "#protocol"
    graph = [{
        "@type": "ProfessionalService",
        "@id": org_id,
        "name": SITE["name"],
        "url": absolute(),
        "email": SITE["email"],
        "image": absolute(SITE["og_image"]),
        "description": "Career, communication and leadership coaching for technology professionals.",
        "founder": {"@type": "Person", "name": "Mark Parfenov", "sameAs": [SITE["linkedin"], SITE["preply"]]},
        "sameAs": [SITE["linkedin"], SITE["preply"]],
    }]
    if "offer" in meta:
        name, price = [part.strip() for part in meta["offer"].split("|")]
        graph.append({
            "@type": "Service",
            "name": name,
            "serviceType": name,
            "provider": {"@id": org_id},
            "url": absolute(meta["path"]),
            "offers": {"@type": "Offer", "price": price, "priceCurrency": "USD",
                       "priceSpecification": {"@type": "UnitPriceSpecification", "price": price,
                                              "priceCurrency": "USD", "unitText": "hour"}},
        })
    if meta.get("schema") == "article":
        graph.append({
            "@type": "Article",
            "headline": meta.get("headline", meta["title"]),
            "description": meta["description"],
            "datePublished": meta["published"],
            "image": absolute(SITE["og_image"]),
            "url": absolute(meta["path"]),
            "publisher": {"@id": org_id},
            "inLanguage": "en",
        })
    faqs = faq_entries(body)
    if faqs:
        graph.append({"@type": "FAQPage", "mainEntity": faqs})
    data = {"@context": "https://schema.org", "@graph": graph}
    return f'<script type="application/ld+json">{json.dumps(data, ensure_ascii=False)}</script>'


def cta_link(meta, css, track):
    label = meta.get("cta", "Book a free call")
    href = meta.get("cta_href", "book/")
    if href == "calendar":
        return (f'<a class="{css}" href="{esc(SITE["calendar"])}" target="_blank" rel="noopener" '
                f'data-track="{track}">{esc(label)}</a>')
    return f'<a class="{css}" href="{url(href)}" data-track="{track}">{esc(label)}</a>'


def render(meta, body, versions):
    path = meta["path"]
    canonical = absolute(path)
    og_image = absolute(SITE["og_image"])
    sticky = meta.get("sticky", "yes") != "no"
    robots = f'<meta name="robots" content="{meta["robots"]}">' if "robots" in meta else ""
    analytics = ""
    if SITE["ga_id"]:
        analytics = (f'<script async src="https://www.googletagmanager.com/gtag/js?id={SITE["ga_id"]}"></script>'
                     "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}"
                     f"gtag('js',new Date());gtag('config','{SITE['ga_id']}');</script>")

    current = ' aria-current="page"'
    nav_links = "".join(
        f'<a href="{url(href)}"{current if meta.get("nav") == key else ""}>{label}</a>'
        for key, label, href in NAV
    )
    footer_cols = "".join(
        f'<nav aria-label="{title}"><p class="footer-title">{title}</p><ul>'
        + "".join(f'<li><a href="{url(href)}">{label}</a></li>' for label, href in links)
        + "</ul></nav>"
        for title, links in FOOTER
    )

    return f"""<!doctype html>
<!-- Generated by build.py from src/pages/. Edit the source, not this file. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(meta["title"])}</title>
<meta name="description" content="{esc(meta["description"])}">
{robots}<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{SITE["name"]}">
<meta property="og:title" content="{esc(meta.get("og_title", meta["title"]))}">
<meta property="og:description" content="{esc(meta["description"])}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0b1220">
<link rel="icon" href="{url("assets/favicon.svg")}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;500;600;700;800&amp;display=swap">
<link rel="stylesheet" href="{url("styles.css")}?v={versions["styles.css"]}">
{structured_data(meta, body)}
{analytics}<script src="{url("app.js")}?v={versions["app.js"]}" defer></script>
</head>
<body{' class="has-sticky"' if sticky else ""}>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<nav class="nav wrap" aria-label="Main">
<a class="brand" href="{url()}"><span class="brand-mark" aria-hidden="true">P</span>Protocol</a>
<button class="menu" type="button" aria-expanded="false" aria-controls="nav-links" data-menu><span class="visually-hidden">Menu</span><span aria-hidden="true">☰</span></button>
<div class="nav-links" id="nav-links">{nav_links}{cta_link(meta, "btn btn-primary nav-cta", "header-cta")}</div>
</nav>
</header>
<main id="main">
{body.strip()}
</main>
<footer class="footer">
<div class="wrap footer-grid">
<div class="footer-brand"><a class="brand" href="{url()}"><span class="brand-mark" aria-hidden="true">P</span>Protocol</a>
<p>Career, communication and leadership coaching for technology professionals.</p>
<p><a href="mailto:{SITE["email"]}">{SITE["email"]}</a></p></div>
{footer_cols}
<nav aria-label="Elsewhere"><p class="footer-title">Elsewhere</p><ul><li><a href="{SITE["linkedin"]}" target="_blank" rel="noopener">LinkedIn</a></li><li><a href="{SITE["preply"]}" target="_blank" rel="noopener">Reviews on Preply</a></li></ul></nav>
</div>
<div class="wrap footer-base"><p>© {YEAR} Protocol · Mark Parfenov</p></div>
</footer>
{cta_link(meta, "sticky-cta btn btn-primary", "sticky-cta") if sticky else ""}
</body>
</html>
"""


def redirect_stub(target):
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Redirecting…</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url={url(target)}">
<link rel="canonical" href="{absolute(target)}"></head>
<body><p><a href="{url(target)}">Continue to the new page</a></p></body></html>
"""


def output_path(route):
    if route.endswith(".html"):
        return ROOT / route
    return ROOT / route / "index.html"


def check_links(pages):
    """Fail the build if an internal link or asset points at a missing file."""
    missing = []
    for out, content in pages.items():
        for ref in re.findall(r'(?:href|src)="(' + re.escape(SITE["base"]) + r'/[^"#?]*)', content):
            rel = ref[len(SITE["base"]) + 1:]
            target = ROOT / rel / "index.html" if rel == "" or rel.endswith("/") else ROOT / rel
            if not target.exists():
                missing.append(f"{out.relative_to(ROOT)} -> {ref}")
    if missing:
        sys.exit("Broken internal links:\n  " + "\n  ".join(sorted(set(missing))))


def main():
    versions = {name: asset_version(name) for name in ("styles.css", "app.js")}
    written = {}
    sitemap = []
    for source in sorted((SRC / "pages").glob("*.html")):
        meta, body = parse_page(source)
        body = expand(body, source)
        out = output_path(meta["path"])
        out.parent.mkdir(parents=True, exist_ok=True)
        content = render(meta, body, versions)
        out.write_text(content, encoding="utf-8")
        written[out] = content
        if meta.get("sitemap", "yes") != "no":
            sitemap.append(absolute(meta["path"]))

    for old, new in REDIRECTS.items():
        (ROOT / old).write_text(redirect_stub(new), encoding="utf-8")

    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{loc}</loc></url>\n" for loc in sitemap)
        + "</urlset>\n", encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {absolute('sitemap.xml')}\n", encoding="utf-8")

    check_links(written)
    print(f"Built {len(written)} pages, {len(REDIRECTS)} redirects, sitemap with {len(sitemap)} URLs.")


if __name__ == "__main__":
    main()
