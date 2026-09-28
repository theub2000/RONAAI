/*!
 * LONA AI BEAUTY LAB — on-device virtual makeup / personal color / hair color module
 * Everything runs in the browser (MediaPipe Tasks Vision, WASM). No image ever leaves the device.
 *
 *   import { mountAIMakeup } from './ai-lab/ai-makeup.js';
 *   const lab = await mountAIMakeup(document.querySelector('#ai-lab'), {
 *     assetBase: './ai-lab/',            // optional; defaults to this file's folder (vendor/, models/, samples/)
 *     samplePhotos: [{ src: './ai-lab/samples/sample-01.jpg', label: '프로필 1' }],
 *     onBook: (lookName, detail) => { ... },   // or bookingUrl: 'https://m.booking.naver.com/booking/13/bizes/515276'
 *     initialLook: 'burgundy',           // first auto-applied look
 *     autoDemo: true,                    // idle look cycling on the sample until the visitor interacts
 *     showHeader: true,                  // module's own eyebrow/title block
 *   });
 *   // lab.destroy(), lab.setLook('rose'), lab.setHair('ash'), lab.load(), lab.stopAutoDemo()
 *   // events: container dispatches 'aim:photo' { state: ready | no-face | face-too-small | heic-unsupported | ... }
 *   // theme: #ai-lab { --aim-bg; --aim-fg; --aim-muted; --aim-accent (pink #f2557f) }
 */

const MP_VERSION = '0.10.35';
const MAX_PHOTO_SIDE = 1600;
const WORK_MAX_W = 1080;
const CAM_MAX_SIDE = 800;
const EXPECTED_BYTES = { wasm: 11153617, face: 3758596, hair: 781618 };

/* ------------------------------------------------------------------ data */

// strengths calibrated for the sales demo: sample models already wear makeup, so lips/blush/shadow sit ~40% above 'invisible-natural'
const LOOKS = [
  {
    id: 'nude', name: '청담 누드 프로필', en: 'CHEONGDAM NUDE',
    desc: '피부 결은 살리고 윤곽만 정돈한, 프로필 촬영의 정석 MLBB 메이크업.',
    lips: { color: '#B0675F', opacity: 0.87, finish: 'satin' },
    blush: { color: '#D98E83', opacity: 0.61 },
    shadow: { base: '#C49B84', deep: '#7E5646', opacity: 0.87, shimmer: 0.2, lower: 0.15, height: 1 },
    liner: { color: '#24181468', opacity: 0.88, width: 0.9, wing: 0.35 },
    brow: { color: '#4C3930', opacity: 0.55 },
    contour: 0.45, highlight: 0.45,
    skin: { smooth: 0.55, glow: 0.25 },
  },
  {
    id: 'rose', name: '웨딩 로즈', en: 'WEDDING ROSE',
    desc: '맑은 로즈 톤과 은은한 윤광. 본식·웨딩 스냅에서 가장 사랑받는 룩.',
    lips: { color: '#C4546B', opacity: 0.92, finish: 'glossy' },
    blush: { color: '#EC98AA', opacity: 0.62 },
    shadow: { base: '#D6A39F', deep: '#94636A', opacity: 0.77, shimmer: 0.45, lower: 0.1, height: 1 },
    liner: { color: '#2A1C20', opacity: 0.88, width: 0.9, wing: 0.45 },
    brow: { color: '#4A3934', opacity: 0.5 },
    contour: 0.3, highlight: 0.6,
    skin: { smooth: 0.6, glow: 0.45 },
  },
  {
    id: 'coral', name: '코랄 데일리', en: 'CORAL DAILY',
    desc: '생기 도는 코랄 립과 복숭앗빛 볼. 가볍게 완성하는 데일리 룩.',
    lips: { color: '#E06A55', opacity: 0.9, finish: 'satin' },
    blush: { color: '#F59B78', opacity: 0.58 },
    shadow: { base: '#E1AA86', deep: '#AE7152', opacity: 0.7, shimmer: 0.25, lower: 0.08, height: 0.95 },
    liner: { color: '#3A281F', opacity: 0.77, width: 0.75, wing: 0.2 },
    brow: { color: '#5D4535', opacity: 0.45 },
    contour: 0.25, highlight: 0.45,
    skin: { smooth: 0.5, glow: 0.3 },
  },
  {
    id: 'burgundy', name: '버건디 무드', en: 'BURGUNDY MOOD',
    desc: '깊은 버건디 매트 립으로 완성하는 시크한 화보 무드.',
    lips: { color: '#7A1F30', opacity: 1.05, finish: 'matte' },
    blush: { color: '#B86D78', opacity: 0.49 },
    shadow: { base: '#A0706A', deep: '#583137', opacity: 0.95, shimmer: 0.1, lower: 0.25, height: 1.05 },
    liner: { color: '#1A1012', opacity: 0.95, width: 1.1, wing: 0.6 },
    brow: { color: '#3B2B26', opacity: 0.6 },
    contour: 0.6, highlight: 0.4,
    skin: { smooth: 0.55, glow: 0.15 },
  },
  {
    id: 'glow', name: '글로우 스킨', en: 'GLOW SKIN',
    desc: '속부터 차오르는 윤광 피부와 투명한 립. 결 좋은 피부를 보여주는 룩.',
    lips: { color: '#D8847C', opacity: 0.7, finish: 'glossy' },
    blush: { color: '#F2A596', opacity: 0.58 },
    shadow: { base: '#E6BFA3', deep: '#BE947C', opacity: 0.59, shimmer: 0.7, lower: 0.05, height: 0.9 },
    liner: { color: '#3A2A24', opacity: 0.66, width: 0.6, wing: 0.1 },
    brow: { color: '#57423A', opacity: 0.4 },
    contour: 0.2, highlight: 0.85,
    skin: { smooth: 0.72, glow: 0.7 },
  },
  {
    id: 'smoky', name: '스모키 브라운', en: 'SMOKY BROWN',
    desc: '번지듯 음영을 쌓은 브라운 스모키. 깊고 또렷한 눈매의 촬영용 룩.',
    lips: { color: '#9C5249', opacity: 0.9, finish: 'satin' },
    blush: { color: '#C78573', opacity: 0.49 },
    shadow: { base: '#8F6450', deep: '#452D24', opacity: 1.05, shimmer: 0.12, lower: 0.42, height: 1.12 },
    liner: { color: '#1C1310', opacity: 0.95, width: 1.2, wing: 0.55 },
    brow: { color: '#3E2D25', opacity: 0.6 },
    contour: 0.6, highlight: 0.4,
    skin: { smooth: 0.55, glow: 0.18 },
  },
];

const HAIR = [
  // color = salon swatch (UI), tone = low-chroma dye tone applied to the hair, tint = colour strength, lum = target lightness
  { id: 'ash', name: '애쉬 브라운', color: '#8E857F', tone: '#857f7b', tint: 0.9, lum: 0.27, desc: '붉은 기를 누른 차분함' },
  { id: 'milkbeige', name: '밀크 베이지', color: '#CDB49B', tone: '#bfa48b', tint: 0.66, lum: 0.42, desc: '부드러운 우윳빛 밝기' },
  { id: 'rosebrown', name: '로즈 브라운', color: '#9A6360', tone: '#8a6664', tint: 0.62, lum: 0.24, desc: '은은한 핑크빛 브라운' },
  { id: 'choco', name: '다크 초코', color: '#5A3726', tone: '#5f4536', tint: 0.62, lum: 0.15, desc: '윤기 있는 깊은 갈색' },
  { id: 'khaki', name: '카키 브라운', color: '#7C6F4E', tone: '#766f5c', tint: 0.62, lum: 0.24, desc: '그린 기 도는 내추럴' },
  { id: 'blueblack', name: '블루 블랙', color: '#1E2638', tone: '#2a303d', tint: 0.55, lum: 0.07, desc: '푸른 윤기의 선명한 흑발' },
];

const SEASONS = {
  spring: {
    name: '봄 웜 라이트', en: 'SPRING · WARM LIGHT', tone: '웜 언더톤 · 밝은 명도',
    desc: '노란 기가 도는 맑은 피부입니다. 코랄·피치처럼 따뜻하고 밝은 색이 얼굴을 화사하게 살려 줍니다.',
    best: ['#F4845F', '#F7AE8A', '#F29A93', '#E9C07A', '#F6E7CF', '#C9A27A', '#A9C97F', '#4FB3AA'],
    avoid: ['#2E3350', '#6E5A8C', '#111111'], looks: ['coral', 'glow'], hair: ['milkbeige', 'rosebrown'],
  },
  summer: {
    name: '여름 쿨 라이트', en: 'SUMMER · COOL LIGHT', tone: '쿨 언더톤 · 밝은 명도',
    desc: '붉은 기가 비치는 투명한 피부입니다. 로즈·라벤더처럼 부드럽고 차분한 쿨 컬러가 잘 받습니다.',
    best: ['#E59BB4', '#C4577A', '#B9A6D6', '#B98FA3', '#A9C6E8', '#8EB3DE', '#A8DCCB', '#A7A9B4'],
    avoid: ['#E57A2E', '#C9A227', '#5A3A22'], looks: ['rose', 'nude'], hair: ['ash', 'rosebrown'],
  },
  autumn: {
    name: '가을 웜 딥', en: 'AUTUMN · WARM DEEP', tone: '웜 언더톤 · 깊은 명도',
    desc: '깊이 있는 웜 톤 피부입니다. 브라운·테라코타·카키 계열이 고급스럽고 차분한 분위기를 만듭니다.',
    best: ['#B85C3E', '#8C3B2E', '#C39A3B', '#B08455', '#8A7F5A', '#6B6B3A', '#2F5D5A', '#5A3A2A'],
    avoid: ['#D63384', '#CFE3F7', '#9FA8DA'], looks: ['smoky', 'burgundy'], hair: ['khaki', 'choco'],
  },
  winter: {
    name: '겨울 쿨 딥', en: 'WINTER · COOL DEEP', tone: '쿨 언더톤 · 선명한 대비',
    desc: '대비가 선명한 쿨 톤입니다. 버건디·블랙·로열 블루처럼 선명하고 깊은 색이 인상을 또렷하게 합니다.',
    best: ['#7A1F3D', '#C2185B', '#F4D6E0', '#2946A6', '#0F7A5C', '#3A3A40', '#141414', '#F7F7F5'],
    avoid: ['#D9C3A0', '#E58A3A', '#8A7F5A'], looks: ['burgundy', 'rose'], hair: ['blueblack', 'choco'],
  },
};

const DEMO_ORDER = ['burgundy', 'rose', 'coral', 'smoky', 'glow', 'nude'];
const DEMO_INTERVAL = 2500;

const PARTS = [
  ['lips', '립'], ['blush', '블러셔'], ['shadow', '아이섀도'], ['liner', '아이라이너'],
  ['brow', '브로우'], ['contour', '윤곽'], ['skin', '피부 결'],
];

const FINISH = {
  matte: { color: 0.55, mul: 0.62, cover: 0.42, spec: 0, sheen: 0 },
  satin: { color: 0.62, mul: 0.46, cover: 0.24, spec: 0.38, sheen: 0.1 },
  glossy: { color: 0.58, mul: 0.34, cover: 0.14, spec: 0.85, sheen: 0.26 },
};

/* MediaPipe Face Mesh indices (subject's right = SIDES[0]) */
const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];
const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LOWER_OVAL = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234];
const SIDES = [
  {
    up: [33, 246, 161, 160, 159, 158, 157, 173, 133], lo: [33, 7, 163, 144, 145, 153, 154, 155, 133],
    browLo: [46, 53, 52, 65, 55], browUp: [70, 63, 105, 66, 107],
    cheek: 50, cheekOut: 117, temple: 127, jaw: 93, mouth: 61, iris: [468, 469, 471],
  },
  {
    up: [263, 466, 388, 387, 386, 385, 384, 398, 362], lo: [263, 249, 390, 373, 374, 380, 381, 382, 362],
    browLo: [276, 283, 282, 295, 285], browUp: [300, 293, 334, 296, 336],
    cheek: 280, cheekOut: 346, temple: 356, jaw: 323, mouth: 291, iris: [473, 474, 476],
  },
];

/* ------------------------------------------------------------------ icons */
const ICON = {
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5"/><path d="M12 15V4.5"/><path d="M7.5 9 12 4.5 16.5 9"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.4" r="3.4"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 7-5 5 5 5"/><path d="m15 7 5 5-5 5"/></svg>',
};

/* ------------------------------------------------------------------ math */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpP = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });
const mul = (p, s) => ({ x: p.x * s, y: p.y * s });
const norm = (p) => { const l = Math.hypot(p.x, p.y) || 1; return { x: p.x / l, y: p.y / l }; };
const angleOf = (p, q) => Math.atan2(q.y - p.y, q.x - p.x);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function centroid(pts) { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; }
function scaleAbout(pts, c, sx, sy = sx) { return pts.map((p) => ({ x: c.x + (p.x - c.x) * sx, y: c.y + (p.y - c.y) * sy })); }
function samplePolyline(pts, s) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = dist(pts[i - 1], pts[i]); seg.push(d); total += d; }
  let target = clamp(s, 0, 1) * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) return lerpP(pts[i], pts[i + 1], seg[i] ? clamp(target / seg[i], 0, 1) : 0);
    target -= seg[i];
  }
  return pts[pts.length - 1];
}
function hexRgb(h) {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function rgbHex(r, g, b) { return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }

/* sRGB <-> CIELAB (D65) */
function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const LIN = new Float32Array(256).map((_, i) => srgbToLinear(i));
function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function labToHex(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const lin = [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ];
  const g = lin.map((c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055));
  return rgbHex(g[0], g[1], g[2]);
}
function median(arr) { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/* ------------------------------------------------------------------ canvas helpers */
function makeCanvas(w = 1, h = 1) { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

let FILTER_OK = null;
function canFilter() {
  if (FILTER_OK !== null) return FILTER_OK;
  if (typeof location !== 'undefined' && /[?&]aimNoFilter/.test(location.search)) return (FILTER_OK = false);
  try {
    const c = makeCanvas(9, 9); const x = c.getContext('2d', { willReadFrequently: true });
    if (!('filter' in x)) return (FILTER_OK = false);
    x.filter = 'blur(2px)'; x.fillStyle = '#fff'; x.fillRect(4, 4, 1, 1);
    const d = x.getImageData(0, 0, 9, 9).data;
    FILTER_OK = d[(4 * 9 + 2) * 4 + 3] > 0;
  } catch (e) { FILTER_OK = false; }
  return FILTER_OK;
}
const _lv = [];
function level(i, w, h) {
  let c = _lv[i]; if (!c) c = _lv[i] = makeCanvas(w, h);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  return c;
}
function drawBlur(ctx, src, dx, dy, r) {
  if (!(r > 0.35)) { ctx.drawImage(src, dx, dy); return; }
  if (canFilter()) {
    ctx.save(); ctx.filter = `blur(${r.toFixed(2)}px)`; ctx.drawImage(src, dx, dy); ctx.restore(); return;
  }
  // Fallback for browsers without canvas filters (Safari): dual-filter blur — halve down, then tent-sample
  // back up (4 offset taps averaged with 'lighter'); GPU-friendly and close to a Gaussian of radius r.
  const n = clamp(Math.round(Math.log2(r / 0.9)), 1, 6);
  const sizes = [[src.width, src.height]];
  for (let i = 1; i <= n; i++) sizes.push([Math.max(1, Math.round(sizes[i - 1][0] / 2)), Math.max(1, Math.round(sizes[i - 1][1] / 2))]);
  let cur = src;
  for (let i = 1; i <= n; i++) { const c = level(i, sizes[i][0], sizes[i][1]); c.getContext('2d').drawImage(cur, 0, 0, sizes[i][0], sizes[i][1]); cur = c; }
  for (let i = n - 1; i >= 0; i--) {
    const [w, h] = sizes[i];
    const c = level(10 + i, w, h), x = c.getContext('2d');
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.25;
    const o = 0.75;
    for (const [ox, oy] of [[-o, -o], [o, -o], [-o, o], [o, o]]) x.drawImage(cur, ox, oy, w, h);
    cur = c;
  }
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(cur, dx, dy); ctx.restore();
}
function pathClosed(ctx, pts, k = 1 / 6) {
  const n = pts.length; if (n < 3) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k, p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k, p2.x, p2.y);
  }
  ctx.closePath();
}
function pathOpen(ctx, pts, move = true, k = 1 / 6) {
  const n = pts.length; if (!n) return;
  if (move) ctx.moveTo(pts[0].x, pts[0].y); else ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k, p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k, p2.x, p2.y);
  }
}
function softEllipse(ctx, c, rx, ry, ang, color, stops = [[0, 1], [0.45, 0.72], [1, 0]]) {
  if (!(rx > 0.5 && ry > 0.5)) return;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [o, a] of stops) g.addColorStop(o, rgba(color, a));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function comp(ctx, layer, bb, op, alpha) {
  if (!(alpha > 0.003)) return;
  ctx.save(); ctx.globalCompositeOperation = op; ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(layer, bb.x, bb.y); ctx.restore();
}

