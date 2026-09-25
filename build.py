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
    # app.js loads Google's tag only after the visitor accepts the cookie banner.
    "ga_id": "G-PREBSC40FZ",
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
        ("Business coaching", "programs/#business-coaching"),
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
    ("Policies", [
        ("Privacy policy", "privacy/"),
        ("Lesson & cancellation policy", "cancellation-policy/"),
    ]),
]

# Spanish pages live in src/pages/es/ with "lang: es" and "alt: <English path>"
# in their front matter. English pages without a Spanish version link to /es/.
NAV_ES = [
    ("interview", "Entrevistas", "es/coaching-entrevistas/"),
    ("communication", "Comunicación", "es/comunicacion-profesional/"),
    ("business-english", "Inglés de negocios", "es/ingles-de-negocios/"),
    ("pricing", "Precios", "es/precios/"),
    ("about", "Sobre Mark", "es/sobre-mark/"),
]

FOOTER_ES = [
    ("Coaching", [
        ("Coaching de entrevistas", "es/coaching-entrevistas/"),
        ("Comunicación profesional", "es/comunicacion-profesional/"),
        ("Inglés de negocios", "es/ingles-de-negocios/"),
        ("Precios", "es/precios/"),
        ("Sobre Mark", "es/sobre-mark/"),
        ("Contacto", "es/contacto/"),
        ("Reserva una llamada gratuita", "es/reservar/"),
    ]),
    ("Más, en inglés", [
        ("Programas", "programs/"),
        ("Opiniones", "reviews/"),
        ("Guías", "guides/"),
        ("Coaching de liderazgo", "leadership-coaching/"),
        ("Coaching ejecutivo", "executive-coaching/"),
        ("Programas para empresas", "corporate/"),
        ("Coaching de negocio", "programs/#business-coaching"),
    ]),
    ("Políticas", [
        ("Política de privacidad", "es/privacidad/"),
        ("Política de clases y cancelación", "es/politica-de-cancelacion/"),
    ]),
]

STRINGS = {
    "en": {
        "locale": "en_US", "skip": "Skip to content", "menu": "Menu", "main_nav": "Main",
        "cta": "Book a free call", "tagline": "Career, communication and leadership coaching for technology professionals.",
        "elsewhere": "Elsewhere",
        "currency": "Show prices in", "other_lang": "es", "other_label": "ES", "other_name": "Ver esta página en español",
    },
    "es": {
        "locale": "es_ES", "skip": "Saltar al contenido", "menu": "Menú", "main_nav": "Principal",
        "cta": "Reserva una llamada gratuita", "tagline": "Coaching de carrera, comunicación y liderazgo para profesionales de la tecnología.",
        "elsewhere": "En otras webs",
        "currency": "Mostrar precios en", "other_lang": "en", "other_label": "EN", "other_name": "View this page in English",
    },
}

# Old campaign URLs that still receive traffic -> current pages.
REDIRECTS = {
    "interview-prep.html": "interview-coaching/",
    "par-toolkit.html": "interview-coaching/",
    "executive-presence.html": "executive-coaching/",
    "corporate-training.html": "corporate/",
    "results/": "reviews/",
    "syllabus.html": "professional-communication/",
}

# Cookie banner for Google Analytics. Accept and reject are equally prominent, as
# Spanish and EU regulators expect; nothing loads from Google until "Accept".
CONSENT_TEXT = {
    "en": {"label": "Cookie choice", "settings": "Cookie settings",
           "text": "May this site use Google Analytics cookies to see which pages are useful? They’re never used for advertising.",
           "link": "Privacy policy", "href": "privacy/#analytics", "reject": "Reject", "accept": "Accept"},
    "es": {"label": "Preferencias de cookies", "settings": "Configurar cookies",
           "text": "¿Nos permites usar cookies de Google Analytics para saber qué páginas son útiles? Nunca se usan con fines publicitarios.",
           "link": "Política de privacidad", "href": "es/privacidad/#analitica", "reject": "Rechazar", "accept": "Aceptar"},
}

