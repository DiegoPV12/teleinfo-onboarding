import { COPY, TIMING } from '../config.js';
import { store } from '../store.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';

/**
 * Registro completo. La impresión de la credencial corre por cuenta del
 * backend; aquí solo se confirma y se espera a que el tótem cierre la sesión
 * (el sondeo devolverá 204 y la pantalla volverá sola a la bienvenida).
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

      // Cierre del flujo: se avisa una sola vez al entrar.
      session.confirmFinal();
    },

    unmount() {
      timers.clear();
    }
  };
}
