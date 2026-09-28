// Pink "ALL ABOUT BEAUTY" marquee: endless loop whose speed and direction follow the scroll.
import { reduced } from '../core/env.js';

export function initMarquee() {
  const { gsap, ScrollTrigger } = window;
  const el = document.querySelector('.marquee');
  if (!el || reduced) return;
  const track = el.querySelector('.marquee__track');
  const group = track.querySelector('.marquee__group');
  // enough copies to cover wide screens twice
  let groupW = group.offsetWidth || 1;
  const copies = Math.max(2, Math.ceil((window.innerWidth * 2) / groupW) + 1);
  for (let i = 1; i < copies; i++) track.appendChild(group.cloneNode(true));

  let x = 0, dir = 1, boost = 0, visible = true;
  const base = 70; // px/s
  ScrollTrigger.create({
    trigger: el, start: 'top bottom', end: 'bottom top',
    onToggle: (self) => { visible = self.isActive; },
    onUpdate: (self) => {
      const v = self.getVelocity();
      if (Math.abs(v) > 10) dir = v > 0 ? 1 : -1;
      boost = Math.min(900, Math.abs(v) * 0.35);
    },
  });
  ScrollTrigger.addEventListener('refreshInit', () => { groupW = group.offsetWidth || groupW; });

  gsap.ticker.add((time, dt) => {
    if (!visible) return;
    boost *= 0.92;
    x -= ((base + boost) * dir * dt) / 1000;
    if (x <= -groupW) x += groupW;
    if (x > 0) x -= groupW;
    track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
  });
}