YEAR = datetime.date.today().year
ALTERNATES = {}  # page path -> the same page in the other language (filled in by main)
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
    if meta.get("alt") == "/":
        meta["alt"] = ""
    meta.setdefault("lang", "en")
    if meta["lang"] not in STRINGS:
        sys.exit(f"{path}: unknown lang '{meta['lang']}'")
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
    "leadership-circle": ("The Leadership Circle", "Group cohort · Managers",
                          "Six biweekly group sessions: presence, managing up, feedback, leading across cultures and peer case clinics."),
    "executive-edge": ("Executive Edge", "Leadership & executive",
                       "Twelve weeks for managers, directors and VPs: presence, influence, panel interviews and senior negotiation."),
    "corporate-programs": ("Corporate Programs & Team Workshops", "For companies",
                           "Career Accelerator and Executive Edge for teams, private cohorts, and workshops for managers."),
}
STATIC += [f"assets/programs/{slug}.pdf" for slug in PROGRAM_GUIDES]

# Spanish card text for the guides offered on Spanish pages (the PDFs are in English).
PROGRAM_GUIDES_ES = {
    "communication-program": ("Comunicación · B1–B2",
                              "Cuatro fases y 24 sesiones: de la prueba de nivel a reuniones, presentaciones, CV, LinkedIn e inglés para entrevistas."),
    "executive-communication-program": ("Comunicación · C1–C2",
                                        "Doce semanas de presencia, mensajes concisos, reuniones, persuasión, conversaciones difíciles y storytelling."),
    "career-accelerator": ("Carrera y entrevistas",
                           "El programa de 12 semanas para buscar trabajo: CV, LinkedIn, estrategia, historias PAR, dos entrevistas simuladas y negociación."),
    "executive-interview-program": ("Entrevistas senior",
                                    "Doce semanas de storytelling estratégico: banco de historias, estrategia a partir de la oferta, paneles simulados y negociación."),
}


def pdf_facts(slug):
    path = ROOT / "assets" / "programs" / f"{slug}.pdf"
    if not path.exists():
        sys.exit(f"Missing program guide {path.relative_to(ROOT)} — run pdf/render.cjs")
    data = path.read_bytes()
    pages = len(re.findall(rb"/Type\s*/Page[^s]", data))
    return pages, round(len(data) / 1024)


def downloads_html(slugs, lang):
    cards = []
    for slug in slugs:
        if slug not in PROGRAM_GUIDES or (lang == "es" and slug not in PROGRAM_GUIDES_ES):
            sys.exit(f"Unknown program guide '{slug}' ({lang})")
        title, tag, text = PROGRAM_GUIDES[slug]
        if lang == "es":
            tag, text = PROGRAM_GUIDES_ES[slug]
        pages, size = pdf_facts(slug)
        facts = f"PDF en inglés · {pages} páginas · {size} KB" if lang == "es" else f"PDF · {pages} pages · {size} KB"
        cards.append(
            f'<article class="card download"><span class="tag">{esc(tag)}</span>'
            f'<h3>{esc(title)}</h3><p>{esc(text)}</p>'
            f'<p class="guide-meta">{facts}</p>'
            f'<a class="btn btn-dark" href="{url(f"assets/programs/{slug}.pdf")}" download '
            f'data-guide="{slug}" data-track="download-{slug}">{"Descargar PDF" if lang == "es" else "Download PDF"}</a></article>')
    return f'<div class="cards downloads">{"".join(cards)}</div>' + lead_dialog(lang)


LEAD_TEXT = {
    "en": {"close": "Close", "eyebrow": "Your guide is downloading", "title": "Want to talk it through?",
           "intro": "Leave your email and Mark will get in touch to arrange a free consultation about your goals. Completely optional.",
           "label": "Email address", "placeholder": "you@example.com", "submit": "Request a free consultation",
           "company": "Company", "privacy": "Your email is only used to arrange the consultation — see the",
           "privacy_link": "privacy policy", "privacy_href": "privacy/#consultation-requests", "skip": "No thanks, just the guide"},
    "es": {"close": "Cerrar", "eyebrow": "Tu guía se está descargando", "title": "¿Quieres comentarla?",
           "intro": "Déjanos tu email y Mark se pondrá en contacto contigo para organizar una consulta gratuita sobre tus objetivos. Es totalmente opcional.",
           "label": "Correo electrónico", "placeholder": "tu@ejemplo.com", "submit": "Solicitar consulta gratuita",
           "company": "Empresa", "privacy": "Solo usamos tu email para organizar la consulta — consulta la",
           "privacy_link": "política de privacidad", "privacy_href": "es/privacidad/#solicitudes-de-consulta", "skip": "No, gracias, solo la guía"},
}


