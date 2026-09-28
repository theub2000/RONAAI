// STYLED BY LÖNA — lookbook track.
// desktop: pinned, vertical scroll rolls the track sideways (scrub), per-card parallax, drag + arrows.
// mobile: native swipe with scroll-snap, progress follows the swipe.
import { reduced } from '../core/env.js';
import { getLenis, scrollToY } from '../core/smooth.js';

export function initStyled() {
  const { gsap, ScrollTrigger } = window;
  const section = document.querySelector('.styled');
  if (!section) return;
  const pin = section.querySelector('.styled__pin');
  const viewport = section.querySelector('.styled__viewport');
  const track = section.querySelector('.styled__track');
  const cards = [...track.children];
  const imgs = cards.map((c) => c.querySelector('img'));
  const railFill = section.querySelector('.rail i');
  const countEl = section.querySelector('.styled__count b');
  const [prevBtn, nextBtn] = section.querySelectorAll('.arrows__btn');
  const n = cards.length;
  let current = -1;

  const setIndex = (p) => {
    railFill.style.transform = `scaleX(${Math.max(0.1, p).toFixed(4)})`;
    const i = Math.min(n - 1, Math.round(p * (n - 1)));
    if (i !== current) {
      current = i;
      countEl.textContent = String(i + 1).padStart(2, '0');
      prevBtn.disabled = p <= 0.001;
      nextBtn.disabled = p >= 0.999;
    }
  };

  const mm = gsap.matchMedia();

  mm.add('(min-width: 900px)', () => {
    if (reduced) return;
    section.classList.add('is-pinned');
    let dist = 0;
    const measure = () => { dist = Math.max(0, track.scrollWidth - viewport.clientWidth); };
    measure();
    ScrollTrigger.addEventListener('refreshInit', measure);

    const move = gsap.to(track, {
      x: () => -dist, ease: 'none',
      scrollTrigger: {
        id: 'styled', trigger: section, start: 'top top', end: () => '+=' + Math.round(dist * 1.1),
        pin: pin, scrub: 0.4, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: (self) => setIndex(self.progress),
        onRefresh: (self) => setIndex(self.progress),
      },
    });
    const st = move.scrollTrigger;

    imgs.forEach((img) => {
      gsap.fromTo(img, { xPercent: 6 }, {
        xPercent: -6, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, containerAnimation: move, start: 'left right', end: 'right left', scrub: true },
      });
    });

    // arrows: one card per click
    const step = () => (cards[1].offsetLeft - cards[0].offsetLeft) / Math.max(1, dist) * (st.end - st.start);
    const onArrow = (dir) => scrollToY(Math.min(st.end, Math.max(st.start, window.scrollY + dir * step())), { duration: 1 });
    const a = () => onArrow(-1), b = () => onArrow(1);
    prevBtn.addEventListener('click', a);
    nextBtn.addEventListener('click', b);

    // drag with the mouse: horizontal drag -> page scroll
    let startX = 0, startY = 0, dragging = false, moved = false;
    const down = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true; moved = false; startX = e.clientX; startY = window.scrollY;
      viewport.setPointerCapture(e.pointerId);
      section.classList.add('is-dragging');
    };
    const moveH = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      const ratio = (st.end - st.start) / Math.max(1, dist);
      const y = Math.min(st.end, Math.max(st.start, startY - dx * ratio * 1.2));
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
    };
    const up = () => { dragging = false; section.classList.remove('is-dragging'); };
    const click = (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } };
    viewport.addEventListener('pointerdown', down);
    viewport.addEventListener('pointermove', moveH);
    viewport.addEventListener('pointerup', up);
    viewport.addEventListener('pointercancel', up);
    viewport.addEventListener('click', click, true);
    viewport.addEventListener('dragstart', (e) => e.preventDefault());

    return () => {
      section.classList.remove('is-pinned');
      ScrollTrigger.removeEventListener('refreshInit', measure);
      prevBtn.removeEventListener('click', a);
      nextBtn.removeEventListener('click', b);
      viewport.removeEventListener('pointerdown', down);
      viewport.removeEventListener('pointermove', moveH);
      viewport.removeEventListener('pointerup', up);
      viewport.removeEventListener('pointercancel', up);
      viewport.removeEventListener('click', click, true);
    };
  });

  mm.add('(max-width: 899px)', () => {
    const onScroll = () => {
      const max = viewport.scrollWidth - viewport.clientWidth;
      setIndex(max > 0 ? viewport.scrollLeft / max : 0);
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => viewport.removeEventListener('scroll', onScroll);
  });

  setIndex(0);
}
