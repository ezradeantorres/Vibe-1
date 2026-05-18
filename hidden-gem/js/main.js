/* ============================================
   Hidden Gem Healing — Main JavaScript
   Nav, mobile menu, FAQ, scroll reveal,
   active nav, form handling (multi-page)
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // --- Nav scroll effect ---
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });

  // --- Mobile menu toggle ---
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
      });
    });
  }

  // --- Active nav state ---
  const page = document.body.dataset.page;
  // Map body data-page values to the nav-links data-nav key whose
  // underline should light up. All five service pages activate the
  // single "Services" dropdown trigger.
  const navKeyForPage = {
    home: 'home',
    about: 'about',
    'sara-psych': 'services',
    'sara-equine': 'services',
    abbey: 'services',
    sam: 'services',
    keira: 'services'
  };
  if (page) {
    // Direct match (data-nav="<page>")
    document.querySelectorAll('[data-nav]').forEach(link => {
      if (link.dataset.nav === page) link.classList.add('active');
    });
    // Mapped key (the Services trigger lights up for any service sub-page)
    const mapped = navKeyForPage[page];
    if (mapped) {
      const link = document.querySelector('.nav-links [data-nav="' + mapped + '"]');
      if (link) {
        link.classList.add('active');
        const wrap = link.closest('.nav-dropdown');
        if (wrap) wrap.classList.add('active');
      }
    }
  }

  // --- Dropdown ARIA state (hover + focus-within toggles aria-expanded) ---
  document.querySelectorAll('.nav-dropdown').forEach(dd => {
    const trigger = dd.querySelector('[aria-haspopup="true"]');
    if (!trigger) return;
    const setExpanded = (open) => trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    dd.addEventListener('mouseenter', () => setExpanded(true));
    dd.addEventListener('mouseleave', () => setExpanded(false));
    dd.addEventListener('focusin', () => setExpanded(true));
    dd.addEventListener('focusout', (e) => {
      if (!dd.contains(e.relatedTarget)) setExpanded(false);
    });
  });

  // --- FAQ accordion ---
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.parentElement;
      const list = item.closest('.faq-list');
      const wasOpen = item.classList.contains('open');
      if (list) list.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  // --- Scroll reveal (IntersectionObserver) ---
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '-40px' });
    revealEls.forEach(el => observer.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('visible'));
  }

  // --- Smooth scroll for SAME-PAGE anchor links only ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Provider pre-selection from URL params ---
  const params = new URLSearchParams(window.location.search);
  const providerParam = params.get('provider');
  const providerSelect = document.querySelector('select[name="provider"]');
  if (providerParam && providerSelect) {
    for (const opt of providerSelect.options) {
      if (opt.value.toLowerCase().includes(providerParam.toLowerCase())) {
        opt.selected = true;
        break;
      }
    }
  }

  // --- Form success state ---
  if (params.get('submitted') === 'true') {
    const form = document.getElementById('contact-form');
    if (form) {
      form.innerHTML = `
        <div class="form-success">
          <div class="success-icon">&#10003;</div>
          <h3>Request Received</h3>
          <p>Thank you for reaching out. Elena will call you shortly to confirm your appointment.</p>
        </div>
      `;
    }
  }

});
