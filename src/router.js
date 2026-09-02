import { TIMING } from './config.js';
import { createTimers } from './timers.js';

/**
 * Router de escenas. Cada escena expone { mount(ctx), unmount() } y recibe su
 * propio <section data-scene>. Solo una escena está montada a la vez.
 *
 * A diferencia de la versión anterior no hay orden ni botones de navegación:
 * la escena la decide `session.derive()` a partir del estado del tótem.
 */
export function createRouter(scenes) {
  const timers = createTimers();
  const nodes = new Map(
    [...document.querySelectorAll('.scene')].map((el) => [el.dataset.scene, el])
  );
  let current = null;

  function go(name) {
    if (name === current || !nodes.has(name)) return;
    timers.clear();

    const prev = current;
    if (prev) {
      const el = nodes.get(prev);
      el.classList.remove('on');
      el.classList.add('out');
      timers.after(() => el.classList.remove('out'), TIMING.sceneOut);
      scenes[prev]?.unmount?.();
    }

    current = name;
    document.body.dataset.scene = name;
    const el = nodes.get(name);
    timers.after(() => el.classList.add('on'), prev ? TIMING.sceneIn : 0);
    scenes[name]?.mount?.({ el, go });
  }

  return { go, get current() { return current; } };
}
