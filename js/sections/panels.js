// RESERVATION — stacking panels: each panel pins, the next one slides up over it while the
// previous one recedes (scale + dim). Portrait parallax as each panel arrives.
import { reduced } from '../core/env.js';

export function initPanels() {
  const { gsap, ScrollTrigger } = window;
  const wrap = document.querySelector('.menu-panels');
  if (!wrap) return;
  const panels = [...wrap.querySelectorAll('.panel')];
  const last = panels[panels.length - 1];
  if (reduced) return;

  panels.forEach((panel, i) => {
    const inner = panel.querySelector('.panel__inner');
    const img = panel.querySelector('.panel__media img');
    const text = panel.querySelectorAll('.panel__num, .panel__title, .panel__desc, .panel__price, .panel__roster, .panel__link');

    if (panel !== last) {
      ScrollTrigger.create({
        id: `panel-${i}`, trigger: panel, start: 'top top', endTrigger: last, end: 'top top',
        pin: true, pinSpacing: false,
      });
      const next = panels[i + 1];
      gsap.fromTo(inner, { scale: 1, '--dim': 0 }, {
        scale: 0.9, '--dim': 0.6, ease: 'none',
        scrollTrigger: { trigger: next, start: 'top bottom', end: 'top top', scrub: true },
      });
    }

    if (i > 0) {
      gsap.fromTo(img, { yPercent: 10 }, {
        yPercent: 0, ease: 'none',
        scrollTrigger: { trigger: panel, start: 'top bottom', end: 'top top', scrub: true },
      });
      gsap.fromTo(text, { y: 60, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, ease: 'none', stagger: 0.06,
        scrollTrigger: { trigger: panel, start: 'top 75%', end: 'top 5%', scrub: true },
      });
    }
  });
}
