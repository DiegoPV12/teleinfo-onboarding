import { COPY, TIMING } from '../config.js';
import { store } from '../store.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';

export function createDoneScene() {
  const timers = createTimers();

  return {
    mount({ el, go }) {
      const data = store.all();
      const nameEl = el.querySelector('[data-el="doneName"]');
      const ledeEl = el.querySelector('[data-el="doneLede"]');

      el.querySelector('[data-el="doneFull"]').textContent =
        [data.nombre, data.apellido].filter(Boolean).join(' ');
      el.querySelector('[data-el="doneRole"]').textContent =
        [data.cargo, data.empresa].filter(Boolean).join(' · ');

      nameEl.textContent = '';
      ledeEl.textContent = '';

      timers.after(() => {
        typeText(nameEl, `Listo, ${data.nombre ?? ''}.`, {
          cps: TIMING.heroCps,
          timers,
          onDone: () => timers.after(() => {
            typeText(ledeEl, COPY.doneLede, { cps: TIMING.ledeCps, timers });
          }, 150)
        });
      }, 200);

      // Reinicio por inactividad: el kiosco siempre vuelve solo a la bienvenida.
      timers.after(() => go('welcome'), TIMING.idleReset);
    },
    unmount() {
      timers.clear();
    }
  };
}
