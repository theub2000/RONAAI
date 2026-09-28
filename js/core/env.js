// Environment flags shared by every module (page A and page B).
const params = new URLSearchParams(location.search);
const num = (k) => {
  if (!params.has(k)) return null;
  const v = parseFloat(params.get(k));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
};

/**
 * QA hooks
 *  ?shot=1              skip the opening
 *  ?lock=1              no Lenis, no opening, no time-based reveals (everything settles instantly)
 *  ?p=0.35              jump to 35% of the whole document
 *  ?s=hero&sp=0.5       jump to 50% of a named section (ScrollTrigger id or element id)
 */
export const QA = {
  lock: params.get('lock') === '1',
  shot: params.get('shot') === '1' || params.get('lock') === '1',
  p: num('p'),
  s: params.get('s'),
  sp: num('sp'),
  off: parseFloat(params.get('off') || '0') || 0,   // extra px offset for ?s=
};
QA.active = QA.lock || QA.p !== null || !!QA.s;

export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isNarrow = () => window.innerWidth < 900;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
