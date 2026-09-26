// Fluent in Tech: small progressive enhancements. Every page works without this file.
(() => {
  // Conversion events go to Google Analytics when it is configured (SITE.ga_id in build.py).
  const track = (name, params = {}) => {
    try { window.gtag?.('event', name, { page_location: location.pathname, ...params }); } catch (e) { /* analytics is optional */ }
  };

  // Interface text for the Spanish pages (html lang="es").
  const SPANISH = document.documentElement.lang === 'es';
  const T = SPANISH ? {
    fields: 'Completa los campos marcados.',
    nameEmail: 'Escribe tu nombre y un email válido, o elige «No, gracias».',
    contactThanks: 'Gracias. Mark te escribirá en un plazo de 24 horas.',
    invalidEmail: 'Introduce un email válido.',
    failed: 'Algo ha fallado. Inténtalo de nuevo.',
    sending: 'Enviando…',
    fxNote: (date, rate) => `Los precios se fijan en dólares estadounidenses y se muestran en euros al tipo de cambio de referencia del Banco Central Europeo del ${date} (1 USD = ${rate} EUR). Los importes en euros están redondeados; tu factura indica el importe exacto.`,
  } : {
    fields: 'Please complete the highlighted fields.',
    nameEmail: 'Please enter your name and a valid email, or choose “No thanks”.',
    contactThanks: 'Thanks. Mark will email you within 24 hours.',
    invalidEmail: 'Please enter a valid email address.',
    failed: 'Something went wrong. Please try again.',
    sending: 'Sending…',
    fxNote: (date, rate) => `Prices are set in US dollars and shown in euros at the European Central Bank reference rate of ${date} (1 USD = ${rate} EUR). Euro amounts are rounded; your invoice shows the exact amount.`,
  };
  const LOCALE = SPANISH ? 'es-ES' : 'en-US';

  const store = {
    get: (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } },
  };

  // Prices are set in USD and shown euro first, dollars second ("€77 ($90)"), at the
  // European Central Bank rate served by /api/rates (kept in the browser for 12 hours).
  // The EUR/USD switch shows dollars only; the choice is remembered. Without a rate
  // (or without JavaScript) prices show in dollars.
  const FX_KEY = 'fit-fx';
  const CURRENCY_KEY = 'fit-currency';
  const HOUR = 3600 * 1000;

  const preferredCurrency = () => (store.get(CURRENCY_KEY) === 'USD' ? 'USD' : 'EUR');

  const plausible = (fx) => fx && fx.rate > 0.5 && fx.rate < 1.5 && /^\d{4}-\d{2}-\d{2}$/.test(fx.date);

  const savedRate = (maxAge) => {
    try {
      const fx = JSON.parse(store.get(FX_KEY));
      return plausible(fx) && Date.now() - fx.fetched < maxAge ? fx : null;
    } catch (e) { return null; }
  };

  const loadRate = async () => {
    const fresh = savedRate(12 * HOUR);
    if (fresh) return fresh;
    try {
      const response = await fetch('/api/rates');
      const data = await response.json();
      if (!response.ok || !plausible(data)) throw new Error('no rate');
      const fx = { rate: data.rate, date: data.date, fetched: Date.now() };
      store.set(FX_KEY, JSON.stringify(fx));
      return fx;
    } catch (e) {
      return savedRate(7 * 24 * HOUR); // an older rate beats none
    }
  };

  const showPrices = (currency, fx) => {
    const euros = (n, symbol) => new Intl.NumberFormat(LOCALE, symbol
      ? { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }
      : { maximumFractionDigits: 0 }).format(n);
    const convert = (usd) => {
      const eur = Number(usd) * fx.rate;
      return eur < 200 ? Math.round(eur) : Math.round(eur / 5) * 5;
    };
    document.querySelectorAll('.money[data-usd]').forEach((el) => {
      if (el.dataset.original === undefined) el.dataset.original = el.textContent;
      el.textContent = currency === 'USD' ? el.dataset.original : '';
      if (currency === 'USD') return;
      const [low, high] = el.dataset.usd.split('-').map(convert);
      const range = !high ? euros(low, true)
        : SPANISH ? `${euros(low)}–${euros(high, true)}` : `${euros(low, true)}–${euros(high)}`;
      const dollars = document.createElement('span');
      dollars.className = 'money-usd';
      dollars.textContent = ` (${el.dataset.original.trim()})`;
      el.append(range, dollars);
    });
    const date = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${fx.date}T12:00:00Z`));
    const rate = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 4 }).format(fx.rate);
    document.querySelectorAll('[data-fx-note]').forEach((note) => {
      note.textContent = T.fxNote(date, rate);
      note.hidden = currency !== 'EUR';
    });
  };

  const initCurrency = async () => {
    const group = document.querySelector('[data-currency]');
    if (!group) return;
    group.hidden = false;
    group.classList.add('is-loading'); // keeps its place in the header while the rate loads
    const fx = await loadRate();
    if (!fx) { group.hidden = true; return; } // no rate: prices stay in USD
    let currency = preferredCurrency();
    const apply = () => {
      showPrices(currency, fx);
      group.querySelectorAll('button[data-cur]').forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.cur === currency)));
    };
    group.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-cur]');
      if (!button || button.dataset.cur === currency) return;
      currency = button.dataset.cur;
      store.set(CURRENCY_KEY, currency);
      apply();
      track('currency_switch', { currency });
    });
    apply();
    group.classList.remove('is-loading');
  };

  // Google tags run only with consent from the cookie banner: "Analytics" loads Google
  // Analytics, "Advertising" allows Google Ads cookies (and the Ads tag, if configured).
  // Until a choice is made, and after "Reject all", nothing is requested from Google.
  // "Cookie settings" in the footer reopens the banner. IDs come from <html data-ga
  // data-ads> (SITE.ga_id / SITE.ads_id in build.py).
  const GA_ID = document.documentElement.dataset.ga;
  const ADS_ID = document.documentElement.dataset.ads;
  const CONSENT_KEY = 'fit-analytics-consent';
  const NO_CONSENT = { analytics: false, ads: false };

  const savedConsent = () => {
    const raw = store.get(CONSENT_KEY);
    if (raw === 'granted') return { analytics: true, ads: false }; // choice made before ads were added
    if (raw === 'denied') return NO_CONSENT;
    try {
      const value = JSON.parse(raw);
      return value && typeof value.analytics === 'boolean' && typeof value.ads === 'boolean' ? value : null;
    } catch (e) { return null; }
  };

  const loadGoogle = (consent) => {
    const ids = [consent.analytics && GA_ID, consent.ads && ADS_ID].filter(Boolean);
    if (window.gtag || !ids.length) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); }; // gtag.js expects the arguments object
    const ads = consent.ads ? 'granted' : 'denied';
    window.gtag('consent', 'default', {
      analytics_storage: consent.analytics ? 'granted' : 'denied',
      ad_storage: ads, ad_user_data: ads, ad_personalization: ads,
    });
    window.gtag('js', new Date());
    ids.forEach((id) => window.gtag('config', id));
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0])}`;
    document.head.appendChild(script);
  };

  const initConsent = () => {
    const banner = document.querySelector('[data-consent]');
    if (!GA_ID || !banner) return;
    const options = banner.querySelector('[data-consent-options]');
    const chooseButton = banner.querySelector('[data-consent-choose]');
    const saveButton = banner.querySelector('[data-consent-choice="selected"]');
    const showOptions = (show) => {
      options.hidden = !show;
      chooseButton.hidden = show;
      saveButton.hidden = !show;
    };

    const current = savedConsent();
    if (current) loadGoogle(current);
    else banner.hidden = false;

    chooseButton.addEventListener('click', () => {
      const consent = savedConsent() || NO_CONSENT;
      options.elements.analytics.checked = consent.analytics;
      options.elements.ads.checked = consent.ads;
      showOptions(true);
      options.elements.analytics.focus();
    });

    banner.querySelectorAll('[data-consent-choice]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.consentChoice;
      const consent = kind === 'all' ? { analytics: true, ads: true }
        : kind === 'none' ? NO_CONSENT
          : { analytics: options.elements.analytics.checked, ads: options.elements.ads.checked };
      const before = savedConsent() || NO_CONSENT;
      store.set(CONSENT_KEY, JSON.stringify(consent));
      banner.hidden = true;
      showOptions(false);
      const withdrawn = (before.analytics && !consent.analytics) || (before.ads && !consent.ads);
      if (withdrawn && window.gtag) { location.reload(); return; } // reload so Google's tag leaves the page
      if (window.gtag) {
        const ads = consent.ads ? 'granted' : 'denied';
        window.gtag('consent', 'update', {
          analytics_storage: consent.analytics ? 'granted' : 'denied',
          ad_storage: ads, ad_user_data: ads, ad_personalization: ads,
        });
        if (consent.analytics && !before.analytics) window.gtag('config', GA_ID);
        if (consent.ads && !before.ads && ADS_ID) window.gtag('config', ADS_ID);
      } else {
        loadGoogle(consent);
      }
    }));

    document.querySelectorAll('[data-consent-open]').forEach((button) => button.addEventListener('click', () => {
      banner.hidden = false;
      showOptions(false);
      banner.querySelector('[data-consent-choice]').focus();
    }));
  };

  const initMenu = () => {
    const button = document.querySelector('[data-menu]');
    const links = document.getElementById('nav-links');
    if (!button || !links) return;
    const setOpen = (open) => {
      links.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', () => setOpen(!links.classList.contains('open')));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && links.classList.contains('open')) { setOpen(false); button.focus(); }
    });
    document.addEventListener('click', (event) => {
      if (links.classList.contains('open') && !links.contains(event.target) && !button.contains(event.target)) setOpen(false);
    });
    links.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
  };

  const initTracking = () => {
    document.querySelectorAll('[data-track]').forEach((el) =>
      el.addEventListener('click', () => track('cta_click', { cta: el.dataset.track })));
    document.querySelectorAll('a[href*="calendar.google.com"]').forEach((el) =>
      el.addEventListener('click', () => track('calendar_open')));
  };

  // Videos show a thumbnail and load the YouTube player only when clicked.
  const initVideos = () => {
    document.querySelectorAll('[data-video]').forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault();
      const src = link.dataset.video;
      const iframe = document.createElement('iframe');
      iframe.src = `${src}${src.includes('?') ? '&' : '?'}autoplay=1`;
      iframe.title = 'YouTube video player';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      const box = document.createElement('div');
      box.className = 'video-embed';
      box.appendChild(iframe);
      link.replaceWith(box);
      track('video_play');
    }));
  };

  // Message form on the booking page: name and email, saved by /api/lead. A booking
  // link like book/?service=interview tells Mark which service the visitor looked at.
  const initContactForm = () => {
    const form = document.querySelector('[data-contact-form]');
    if (!form) return;
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    const show = (message, error) => {
      status.className = error ? 'form-status error' : 'form-status';
      status.textContent = message;
    };
    form.elements.t.value = Date.now();
    form.elements.topic.value = new URLSearchParams(location.search).get('service') || '';
    const returned = new URLSearchParams(location.search).get('sent');
    if (returned === '1') show(T.contactThanks);
    if (returned === '0') show(T.fields, true);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        show(T.fields, true);
        return;
      }
      button.disabled = true;
      show(T.sending);
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(SPANISH ? T.failed : result.message || T.failed);
        track('contact_request', { topic: form.elements.topic.value || 'none' });
        form.reset();
        form.classList.add('is-done');
        show(T.contactThanks);
      } catch (error) {
        show(error.message || T.failed, true);
      } finally {
        button.disabled = false;
      }
    });
  };

  // Mailing-list signup on the guide pages: saved by /api/subscribe.
  const SIGNUP_SOURCES = {
    '/guides/': 'guides',
    '/guides/interview-questions/': 'guide-interview-questions',
    '/guides/google-interview/': 'guide-google-interview',
  };

  const initSubscribeForms = () => {
    document.querySelectorAll('[data-subscribe-form]').forEach((form) => {
      const status = form.querySelector('.form-status');
      const button = form.querySelector('button[type="submit"]');
      const show = (message, error) => {
        status.className = error ? 'form-status error' : 'form-status';
        status.textContent = message;
      };
      form.elements.t.value = Date.now();
      form.elements.source.value = SIGNUP_SOURCES[location.pathname.replace(/^\/protocol-executive/, '')] || 'unknown';
      const returned = new URLSearchParams(location.search).get('subscribed');
      if (returned === '1') show('You’re in. New guides will arrive in your inbox.');
      if (returned === '0') show('That didn’t work. Please check your email address.', true);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.checkValidity()) {
          form.reportValidity();
          show(T.invalidEmail, true);
          return;
        }
        const data = Object.fromEntries(new FormData(form));
        button.disabled = true;
        show('Subscribing…');
        try {
          const response = await fetch(form.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(SPANISH ? T.failed : result.message || T.failed);
          track('newsletter_signup', { source: data.source });
          form.reset();
          form.classList.add('is-done');
          show(result.message || 'You’re in. New guides will arrive in your inbox.');
        } catch (error) {
          show(error.message || T.failed, true);
        } finally {
          button.disabled = false;
        }
      });
    });
  };

  // Guide downloads. "Download PDF" opens a dialog, and the PDF downloads only after
  // the visitor shares their name and email or chooses "No thanks". Program guides
  // (data-dialog="lead") send the details to /api/lead as a consultation request;
  // article guides (data-dialog="guide") add them to the guide list via /api/subscribe.
  // Without JavaScript (or <dialog> support) the link simply downloads the file.
  const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

  const startDownload = (link) => {
    const a = document.createElement('a');
    a.href = link.href;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    track('guide_download', { guide: link.dataset.guide });
  };

  const initDownloads = () => {
    document.querySelectorAll('[data-download-dialog]').forEach((dialog) => {
      const kind = dialog.dataset.downloadDialog;
      if (typeof dialog.showModal !== 'function') return;
      const form = dialog.querySelector('form');
      const status = form.querySelector('.form-status');
      const { name, email } = form.elements;
      let current = null;
      const show = (message, error) => {
        status.className = error ? 'form-status error' : 'form-status';
        status.textContent = message;
      };

      document.querySelectorAll(`a[data-dialog="${kind}"]`).forEach((link) => link.addEventListener('click', (event) => {
        event.preventDefault();
        current = link;
        form.reset();
        form.classList.remove('is-done');
        show('');
        [name, email].forEach((field) => field.removeAttribute('aria-invalid'));
        dialog.querySelector('[data-dialog-title]').textContent = link.dataset.title || '';
        form.elements.guide.value = link.dataset.guide;
        if (form.elements.source) form.elements.source.value = `download-${link.dataset.guide}`;
        form.elements.t.value = Date.now();
        dialog.showModal();
        name.focus();
        track('download_dialog_open', { guide: link.dataset.guide });
      }));

      dialog.querySelector('[data-dialog-close]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
      dialog.querySelector('[data-download-skip]').addEventListener('click', () => {
        if (current) startDownload(current);
        dialog.close();
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        name.setAttribute('aria-invalid', String(!name.value.trim()));
        email.setAttribute('aria-invalid', String(!EMAIL_RE.test(email.value.trim())));
        if (!name.value.trim() || !EMAIL_RE.test(email.value.trim())) {
          show(T.nameEmail, true);
          (name.value.trim() ? email : name).focus();
          return;
        }
        if (current) startDownload(current); // start right away, while the click still counts as a user action
        form.classList.add('is-done');
        show(form.dataset.started);
        try {
          const response = await fetch(form.action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(new FormData(form))),
          });
          if (!response.ok) throw new Error('not saved');
          track(kind === 'lead' ? 'consultation_request' : 'newsletter_signup', { guide: form.elements.guide.value });
          show(form.dataset.done);
        } catch (error) {
          show(`${form.dataset.started} ${T.failed}`, true);
          form.classList.remove('is-done');
        }
      });
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    initMenu();
    initTracking();
    initVideos();
    initContactForm();
    initSubscribeForms();
    initDownloads();
    initCurrency();
    initConsent();
  });
})();
