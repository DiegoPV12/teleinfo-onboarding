import { COPY, TIMING } from '../config.js';
import { store } from '../store.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';

/**
 * Registro completo. La impresión de la credencial corre por cuenta del
 * backend; aquí solo se agradece y, tras un momento, la pantalla vuelve sola
 * a la bienvenida lista para la siguiente persona.
 */
export function createDoneScene({ session }) {
  const timers = createTimers();

  return {
    mount({ el }) {
      const data = store.all();
      const nameEl = el.querySelector('[data-el="doneName"]');
      const ledeEl = el.querySelector('[data-el="doneLede"]');

      el.querySelector('[data-el="doneFull"]').textContent =
        [data.nombre, data.apellido].filter(Boolean).join(' ') || '—';
      el.querySelector('[data-el="doneRole"]').textContent =
        [data.cargo, data.empresa].filter(Boolean).join(' · ') || '—';

      nameEl.textContent = '';
      ledeEl.textContent = '';

      timers.after(() => {
        typeText(nameEl, data.nombre ? `Listo, ${data.nombre}.` : 'Listo.', {
          cps: TIMING.heroCps,
          timers,
          onDone: () => timers.after(() => {
            typeText(ledeEl, COPY.doneLede, { cps: TIMING.ledeCps, timers });
          }, 150)
        });
      }, 200);

      // El kiosco siempre vuelve solo a la bienvenida.
      timers.after(() => session.finish(), TIMING.idleReset);
    },

    unmount() {
      timers.clear();
    }
  };
}
