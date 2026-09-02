import { API } from '../config.js';
import { log } from '../log.js';
import { currentPersonPath, stepEventPath } from './contract.js';

/**
 * Transporte real contra la central (rt-face-recognition).
 *
 * Autenticación: token fijo en `Authorization: Bearer`. No hay login ni CSRF.
 * Devuelve siempre { status, body } y no lanza por códigos HTTP: quien llama
 * decide qué hacer con 404, 409 o 422.
 */
const url = (path) => `${API.base}${path}`;

const auth = () => (API.token ? { Authorization: `Bearer ${API.token}` } : {});

/**
 * UUID v4. `crypto.randomUUID` solo existe en contexto seguro: en el kiosco,
 * servido por http:// sobre una IP de red, no está. Y la central rechaza con
 * 422 cualquier Idempotency-Key que no sea un UUID bien formado.
 */
function uuid() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;   // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;   // variante RFC 4122

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * `quiet` es para las rutas del sondeo: se repiten cada segundo y medio, así
 * que solo se traza cuando cambia el código de respuesta.
 */
async function send(path, { method = 'GET', body, headers = {}, signal, quiet = false } = {}) {
  const isForm = body instanceof FormData;
  const t0 = Date.now();

  let res;
  try {
    res = await fetch(url(path), {
      method,
      signal,
      headers: {
        ...auth(),
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
  } catch (err) {
    // Aquí caen el CORS bloqueado, el DNS y la central apagada: el navegador
    // no distingue entre ellos, pero al menos queda dicho a dónde se iba.
    if (err?.name !== 'AbortError') {
      log.bad(`${method} ${path} · sin respuesta de ${API.base}`, err?.message ?? err);
    }
    throw err;
  }

  const ms = Date.now() - t0;
  let parsed = null;
  if (res.status !== 204) {
    const text = await res.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  }

  const line = `${method} ${path} → ${res.status} · ${ms} ms`;
  const detail = parsed?.detail ?? undefined;
  if (quiet) log.change(`${method} ${path}`, res.status, () => log.net(line, detail));
  else if (res.status >= 400) log.bad(line, detail ?? parsed);
  else log.net(line, detail);

  return { status: res.status, body: parsed };
}

export function createHttpTransport() {
  return {
    getPerson: (personId, { signal } = {}) =>
      send(`/api/persons/${personId}`, { signal, quiet: true }),

    /** Sin token: este endpoint no pide autenticación. */
    getCurrentPerson: (totemId, { signal } = {}) =>
      send(currentPersonPath(totemId), { signal, quiet: true }),

    listPhotos: (personId, { signal } = {}) =>
      send(`/api/persons/${personId}/photos`, { signal, quiet: true }),

    patchPerson: (personId, body) =>
      send(`/api/persons/${personId}`, { method: 'PATCH', body }),

    /** Aviso «paso completado». Ruta y forma sin confirmar todavía. */
    notifyStep: (personId, body) =>
      send(stepEventPath(personId), { method: 'POST', body }),

    createPerson: ({ path, body, idempotent }) =>
      send(path, {
        method: 'POST',
        body,
        headers: idempotent ? { 'Idempotency-Key': uuid() } : {}
      }),

    /**
     * La imagen va autenticada, así que un <img src> pelado no sirve: se trae
     * como blob y se entrega una object URL que la escena revoca al soltarla.
     */
    async photoUrl(personId, sampleId) {
      const path = `/api/persons/${personId}/photos/${sampleId}/image`;
      const res = await fetch(url(path), { headers: auth() });
      if (!res.ok) {
        log.bad(`GET ${path} → ${res.status} · la foto no se pudo traer`);
        return '';
      }
      const blob = await res.blob();
      log.net(`GET ${path} → 200 · ${blob.type} ${blob.size} bytes`);
      return URL.createObjectURL(blob);
    }
  };
}
