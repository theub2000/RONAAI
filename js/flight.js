// flight.js — scroll-scrubbed frame sequence on a <canvas> (hero fly-through).
//
//   const player = await init(canvas, 'flight/manifest.json', beats?)
//   player.setProgress(t)   // t = 0..1 of the flight
//   player.whenDrawn()      // resolves once the exact target frame is on the canvas
//   player.resize(), player.destroy()
//
// manifest.json (tolerant): { version, fps, count, desktop:{w,h,pattern}, mobile:{w,h,pattern},
//   poster, posterMobile, beats?:[{t, frame}] , chapters?:{key:[fromFrame,toFrame]} }
// beats: optional piecewise-linear map t -> frame index (from the manifest or the caller).
//
// Loading: compressed frames are fetched as Blobs (small, all kept), in priority order:
// frames around the playhead first, then a sparse keyframe ladder (every 8th, 4th, 2nd, all).
// Decoded bitmaps live in a small LRU so memory stays bounded on phones.

const pad = (n, w) => String(n).padStart(w, '0');
const fill = (pattern, i) => pattern.replace(/%0(\d)d/, (_, w) => pad(i, +w)).replace('%d', String(i));

function mapBeats(t, beats, last) {
  if (!beats || beats.length < 2) return t * last;
  if (t <= beats[0].t) return beats[0].frame;
  for (let i = 1; i < beats.length; i++) {
    const a = beats[i - 1], b = beats[i];
    if (t <= b.t) return a.frame + (b.frame - a.frame) * ((t - a.t) / (b.t - a.t || 1));
  }
  return beats[beats.length - 1].frame;
}

export function pickSet() {
  return window.matchMedia('(max-aspect-ratio: 1/1)').matches || window.innerWidth <= 767 ? 'mobile' : 'desktop';
}

