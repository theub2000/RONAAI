// HERO — main visual: pinned canvas fly-through through the real salon.
//   opening (once per session): logo + pink line -> arch window with the poster -> full bleed
//   scroll: short hold (caption 1) -> near-linear flight (captions 2, 3) -> end highlight
//           (frame settles 1.04 -> 1.0, dark veil, white Löna logo + Booking CTA) -> pin releases
import { QA, reduced, clamp, wait, isNarrow } from '../core/env.js';
import { lockScroll } from '../core/smooth.js';
import { registerQAWait } from '../core/qa.js';

const PIN = { desktop: 3.8, mobile: 3.2 };        // total pin length in viewport heights (owner: fast)
const HOLD0 = 0.3;                                  // initial hold (vh)
const HOLD_END = 0.7;                               // end highlight hold (vh)
// flight t -> sequence position (fractions of the sequence). v2 master (FLIGHT.md): frames 0–211 are the
// ground tour, 211–297 the aerial rise, which gets a little more room. Near-linear otherwise.
const BEATS = [[0, 0], [0.6, 211 / 297], [1, 1]];
const toT = (f) => {                                // inverse of BEATS for caption anchoring
  for (let i = 1; i < BEATS.length; i++) {
    const [ta, fa] = BEATS[i - 1], [tb, fb] = BEATS[i];
    if (f <= fb) return ta + (tb - ta) * ((f - fa) / (fb - fa || 1));
  }
  return 1;
};
const END_LEAD = 0.3;                               // highlight starts this many vh before the hold
const smooth = (t) => t * t * (3 - 2 * t);
const band = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

