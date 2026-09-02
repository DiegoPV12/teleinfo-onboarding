
/**
 * Campos del registro. `step` los agrupa; el color sigue siendo la identidad
 * visual de cada dato (ver tokens.css) y ahora también tiñe su paso.
 */
// En el navegador la inyecta Vite; en Node (pruebas, scripts) caen las de process.
const ENV = import.meta.env ?? globalThis.process?.env ?? {};

/**
 * El tótem-avatar se identifica en la URL de esta pantalla con su CODE:
 *   ?totem=<code>   ·   /t/<code>   ·   /totem/<code>
 * La variable de entorno queda como respaldo para desarrollo.
 */
function totemFromUrl() {
  if (typeof location === 'undefined') return '';
  const query = new URLSearchParams(location.search).get('totem');
  if (query) return query.trim();
  const path = location.pathname.match(/\/(?:t|totem|totems)\/([^/?#]+)/i);
  return path ? decodeURIComponent(path[1]) : '';
}

export const FIELDS = [
  { key: 'nombre',   label: 'Nombre',   ghost: 'Nombre',   step: '1' },
  { key: 'apellido', label: 'Apellido', ghost: 'Apellido', step: '1' },
  { key: 'cargo',    label: 'Cargo',    ghost: 'Cargo',    step: '2' },
  { key: 'empresa',  label: 'Empresa',  ghost: 'Empresa',  step: '2' },
  { key: 'telefono', label: 'Teléfono', ghost: 'Teléfono', step: '3', inputMode: 'tel' },
  { key: 'email',    label: 'Email',    ghost: 'Correo',   step: '3', type: 'email' }
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

export const COPY = {
  heroLine1: 'Bienvenido',
  heroLine2: 'a Expo Teleinfo',
  lede: 'Acérquese al avatar para comenzar su registro.',
  waiting: 'Esperando a que alguien se acerque',
  waitingManual: 'Listo para registrar',
  listening: 'Le escucho',
  listeningDone: 'Ya tengo todo',
  reviewHint: 'Corrija lo que haga falta, aquí o hablando',
  doneLede: 'Su registro está confirmado. Retire su credencial en el mostrador.',
  offline: 'Reconectando'
};

export const TIMING = {
  heroCps: 26,
  ledeCps: 50,
  titleCps: 34,
  heroDelay: 300,
  ledeDelay: 180,
  sceneIn: 140,
  sceneOut: 600,
  /** Espera antes de enviar una edición manual al backend. */
  editDebounce: Number(ENV.VITE_EDIT_DEBOUNCE_MS ?? 400),
  idleReset: Number(ENV.VITE_IDLE_RESET_MS ?? 14000),
  /**
   * Sin actividad en el formulario 
   */
  abandonMs: Number(ENV.VITE_ABANDON_MS ?? 30000)
};

export const API = {
  base: (ENV.VITE_API_BASE ?? '').replace(/\/$/, ''),
  /**
   * Token de la central. 
   */
  token: ENV.VITE_API_TOKEN ?? '',
  /**
   * Identifica al totem-avatar; viaja en la URL de esta pantalla. Es el CODE
   * legible del tótem (ej. "totem-01"), no el UUID interno de `totems.id`:
   * se consulta contra `GET /api/totems/by-code/{code}/current-person` y va
   * en `data.code` del aviso de paso.
   */
  totem: totemFromUrl() || (ENV.VITE_TOTEM_CODE ?? ''),
  pollMs: Number(ENV.VITE_POLL_MS ?? 1500),
  phonePrefix: ENV.VITE_PHONE_PREFIX ?? '+591'
};


/**
 * Cómo empieza una sesión en la bienvenida:
 *
 *   polling → se sondea GET /api/totems/{id}/current-person y, en cuanto el
 *             tótem asigna a alguien, se entra con esa persona. Sin slider.
 *   slider  → nadie detecta nada: el visitante entra a mano y la persona se
 *             crea al cerrar el paso 1.
 *   hybrid  → se sondea, y además se ofrece el slider por si la detección
 *             falla. Gana lo que ocurra primero.
 */
const MODES = ['polling', 'slider', 'hybrid'];
const mode = String(ENV.VITE_START_MODE ?? 'hybrid').toLowerCase();
export const START_MODE = MODES.includes(mode) ? mode : 'hybrid';

/** El slider existe salvo en modo `polling`. */
export const SHOW_SLIDER = START_MODE !== 'polling';

/** ¿Se vigila el tótem esperando que asigne una persona? */
export const WATCHES_TOTEM = START_MODE !== 'slider';

/**
 * Salta el paso de fotos en el registro A MANO (slider).
 *
 * Las fotos las toma el avatar, no esta pantalla: en un registro manual no hay
 * avatar que las tome, así que pedirlas dejaría el flujo sin salida. Con la
 * bandera en `false` el paso se pide igual, para el día que las fotos lleguen
 * por otra vía. No afecta a los registros detectados por el tótem.
 */
export const SKIP_PHOTOS = String(ENV.VITE_SKIP_PHOTOS ?? 'true') !== 'false';

/** `local` guarda el borrador en memoria; `http` habla con el tótem real. */
export const TRANSPORT = ENV.VITE_TRANSPORT ?? 'local';