def lead_dialog(lang):
    """Shown after a program guide download starts: an optional free-consultation request (api/lead.js)."""
    t = LEAD_TEXT[lang]
    return f"""
<dialog class="lead-dialog" aria-labelledby="lead-title" data-lead-dialog>
  <form class="lead-form" action="{url("api/lead")}" method="post" data-lead-form>
    <button class="dialog-close" type="button" aria-label="{t["close"]}" data-lead-close>×</button>
    <span class="eyebrow">{t["eyebrow"]}</span>
    <h2 id="lead-title">{t["title"]}</h2>
    <p>{t["intro"]}</p>
    <div class="subscribe-row">
      <label class="visually-hidden" for="lead-email">{t["label"]}</label>
      <input id="lead-email" name="email" type="email" placeholder="{t["placeholder"]}" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" enterkeyhint="send" maxlength="254" required>
      <button class="btn btn-primary" type="submit" data-track="lead-submit">{t["submit"]}</button>
    </div>
    <div class="hp" aria-hidden="true"><label>{t["company"]}<input name="company" tabindex="-1" autocomplete="off"></label></div>
    <input type="hidden" name="guide" value="">
    <input type="hidden" name="t" value="">
    <p class="fine">{t["privacy"]} <a class="text-link" href="{url(t["privacy_href"])}">{t["privacy_link"]}</a>.</p>
    <p class="form-status" aria-live="polite"></p>
    <button class="text-button" type="button" data-lead-close>{t["skip"]}</button>
  </form>
</dialog>"""


# Prices in page text ("$90", "$1,000–1,200") become <span class="money" data-usd="…">
# so app.js can show them in euros. Spanish pages write them Spanish-style ("90 US$").
MONEY = re.compile(r"\$(\d{1,3}(?:,\d{3})+|\d+)(?:\s*([–-])\s*\$?(\d{1,3}(?:,\d{3})+|\d+))?")
MONEY_SKIP = ("script", "style", "title", "option", "textarea")


def spanish_number(n):
    return f"{n:,}".replace(",", ".") if n >= 10000 else str(n)


def money_span(match, lang):
    low = int(match.group(1).replace(",", ""))
    high = int(match.group(3).replace(",", "")) if match.group(3) else None
    usd = f"{low}-{high}" if high else str(low)
    if lang == "es":
        shown = f"{spanish_number(low)}–{spanish_number(high)} US$" if high else f"{spanish_number(low)} US$"
    else:
        shown = match.group(0)
    return f'<span class="money" data-usd="{usd}">{shown}</span>'


def wrap_money(body, lang):
    parts = re.split(r"(<[^>]+>)", body)
    skipping = None
    for i, part in enumerate(parts):
        if part.startswith("<"):
            name = re.match(r"</?([a-zA-Z]+)", part)
            name = name.group(1).lower() if name else ""
            if skipping is None and name in MONEY_SKIP and not part.startswith("</"):
                skipping = name
            elif skipping == name and part.startswith("</"):
                skipping = None
        elif skipping is None:
            parts[i] = MONEY.sub(lambda m: money_span(m, lang), part)
    return "".join(parts)


def reviews_html(names, reviews, lang="en"):
    items = []
    spanish = lang == "es"
    for name in names:
        review = reviews[name]
        if spanish:  # reviews stay in English, as written
            source = f"Opinión de cinco estrellas en {review['platform']}" if review.get("platform") else "Opinión de cinco estrellas"
        else:
            source = f"Five-star review on {review['platform']}" if review.get("platform") else "Five-star review"
        stars = "5 de 5 estrellas" if spanish else "5 out of 5 stars"
        text_lang = ' lang="en"' if spanish else ""
        items.append(
            '<blockquote class="quote">'
            f'<div class="stars" role="img" aria-label="{stars}">★★★★★</div>'
            f'<p{text_lang}>“{esc(review["text"])}”</p>'
            f'<footer><b>{esc(review["name"])}</b>{esc(review["role"])} · {source}</footer>'
            '</blockquote>'
        )
    return f'<div class="testimonials">{"".join(items)}</div>'


