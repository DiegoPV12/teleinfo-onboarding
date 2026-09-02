import { API } from './config.js';
import { log } from './log.js';

/**
 * Bucle de sondeo. Qué se pide lo decide `pull`; aquí solo está el ritmo.
 *
 * Encadena setTimeout tras cada respuesta en vez de usar setInterval: con la
 * red lenta del kiosco, setInterval solaparía peticiones y llegarían snapshots
 * desordenados. Ante un fallo espera con backoff exponencial.
 */
export function createPoller({ pull, intervalMs = API.pollMs, onResult, onStatus }) {
  let timer = null;
  let controller = null;
  let running = false;
  let backoff = 0;
  let online = null;
  let ticks = 0;
  /** Un latido cada tantos sondeos, para no llenar la consola. */
  const HEARTBEAT = Math.max(1, Math.round(20000 / intervalMs));

  const setOnline = (value, error) => {
    if (online === value) return;
    online = value;
    if (value) log.ok('central en línea');
    else log.bad('central fuera de alcance', error?.message ?? error);
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
      const res = await pull(controller.signal);
      backoff = 0;
      ticks += 1;
      setOnline(true);
      // Latido: la prueba de que el bucle sigue vivo aunque nada cambie.
      if (ticks % HEARTBEAT === 0) log.poll(`vivo · ${ticks} sondeos · último: ${res.kind}`);
      onResult?.(res);
      schedule(intervalMs);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setOnline(false, err);
      backoff = Math.min(backoff ? backoff * 2 : 1000, 8000);
      log.poll(`reintento en ${backoff} ms`);
      schedule(backoff);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      log.poll(`arranca · cada ${intervalMs} ms`);
      tick();
    },
    stop() {
      running = false;
      log.poll('detenido');
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
    /** Fuerza una relectura completa de la persona. */
    resync() {
      this.kick();
    }
  };
}
