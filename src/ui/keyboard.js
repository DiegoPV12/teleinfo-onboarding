import * as SimpleKeyboard from 'simple-keyboard';

/**
 * El paquete se publica en CommonJS: Vite entrega el constructor en `default`
 * y Node, al importarlo como ESM, lo deja un nivel más adentro. El export con
 * nombre está en los dos, así que se toma ese.
 */
const Keyboard = SimpleKeyboard.SimpleKeyboard ?? SimpleKeyboard.default?.default ?? SimpleKeyboard.default;
import { buzz, HAPTICS } from '../haptics.js';
import { log } from '../log.js';

/**
 * Teclado en pantalla para la tablet.
 *
 * El kiosco corre en un navegador de escritorio a pantalla completa, así que el
 * teclado del sistema no aparece: hay que poner uno. Se monta una sola vez y se
 * enseña al enfocar un campo.
 *
 * DECISIÓN IMPORTANTE · simple-keyboard se usa solo como EMISOR DE TECLAS.
 * La biblioteca sabe llevar su propio buffer de texto, pero aquí no sirve: el
 * avatar dicta datos por el sondeo y cambia el valor del input por debajo, con
 * lo que ese buffer quedaría desincronizado y la siguiente tecla pisaría lo que
 * llegó. Así que la única fuente de verdad es el `<input>`: cada tecla se aplica
 * sobre él respetando el cursor, y se dispara un evento `input` para que el
 * flujo normal de la escena (session.edit → PATCH) siga funcionando igual que
 * si el visitante hubiera escrito con un teclado físico.
 */

/** Distribución española de iPad, con la ñ en su sitio. */
const LETTERS = [
  'q w e r t y u i o p',
  'a s d f g h j k l ñ',
  '{shift} z x c v b n m {bksp}',
  '{numbers} @ {space} . {enter}'
];

const LETTERS_SHIFT = [
  'Q W E R T Y U I O P',
  'A S D F G H J K L Ñ',
  '{shift} Z X C V B N M {bksp}',
  '{numbers} @ {space} . {enter}'
];

const SYMBOLS = [
  '1 2 3 4 5 6 7 8 9 0',
  "- / : ; ( ) $ & @ \"",
  '{more} . , ? ! \' + {bksp}',
  '{abc} _ {space} .com {enter}'
];

/** Teléfono: un pad numérico se acierta mucho mejor con el dedo. */
const PHONE = [
  '1 2 3',
  '4 5 6',
  '7 8 9',
  '+ 0 {bksp}',
  '{enter}'
];

const DISPLAY = {
  '{bksp}': '⌫',
  '{enter}': 'Siguiente',
  '{space}': 'espacio',
  '{shift}': '⇧',
  '{numbers}': '123',
  '{abc}': 'ABC',
  '{more}': '#+=',
  '{hide}': '⌄'
};

/** Teclas que no escriben nada: se pintan en gris, como en iOS. */
const CONTROL = new Set(['{bksp}', '{enter}', '{shift}', '{numbers}', '{abc}', '{more}']);

let instance = null;

