import { API, FIELDS } from '../config.js';
import { STEP_IDS } from '../steps.js';

/**
 * CAPA ANTICORRUPCIÓN
 * ===================
 * Único archivo que conoce la forma real del backend. El PDF documenta los
 * endpoints pero no el contenido de `state`, así que este módulo lee de forma
 * tolerante varias formas posibles y las normaliza al modelo local.
 *
 * Cuando el backend quede cerrado, se ajusta AQUÍ y nada más.
 *
 * Modelo local resultante:
 *   {
 *     sessionId, active, phase,
 *     fields: { nombre: { value, source, revision }, ... },
 *     steps:  { identity: { verified }, ... },
 *     photos: { front: { url, status }, ... },
 *     printed, raw
 *   }
 */

/** Alias aceptados por si el backend nombra los campos en inglés. */
const FIELD_ALIASES = {
  nombre: ['nombre', 'name', 'first_name', 'firstName', 'given_name'],
  apellido: ['apellido', 'lastname', 'last_name', 'lastName', 'surname'],
  cargo: ['cargo', 'role', 'position', 'job_title', 'jobTitle'],
  empresa: ['empresa', 'company', 'organization', 'org'],
  telefono: ['telefono', 'teléfono', 'phone', 'phone_number', 'mobile'],
  email: ['email', 'correo', 'mail', 'e_mail']
};

const SHOT_ALIASES = {
  front: ['front', 'frontal', 'center', 'centro'],
  left: ['left', 'izquierda', 'izq', 'side_left', 'left_side'],
  right: ['right', 'derecha', 'der', 'side_right', 'right_side']
};

const pick = (obj, names) => {
  if (!obj) return undefined;
  for (const n of names) if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  return undefined;
};

/** Un campo puede llegar como string suelto o como objeto con metadatos. */
function readField(raw) {
  if (raw === undefined || raw === null) return { value: '', source: null, revision: 0 };
  if (typeof raw === 'string' || typeof raw === 'number') {
    return { value: String(raw), source: null, revision: 0 };
  }
  return {
    value: String(pick(raw, ['value', 'text', 'val']) ?? ''),
    source: pick(raw, ['source', 'origin']) ?? null,
    revision: Number(pick(raw, ['field_revision', 'revision', 'rev', 'version']) ?? 0)
  };
}

function readFields(state) {
  const bag = state.fields ?? state.form ?? state.data ?? state;
  const out = {};
  for (const f of FIELDS) {
    const raw = pick(bag, FIELD_ALIASES[f.key] ?? [f.key]);
    out[f.key] = readField(raw);
  }
  return out;
}

/**
 * `verified` puede venir como state.steps.identity.verified, como
 * state.identity_verified, o dentro de una lista de pasos completados.
 */
function readSteps(state) {
  const bag = state.steps ?? state.step_status ?? {};
  const completed = state.completed_steps ?? state.verified_steps ?? null;
  const out = {};
  for (const id of STEP_IDS) {
    let verified = false;
    const entry = Array.isArray(bag) ? bag.find((s) => s?.id === id) : bag[id];
    if (entry && typeof entry === 'object') verified = Boolean(pick(entry, ['verified', 'confirmed', 'done']));
    else if (typeof entry === 'boolean') verified = entry;
    else if (state[`${id}_verified`] !== undefined) verified = Boolean(state[`${id}_verified`]);
    else if (Array.isArray(completed)) verified = completed.includes(id);
    out[id] = { verified };
  }
  return out;
}

function readPhotos(state) {
  const bag = state.photos ?? state.shots ?? state.images ?? {};
  const out = {};
  for (const [id, names] of Object.entries(SHOT_ALIASES)) {
    let raw = Array.isArray(bag)
      ? bag.find((p) => names.includes(p?.id ?? p?.kind ?? p?.pose))
      : pick(bag, names);
    if (typeof raw === 'string') raw = { url: raw };
    out[id] = {
      url: raw ? (pick(raw, ['url', 'src', 'href', 'data_url', 'dataUrl']) ?? '') : '',
      status: raw ? (pick(raw, ['status', 'state']) ?? 'ready') : 'pending'
    };
  }
  return out;
}

/** Normaliza la respuesta de GET /api/{totem}/state al modelo local. */
export function readState(payload) {
  const state = payload?.state ?? payload ?? {};
  return {
    sessionId: pick(state, ['session_id', 'sessionId', 'session', 'id']) ?? null,
    active: pick(state, ['active', 'session_active', 'present', 'detected']) ?? true,
    phase: pick(state, ['phase', 'stage', 'step', 'current_step']) ?? null,
    printed: Boolean(pick(state, ['printed', 'ticket_printed', 'credential_printed'])),
    fields: readFields(state),
    steps: readSteps(state),
    photos: readPhotos(state),
    raw: state
  };
}

/** Cuerpo de POST /api/{totem}/fields. */
export function fieldsPayload(updates) {
  return {
    updates: updates.map(({ key, value, revision }) => ({
      field: key,
      value: value === '' ? null : value,
      expected_field_revision: revision ?? 0
    }))
  };
}

export const COMMAND = {
  dataConfirmed: 'registration_data_confirmed',
  finalConfirmed: 'registration_final_confirmed',
  photoRetake: 'registration_photo_retake',
  cancel: 'registration_cancel',
  ticketChoice: 'registration_ticket_choice'
};

/**
 * Verificación de un paso. Sin definición cerrada del backend soportamos las
 * dos formas y elegimos con VITE_VERIFY_MODE:
 *
 *   command → POST /command { type: registration_data_confirmed, target: <step> }
 *   fields  → POST /fields  con un pseudo-campo <step>_verified
 *
 * Devuelve { endpoint, body }.
 */
export function verifyStepRequest(stepId, fieldUpdates = []) {
  if (API.verifyMode === 'fields') {
    return {
      endpoint: 'fields',
      body: fieldsPayload([...fieldUpdates, { key: `${stepId}_verified`, value: 'true', revision: 0 }])
    };
  }
  return {
    endpoint: 'command',
    body: { type: COMMAND.dataConfirmed, target: stepId, accepted: true }
  };
}
