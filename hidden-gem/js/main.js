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

  // --- Beta Care-Fit Quiz ---
  const quiz = document.getElementById('quiz');
  if (quiz) initCareQuiz(quiz);

});

function initCareQuiz(root) {
  const stepEls = Array.from(root.querySelectorAll('.quiz-step'));
  const totalEl = root.querySelector('[data-quiz-total]');
  const currentEl = root.querySelector('[data-quiz-current]');
  const fillEl = root.querySelector('[data-quiz-progress]');
  const resultsEl = root.querySelector('[data-quiz-results]');

  // Step indices: questions are 1..8, results step has data-step="results".
  // hasKidsContext() controls whether step 7 is shown.
  let currentIdx = 0;  // pointer into the dynamic step list

  function hasKidsContext() {
    const q1 = root.querySelector('input[name="q1"]:checked');
    return q1 && (q1.value === 'child' || q1.value === 'family');
  }

  function visibleSteps() {
    // Steps 1..8 + results, but skip step 7 if no kids context.
    return stepEls.filter(step => {
      if (step.dataset.stepConditional === 'kids' && !hasKidsContext()) return false;
      return true;
    });
  }

  function show(idx) {
    const list = visibleSteps();
    idx = Math.max(0, Math.min(idx, list.length - 1));
    currentIdx = idx;
    stepEls.forEach(s => s.classList.remove('is-active'));
    list[idx].classList.add('is-active');

    // Progress: count only question steps (exclude results).
    const questionSteps = list.filter(s => s.dataset.step !== 'results');
    const totalQuestions = questionSteps.length;
    const isResults = list[idx].dataset.step === 'results';
    const currentNum = isResults ? totalQuestions : idx + 1;
    if (totalEl) totalEl.textContent = totalQuestions;
    if (currentEl) currentEl.textContent = currentNum;
    if (fillEl) fillEl.style.width = (currentNum / totalQuestions * 100) + '%';

    // Scroll the quiz card into view smoothly on advance (not on first show).
    if (idx > 0) {
      const card = root.querySelector('.quiz-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Update Back button state.
    const back = list[idx].querySelector('[data-quiz-back]');
    if (back) back.disabled = idx === 0;
  }

  function validate(step) {
    // Every question requires at least one selection. Results step is OK.
    if (step.dataset.step === 'results') return true;
    return !!step.querySelector('input:checked');
  }

  function computeMatches() {
    const tally = {
      'sara-psych': 0, 'sara-equine': 0, 'sara-ketamine': 0,
      abbey: 0, 'abbey-migraine': 0, sam: 0, keira: 0
    };
    root.querySelectorAll('input:checked').forEach(input => {
      const label = input.closest('.quiz-option');
      if (!label) return;
      const tags = (label.dataset.match || '').trim().split(/\s+/).filter(Boolean);
      tags.forEach(t => { if (t in tally) tally[t]++; });
    });
    return Object.entries(tally)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);
  }

  const RESULT_COPY = {
    'sara-psych': {
      title: 'Mental Health',
      provider: 'Sara Jones, PMHNP-BC',
      href: 'sara-psychiatric.html',
      ctaText: 'Learn more',
      fit: 'Whole-person psychiatric care, EMDR-informed therapy, and thoughtful medication management — one provider holding the full picture.'
    },
    'sara-equine': {
      title: 'Equine-Assisted Psychotherapy',
      provider: 'Sara Jones, PMHNP-BC',
      href: 'sara-equine.html',
      ctaText: 'Learn more',
      fit: 'Trauma-informed therapy outdoors with horses. Honest, nonjudgmental reflection for people who want something different than a couch.'
    },
    'sara-ketamine': {
      title: 'Ketamine-Assisted Psychotherapy',
      provider: 'Sara Jones — Coming Soon',
      href: 'sara-psychiatric.html',
      ctaText: 'Join waitlist',
      comingSoon: true,
      fit: 'A new path being added for treatment-resistant depression, anxiety, and trauma. Sublingual, therapist-guided, 6-session series.'
    },
    abbey: {
      title: 'Integrative Primary Care',
      provider: 'Abbey Lind, FNP-C',
      href: 'abbey.html',
      ctaText: 'Learn more',
      fit: 'Root-cause work for hormones, metabolism, fatigue, brain fog, and the labs most providers don’t order. 60–90 minute appointments.'
    },
    'abbey-migraine': {
      title: 'Migraines (Botox)',
      provider: 'Abbey Lind, FNP-C',
      href: 'abbey.html#specialties',
      ctaText: 'Learn more',
      fit: 'FDA-approved Botox protocol for chronic migraines, paired with root-cause investigation of triggers.'
    },
    sam: {
      title: 'Pediatric Primary Care',
      provider: 'Samantha Hubert, CPNP-PC — Coming Soon',
      href: 'sam-pediatric.html',
      ctaText: 'Join waitlist',
      comingSoon: true,
      fit: 'Whole-child primary care from birth through adulthood. Pediatric ICU-trained NP joining the practice soon.'
    },
    keira: {
      title: 'Aesthetics & Regenerative Medicine',
      provider: 'Keira Spencer, FNP-C — Coming Soon',
      href: 'keira-aesthetics.html',
      ctaText: 'Get notified',
      comingSoon: true,
      fit: 'Injectable aesthetics, advanced migraine treatment, and regenerative medicine. Launching with the Hidden Gem aesthetic.'
    }
  };

  function renderResults() {
    const matches = computeMatches();
    if (matches.length === 0) {
      resultsEl.innerHTML =
        '<div class="quiz-result-card">'
        + '<div class="quiz-result-title">Let’s talk first</div>'
        + '<div class="quiz-result-provider">Elena · First call</div>'
        + '<p class="quiz-result-fit">Sounds like a short call would help us point you at the right care. Elena can listen and route you to whichever provider fits best.</p>'
        + '<a class="quiz-result-cta" href="about.html#contact">Book a 15-min consult →</a>'
        + '</div>';
      return;
    }
    resultsEl.innerHTML = matches.map(tag => {
      const r = RESULT_COPY[tag];
      if (!r) return '';
      const csClass = r.comingSoon ? ' is-comingsoon' : '';
      return ''
        + '<div class="quiz-result-card' + csClass + '">'
        + '<div class="quiz-result-title">' + r.title + '</div>'
        + '<div class="quiz-result-provider">' + r.provider + '</div>'
        + '<p class="quiz-result-fit">' + r.fit + '</p>'
        + '<a class="quiz-result-cta" href="' + r.href + '">' + r.ctaText + ' →</a>'
        + '</div>';
    }).join('');
  }

  root.addEventListener('click', (e) => {
    const next = e.target.closest('[data-quiz-next]');
    const back = e.target.closest('[data-quiz-back]');
    const restart = e.target.closest('[data-quiz-restart]');
    if (next) {
      const list = visibleSteps();
      const step = list[currentIdx];
      if (!validate(step)) {
        step.querySelector('.quiz-options').animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' },
           { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
          { duration: 240 }
        );
        return;
      }
      const targetIdx = currentIdx + 1;
      const target = list[targetIdx];
      if (target && target.dataset.step === 'results') renderResults();
      show(targetIdx);
    } else if (back) {
      show(currentIdx - 1);
    } else if (restart) {
      root.querySelectorAll('input').forEach(i => { i.checked = false; });
      show(0);
    }
  });

  // Initial render
  show(0);
}