function build() {
  const root = document.createElement('div');
  root.className = 'kb';
  root.innerHTML = `
    <div class="kb-bar">
      <span class="kb-label" data-el="kbLabel"></span>
      <button class="kb-done" data-el="kbDone" type="button">Listo</button>
    </div>
    <div class="kb-keys"></div>`;
  document.body.appendChild(root);

  let input = null;
  let shifted = false;

  const keys = root.querySelector('.kb-keys');
  const label = root.querySelector('[data-el="kbLabel"]');

  /**
   * Escribe sobre el input respetando la selección y avisa al resto de la app.
   * `setRangeText` mantiene el historial de deshacer del navegador, cosa que
   * asignar `.value` a pelo rompe.
   */
  /**
   * `setRangeText`/`selectionStart` solo existen en inputs `text`, `search`,
   * `tel`, `url` y `password`; en otros tipos lanzan. Si eso pasa, se cae a
   * empalmar `.value` a pelo — se pierde el historial de deshacer, pero al
   * menos la tecla escribe.
   */
  function splice(from, to, text) {
    if (!input) return;
    const hasRange =
      input.selectionStart !== null && typeof input.setRangeText === 'function';
    if (hasRange) {
      try {
        input.setRangeText(text, from, to, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      } catch { /* tipo sin selección: sigue el plan B */ }
    }
    const v = input.value;
    input.value = v.slice(0, from) + text + v.slice(to);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function type(text) {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    splice(start, end, text);
  }

  function backspace() {
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (start === end && start === 0) return;
    if (start === end) splice(start - 1, end, '');
    else splice(start, end, '');
  }

  /** Enter salta al siguiente campo del paso; en el último, cierra. */
  function next() {
    const all = [...document.querySelectorAll('.form input')];
    const at = all.indexOf(input);
    const following = at >= 0 ? all[at + 1] : null;
    if (following) following.focus();
    else api.close();
  }

  const engine = new Keyboard(keys, {
    layout: { default: LETTERS, shift: LETTERS_SHIFT, symbols: SYMBOLS, phone: PHONE },
    display: DISPLAY,
    mergeDisplay: true,
    physicalKeyboardHighlight: true,
    // Sin `useMouseEvents` la biblioteca usa eventos de puntero: la tecla
    // responde al apoyar el dedo, no al soltarlo. En una tablet se nota.
    preventMouseDownDefault: true,   // sin esto, tocar una tecla roba el foco
    buttonTheme: [
      { class: 'kb-ctl', buttons: [...CONTROL].join(' ') },
      { class: 'kb-wide', buttons: '.com' }
    ],
    onKeyPress(key) {
      buzz(HAPTICS.tap);

      if (key === '{bksp}') return backspace();
      if (key === '{enter}') return next();
      if (key === '{space}') return type(' ');
      if (key === '{shift}') {
        shifted = !shifted;
        return engine.setOptions({ layoutName: shifted ? 'shift' : 'default' });
      }
      if (key === '{numbers}' || key === '{more}') {
        return engine.setOptions({ layoutName: 'symbols' });
      }
      if (key === '{abc}') {
        shifted = false;
        return engine.setOptions({ layoutName: 'default' });
      }

      type(key);
      // Mayúscula de una sola tecla, como en iOS.
      if (shifted) {
        shifted = false;
        engine.setOptions({ layoutName: 'default' });
      }
    }
  });

  root.querySelector('[data-el="kbDone"]').addEventListener('click', () => api.close());

  const api = {
    /**
     * Enseña el teclado para un campo. El layout sale del propio input: un
     * `inputmode="tel"` abre el pad numérico y uno de correo arranca en
     * minúsculas con la arroba a mano.
     */
    open(target, { label: title = '' } = {}) {
      input = target;
      shifted = false;
      const numeric = target.inputMode === 'tel' || target.inputMode === 'numeric';
      engine.setOptions({ layoutName: numeric ? 'phone' : 'default' });
      root.classList.toggle('numeric', numeric);
      label.textContent = title;
      if (!root.classList.contains('open')) {
        root.classList.add('open');
        document.body.classList.add('kb-open');
        log.form(`teclado abierto para «${title || target.dataset.field}»`);
      }
    },

    close() {
      if (!root.classList.contains('open')) return;
      root.classList.remove('open');
      document.body.classList.remove('kb-open');
      input?.blur();
      input = null;
    },

    get input() { return input; },
    get isOpen() { return root.classList.contains('open'); }
  };

  // Tocar fuera del teclado y de los campos lo cierra, como en el sistema.
  document.addEventListener('pointerdown', (e) => {
    if (!api.isOpen) return;
    if (root.contains(e.target) || e.target.closest?.('.form input')) return;
    api.close();
  });

  return api;
}

/** Se construye a la primera, y una sola vez por sesión de navegador. */
export function keyboard() {
  if (typeof document === 'undefined') return null;
  if (!instance) instance = build();
  return instance;
}

/**
 * Engancha un input al teclado. Devuelve la función para soltarlo, porque la
 * escena de paso se vuelve a armar en cada paso y no debe acumular oyentes.
 */
export function bindKeyboard(input, { label = '' } = {}) {
  const kb = keyboard();
  if (!kb) return () => {};

  const show = () => kb.open(input, { label });
  input.addEventListener('focus', show);
  // En una tablet el foco a veces no llega solo: el toque lo garantiza.
  input.addEventListener('pointerdown', show);

  return () => {
    input.removeEventListener('focus', show);
    input.removeEventListener('pointerdown', show);
    if (kb.input === input) kb.close();
  };
}
