import { FIELDS, MODEL_PHRASE, COPY, TIMING } from '../config.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';

/** Construye la frase modelo con los campos entre corchetes, cada uno en su color. */
function renderPhrase(el) {
  el.innerHTML = MODEL_PHRASE.replace(/\{(\w+)\}/g, (_, key) => {
    const field = FIELDS.find((f) => f.key === key);
    if (!field) return key;
    return `<span class="tok" style="--c:var(--c-${field.key})">${field.token}</span>`;
  });
}

function renderLegend(el) {
  el.innerHTML = FIELDS.map(
    (f, i) => `<span class="leg" style="--c:var(--c-${f.key});transition-delay:${1.7 + i * 0.07}s"><s></s>${f.label}</span>`
  ).join('');
}

export function createGuideScene() {
  const timers = createTimers();
  let built = false;
  return {
    mount({ el }) {
      if (!built) {
        renderPhrase(el.querySelector('[data-el="phrase"]'));
        renderLegend(el.querySelector('[data-el="legend"]'));
        built = true;
      }

      const eyebrow = el.querySelector('[data-el="eyebrow"]');
      eyebrow.textContent = '';
      timers.after(() => {
        typeText(eyebrow, COPY.guideEyebrow, { cps: TIMING.titleCps, timers });
      }, 120);
    },
    unmount() {
      timers.clear();
    }
  };
}
