import { API, FIELDS } from '../config.js';
import { fieldsOf } from '../steps.js';
import { log } from '../log.js';

/**
 * CAPA ANTICORRUPCIÓN
 * ===================
 * Único archivo que conoce la forma real de la central (rt-face-recognition).
 * Traduce entre el modelo de la pantalla (nombre, apellido, cargo, empresa,
 * teléfono, email) y el modelo de `persons` del backend.
 *
 * Contratos de referencia:
 *   GET   /api/persons/{id}          → PersonDetailResponse
 *   PATCH /api/persons/{id}          → PersonUpdateRequest (exclude_unset)
 *   GET   /api/persons/{id}/photos   → PersonPhotoListResponse
 *
 * Cuando el contrato cambie se ajusta AQUÍ y nada más: escenas, store y
 * flujo no conocen ni un nombre de campo del backend.
 */

/**
 * Campo con el que la central asociará el registro al tótem que lo originó.
 * Está en construcción del lado del backend: mientras no exista, viaja y se
 * ignora —`POST /api/persons` declara sus campos con `Form(...)`, así que
 * descarta los que no conoce— y el día que lo lean, ya está ahí.
 */
const TOTEM_FIELD = 'totem_id';

/**
 * Cola de impresión de la credencial. Se escribe en 0 al cerrar el registro
 * —cualquier registro, detectado o a mano— para que la central lo tome como
 * pendiente de imprimir. Imprimir no es cosa nuestra: solo se encola.
 *
 * Como `totem_id`, todavía no existe en la central desplegada: hoy viaja y se
 * descarta sin error.
 */
const PRINT_FIELD = 'pending_to_print';
const PRINT_PENDING = 0;

/**
 * Rellenos que el tótem puede dejar al crear la fila de un desconocido.
 *
 * `persons` exige `first_name` y `paternal_surname`, así que una persona recién
 * detectada no puede nacer vacía: llega con algún marcador. Mostrarlo tal cual
 * obligaría al visitante a borrarlo antes de escribir su nombre, así que estos
 * valores se leen como campo vacío.
 *
 * Los valores exactos dependen de lo que use el backend — confirmar.
 */
const PLACEHOLDERS = new Set([
  'unknown', 'desconocido', 'desconocida', 'sin nombre', 'sin apellido',
  'sin dato', 'n/a', 'na', '-', '--', '...', 'pendiente'
]);

const scrub = (value) => {
  const text = String(value ?? '').trim();
  return PLACEHOLDERS.has(text.toLowerCase()) ? '' : text;
};

/** Nuestros campos que van 1:1 al modelo de persona. */
const DIRECT = {
  nombre: 'first_name',
  apellido: 'paternal_surname',
  cargo: 'job_title',
  empresa: 'company',
  email: 'email'
};

/**
 * El teléfono es el único que no va 1:1: la central lo quiere partido en
 * `phone_prefix` (`^\+[0-9]{1,4}$`) y `phone_number` (`^[0-9]{6,15}$`, sin
 * espacios). La pantalla muestra un solo campo y aquí se parte.
 */
export function splitPhone(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { phone_prefix: null, phone_number: null };
  const match = text.match(/^\+(\d{1,4})[\s-]*(.*)$/);
  const prefix = match ? `+${match[1]}` : API.phonePrefix;
  const digits = (match ? match[2] : text).replace(/\D/g, '');
  if (!digits) return { phone_prefix: null, phone_number: null };
  return { phone_prefix: prefix, phone_number: digits };
}

/** Y al revés, para mostrar lo que ya está guardado. */
export function joinPhone(person) {
  const number = person?.phone_number ?? '';
  if (!number) return '';
  const prefix = person?.phone_prefix ?? '';
  return prefix ? `${prefix} ${number}` : String(number);
}

/**
 * `persons` no tiene revisión por campo: tiene un solo `updated_at`. Lo usamos
 * como revisión común — sirve igual para descartar respuestas viejas, porque
 * cualquier escritura nuestra deja el reloj del servidor por delante.
 */
const revisionOf = (person) => {
  const at = Date.parse(person?.updated_at ?? '');
  return Number.isFinite(at) ? at : 0;
};

/** Normaliza PersonDetailResponse al modelo local. */
export function readPerson(payload, photos = []) {
  const person = payload ?? {};
  const revision = revisionOf(person);
  const fields = {};

  const scrubbed = [];
  for (const { key } of FIELDS) {
    const raw = key === 'telefono' ? joinPhone(person) : person[DIRECT[key]];
    const value = scrub(raw);
    if (raw && !value) scrubbed.push(`${key}="${raw}"`);
    fields[key] = {
      value,
      // La central no dice quién escribió; si el dato está y no lo pusimos
      // nosotros, vino del avatar.
      source: null,
      revision
    };
  }

  // Los rellenos que el tótem escribe para un desconocido se leen vacíos; se
  // dice una vez por persona para poder confirmar la lista de PLACEHOLDERS.
  if (scrubbed.length && person.id) {
    log.change(`relleno:${person.id}`, scrubbed.join('|'), () =>
      log.form(`rellenos del tótem ignorados · ${scrubbed.join(', ')}`));
  }

  return {
    sessionId: person.id ?? null,
    active: person.is_active !== false,
    phase: null,
    printed: false,
    updatedAt: person.updated_at ?? null,
    fields,
    steps: null,   // ver nota en readSteps
    photos: readPhotos(photos),
    counts: {
      active: person.active_sample_count ?? 0,
      pending: person.pending_sample_count ?? 0,
      failed: person.failed_sample_count ?? 0
    },
    raw: person
  };
}

