// SIGNATURE LOOK — pinned scroll zoom into one 2025 editorial portrait:
// full face -> base (skin) -> eye -> lip. The 3000px source keeps the close-ups crisp.
import { reduced, clamp, isNarrow } from '../core/env.js';

// focal points in image fractions (measured on signature-3000.webp), s = zoom relative to cover
const STOPS = [
  { s: 1.0, fx: 0.50, fy: 0.42 },
  { s: 1.45, fx: 0.46, fy: 0.40 },   // 01 base
  { s: 2.4, fx: 0.44, fy: 0.28 },    // 02 eye
  { s: 3.0, fx: 0.47, fy: 0.54 },    // 03 lip
];
// scroll progress at which each stop is reached (holds between)
const AT = [0.0, 0.2, 0.52, 0.84];
const ACTIVE = [0.04, 0.38, 0.7];   // step becomes active from here
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function initSignature() {
  const { ScrollTrigger } = window;
  const section = document.querySelector('.signature');
  if (!section) return;
  const stage = section.querySelector('.signature__stage');
  const frame = section.querySelector('.signature__frame');
  const img = section.querySelector('.signature__img');
  const steps = [...section.querySelectorAll('.signature__steps li')];
  const ratio = 1600 / 2105;
  let W = 0, H = 0, w = 0, h = 0, active = -2;

  function layout() {
    W = frame.clientWidth; H = frame.clientHeight;
    if (W / H > ratio) { w = W; h = W / ratio; } else { h = H; w = H * ratio; }
    img.style.width = w + 'px';
    img.style.height = h + 'px';
  }

  function at(p) {
    let i = 0;
    while (i < AT.length - 1 && p > AT[i + 1]) i++;
    if (i >= AT.length - 1) return STOPS[STOPS.length - 1];
    const k = ease(clamp((p - AT[i]) / (AT[i + 1] - AT[i]), 0, 1));
    const a = STOPS[i], b = STOPS[i + 1];
    return { s: a.s + (b.s - a.s) * k, fx: a.fx + (b.fx - a.fx) * k, fy: a.fy + (b.fy - a.fy) * k };
  }

  function render(p) {
    const { s, fx, fy } = at(p);
    const cx = W / 2, cy = H * (isNarrow() ? 0.4 : 0.5);
    let tx = cx - fx * w * s, ty = cy - fy * h * s;
    tx = clamp(tx, W - w * s, 0);
    ty = clamp(ty, H - h * s, 0);
    img.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    let a = -1;
    ACTIVE.forEach((v, i) => { if (p >= v) a = i; });
    if (a !== active) { active = a; steps.forEach((li, i) => li.classList.toggle('is-active', i === a)); }
  }

  layout();
  ScrollTrigger.addEventListener('refreshInit', layout);
  if (img.decode) img.decode().then(layout).catch(() => {});

  if (reduced) { render(0.3); return; }
  ScrollTrigger.create({
    id: 'signature', trigger: section, start: 'top top',
    end: () => '+=' + Math.round(window.innerHeight * (isNarrow() ? 2.2 : 2.6)),
    pin: stage, scrub: 0.4, anticipatePin: 1, invalidateOnRefresh: true,
    onUpdate: (self) => render(self.progress),
    onRefresh: (self) => { layout(); render(self.progress); },
  });
  render(0);
}
