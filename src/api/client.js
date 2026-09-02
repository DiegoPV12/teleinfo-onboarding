import { TRANSPORT } from '../config.js';
import { createHttpTransport } from './http.js';
import { createLocalTransport } from './local.js';
import { fieldsPayload, readState, verifyStepRequest, COMMAND } from './contract.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
  /** 409: el tótem no tiene sesión activa. */
  get noSession() { return this.status === 409; }
  /** 422: comando no permitido. */
  get rejected() { return this.status === 422; }
}

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function createClient({ transport = TRANSPORT } = {}) {
  const t = transport === 'http' ? createHttpTransport() : createLocalTransport();

  const ok = ({ status, body }) => {
    if (status >= 400) throw new ApiError(status, body?.detail ?? body?.error);
    return body;
  };

  const post = (endpoint, body) =>
    endpoint === 'fields' ? t.postFields(body) : t.postCommand(body);

  return {
    /**
     * Un tick de polling.
     *   { kind: 'same' }              304, nada cambió
     *   { kind: 'empty' }             204, aún no hay draft
     *   { kind: 'state', state, etag} 200
     */
    async pull({ etag, signal } = {}) {
      const res = await t.getState({ etag, signal });
      if (res.status === 304) return { kind: 'same' };
      if (res.status === 204) return { kind: 'empty' };
      if (res.status >= 400) throw new ApiError(res.status, res.body?.detail);
      return { kind: 'state', state: readState(res.body), etag: res.etag ?? null };
    },

    /** updates: [{ key, value, revision }] */
    async sendFields(updates) {
      return ok(await t.postFields(fieldsPayload(updates)));
    },

    async sendCommand({ type, target, accepted, commandId }) {
      return ok(await t.postCommand({
        type,
        command_id: commandId ?? uid(),
        ...(target !== undefined ? { target } : {}),
        ...(accepted !== undefined ? { accepted } : {})
      }));
    },

    /** Verifica un paso por la vía que indique VITE_VERIFY_MODE. */
    async verifyStep(stepId, fieldUpdates = []) {
      const { endpoint, body } = verifyStepRequest(stepId, fieldUpdates);
      if (endpoint === 'command') body.command_id = uid();
      return ok(await post(endpoint, body));
    },

    COMMAND
  };
}
