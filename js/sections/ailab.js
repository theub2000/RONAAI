// AI BEAUTY LAB (page B): lazy-mounts the on-device module when it comes near the viewport.
import { registerQAWait } from '../core/qa.js';

const BOOKING = 'https://m.booking.naver.com/booking/13/bizes/515276';

export function initAILab() {
  const mount = document.getElementById('ai-lab');
  if (!mount) return;
  const { ScrollTrigger } = window;
  let lab = null, started = false;

  const start = async () => {
    if (started) return;
    started = true;
    try {
      const { mountAIMakeup } = await import('../../ai-lab/ai-makeup.js');
      mount.querySelector('.ailab__placeholder')?.remove();
      lab = await mountAIMakeup(mount, {
        assetBase: 'ai-lab/',
        samplePhotos: [1, 2, 3, 4, 5].map((n) => ({ src: `ai-lab/samples/sample-0${n}.jpg`, label: `샘플 ${n}` })),
        bookingUrl: BOOKING,
        showHeader: false,
      });
      window.__lab = lab;
    } catch (e) {
      console.warn('[ai-lab] mount failed', e);
    } finally {
      mount.setAttribute('aria-busy', 'false');
      ScrollTrigger && ScrollTrigger.refresh();
    }
  };

  // the module changes height as it loads: keep pinned sections below in sync
  let t = 0, lastH = mount.offsetHeight;
  new ResizeObserver(() => {
    const h = mount.offsetHeight;
    if (Math.abs(h - lastH) < 2) return;
    lastH = h;
    clearTimeout(t);
    t = setTimeout(() => ScrollTrigger && ScrollTrigger.refresh(), 150);
  }).observe(mount);

  const io = new IntersectionObserver((ents) => {
    if (ents.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '800px 0px' });
  io.observe(mount);

  registerQAWait(() => (new URLSearchParams(location.search).get('s') === 'ai-beauty' ? start() : null));
}
