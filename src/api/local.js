import { splitPhone } from './contract.js';

/**
 * Central en memoria. Habla el mismo contrato que rt-face-recognition —
 * `PersonDetailResponse`, PATCH parcial con `exclude_unset`, listado de
 * fotos— pero sin red y sin simular nada: solo guarda lo que se escribe.
 *
 * Sirve para recorrer los flujos a mano cuando la central no está a mano.
 */
const BLANK = {
  category: 'registered',
  totem_id: null,
  first_name: null,
  paternal_surname: null,
  maternal_surname: null,
  description: null,
  company: null,
  job_title: null,
  phone_prefix: null,
  phone_number: null,
  email: null,
  pending_to_print: null
};

const now = () => new Date().toISOString();

/**
 * Hay una sola central, así que hay un solo transporte local: dos clientes en
 * el mismo proceso deben ver los mismos datos, como pasaría de verdad.
 */
let shared = null;
export function createLocalTransport() {
  if (shared) return shared;
  shared = build();
  return shared;
}

function build() {
  const people = new Map();
  let seq = 0;

  const detail = (person) => ({
    ...person,
    is_active: true,
    consent_at: null,
    consent_reference: null,
    consent_revoked_at: null,
    delete_after: null,
    active_sample_count: person.photos.length,
    pending_sample_count: 0,
    failed_sample_count: 0
  });

  /** Quién está asignado al tótem. Se mueve a mano con __assign(). */
  let assigned = null;

  return {
    /** Espejo de GET /api/totems/{id}/current-person. */
    async getCurrentPerson() {
      const person = assigned ? people.get(assigned) : null;
      if (!person) return { status: 404, body: { detail: 'Totem sin persona asignada.' } };
      return { status: 200, body: detail(person) };
    },

    /** Solo para pruebas: simula que el tótem detectó a alguien. */
    __assign(personId) { assigned = personId; },
    __release() { assigned = null; },

    async getPerson(personId) {
      const person = people.get(personId);
      if (!person) return { status: 404, body: { detail: 'Persona no encontrada.' } };
      return { status: 200, body: detail(person) };
    },

    async listPhotos(personId) {
      const person = people.get(personId);
      if (!person) return { status: 404, body: { detail: 'Persona no encontrada.' } };
      return { status: 200, body: { items: person.photos, total: person.photos.length } };
    },

    /**
     * Aviso «paso actualizado» al tótem. En local no hay tótem al que
     * avisarle: se limita a devolver `delivered: 0`, como haría la central
     * real con un tótem sin conexiones abiertas.
     */
    async notifyStep() {
      return { status: 200, body: { delivered: 0 } };
    },

    /** PATCH parcial: lo omitido no se toca, el string vacío borra. */

    async patchPerson(personId, body) {
      const person = people.get(personId);
      if (!person) return { status: 404, body: { detail: 'Persona no encontrada.' } };
      for (const [key, value] of Object.entries(body ?? {})) {
        if (!(key in BLANK)) continue;
        const clean = typeof value === 'string' ? value.trim() : value;
        person[key] = clean === '' ? null : clean;
      }
      // Las mismas validaciones que corre la central sobre el objeto resultante.
      if (person.phone_number && !/^[0-9]{6,15}$/.test(person.phone_number)) {
        return { status: 422, body: { detail: 'El numero telefonico debe contener entre 6 y 15 digitos.' } };
      }
      if (person.phone_prefix && !/^\+[0-9]{1,4}$/.test(person.phone_prefix)) {
        return { status: 422, body: { detail: 'El prefijo telefonico debe tener el formato +<codigo de pais>.' } };
      }
      if (person.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(person.email)) {
        return { status: 422, body: { detail: 'El email no tiene un formato valido.' } };
      }
      person.updated_at = now();
      return { status: 200, body: detail(person) };
    },

    async createPerson({ body }) {
      seq += 1;
      const id = `local-person-${seq}`;
      const person = { ...BLANK, id, photos: [], created_at: now(), updated_at: now() };

      // El alta llega como multipart con los datos del paso 1 ya dentro.
      if (body instanceof FormData) {
        for (const [key, value] of body.entries()) {
          if (key === 'totem_id') { person.totem_id = String(value).trim() || null; continue; }
          if (key in person) person[key] = String(value).trim() || null;
        }
      }
      if (person.phone_number) {
        const parts = splitPhone(`${person.phone_prefix ?? ''} ${person.phone_number}`);
        person.phone_prefix = parts.phone_prefix;
        person.phone_number = parts.phone_number;
      }

      people.set(id, person);
      return { status: 201, body: { person_id: id, id } };
    },

    async photoUrl() {
      return '';
    }
  };
}