class Pool {
  constructor() { this.m = new Map(); }
  get(key, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let c = this.m.get(key);
    if (!c) { c = makeCanvas(w, h); this.m.set(key, c); }
    const x = c.getContext('2d');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else { x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, w, h); }
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    return c;
  }
}

const CACHE_NAME = 'lona-aim-' + MP_VERSION + '-1';
async function openCache() {
  try { if (typeof caches !== 'undefined' && window.isSecureContext) return await caches.open(CACHE_NAME); } catch (e) { /* private mode etc. */ }
  return null;
}
async function fetchBytes(url, onProgress, expected) {
  // models + wasm are kept in Cache Storage so a returning visitor starts instantly
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); if (b.length > 1024) { onProgress(b.length, b.length); return b; } }
    } catch (e) { /* ignore */ }
  }
  const out = await download(url, onProgress, expected);
  if (cache) cache.put(url, new Response(out, { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {});
  return out;
}
async function download(url, onProgress, expected) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const total = +res.headers.get('content-length') || expected || 0;
  if (!res.body || !res.body.getReader) { const b = new Uint8Array(await res.arrayBuffer()); onProgress(b.length, b.length); return b; }
  const reader = res.body.getReader(); const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    chunks.push(value); got += value.length; onProgress(got, Math.max(total, got));
  }
  const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  onProgress(got, got);
  return out;
}

