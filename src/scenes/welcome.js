import { COPY, SHOW_SLIDER, TIMING, WATCHES_TOTEM } from '../config.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';
import { createSlider } from '../ui/slider.js';

/**
 * Bienvenida. La sesión normal la abre el avatar al detectar a la persona; el
 * indicador de espera vive arriba a la derecha, como en el resto de pasos.
 *
 * El slider es el respaldo por si la detección falla: se compone con el saludo
 * —mismo bloque, mismo ancho que el título— y se enciende o apaga con
 * VITE_SHOW_SLIDER.
 */
export function createWelcomeScene({ session }) {
  const timers = createTimers();
  let slider = null;
  let measure = null;

  return {
    mount({ el }) {
      const line1 = el.querySelector('[data-el="heroLine1"]');
      const line2 = el.querySelector('[data-el="heroLine2"]');
      const lede = el.querySelector('[data-el="lede"]');
      const head = el.querySelector('[data-el="welcomeHead"]');
      const fallback = el.querySelector('[data-el="fallback"]');
      const sliderEl = el.querySelector('[data-el="slider"]');

      // Sin sondeo nadie está mirando: el texto no debe prometer detección.
      el.querySelector('[data-el="waitTxt"]').textContent =
        WATCHES_TOTEM ? COPY.waiting : COPY.waitingManual;
      head.classList.remove('in');
      fallback.classList.remove('in');
      fallback.hidden = !SHOW_SLIDER;
      line1.textContent = '';
      line2.textContent = '';
      lede.textContent = '';

      /** El slider mide lo que mide el título: se ajusta al texto ya escrito. */
      measure = () => {
        const width = Math.max(line1.offsetWidth, line2.offsetWidth);
        if (width > 0) fallback.style.setProperty('--track-w', `${Math.round(width)}px`);
        slider?.reset();
      };

      if (SHOW_SLIDER) {
        if (!slider) {
          slider = createSlider(sliderEl, { timers, onComplete: () => session.begin() });
        } else {
          slider.reset();
        }
      }

      window.addEventListener('resize', measure);
      // La tipografía de marca puede cargar tarde y cambiar el ancho del título.
      document.fonts?.ready.then(() => measure?.());

      timers.after(() => {
        typeText(line1, COPY.heroLine1, {
          cps: TIMING.heroCps,
          timers,
          onDone: () => timers.after(() => {
            typeText(line2, COPY.heroLine2, {
              cps: TIMING.heroCps,
              timers,
              onDone: () => timers.after(() => {
                typeText(lede, COPY.lede, {
                  cps: TIMING.ledeCps,
                  timers,
                  onDone: () => {
                    head.classList.add('in');
                    if (!SHOW_SLIDER) return;
                    measure();
                    fallback.classList.add('in');
                  }
                });
              }, TIMING.ledeDelay)
            });
          }, 120)
        });
      }, TIMING.heroDelay);
    },

    unmount() {
      timers.clear();
      if (measure) window.removeEventListener('resize', measure);
      measure = null;
    }
  };
}
