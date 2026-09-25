#!/usr/bin/env python3
"""Static site builder for Fluent in Tech.

    python3 build.py

Page content lives in src/pages/, shared snippets in src/partials/, client
reviews in src/reviews.json, and site-wide settings in SITE below. Every build
overwrites the generated files, so edit the sources, not the output:

- public/      the site for Vercel at the custom domain (plus vercel.json)
- repo root    the GitHub Pages copy (index.html, */index.html, 404.html,
               sitemap.xml, robots.txt and redirect stubs for old URLs)

No dependencies beyond Python 3.8+.
"""
import datetime
import hashlib
import html
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"

SITE = {
    "name": "Fluent in Tech",
    "mark": "F",  # letter in the logo square
    "email": "mark.parfenov@gmail.com",
    "linkedin": "https://www.linkedin.com/in/parfenov-mark/",
    # Review platforms. "preply" is the link shown to visitors; "preply_profile"
    # is the canonical profile URL used in structured data.
    "preply": "https://preply.in/MARK6EN17817156102?ts=17903702",
    "preply_profile": "https://preply.com/en/tutor/4745825",
    "italki": "https://www.italki.com/en/teacher/22622933",
    "superprof": "https://www.superprof.com/executive-interview-coaching-for-engineers-and-product-leaders-who-want-senior-offers.html",
    "calendar": "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2eS5Lf6RGvLqM1pWFJ0GsXA_FqX1tS_AikzrszcPdrp7m0Z0qSzaYY6Ge5_8584UGuAfR-041o?gv=true",
    "video_id": "eWnjK1nXoSw",
    "video_embed": "https://www.youtube-nocookie.com/embed/eWnjK1nXoSw",
    # Local cover image, so no request goes to YouTube until the visitor presses play.
    "video_thumbnail": "thumbnail.jpg",
    "og_image": "assets/og-image.jpg",
    # Google Analytics 4 measurement ID, e.g. "G-XXXXXXXXXX". Empty = no analytics.
    "ga_id": "",
}

# Each target is built from the same sources. "base" is the path prefix the
# site is served under; "origin" is its scheme and host.
TARGETS = {
    # Vercel serves public/ at the custom domain (configured by vercel.json).
    "vercel": {"out": "public", "base": "", "origin": "https://www.fluentintechcoaching.com"},
    # GitHub Pages serves the repository root under /protocol-executive/.
    # Set "redirect" to True once the domain is live: every old GitHub Pages
    # URL then forwards to the same page on the domain.
    "github": {"out": ".", "base": "/protocol-executive",
               "origin": "https://mark-dev-execute.github.io", "redirect": True},
}

# Files the pages reference, copied into public/ for Vercel.
STATIC = ["styles.css", "app.js", "coach_mark_portrait.jpg", "thumbnail.jpg",
          "assets/favicon.svg", "assets/og-image.jpg", "assets/fonts/OFL.txt",
          *(f"assets/fonts/{name}" for name in (
              "manrope-latin-wght-normal.woff2", "manrope-latin-ext-wght-normal.woff2",
              "dm-mono-latin-400-normal.woff2", "dm-mono-latin-500-normal.woff2",
              "dm-mono-latin-ext-400-normal.woff2", "dm-mono-latin-ext-500-normal.woff2")),
          *(f"assets/logos/strip/{name}.png" for name in ("tufts", "caterpillar"))]

