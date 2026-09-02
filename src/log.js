/**
 * Trazas de la pantalla. Existen para responder una sola pregunta mientras se
 * prueba contra la central: ¿estamos hablando con ella, y qué nos contesta?
 *
 * Se apagan con VITE_DEBUG=false. En Node (pruebas, scripts) están mudas
 * siempre: nadie quiere el sondeo mezclado con la salida de los tests.
 */
const ENV = import.meta.env ?? globalThis.process?.env ?? {};

export const DEBUG =
  typeof window !== 'undefined' && String(ENV.VITE_DEBUG ?? 'true') !== 'false';

const COLOR = {
  net: '#007AFF',
  poll: '#8E8E93',
  ses: '#AF52DE',
  form: '#FF9500',
  ok: '#34C759',
  bad: '#FF3B30'
};

const t0 = Date.now();
/** Segundos desde el arranque: deja ver el ritmo del sondeo de un vistazo. */
const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

function emit(level, tag, color, text, extra) {
  if (!DEBUG) return;
  const args = [
    `%c${tag}%c ${stamp()} %c${text}`,
    `background:${color};color:#fff;padding:1px 6px;border-radius:4px;font-weight:600`,
    'color:#86868B',
    'color:inherit'
  ];
  if (extra !== undefined) args.push(extra);
  console[level](...args);
}

/** Valores ya vistos, para no repetir la misma línea en cada tick. */
const seen = new Map();

export const log = {
  net: (text, extra) => emit('log', 'red', COLOR.net, text, extra),
  poll: (text, extra) => emit('log', 'sondeo', COLOR.poll, text, extra),
  session: (text, extra) => emit('log', 'sesión', COLOR.ses, text, extra),
  form: (text, extra) => emit('log', 'form', COLOR.form, text, extra),
  ok: (text, extra) => emit('log', 'ok', COLOR.ok, text, extra),
  bad: (text, extra) => emit('error', 'error', COLOR.bad, text, extra),

  /**
   * Solo escribe cuando la respuesta cambia respecto a la anterior. El sondeo
   * repite lo mismo cada segundo y medio; lo que interesa son las transiciones.
   */
  change(key, value, write) {
    if (!DEBUG) return;
    if (seen.get(key) === value) return;
    seen.set(key, value);
    write();
  },

  /** Tabla de arranque: la configuración con la que se está corriendo. */
  boot(rows) {
    if (!DEBUG) return;
    console.groupCollapsed(
      '%cTELEINFO%c pantalla de registro — configuración',
      'background:#000;color:#fff;padding:2px 8px;border-radius:4px;font-weight:700',
      'color:#86868B'
    );
    console.table(rows);
    console.groupEnd();
  }
};
