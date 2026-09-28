// Fixed header: theme switching (hero / dark / solid), mobile menu, anchor scrolling.
import { scrollToTarget, lockScroll } from '../core/smooth.js';

export function initHeader() {
  const header = document.querySelector('.site-header');
  const toggle = header.querySelector('.menu-toggle');
  const menu = document.getElementById('menu');
  const state = { theme: header.dataset.theme, open: false };

  function set(theme) {
    if (theme && theme !== state.theme) { header.dataset.theme = theme; state.theme = theme; }
  }

  function openMenu(open) {
    if (open === state.open) return;
    state.open = open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    header.classList.toggle('is-menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
    } else {
      menu.classList.remove('is-open');
      const done = () => { if (!state.open) menu.hidden = true; };
      menu.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 800);
    }
    lockScroll(open);
  }

  toggle.addEventListener('click', () => openMenu(!state.open));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openMenu(false); });

  // in-page anchors go through Lenis so pinned sections resolve correctly
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const el = id.length > 1 && document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    const wasOpen = state.open;
    openMenu(false);
    setTimeout(() => scrollToTarget(el), wasOpen ? 380 : 0);
  });

  return { set, el: header, get theme() { return state.theme; } };
}
