
/**
 * Campos del registro. `step` los agrupa; el color sigue siendo la identidad
 * visual de cada dato (ver tokens.css) y ahora también tiñe su paso.
 */
const ENV = import.meta.env ?? {};

export const FIELDS = [
  { key: 'nombre',   label: 'Nombre',   ghost: 'Nombre',   step: 'identity' },
  { key: 'apellido', label: 'Apellido', ghost: 'Apellido', step: 'identity' },
  { key: 'cargo',    label: 'Cargo',    ghost: 'Cargo',    step: 'work' },
  { key: 'empresa',  label: 'Empresa',  ghost: 'Empresa',  step: 'work' },
  { key: 'telefono', label: 'Teléfono', ghost: 'Teléfono', step: 'contact', inputMode: 'tel' },
  { key: 'email',    label: 'Email',    ghost: 'Correo',   step: 'contact', type: 'email' }
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

export const COPY = {
  heroLine1: 'Bienvenido',
  heroLine2: 'a Teleinfo',
  lede: 'Acérquese al avatar para comenzar su registro.',
  waiting: 'Esperando a que alguien se acerque',
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
  idleReset: Number(ENV.VITE_IDLE_RESET_MS ?? 14000)
};

export const API = {
  base: (ENV.VITE_API_BASE ?? '').replace(/\/$/, ''),
  totem: ENV.VITE_TOTEM_ID ?? 'totem-1',
  pollMs: Number(ENV.VITE_POLL_MS ?? 1000),
  /** Cómo se avisa al backend que un paso quedó verificado. Ver api/contract.js */
  verifyMode: ENV.VITE_VERIFY_MODE ?? 'command'
};

/**
 * Slider de respaldo en la bienvenida. Con la detección funcionando se apaga;
 * mientras tanto es la única forma de entrar al flujo a mano.
 */
export const SHOW_SLIDER = String(ENV.VITE_SHOW_SLIDER ?? 'true') !== 'false';

/** `local` guarda el borrador en memoria; `http` habla con el tótem real. */
export const TRANSPORT = ENV.VITE_TRANSPORT ?? 'local';
