/**
 * Tótem local: guarda el borrador en memoria y respeta el mismo contrato que
 * el servicio real (ETag, 204/304/409/422, revisiones por campo, idempotencia
 * por command_id).
 *
 * No simula nada. No detecta a nadie, no dicta datos y no toma fotos: el
 * borrador se abre con la primera escritura de la tablet y solo contiene lo
 * que se escriba a mano. Sirve para recorrer los flujos sin backend.
 */
import { STEPS } from '../steps.js';

const FIELD_KEYS = ['nombre', 'apellido', 'cargo', 'empresa', 'telefono', 'email'];

function emptyDraft() {
  return {
    fields: Object.fromEntries(
      FIELD_KEYS.map((k) => [k, { value: '', source: null, field_revision: 0 }])
    ),
    steps: Object.fromEntries(STEPS.map((s) => [s.id, { verified: false }])),
    photos: { front: null, left: null, right: null }
  };
}

export function createLocalTransport() {
  let draft = null;
  let session = null;
  let etag = 0;
  const seenCommands = new Set();

  const bump = () => { etag += 1; };

  /** La primera escritura abre la sesión, igual que haría el tótem al detectar. */
  const open = () => {
    if (draft) return;
    draft = emptyDraft();
    session = `local-${Date.now().toString(36)}`;
    bump();
  };

  const close = () => {
    draft = null;
    session = null;
    seenCommands.clear();
    bump();
  };

  const currentStep = () => STEPS.find((s) => !draft.steps[s.id].verified) ?? null;

  const snapshot = () => ({
    session_id: session,
    active: true,
    phase: currentStep()?.id ?? 'complete',
    printed: false,
    fields: draft.fields,
    steps: draft.steps,
    photos: draft.photos
  });

  return {
    async getState({ etag: sent } = {}) {
      if (!draft) return { status: 204, body: null, etag: null };
      const tag = `"l${etag}"`;
      if (sent === tag) return { status: 304, body: null, etag: tag };
      return { status: 200, body: { state: snapshot(), etag: tag }, etag: tag };
    },

    async postFields(body) {
      open();
      for (const u of body.updates ?? []) {
        if (u.field?.endsWith('_verified')) {
          const id = u.field.replace('_verified', '');
          if (draft.steps[id]) draft.steps[id].verified = u.value === 'true' || u.value === true;
          continue;
        }
        const f = draft.fields[u.field];
        if (!f) continue;
        f.value = u.value ?? '';
        f.source = 'manual';
        f.field_revision += 1;
      }
      bump();
      return { status: 200, body: { ok: true } };
    },

    async postCommand(body) {
      const allowed = [
        'registration_data_confirmed', 'registration_final_confirmed',
        'registration_photo_retake', 'registration_cancel', 'registration_ticket_choice'
      ];
      if (!allowed.includes(body.type)) return { status: 422, body: { detail: 'type no permitido' } };
      // Cancelar y cerrar el registro terminan la sesión, como haría el tótem.
      if (body.type === 'registration_cancel') { close(); return { status: 200, body: { ok: true } }; }
      if (body.type === 'registration_final_confirmed') { close(); return { status: 200, body: { ok: true } }; }

      open();
      if (body.command_id && seenCommands.has(body.command_id)) return { status: 200, body: { ok: true } };
      if (body.command_id) seenCommands.add(body.command_id);

      if (body.type === 'registration_data_confirmed') {
        const id = body.target ?? currentStep()?.id;
        if (draft.steps[id]) draft.steps[id].verified = true;
      }
      if (body.type === 'registration_photo_retake' && draft.photos[body.target] !== undefined) {
        draft.photos[body.target] = null;
      }
      bump();
      return { status: 200, body: { ok: true } };
    }
  };
}