def expand(body, source, lang="en"):
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
            return reviews_html([n.strip() for n in arg.split(",")], reviews, lang)
        if name == "downloads":
            return downloads_html([n.strip() for n in arg.split(",")], lang)
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
        "areaServed": [{"@type": "Country", "name": "Spain"}, {"@type": "City", "name": "Madrid"},
                       {"@type": "City", "name": "Barcelona"}, "Worldwide (online)"],
        "availableLanguage": "English",
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
            "inLanguage": meta["lang"],
        })
    faqs = faq_entries(body)
    if faqs:
        graph.append({"@type": "FAQPage", "mainEntity": faqs})
    data = {"@context": "https://schema.org", "@graph": graph}
    return f'<script type="application/ld+json">{json.dumps(data, ensure_ascii=False)}</script>'


def cta_link(meta, css, track):
    label = meta.get("cta", STRINGS[meta["lang"]]["cta"])
    href = meta.get("cta_href", "es/reservar/" if meta["lang"] == "es" else "book/")
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
    ga_attr = f' data-ga="{SITE["ga_id"]}"' if SITE["ga_id"] else ""

    lang = meta["lang"]
    t = STRINGS[lang]
    spanish = lang == "es"
    current = ' aria-current="page"'
    nav_links = "".join(
        f'<a href="{url(href)}"{current if meta.get("nav") == key else ""}>{label}</a>'
        for key, label, href in (NAV_ES if spanish else NAV)
    )

    def footer_link(href):
        # Spanish pages mark links to English-only pages, so screen readers switch voice.
        english_only = ' hreflang="en" lang="en"' if spanish and not href.startswith("es/") else ""
        return f'<a href="{url(href)}"{english_only}>'

    footer_cols = "".join(
        f'<nav aria-label="{title}"><p class="footer-title">{title}</p><ul>'
        + "".join(f'<li>{footer_link(href)}{label}</a></li>' for label, href in links)
        + "</ul></nav>"
        for title, links in (FOOTER_ES if spanish else FOOTER)
    )

    # Language switch: the same page in the other language, or the other home page.
    other = ALTERNATES.get(path, "" if spanish else "es/")
    alternates = ""
    if path in ALTERNATES:
        en_path, es_path = (other, path) if spanish else (path, other)
        alternates = (f'<link rel="alternate" hreflang="en" href="{absolute(en_path)}">\n'
                      f'<link rel="alternate" hreflang="es" href="{absolute(es_path)}">\n'
                      f'<link rel="alternate" hreflang="x-default" href="{absolute(en_path)}">\n'
                      f'<meta property="og:locale:alternate" content="{STRINGS[t["other_lang"]]["locale"]}">\n')
    switches = (
        f'<div class="nav-tools">'
        f'<div class="currency-switch" role="group" aria-label="{t["currency"]}" data-currency hidden>'
        '<button type="button" data-cur="USD" aria-pressed="true" aria-label="USD">'
        '<span class="cur-long">USD</span><span class="cur-short">$</span></button>'
        '<button type="button" data-cur="EUR" aria-pressed="false" aria-label="EUR">'
        '<span class="cur-long">EUR</span><span class="cur-short">€</span></button></div>'
        f'<a class="lang-switch" href="{url(other)}" hreflang="{t["other_lang"]}" lang="{t["other_lang"]}" '
        f'aria-label="{t["other_name"]}" data-track="lang-{t["other_lang"]}">{t["other_label"]}</a></div>'
    )
    body = wrap_money(body, lang)
    consent_banner = cookie_settings = ""
    if SITE["ga_id"]:
        c = CONSENT_TEXT[lang]
        cookie_settings = f' · <button class="link-button" type="button" data-consent-open>{c["settings"]}</button>'
        consent_banner = (
            f'<div class="consent" role="region" aria-label="{c["label"]}" data-consent hidden>'
            f'<p>{c["text"]} <a href="{url(c["href"])}">{c["link"]}</a></p>'
            '<div class="consent-actions">'
            f'<button class="btn btn-consent" type="button" data-consent-choice="denied">{c["reject"]}</button>'
            f'<button class="btn btn-consent" type="button" data-consent-choice="granted">{c["accept"]}</button>'
            '</div></div>\n')

    return f"""<!doctype html>
<!-- Generated by build.py from src/pages/. Edit the source, not this file. -->
<html lang="{lang}"{ga_attr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(meta["title"])}</title>
<meta name="description" content="{esc(meta["description"])}">
{robots}<link rel="canonical" href="{canonical}">
{alternates}<meta property="og:type" content="website">
<meta property="og:locale" content="{t["locale"]}">
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
<script src="{url("app.js")}?v={versions["app.js"]}" defer></script>
<script src="/_vercel/insights/script.js" defer></script>
</head>
<body{' class="has-sticky"' if sticky else ""}>
<a class="skip-link" href="#main">{t["skip"]}</a>
<header class="site-header">
<nav class="nav wrap" aria-label="{t["main_nav"]}">
<a class="brand" href="{url("es/" if spanish else "")}"><span class="brand-mark" aria-hidden="true">{SITE["mark"]}</span>{SITE["name"]}</a>
<div class="nav-links" id="nav-links">{nav_links}{cta_link(meta, "btn btn-primary menu-cta", "menu-cta")}</div>
{switches}
{cta_link(meta, "btn btn-primary nav-cta", "header-cta")}
<button class="menu" type="button" aria-expanded="false" aria-controls="nav-links" data-menu><span class="visually-hidden">{t["menu"]}</span><span aria-hidden="true">☰</span></button>
</nav>
</header>
<main id="main">
{body.strip()}
</main>
<footer class="footer">
<div class="wrap footer-grid">
<div class="footer-brand"><a class="brand" href="{url("es/" if spanish else "")}"><span class="brand-mark" aria-hidden="true">{SITE["mark"]}</span>{SITE["name"]}</a>
<p>{t["tagline"]}</p>
<p><a href="mailto:{SITE["email"]}">{SITE["email"]}</a></p></div>
{footer_cols}
<nav aria-label="{t["elsewhere"]}"><p class="footer-title">{t["elsewhere"]}</p><ul><li><a href="{SITE["linkedin"]}" target="_blank" rel="noopener">LinkedIn</a></li><li><a href="{SITE["preply"]}" target="_blank" rel="noopener">Preply</a></li><li><a href="{SITE["italki"]}" target="_blank" rel="noopener">italki</a></li><li><a href="{SITE["superprof"]}" target="_blank" rel="noopener">Superprof</a></li></ul></nav>
</div>
<div class="wrap footer-base"><p>© {YEAR} {SITE["name"]} · Mark Parfenov{cookie_settings}</p>
<p class="fx-note" data-fx-note hidden></p></div>
</footer>
{cta_link(meta, "sticky-cta btn btn-primary", "sticky-cta") if sticky else ""}
{consent_banner}</body>
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
    ga = bool(SITE["ga_id"])
    csp = "; ".join([
        "default-src 'self'",
        "script-src 'self'" + (" https://www.googletagmanager.com" if ga else ""),
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data:" + (" https://*.google-analytics.com https://*.googletagmanager.com" if ga else ""),
        "connect-src 'self'" + (" https://*.google-analytics.com https://*.analytics.google.com"
                                " https://*.googletagmanager.com" if ga else ""),
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
    for source in sorted((SRC / "pages").glob("*.html")) + sorted((SRC / "pages" / "es").glob("*.html")):
        meta, body = parse_page(source)
        pages.append((meta, body))
    english = {meta["path"] for meta, _ in pages if meta["lang"] == "en"}
    for meta, _ in pages:
        if meta["lang"] != "en":
            if meta.get("alt") not in english:
                sys.exit(f"{meta['path']}: 'alt' must name an English page")
            ALTERNATES[meta["alt"]] = meta["path"]
            ALTERNATES[meta["path"]] = meta["alt"]
    for name, target in TARGETS.items():
        # Tokens like {{base}} depend on the target, so expand per target.
        SITE["base"], SITE["origin"] = target["base"], target["origin"]
        expanded = [(meta, expand(body, meta["path"], meta["lang"])) for meta, body in pages]
        build_target(name, target, expanded, versions)
    write_vercel_config()


if __name__ == "__main__":
    main()
