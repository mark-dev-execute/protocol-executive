// Fluent in Tech — small progressive enhancements. Every page works without this file.
(() => {
  // Conversion events go to Google Analytics when it is configured (SITE.ga_id in build.py).
  const track = (name, params = {}) => {
    try { window.gtag?.('event', name, { page_location: location.pathname, ...params }); } catch (e) { /* analytics is optional */ }
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
        status.textContent = 'Please complete the highlighted fields.';
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
      status.textContent = `Your email app should open with your message ready to send. If nothing opens, email ${email} directly.`;
      location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    initMenu();
    initTracking();
    initVideos();
    initBookingForm();
  });
})();
