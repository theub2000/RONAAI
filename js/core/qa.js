// QA positioning: renders any scroll state deterministically (see env.js for params).
import { QA, wait } from './env.js';

const reveals = [];
const waits = [];

/** Register a time-based reveal so QA lock can settle it instantly. */
export function registerReveal(anim) {
  reveals.push(anim);
  if (QA.lock) anim.progress(1);
  return anim;
}

/** Register an async readiness check (e.g. "the flight frame for this scroll is drawn"). */
export function registerQAWait(fn) { waits.push(fn); }

export async function applyQA() {
  const { ScrollTrigger } = window;
  const root = document.documentElement;
  if (!QA.active) { root.dataset.ready = '1'; return; }
  ScrollTrigger.refresh();
  let y = null;
  if (QA.s) {
    const st = ScrollTrigger.getById(QA.s);
    if (st) {
      y = st.start + (st.end - st.start) * (QA.sp ?? 0);
    } else {
      const el = document.getElementById(QA.s);
      if (el) y = el.getBoundingClientRect().top + window.scrollY + el.offsetHeight * (QA.sp ?? 0);
    }
  } else if (QA.p !== null) {
    y = (root.scrollHeight - window.innerHeight) * QA.p;
  }
  if (y !== null) {
    y += QA.off;
    window.scrollTo(0, Math.round(y));
    ScrollTrigger.update();
  }
  if (QA.lock) reveals.forEach((a) => a.progress(1));
  // let scrubs settle (scrub smoothing) then wait for async content
  await wait(QA.lock ? 700 : 100);
  ScrollTrigger.update();
  await Promise.race([Promise.all(waits.map((f) => Promise.resolve(f()).catch(() => {}))), wait(9000)]);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  root.dataset.ready = '1';
}
