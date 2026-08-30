import { COPY, TIMING } from '../config.js';
import { createTimers } from '../timers.js';
import { typeText } from '../ui/typewriter.js';
import { createSlider } from '../ui/slider.js';

export function createWelcomeScene() {
  const timers = createTimers();
  let slider = null;

  return {
    mount({ el, go }) {
      const line1 = el.querySelector('[data-el="heroLine1"]');
      const line2 = el.querySelector('[data-el="heroLine2"]');
      const lede = el.querySelector('[data-el="lede"]');
      const foot = el.querySelector('[data-el="welcomeFoot"]');
      const sliderEl = el.querySelector('[data-el="slider"]');

      foot.classList.remove('in');
      line1.textContent = '';
      line2.textContent = '';
      lede.textContent = '';

      if (!slider) {
        slider = createSlider(sliderEl, { timers, onComplete: () => go('guide') });
      } else {
        slider.reset();
      }

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
                  onDone: () => foot.classList.add('in')
                });
              }, TIMING.ledeDelay)
            });
          }, 120)
        });
      }, TIMING.heroDelay);
    },

    unmount() {
      timers.clear();
    }
  };
}
