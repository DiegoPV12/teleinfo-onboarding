import { COPY, FIELDS, TIMING } from '../config.js';
import { store } from '../store.js';
import { buzz, HAPTICS } from '../haptics.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';

function renderGrid(el) {
  el.innerHTML = FIELDS.map(
    (f) => `
      <div class="field" data-field="${f.key}" style="--c:var(--c-${f.key})">
        <div class="k">${f.label}</div>
        <div class="ghost">${f.ghost}</div>
        <div class="v"></div>
      </div>`
  ).join('');
}

function renderSegments(el) {
  el.innerHTML = FIELDS.map((f) => `<s data-field="${f.key}" style="--c:var(--c-${f.key})"></s>`).join('');
}

export function createCaptureScene({ source }) {
  const timers = createTimers();
  let built = false;
  let refs = null;

  function paint() {
    FIELDS.forEach((f) => {
      const value = store.get(f.key);
      const field = refs.grid.querySelector(`.field[data-field="${f.key}"]`);
      const seg = refs.segs.querySelector(`s[data-field="${f.key}"]`);
      field.querySelector('.v').textContent = value;
      field.classList.toggle('got', Boolean(value));
      seg.classList.toggle('on', Boolean(value));
    });
    refs.count.textContent = `${store.filled()} de ${FIELDS.length}`;
  }

  return {
    mount({ el, go }) {
      if (!built) {
        renderGrid(el.querySelector('[data-el="grid"]'));
        renderSegments(el.querySelector('[data-el="segs"]'));
        built = true;
      }

      refs = {
        grid: el.querySelector('[data-el="grid"]'),
        segs: el.querySelector('[data-el="segs"]'),
        count: el.querySelector('[data-el="count"]'),
        script: el.querySelector('[data-el="script"]'),
        listen: el.querySelector('[data-el="listenTxt"]'),
        title: el.querySelector('[data-el="captureTitle"]')
      };

      store.reset();
      paint();
      refs.script.innerHTML = '<span class="caret"></span>';
      refs.listen.textContent = COPY.listening;
      refs.title.textContent = '';

      timers.after(() => {
        typeText(refs.title, COPY.captureTitle, { cps: TIMING.titleCps, timers });
      }, 120);

      timers.after(() => {
        source.start({
          onTranscript: (text) => {
            refs.script.innerHTML = `<b>${text}</b><span class="caret"></span>`;
          },
          onField: (key, value) => {
            store.set(key, value);
            buzz(HAPTICS.field);
            paint();
            if (store.isComplete()) {
              refs.listen.textContent = COPY.listeningDone;
              timers.after(() => go('confirm'), TIMING.completeToConfirm);
            }
          },
          onReset: () => {
            store.reset();
            paint();
          }
        });
      }, TIMING.captureStart);
    },

    unmount() {
      timers.clear();
      source.stop();
    }
  };
}