NAV = [
    ("interview", "Interview", "interview-coaching/"),
    ("communication", "Communication", "professional-communication/"),
    ("programs", "Programs", "programs/"),
    ("reviews", "Reviews", "reviews/"),
    ("pricing", "Pricing", "pricing/"),
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
    ("Company", [
        ("About Mark", "about/"),
        ("Reviews", "reviews/"),
        ("Guides", "guides/"),
        ("Pricing", "pricing/"),
        ("Programs", "programs/"),
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
    "results/": "reviews/",
    "syllabus.html": "professional-communication/",
}

YEAR = datetime.date.today().year
OUT = ROOT  # output directory of the target being built
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


# Downloadable program guides (assets/programs/*.pdf, rendered by pdf/render.cjs).
PROGRAM_GUIDES = {
    "communication-program": ("Business English & Communication Program", "Communication · B1–B2",
                              "Four phases and 24 sessions: from placement test to meetings, presentations, CV, LinkedIn and interview English."),
    "executive-communication-program": ("Executive Communication Program", "Communication · C1–C2",
                                        "Twelve weeks on presence, concise messages, meetings, persuasion, difficult conversations and storytelling."),
    "career-accelerator": ("Career Accelerator", "Career & interview",
                           "The 12-week job-search program: CV, LinkedIn, strategy, PAR stories, two mock interviews and negotiation."),
    "executive-interview-program": ("The Executive Interview Edge", "Senior interviews",
                                    "Twelve weeks of strategic storytelling: a story bank, a job-description strategy, mock panels and negotiation."),
    "career-coaching-program": ("Career Coaching Program", "Career coaching",
                                "Eight sessions from career assessment and positioning to leadership, networking and a 90-day plan."),
    "leadership-program": ("Leadership Program for International Tech Leaders", "Leadership",
                           "A 10–12 week journey: identity, presence, influence, cross-cultural leadership and a capstone project."),
    "executive-edge": ("Executive Edge", "Leadership & executive",
                       "Twelve weeks for managers, directors and VPs: presence, influence, panel interviews and senior negotiation."),
    "corporate-programs": ("Corporate Programs & Team Workshops", "For companies",
                           "Career Accelerator and Executive Edge for teams, private cohorts, and workshops for managers."),
}
STATIC += [f"assets/programs/{slug}.pdf" for slug in PROGRAM_GUIDES]


def pdf_facts(slug):
    path = ROOT / "assets" / "programs" / f"{slug}.pdf"
    if not path.exists():
        sys.exit(f"Missing program guide {path.relative_to(ROOT)} — run pdf/render.cjs")
    data = path.read_bytes()
    pages = len(re.findall(rb"/Type\s*/Page[^s]", data))
    return pages, round(len(data) / 1024)


def downloads_html(slugs):
    cards = []
    for slug in slugs:
        if slug not in PROGRAM_GUIDES:
            sys.exit(f"Unknown program guide '{slug}'")
        title, tag, text = PROGRAM_GUIDES[slug]
        pages, size = pdf_facts(slug)
        cards.append(
            f'<article class="card download"><span class="tag">{esc(tag)}</span>'
            f'<h3>{esc(title)}</h3><p>{esc(text)}</p>'
            f'<p class="guide-meta">PDF · {pages} pages · {size} KB</p>'
            f'<a class="btn btn-dark" href="{url(f"assets/programs/{slug}.pdf")}" download '
            f'data-guide="{slug}" data-track="download-{slug}">Download PDF</a></article>')
    return f'<div class="cards downloads">{"".join(cards)}</div>' + LEAD_DIALOG.replace("{base}", SITE["base"])


# Shown after a program guide download starts: an optional free-consultation request (api/lead.js).
LEAD_DIALOG = """
<dialog class="lead-dialog" aria-labelledby="lead-title" data-lead-dialog>
  <form class="lead-form" action="{base}/api/lead" method="post" data-lead-form>
    <button class="dialog-close" type="button" aria-label="Close" data-lead-close>×</button>
    <span class="eyebrow">Your guide is downloading</span>
    <h2 id="lead-title">Want to talk it through?</h2>
    <p>Leave your email and Mark will get in touch to arrange a free consultation about your goals. Completely optional.</p>
    <div class="subscribe-row">
      <label class="visually-hidden" for="lead-email">Email address</label>
      <input id="lead-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" enterkeyhint="send" maxlength="254" required>
      <button class="btn btn-primary" type="submit" data-track="lead-submit">Request a free consultation</button>
    </div>
    <div class="hp" aria-hidden="true"><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></div>
    <input type="hidden" name="guide" value="">
    <input type="hidden" name="t" value="">
    <p class="fine">Your email is only used to arrange the consultation — see the <a class="text-link" href="{base}/privacy/#consultation-requests">privacy policy</a>.</p>
    <p class="form-status" aria-live="polite"></p>
    <button class="text-button" type="button" data-lead-close>No thanks, just the guide</button>
  </form>
</dialog>"""


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
        "italki": SITE["italki"],
        "superprof": SITE["superprof"],
        "video": video_html(),
        "year": str(YEAR),
    }

    def token(match):
        name, arg = match.group(1), match.group(2)
        if name == "reviews":
            return reviews_html([n.strip() for n in arg.split(",")], reviews)
        if name == "downloads":
            return downloads_html([n.strip() for n in arg.split(",")])
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
    org_id = absolute() + "#business"
    profiles = [SITE["linkedin"], SITE["preply_profile"], SITE["italki"], SITE["superprof"]]
    graph = [{
        "@type": "ProfessionalService",
        "@id": org_id,
        "name": SITE["name"],
        "url": absolute(),
        "email": SITE["email"],
        "image": absolute(SITE["og_image"]),
        "description": "Career, communication and leadership coaching for technology professionals.",
        "founder": {"@type": "Person", "name": "Mark Parfenov", "sameAs": profiles},
        "sameAs": profiles,
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
<link rel="preload" href="{url("assets/fonts/manrope-latin-wght-normal.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{url("styles.css")}?v={versions["styles.css"]}">
{structured_data(meta, body)}
{analytics}<script src="{url("app.js")}?v={versions["app.js"]}" defer></script>
<script src="/_vercel/insights/script.js" defer></script>
</head>
<body{' class="has-sticky"' if sticky else ""}>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<nav class="nav wrap" aria-label="Main">
<a class="brand" href="{url()}"><span class="brand-mark" aria-hidden="true">{SITE["mark"]}</span>{SITE["name"]}</a>
<div class="nav-links" id="nav-links">{nav_links}{cta_link(meta, "btn btn-primary menu-cta", "menu-cta")}</div>
{cta_link(meta, "btn btn-primary nav-cta", "header-cta")}
<button class="menu" type="button" aria-expanded="false" aria-controls="nav-links" data-menu><span class="visually-hidden">Menu</span><span aria-hidden="true">☰</span></button>
</nav>
</header>
<main id="main">
{body.strip()}
</main>
<footer class="footer">
<div class="wrap footer-grid">
<div class="footer-brand"><a class="brand" href="{url()}"><span class="brand-mark" aria-hidden="true">{SITE["mark"]}</span>{SITE["name"]}</a>
<p>Career, communication and leadership coaching for technology professionals.</p>
<p><a href="mailto:{SITE["email"]}">{SITE["email"]}</a></p></div>
{footer_cols}
<nav aria-label="Elsewhere"><p class="footer-title">Elsewhere</p><ul><li><a href="{SITE["linkedin"]}" target="_blank" rel="noopener">LinkedIn</a></li><li><a href="{SITE["preply"]}" target="_blank" rel="noopener">Preply</a></li><li><a href="{SITE["italki"]}" target="_blank" rel="noopener">italki</a></li><li><a href="{SITE["superprof"]}" target="_blank" rel="noopener">Superprof</a></li></ul></nav>
</div>
<div class="wrap footer-base"><p>© {YEAR} {SITE["name"]} · Mark Parfenov · <a href="{url("privacy/")}">Privacy</a> · <a href="{url("cancellation-policy/")}">Cancellation policy</a></p></div>
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


def redirect_path(old):
    """File that serves an old URL: "page.html" or "folder/" (-> folder/index.html)."""
    path = OUT / old / "index.html" if old.endswith("/") else OUT / old
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def output_path(route):
    if route.endswith(".html"):
        return OUT / route
    return OUT / route / "index.html"


def check_links(pages):
    """Fail the build if an internal link or asset points at a missing file."""
    missing = []
    for out, content in pages.items():
        for ref in re.findall(r'(?:href|src)="(' + re.escape(SITE["base"]) + r'/[^"#?]*)', content):
            rel = ref[len(SITE["base"]) + 1:]
            if rel.startswith("_vercel/"):  # served by Vercel at runtime (Web Analytics)
                continue
            target = OUT / rel / "index.html" if rel == "" or rel.endswith("/") else OUT / rel
            if not target.exists():
                missing.append(f"{out.relative_to(ROOT)} -> {ref}")
    if missing:
        sys.exit("Broken internal links:\n  " + "\n  ".join(sorted(set(missing))))


def domain_url(path=""):
    return f"{TARGETS['vercel']['origin']}/{path}"


def domain_redirect_stub(path):
    target = domain_url(path)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{esc(SITE["name"])} has moved</title>
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url={target}">
<link rel="canonical" href="{target}"></head>
<body><p><a href="{target}">{esc(SITE["name"])} has moved to {target}</a></p></body></html>
"""


def write_vercel_config():
    redirects = [{"source": "/" + old, "destination": "/" + new, "permanent": True}
                 for old, new in REDIRECTS.items()]
    redirects += [
        {"source": "/protocol-executive", "destination": "/", "permanent": True},
        {"source": "/protocol-executive/:path*", "destination": "/:path*", "permanent": True},
    ]
    analytics = " https://www.googletagmanager.com" if SITE["ga_id"] else ""
    csp = "; ".join([
        "default-src 'self'",
        f"script-src 'self'{analytics}" + (" 'unsafe-inline'" if SITE["ga_id"] else ""),
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data:" + analytics.replace("googletagmanager", "google-analytics"),
        "connect-src 'self'" + (" https://*.google-analytics.com" if SITE["ga_id"] else ""),
        "frame-src https://www.youtube-nocookie.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
    ])
    headers = [{"source": "/(.*)", "headers": [
        {"key": "Content-Security-Policy", "value": csp},
        {"key": "X-Content-Type-Options", "value": "nosniff"},
        {"key": "X-Frame-Options", "value": "DENY"},
        {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
        {"key": "Permissions-Policy",
         "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()"},
        {"key": "Cross-Origin-Opener-Policy", "value": "same-origin"},
    ]}]
    config = {"framework": None, "outputDirectory": TARGETS["vercel"]["out"],
              "trailingSlash": True, "redirects": redirects, "headers": headers}
    (ROOT / "vercel.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def build_target(name, target, pages, versions):
    global OUT
    OUT = (ROOT / target["out"]).resolve()
    SITE["base"], SITE["origin"] = target["base"], target["origin"]
    if OUT != ROOT:
        shutil.rmtree(OUT, ignore_errors=True)
        for rel in STATIC:
            (OUT / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / rel, OUT / rel)

    if target.get("redirect"):
        for meta, _ in pages:
            out = output_path(meta["path"])
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(domain_redirect_stub("" if meta["path"] == "404.html" else meta["path"]), encoding="utf-8")
        for old, new in REDIRECTS.items():
            redirect_path(old).write_text(domain_redirect_stub(new), encoding="utf-8")
        (OUT / "sitemap.xml").unlink(missing_ok=True)
        (OUT / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")
        print(f"{name}: {len(pages)} pages now redirect to {domain_url()}")
        return

    written = {}
    sitemap = []
    for meta, body in pages:
        out = output_path(meta["path"])
        out.parent.mkdir(parents=True, exist_ok=True)
        content = render(meta, body, versions)
        out.write_text(content, encoding="utf-8")
        written[out] = content
        if meta.get("sitemap", "yes") != "no":
            sitemap.append(absolute(meta["path"]))

    if OUT == ROOT:  # static hosts without redirect rules get HTML stubs
        for old, new in REDIRECTS.items():
            redirect_path(old).write_text(redirect_stub(new), encoding="utf-8")

    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{loc}</loc></url>\n" for loc in sitemap)
        + "</urlset>\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\nSitemap: {absolute('sitemap.xml')}\n", encoding="utf-8")

    check_links(written)
    print(f"{name}: built {len(written)} pages at {absolute()}")


def main():
    versions = {name: asset_version(name) for name in ("styles.css", "app.js")}
    pages = []
    for source in sorted((SRC / "pages").glob("*.html")):
        meta, body = parse_page(source)
        pages.append((meta, body))
    for name, target in TARGETS.items():
        # Tokens like {{base}} depend on the target, so expand per target.
        SITE["base"], SITE["origin"] = target["base"], target["origin"]
        expanded = [(meta, expand(body, meta["path"])) for meta, body in pages]
        build_target(name, target, expanded, versions)
    write_vercel_config()


if __name__ == "__main__":
    main()
