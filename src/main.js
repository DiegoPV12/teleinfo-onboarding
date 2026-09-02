import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/components.css';
import './styles/scenes.css';

import { COPY } from './config.js';
import { createRouter } from './router.js';
import { createSession } from './session.js';
import { store } from './store.js';
import { buzz, HAPTICS } from './haptics.js';

import { createWelcomeScene } from './scenes/welcome.js';
import { createStepScene } from './scenes/step.js';
import { createPhotosScene } from './scenes/photos.js';
import { createDoneScene } from './scenes/done.js';

const link = document.querySelector('[data-el="link"]');
link.querySelector('[data-el="linkTxt"]').textContent = COPY.offline;

const session = createSession({
  onScene: (name) => router.go(name),
  onStatus: ({ online }) => { link.hidden = online !== false; }
});

const scenes = {
  welcome: createWelcomeScene({ session }),
  step: createStepScene({ session }),
  photos: createPhotosScene({ session }),
  done: createDoneScene({ session })
};

const router = createRouter(scenes);
router.go('welcome');

document.querySelectorAll('.btn').forEach((btn) =>
  btn.addEventListener('click', () => buzz(HAPTICS.tap))
);

// El kiosco no debe quedarse mirando un estado viejo tras un suspend.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) session.resync();
});

session.start();
