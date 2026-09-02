import { FIELDS } from './config.js';

/**
 * Los cuatro pasos del registro. El flujo es estricto: no se avanza al
 * siguiente hasta que el actual queda verificado (por la tablet o por el
 * avatar). `optional` permite verificar un paso con campos vacíos.
 */
export const STEPS = [
  {
    id: 'identity',
    short: 'Identidad',
    title: 'Cuénteme quién es.',
    hint: 'Diga su nombre y apellido al avatar, o escríbalos aquí.',
    fields: ['nombre', 'apellido']
  },
  {
    id: 'work',
    short: 'Trabajo',
    title: '¿Dónde trabaja?',
    hint: '',
    fields: ['cargo', 'empresa'],
    optional: true
  },
  {
    id: 'contact',
    short: 'Contacto',
    title: '¿Cómo lo contactamos?',
    hint: 'Revise que el teléfono y el correo estén bien escritos.',
    fields: ['telefono', 'email']
  },
  {
    id: 'photos',
    short: 'Fotos',
    kind: 'photos',
    title: 'Tomemos tres fotos.',
    hint: 'Siga la guía: de frente, luego a la izquierda y a la derecha.',
    shots: [
      { id: 'front', label: 'De frente',    hint: 'Mire a la cámara' },
      { id: 'left',  label: 'Perfil izquierdo', hint: 'Gire la cabeza a su izquierda' },
      { id: 'right', label: 'Perfil derecho',   hint: 'Gire la cabeza a su derecha' }
    ]
  }
];

export const STEP_IDS = STEPS.map((s) => s.id);
export const STEP_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s]));

export function stepIndex(id) {
  return STEP_IDS.indexOf(id);
}

/** Campos de un paso, ya resueltos contra FIELDS. */
export function fieldsOf(step) {
  const ids = STEP_BY_ID[typeof step === 'string' ? step : step?.id]?.fields ?? [];
  return FIELDS.filter((f) => ids.includes(f.key));
}
