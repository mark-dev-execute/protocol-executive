// Fluent in Tech — small progressive enhancements. Every page works without this file.
(() => {
  // Conversion events go to Google Analytics when it is configured (SITE.ga_id in build.py).
  const track = (name, params = {}) => {
    try { window.gtag?.('event', name, { page_location: location.pathname, ...params }); } catch (e) { /* analytics is optional */ }
  };

  // Interface text for the Spanish pages (html lang="es").
  const SPANISH = document.documentElement.lang === 'es';
  const T = SPANISH ? {
    fields: 'Completa los campos marcados.',
    mailto: (email) => `Tu aplicación de correo debería abrirse con el mensaje listo para enviar. Si no se abre, escribe directamente a ${email}.`,
    invalidEmail: 'Introduce un email válido.',
    failed: 'Algo ha fallado. Inténtalo de nuevo.',
    sending: 'Enviando…',
    leadThanks: 'Gracias. Mark te escribirá para organizar tu consulta gratuita.',
    fxNote: (date, rate) => `Los precios se fijan en dólares estadounidenses. Los importes en euros son aproximados, según el tipo de cambio de referencia del Banco Central Europeo del ${date} (1 USD = ${rate} EUR).`,
  } : {
    fields: 'Please complete the highlighted fields.',
    mailto: (email) => `Your email app should open with your message ready to send. If nothing opens, email ${email} directly.`,
    invalidEmail: 'Please enter a valid email address.',
    failed: 'Something went wrong. Please try again.',
    sending: 'Sending…',
    leadThanks: 'Thanks — Mark will email you to arrange your free consultation.',
    fxNote: (date, rate) => `Prices are set in US dollars. Euro amounts are approximate, converted at the European Central Bank reference rate of ${date} (1 USD = ${rate} EUR).`,
  };
  const LOCALE = SPANISH ? 'es-ES' : 'en-US';

  const store = {
    get: (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } },
  };

  // Prices are set in USD. The currency switch also shows them in euros, at the
  // European Central Bank rate served by /api/rates (kept in the browser for 12 hours).
  // Visitors on Spanish pages or in a euro-area time zone see euros first.
  const FX_KEY = 'fit-fx';
  const CURRENCY_KEY = 'fit-currency';
  const EURO_ZONES = /^(Europe\/(Madrid|Paris|Berlin|Rome|Amsterdam|Brussels|Vienna|Dublin|Lisbon|Helsinki|Athens|Luxembourg|Bratislava|Ljubljana|Tallinn|Riga|Vilnius|Zagreb|Malta|Monaco|Andorra|San_Marino|Vatican|Busingen|Nicosia)|Atlantic\/(Canary|Madeira|Azores)|Africa\/Ceuta|Asia\/Nicosia)$/;
  const HOUR = 3600 * 1000;

  const preferredCurrency = () => {
    const saved = store.get(CURRENCY_KEY);
    if (saved === 'USD' || saved === 'EUR') return saved;
    if (SPANISH) return 'EUR';
    try { return EURO_ZONES.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'EUR' : 'USD'; } catch (e) { return 'USD'; }
  };

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
      if (currency === 'USD') {
        el.textContent = el.dataset.original;
        el.removeAttribute('title');
        return;
      }
      const [low, high] = el.dataset.usd.split('-').map(convert);
      const range = !high ? euros(low, true)
        : SPANISH ? `${euros(low)}–${euros(high, true)}` : `${euros(low, true)}–${euros(high)}`;
      el.textContent = `≈\u00a0${range}`;
      el.title = el.dataset.original.trim() + (SPANISH ? '' : ' (USD)');
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

  // Google Analytics runs only after the visitor accepts the cookie banner. Until then
  // (and after "Reject") nothing is requested from Google. "Cookie settings" in the
  // footer reopens the banner. The ID comes from <html data-ga> (SITE.ga_id in build.py).
  const GA_ID = document.documentElement.dataset.ga;
  const CONSENT_KEY = 'fit-analytics-consent';

  const loadAnalytics = () => {
    if (!GA_ID || window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); }; // gtag.js expects the arguments object
    window.gtag('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(script);
  };

  const initConsent = () => {
    const banner = document.querySelector('[data-consent]');
    if (!GA_ID || !banner) return;
    const choice = store.get(CONSENT_KEY);
    if (choice === 'granted') loadAnalytics();
    else if (choice !== 'denied') banner.hidden = false;

    banner.querySelectorAll('[data-consent-choice]').forEach((button) => button.addEventListener('click', () => {
      const value = button.dataset.consentChoice;
      const wasGranted = store.get(CONSENT_KEY) === 'granted';
      store.set(CONSENT_KEY, value);
      banner.hidden = true;
      if (value === 'granted') loadAnalytics();
      else if (wasGranted) location.reload(); // withdrawing consent: reload so Google's tag is no longer on the page
    }));
    document.querySelectorAll('[data-consent-open]').forEach((button) => button.addEventListener('click', () => {
      banner.hidden = false;
      banner.querySelector('[data-consent-choice]').focus();
    }));
  };

  const initMenu = () => {
    const button = document.querySelector('[data-menu]');
    const links = document.getElementById('nav-links');
    if (!button || !links) return;
    button.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
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

  const SERVICES = {
    interview: 'Career & interview coaching',
    communication: 'Professional communication',
    leadership: 'Leadership & executive coaching',
    corporate: 'Corporate program',
    cohort: 'Group or cohort program',
    business: 'Business coaching',
  };

  const initBookingForm = () => {
    const form = document.querySelector('[data-booking-form]');
    if (!form) return;
    const status = form.querySelector('.form-status');
    const preset = SERVICES[new URLSearchParams(location.search).get('service')];
    if (preset) form.elements.service.value = preset;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        status.className = 'form-status error';
        status.textContent = T.fields;
        return;
      }
      const data = new FormData(form);
      const email = form.dataset.email;
      const subject = `Coaching enquiry — ${data.get('service')}`;
      const body = [
        `Name: ${data.get('name')}`,
        `Email: ${data.get('email')}`,
        `Service: ${data.get('service')}`,
        `Interview date: ${data.get('interview-date') || 'Not supplied'}`,
        '',
        data.get('message'),
      ].join('\n');
      track('booking_submitted', { service: data.get('service') });
      status.className = 'form-status';
      status.textContent = T.mailto(email);
      location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
      if (returned === '1') show('You’re in — new guides will arrive in your inbox.');
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
          show(result.message || 'You’re in — new guides will arrive in your inbox.');
        } catch (error) {
          show(error.message || T.failed, true);
        } finally {
          button.disabled = false;
        }
      });
    });
  };

  // Program guide downloads: the PDF downloads straight away, then an optional
  // free-consultation request opens (saved by /api/lead). Shown once per visit.
  const LEAD_DONE = 'fit-lead-done';
  const leadDone = () => { try { return sessionStorage.getItem(LEAD_DONE) === '1'; } catch (e) { return false; } };
  const markLeadDone = () => { try { sessionStorage.setItem(LEAD_DONE, '1'); } catch (e) { /* storage unavailable */ } };

  const initLeadDialog = () => {
    const dialog = document.querySelector('[data-lead-dialog]');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const form = dialog.querySelector('[data-lead-form]');
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    const show = (message, error) => {
      status.className = error ? 'form-status error' : 'form-status';
      status.textContent = message;
    };

    document.querySelectorAll('a[data-guide]').forEach((link) => link.addEventListener('click', () => {
      if (leadDone()) return;
      form.reset();
      form.classList.remove('is-done');
      show('');
      form.elements.guide.value = link.dataset.guide;
      form.elements.t.value = Date.now();
      setTimeout(() => dialog.showModal(), 250); // let the download start first
    }));

    dialog.querySelectorAll('[data-lead-close]').forEach((el) => el.addEventListener('click', () => {
      markLeadDone();
      dialog.close();
    }));
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        show(T.invalidEmail, true);
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
        track('consultation_request', { guide: form.elements.guide.value });
        markLeadDone();
        form.classList.add('is-done');
        show(SPANISH ? T.leadThanks : result.message || T.leadThanks);
      } catch (error) {
        show(error.message || T.failed, true);
      } finally {
        button.disabled = false;
      }
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    initMenu();
    initTracking();
    initVideos();
    initBookingForm();
    initSubscribeForms();
    initLeadDialog();
    initCurrency();
    initConsent();
  });
})();
