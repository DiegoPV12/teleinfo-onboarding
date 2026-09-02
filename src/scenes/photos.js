import { TIMING } from '../config.js';
import { PHOTOS_ID, STEP_BY_ID } from '../steps.js';
import { store } from '../store.js';
import { buzz, HAPTICS } from '../haptics.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';
import { poseGuide } from '../ui/pose.js';
import { renderStepBar, paintStepBar, stepLabel } from '../ui/stepbar.js';

const STEP = STEP_BY_ID[PHOTOS_ID];

/**
 * Paso 4 · las tres tomas.
 *
 * La cámara la maneja el avatar; aquí solo se guía la postura y se muestra lo
 * que va apareciendo en `GET /api/persons/{id}/photos`. Las imágenes van
 * autenticadas, así que se traen como blob y se cachea su object URL.
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

      </figure>`
    )
    .join('');
}

export function createPhotosScene({ session }) {
  const timers = createTimers();
  let refs = null;
  let off = null;
  /** sampleId → object URL ya descargada. */
  const urls = new Map();

  function loadImage(sampleId, img) {
    if (!sampleId || urls.has(sampleId)) return;
    urls.set(sampleId, '');
    session.photoUrl(sampleId).then((url) => {
      if (!url) { urls.delete(sampleId); return; }
      urls.set(sampleId, url);
      if (img.isConnected) { img.src = url; img.hidden = false; }
    });
  }

  function paint() {
    const photos = store.photos();
    const pending = STEP.shots.find((s) => !photos[s.id]?.url);

    for (const s of STEP.shots) {
      const card = refs.shots.querySelector(`[data-shot="${s.id}"]`);
      const img = card.querySelector('.thumb');
      const sampleId = photos[s.id]?.id ?? null;
      const ready = Boolean(sampleId);

      if (ready) {
        loadImage(sampleId, img);
        const url = urls.get(sampleId);
        if (url && img.getAttribute('src') !== url) {
          img.src = url;
          buzz(HAPTICS.field);
        }
        img.hidden = !url;
      } else {
        img.removeAttribute('src');
        img.hidden = true;
      }
      card.classList.toggle('ready', ready);
      card.classList.toggle('now', !ready && pending?.id === s.id);
      card.classList.toggle('wait', !ready && pending?.id !== s.id);
    }

    refs.listen.textContent = pending
      ? pending.hint
      : 'Revise las tres tomas y confirme';
    refs.verify.disabled = !store.canVerify(STEP.id);
    paintStepBar(refs.bar, STEP.id);
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
        back: el.querySelector('[data-el="photoBack"]')
      };

      renderStepBar(refs.bar);
      renderShots(refs.shots);
      refs.eyebrow.textContent = stepLabel(STEP.id);

      refs.verify.onclick = () => {
        buzz(HAPTICS.confirm);
        session.verifyStep(STEP.id);
      };
      refs.back.onclick = () => { buzz(HAPTICS.tap); session.back(); };

      refs.title.textContent = '';
      timers.after(() => typeText(refs.title, STEP.title, { cps: TIMING.titleCps, timers }), 120);

      paint();
      off = store.subscribe(() => paint());
    },

    unmount() {
      timers.clear();
      off?.();
      off = null;
      urls.forEach((url) => url && URL.revokeObjectURL(url));
      urls.clear();
    }
  };
}
