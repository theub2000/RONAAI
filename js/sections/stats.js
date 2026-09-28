// NUMBER OF LÖNA — pink counters count up once; the triptych rises in.
import { QA, reduced } from '../core/env.js';
import { registerReveal } from '../core/qa.js';

const fmt = (v, dec) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export function initStats() {
  const { gsap, ScrollTrigger } = window;
  const section = document.querySelector('.stats');
  if (!section || reduced) return;

  if (!QA.lock) {
    section.querySelectorAll('[data-count]').forEach((el, i) => {
      const target = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || '0', 10);
      const o = { v: 0 };
      el.textContent = fmt(0, dec);
      const tw = gsap.to(o, {
        v: target, duration: 1.8, ease: 'power3.out', paused: true, delay: i * 0.1,
        onUpdate: () => { el.textContent = fmt(o.v, dec); },
        onComplete: () => { el.textContent = fmt(target, dec); },
      });
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => tw.play() });
    });
  }

  const imgs = section.querySelectorAll('.stats__media img');
  const tl = gsap.timeline({ paused: true })
    .fromTo(imgs, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.inOut', stagger: 0.1 }, 0)
    .fromTo(imgs, { scale: 1.15 }, { scale: 1, duration: 1.6, ease: 'expo.out', stagger: 0.1 }, 0.1);
  registerReveal(tl);
  ScrollTrigger.create({ trigger: section.querySelector('.stats__media'), start: 'top 85%', once: true, onEnter: () => tl.play() });
}
