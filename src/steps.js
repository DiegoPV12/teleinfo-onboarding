import { FIELDS } from './config.js';

/**
 * Los pasos del registro. El `id` es numérico porque viaja como `step` a
 * `POST /api/audios-totem`, que solo acepta números.
 */
export const STEPS = [
  {
    id: '1',
    short: 'Identidad',
    title: 'Cuénteme quién es.',
    hint: 'Diga su nombre y apellido al avatar, o escríbalos aquí.',
    fields: ['nombre', 'apellido']
  },
  {
    id: '2',
    short: 'Trabajo',
    title: '¿Dónde trabaja?',
    hint: '',
    fields: ['cargo', 'empresa'],
    optional: true
  },
  {
    id: '3',
    short: 'Contacto',
    title: '¿Cómo lo contactamos?',
    hint: 'Revise que el teléfono y el correo estén bien escritos.',
    fields: ['telefono', 'email']
  },
  {
    id: '4',
    short: 'Fotos',
    kind: 'photos',
    title: 'Tomemos tres fotos.',
    hint: 'Siga la guía: de frente, luego a la izquierda y a la derecha.',
    shots: [
      { id: 'front', label: 'De frente',    hint: 'Mire a la cámara' },
      { id: 'left',  label: 'Perfil izquierdo', hint: 'Gire la cabeza a su izquierda' },
      { id: 'right', label: 'Perfil derecho',   hint: 'Gire la cabeza a su derecha' }
    ]
  },
  {
    id: '5',
    short: 'Completado',
    kind: 'done',
    title: 'Registro completado',
    hint: 'Gracias por registrarse.',
    fields: []
  }
];

export const STEP_IDS = STEPS.map((s) => s.id);
export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s]));

/** Id del paso de fotos, resuelto por `kind` para no atarlo al número. */
export const PHOTOS_ID = STEPS.find((s) => s.kind === 'photos')?.id;

export function stepIndex(id) {
  return STEP_IDS.indexOf(id);
}

/** Campos de un paso, ya resueltos contra FIELDS. */
export function fieldsOf(step) {
  const ids = STEP_BY_ID[typeof step === 'string' ? step : step?.id]?.fields ?? [];
  return FIELDS.filter((f) => ids.includes(f.key));
}
