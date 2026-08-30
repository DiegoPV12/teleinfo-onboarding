
export const FIELDS = [
  { key: 'nombre',   label: 'Nombre',   ghost: 'Nombre',   token: 'nombre' },
  { key: 'apellido', label: 'Apellido', ghost: 'Apellido', token: 'apellido' },
  { key: 'empresa',  label: 'Empresa',  ghost: 'Empresa',  token: 'empresa' },
  { key: 'cargo',    label: 'Cargo',    ghost: 'Cargo',    token: 'cargo' },
  { key: 'telefono', label: 'Teléfono', ghost: 'Teléfono', token: 'teléfono', inputMode: 'tel' },
  { key: 'email',    label: 'Email',    ghost: 'Correo',   token: 'correo',   type: 'email' }
];

/** Frase modelo de la pantalla de guía */
export const MODEL_PHRASE =
  'Hola, soy {nombre} {apellido}, trabajo en {empresa} como {cargo}, mi teléfono es {telefono} y mi correo {email}';

export const COPY = {
  heroLine1: 'Bienvenido',
  heroLine2: 'a Teleinfo',
  lede: 'Regístrese hablando con el avatar. Toma menos de un minuto.',
  listening: 'Le escucho',
  listeningDone: 'Ya tengo todo',
  guideEyebrow: 'Puede decirlo así:',
  captureTitle: 'Cuénteme quién es.',
  confirmTitle: '¿Está todo correcto?',
  doneLede: 'Su registro está confirmado. Retire su credencial en el mostrador.'
};

export const TIMING = {
  heroCps: 26,
  ledeCps: 50,
  titleCps: 34,
  heroDelay: 300,
  ledeDelay: 180,
  sceneIn: 140,
  sceneOut: 600,
  captureStart: 700,
  completeToConfirm: 1500,
  idleReset: Number(import.meta.env.VITE_IDLE_RESET_MS ?? 14000)
};

export const SOURCE = import.meta.env.VITE_SOURCE ?? 'mock';
export const WS_URL = import.meta.env.VITE_AVATAR_WS_URL ?? '';
export const IS_DEV = import.meta.env.DEV;
