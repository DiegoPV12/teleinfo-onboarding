import { COPY, FIELDS, TIMING } from '../config.js';
import { store } from '../store.js';
import { buzz, HAPTICS } from '../haptics.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';

function renderForm(el) {
  el.innerHTML = FIELDS.map(
    (f) => `
      <div class="row" style="--c:var(--c-${f.key})">
        <label for="field-${f.key}">${f.label}</label>
        <input id="field-${f.key}" data-field="${f.key}" placeholder="${f.ghost}"
               autocomplete="off" spellcheck="false"
               ${f.type ? `type="${f.type}"` : ''}
               ${f.inputMode ? `inputmode="${f.inputMode}"` : ''}>
      </div>`
  ).join('');
}

export function createConfirmScene({ onSubmit }) {
  const timers = createTimers();
  let built = false;

  return {
    mount({ el }) {
      const form = el.querySelector('[data-el="form"]');
      const button = el.querySelector('[data-el="confirmBtn"]');
      const title = el.querySelector('[data-el="confirmTitle"]');

      if (!built) {
        renderForm(form);
        form.querySelectorAll('input').forEach((input) => {
          input.addEventListener('input', () => {
            store.set(input.dataset.field, input.value);
            button.disabled = !store.isComplete();
          });
        });
        button.addEventListener('click', () => {
          buzz(HAPTICS.confirm);
          onSubmit(store.all());
        });
        built = true;
      }

      FIELDS.forEach((f) => {
        form.querySelector(`#field-${f.key}`).value = store.get(f.key);
      });
      button.disabled = !store.isComplete();

      title.textContent = '';
      timers.after(() => {
        typeText(title, COPY.confirmTitle, { cps: TIMING.titleCps, timers });
      }, 120);
    },
    unmount() {
      timers.clear();
    }
  };
}
