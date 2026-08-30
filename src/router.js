import { TIMING } from './config.js';
import { createTimers } from './timers.js';

/**
 * Router de escenas. Cada escena expone { mount(ctx), unmount() } y recibe
 * su propio <section data-scene>. Solo una escena está montada a la vez.
 */
export function createRouter(scenes, initial) {
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
    scenes[name]?.mount?.({ el, go, router });
  }

  const router = { go, get current() { return current; } };

  document.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.go));
  });

  go(initial);
  return router;
}
