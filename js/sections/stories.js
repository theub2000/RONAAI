// CUSTOMER STORIES — native horizontal scroller + arrows + mouse drag.
export function initStories() {
  const section = document.querySelector('.stories');
  if (!section) return;
  const track = section.querySelector('.stories__track');
  const [prev, next] = section.querySelectorAll('.arrows__btn');
  const step = () => {
    const c = track.children;
    return c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : track.clientWidth * 0.8;
  };
  const sync = () => {
    const max = track.scrollWidth - track.clientWidth - 2;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max;
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  track.addEventListener('scroll', sync, { passive: true });
  sync();

  let down = false, x0 = 0, s0 = 0, moved = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false; x0 = e.clientX; s0 = track.scrollLeft;
    track.setPointerCapture(e.pointerId);
    track.classList.add('is-dragging');
  });
  track.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 4) moved = true;
    track.scrollLeft = s0 - dx;
  });
  const up = () => {
    if (!down) return;
    down = false;
    track.classList.remove('is-dragging');
    // settle on the nearest card
    const st = step();
    track.scrollTo({ left: Math.round(track.scrollLeft / st) * st, behavior: 'smooth' });
  };
  track.addEventListener('pointerup', up);
  track.addEventListener('pointercancel', up);
  track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
}