export async function init(canvas, manifestUrl, beatsArg = null) {
  const res = await fetch(manifestUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('flight manifest missing');
  const m = await res.json();
  const base = manifestUrl.replace(/[^/]*$/, '');
  const count = m.count || m.frameCount || m.frames;
  const which = pickSet();
  const set = m[which] || m.desktop || m.mobile;
  if (!count || !set) throw new Error('flight manifest incomplete');
  const pattern = typeof set === 'string' ? set : set.pattern;
  const start = m.startIndex ?? 0;
  const ver = m.version ? `?v=${encodeURIComponent(m.version)}` : '';
  let beats = beatsArg || m.beats || null;
  const last = count - 1;

  const ctx = canvas.getContext('2d', { alpha: false });
  const blobs = new Array(count);          // compressed frames (kept)
  const failed = new Uint8Array(count);    // 404 / network give-ups (never retried in a loop)
  const bitmaps = new Map();               // decoded LRU: index -> ImageBitmap | HTMLImageElement
  const decoding = new Map();
  const LRU = which === 'mobile' ? 36 : 28;
  const canBitmap = typeof createImageBitmap === 'function';
  const inflight = new Set();
  const MAX_FETCH = 6;
  let target = 0, drawn = -1, dir = 1, raf = 0, dead = false, firstDraw = null;
  let waiters = [];
  const abort = new AbortController();

  // ---- fetch scheduling ----
  const ladder = [];
  const seen = new Uint8Array(count);
  const early = Math.min(last, Math.round(count * 0.14));        // the opening beat
  for (let i = 0; i <= early; i++) { seen[i] = 1; ladder.push(i); }
  seen[last] = 1; ladder.push(last);                              // the final hold frame, early
  for (const step of [4, 2, 1]) for (let i = 0; i < count; i += step) if (!seen[i]) { seen[i] = 1; ladder.push(i); }
  let ladderPos = 0;

  function nextToFetch() {
    // playhead window first (direction biased)
    for (let d = 0; d <= 14; d++) {
      const a = target + d * dir, b = target - Math.ceil(d / 3) * dir;
      if (a >= 0 && a <= last && !blobs[a] && !failed[a] && !inflight.has(a)) return a;
      if (b >= 0 && b <= last && !blobs[b] && !failed[b] && !inflight.has(b)) return b;
    }
    while (ladderPos < ladder.length) {
      const i = ladder[ladderPos++];
      if (!blobs[i] && !failed[i] && !inflight.has(i)) return i;
    }
    return -1;
  }

  function pump() {
    while (!dead && inflight.size < MAX_FETCH) {
      const i = nextToFetch();
      if (i < 0) return;
      inflight.add(i);
      fetch(base + fill(pattern, i + start) + ver, { signal: abort.signal })
        .then((r) => (r.ok ? r.blob() : null))
        .then((b) => {
          inflight.delete(i);
          if (b) blobs[i] = b; else failed[i] = 1;
          if (Math.abs(i - target) <= 2) { decode(i); }
          pump();
        })
        .catch(() => { inflight.delete(i); failed[i] = (failed[i] || 0) + 1 > 2 ? 1 : 0; if (!dead) setTimeout(pump, 600); });
    }
  }

  // ---- decode + LRU ----
  function touch(i, bmp) {
    bitmaps.delete(i);
    bitmaps.set(i, bmp);
    if (bitmaps.size <= LRU) return;
    for (const [k, old] of bitmaps) {             // oldest first; keep the playhead's neighbours
      if (bitmaps.size <= LRU) break;
      if (Math.abs(k - target) < 3 || k === drawn) continue;
      bitmaps.delete(k);
      if (old && old.close) old.close();
      else if (old && old.src) URL.revokeObjectURL(old.src);
    }
  }

  function decode(i) {
    if (bitmaps.has(i) || decoding.has(i) || !blobs[i]) return decoding.get(i);
    const p = (canBitmap
      ? createImageBitmap(blobs[i])
      : new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(blobs[i]); })
    ).then((bmp) => {
      decoding.delete(i);
      if (dead) { bmp.close && bmp.close(); return; }
      touch(i, bmp);
      if (Math.abs(i - target) <= 4) schedule();
    }).catch(() => decoding.delete(i));
    decoding.set(i, p);
    return p;
  }

  function nearestReady(i) {
    if (bitmaps.has(i)) return i;
    for (let d = 1; d < count; d++) {
      if (bitmaps.has(i - d)) return i - d;
      if (bitmaps.has(i + d)) return i + d;
    }
    return -1;
  }

  // ---- drawing ----
  let cw = 0, ch = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, which === 'mobile' ? 2 : 1.5);
    cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.imageSmoothingQuality = 'high';
    drawn = -1;
    schedule();
  }

  function draw() {
    raf = 0;
    if (dead) return;
    // decode the target and a couple ahead
    decode(target);
    decode(Math.min(last, Math.max(0, target + dir)));
    decode(Math.min(last, Math.max(0, target + 2 * dir)));
    const k = nearestReady(target);
    if (k < 0 || k === drawn) { flushWaiters(); return; }
    const img = bitmaps.get(k);
    const iw = img.width, ih = img.height;
    const s = Math.max(cw / iw, ch / ih);
    const w = iw * s, h = ih * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    drawn = k;
    if (firstDraw) { firstDraw(); firstDraw = null; }
    flushWaiters();
  }

  function flushWaiters() {
    if (drawn !== target) return;
    const w = waiters; waiters = [];
    w.forEach((r) => r());
  }

  function schedule() { if (!raf && !dead) raf = requestAnimationFrame(draw); }

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  resize();
  pump();

  const player = {
    count, fps: m.fps, which, manifest: m,
    onFirstDraw(fn) { firstDraw = fn; },
    frameAt(t) { return Math.round(mapBeats(Math.min(1, Math.max(0, t)), beats, last)); },
    setBeats(b) { beats = b; },
    setProgress(t) {
      const f = player.frameAt(t);
      if (f === target) return;
      dir = f > target ? 1 : -1;
      target = f;
      schedule();
      pump();
    },
    whenDrawn() {
      return new Promise((r) => { waiters.push(r); schedule(); pump(); });
    },
    resize,
    destroy() {
      dead = true; abort.abort(); cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      bitmaps.forEach((b) => b.close && b.close()); bitmaps.clear();
    },
  };
  return player;
}