/*
 * NOTA · `steps: null`
 * La central no guarda "paso verificado": `persons` no tiene ese concepto. El
 * avance entre pasos es local a esta pantalla y el store lo conserva. Si el
 * backend agrega un campo para esto, se lee aquí y se devuelve el objeto
 * { identity: { verified }, ... } en lugar de null.
 */

/**
 * Las fotos no vienen etiquetadas por pose, así que se reparten por orden de
 * llegada: la primera es frontal, la segunda izquierda, la tercera derecha.
 */
const SHOT_ORDER = ['front', 'left', 'right'];

function readPhotos(items = []) {
  const usable = items.filter((p) => p?.is_active !== false);
  const out = {};
  SHOT_ORDER.forEach((shot, i) => {
    const item = usable[i];
    out[shot] = item
      ? { id: item.id, url: '', status: item.processing_status ?? 'ready' }
      : { id: null, url: '', status: 'pending' };
  });
  return out;
}

/**
 * Cuerpo de PATCH /api/persons/{id}. Solo van los campos presentes: lo que se
 * omite queda intacto, y un string vacío borra el dato.
 */
export function patchPayload(updates) {
  const body = {};
  for (const { key, value } of updates) {
    const clean = String(value ?? '').trim();
    if (key === 'telefono') {
      const { phone_prefix, phone_number } = splitPhone(clean);
      body.phone_prefix = phone_number ? phone_prefix : '';
      body.phone_number = phone_number ?? '';
      continue;
    }
    const target = DIRECT[key];
    if (target) body[target] = clean;
  }
  return body;
}

/** Cierre del registro: lo deja encolado para imprimir. */
export function finishPayload() {
  return { [PRINT_FIELD]: PRINT_PENDING };
}

/**
 * Siguiente audio pendiente del tótem. `POST /api/audios-totem/by-code/{code}/next`
 * sin cuerpo ni query: el code viaja en la ruta. Un `404` es la respuesta
 * normal cuando la cola está vacía (o el code no existe), no un error.
 */
export const nextAudioPath = (totemCode) =>
  `/api/audios-totem/by-code/${encodeURIComponent(totemCode)}/next`;

/** Los campos de un paso, listos para PATCH. */
export function stepPayload(stepId, read) {
  return patchPayload(fieldsOf(stepId).map((f) => ({ key: f.key, value: read(f.key) })));
}

/**
 * Alta de la persona, al cerrar el paso 1.
 *
 * La central exige `first_name` y `paternal_surname`, así que no puede nacer
 * en blanco: el slider solo abre el formulario y la persona se crea cuando ya
 * hay nombre y apellido. `POST /api/persons` es multipart y pide un
 * `Idempotency-Key` UUID.
 */
export function createRequest(read) {
  const form = new FormData();
  form.append('category', 'registered');
  form.append('first_name', read('nombre'));
  form.append('paternal_surname', read('apellido'));

  for (const [key, target] of Object.entries(DIRECT)) {
    if (key === 'nombre' || key === 'apellido') continue;
    const value = read(key);
    if (value) form.append(target, value);
  }

  const { phone_prefix, phone_number } = splitPhone(read('telefono'));
  if (phone_number) {
    form.append('phone_prefix', phone_prefix);
    form.append('phone_number', phone_number);
  }

  // De qué tótem salió este registro. Se manda solo en el alta.
  if (API.totem) form.append(TOTEM_FIELD, API.totem);

  return { path: '/api/persons', body: form, idempotent: true };
}

/**
 * Persona asignada ahora mismo al tótem.
 *
 * `GET /api/totems/by-code/{code}/current-person` devuelve el mismo
 * `PersonDetailResponse` que `GET /api/persons/{id}`, así que se lee con
 * `readPerson` sin más. No lleva autenticación: es una decisión explícita del
 * backend.
 *
 * Se busca por CODE (el identificador legible, ej. "totem-01"), no por el
 * UUID interno de `totems.id` — hay dos rutas equivalentes y esta pantalla usa
 * la de `code` porque es la que se puede escribir a mano en el atajo de cada
 * tablet sin ir a buscar un UUID.
 *
 * Un `404` cubre tres casos que el cliente no puede distinguir —el tótem no
 * existe, no tiene a nadie asignado, o apunta a una persona borrada— y los tres
 * significan lo mismo para esta pantalla: ahora no hay nadie.
 */
export const currentPersonPath = (totemCode) =>
  `/api/totems/by-code/${encodeURIComponent(totemCode)}/current-person`;

/** Id de la persona recién creada, sea cual sea la forma de la respuesta. */
export const personIdOf = (payload) =>
  payload?.person_id ?? payload?.id ?? payload?.person?.id ?? null;
