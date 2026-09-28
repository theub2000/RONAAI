// Page A bootstrap. ScrollTriggers are created top-to-bottom so pin spacing resolves
// correctly: hero pin -> styled pin -> stacking panels -> signature pin -> stats -> stories.
import { QA, reduced, wait } from './core/env.js';
import { initSmooth } from './core/smooth.js';
import { applyQA } from './core/qa.js';
import { initHeader } from './components/header.js';
import { initHero } from './sections/hero.js';
import { initMarquee } from './sections/marquee.js';
import { initStyled } from './sections/styled.js';
import { initPanels } from './sections/panels.js';
import { initSignature } from './sections/signature.js';
import { initStats } from './sections/stats.js';
import { initStories } from './sections/stories.js';
import { initAILab } from './sections/ailab.js';

function boot() {
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger) {
    document.documentElement.classList.remove('is-opening');
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (QA.lock) document.documentElement.classList.add('qa-lock');

  initSmooth(!QA.lock && !reduced);
  const header = initHeader();
  const fabs = document.querySelector('.fabs');
  const tabbar = document.querySelector('.tabbar');

  const hero = initHero({ header, fabs, tabbar });
  initMarquee();
  initAILab();
  initStyled();
  initPanels();
  initSignature();
  initStats();
  initStories();

  // floating buttons: hidden over the fly-through (it has its own CTA) and, on phones,
  // over the signature zoom where they would cover the step labels
  const fabHide = { hero: true, sig: false };
  const syncFabs = () => fabs.classList.toggle('is-hidden', fabHide.hero || fabHide.sig);
  ScrollTrigger.create({ trigger: '.marquee', start: 'top bottom', onEnter: () => { fabHide.hero = false; syncFabs(); }, onLeaveBack: () => { fabHide.hero = true; syncFabs(); } });
  ScrollTrigger.create({
    trigger: '.signature', start: 'top 60%', end: 'bottom 40%',
    onToggle: (self) => { fabHide.sig = self.isActive && window.innerWidth < 900; syncFabs(); },
  });
  syncFabs();

  // header: solid white once the hero has scrolled away
  ScrollTrigger.create({
    trigger: '.marquee', start: 'top top+=1',
    onEnter: () => header.set('solid'),
    onLeaveBack: () => header.set('hero'),
  });

  const settle = () => {
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fonts, wait(3000)]).then(() => {
      ScrollTrigger.refresh();
      applyQA();
    });
  };
  hero.opening.then(() => {
    if (document.readyState === 'complete') return settle();
    let done = false;
    const once = () => { if (!done) { done = true; settle(); } };
    window.addEventListener('load', once, { once: true });
    setTimeout(once, 2500);
  });

  if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.LONA = { gsap, ScrollTrigger, QA, hero };
}

boot();
