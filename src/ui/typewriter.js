const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Escribe el texto carácter por carácter con cursor, respetando pausas
 * naturales en comas y puntos. Con reduced-motion aparece completo.
 */
export function typeText(el, text, { cps = 20, timers, onDone } = {}) {
  if (reduced || !timers) {
    el.textContent = text;
    onDone?.();
    return;
  }

  el.textContent = '';
  el.classList.add('typing');
  let i = 0;

  const step = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) {
      const ch = text[i - 1];
      const pause = ch === ',' ? 150 : ch === '.' ? 260 : 0;
      timers.after(step, 1000 / cps + pause + Math.random() * 22);
    } else {
      el.classList.remove('typing');
      onDone?.();
    }
  };

  timers.after(step, 0);
}
