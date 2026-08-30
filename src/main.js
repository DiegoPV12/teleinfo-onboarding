import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/components.css';
import './styles/scenes.css';

import { IS_DEV, TIMING } from './config.js';
import { createRouter } from './router.js';
import { createSource } from './sources/index.js';
import { store } from './store.js';
import { buzz, HAPTICS } from './haptics.js';

import { createWelcomeScene } from './scenes/welcome.js';
import { createGuideScene } from './scenes/guide.js';
import { createCaptureScene } from './scenes/capture.js';
import { createConfirmScene } from './scenes/confirm.js';
import { createDoneScene } from './scenes/done.js';

document.documentElement.style.setProperty('--idle-reset', `${TIMING.idleReset}ms`);

const source = createSource();

const scenes = {
  welcome: createWelcomeScene(),
  guide: createGuideScene(),
  capture: createCaptureScene({ source }),
  confirm: createConfirmScene({
    onSubmit: (data) => {
      // TODO: enviar al backend del evento antes de mostrar la confirmación.
      console.info('[teleinfo] registro confirmado', data);
      router.go('done');
    }
  }),
  done: createDoneScene()
};

const router = createRouter(scenes, 'welcome');

document.querySelectorAll('[data-go="welcome"]').forEach((btn) =>
  btn.addEventListener('click', () => store.reset())
);
document.querySelectorAll('.btn').forEach((btn) =>
  btn.addEventListener('click', () => buzz(HAPTICS.tap))
);

if (IS_DEV) {
  const ORDER = ['welcome', 'guide', 'capture', 'confirm', 'done'];
  const bar = document.querySelector('[data-el="demo"]');
  bar.hidden = false;
  bar.querySelector('[data-el="simBtn"]').addEventListener('click', () => {
    if (router.current !== 'capture') return router.go('capture');
    const el = document.querySelector('.scene[data-scene="capture"]');
    scenes.capture.unmount();
    scenes.capture.mount({ el, go: router.go });
  });
  bar.querySelector('[data-el="resetBtn"]').addEventListener('click', () => {
    store.reset();
    router.go('welcome');
  });

  document.addEventListener('keydown', (e) => {
    const i = ORDER.indexOf(router.current);
    if (e.key === 'ArrowRight' && i < ORDER.length - 1) router.go(ORDER[i + 1]);
    if (e.key === 'ArrowLeft' && i > 0) router.go(ORDER[i - 1]);
    if (e.key.toLowerCase() === 'r') { store.reset(); router.go('welcome'); }
    if (e.key.toLowerCase() === 'h') bar.classList.toggle('hide');
  });
}
