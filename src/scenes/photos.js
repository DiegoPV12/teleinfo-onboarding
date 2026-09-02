import { TIMING } from '../config.js';
import { STEP_BY_ID } from '../steps.js';
import { store } from '../store.js';
import { buzz, HAPTICS } from '../haptics.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';
import { poseGuide } from '../ui/pose.js';
import { renderStepBar, paintStepBar, stepLabel } from '../ui/stepbar.js';

const STEP = STEP_BY_ID.photos;

/**
 * Paso 4 · las tres tomas.
 *
 * La cámara la maneja el avatar; aquí solo se guía la postura y se confirma lo
 * que llega por el sondeo. Cada toma puede repetirse por separado
 * (registration_photo_retake con target).
 */
function renderShots(el) {
  el.innerHTML = STEP.shots
    .map(
      (s, i) => `
      <figure class="shot" data-shot="${s.id}" style="--c:var(--c-shot-${s.id});--i:${i}">
        <div class="lens">
          <div class="guide">${poseGuide(s.id)}</div>
          <img class="thumb" alt="" hidden>
          <span class="tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
                 stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </span>
        </div>
        <figcaption>
          <b>${s.label}</b>
          <span>${s.hint}</span>
        </figcaption>
        <button class="retake off" data-retake="${s.id}">Repetir</button>
      </figure>`
    )
    .join('');
}

export function createPhotosScene({ session }) {
  const timers = createTimers();
  let refs = null;
  let off = null;

  function paint() {
    const photos = store.photos();
    const pending = STEP.shots.find((s) => !photos[s.id]?.url);

    for (const s of STEP.shots) {
      const card = refs.shots.querySelector(`[data-shot="${s.id}"]`);
      const img = card.querySelector('.thumb');
      const url = photos[s.id]?.url ?? '';
      const ready = Boolean(url);

      if (ready && img.getAttribute('src') !== url) {
        img.src = url;
        buzz(HAPTICS.field);
      }
      img.hidden = !ready;
      card.classList.toggle('ready', ready);
      card.classList.toggle('now', !ready && pending?.id === s.id);
      card.classList.toggle('wait', !ready && pending?.id !== s.id);
      card.querySelector('.retake').classList.toggle('off', !ready);
    }

    refs.listen.textContent = pending
      ? pending.hint
      : 'Revise las tres tomas y confirme';
    refs.verify.disabled = !store.canVerify('photos');
    paintStepBar(refs.bar, 'photos');
  }

  return {
    mount({ el }) {
      refs = {
        bar: el.querySelector('[data-el="photoBar"]'),
        eyebrow: el.querySelector('[data-el="photoEyebrow"]'),
        title: el.querySelector('[data-el="photoTitle"]'),
        shots: el.querySelector('[data-el="shots"]'),
        listen: el.querySelector('[data-el="photoListen"]'),
        verify: el.querySelector('[data-el="photoVerify"]'),
        cancel: el.querySelector('[data-el="photoCancel"]')
      };

      renderStepBar(refs.bar);
      renderShots(refs.shots);
      refs.eyebrow.textContent = stepLabel('photos');

      refs.shots.querySelectorAll('[data-retake]').forEach((btn) =>
        btn.addEventListener('click', () => {
          buzz(HAPTICS.tap);
          session.retakePhoto(btn.dataset.retake);
        })
      );
      refs.verify.onclick = () => {
        buzz(HAPTICS.confirm);
        session.verifyStep('photos');
      };
      refs.cancel.onclick = () => session.cancel();

      refs.title.textContent = '';
      timers.after(() => typeText(refs.title, STEP.title, { cps: TIMING.titleCps, timers }), 120);

      paint();
      off = store.subscribe(() => paint());
    },

    unmount() {
      timers.clear();
      off?.();
      off = null;
    }
  };
}
