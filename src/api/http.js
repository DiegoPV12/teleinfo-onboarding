import { API } from '../config.js';

const url = (path) => `${API.base}/api/${encodeURIComponent(API.totem)}/${path}`;

/**
 * Transporte real contra el tótem. Devuelve siempre { status, body, etag }
 * y no lanza por códigos HTTP: quien llama decide qué hacer con 409/422.
 */
export function createHttpTransport() {
  return {
    async getState({ etag, signal } = {}) {
      const res = await fetch(url('state'), {
        method: 'GET',
        signal,
        headers: etag ? { 'If-None-Match': etag } : {}
      });
      if (res.status === 304 || res.status === 204) {
        return { status: res.status, body: null, etag };
      }
      const body = await res.json().catch(() => null);
      return {
        status: res.status,
        body,
        etag: res.headers.get('ETag') ?? body?.etag ?? null
      };
    },

    async postFields(body) {
      const res = await fetch(url('fields'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },

    async postCommand(body) {
      const res = await fetch(url('command'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    }
  };
}