/* ------------------------------------------------------------------ engine (MediaPipe) */
let _quiet = false;
function quietMediaPipeLogs() {
  // MediaPipe's WASM prints an informational TFLite line through console.error; keep the host console clean
  if (_quiet) return; _quiet = true;
  const ce = console.error;
  console.error = function (...args) {
    if (typeof args[0] === 'string' && args[0].startsWith('INFO: Created TensorFlow Lite')) return;
    return ce.apply(this, args);
  };
}
class Engine {
  constructor(base) { this.base = base; this.progress = () => {}; this.face = null; this.faceMode = 'IMAGE'; this.hair = null; this.hairMode = 'IMAGE'; }
  url(p) { return new URL(p, this.base).href; }
  load(onProgress) { if (onProgress) this.progress = onProgress; return (this._p ??= this._load()); }
  async _load() {
    quietMediaPipeLogs();
    const mp = await import(this.url('vendor/mediapipe/vision_bundle.js'));
    this.mp = mp;
    const wasmDir = this.url('vendor/mediapipe/wasm').replace(/\/$/, '');
    const fs = await mp.FilesetResolver.forVisionTasks(wasmDir);
    const prog = { wasm: [0, EXPECTED_BYTES.wasm], face: [0, EXPECTED_BYTES.face] };
    const report = () => {
      const got = prog.wasm[0] + prog.face[0], tot = prog.wasm[1] + prog.face[1];
      this.progress(tot ? got / tot : 0, 'download');
    };
    const [wasm, face] = await Promise.all([
      fetchBytes(fs.wasmBinaryPath, (g, t) => { prog.wasm = [g, t]; report(); }, EXPECTED_BYTES.wasm),
      fetchBytes(this.url('models/face_landmarker.task'), (g, t) => { prog.face = [g, t]; report(); }, EXPECTED_BYTES.face),
    ]);
    this.progress(1, 'init');
    this.fileset = { wasmLoaderPath: fs.wasmLoaderPath, wasmBinaryPath: URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' })) };
    this.faceModel = face;
    this.conn = {
      tess: mp.FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      contours: mp.FaceLandmarker.FACE_LANDMARKS_CONTOURS,
    };
    this.face = await this._createFace('GPU').catch((e) => { console.warn('[aim] GPU delegate unavailable, using CPU', e); return this._createFace('CPU'); });
    return this;
  }
  _createFace(delegate) {
    this.delegate = delegate;
    return this.mp.FaceLandmarker.createFromOptions(this.fileset, {
      baseOptions: { modelAssetBuffer: this.faceModel, delegate },
      runningMode: 'IMAGE', numFaces: 3,
      minFaceDetectionConfidence: 0.45, minFacePresenceConfidence: 0.45, minTrackingConfidence: 0.45,
      outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
    });
  }
  faceModeSet(mode) {
    // serialized so a camera stop and the next photo detection never race on setOptions
    this._fq = (this._fq || Promise.resolve()).then(async () => {
      if (this.faceMode === mode) return;
      // live video tracks one face: with numFaces > 1 MediaPipe re-runs the detector every frame while fewer faces are tracked
      await this.face.setOptions({ runningMode: mode, numFaces: mode === 'VIDEO' ? 1 : 3 }); this.faceMode = mode;
    }).catch((e) => console.error('[aim] mode', e));
    return this._fq;
  }
  async detect(img) {
    await this.faceModeSet('IMAGE');
    try { return this.face.detect(img); } catch (e) {
      if (this.delegate === 'GPU') { console.warn('[aim] GPU inference failed, falling back to CPU', e); this.face.close?.(); this.face = await this._createFace('CPU'); this.faceMode = 'IMAGE'; return this.face.detect(img); }
      throw e;
    }
  }
  detectVideo(frame, ts) { return this.face.detectForVideo(frame, ts); }
  loadHair() {
    return (this._hp ??= (async () => {
      await this.load();
      const buf = await fetchBytes(this.url('models/hair_segmenter.tflite'), () => {}, EXPECTED_BYTES.hair);
      this.hair = await this.mp.ImageSegmenter.createFromOptions(this.fileset, {
        baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' },
        runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
      });
      const labels = (this.hair.getLabels && this.hair.getLabels()) || [];
      const idx = labels.findIndex((l) => /hair/i.test(l));
      this.hairIndex = idx >= 0 ? idx : 1;
      return this.hair;
    })());
  }
  hairModeSet(mode) {
    this._hq = (this._hq || Promise.resolve()).then(async () => {
      if (this.hairMode === mode) return;
      await this.hair.setOptions({ runningMode: mode }); this.hairMode = mode;
    }).catch((e) => console.error('[aim] hair mode', e));
    return this._hq;
  }
  _grabMask(result) {
    const masks = result.confidenceMasks || [];
    const m = masks[Math.min(this.hairIndex, masks.length - 1)];
    if (!m) return null;
    return { data: new Float32Array(m.getAsFloat32Array()), w: m.width, h: m.height };
  }
  async segment(img) {
    await this.loadHair(); await this.hairModeSet('IMAGE');
    let out = null; this.hair.segment(img, (r) => { out = this._grabMask(r); });
    return out;
  }
  segmentVideo(frame, ts) {
    let out = null; this.hair.segmentForVideo(frame, ts, (r) => { out = this._grabMask(r); });
    return out;
  }
}

function pickLargest(result, W, H) {
  const faces = (result && result.faceLandmarks) || [];
  let best = null, bestA = 0;
  for (const f of faces) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of f) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    const a = (x1 - x0) * (y1 - y0);
    if (a > bestA) { bestA = a; best = f; }
  }
  if (!best) return null;
  return { pts: best.map((p) => ({ x: p.x * W, y: p.y * H })), count: faces.length };
}
function ptsBox(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function faceMetrics(P) {
  return {
    faceW: dist(P[234], P[454]),
    faceH: dist(P[10], P[152]),
    mouthW: dist(P[61], P[291]),
    roll: angleOf(P[33], P[263]),
  };
}

/* ------------------------------------------------------------------ makeup renderer */
class MakeupRenderer {
  constructor() { this.pool = new Pool(); this.lipGain = 0.9; this._lipKey = null; }

  bbox(pts, pad, W, H) {
    const b = ptsBox(pts);
    const x = Math.floor(clamp(b.x - pad, 0, W - 1)), y = Math.floor(clamp(b.y - pad, 0, H - 1));
    const x1 = Math.ceil(clamp(b.x + b.w + pad, x + 1, W)), y1 = Math.ceil(clamp(b.y + b.h + pad, y + 1, H));
    return { x, y, w: x1 - x, h: y1 - y };
  }
  layer(key, bb) {
    const c = this.pool.get(key, bb.w, bb.h); const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, -bb.x, -bb.y); return [c, x];
  }
  blurred(key, src, r) {
    const c = this.pool.get(key, src.width, src.height);
    drawBlur(c.getContext('2d'), src, 0, 0, r); return c;
  }
  cut(layerCanvas, bb, drawPath, blur = 0) {
    // erase an area (eye opening, mouth) from a layer, optionally with a soft edge
    const x = layerCanvas.getContext('2d');
    if (blur > 0.4) {
      const [m, mx] = this.layer('cutMask', bb); mx.fillStyle = '#000'; mx.beginPath(); drawPath(mx); mx.fill();
      const mb = this.blurred('cutMaskB', m, blur);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-out'; x.drawImage(mb, 0, 0); x.restore();
    } else {
      x.save(); x.setTransform(1, 0, 0, 1, -bb.x, -bb.y); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.beginPath(); drawPath(x); x.fill(); x.restore();
    }
  }

  faceClip(P, m) {
    const oval = FACE_OVAL.map((i) => P[i]);
    const bb = this.bbox(oval, m.faceW * 0.05, m.W, m.H);
    const [c, x] = this.layer('faceClip', bb);
    x.fillStyle = '#fff'; x.beginPath(); pathClosed(x, scaleAbout(oval, centroid(oval), 0.965)); x.fill();
    return this.blurred('faceClipB', c, m.faceW * 0.022);
  }
  clipTo(layer, clip) {
    const x = layer.getContext('2d');
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(clip, 0, 0); x.restore();
  }

  render(ctx, base, P, look, parts, k, info = {}) {
    if (!P || !(k > 0.002)) return;
    const W = base.width, H = base.height, m = faceMetrics(P);
    m.W = W; m.H = H; m.lite = !!info.lite;
    if (parts.contour || parts.blush) m.clip = this.faceClip(P, m);
    if (parts.skin) this.skin(ctx, base, P, m, look.skin, k);
    if (parts.contour) this.contour(ctx, P, m, look, k);
    if (parts.blush) this.blush(ctx, P, m, look.blush, k);
    if (parts.brow) this.brows(ctx, P, m, look.brow, k);
    for (const S of SIDES) {
      const U = S.up.map((i) => P[i]), L = S.lo.map((i) => P[i]), B = S.browLo.map((i) => P[i]);
      const eye = { U, L, B, W: dist(U[0], U[8]), open: U.concat(L.slice(1, -1).reverse()) };
      eye.c = centroid(eye.open);
      if (parts.shadow) this.eyeshadow(ctx, m, eye, look.shadow, k);
      if (parts.liner) this.liner(ctx, m, eye, look.liner, k);
    }
    if (parts.lips) this.lips(ctx, base, P, m, look.lips, k, info);
  }

  skin(ctx, base, P, m, S, k) {
    const aS = S.smooth * k, aG = S.glow * k;
    if (aS < 0.01 && aG < 0.01) return;
    const oval = FACE_OVAL.map((i) => P[i]);
    const bb = this.bbox(oval, m.faceW * 0.05, m.W, m.H);
    const [mk, mx] = this.layer('skinMask', bb);
    mx.fillStyle = '#fff'; mx.beginPath(); pathClosed(mx, scaleAbout(oval, centroid(oval), 0.97)); mx.fill();
    mx.globalCompositeOperation = 'destination-out'; mx.fillStyle = '#000';
    for (const Sd of SIDES) {
      const open = Sd.up.concat(Sd.lo.slice(1, -1).reverse()).map((i) => P[i]);
      const c = centroid(open);
      mx.beginPath(); pathClosed(mx, scaleAbout(open, c, 1.45, 2.1)); mx.fill();
      const brow = Sd.browLo.concat(Sd.browUp.slice().reverse()).map((i) => P[i]);
      mx.beginPath(); pathClosed(mx, scaleAbout(brow, centroid(brow), 1.15, 1.5)); mx.fill();
    }
    const lips = LIPS_OUTER.map((i) => P[i]);
    mx.beginPath(); pathClosed(mx, scaleAbout(lips, centroid(lips), 1.1, 1.18)); mx.fill();
    const nose = [P[98], P[97], P[2], P[326], P[327], P[294], P[4], P[64]];
    mx.beginPath(); pathClosed(mx, scaleAbout(nose, centroid(nose), 1.05)); mx.fill();
    const mask = this.blurred('skinMaskB', mk, m.faceW * 0.03);

    if (aS > 0.01 && !m.lite) {
      const [sm, sx] = this.layer('skinSmooth', bb);
      const r = m.faceW * 0.0105;
      if (canFilter()) { sx.filter = `blur(${r.toFixed(2)}px)`; sx.drawImage(base, 0, 0); sx.filter = 'none'; }
      else { sx.setTransform(1, 0, 0, 1, 0, 0); const [raw, rx] = this.layer('skinRaw', bb); rx.drawImage(base, 0, 0); drawBlur(sx, raw, 0, 0, r); }
      sx.setTransform(1, 0, 0, 1, 0, 0); sx.globalCompositeOperation = 'destination-in'; sx.drawImage(mask, 0, 0);
      comp(ctx, sm, bb, 'lighten', aS * 0.7);
      comp(ctx, sm, bb, 'source-over', aS * 0.42);
    }
    if (aG > 0.01) {
      const [gl, gx] = this.layer('skinGlow', bb);
      gx.fillStyle = '#fff1e6'; gx.fillRect(bb.x, bb.y, bb.w, bb.h);
      gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = 'destination-in'; gx.drawImage(mask, 0, 0);
      comp(ctx, gl, bb, 'soft-light', aG * 0.38);
    }
  }

  contour(ctx, P, m, look, k) {
    const aC = look.contour * k, aH = look.highlight * k;
    const oval = FACE_OVAL.map((i) => P[i]);
    const bb = this.bbox(oval, m.faceW * 0.05, m.W, m.H);
    if (aC > 0.01) {
      const [c, x] = this.layer('contour', bb);
      for (const S of SIDES) {
        const j = P[S.jaw], mo = P[S.mouth];
        const ctr = lerpP(j, mo, 0.26);
        softEllipse(x, ctr, dist(j, mo) * 0.34, m.faceW * 0.045, angleOf(j, mo), '#6E5043', [[0, 0.9], [0.5, 0.5], [1, 0]]);
      }
      // nose sides
      const top = P[168], tip = P[4], side = norm(sub(P[362], P[133]));
      const nl = dist(top, tip), off = dist(P[133], P[362]) * 0.3;
      const nc = lerpP(top, tip, 0.42);
      for (const s of [-1, 1]) softEllipse(x, add(nc, mul(side, off * s)), nl * 0.42, m.faceW * 0.014, angleOf(top, tip), '#6E5043', [[0, 0.75], [1, 0]]);
      // under-jaw / hairline softening
      const chin = P[152];
      softEllipse(x, add(chin, { x: 0, y: m.faceH * 0.03 }), m.faceW * 0.22, m.faceW * 0.05, m.roll, '#5E4338', [[0, 0.45], [1, 0]]);
      const cb = this.blurred('contourB', c, m.faceW * 0.012);
      this.clipTo(cb, m.clip);
      comp(ctx, cb, bb, 'multiply', aC * 0.55);
    }
    if (aH > 0.01) {
      const [h, x] = this.layer('highlight', bb);
      const top = P[168], tip = P[4];
      softEllipse(x, lerpP(top, tip, 0.45), dist(top, tip) * 0.44, m.faceW * 0.016, angleOf(top, tip), '#FFF6EC', [[0, 1], [1, 0]]);
      for (const S of SIDES) {
        const outer = P[S.up[0]], inner = P[S.up[8]], ch = P[S.cheek];
        const c = add(lerpP(outer, ch, 0.52), mul(sub(outer, inner), 0.12));
        softEllipse(x, c, m.faceW * 0.095, m.faceW * 0.05, angleOf(inner, outer) + (S === SIDES[0] ? 0.35 : -0.35), '#FFF6EC', [[0, 0.7], [0.5, 0.35], [1, 0]]);
      }
      const cupid = add(P[0], mul(sub(P[0], P[13]), 0.45));
      softEllipse(x, cupid, m.mouthW * 0.11, m.mouthW * 0.035, m.roll, '#FFF6EC', [[0, 0.8], [1, 0]]);
      softEllipse(x, lerpP(P[17], P[152], 0.55), m.faceW * 0.05, m.faceW * 0.028, m.roll, '#FFF6EC', [[0, 0.8], [1, 0]]);
      softEllipse(x, lerpP(P[9], P[10], 0.3), m.faceW * 0.1, m.faceW * 0.06, m.roll, '#FFF6EC', [[0, 0.5], [1, 0]]);
      const hb = this.blurred('highlightB', h, m.faceW * 0.02);
      this.clipTo(hb, m.clip);
      comp(ctx, hb, bb, 'soft-light', aH * 0.8);
      comp(ctx, hb, bb, 'screen', aH * 0.1);
    }
  }

  blush(ctx, P, m, B, k) {
    const a = B.opacity * k; if (a < 0.01) return;
    const oval = FACE_OVAL.map((i) => P[i]);
    const bb = this.bbox(oval, m.faceW * 0.05, m.W, m.H);
    const [c, x] = this.layer('blush', bb);
    for (const S of SIDES) {
      const apple = lerpP(P[S.cheek], P[S.cheekOut], 0.42);
      const tmp = P[S.temple];
      const dir = norm(sub(tmp, apple));
      const ctr = add(apple, mul(dir, m.faceW * 0.02));
      // width shrinks naturally on the far cheek when the head turns
      const span = clamp(dist(P[S.cheek], P[S.jaw]) / (m.faceW * 0.3), 0.45, 1.2);
      softEllipse(x, ctr, m.faceW * 0.145 * span, m.faceW * 0.095, angleOf(apple, tmp), B.color, [[0, 1], [0.28, 0.8], [0.52, 0.44], [0.78, 0.13], [1, 0]]);
    }
    const cb = this.blurred('blushB', c, m.faceW * 0.036);
    this.clipTo(cb, m.clip);
    comp(ctx, cb, bb, 'multiply', a * 0.42);
    comp(ctx, cb, bb, 'soft-light', a * 0.55);
    comp(ctx, cb, bb, 'source-over', a * 0.06);
  }

  brows(ctx, P, m, Bw, k) {
    const a = Bw.opacity * k; if (a < 0.01) return;
    for (const S of SIDES) {
      const lo = S.browLo.map((i) => P[i]), up = S.browUp.map((i) => P[i]);
      const poly = lo.concat(up.slice().reverse());
      const bh = dist(lo[2], up[2]);
      // pull the polygon slightly inwards so the fill stays inside the hairs
      const shaped = scaleAbout(poly, centroid(poly), 0.97, 0.86);
      const bb = this.bbox(poly, bh * 1.4, m.W, m.H);
      const [c, x] = this.layer('brow', bb);
      const inner = lerpP(lo[4], up[4], 0.5), outer = lerpP(lo[0], up[0], 0.5);
      const g = x.createLinearGradient(inner.x, inner.y, outer.x, outer.y);
      g.addColorStop(0, rgba(Bw.color, 0.3)); g.addColorStop(0.3, rgba(Bw.color, 0.85)); g.addColorStop(0.7, rgba(Bw.color, 1)); g.addColorStop(1, rgba(Bw.color, 0.7));
      x.fillStyle = g; x.beginPath(); pathClosed(x, shaped); x.fill();
      const cb = this.blurred('browB', c, Math.max(0.8, bh * 0.2));
      comp(ctx, cb, bb, 'multiply', a * 0.62);
      comp(ctx, cb, bb, 'soft-light', a * 0.25);
      comp(ctx, cb, bb, 'source-over', a * 0.05);
    }
  }

  eyeshadow(ctx, m, e, Sh, k) {
    const a = Sh.opacity * k; if (a < 0.01) return;
    const { U, L, B } = e, W = e.W;
    const top = U.map((u, i) => {
      const t = i / 8; // 0 outer -> 1 inner
      const b = samplePolyline(B, 0.12 + 0.76 * t);
      const h = (lerp(0.5, 0.36, t) + 0.07 * Math.sin(Math.PI * t)) * Sh.height;
      return lerpP(u, b, h);
    });
    const outDir = norm(sub(U[0], U[2])), up = norm(sub(top[0], U[0]));
    const wing = add(U[0], add(mul(outDir, W * 0.17), mul(up, W * 0.07)));
    const poly = [wing, ...U, ...top.slice().reverse()];
    const bb = this.bbox(poly.concat(L), W * 0.45, m.W, m.H);
    const [c, x] = this.layer('shadow', bb);
    const g = x.createLinearGradient(U[4].x, U[4].y, top[4].x, top[4].y);
    g.addColorStop(0, rgba(Sh.deep, 0.95)); g.addColorStop(0.38, rgba(Sh.base, 0.85)); g.addColorStop(0.78, rgba(Sh.base, 0.35)); g.addColorStop(1, rgba(Sh.base, 0));
    x.fillStyle = g; x.beginPath(); pathClosed(x, poly); x.fill();
    // outer-V depth
    softEllipse(x, lerpP(U[1], top[1], 0.3), W * 0.3, W * 0.2, angleOf(U[4], U[0]), Sh.deep, [[0, 0.55 + Sh.lower * 0.6], [1, 0]]);
    // lower lash smudge (outer two thirds)
    if (Sh.lower > 0.02) {
      const band = [];
      for (let i = 0; i <= 5; i++) band.push(L[i]);
      const down = band.map((p, i) => add(p, mul(norm(sub(p, e.c)), W * 0.075 * (1 - i / 6.5))));
      x.fillStyle = rgba(Sh.deep, clamp(Sh.lower * 1.6, 0, 1));
      x.beginPath(); pathOpen(x, band); pathOpen(x, down.reverse(), false); x.closePath(); x.fill();
    }
    const cb = this.blurred('shadowB', c, W * 0.085);
    // soft eye-opening mask (built once per eye, reused by every eye layer)
    const [om, omx] = this.layer('eyeOpen', bb); omx.fillStyle = '#000'; omx.beginPath(); pathClosed(omx, e.open); omx.fill();
    const openMask = this.blurred('eyeOpenB', om, W * 0.015);
    const erase = (layer) => { const lx = layer.getContext('2d'); lx.save(); lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'destination-out'; lx.drawImage(openMask, 0, 0); lx.restore(); };
    erase(cb);
    comp(ctx, cb, bb, 'multiply', a * 0.95);
    comp(ctx, cb, bb, 'soft-light', a * 0.3);
    if (m.lite) return;
    // depth: a tighter, deeper wash hugging the lash line (outer-weighted)
    const [d, dx] = this.layer('shadowDeep', bb);
    const dTop = U.map((u, i) => lerpP(u, top[i], lerp(0.46, 0.2, i / 8)));
    const dg = dx.createLinearGradient(U[8].x, U[8].y, wing.x, wing.y);
    dg.addColorStop(0, rgba(Sh.deep, 0.35)); dg.addColorStop(0.55, rgba(Sh.deep, 0.9)); dg.addColorStop(1, rgba(Sh.deep, 1));
    dx.fillStyle = dg; dx.beginPath(); pathClosed(dx, [wing, ...U, ...dTop.slice().reverse()]); dx.fill();
    const db = this.blurred('shadowDeepB', d, W * 0.045);
    erase(db);
    comp(ctx, db, bb, 'multiply', a * (0.35 + Sh.lower));
    if (Sh.shimmer > 0.02) {
      const [s, sx] = this.layer('shimmer', bb);
      softEllipse(sx, lerpP(U[4], top[4], 0.32), W * 0.27, W * 0.12, angleOf(U[8], U[0]), '#FBEAD2', [[0, 1], [0.5, 0.5], [1, 0]]);
      erase(s);
      comp(ctx, s, bb, 'screen', a * Sh.shimmer * 0.42);
      comp(ctx, s, bb, 'soft-light', a * Sh.shimmer * 0.5);
    }
  }

  liner(ctx, m, e, Ln, k) {
    const a = Ln.opacity * k; if (a < 0.01) return;
    const { U } = e, W = e.W;
    const n = U.length;
    const normals = U.map((p, i) => {
      const t = sub(U[Math.min(n - 1, i + 1)], U[Math.max(0, i - 1)]);
      let nv = norm({ x: -t.y, y: t.x });
      if ((p.x - e.c.x) * nv.x + (p.y - e.c.y) * nv.y < 0) nv = mul(nv, -1);
      return nv;
    });
    const base = W * 0.05 * Ln.width;
    const width = (i) => base * (0.18 + 0.82 * Math.pow(1 - i / (n - 1), 0.85));
    const upper = U.map((p, i) => add(p, mul(normals[i], width(i))));
    const lower = U.map((p, i) => add(p, mul(normals[i], -width(i) * 0.22)));
    const outDir = norm(sub(U[0], U[2]));
    const liftDir = norm(add(outDir, mul(normals[0], 0.62)));
    const tip = add(U[0], mul(liftDir, W * (0.05 + 0.22 * Ln.wing)));
    const bb = this.bbox(U.concat([tip]), W * 0.25, m.W, m.H);
    const [c, x] = this.layer('liner', bb);
    x.fillStyle = Ln.color.length > 7 ? Ln.color.slice(0, 7) : Ln.color;
    x.beginPath();
    pathOpen(x, upper.slice().reverse());     // inner -> outer along top edge
    x.lineTo(tip.x, tip.y);
    pathOpen(x, lower, false);                  // outer -> inner along lash line
    x.closePath(); x.fill();
    const cb = this.blurred('linerB', c, Math.max(0.45, W * 0.011));
    comp(ctx, cb, bb, 'multiply', a * 0.9);
    comp(ctx, cb, bb, 'source-over', a * 0.4);
  }

  lips(ctx, base, P, m, Lp, k, info) {
    const a = Lp.opacity * k; if (a < 0.01) return;
    const outer = LIPS_OUTER.map((i) => P[i]);
    const inner = LIPS_INNER.map((i) => P[i]);
    const c = centroid(outer);
    const O = scaleAbout(outer, c, 0.975, 0.955);
    const ci = centroid(inner);
    const I = scaleAbout(inner, ci, 1.03, 1.16);
    const bb = this.bbox(outer, m.mouthW * 0.18, m.W, m.H);
    const [mk, mx] = this.layer('lipMask', bb);
    mx.fillStyle = '#fff'; mx.beginPath(); pathClosed(mx, O); pathClosed(mx, I); mx.fill('evenodd');
    const soft = this.blurred('lipSoft', mk, Math.max(0.6, m.mouthW * 0.014));
    this.cut(soft, bb, (cx) => pathClosed(cx, I), 0);

    // measure natural lip brightness (for texture-preserving gloss) once per source / periodically
    if (info.key !== this._lipKey || (info.frame || 0) % 24 === 0) { this._lipKey = info.key; this.lipGain = this.measureLipGain(base, bb, soft); }

    const F = FINISH[Lp.finish] || FINISH.satin;
    const [cl, cx] = this.layer('lipCol', bb);
    cx.fillStyle = Lp.color; cx.fillRect(bb.x, bb.y, bb.w, bb.h);
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'destination-in'; cx.drawImage(soft, 0, 0);
    comp(ctx, cl, bb, 'color', a * F.color);
    comp(ctx, cl, bb, 'multiply', a * F.mul);
    comp(ctx, cl, bb, 'source-over', a * F.cover);

    if (F.spec > 0 || F.sheen > 0) {
      const lowC = lerpP(P[14], P[17], 0.42), upC = lerpP(P[0], P[13], 0.52);
      const lowH = dist(P[14], P[17]), upH = dist(P[0], P[13]);
      const [sh, shx] = this.layer('lipShine', bb);
      softEllipse(shx, lowC, m.mouthW * 0.24, Math.max(1, lowH * 0.32), m.roll, '#FFFFFF', [[0, 1], [0.55, 0.55], [1, 0]]);
      softEllipse(shx, upC, m.mouthW * 0.13, Math.max(1, upH * 0.24), m.roll, '#FFFFFF', [[0, 0.8], [1, 0]]);
      shx.setTransform(1, 0, 0, 1, 0, 0); shx.globalCompositeOperation = 'destination-in'; shx.drawImage(soft, 0, 0);
      if (F.spec > 0 && canFilter()) {
        const [sp, spx] = this.layer('lipSpec', bb);
        spx.filter = `grayscale(1) brightness(${this.lipGain.toFixed(3)}) contrast(4.5)`;
        spx.drawImage(base, 0, 0); spx.filter = 'none';
        spx.setTransform(1, 0, 0, 1, 0, 0); spx.globalCompositeOperation = 'destination-in'; spx.drawImage(sh, 0, 0);
        comp(ctx, sp, bb, 'screen', a * F.spec);
      }
      comp(ctx, sh, bb, 'soft-light', a * F.sheen * 1.4);
      comp(ctx, sh, bb, 'screen', a * F.sheen * 0.45);
    }
  }

  measureLipGain(base, bb, mask) {
    try {
      const w = 40, h = Math.max(8, Math.round(40 * bb.h / bb.w));
      const t = this._lm ||= makeCanvas(w, h * 2); t.width = w; t.height = h * 2;
      const x = t.getContext('2d', { willReadFrequently: true });
      x.drawImage(base, bb.x, bb.y, bb.w, bb.h, 0, 0, w, h);
      x.drawImage(mask, 0, 0, mask.width, mask.height, 0, h, w, h);
      const d = x.getImageData(0, 0, w, h * 2).data;
      let s = 0, n = 0;
      for (let i = 0; i < w * h; i++) {
        const al = d[(w * h + i) * 4 + 3] / 255; if (al < 0.5) continue;
        const o = i * 4; s += (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255; n++;
      }
      const mean = n ? s / n : 0.5;
      return clamp(0.47 / Math.max(0.12, mean), 0.6, 2.6);
    } catch (e) { return 0.9; }
  }
}

/* ------------------------------------------------------------------ hair renderer */
class HairRenderer {
  constructor() { this.pool = new Pool(); this.raw = null; this.mean = 0.2; }
  setMask(mask, frame) {
    if (!mask) { this.raw = null; return; }
    const { data, w, h } = mask;
    const c = this.raw && this.raw.width === w && this.raw.height === h ? this.raw : makeCanvas(w, h);
    const x = c.getContext('2d');
    const img = x.createImageData(w, h); const d = img.data;
    for (let i = 0, o = 0; i < data.length; i++, o += 4) {
      d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255 * smoothstep(0.34, 0.78, data[i]);
    }
    x.putImageData(img, 0, 0);
    this.raw = c;
    // mean hair luminance (sRGB luma) for adaptive lift
    if (frame) {
      try {
        const sw = 160, sh = Math.max(1, Math.round(160 * frame.height / frame.width));
        const t = this._hm ||= makeCanvas(sw, sh * 2); t.width = sw; t.height = sh * 2;
        const tx = t.getContext('2d', { willReadFrequently: true });
        tx.drawImage(frame, 0, 0, sw, sh); tx.drawImage(c, 0, sh, sw, sh);
        const px = tx.getImageData(0, 0, sw, sh * 2).data;
        let s = 0, n = 0;
        for (let i = 0; i < sw * sh; i++) {
          if (px[(sw * sh + i) * 4 + 3] < 190) continue;
          const o = i * 4; s += (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255; n++;
        }
        this.mean = n > 30 ? s / n : 0.2;
        this.coverage = n / (sw * sh);
      } catch (e) { this.mean = 0.2; }
    }
  }
  render(ctx, frame, P, hair, k) {
    if (!this.raw || !hair || !(k > 0.01)) return;
    const W = frame.width, H = frame.height;
    // feathered mask at frame resolution
    const fm = this.pool.get('hairMaskF', W, H); const fx = fm.getContext('2d');
    fx.imageSmoothingEnabled = true; fx.imageSmoothingQuality = 'high';
    const r = Math.max(0.8, W / 900);
    if (canFilter()) { fx.filter = `blur(${r.toFixed(2)}px)`; fx.drawImage(this.raw, 0, 0, W, H); fx.filter = 'none'; }
    else fx.drawImage(this.raw, 0, 0, W, H);
    if (P) {
      // protect the face (brows down) from being tinted
      const m = faceMetrics(P);
      const poly = LOWER_OVAL.map((i) => P[i]).concat([70, 63, 105, 66, 107, 9, 336, 296, 334, 293, 300].map((i) => P[i]));
      const pr = this.pool.get('hairProtect', W, H); const px = pr.getContext('2d');
      px.fillStyle = '#000'; px.beginPath(); pathClosed(px, scaleAbout(poly, centroid(poly), 0.94, 0.97)); px.fill();
      fx.globalCompositeOperation = 'destination-out';
      drawBlur(fx, pr, 0, 0, m.faceW * 0.02);
      fx.globalCompositeOperation = 'source-over';
    }
    // lift/darken to the target lightness, then take hue+saturation from the salon color
    const gain = clamp(hair.lum / Math.max(0.03, this.mean), 0.45, 2.7);
    const lay = this.pool.get('hairColor', W, H); const lx = lay.getContext('2d');
    if (canFilter()) {
      lx.filter = `brightness(${gain.toFixed(3)}) contrast(${gain > 1.6 ? 0.92 : 1.04}) saturate(0.4)`;
      lx.drawImage(frame, 0, 0); lx.filter = 'none';
    } else {
      // no canvas filters (Safari): screen-lift in up to two passes, darken with multiply, then desaturate
      lx.drawImage(frame, 0, 0);
      if (gain > 1) {
        lx.globalCompositeOperation = 'screen';
        lx.globalAlpha = clamp(gain - 1, 0, 1); lx.drawImage(frame, 0, 0);
        if (gain > 2) { lx.globalAlpha = clamp((gain - 2) / 1.6, 0, 1); lx.drawImage(frame, 0, 0); }
      } else { lx.globalCompositeOperation = 'multiply'; lx.globalAlpha = clamp((1 - gain) * 1.5, 0, 1); lx.fillStyle = '#000'; lx.fillRect(0, 0, W, H); }
      lx.globalCompositeOperation = 'saturation'; lx.globalAlpha = 0.6; lx.fillStyle = '#808080'; lx.fillRect(0, 0, W, H);
      lx.globalAlpha = 1;
    }
    lx.globalCompositeOperation = 'color'; lx.globalAlpha = hair.tint; lx.fillStyle = hair.tone; lx.fillRect(0, 0, W, H);
    lx.globalCompositeOperation = 'soft-light'; lx.globalAlpha = 0.1; lx.fillRect(0, 0, W, H); lx.globalAlpha = 1;
    lx.globalCompositeOperation = 'destination-in'; lx.drawImage(fm, 0, 0);
    lx.globalCompositeOperation = 'source-over';
    comp(ctx, lay, { x: 0, y: 0 }, 'source-over', k);
  }
}

/* ------------------------------------------------------------------ personal color */
function analyzePersonalColor(base, P) {
  const m = faceMetrics(P);
  const regions = [
    { key: 'FOREHEAD', w: 0.3, c: lerpP(P[9], P[151], 0.55), r: m.faceW * 0.058 },
    { key: 'CHEEK R', w: 0.24, c: lerpP(P[SIDES[0].cheek], P[SIDES[0].cheekOut], 0.45), r: m.faceW * 0.055 },
    { key: 'CHEEK L', w: 0.24, c: lerpP(P[SIDES[1].cheek], P[SIDES[1].cheekOut], 0.45), r: m.faceW * 0.055 },
    { key: 'CHIN', w: 0.22, c: lerpP(P[17], P[152], 0.52), r: m.faceW * 0.04 },
  ];
  const read = (bx, by, bw, bh) => {
    bx = Math.floor(clamp(bx, 0, base.width - 1)); by = Math.floor(clamp(by, 0, base.height - 1));
    bw = Math.max(1, Math.min(Math.ceil(bw), base.width - bx)); bh = Math.max(1, Math.min(Math.ceil(bh), base.height - by));
    const c = makeCanvas(bw, bh); const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(base, bx, by, bw, bh, 0, 0, bw, bh);
    return { x, c, bx, by, bw, bh, d: x.getImageData(0, 0, bw, bh).data };
  };
  const used = [];
  let total = 0;
  for (const R of regions) {
    const blk = read(R.c.x - R.r, R.c.y - R.r, R.r * 2, R.r * 2);
    const px = [];
    for (let yy = 0; yy < blk.bh; yy++) for (let xx = 0; xx < blk.bw; xx++) {
      const X = blk.bx + xx + 0.5, Y = blk.by + yy + 0.5;
      if ((X - R.c.x) ** 2 + (Y - R.c.y) ** 2 > R.r * R.r) continue;
      const o = (yy * blk.bw + xx) * 4;
      const r = blk.d[o], g = blk.d[o + 1], b = blk.d[o + 2];
      if (r >= 250 || g >= 250 || b >= 250) { R.clipped = (R.clipped || 0) + 1; continue; } // blown highlights carry no colour
      const lab = rgbToLab(r, g, b);
      if (lab[0] > 94 || lab[0] < 18) continue;
      px.push(lab);
    }
    if (px.length < 20) continue;
    // exclude shadows / speculars: keep the 20th–85th luminance percentile, then require skin-like hue
    px.sort((p, q) => p[0] - q[0]);
    const lo = Math.floor(px.length * 0.2), hi = Math.ceil(px.length * 0.85);
    const kept = px.slice(lo, hi).filter((p) => { const h = Math.atan2(p[2], p[1]) * 180 / Math.PI; return h > 10 && h < 95 && p[1] > -2; });
    if (kept.length < 12) continue;
    R.L = median(kept.map((p) => p[0])); R.a = median(kept.map((p) => p[1])); R.b = median(kept.map((p) => p[2]));
    R.n = kept.length; total += kept.length; used.push(R);
  }
  if (!used.length) return null;
  // bangs/shadow guard: drop a region whose lightness is far from the others
  const medL = median(used.map((r) => r.L));
  const good = used.filter((r) => Math.abs(r.L - medL) < 12);
  const set = good.length ? good : used;
  const wsum = set.reduce((s, r) => s + r.w, 0);
  let L = 0, A = 0, Bv = 0;
  for (const r of set) { L += r.L * r.w; A += r.a * r.w; Bv += r.b * r.w; }
  L /= wsum; A /= wsum; Bv /= wsum;

  // white-balance hint from the sclera (eye whites), conservative
  let wb = null;
  const iris = [];
  for (const S of SIDES) {
    const open = S.up.concat(S.lo.slice(1, -1).reverse()).map((i) => P[i]);
    const ic = P[S.iris[0]], ir = dist(P[S.iris[1]], P[S.iris[2]]) / 2;
    const b = ptsBox(open);
    const blk = read(b.x, b.y, b.w + 1, b.h + 1);
    const mc = makeCanvas(blk.bw, blk.bh); const mx = mc.getContext('2d', { willReadFrequently: true });
    mx.translate(-blk.bx, -blk.by); mx.fillStyle = '#fff'; mx.beginPath(); pathClosed(mx, scaleAbout(open, centroid(open), 0.86, 0.7)); mx.fill();
    mx.globalCompositeOperation = 'destination-out'; mx.beginPath(); mx.arc(ic.x, ic.y, ir * 1.15, 0, Math.PI * 2); mx.fill();
    const md = mx.getImageData(0, 0, blk.bw, blk.bh).data;
    for (let i = 0; i < md.length; i += 4) {
      if (md[i + 3] < 200) continue;
      const lab = rgbToLab(blk.d[i], blk.d[i + 1], blk.d[i + 2]);
      (wb ??= []).push(lab);
    }
    const ib = read(ic.x - ir, ic.y - ir, ir * 2, ir * 2);
    for (let yy = 0; yy < ib.bh; yy++) for (let xx = 0; xx < ib.bw; xx++) {
      const X = ib.bx + xx + 0.5, Y = ib.by + yy + 0.5;
      if ((X - ic.x) ** 2 + (Y - ic.y) ** 2 > (ir * 0.78) ** 2) continue;
      const o = (yy * ib.bw + xx) * 4; const lab = rgbToLab(ib.d[o], ib.d[o + 1], ib.d[o + 2]);
      if (lab[0] < 62) iris.push(lab[0]);
    }
  }
  let corr = { a: 0, b: 0, applied: false };
  if (wb && wb.length >= 40) {
    wb.sort((p, q) => q[0] - p[0]);
    const top = wb.slice(0, Math.max(10, Math.floor(wb.length * 0.4)));
    const sL = median(top.map((p) => p[0])), sa = median(top.map((p) => p[1])), sb = median(top.map((p) => p[2]));
    if (sL > 55) {
      corr = { a: clamp((sa - 1) * 0.4, -3, 3), b: clamp((sb - 5) * 0.4, -4, 4), applied: true, sL, sa, sb };
    }
  }
  const a2 = A - corr.a, b2 = Bv - corr.b;
  const hue = Math.atan2(b2, a2) * 180 / Math.PI;
  const ita = Math.atan((L - 50) / b2) * 180 / Math.PI;
  const irisL = iris.length > 10 ? median(iris) : 30;
  const contrast = L - irisL;
  // classification
  // thresholds sit between spectrophotometer norms for Korean skin (h≈55°) and typical portrait photos (h≈42–48°)
  const HUE_MID = 49;
  const warmScore = (hue - HUE_MID) / 3.4;
  const depthScore = (L - 62) / 5.5 - (contrast - 46) / 16;
  const warm = warmScore >= 0, light = depthScore >= 0;
  const season = warm ? (light ? 'spring' : 'autumn') : (light ? 'summer' : 'winter');
  const undertone = Math.abs(warmScore) < 0.45 ? '뉴트럴' : warm ? '웜' : '쿨';
  const spread = set.length > 1 ? Math.sqrt(set.reduce((s, r) => s + (Math.atan2(r.b, r.a) * 180 / Math.PI - hue) ** 2, 0) / set.length) : 6;
  let conf = 52 + 24 * Math.min(1, Math.abs(warmScore) / 2) + 14 * Math.min(1, Math.abs(depthScore) / 2) - Math.max(0, spread - 3) * 1.6 - (set.length < 3 ? 6 : 0);
  if (L > 84 || L < 40) conf -= 10; // over/under-exposed photo
  conf = Math.round(clamp(conf, 46, 90));
  return {
    L, a: a2, b: b2, rawA: A, rawB: Bv, hue, ita, irisL, contrast, season, undertone,
    depth: light ? '라이트' : '딥', confidence: conf, pixels: total, regions: set, wb: corr,
    skinHex: labToHex(L, a2, b2),
  };
}

/* ------------------------------------------------------------------ app */
const uid = () => Math.random().toString(36).slice(2, 8);

class AIMakeupApp {
  constructor(container, opts) {
    this.el = container;
    this.opts = opts;
    const baseHref = opts.assetBase ? new URL(opts.assetBase, document.baseURI).href : new URL('./', import.meta.url).href;
    this.base = baseHref.endsWith('/') ? baseHref : baseHref + '/';
    this.samples = (opts.samplePhotos && opts.samplePhotos.length ? opts.samplePhotos : [1, 2, 3, 4, 5].map((n) => (
      { src: this.base + `samples/sample-0${n}.jpg`, label: `샘플 ${n}` })));
    this.userPhotos = [];
    this.engine = new Engine(this.base);
    this.makeup = new MakeupRenderer();
    this.hairR = new HairRenderer();
    this.state = {
      look: opts.initialLook || 'burgundy', intensity: 80,
      parts: Object.fromEntries(PARTS.map(([k]) => [k, true])),
      hair: null, hairK: 75, split: 0.5, showOriginal: false, tab: 'makeup',
    };
    this.fade = 1;
    this.src = null;      // { kind, key, canvas, full, crop }
    this.P = null;
    this.debug = !!opts.debug || /[?&]aimDebug/.test(location.search);
    this._raf = 0; this._disposers = [];
    this.id = uid();
    this.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    // idle auto-demo: cycles looks on the sample photo until the visitor touches anything
    this.demoStopped = opts.autoDemo === false || this.reduced;
    this._sweepTok = 0;
  }

  /* ---------- DOM ---------- */
  build() {
    const el = this.el;
    el.classList.add('aim');
    el.innerHTML = `
<div class="aim-grid">
  <div class="aim-stagecol">
    <div class="aim-stage" aria-label="AI 메이크업 결과 미리보기">
      <canvas class="aim-canvas"></canvas>
      <canvas class="aim-fx"></canvas>
      <span class="aim-tag aim-tag--before">BEFORE</span>
      <span class="aim-tag aim-tag--after">AFTER</span>
      <div class="aim-split"><div class="aim-split-line"></div>
        <div class="aim-split-knob" role="slider" tabindex="0" aria-label="전후 비교 위치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">${ICON.split}</div>
      </div>
      <div class="aim-hud"><span class="aim-hud-dot"></span><span class="aim-hud-txt">ON-DEVICE AI</span></div>
      <button type="button" class="aim-hold" aria-label="누르고 있으면 원본 보기">원본 보기</button>
      <div class="aim-toast" role="status" aria-live="polite"></div>
      <div class="aim-notice" hidden><p></p><button type="button" class="aim-notice-btn" data-act="upload">${ICON.upload}<span>다른 사진 올리기</span></button></div>
      <div class="aim-dropveil" aria-hidden="true"><div>${ICON.upload}<b>여기에 사진을 놓으세요</b><span>기기 안에서만 처리됩니다</span></div></div>
      <div class="aim-loader">
        <div class="aim-ring">
          <svg viewBox="0 0 80 80"><defs><linearGradient id="aimRingGrad-${this.id}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff8aa9"/><stop offset="1" stop-color="#f2557f"/></linearGradient></defs>
            <circle class="aim-ring-bg" cx="40" cy="40" r="36"/><circle class="aim-ring-fg" cx="40" cy="40" r="36" stroke="url(#aimRingGrad-${this.id})" stroke-dasharray="226.2" stroke-dashoffset="226.2"/></svg>
          <div class="aim-ring-pct"><span>0</span><small>%</small></div>
        </div>
        <div class="aim-loader-title">AI 뷰티 엔진 준비 중</div>
        <div class="aim-loader-sub">얼굴 인식 모델을 이 기기로 불러오고 있습니다. 사진은 어디에도 전송되지 않습니다.</div>
      </div>
    </div>
    <div class="aim-sources">
      <div class="aim-thumbs" role="group" aria-label="샘플 사진"></div>
      <div class="aim-srcbtns">
        <button type="button" class="aim-srcbtn" data-act="upload">${ICON.upload}<span class="aim-upl-lbl">내 사진</span></button>
        <button type="button" class="aim-srcbtn" data-act="camera" aria-pressed="false">${ICON.camera}<span>카메라</span></button>
      </div>
      <input type="file" accept="image/*,.heic,.heif" class="aim-sr" tabindex="-1" aria-hidden="true">
    </div>
    <div class="aim-drop" role="button" tabindex="0" data-act="upload" aria-label="내 사진 올리기: 클릭해서 선택하거나 끌어다 놓기, Ctrl+V 붙여넣기">
      <span class="aim-drop-ic">${ICON.upload}</span>
      <span class="aim-drop-txt"><b>내 사진으로 체험하기</b><span>사진을 여기로 끌어다 놓거나 클릭해서 선택 · <kbd>Ctrl</kbd>+<kbd>V</kbd> 붙여넣기</span></span>
      <span class="aim-drop-fmt">JPG · PNG · WEBP</span>
    </div>
    <div class="aim-privacy">${ICON.lock}<span><b>사진이 서버로 전송되지 않습니다</b> — 기기 안에서만 처리</span></div>
  </div>

  <div class="aim-panel">
    ${this.opts.showHeader === false ? '' : `<div class="aim-head">
      <div class="aim-eyebrow">LONA AI BEAUTY LAB</div>
      <h3 class="aim-title">예약 전에, <strong>나에게 어울리는 룩</strong>을 먼저 입어보세요</h3>
      <p class="aim-lede">478개 얼굴 포인트를 추적해 립·섀도·블러셔를 실제 피부 위에 입힙니다.</p>
    </div>`}
    <div class="aim-tabs" role="tablist">
      <span class="aim-tab-ink"></span>
      <button type="button" class="aim-tab" role="tab" data-tab="makeup" aria-selected="true">메이크업</button>
      <button type="button" class="aim-tab" role="tab" data-tab="pc" aria-selected="false">퍼스널컬러</button>
      <button type="button" class="aim-tab" role="tab" data-tab="hair" aria-selected="false">헤어컬러</button>
    </div>

    <section class="aim-pane" data-pane="makeup" data-active="1">
      <div class="aim-label"><span>LONA LOOK</span><span>${String(LOOKS.length).padStart(2, '0')}</span></div>
      <div class="aim-looks" role="group" aria-label="메이크업 룩"></div>
      <div class="aim-lookinfo">
        <div class="aim-lookinfo-en"></div>
        <div class="aim-lookinfo-name"></div>
        <div class="aim-lookinfo-desc"></div>
        <div class="aim-lookinfo-pal"></div>
      </div>
      <div class="aim-range">
        <div class="aim-range-top"><label for="aim-int-${this.id}">메이크업 강도</label><output>80</output></div>
        <input id="aim-int-${this.id}" type="range" min="0" max="100" value="80" data-range="intensity">
      </div>
      <div class="aim-label"><span>PARTS</span><span>부위별 on/off</span></div>
      <div class="aim-parts"></div>
    </section>

    <section class="aim-pane" data-pane="pc">
      <div class="aim-pc-intro">
        <ol class="aim-pc-steps">
          <li><b>01 SCAN</b>이마·양 볼·턱 피부 픽셀 추출</li>
          <li><b>02 CIELAB</b>그림자·반사광 제외 후 L*a*b* 측정</li>
          <li><b>03 SEASON</b>언더톤·명도로 4계절 진단</li>
        </ol>
        <button type="button" class="aim-btn aim-btn--primary aim-btn--wide" data-act="pc">AI 퍼스널컬러 진단 시작</button>
      </div>
      <div class="aim-pc-result" hidden></div>
      <p class="aim-disclaimer">조명·카메라에 따라 달라질 수 있는 참고용 진단입니다. 정확한 진단은 매장 드레이핑 상담으로 확인해 주세요.</p>
    </section>

    <section class="aim-pane" data-pane="hair">
      <div class="aim-label"><span>SALON COLOR · 06</span><button type="button" class="aim-reset" data-hair="" aria-pressed="true">원래 컬러</button></div>
      <div class="aim-hairs"></div>
      <div class="aim-range">
        <div class="aim-range-top"><label for="aim-hair-${this.id}">컬러 강도</label><output>75</output></div>
        <input id="aim-hair-${this.id}" type="range" min="0" max="100" value="75" data-range="hair">
      </div>
      <p class="aim-hint">AI가 머리카락 영역만 분리해 결과 명암은 그대로 두고 색만 바꿉니다. 실제 시술 결과는 모발 상태와 기존 염색 이력에 따라 달라집니다.</p>
    </section>

    <div class="aim-actions">
      <button type="button" class="aim-btn aim-btn--ghost" data-act="save">${ICON.save}<span>저장</span></button>
      <button type="button" class="aim-btn aim-btn--primary" data-act="book"><span class="aim-btn-stack"><span>이 룩으로 예약하기</span><span class="aim-btn-sub"></span></span>${ICON.arrow}</button>
    </div>
  </div>
</div>`;
    const q = (s) => el.querySelector(s);
    this.$ = {
      stage: q('.aim-stage'), canvas: q('.aim-canvas'), fx: q('.aim-fx'), split: q('.aim-split'), knob: q('.aim-split-knob'),
      tagB: q('.aim-tag--before'), tagA: q('.aim-tag--after'), hud: q('.aim-hud'), hudTxt: q('.aim-hud-txt'), hold: q('.aim-hold'),
      toast: q('.aim-toast'), notice: q('.aim-notice'), noticeTxt: q('.aim-notice p'), veil: q('.aim-dropveil'), uplLbl: q('.aim-upl-lbl'),
      loader: q('.aim-loader'), ring: q('.aim-ring-fg'), pct: q('.aim-ring-pct span'),
      loaderTitle: q('.aim-loader-title'), loaderSub: q('.aim-loader-sub'),
      thumbs: q('.aim-thumbs'), file: q('input[type=file]'), camBtn: q('[data-act=camera]'),
      tabs: [...el.querySelectorAll('.aim-tab')], ink: q('.aim-tab-ink'), panes: [...el.querySelectorAll('.aim-pane')],
      looks: q('.aim-looks'), lookEn: q('.aim-lookinfo-en'), lookName: q('.aim-lookinfo-name'), lookDesc: q('.aim-lookinfo-desc'), lookPal: q('.aim-lookinfo-pal'),
      parts: q('.aim-parts'), intensity: q('[data-range=intensity]'), hairK: q('[data-range=hair]'),
      pcIntro: q('.aim-pc-intro'), pcResult: q('.aim-pc-result'), pcBtn: q('[data-act=pc]'),
      hairs: q('.aim-hairs'), bookSub: q('.aim-btn-sub'),
    };
    this.ctx = this.$.canvas.getContext('2d');
    this.fxCtx = this.$.fx.getContext('2d');

    // thumbs
    this.samples.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'aim-thumb'; b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.setAttribute('aria-label', s.label || `샘플 ${i + 1}`); b.dataset.idx = i; b.dataset.key = 'sample:' + i;
      b.innerHTML = `<img alt="" loading="lazy" decoding="async" src="${s.src}">`;
      this.$.thumbs.appendChild(b);
    });
    // looks
    for (const L of LOOKS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'aim-look'; b.dataset.look = L.id; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="aim-look-sw"><i style="background:${L.lips.color}"></i><i style="background:${L.blush.color}"></i><i style="background:${L.shadow.deep}"></i></span><span>${L.name}</span>`;
      this.$.looks.appendChild(b);
    }
    // parts
    for (const [k, label] of PARTS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'aim-part'; b.dataset.part = k; b.setAttribute('aria-pressed', 'true'); b.textContent = label;
      this.$.parts.appendChild(b);
    }
    // hair colors
    for (const Hc of HAIR) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'aim-hair'; b.dataset.hair = Hc.id; b.setAttribute('aria-pressed', 'false');
      const [r, g, bl] = hexRgb(Hc.color);
      const light = rgbHex(r * 1.35 + 20, g * 1.35 + 20, bl * 1.35 + 20), dark = rgbHex(r * 0.55, g * 0.55, bl * 0.55);
      b.innerHTML = `<span class="aim-hair-sw" style="background:linear-gradient(160deg, ${light} 0%, ${Hc.color} 45%, ${dark} 100%)"></span><span class="aim-hair-name">${Hc.name}</span><span class="aim-hair-desc">${Hc.desc}</span>`;
      this.$.hairs.appendChild(b);
    }
    this.bind();
    this.syncUI();
  }

  bind() {
    const $ = this.$, on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this._disposers.push(() => t.removeEventListener(ev, fn, o)); };
    const stop = () => this.stopDemo();
    for (const ev of ['pointerdown', 'keydown', 'focusin', 'drop', 'touchstart']) on(this.el, ev, stop, { capture: true, passive: true });
    on($.thumbs, 'click', (e) => {
      const b = e.target.closest('.aim-thumb'); if (!b) return;
      if (b.dataset.user) this.selectUser(b.dataset.user); else this.selectSample(+b.dataset.idx);
    });
    this.el.querySelectorAll('[data-act=upload]').forEach((b) => on(b, 'click', (e) => { e.stopPropagation(); $.file.click(); }));
    const drop = this.el.querySelector('.aim-drop');
    on(drop, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $.file.click(); } });
    on($.file, 'change', () => { const f = $.file.files && $.file.files[0]; if (f) this.loadFile(f); $.file.value = ''; });
    // drag & drop anywhere on the module
    let depth = 0;
    const hasFiles = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
    const clearDrag = () => { depth = 0; delete this.el.dataset.drag; };
    on(this.el, 'dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; this.el.dataset.drag = '1'; });
    on(this.el, 'dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    on(this.el, 'dragleave', (e) => { if (!hasFiles(e)) return; if (--depth <= 0) clearDrag(); });
    on(this.el, 'drop', (e) => {
      if (!hasFiles(e)) return; e.preventDefault(); clearDrag();
      const files = [...(e.dataTransfer.files || [])];
      const f = files.find((x) => isImageFile(x)) || files[0];
      if (f) this.loadFile(f);
    });
    // paste an image from the clipboard (Ctrl+V / Cmd+V) while the module is on screen
    on(document, 'paste', (e) => {
      if (!this.visible) return;
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) { e.preventDefault(); this.stopDemo(); this.loadFile(f); return; } }
      }
    });
    on($.camBtn, 'click', () => (this.cam ? this.stopCamera(true) : this.startCamera()));
    on($.looks, 'click', (e) => { const b = e.target.closest('.aim-look'); if (b) this.setLook(b.dataset.look); });
    on($.parts, 'click', (e) => { const b = e.target.closest('.aim-part'); if (!b) return; const k = b.dataset.part; this.state.parts[k] = !this.state.parts[k]; this.syncUI(); this.invalidate(); });
    on($.intensity, 'input', () => { this.state.intensity = +$.intensity.value; this.syncUI(); this.invalidate(); });
    on($.hairK, 'input', () => { this.state.hairK = +$.hairK.value; this.syncUI(); this.invalidate(); });
    on($.hairs, 'click', (e) => { const b = e.target.closest('.aim-hair'); if (b) this.setHair(b.dataset.hair === this.state.hair ? null : b.dataset.hair); });
    on(this.el.querySelector('.aim-reset'), 'click', () => this.setHair(null));
    for (const t of $.tabs) on(t, 'click', () => this.setTab(t.dataset.tab));
    on($.pcBtn, 'click', () => this.runPersonalColor());
    on($.pcResult, 'click', (e) => {
      const r = e.target.closest('[data-rec-look]'); if (r) { this.setLook(r.dataset.recLook); this.setTab('makeup'); return; }
      const h = e.target.closest('[data-rec-hair]'); if (h) { this.setHair(h.dataset.recHair); this.setTab('hair'); return; }
      if (e.target.closest('[data-act=pc-again]')) this.runPersonalColor();
    });
    on(this.el.querySelector('[data-act=save]'), 'click', () => this.save());
    on(this.el.querySelector('[data-act=book]'), 'click', () => this.book());

    // compare split + press-and-hold
    const stage = $.stage;
    let drag = null, holdT = 0;
    const posToSplit = (clientX) => { const r = stage.getBoundingClientRect(); return clamp((clientX - r.left) / r.width, 0, 1); };
    on(stage, 'pointerdown', (e) => {
      if (e.target.closest('.aim-hold, .aim-loader button')) return;
      const onKnob = !!e.target.closest('.aim-split-knob');
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: onKnob ? 'split' : 'pending' };
      if (onKnob) { stage.setPointerCapture(e.pointerId); e.preventDefault(); }
      else holdT = setTimeout(() => { if (drag && drag.mode === 'pending') { drag.mode = 'hold'; this.setOriginal(true); } }, 260);
    });
    on(stage, 'pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (drag.mode === 'pending' && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        clearTimeout(holdT); drag.mode = 'split'; try { stage.setPointerCapture(e.pointerId); } catch (_) {}
      } else if (drag.mode === 'pending' && Math.abs(dy) > 10) { clearTimeout(holdT); drag = null; return; }
      if (drag.mode === 'split') { this.setSplit(posToSplit(e.clientX)); e.preventDefault(); }
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      clearTimeout(holdT);
      if (drag.mode === 'hold') this.setOriginal(false);
      else if (drag.mode === 'pending' && e && e.type === 'pointerup') this.animateSplit(posToSplit(e.clientX));
      drag = null;
    };
    on(stage, 'pointerup', end); on(stage, 'pointercancel', end); on(stage, 'lostpointercapture', end);
    on($.knob, 'keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { this.setSplit(this.state.split + (e.key === 'ArrowLeft' ? -0.05 : 0.05)); e.preventDefault(); }
    });
    on($.hold, 'pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { $.hold.setPointerCapture(e.pointerId); } catch (_) {} this.setOriginal(true); });
    const holdEnd = () => this.setOriginal(false);
    on($.hold, 'pointerup', holdEnd); on($.hold, 'pointercancel', holdEnd); on($.hold, 'lostpointercapture', holdEnd);
    on($.hold, 'contextmenu', (e) => e.preventDefault());
    on(stage, 'contextmenu', (e) => e.preventDefault());

    // sizing
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe($.stage);
    this._disposers.push(() => this.ro.disconnect());
    // lazy engine start + camera stop when leaving the viewport
    this.io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        if (en.target === this.el && en.isIntersecting) this.load();
        if (en.target === $.stage && !en.isIntersecting && this.cam) this.stopCamera(false, '화면을 벗어나 카메라를 껐습니다.');
      }
    }, { rootMargin: '600px 0px' });
    this.io.observe(this.el);
    this.visible = true;
    this.io2 = new IntersectionObserver((ents) => {
      for (const en of ents) { this.visible = en.isIntersecting; if (!en.isIntersecting && this.cam) this.stopCamera(false); }
    }, { threshold: 0 });
    this.io2.observe($.stage);
    this._disposers.push(() => { this.io.disconnect(); this.io2.disconnect(); });
    on(this.el, 'pointerdown', () => this.load(), { once: true });
    on(document, 'visibilitychange', () => { if (document.hidden && this.cam) this.stopCamera(false); });
    on(window, 'pagehide', () => { if (this.cam) this.stopCamera(false); });
  }

  syncUI() {
    const $ = this.$, S = this.state, L = this.look();
    for (const b of $.looks.children) b.setAttribute('aria-pressed', String(b.dataset.look === S.look));
    $.lookEn.textContent = L.en; $.lookName.textContent = L.name; $.lookDesc.textContent = L.desc;
    $.lookPal.innerHTML = [['LIP', L.lips.color], ['CHEEK', L.blush.color], ['EYE', L.shadow.deep], ['FINISH', null]]
      .map(([n, c]) => (c ? `<span><i style="background:${c}"></i>${n}</span>` : `<span style="padding-left:9px">${{ matte: '매트', satin: '새틴', glossy: '글로시' }[L.lips.finish]} 립</span>`)).join('');
    for (const b of $.parts.children) b.setAttribute('aria-pressed', String(!!S.parts[b.dataset.part]));
    $.intensity.value = S.intensity; $.intensity.style.setProperty('--v', S.intensity + '%');
    $.intensity.closest('.aim-range').querySelector('output').textContent = S.intensity;
    $.hairK.value = S.hairK; $.hairK.style.setProperty('--v', S.hairK + '%');
    $.hairK.closest('.aim-range').querySelector('output').textContent = S.hairK;
    for (const b of $.hairs.children) b.setAttribute('aria-pressed', String((b.dataset.hair || null) === S.hair));
    this.el.querySelector('.aim-reset').setAttribute('aria-pressed', String(!S.hair));
    const hairName = S.hair ? HAIR.find((h) => h.id === S.hair).name : '';
    $.bookSub.textContent = hairName ? `${L.name} · ${hairName}` : L.name;
    const ti = ['makeup', 'pc', 'hair'].indexOf(S.tab);
    $.ink.style.transform = `translateX(${ti * 100}%)`;
    for (const t of $.tabs) t.setAttribute('aria-selected', String(t.dataset.tab === S.tab));
    for (const p of $.panes) p.dataset.active = p.dataset.pane === S.tab ? '1' : '0';
  }

  look() { return LOOKS.find((l) => l.id === this.state.look) || LOOKS[0]; }

  setLook(id, o = {}) {
    if (!LOOKS.some((l) => l.id === id)) return;
    if (o.auto) this.startXfade();
    this.state.look = id; this.syncUI();
    const chip = this.$.looks.querySelector(`[data-look="${id}"]`);
    if (chip && this.$.looks.scrollWidth > this.$.looks.clientWidth) {
      const r = chip.offsetLeft - (this.$.looks.clientWidth - chip.offsetWidth) / 2;
      this.$.looks.scrollTo({ left: r, behavior: 'smooth' });
    }
    this.invalidate();
  }
  setTab(tab) {
    this.state.tab = tab; this.syncUI();
    if (tab === 'hair' && this.engine.face) this.engine.loadHair().catch(() => {});
  }
  async setHair(id) {
    this.state.hair = id; this.syncUI();
    if (!id) { this.invalidate(); return; }
    if (this.cam) {
      try { await this.engine.loadHair(); if (this.cam) await this.engine.hairModeSet('VIDEO'); }
      catch (e) { console.error('[aim] hair', e); this.toast('헤어 모델을 불러오지 못했습니다.', 3000); }
      return;
    }
    if (!this.src || this.src.kind !== 'photo') { this.invalidate(); return; }
    await this.ensureHairMask();
    this.invalidate();
  }
  async ensureHairMask() {
    const src = this.src; if (!src || src.kind !== 'photo' || src.hairMask) return;
    try {
      await this.load();
      if (!src.hairPending) {
        this.toast('헤어 영역을 분석하고 있습니다', 0);
        src.hairPending = this.engine.segment(src.canvas).then((mask) => {
          src.hairMask = mask || { none: true };
          if (this.src === src) this.hairR.setMask(mask, src.canvas);
        });
      }
      await src.hairPending;
      this.toast('');
      if (this.src === src && this.hairR.coverage !== undefined && this.hairR.coverage < 0.01) this.toast('머리카락 영역을 찾지 못했습니다.', 2600);
    } catch (e) { console.error('[aim] hair', e); this.toast('헤어 모델을 불러오지 못했습니다.', 3000); }
  }

  /* ---------- loading ---------- */
  load() {
    if (this._loadP) return this._loadP;
    this.$.loader.hidden = false;
    this._loadP = this.engine.load((p, phase) => {
      const pct = Math.round(p * (phase === 'init' ? 100 : 96));
      this.$.pct.textContent = pct;
      this.$.ring.style.strokeDashoffset = String(226.2 * (1 - pct / 100));
      if (phase === 'init') this.$.loaderTitle.textContent = 'AI 엔진 초기화 중';
    }).then(async () => {
      this.readyAt = Math.round(performance.now());
      this.$.loader.hidden = true;
      this.$.hudTxt.textContent = 'ON-DEVICE AI · READY';
      if (this.src && this.src.kind === 'photo' && !this.src.analyzed) await this.analyzePhoto(this.src);
      // warm the hair model in the background so the hair tab feels instant
      setTimeout(() => this.engine.loadHair().catch(() => {}), 1500);
    }).catch((e) => {
      console.error('[aim] engine load failed', e);
      this.$.loaderTitle.textContent = 'AI 엔진을 불러오지 못했습니다';
      this.$.loaderSub.textContent = '네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
      const btn = document.createElement('button'); btn.className = 'aim-loader-btn'; btn.textContent = '다시 시도';
      btn.onclick = () => { btn.remove(); this._loadP = null; this.engine._p = null; this.$.loaderTitle.textContent = 'AI 뷰티 엔진 준비 중'; this.load(); };
      this.$.loader.appendChild(btn);
    });
    return this._loadP;
  }

  /* ---------- sources ---------- */
  markThumb(key) { for (const b of this.$.thumbs.children) b.setAttribute('aria-pressed', String(b.dataset.key === key)); }
  async selectSample(i) {
    const s = this.samples[i]; if (!s) return;
    this.markThumb('sample:' + i);
    if (this.cam) this.stopCamera(false);
    try { const img = await loadImage(s.src); await this.setPhoto(img, 'sample:' + i); }
    catch (e) { console.error(e); this.toast('샘플 사진을 불러오지 못했습니다.', 3000); }
  }
  async selectUser(key) {
    const u = this.userPhotos.find((p) => p.key === key); if (!u) return;
    if (this.cam) this.stopCamera(false);
    this.markThumb(key);
    await this.setPhoto(u.full, key);
  }
  async loadFile(file) {
    const name = (file.name || '').toLowerCase();
    const heic = /image\/hei[cf]/.test(file.type) || /\.(heic|heif)$/.test(name);
    if (!isImageFile(file)) { this.emit('not-image'); this.notice('이미지 파일이 아닙니다. <b>JPG · PNG · WEBP</b> 사진을 올려 주세요.'); return; }
    if (file.size > 80 * 1024 * 1024) { this.emit('too-large'); this.notice('파일이 너무 큽니다(80MB 초과). 조금 더 작은 사진으로 시도해 주세요.'); return; }
    if (this.cam) this.stopCamera(false);
    this.notice(''); this.toast('사진을 불러오는 중입니다', 0);
    let full;
    try {
      const img = await decodeImageFile(file);
      full = downscale(img, MAX_PHOTO_SIDE);
      if (img.close) img.close();
    } catch (e) {
      console.warn('[aim] decode failed', e);
      this.toast('');
      this.emit(heic ? 'heic-unsupported' : 'decode-error');
      this.notice(heic
        ? 'HEIC(아이폰 고효율) 사진은 이 브라우저에서 열 수 없습니다. <b>JPG로 저장한 사진</b>을 올리거나, 아이폰 설정 &gt; 카메라 &gt; 포맷에서 <b>높은 호환성</b>을 선택해 주세요.'
        : '이 사진은 열 수 없습니다. <b>JPG · PNG · WEBP</b> 형식으로 다시 시도해 주세요.');
      return;
    }
    this.toast('');
    const key = 'user:' + Date.now();
    this.userPhotos.unshift({ key, full, thumb: thumbURL(full) });
    this.userPhotos = this.userPhotos.slice(0, 3);
    this.renderUserThumbs();
    this.markThumb(key);
    this.$.uplLbl.textContent = '다른 사진';
    this.$.thumbs.scrollTo({ left: 0, behavior: 'smooth' });
    await this.setPhoto(full, key);
  }
  renderUserThumbs() {
    this.$.thumbs.querySelectorAll('.aim-thumb--user').forEach((n) => n.remove());
    const first = this.$.thumbs.firstChild;
    for (const u of this.userPhotos) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'aim-thumb aim-thumb--user'; b.dataset.user = u.key; b.dataset.key = u.key;
      b.setAttribute('aria-label', '내 사진'); b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<img alt="" src="${u.thumb}"><span>MY</span>`;
      this.$.thumbs.insertBefore(b, first);
    }
  }
  emit(state, extra = {}) {
    this.status = { key: this.src && this.src.key, state, ...extra };
    try { this.el.dispatchEvent(new CustomEvent('aim:photo', { detail: this.status, bubbles: true })); } catch (_) {}
  }
  notice(html) {
    const n = this.$.notice;
    if (!html) { n.hidden = true; return; }
    this.$.noticeTxt.innerHTML = html; n.hidden = false;
  }
  async setPhoto(img, key) {
    const full = img instanceof HTMLCanvasElement && Math.max(img.width, img.height) <= MAX_PHOTO_SIDE ? img : downscale(img, MAX_PHOTO_SIDE);
    const src = { kind: 'photo', key, full, canvas: full, crop: posterRect(full.width, full.height), analyzed: false };
    this.src = src; this.P = null; this.hairR.setMask(null); this.resetPC();
    this.toast(''); this.notice('');
    this.cancelFx();
    this.invalidate();
    if (this.engine.face) await this.analyzePhoto(src);
  }
  async findFace(canvas) {
    const W = canvas.width, H = canvas.height;
    let best = pickLargest(await this.engine.detect(canvas), W, H);
    if (best) return best;
    // small faces (group / full-body / landscape shots): retry on zoomed tiles
    const tiles = [];
    for (const [sz, n] of [[0.6, 3], [0.42, 3]]) {
      const tw = W * sz, th = H * sz;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) tiles.push({ x: (W - tw) * i / (n - 1), y: (H - th) * j / (n - 1), w: tw, h: th, pass: sz });
    }
    const tc = makeCanvas(1, 1); let bestW = 0;
    for (const t of tiles) {
      if (bestW > 0 && t.pass < 0.5) break; // found in the coarse pass
      const s = Math.min(1.6, 900 / Math.max(t.w, t.h));
      tc.width = Math.round(t.w * s); tc.height = Math.round(t.h * s);
      tc.getContext('2d').drawImage(canvas, t.x, t.y, t.w, t.h, 0, 0, tc.width, tc.height);
      const f = pickLargest(await this.engine.detect(tc), tc.width, tc.height);
      if (!f) continue;
      const pts = f.pts.map((p) => ({ x: t.x + p.x / s, y: t.y + p.y / s }));
      const fw = dist(pts[234], pts[454]);
      if (fw > bestW) { bestW = fw; best = { pts, count: f.count, tiled: true }; }
      if (t.pass < 0.5) break; // fine pass: first hit is enough
    }
    return best;
  }
  async analyzePhoto(src) {
    src.analyzed = true;
    let found;
    try { found = await this.findFace(src.full); } catch (e) { console.error('[aim] detect', e); }
    if (this.src !== src) return;
    if (!found) {
      this.P = null; this.invalidate();
      this.$.hudTxt.textContent = 'NO FACE'; this.emit('no-face');
      this.notice('얼굴을 찾지 못했습니다. 얼굴이 가려졌거나 너무 작거나 옆모습일 수 있어요. <b>정면 얼굴이 크게 나온 사진</b>을 올려 주세요.');
      return;
    }
    // auto-frame: face ~46% of the frame width, 4:5 portrait
    const oval = FACE_OVAL.map((i) => found.pts[i]);
    const fb = ptsBox(oval);
    const faceWpx = dist(found.pts[234], found.pts[454]);
    if (faceWpx < 48) {
      this.P = null; this.invalidate(); this.$.hudTxt.textContent = 'FACE TOO SMALL'; this.emit('face-too-small', { faceWidth: Math.round(faceWpx) });
      this.notice('얼굴이 너무 작게 나와 메이크업을 정확히 입힐 수 없습니다. <b>얼굴이 크게 나온 사진</b>(셀카·상반신)을 올려 주세요.');
      return;
    }
    const guide = [];
    const userPhoto = !/^sample:/.test(src.key);
    if (faceWpx < 150 && userPhoto) guide.push('얼굴이 작게 나온 사진이라 디테일이 떨어질 수 있어요. 얼굴이 크게 나온 사진을 추천합니다.');
    const yaw = dist(found.pts[1], found.pts[234]) / Math.max(1, dist(found.pts[1], found.pts[454]));
    if (Math.max(yaw, 1 / yaw) > 4.2 && userPhoto) guide.push('얼굴이 옆으로 많이 돌아가 있어 한쪽 메이크업이 어긋날 수 있어요. <b>정면에 가까운 사진</b>이 가장 정확합니다.');
    const crop = faceCrop(fb, src.full.width, src.full.height);
    const outW = Math.round(clamp(crop.w, 720, WORK_MAX_W)), outH = Math.round(outW * 5 / 4);
    const work = makeCanvas(outW, outH);
    const wx = work.getContext('2d'); wx.imageSmoothingQuality = 'high';
    wx.drawImage(src.full, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
    let P = null, count = found.count;
    try {
      const r2 = await this.engine.detect(work);
      const f2 = pickLargest(r2, outW, outH);
      if (f2) { P = f2.pts; count = Math.max(count, f2.count); }
    } catch (e) { console.error(e); }
    if (this.src !== src) return;
    if (!P) P = found.pts.map((p) => ({ x: (p.x - crop.x) * outW / crop.w, y: (p.y - crop.y) * outH / crop.h }));
    const fromRect = src.crop;
    src.canvas = work; src.crop = crop; src.work = work;
    this.P = P;
    this.$.hudTxt.textContent = count > 1 ? `FACE ${count} · 가장 큰 얼굴 기준` : 'FACE LOCKED · 478 POINTS';
    if (count > 1) guide.unshift(`얼굴이 ${count}명 감지되어 <b>가장 크게 나온 얼굴</b>에 적용했습니다.`);
    if (guide.length) setTimeout(() => { if (this.src === src) this.toast(guide.join('<br>'), 4600); }, 900);
    this.emit('ready', { faces: count, faceWidth: Math.round(faceWpx), yaw: +Math.max(yaw, 1 / yaw).toFixed(2), tiled: !!found.tiled, guide: guide.map((g) => g.replace(/<[^>]+>/g, '')), size: [src.full.width, src.full.height] });
    if (this.debug) window.__aim = this;
    // zoom-in transition from the poster framing to the face framing, then trace + makeup fade-in
    this.zoom = { from: fromRect, to: crop, full: src.full, t0: performance.now(), dur: 700 };
    this.fade = 0;
    this.runTrace(P, 700);
    this.invalidate();
    if (this.state.hair) this.ensureHairMask().then(() => this.invalidate());
    this.scheduleDemo(src);
  }

  /* ---------- camera ---------- */
  async startCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.toast('카메라는 <b>HTTPS</b> 보안 연결에서만 사용할 수 있습니다. 사진으로 체험해 주세요.', 4200); return;
    }
    this.$.camBtn.setAttribute('aria-pressed', 'true');
    const hint = setTimeout(() => this.toast('브라우저의 <b>카메라 권한 요청</b>을 허용해 주세요. 영상은 기기 밖으로 나가지 않습니다.', 0), 350);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      clearTimeout(hint); this.toast('');
    } catch (e) {
      clearTimeout(hint);
      this.$.camBtn.setAttribute('aria-pressed', 'false');
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      this.toast(denied ? '카메라 권한이 거부되었습니다. <b>샘플 사진이나 내 사진</b>으로 체험해 보세요.' : '사용할 수 있는 카메라를 찾지 못했습니다. 사진으로 체험해 주세요.', 4200);
      return;
    }
    try { await this.load(); } catch (_) {}
    if (!this.engine.face) { stream.getTracks().forEach((t) => t.stop()); this.$.camBtn.setAttribute('aria-pressed', 'false'); return; }
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.srcObject = stream;
    try { await video.play(); } catch (e) { /* autoplay with muted should succeed */ }
    await new Promise((r) => (video.readyState >= 2 ? r() : video.addEventListener('loadeddata', r, { once: true })));
    await this.engine.faceModeSet('VIDEO');
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.min(1, CAM_MAX_SIDE / Math.max(vw, vh));
    const frame = makeCanvas(Math.round(vw * s), Math.round(vh * s));
    for (const b of this.$.thumbs.children) b.setAttribute('aria-pressed', 'false');
    this.cancelFx(); this.resetPC(); this.toast('');
    this.cam = { stream, video, frame, fctx: frame.getContext('2d'), last: -1, frameNo: 0, t0: performance.now(), fps: 0, fpsT: performance.now(), fpsN: 0, segT: 0, segCost: 30, lostN: 0 };
    this.src = { kind: 'camera', key: 'camera', canvas: frame, full: frame, crop: { x: 0, y: 0, w: frame.width, h: frame.height } };
    this.P = null; this.fade = 1; this.zoom = null;
    this.hairR.setMask(null);
    this.$.hud.dataset.live = '1';
    if (this.state.hair) this.engine.loadHair().then(() => this.engine.hairModeSet('VIDEO')).catch(() => {});
    this.camLoop();
  }
  camLoop = () => {
    const c = this.cam; if (!c) return;
    c.raf = requestAnimationFrame(this.camLoop);
    if (c.paused) return;
    const v = c.video;
    if (v.readyState < 2 || v.currentTime === c.last) return;
    c.last = v.currentTime; c.frameNo++;
    const f = c.frame, x = c.fctx;
    x.save(); x.setTransform(-1, 0, 0, 1, f.width, 0); x.drawImage(v, 0, 0, f.width, f.height); x.restore();
    const ts = performance.now();
    let found = null;
    try { found = pickLargest(this.engine.detectVideo(f, ts), f.width, f.height); } catch (e) { console.error(e); }
    const tDet = performance.now() - ts;
    if (found) {
      c.lostN = 0;
      // temporal smoothing (adaptive): steady when still, responsive when moving
      if (this.P && this.P.length === found.pts.length) {
        let d = 0; for (let i = 0; i < found.pts.length; i += 12) d += dist(found.pts[i], this.P[i]);
        d /= Math.ceil(found.pts.length / 12);
        const fw = dist(found.pts[234], found.pts[454]) || 1;
        const al = clamp(0.35 + (d / fw) * 28, 0.35, 1);
        this.P = found.pts.map((p, i) => ({ x: lerp(this.P[i].x, p.x, al), y: lerp(this.P[i].y, p.y, al) }));
      } else this.P = found.pts;
    } else if (++c.lostN > 4) this.P = null;
    // hair segmentation, throttled to its cost
    if (this.state.hair && this.engine.hair && this.engine.hairMode === 'VIDEO' && ts - c.segT > Math.max(90, c.segCost * 3)) {
      const t0 = performance.now();
      try { const m = this.engine.segmentVideo(f, ts); if (m) this.hairR.setMask(m, c.frameNo % 8 === 0 || this.hairR.mean === 0.2 ? f : null); } catch (e) { console.error(e); }
      c.segCost = performance.now() - t0; c.segT = ts;
    }
    c.fpsN++;
    if (ts - c.fpsT > 700) { c.fps = Math.round((c.fpsN * 1000) / (ts - c.fpsT)); c.fpsN = 0; c.fpsT = ts; this.$.hudTxt.textContent = this.P ? `LIVE · ${c.fps} FPS · 478 POINTS` : 'LIVE · 얼굴을 화면 중앙에 맞춰 주세요'; }
    const tr = performance.now();
    this.renderAfter(c.frameNo); this.renderDisplay();
    const tRen = performance.now() - tr, k = c.frameNo < 3 ? 1 : 0.1;
    c.tDet = lerp(c.tDet || tDet, tDet, k); c.tRen = lerp(c.tRen || tRen, tRen, k);
    // adaptive quality: drop the heaviest layers on slow devices, restore when there is headroom
    if (c.frameNo > 20) { if (!c.lite && c.tRen > 24) c.lite = true; else if (c.lite && c.tRen < 9) c.lite = false; }
  };
  stopCamera(backToSample, msg) {
    const c = this.cam; if (!c) return;
    cancelAnimationFrame(c.raf);
    c.stream.getTracks().forEach((t) => t.stop());
    c.video.srcObject = null;
    this.cam = null;
    this.$.camBtn.setAttribute('aria-pressed', 'false');
    delete this.$.hud.dataset.live;
    this.$.hudTxt.textContent = 'ON-DEVICE AI · READY';
    if (this.engine.face) this.engine.faceModeSet('IMAGE').catch(() => {});
    if (this.engine.hair) this.engine.hairModeSet('IMAGE').catch(() => {});
    if (msg) this.toast(msg, 2600);
    if (backToSample) this.selectSample(0);
  }

  /* ---------- rendering ---------- */
  resize() {
    const c = this.$.canvas, r = this.$.stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; this.$.fx.width = w; this.$.fx.height = h; }
    this.invalidate();
  }
  invalidate(displayOnly = false) {
    if (this.cam) return; // camera loop renders every frame
    if (!displayOnly) this._dirty = true;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (this._dirty || this.fade < 1) { this._dirty = false; this.renderAfter(); }
      this.renderDisplay();
      if (this.zoom || this.fade < 1) this.invalidate();
      else if (this.xfade) this.invalidate(true);
    });
  }
  startXfade() {
    if (!this.after || !this.P || this.cam) return;
    const c = this._xfC || (this._xfC = makeCanvas(1, 1));
    c.width = this.after.width; c.height = this.after.height;
    c.getContext('2d').drawImage(this.after, 0, 0);
    this.xfade = { from: c, t0: performance.now(), dur: 700 };
  }

  /* ---------- idle auto-demo ---------- */
  scheduleDemo(src) {
    if (this.demoStopped || this.cam || !src || !/^sample:/.test(src.key)) return;
    clearTimeout(this._demoT);
    const first = !this._swept; this._swept = true;
    // wait for the zoom (700ms) + makeup fade-in (900ms), then sweep the divider once and start cycling
    this._demoT = setTimeout(async () => {
      if (this.demoStopped || this.src !== src) return;
      if (first) await this.sweepSplit([0.06, 0.94, 0.5], [950, 1300, 850]);
      this.demoStep(src, first ? 1500 : DEMO_INTERVAL);
    }, 1750);
  }
  demoStep(src, delay = DEMO_INTERVAL) {
    if (this.demoStopped || this.src !== src) return;
    this._demoT = setTimeout(() => {
      if (this.demoStopped || this.src !== src) return;
      if (this.visible && !document.hidden && !this.state.showOriginal) {
        const i = (DEMO_ORDER.indexOf(this.state.look) + 1) % DEMO_ORDER.length;
        this.setLook(DEMO_ORDER[i], { auto: true });
        this.$.hudTxt.textContent = 'AUTO PREVIEW · ' + this.look().en;
      }
      this.demoStep(src);
    }, delay);
  }
  sweepSplit(targets, durs) {
    const tok = ++this._sweepTok;
    return targets.reduce((p, to, k) => p.then(() => new Promise((res) => {
      if (tok !== this._sweepTok) return res();
      const from = this.state.split, t0 = performance.now();
      const step = () => {
        if (tok !== this._sweepTok) return res();
        const t = clamp((performance.now() - t0) / durs[k], 0, 1);
        this.setSplit(lerp(from, to, easeInOut(t)));
        if (t < 1) requestAnimationFrame(step); else setTimeout(res, 120);
      };
      requestAnimationFrame(step);
    })), Promise.resolve());
  }
  stopDemo() {
    if (this.demoStopped) return;
    this.demoStopped = true; clearTimeout(this._demoT); this._sweepTok++;
    if (this.P && /^AUTO/.test(this.$.hudTxt.textContent)) this.$.hudTxt.textContent = 'FACE LOCKED · 478 POINTS';
  }
  renderAfter(frameNo = 0) {
    const src = this.src; if (!src) return;
    const base = src.canvas;
    if (!this.after) this.after = makeCanvas(base.width, base.height);
    if (this.after.width !== base.width || this.after.height !== base.height) { this.after.width = base.width; this.after.height = base.height; }
    const ax = this.after.getContext('2d');
    ax.globalCompositeOperation = 'source-over'; ax.globalAlpha = 1;
    ax.drawImage(base, 0, 0);
    if (!this.P && !(this.state.hair && this.hairR.raw)) return;
    const now = performance.now();
    if (this.fade < 1 && !this.zoom) { this._fadeT ??= now; this.fade = clamp((now - this._fadeT) / 900, 0, 1); if (this.fade >= 1) this._fadeT = null; }
    const fk = easeOut(this.fade);
    if (this.state.hair && this.hairR.raw) {
      const H = HAIR.find((h) => h.id === this.state.hair);
      this.hairR.render(ax, base, this.P, H, (this.state.hairK / 100) * (src.kind === 'photo' ? fk : 1));
    }
    if (this.P) {
      try {
        const lite = !!(this.cam && this.cam.lite);
        this.makeup.render(ax, base, this.P, this.look(), this.state.parts, (this.state.intensity / 100) * fk, { key: src.key, frame: frameNo, lite });
      } catch (e) { console.error('[aim] render', e); }
    }
  }
  displayRect(bw, bh) {
    const c = this.$.canvas, s = Math.max(c.width / bw, c.height / bh);
    return { s, ox: (c.width - bw * s) / 2, oy: (c.height - bh * s) / 2 };
  }
  renderDisplay() {
    const src = this.src, ctx = this.ctx, c = this.$.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0B0B0C'; ctx.fillRect(0, 0, c.width, c.height);
    if (!src) return;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (this.zoom) {
      const z = this.zoom, t = easeInOut(clamp((performance.now() - z.t0) / z.dur, 0, 1));
      const r = { x: lerp(z.from.x, z.to.x, t), y: lerp(z.from.y, z.to.y, t), w: lerp(z.from.w, z.to.w, t), h: lerp(z.from.h, z.to.h, t) };
      this.drawCover(z.full, r);
      if (t >= 1) { this.zoom = null; this._fadeT = null; }
      this.updateSplitUI(true);
      return;
    }
    if (src.kind === 'photo' && !src.work) { this.drawCover(src.full, src.crop); this.updateSplitUI(true); return; }
    const after = this.after || src.canvas;
    const full = { x: 0, y: 0, w: src.canvas.width, h: src.canvas.height };
    const hasFx = !!this.P || (this.state.hair && this.hairR.raw);
    if (this.state.showOriginal || !hasFx) { this.drawCover(src.canvas, full); this.updateSplitUI(!hasFx); return; }
    this.drawCover(after, full);
    if (this.xfade) {
      const t = (performance.now() - this.xfade.t0) / this.xfade.dur;
      if (t >= 1) this.xfade = null;
      else { ctx.save(); ctx.globalAlpha = 1 - easeInOut(clamp(t, 0, 1)); this.drawCover(this.xfade.from, full); ctx.restore(); }
    }
    const sx = Math.round(this.state.split * c.width);
    if (sx > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, c.height); ctx.clip();
      this.drawCover(src.canvas, full); ctx.restore();
    }
    this.updateSplitUI(false);
  }
  drawCover(img, r) {
    const c = this.$.canvas, s = Math.max(c.width / r.w, c.height / r.h);
    const dw = r.w * s, dh = r.h * s;
    this.ctx.drawImage(img, r.x, r.y, r.w, r.h, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  }
  updateSplitUI(hidden) {
    const $ = this.$, sp = this.state.split;
    const hide = hidden || this.state.showOriginal;
    $.split.style.opacity = hide ? '0' : '1';
    $.split.style.left = sp * 100 + '%';
    $.knob.setAttribute('aria-valuenow', String(Math.round(sp * 100)));
    $.tagB.style.opacity = hide ? (this.state.showOriginal ? '1' : '0') : sp > 0.12 ? '1' : '0';
    $.tagA.style.opacity = hide ? '0' : sp < 0.88 ? '1' : '0';
    $.hold.dataset.on = this.state.showOriginal ? '1' : '0';
  }
  setSplit(v) { this.state.split = clamp(v, 0, 1); if (this.cam) return; if (this.xfade) this.invalidate(true); else this.renderDisplay(); }
  animateSplit(to) {
    const from = this.state.split, t0 = performance.now();
    const step = () => { const t = clamp((performance.now() - t0) / 380, 0, 1); this.setSplit(lerp(from, to, easeOut(t))); if (t < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  setOriginal(on) { if (this.state.showOriginal === on) return; this.state.showOriginal = on; if (!this.cam) this.renderDisplay(); }

  /* ---------- fx: trace + scan ---------- */
  cancelFx() { if (this._fxRaf) cancelAnimationFrame(this._fxRaf); this._fxRaf = 0; const f = this.$.fx; this.fxCtx.clearRect(0, 0, f.width, f.height); }
  toDisplay(P, src) {
    const c = this.$.canvas, bw = src.canvas.width, bh = src.canvas.height;
    const s = Math.max(c.width / bw, c.height / bh), ox = (c.width - bw * s) / 2, oy = (c.height - bh * s) / 2;
    return P.map((p) => ({ x: p.x * s + ox, y: p.y * s + oy }));
  }
  runTrace(P, delay = 0) {
    this.cancelFx();
    const conn = this.engine.conn; if (!conn) return;
    const t0 = performance.now() + delay, dur = 1100;
    const draw = () => {
      const now = performance.now(), t = (now - t0) / dur;
      const x = this.fxCtx, f = this.$.fx; x.clearRect(0, 0, f.width, f.height);
      if (t < 0) { this._fxRaf = requestAnimationFrame(draw); return; }
      if (t >= 1.35 || !this.src) { this._fxRaf = 0; return; }
      const D = this.toDisplay(P, this.src);
      const dpr = f.width / Math.max(1, this.$.stage.clientWidth);
      const fadeOut = t > 1 ? 1 - (t - 1) / 0.35 : 1;
      const prog = easeInOut(clamp(t / 0.85, 0, 1));
      x.save(); x.globalAlpha = fadeOut; x.lineWidth = 0.8 * dpr; x.strokeStyle = 'rgba(255,255,255,0.85)';
      x.shadowColor = 'rgba(255,255,255,0.7)'; x.shadowBlur = 6 * dpr;
      const n = Math.floor(conn.contours.length * prog);
      x.beginPath();
      for (let i = 0; i < n; i++) { const e = conn.contours[i]; x.moveTo(D[e.start].x, D[e.start].y); x.lineTo(D[e.end].x, D[e.end].y); }
      x.stroke();
      x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.55)';
      const np = Math.floor(D.length * prog);
      for (let i = 0; i < np; i += 2) x.fillRect(D[i].x - 0.6 * dpr, D[i].y - 0.6 * dpr, 1.2 * dpr, 1.2 * dpr);
      x.restore();
      this._fxRaf = requestAnimationFrame(draw);
    };
    this._fxRaf = requestAnimationFrame(draw);
  }
  runScan(P, result) {
    this.cancelFx();
    const conn = this.engine.conn;
    return new Promise((resolve) => {
      const t0 = performance.now(), dur = 1600, out = 450;
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const src = this.src;
      const draw = () => {
        const el = performance.now() - t0, t = el / (reduce ? 300 : dur);
        const x = this.fxCtx, f = this.$.fx; x.clearRect(0, 0, f.width, f.height);
        if (t >= 1 + out / dur || !this.src) { this._fxRaf = 0; resolve(); return; }
        const D = this.toDisplay(P, src);
        const dpr = f.width / Math.max(1, this.$.stage.clientWidth);
        const box = ptsBox(D), pad = box.h * 0.08;
        const y0 = box.y - pad, y1 = box.y + box.h + pad;
        const sweep = easeInOut(clamp(t / 0.72, 0, 1));
        const ly = lerp(y0, y1, sweep);
        const fadeOut = t > 1 ? 1 - (t - 1) * dur / out : 1;
        x.save(); x.globalAlpha = fadeOut;
        // dim the image slightly for focus
        x.fillStyle = `rgba(0,0,0,${0.5 * Math.min(1, t * 4)})`; x.fillRect(0, 0, f.width, f.height);
        // mesh: faint behind the line, bright near it
        const band = box.h * 0.07;
        x.lineWidth = 0.55 * dpr;
        x.beginPath(); const hot = new Path2D();
        for (const e of conn.tess) {
          const a = D[e.start], b = D[e.end], my = (a.y + b.y) / 2;
          if (my > ly) continue;
          if (ly - my < band) { hot.moveTo(a.x, a.y); hot.lineTo(b.x, b.y); } else { x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); }
        }
        x.strokeStyle = 'rgba(255,255,255,0.3)'; x.stroke();
        x.strokeStyle = 'rgba(255,255,255,0.95)'; x.shadowColor = 'rgba(255,255,255,0.8)'; x.shadowBlur = 7 * dpr; x.stroke(hot);
        x.shadowBlur = 0;
        // trail + scan line
        if (sweep < 1) {
          const g = x.createLinearGradient(0, ly - band * 2.2, 0, ly);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.1)');
          x.fillStyle = g; x.fillRect(box.x - box.w * 0.3, ly - band * 2.2, box.w * 1.6, band * 2.2);
          const lg = x.createLinearGradient(box.x - box.w * 0.35, 0, box.x + box.w * 1.35, 0);
          lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = lg; x.shadowColor = 'rgba(255,255,255,0.9)'; x.shadowBlur = 12 * dpr;
          x.fillRect(box.x - box.w * 0.35, ly - 0.75 * dpr, box.w * 1.7, 1.5 * dpr); x.shadowBlur = 0;
        }
        // contours
        const ct = clamp((t - 0.5) / 0.3, 0, 1);
        if (ct > 0) {
          x.globalAlpha = fadeOut * ct; x.lineWidth = 1 * dpr; x.strokeStyle = 'rgba(255,255,255,0.9)';
          x.beginPath(); for (const e of conn.contours) { x.moveTo(D[e.start].x, D[e.start].y); x.lineTo(D[e.end].x, D[e.end].y); } x.stroke();
        }
        // sampling regions
        const rt = clamp((t - 0.62) / 0.3, 0, 1);
        if (rt > 0 && result) {
          const s = this.toDisplay([{ x: 0, y: 0 }, { x: 1, y: 0 }], src); const scale = s[1].x - s[0].x;
          x.globalAlpha = fadeOut * rt;
          x.font = `600 ${9 * dpr}px ${getComputedStyle(this.el).fontFamily}`;
          x.textBaseline = 'middle';
          for (const R of result.regions) {
            const c = this.toDisplay([R.c], src)[0], rr = R.r * scale * (0.6 + 0.4 * easeOut(rt));
            x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 1 * dpr; x.setLineDash([3 * dpr, 3 * dpr]);
            x.beginPath(); x.arc(c.x, c.y, rr, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
            x.fillStyle = rgbHex(...hexRgb(labToHex(R.L, R.a, R.b))); x.beginPath(); x.arc(c.x, c.y, 3.2 * dpr, 0, Math.PI * 2); x.fill();
            x.strokeStyle = 'rgba(255,255,255,0.9)'; x.stroke();
            const right = c.x > f.width / 2;
            x.fillStyle = 'rgba(255,255,255,0.95)'; x.textAlign = right ? 'left' : 'right';
            x.fillText(`${R.key}   L* ${R.L.toFixed(0)}  a* ${R.a.toFixed(0)}  b* ${R.b.toFixed(0)}`, c.x + (right ? rr + 6 * dpr : -rr - 6 * dpr), c.y);
          }
        }
        x.restore();
        this._fxRaf = requestAnimationFrame(draw);
      };
      this._fxRaf = requestAnimationFrame(draw);
    });
  }

  /* ---------- personal color ---------- */
  resetPC() { this.$.pcIntro.hidden = false; this.$.pcResult.hidden = true; this.$.pcResult.innerHTML = ''; this.pc = null; }
  async runPersonalColor() {
    if (this._pcBusy) return;
    try { await this.load(); } catch (_) {}
    if (!this.engine.face) return;
    if (!this.src || !this.P) { this.toast('먼저 <b>얼굴이 보이는 사진</b>을 선택해 주세요.', 3000); return; }
    this._pcBusy = true;
    const btns = this.el.querySelectorAll('[data-act=pc], [data-act=pc-again]'); btns.forEach((b) => (b.disabled = true));
    let snapSrc = this.src, P = this.P.map((p) => ({ ...p }));
    if (this.cam) {
      // freeze the current frame for the scan
      const f = makeCanvas(this.cam.frame.width, this.cam.frame.height); f.getContext('2d').drawImage(this.cam.frame, 0, 0);
      snapSrc = { ...this.src, canvas: f }; this.cam.paused = true;
      this.ctx.save(); this.drawCover(f, { x: 0, y: 0, w: f.width, h: f.height }); this.ctx.restore();
    }
    const prevOrig = this.state.showOriginal; this.state.showOriginal = true; if (!this.cam) this.renderDisplay();
    let res = null;
    try { res = analyzePersonalColor(snapSrc.canvas, P); } catch (e) { console.error('[aim] pc', e); }
    const hold = this.src; this.src = snapSrc;
    await this.runScan(P, res);
    this.src = this.cam ? this.src : hold;
    if (this.cam) { this.src = { ...snapSrc, canvas: this.cam.frame }; this.cam.paused = false; }
    this.state.showOriginal = prevOrig; if (!this.cam) this.renderDisplay();
    this._pcBusy = false; btns.forEach((b) => (b.disabled = false));
    if (!res) { this.toast('피부 영역을 충분히 측정하지 못했습니다. 밝은 곳에서 정면 사진으로 시도해 주세요.', 3600); return; }
    this.pc = res; this.showPC(res);
  }
  showPC(r) {
    const S = SEASONS[r.season];
    const lk = S.looks.map((id) => LOOKS.find((l) => l.id === id));
    const hr = S.hair.map((id) => HAIR.find((h) => h.id === id));
    const $r = this.$.pcResult;
    $r.innerHTML = `
      <div class="aim-pc-season-en">${S.en}</div>
      <div class="aim-pc-season">
        <h4>${S.name}<span>${r.undertone === '뉴트럴' ? '뉴트럴(' + (r.season === 'spring' || r.season === 'autumn' ? '웜' : '쿨') + ' 경향)' : r.undertone + ' 언더톤'} · ${r.depth === '라이트' ? '밝은 명도' : '깊은 명도'}</span></h4>
        <div class="aim-pc-conf"><div class="aim-pc-conf-num"><span data-count="${r.confidence}">0</span><small>%</small></div><div class="aim-pc-conf-lbl">CONFIDENCE</div></div>
      </div>
      <div class="aim-pc-bar"><i></i></div>
      <p class="aim-pc-desc">${S.desc}</p>
      <div class="aim-label"><span>MEASURED</span><span>CIELAB · D65</span></div>
      <dl class="aim-pc-metrics">
        <div class="aim-pc-skin"><i style="background:${r.skinHex}"></i><span>SKIN</span></div>
        <div><dt>L* 명도</dt><dd data-count="${r.L.toFixed(1)}" data-dec="1">0</dd></div>
        <div><dt>a* 붉은기</dt><dd data-count="${r.a.toFixed(1)}" data-dec="1">0</dd></div>
        <div><dt>b* 노란기</dt><dd data-count="${r.b.toFixed(1)}" data-dec="1">0</dd></div>
        <div><dt>ITA°</dt><dd data-count="${r.ita.toFixed(1)}" data-dec="1">0</dd></div>
        <div><dt>h° 색상각</dt><dd data-count="${r.hue.toFixed(1)}" data-dec="1">0</dd></div>
        <div><dt>ΔL 명도 대비</dt><dd data-count="${r.contrast.toFixed(0)}" data-dec="0">0</dd></div>
      </dl>
      <p class="aim-pc-note">이마·양 볼·턱 ${r.regions.length}개 영역, 피부 픽셀 ${r.pixels.toLocaleString()}개 (그림자·반사광 제외)${r.wb.applied ? ` · 눈 흰자 기준 조명 보정 적용(Δb ${(-r.wb.b).toFixed(1)})` : ''}</p>
      <div class="aim-label"><span>BEST COLORS</span><span>베스트 컬러</span></div>
      <div class="aim-pc-pal">${S.best.map((c, i) => `<i style="background:${c};transition-delay:${i * 45}ms"></i>`).join('')}</div>
      <div class="aim-pc-avoid"><span>피하면 좋은 컬러</span>${S.avoid.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
      <div class="aim-label"><span>RECOMMENDED LOOK</span><span>눌러서 바로 적용</span></div>
      <div class="aim-pc-recs">${lk.map((L) => `<button type="button" class="aim-pc-rec" data-rec-look="${L.id}"><span class="aim-look-sw"><i style="background:${L.lips.color}"></i><i style="background:${L.blush.color}"></i><i style="background:${L.shadow.deep}"></i></span><span><small>LONA LOOK</small><b>${L.name}</b></span></button>`).join('')}</div>
      <div class="aim-pc-hairrec">${hr.map((H) => `<button type="button" class="aim-chip-mini" data-rec-hair="${H.id}"><i style="background:${H.color}"></i>추천 헤어 · ${H.name}</button>`).join('')}</div>
      <button type="button" class="aim-btn aim-btn--ghost aim-btn--wide" data-act="pc-again">다시 진단하기</button>`;
    this.$.pcIntro.hidden = true; $r.hidden = false;
    requestAnimationFrame(() => {
      $r.querySelector('.aim-pc-bar i').style.width = r.confidence + '%';
      $r.querySelector('.aim-pc-pal').dataset.in = '1';
      const els = $r.querySelectorAll('[data-count]'), t0 = performance.now();
      const tick = () => {
        const t = easeOut(clamp((performance.now() - t0) / 900, 0, 1));
        els.forEach((e) => { const v = +e.dataset.count, d = +(e.dataset.dec || 0); e.textContent = (v * t).toFixed(d); });
        if (t < 1) requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /* ---------- output ---------- */
  exportCanvas() {
    const src = this.src; if (!src) return null;
    if (!this.cam) this.renderAfter();
    const a = this.after || src.canvas;
    const out = makeCanvas(a.width, a.height); const x = out.getContext('2d');
    x.drawImage(a, 0, 0);
    const W = out.width, H = out.height, fs = Math.max(11, Math.round(W * 0.019));
    const g = x.createLinearGradient(0, H * 0.78, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
    x.fillStyle = g; x.fillRect(0, H * 0.78, W, H * 0.22);
    const pad = Math.round(W * 0.04);
    const font = getComputedStyle(this.el).fontFamily || 'sans-serif';
    const spaced = (txt, px, weight, yy, color, track) => {
      x.font = `${weight} ${px}px ${font}`; x.fillStyle = color;
      let w = 0; for (const ch of txt) w += x.measureText(ch).width + px * track; w -= px * track;
      let cx = W - pad - w;
      for (const ch of txt) { x.fillText(ch, cx, yy); cx += x.measureText(ch).width + px * track; }
      return w;
    };
    x.textBaseline = 'alphabetic';
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = fs * 0.6;
    const w1 = spaced('LONA AI BEAUTY LAB', fs, 600, H - pad, 'rgba(255,255,255,0.92)', 0.22);
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(W - pad - w1 - fs * 2.6, H - pad - fs * 0.36, fs * 1.8, Math.max(1, fs * 0.06));
    const L = this.look(), hair = this.state.hair ? HAIR.find((h) => h.id === this.state.hair).name : '';
    spaced(hair ? `${L.name} · ${hair}` : L.name, Math.round(fs * 0.95), 500, H - pad - fs * 1.75, 'rgba(255,255,255,0.72)', 0.02);
    return out;
  }
  async save() {
    const out = this.exportCanvas(); if (!out) return;
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    if (!blob) { this.toast('이미지를 만들지 못했습니다.', 2500); return; }
    const name = `LONA_AI_${this.look().name.replace(/\s+/g, '_')}.png`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    this.lastExport = { name, size: blob.size, w: out.width, h: out.height };
    this.toast('결과 이미지를 저장했습니다.', 2200);
  }
  book() {
    const L = this.look();
    const hair = this.state.hair ? HAIR.find((h) => h.id === this.state.hair) : null;
    const lookName = L.name;
    const detail = { lookId: L.id, lookName: L.name, hairColor: hair ? hair.name : null, intensity: this.state.intensity, personalColor: this.pc ? SEASONS[this.pc.season].name : null };
    if (typeof this.opts.onBook === 'function') this.opts.onBook(lookName, detail);
    else if (this.opts.bookingUrl) window.open(this.opts.bookingUrl, '_blank', 'noopener');
  }

  toast(html, ms = 2600) {
    const t = this.$.toast; clearTimeout(this._toastT);
    if (!html) { t.dataset.show = '0'; return; }
    t.innerHTML = html; t.dataset.show = '1';
    if (ms > 0) this._toastT = setTimeout(() => (t.dataset.show = '0'), ms);
  }

  async mount() {
    ensureStyles(this.base);
    this.build();
    this.resize();
    // start the engine right away when mounted near the viewport (don't wait for the first observer tick)
    const r = this.el.getBoundingClientRect();
    if (this.opts.eager || (r.top < (window.innerHeight || 800) + 600 && r.bottom > -600)) this.load();
    // Show the default sample right away (no camera permission, no model needed to see a face)
    const first = this.samples[0];
    if (first) {
      try { const img = await loadImage(first.src); await this.setPhoto(img, 'sample:0'); } catch (e) { console.error('[aim] sample', e); }
    }
  }
  api() {
    return {
      el: this.el,
      load: () => this.load(),
      setLook: (id) => { this.stopDemo(); this.setLook(id); },
      stopAutoDemo: () => this.stopDemo(),
      setHair: (id) => { this.stopDemo(); return this.setHair(id); },
      setTab: (t) => this.setTab(t),
      looks: LOOKS.map(({ id, name, desc }) => ({ id, name, desc })),
      hairColors: HAIR.map(({ id, name }) => ({ id, name })),
      destroy: () => this.destroy(),
      _app: this,
    };
  }
  destroy() {
    if (this.cam) this.stopCamera(false);
    this.stopDemo();
    this.cancelFx(); cancelAnimationFrame(this._raf);
    for (const d of this._disposers) try { d(); } catch (_) {}
    this.el.innerHTML = ''; this.el.classList.remove('aim');
  }
}

function posterRect(w, h) {
  // 4:5 cover rect biased toward the upper part of the photo (faces live there)
  let cw = w, ch = w * 5 / 4;
  if (ch > h) { ch = h; cw = h * 4 / 5; }
  return { x: (w - cw) / 2, y: clamp(h * 0.28 - ch * 0.5 + ch * 0.22, 0, h - ch), w: cw, h: ch };
}
function faceCrop(fb, W, H) {
  let cw = fb.w / 0.46, ch = cw * 5 / 4;
  if (cw > W) { cw = W; ch = cw * 5 / 4; }
  if (ch > H) { ch = H; cw = ch * 4 / 5; }
  const cx = fb.x + fb.w / 2, cy = fb.y + fb.h * 0.5;
  const x = clamp(cx - cw / 2, 0, W - cw), y = clamp(cy - ch * 0.47, 0, H - ch);
  return { x, y, w: cw, h: ch };
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image(); im.decoding = 'async';
    if (/^https?:/.test(src) && !src.startsWith(location.origin)) im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => rej(new Error('image load failed: ' + src)); im.src = src;
  });
}
function isImageFile(f) {
  return !!f && (/^image\//.test(f.type || '') || /\.(jpe?g|jfif|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || ''));
}
async function decodeImageFile(file) {
  // EXIF orientation is honoured by both paths (createImageBitmap 'from-image', and <img> by default)
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bmp.width > 0 && bmp.height > 0) return bmp;
    } catch (e) { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    if (im.decode) await im.decode().catch(() => {});
    if (!im.naturalWidth) throw new Error('decode failed');
    const c = makeCanvas(im.naturalWidth, im.naturalHeight); // detach from the blob URL
    c.getContext('2d').drawImage(im, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}
function downscale(img, maxSide) {
  const w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * s)), th = Math.max(1, Math.round(h * s));
  let cur = img, cw = w, ch = h;
  // halve in steps for clean downsampling of 12–50MP photos (and to stay under mobile canvas limits)
  while (cw > tw * 2.2) {
    const nw = Math.round(cw / 2), nh = Math.round(ch / 2);
    const c = makeCanvas(nw, nh); const x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, nw, nh);
    if (cur !== img && cur.width) { cur.width = 1; cur.height = 1; }
    cur = c; cw = nw; ch = nh;
  }
  const out = makeCanvas(tw, th); const ox = out.getContext('2d');
  ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'; ox.drawImage(cur, 0, 0, tw, th);
  return out;
}
function thumbURL(canvas) {
  const t = makeCanvas(96, 96), x = t.getContext('2d');
  const s = Math.min(canvas.width, canvas.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(canvas, (canvas.width - s) / 2, clamp(canvas.height * 0.3 - s / 2, 0, canvas.height - s), s, s, 0, 0, 96, 96);
  try { return t.toDataURL('image/jpeg', 0.8); } catch (e) { return ''; }
}
function ensureStyles(base) {
  if (document.querySelector('link[data-aim-css], style[data-aim-css]')) return;
  const has = [...document.styleSheets].some((s) => { try { return s.href && /ai-makeup\.css/.test(s.href); } catch (_) { return false; } });
  if (has) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'ai-makeup.css'; l.dataset.aimCss = '1';
  document.head.appendChild(l);
}

export async function mountAIMakeup(container, opts = {}) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) throw new Error('mountAIMakeup: container not found');
  const app = new AIMakeupApp(container, opts);
  await app.mount();
  return app.api();
}
export { LOOKS, HAIR, SEASONS, MP_VERSION };
