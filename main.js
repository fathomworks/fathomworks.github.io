// Fathom website: scroll-driven storytelling with GSAP ScrollTrigger.
// Everything reads fine without JavaScript; with "reduce motion" on, the dive turns into still
// pictures and nothing moves on scroll.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---- Navigation bar: transparent over the hero, then dark or light to match the section below.
  const nav = $('#nav');
  const darkSections = $$('.hero, .gallery, .private, .final, .footer');
  function updateNav() {
    const y = nav.offsetHeight / 2;
    const overDark = darkSections.some((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= y && r.bottom >= y;
    });
    const atTop = window.scrollY < 40;
    nav.classList.toggle('is-dark', overDark && !atTop);
    nav.classList.toggle('is-solid', !overDark);
  }
  let navQueued = false;
  window.addEventListener('scroll', () => {
    if (navQueued) return;
    navQueued = true;
    requestAnimationFrame(() => { navQueued = false; updateNav(); });
  }, { passive: true });
  window.addEventListener('resize', updateNav);
  updateNav();

  // ---- The dive. Each level is drawn in its own coordinates around the zoom point and is 100×
  // deeper than the one before, so no transform ever gets huge (the app's engine does the same).
  const LEVEL_STEP = 100;
  const FADE_FROM = 50;
  const HIDE_AT = 85;

  function renderDive(svg, lz) {
    const z = Math.pow(10, lz);
    for (const g of svg.querySelectorAll('.lv')) {
      const s = z / Math.pow(LEVEL_STEP, Number(g.dataset.level));
      if (s < 1e-3 || s > HIDE_AT) {
        g.style.display = 'none';
        continue;
      }
      g.style.display = '';
      g.setAttribute('transform', `scale(${s})`);
      g.setAttribute('opacity', s > FADE_FROM ? String(1 - (s - FADE_FROM) / (HIDE_AT - FADE_FROM)) : '1');
    }
    // Two dot grids that keep their size on screen, like the paper grid in the app.
    const frac = lz - Math.floor(lz);
    const f = Math.pow(10, frac);
    const [a, b] = svg.querySelectorAll('pattern');
    a.setAttribute('patternTransform', `scale(${f})`);
    b.setAttribute('patternTransform', `scale(${f / 10})`);
    svg.querySelector('.dots--a').setAttribute('opacity', String(1 - frac));
    svg.querySelector('.dots--b').setAttribute('opacity', String(frac));
    return z;
  }

  function formatZoom(z) {
    if (z < 10) return '×' + (Math.round(z * 10) / 10).toString();
    const digits = Math.floor(Math.log10(z)) - 1;
    const rounded = Math.round(z / Math.pow(10, digits)) * Math.pow(10, digits);
    return '×' + rounded.toLocaleString('en-US');
  }

  const dive = $('.dive');
  const stage = $('#stage');
  const stageSvg = $('.stage__svg', stage);
  const zoomChip = $('#zoomChip');
  const gaugeFill = $('#gaugeFill');
  const steps = $$('#diveSteps li');
  let activeStep = 0;

  function setDive(lz) {
    const z = renderDive(stageSvg, lz);
    zoomChip.textContent = formatZoom(z);
    gaugeFill.style.height = `${(lz / 6) * 100}%`;
    const step = Math.min(steps.length - 1, Math.round(lz / 2));
    if (step !== activeStep) {
      steps[activeStep].classList.remove('is-active');
      steps[step].classList.add('is-active');
      activeStep = step;
    }
  }
  setDive(0);

  // Reduced motion (or no GSAP): four still pictures of the dive, one per step.
  function buildStills() {
    const holder = document.createElement('div');
    holder.className = 'dive__stills';
    steps.forEach((li, i) => {
      const fig = document.createElement('figure');
      fig.className = 'still';
      fig.style.margin = '0';
      const copy = stage.cloneNode(true);
      copy.removeAttribute('id');
      for (const el of copy.querySelectorAll('[id]')) {
        const id = el.id;
        el.id = `${id}-${i}`;
        for (const ref of copy.querySelectorAll(`[fill="url(#${id})"]`)) ref.setAttribute('fill', `url(#${id}-${i})`);
      }
      const svg = copy.querySelector('.stage__svg');
      svg.setAttribute('aria-label', li.textContent.trim());
      const lz = Number(li.dataset.z);
      const z = renderDive(svg, lz);
      copy.querySelector('.chip--zoom span').textContent = formatZoom(z);
      copy.querySelector('.gauge__fill').style.height = `${(lz / 6) * 100}%`;
      fig.appendChild(copy);
      const cap = document.createElement('figcaption');
      cap.textContent = li.querySelector('strong').textContent;
      fig.appendChild(cap);
      holder.appendChild(fig);
    });
    dive.appendChild(holder);
    dive.classList.add('is-still');
    return () => { holder.remove(); dive.classList.remove('is-still'); };
  }

  // ---- Pen drawing: the cell draws itself as you scroll, with a pen nib at the tip.
  const penSvg = $('#penSvg');
  const penArt = $('.pen__art');
  const nib = $('#penNib');
  const drawPaths = $$('.draw', penSvg).map((p) => ({ el: p, len: p.getTotalLength() }));
  const totalLen = drawPaths.reduce((sum, p) => sum + p.len, 0);
  const penLabels = $$('.hand', penSvg);

  function drawPen(progress) {
    let remaining = progress * totalLen;
    let tip = null;
    for (const p of drawPaths) {
      const drawn = Math.max(0, Math.min(p.len, remaining));
      p.el.style.strokeDasharray = `${p.len} ${p.len}`;
      p.el.style.strokeDashoffset = String(p.len - drawn);
      if (drawn > 0 && drawn < p.len) tip = p.el.getPointAtLength(drawn);
      remaining -= p.len;
    }
    penLabels.forEach((t) => t.setAttribute('opacity', String(Math.max(0, Math.min(1, (progress - .82) / .12)))));
    if (!tip) { nib.style.opacity = '0'; return; }
    const svgBox = penSvg.getBoundingClientRect();
    const artBox = penArt.getBoundingClientRect();
    const k = svgBox.width / 600;
    const x = svgBox.left - artBox.left + tip.x * k;
    const y = svgBox.top - artBox.top + tip.y * k;
    // The nib is 5% of the drawing wide and four times as tall; its tip is 15/16 of the way down.
    const w = artBox.width * .05;
    nib.style.opacity = '1';
    nib.style.transform = `translate(${x - w / 2}px, ${y - w * 4 * .9375}px) rotate(24deg)`;
  }

  // ---- PDF reader story: the screenshot zooms to what each step talks about.
  const studyImg = $('#studyImg');
  const studySpot = $('#studySpot');
  const studySteps = $$('.study__step');
  // x0/y0: top-left of the part shown, s: zoom, spot: highlight box in the shown frame (fractions).
  const studyFocus = [
    { s: 1, x0: 0, y0: 0, spot: null },
    { s: 2, x0: .5, y0: .123, spot: [.458, .326, .422, .468] },
    { s: 1.6, x0: .0175, y0: .0375, spot: [.212, .092, .576, .752] },
  ];

  function hasGsap() {
    return typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  }

  if (!hasGsap()) {
    // The CDN didn't load: keep the page static and readable.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) buildStills();
    drawPen(1);
    studySteps.forEach((s) => s.classList.add('is-active'));
    return;
  }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();

  mm.add({
    motion: '(prefers-reduced-motion: no-preference)',
    reduce: '(prefers-reduced-motion: reduce)',
    wide: '(min-width: 901px)',
  }, (ctx) => {
    const { motion, wide } = ctx.conditions;

    if (!motion) {
      const undoStills = buildStills();
      setDive(0);
      drawPen(1);
      studySteps.forEach((s) => s.classList.add('is-active'));
      return () => {
        undoStills();
        studySteps.forEach((s) => s.classList.remove('is-active'));
      };
    }

    // Hero: words rise in, the tablet lies down flat as it scrolls up.
    gsap.from('.hero__title .line', { yPercent: 40, opacity: 0, duration: 1, ease: 'power3.out', stagger: .12 });
    gsap.from('.pill, .hero__lede, .hero__ctas', { y: 18, opacity: 0, duration: .9, ease: 'power2.out', stagger: .1, delay: .35 });
    gsap.fromTo('#heroDevice',
      { rotateX: 26, scale: .9, y: 30 },
      { rotateX: 0, scale: 1, y: 0, ease: 'none', scrollTrigger: { trigger: '.hero__device', start: 'top bottom', end: 'top 20%', scrub: true } });
    gsap.to('.hero__copy', { yPercent: -18, opacity: .2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 30%', scrub: true } });

    // The dive: pinned, scroll zooms from ×1 to ×1,000,000 with a pause at each step.
    dive.classList.add('is-pinnable');
    const depth = { lz: 0 };
    const zoomTo = (lz) => ({ lz, duration: 1, ease: 'power2.inOut' });
    const hold = (lz, duration = .35) => ({ lz, duration });
    const diveTl = gsap.timeline({
      defaults: { onUpdate: () => setDive(depth.lz) },
      scrollTrigger: { trigger: '.dive', start: 'top top', end: () => `+=${window.innerHeight * 3.6}`, pin: '.dive__pin', scrub: .6, anticipatePin: 1, invalidateOnRefresh: true },
    });
    diveTl.to(depth, hold(0, .3)).to(depth, zoomTo(2)).to(depth, hold(2)).to(depth, zoomTo(4)).to(depth, hold(4)).to(depth, zoomTo(6)).to(depth, hold(6, .45));

    // Pen drawing, scrubbed.
    const pen = { p: 0 };
    drawPen(0);
    gsap.to(pen, {
      p: 1, ease: 'none', onUpdate: () => drawPen(pen.p),
      scrollTrigger: { trigger: '.pen__art', start: 'top 85%', end: 'center 40%', scrub: .4 },
    });

    // PDF story: wide screens zoom the screenshot to each step.
    if (wide) {
      gsap.set(studyImg, { transformOrigin: '0 0' });
      const focus = (i) => {
        const f = studyFocus[i];
        gsap.to(studyImg, { scale: f.s, xPercent: -f.x0 * 100 * f.s, yPercent: -f.y0 * 100 * f.s, duration: .9, ease: 'power3.inOut', overwrite: true });
        if (f.spot) {
          const [l, t, w, h] = f.spot;
          gsap.to(studySpot, { left: `${l * 100}%`, top: `${t * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, opacity: 1, duration: .9, ease: 'power3.inOut', overwrite: true });
        } else {
          gsap.to(studySpot, { opacity: 0, duration: .4, overwrite: true });
        }
      };
      studySteps.forEach((step, i) => {
        ScrollTrigger.create({
          trigger: step, start: 'top 62%', end: 'bottom 62%',
          onToggle: (self) => {
            if (!self.isActive) return;
            studySteps.forEach((s) => s.classList.toggle('is-active', s === step));
            focus(i);
          },
        });
      });
      studySteps[0].classList.add('is-active');
    } else {
      studySteps.forEach((s) => s.classList.add('is-active'));
    }

    // Section headings and cards rise in.
    for (const el of $$('.pen .eyebrow, .pen .h2, .pen .lede, .ticks li, .study > .wrap:first-child > *, .features > .eyebrow, .features > .h2, .gallery__head > *, .private .h2, .private .eyebrow, .pricing > .eyebrow, .pricing > .h2, .faq > .h2, .final__inner > *')) {
      gsap.from(el, { y: 28, opacity: 0, duration: .8, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    }
    gsap.set('.card, .plan, .private__list li, .faq details', { y: 34, opacity: 0 });
    ScrollTrigger.batch('.card, .plan, .private__list li, .faq details', {
      start: 'top 90%', once: true,
      onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, duration: .8, ease: 'power3.out', stagger: .08 }),
    });

    // Gallery: wide screens scroll the screenshots sideways while the section is pinned.
    if (wide) {
      const track = $('#galleryTrack');
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      gsap.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: { trigger: '.gallery', start: 'top top', end: () => `+=${distance()}`, pin: '.gallery__pin', scrub: .5, invalidateOnRefresh: true },
      });
    }

    return () => {
      dive.classList.remove('is-pinnable');
      setDive(0);
    };
  });

  // Fonts change text widths, so measure again once they're in.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
