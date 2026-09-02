import { STEPS, stepIndex } from '../steps.js';
import { store } from '../store.js';

/**
 * Stepper. Es la única referencia de "dónde estoy" en un flujo estricto, así
 * que lleva número y nombre: no basta con una barra fina.
 */
export function renderStepBar(el) {
  el.innerHTML = STEPS.map((s, i) => {
    const token = s.kind === 'photos' ? 'photos' : s.fields[0];
    return `
      <s data-step="${s.id}" style="--c:var(--c-${token})">
        <b class="n">
          <span>${i + 1}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
               stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </b>
        <em>${s.short}</em>
        <i></i>
      </s>`;
  }).join('');
}

export function paintStepBar(el, currentId) {
  const at = stepIndex(currentId);
  el.querySelectorAll('s').forEach((seg, i) => {
    const done = store.isVerified(seg.dataset.step);
    seg.classList.toggle('done', done);
    seg.classList.toggle('now', i === at && !done);
    seg.classList.toggle('next', i > at && !done);
  });
}

export const stepLabel = (id) => `Paso ${stepIndex(id) + 1} de ${STEPS.length}`;
