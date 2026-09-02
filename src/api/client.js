import { API, TRANSPORT } from '../config.js';
import { log } from '../log.js';
import { createHttpTransport } from './http.js';
import { createLocalTransport } from './local.js';
import { createRequest, finishPayload, patchPayload, personIdOf, readPerson, stepEventPayload, stepPayload } from './contract.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
  /** 404: la persona ya no existe en la central. */
  get gone() { return this.status === 404; }
  /** 422: la central rechazó un valor (teléfono, email, nombre vacío). */
  get invalid() { return this.status === 422; }
  /** 401: la ruta sigue pidiendo sesión y no tenemos token. */
  get unauthorized() { return this.status === 401; }
}

export function createClient({ transport = TRANSPORT } = {}) {
  const t = transport === 'http' ? createHttpTransport() : createLocalTransport();

  const ok = ({ status, body }) => {
    if (status >= 400) throw new ApiError(status, body?.detail ?? body?.error);
    return body;
  };

  return {
    /**
     * Un tick de sondeo. Refleja lo que haya escrito el avatar sobre la misma
     * persona; sin `personId` todavía no hay nada que mirar.
     */
    async pull(personId, { signal, withPhotos = false } = {}) {
      if (!personId) return { kind: 'empty' };
      const res = await t.getPerson(personId, { signal });
      if (res.status === 404) return { kind: 'empty' };
      const person = ok(res);

      // Las fotos solo interesan en el paso 4: no se piden en los otros.
      let photos = [];
      if (withPhotos) {
        try {
          photos = ok(await t.listPhotos(personId, { signal }))?.items ?? [];
        } catch {
          photos = [];   // una falla aquí no debe tumbar el sondeo del formulario
        }
      }

      return { kind: 'state', state: readPerson(person, photos) };
    },

    /**
     * Quién está ahora mismo frente al tótem.
     *   { kind: 'state', state }  → hay alguien asignado
     *   { kind: 'empty' }         → nadie (404 en cualquiera de sus tres causas)
     */
    async pullCurrent(totemCode, { signal, withPhotos = false } = {}) {
      if (!totemCode) return { kind: 'empty' };
      const res = await t.getCurrentPerson(totemCode, { signal });
      // Sin nadie delante la central responde 404 — y también si el code no
      // corresponde a ningún tótem, sin distinguirlo en el cuerpo. Se trata
      // todo igual: la bienvenida sigue esperando.
      if (res.status === 404) return { kind: 'empty' };
      if (res.status >= 500) {
        log.change('totem-roto', res.status, () =>
          log.bad(`la central falla al preguntar por el tótem "${totemCode}" (${res.status}). ` +
                  'Se sigue esperando como si no hubiera nadie.', res.body));
        return { kind: 'empty' };
      }
      const person = ok(res);

      let photos = [];
      if (withPhotos && person?.id) {
        try {
          photos = ok(await t.listPhotos(person.id, { signal }))?.items ?? [];
        } catch {
          photos = [];
        }
      }
      return { kind: 'state', state: readPerson(person, photos) };
    },

    /** Crea la persona (en blanco al deslizar, o con el paso 1 ya dentro). */
    async createPerson(read) {
      const person = ok(await t.createPerson(createRequest(read)));
      const id = personIdOf(person);
      if (!id) throw new ApiError(500, 'La central no devolvió el id de la persona.');
      return id;
    },

    /** Escribe los campos de un paso. Lo que no va en el cuerpo no se toca. */
    async writeStep(personId, stepId, read) {
      const body = stepPayload(stepId, read);
      if (!Object.keys(body).length) return null;
      return ok(await t.patchPerson(personId, body));
    },

    /** Escritura suelta de campos concretos (edición manual con debounce). */
    async writeFields(personId, updates) {
      const body = patchPayload(updates);
      if (!Object.keys(body).length) return null;
      return ok(await t.patchPerson(personId, body));
    },

    /** Cierra el registro: lo marca como pendiente de imprimir. */
    async finishRegistration(personId) {
      return ok(await t.patchPerson(personId, finishPayload()));
    },

    /**
     * Avisa al tótem qué paso se está mostrando ahora
     */
    async notifyStep(stepId) {
      if (!API.totemId) return false;
      const res = await t.notifyStep(API.totemId, stepEventPayload(stepId, API.totem));
      if (res.status >= 400) return false;
      return res.body?.delivered ?? 0;
    },

    photoUrl: (personId, sampleId) => t.photoUrl(personId, sampleId),

    /** Solo existe en el transporte local: simula la detección del tótem. */
    assign: (personId) => t.__assign?.(personId),
    release: () => t.__release?.()
  };
}
