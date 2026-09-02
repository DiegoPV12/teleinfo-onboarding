import { COPY, TIMING } from '../config.js';
import { fieldsOf } from '../steps.js';
import { store } from '../store.js';
import { fieldError } from '../validate.js';
import { buzz, HAPTICS } from '../haptics.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';
import { renderStepBar, paintStepBar, stepLabel } from '../ui/stepbar.js';
import { bindKeyboard, keyboard } from '../ui/keyboard.js';

/**
 * Escena genérica de paso (identidad · trabajo · contacto).
 *
 * Es a la vez captura y verificación: los campos se llenan solos con lo que
 * dicta el avatar y se pueden corregir a mano en el mismo sitio. El flujo es
 * estricto, así que la escena se vuelve a armar cada vez que cambia el paso
 * en lugar de navegar a otra pantalla.
 */
function renderForm(el, step) {
  el.innerHTML = fieldsOf(step)
    .map(
      (f) => `
      <div class="row" data-row="${f.key}" style="--c:var(--c-${f.key})">
        <input id="field-${f.key}" data-field="${f.key}" placeholder="${f.ghost}"
               aria-label="${f.label}" autocomplete="off" spellcheck="false" enterkeyhint="next"
               ${f.type ? `type="${f.type}"` : ''}
               ${f.inputMode ? `inputmode="${f.inputMode}"` : ''}>
        <span class="err" data-err="${f.key}"></span>
      </div>`
    )
    .join('');
}

export function createStepScene({ session }) {
  const timers = createTimers();
  let refs = null;
  let stepId = null;
  let off = null;
  /** Cada campo enganchado al teclado deja aquí su función para soltarlo. */
  let unbind = [];

  /** Vuelca el estado en los inputs, sin pisar el que el visitante está usando. */
  function paint({ landed = [] } = {}) {
    if (!refs || !stepId) return;
    for (const f of fieldsOf(stepId)) {
      const input = refs.form.querySelector(`#field-${f.key}`);
      const row = refs.form.querySelector(`[data-row="${f.key}"]`);
      const meta = store.meta(f.key);
      if (!input) continue;

      if (document.activeElement !== input && input.value !== meta.value) {
        input.value = meta.value;
      }
      row.classList.toggle('got', Boolean(meta.value.trim()));
      row.classList.toggle('avatar', meta.source === 'avatar');

      const err = fieldError(f.key, meta.value);
      row.classList.toggle('bad', Boolean(err));
      row.querySelector('.err').textContent = err ?? '';

      if (landed.includes(f.key)) {
        row.classList.remove('land');
        void row.offsetWidth;
        row.classList.add('land');
        buzz(HAPTICS.field);
      }
    }
    refs.verify.disabled = !store.canVerify(stepId);
    refs.listen.textContent = store.canVerify(stepId) ? COPY.listeningDone : COPY.listening;
    paintStepBar(refs.bar, stepId);
  }

  /** Arma la escena para un paso concreto. */
  function build(step) {
    stepId = step.id;
    renderForm(refs.form, step);
    refs.eyebrow.textContent = stepLabel(step.id);
    refs.hint.textContent = step.hint ?? '';
    refs.hint.hidden = !step.hint;   // un párrafo vacío no debe dejar aire
    refs.skip.hidden = !step.optional;
    refs.back.hidden = !store.previousStep();   // el paso 1 no tiene atrás

    // El formulario se rehace en cada paso: los oyentes del paso anterior
    // apuntan a inputs que ya no existen.
    unbind.forEach((fn) => fn());
    unbind = [];

    refs.form.querySelectorAll('input').forEach((input) => {
      const key = input.dataset.field;
      input.addEventListener('input', () => {
        session.edit(key, input.value);
        paint();
      });
      input.addEventListener('focus', () => session.focus(key, true));
      input.addEventListener('blur', () => { session.focus(key, false); paint(); });
      unbind.push(bindKeyboard(input, { label: input.getAttribute('aria-label') }));
    });

    refs.title.textContent = '';
    refs.el.classList.remove('swap');
    void refs.el.offsetWidth;
    refs.el.classList.add('swap');
    timers.after(() => typeText(refs.title, step.title, { cps: TIMING.titleCps, timers }), 120);
    paint();
  }

  return {
    mount({ el }) {
      refs = {
        el,
        bar: el.querySelector('[data-el="stepBar"]'),
        eyebrow: el.querySelector('[data-el="stepEyebrow"]'),
        title: el.querySelector('[data-el="stepTitle"]'),
        form: el.querySelector('[data-el="stepForm"]'),
        hint: el.querySelector('[data-el="stepHint"]'),
        listen: el.querySelector('[data-el="stepListen"]'),
        skip: el.querySelector('[data-el="stepSkip"]'),
        verify: el.querySelector('[data-el="stepVerify"]'),
        back: el.querySelector('[data-el="stepBack"]')
      };
      renderStepBar(refs.bar);

      refs.verify.onclick = () => {
        buzz(HAPTICS.confirm);
        keyboard()?.close();
        session.verifyStep(stepId);
      };
      refs.skip.onclick = () => { keyboard()?.close(); session.verifyStep(stepId); };
      refs.back.onclick = () => { buzz(HAPTICS.tap); session.back(); };

      const step = store.currentStep();
      if (step) build(step);

      // El paso puede cambiar sin salir de esta escena: lo hace el backend.
      off = store.subscribe((event) => {
        const next = store.currentStep();
        if (!next || next.kind === 'photos' || next.kind === 'done') return;
        if (next.id !== stepId) build(next);
        else paint({ landed: event.type === 'sync' ? event.keys : [] });
      });
    },

    unmount() {
      timers.clear();
      keyboard()?.close();
      unbind.forEach((fn) => fn());
      unbind = [];
      off?.();
      off = null;
      stepId = null;
    }
  };
}
