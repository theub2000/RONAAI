// Lenis smooth scroll wired into GSAP's ticker (single rAF loop).
let lenis = null;

export function initSmooth(enabled) {
  const { gsap, ScrollTrigger } = window;
  if (!enabled || typeof window.Lenis !== 'function') return null;
  lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export const getLenis = () => lenis;

export function lockScroll(on) {
  document.documentElement.classList.toggle('is-locked', on);
  if (lenis) (on ? lenis.stop() : lenis.start());
}

export function scrollToY(y, { immediate = false, duration = 1.4 } = {}) {
  if (lenis) lenis.scrollTo(y, { immediate, duration });
  else window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' });
}

export function scrollToTarget(target, { offset = 0, immediate = false } = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  // pinned sections: resolve through their ScrollTrigger start when there is one
  const st = window.ScrollTrigger && window.ScrollTrigger.getAll().find((s) => s.trigger === el && s.pin);
  const y = st ? st.start : el.getBoundingClientRect().top + window.scrollY + offset;
  scrollToY(Math.max(0, y), { immediate, duration: 1.6 });
}
