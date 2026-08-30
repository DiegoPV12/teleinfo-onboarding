import { buzz, HAPTICS } from '../haptics.js';

const DETENTS = 14;
const THRESHOLD = 0.88;

/**
 * Slider táctil de confirmación. El relleno corta en el centro de la perilla
 * para que el color nazca debajo del botón y nunca lo sobrepase.
 */
export function createSlider(el, { onComplete, timers }) {
  const knob = el.querySelector('.knob');
  const fill = el.querySelector('.fill');
  const glow = el.querySelector('.glow');
  const label = el.querySelector('.lbl');

  let dragging = false;
  let max = 0;
  let detent = -1;

  const measure = () => { max = el.clientWidth - knob.offsetWidth - 12; };

  function setProgress(p) {
    const x = p * max;
    const width = x + knob.offsetWidth / 2 + 6;
    knob.style.transform = `translateX(${x}px)`;
    fill.style.width = `${width}px`;
    glow.style.width = `${Math.max(0, width - 10)}px`;
    label.style.opacity = String(Math.max(0, 1 - p * 1.7));

    const d = Math.floor(p * DETENTS);
    if (dragging && d !== detent) {
      detent = d;
      buzz(HAPTICS.detent);
    }
  }

  const positionOf = (event) => {
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left - knob.offsetWidth / 2 - 6) / max));
  };

  function release(p) {
    el.classList.add('snap');
    el.classList.remove('grabbing', 'hot');
    if (p > THRESHOLD) {
      el.classList.add('done');
      setProgress(1);
      buzz(HAPTICS.complete);
      timers.after(onComplete, 420);
    } else {
      setProgress(0);
      buzz(HAPTICS.cancel);
    }
    timers.after(() => el.classList.remove('snap'), 520);
  }

  function onDown(event) {
    measure();
    dragging = true;
    detent = -1;
    el.setPointerCapture(event.pointerId);
    el.classList.add('grabbing', 'hot');
    el.classList.remove('done');
    buzz(HAPTICS.touch);
    setProgress(positionOf(event));
  }

  function onMove(event) {
    if (dragging) setProgress(positionOf(event));
  }

  function onUp(event) {
    if (!dragging) return;
    dragging = false;
    release(positionOf(event));
  }

  function onKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    measure();
    el.classList.add('snap', 'hot', 'done');
    setProgress(1);
    buzz(HAPTICS.complete);
    timers.after(onComplete, 480);
  }

  const onResize = () => { measure(); if (!dragging) setProgress(0); };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  measure();
  setProgress(0);

  return {
    reset() {
      dragging = false;
      el.classList.remove('snap', 'hot', 'done', 'grabbing');
      measure();
      setProgress(0);
    },
    destroy() {
      window.removeEventListener('resize', onResize);
    }
  };
}
