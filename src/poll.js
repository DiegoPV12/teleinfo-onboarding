import { API } from './config.js';

/**
 * Bucle de sondeo del estado. Encadena setTimeout tras cada respuesta en vez
 * de usar setInterval: con la red lenta del kiosco, setInterval solaparía
 * peticiones y llegarían snapshots desordenados.
 *
 * Maneja 304 (nada cambió), 204 (aún no hay sesión) y corta la espera con
 * backoff exponencial cuando el tótem no responde.
 */
export function createPoller({ client, intervalMs = API.pollMs, onState, onEmpty, onStatus }) {
  let timer = null;
  let controller = null;
  let running = false;
  let etag = null;
  let backoff = 0;
  let online = null;

  const setOnline = (value, error) => {
    if (online === value) return;
    online = value;
    onStatus?.({ online: value, error });
  };

  const schedule = (ms) => {
    clearTimeout(timer);
    if (running) timer = setTimeout(tick, ms);
  };

  async function tick() {
    if (!running) return;
    controller = new AbortController();
    try {
      const res = await client.pull({ etag, signal: controller.signal });
      backoff = 0;
      setOnline(true);
      if (res.kind === 'state') {
        etag = res.etag;
        onState?.(res.state);
      } else if (res.kind === 'empty') {
        etag = null;
        onEmpty?.();
      }
      schedule(intervalMs);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setOnline(false, err);
      backoff = Math.min(backoff ? backoff * 2 : 1000, 8000);
      schedule(backoff);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      controller?.abort();
    },
    /** Fuerza un sondeo inmediato: se usa tras escribir, para ver el efecto ya. */
    kick() {
      if (!running) return;
      clearTimeout(timer);
      controller?.abort();
      schedule(60);
    },
    /** Olvida el etag para que el próximo sondeo traiga el estado completo. */
    resync() {
      etag = null;
      this.kick();
    }
  };
}