export function initHero({ header, fabs, tabbar }) {
  const { gsap, ScrollTrigger } = window;
  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const stage = hero.querySelector('.hero__stage');
  const media = hero.querySelector('.hero__media');
  const posterImg = hero.querySelector('.hero__poster img');
  const canvas = hero.querySelector('.hero__canvas');
  const scrim = hero.querySelector('.hero__scrim');
  const dim = hero.querySelector('.hero__dim');
  const monoL = hero.querySelector('.hero__mono-l');
  const monoR = hero.querySelector('.hero__mono-r');
  // caption windows are given in sequence fractions (data-from/to) and mapped through BEATS
  const caps = [...hero.querySelectorAll('.cap')].map((el) => {
    const f0 = parseFloat(el.dataset.from), f1 = parseFloat(el.dataset.to);
    return { el, from: f0 < 0 ? -1 : toT(f0), to: toT(f1), key: el.dataset.chapter };
  });
  const end = hero.querySelector('.hero__end');
  const endLogo = hero.querySelector('.hero__end-logo');
  const ui = hero.querySelector('.hero__ui');
  const skip = hero.querySelector('.hero__skip');
  const barFill = hero.querySelector('.hero__bar i');
  const intro = hero.querySelector('.hero__intro');

  let player = null;
  let lastT = 0;
  let pinLen = 0;
  const vh = () => window.innerHeight;

  /* ---------- per-frame render from scroll progress ---------- */
  function render(p) {
    const H = vh();
    const pos = p * pinLen;
    const flightLen = Math.max(1, pinLen - (HOLD0 + HOLD_END) * H);
    const t = clamp((pos - HOLD0 * H) / flightLen, 0, 1);
    const e = clamp((pos - (pinLen - (HOLD_END + END_LEAD) * H)) / ((HOLD_END + END_LEAD * 0.4) * H), 0, 1);   // end highlight 0..1
    lastT = t;
    if (player) player.setProgress(t);

    // frame push-in during the last 15% of the flight, then settles in the end hold
    const push = band(t, 0.85, 1) * (1 - smooth(e));
    canvas.style.transform = push > 0.001 ? `scale(${(1 + 0.04 * push).toFixed(4)})` : '';

    // captions
    for (const c of caps) {
      const span = c.to - Math.max(0, c.from);
      const fin = c.from < 0 ? 1 : band(t, c.from, c.from + span * 0.22);
      const fout = band(t, c.to - span * 0.22, c.to);
      const o = Math.min(fin, 1 - fout);
      const y = (1 - fin) * 40 - fout * 30;
      c.el.style.opacity = o.toFixed(3);
      c.el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      c.el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }

    // monogram letters part and fade as the flight starts
    const m = smooth(band(t, 0, 0.16));
    const mx = window.innerWidth * 0.12 * m;
    monoL.style.transform = `translate3d(${(-mx).toFixed(1)}px, -50%, 0)`;
    monoR.style.transform = `translate3d(${mx.toFixed(1)}px, -50%, 0)`;
    monoL.style.opacity = monoR.style.opacity = (1 - m).toFixed(3);

    // end highlight
    const ee = smooth(e);
    dim.style.opacity = ee.toFixed(3);
    scrim.style.opacity = (1 - ee).toFixed(3);
    const eo = band(e, 0.25, 0.8);
    end.style.opacity = eo.toFixed(3);
    end.style.visibility = eo > 0.001 ? 'visible' : 'hidden';
    end.style.transform = `translate3d(0, ${((1 - smooth(eo)) * 36).toFixed(1)}px, 0)`;
    endLogo.style.transform = `scale(${(0.94 + 0.06 * smooth(eo)).toFixed(4)})`;
    skip.style.opacity = (0.86 * (1 - band(e, 0, 0.3))).toFixed(3);
    barFill.style.transform = `scaleX(${p.toFixed(4)})`;

    if (p < 0.999) header.set(e > 0.35 ? 'dark' : 'hero');
  }

  /* ---------- pinned scroll ---------- */
  function buildScroll() {
    pinLen = vh() * (isNarrow() ? PIN.mobile : PIN.desktop);
    return ScrollTrigger.create({
      id: 'hero',
      trigger: hero,
      start: 'top top',
      end: () => { pinLen = vh() * (isNarrow() ? PIN.mobile : PIN.desktop); return '+=' + Math.round(pinLen); },
      pin: true,
      scrub: 0.3,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => render(self.progress),
      onRefresh: (self) => render(self.progress),
      onLeave: () => header.set('solid'),
      onEnterBack: (self) => render(self.progress),
    });
  }

  function buildStatic() {                 // reduced motion: poster + first caption, no frames
    caps.forEach((c, i) => { c.el.style.opacity = i === 0 ? '1' : '0'; c.el.style.visibility = i === 0 ? 'visible' : 'hidden'; });
    ScrollTrigger.create({ trigger: hero, start: 'bottom top+=80', onEnter: () => header.set('solid'), onLeaveBack: () => header.set('hero') });
  }

  /* ---------- flight stage ---------- */
  async function mountFlight() {
    if (reduced) return null;
    const { init } = await import('../flight.js');
    const pl = await init(canvas, 'flight/manifest.json', null);
    pl.setBeats(BEATS.map(([t, f]) => ({ t, frame: f * (pl.count - 1) })));
    // captions can be re-anchored from the manifest (frame numbers) when the master changes
    const ch = pl.manifest.chapters;
    if (ch) caps.forEach((c) => {
      if (c.key && ch[c.key]) { c.from = toT(ch[c.key][0] / (pl.count - 1)); c.to = toT(ch[c.key][1] / (pl.count - 1)); }
    });
    pl.onFirstDraw(() => canvas.classList.add('is-live'));
    player = pl;
    pl.setProgress(lastT);
    return pl;
  }

  /* ---------- opening ---------- */
  function archGeometry() {
    const W = stage.clientWidth, H = stage.clientHeight, narrow = W < 700;
    const aw = narrow ? Math.min(W * 0.64, 300) : clamp(W * 0.26, 320, 500);
    const top = Math.round(H * (narrow ? 0.38 : 0.37));
    stage.style.setProperty('--arch-top', top + 'px');
    return { W, H, aw, top, side: (W - aw) / 2 };
  }
  const clipAt = (g, k, open) => {           // k: 0 closed slit -> 1 arch; open: 0 arch -> 1 full bleed
    const side = g.side + (g.aw / 2) * (1 - k);
    const s = side * (1 - open), t = g.top * (1 - open), r = (g.aw / 2) * (1 - open);
    return `inset(${t.toFixed(1)}px ${s.toFixed(1)}px 0px ${s.toFixed(1)}px round ${r.toFixed(1)}px ${r.toFixed(1)}px 0px 0px)`;
  };

  function playOpening() {
    return new Promise((resolve) => {
      lockScroll(true);
      window.scrollTo(0, 0);
      const g = archGeometry();
      const st = { k: 0, open: 0 };
      const apply = () => { media.style.clipPath = clipAt(g, st.k, st.open); };
      apply();
      const logo = intro.querySelector('.hero__intro-logo');
      const line = intro.querySelector('.hero__intro-line');
      const capsEl = hero.querySelector('.hero__caps');
      const posterReady = (posterImg.decode ? posterImg.decode() : Promise.resolve()).catch(() => {});

      const tl = gsap.timeline({ paused: true, onComplete: finish });
      tl.fromTo(logo, { yPercent: 40, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.8, ease: 'expo.out' }, 0)
        .fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power3.inOut' }, 0.3)
        .to(st, { k: 1, duration: 0.55, ease: 'power3.inOut', onUpdate: apply }, 0.62)
        .to(st, { open: 1, duration: 0.8, ease: 'power3.inOut', onUpdate: apply }, 1.25)
        .to(intro, { yPercent: -30, autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, 1.25)
        .fromTo([header.el, fabs, tabbar], { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.05 }, 1.7)
        .fromTo([capsEl, ui], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 1.8)
        .fromTo([monoL, monoR], { opacity: 0 }, { opacity: 1, duration: 0.6 }, 1.75);

      const skipEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
      const skipIt = () => { if (tl.progress() < 1) tl.progress(1); };
      skipEvents.forEach((ev) => window.addEventListener(ev, skipIt, { passive: true }));

      function finish() {
        skipEvents.forEach((ev) => window.removeEventListener(ev, skipIt));
        root.classList.remove('is-opening');
        root.classList.add('no-opening');
        media.style.clipPath = '';
        gsap.set([header.el, fabs, tabbar, capsEl, ui, intro, logo, line], { clearProps: 'all' });
        try { sessionStorage.setItem('lona:opened', '1'); } catch (e) { /* private mode */ }
        lockScroll(false);
        render(0);
        resolve();
      }
      window.__openingStart = performance.now();
      Promise.race([Promise.all([posterReady, document.fonts ? document.fonts.ready : 0]), wait(1500)]).then(() => tl.play());
    });
  }

  /* ---------- boot ---------- */
  let trigger = null;
  if (reduced) buildStatic();
  else trigger = buildScroll();

  const flight = mountFlight().catch(() => null);  // frames missing: poster stays
  registerQAWait(async () => {
    const pl = await flight;
    if (!pl) return;
    if (trigger) render(trigger.progress);
    await pl.whenDrawn();
  });

  const opening = root.classList.contains('is-opening') && !QA.shot && !reduced ? playOpening() : Promise.resolve();
  if (!root.classList.contains('is-opening')) render(0);
  return { opening, trigger, flight };
}
