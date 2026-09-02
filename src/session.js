import { TIMING } from './config.js';
import { fieldsOf, STEP_BY_ID } from './steps.js';
import { createClient, ApiError } from './api/client.js';
import { COMMAND } from './api/contract.js';
import { createPoller } from './poll.js';
import { store } from './store.js';

/**
 * Máquina de sesión: une el sondeo, el estado y los comandos de flujo.
 *
 * Una SESIÓN existe mientras el avatar tenga a alguien delante. La pantalla no
 * decide el paso: lo deriva del estado. Lo único que envía son intenciones
 * (editar un campo, verificar un paso, repetir una foto, cancelar).
 */
export function createSession({ onScene, onStatus } = {}) {
  const client = createClient();
  let flushTimer = null;
  let flushing = false;
  let scene = null;
  /** Arranque manual: el visitante usó el slider porque no lo detectaron. */
  let manual = false;

  /**
   * La escena se deriva del estado, nunca de la navegación local. La única
   * excepción es el arranque manual: mientras el tótem no abra la sesión, el
   * visitante ya está en el paso 1 y lo que escriba la abrirá.
   */
  function derive() {
    const { id, active } = store.session();
    if ((!id || !active) && !manual) return 'welcome';
    const step = store.currentStep();
    if (!step) return 'done';
    return step.kind === 'photos' ? 'photos' : 'step';
  }

  function settle() {
    const next = derive();
    if (next === scene) return;
    scene = next;
    onScene?.(next);
  }

  const poller = createPoller({
    client,
    onState: (snapshot) => {
      store.applySnapshot(snapshot);
      settle();
    },
    onEmpty: () => {
      if (store.session().id) { store.clear(); manual = false; }
      settle();
    },
    onStatus
  });

  /* ------------------------------------------------------- escritura */

  async function flush() {
    if (flushing) return;
    const updates = store.pendingEdits();
    if (!updates.length) return;
    flushing = true;
    store.markSent(updates);
    try {
      await client.sendFields(updates);
      poller.kick();
    } catch (err) {
      if (err instanceof ApiError && err.noSession) {
        store.clear();
        settle();
      } else {
        store.markFailed(updates);
        onStatus?.({ online: false, error: err });
      }
    } finally {
      flushing = false;
      if (store.pendingEdits().length) queueFlush();
    }
  }

  function queueFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, TIMING.editDebounce);
  }

  /* --------------------------------------------------------- acciones */

  async function guard(run) {
    try {
      await run();
      poller.kick();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.noSession) { store.clear(); settle(); }
      else onStatus?.({ online: false, error: err });
      return false;
    }
  }

  return {
    store,
    get scene() { return scene; },

    start() {
      poller.start();
    },

    /**
     * Respaldo del slider: si la detección falla, el visitante entra a mano.
     * No hay endpoint documentado para abrir una sesión, así que solo se
     * adelanta la pantalla; la primera edición crea el borrador en el tótem.
     */
    begin() {
      if (manual) return;
      manual = true;
      settle();
    },
    stop() {
      clearTimeout(flushTimer);
      poller.stop();
    },

    /** Edición manual desde la tablet. */
    edit(key, value) {
      if (store.edit(key, value)) queueFlush();
    },
    focus: (key, on) => store.focus(key, on),

    /** Cierra un paso. Vacía primero lo pendiente para no perder tecleo. */
    async verifyStep(id = store.currentStep()?.id) {
      if (!id || !store.canVerify(id)) return false;
      clearTimeout(flushTimer);
      await flush();
      const updates = fieldsOf(id).map((f) => ({
        key: f.key,
        value: store.get(f.key),
        revision: store.meta(f.key).revision
      }));
      return guard(() => client.verifyStep(id, updates));
    },

    retakePhoto(target) {
      return guard(() => client.sendCommand({ type: COMMAND.photoRetake, target }));
    },

    confirmFinal() {
      return guard(() => client.sendCommand({ type: COMMAND.finalConfirmed, accepted: true }));
    },

    /** El comando va primero: así el sondeo no revive el borrador ya cerrado. */
    async cancel() {
      manual = false;
      clearTimeout(flushTimer);
      const ok = await guard(() => client.sendCommand({ type: COMMAND.cancel }));
      store.clear();
      settle();
      return ok;
    },

    stepOf: (id) => STEP_BY_ID[id],
    resync: () => poller.resync()
  };
}
