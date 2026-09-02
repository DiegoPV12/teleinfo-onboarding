import { FIELDS } from './config.js';
import { STEPS, STEP_IDS } from './steps.js';
import { fieldError } from './validate.js';
import { log } from './log.js';

/**
 * Estado del registro. A diferencia de la versión anterior no es un simple
 * diccionario: cada campo lleva revisión y procedencia porque el backend y la
 * tablet escriben sobre lo mismo al mismo tiempo.
 *
 * Reglas de reconciliación (polling ~1s contra edición manual):
 *  1. Campo en foco y modificado  → el snapshot NO lo pisa; queda en `incoming`
 *     y se aplica al salir del foco si el usuario no siguió escribiendo.
 *  2. Campo con escritura en vuelo → se ignoran revisiones ≤ a la enviada.
 *  3. Resto → gana el remoto, y se avisa para animar la llegada del dato.
 */

const blankPhotos = () => ({
  front: { id: null, url: '', status: 'pending' },
  left: { id: null, url: '', status: 'pending' },
  right: { id: null, url: '', status: 'pending' }
});

const blank = () => ({
  value: '',
  source: null,      // 'avatar' | 'manual' | null
  revision: 0,
  dirty: false,      // editado localmente y aún sin confirmar
  pending: false,    // POST /fields en vuelo
  focused: false,
  incoming: null     // valor remoto retenido mientras el usuario escribe
});

function createStore() {
  const fields = Object.fromEntries(FIELDS.map((f) => [f.key, blank()]));
  const steps = Object.fromEntries(STEP_IDS.map((id) => [id, { verified: false }]));
  let photos = blankPhotos();
  let session = { id: null, active: false, phase: null, printed: false };
  /** Pasos que el visitante reabrió con "volver atrás": no se re-verifican solos. */
  const reopened = new Set();
  /** Pasos que esta sesión no va a pedir (hoy: las fotos en el camino a mano). */
  const skipped = new Set();
  const listeners = new Set();

  const emit = (event) => listeners.forEach((fn) => fn(event));

  const api = {
    /* ---------------------------------------------------- lectura */
    get: (key) => fields[key]?.value ?? '',
    meta: (key) => fields[key] ?? blank(),
    all: () => Object.fromEntries(FIELDS.map((f) => [f.key, fields[f.key].value])),
    photos: () => photos,
    session: () => session,
    isVerified: (id) => Boolean(steps[id]?.verified),

    /** Los pasos que esta sesión sí recorre, en orden. */
    activeSteps: () => STEPS.filter((s) => !skipped.has(s.id)),

    /**
     * Quita un paso de esta sesión. Se decide al empezar, no a mitad de camino:
     * el stepper se dibuja una vez y debe contar lo que de verdad se va a pedir.
     */
    skip(id) {
      if (!steps[id] || skipped.has(id)) return false;
      skipped.add(id);
      return true;
    },
    isSkipped: (id) => skipped.has(id),

    /** Primer paso sin verificar; null si el registro está completo. */
    currentStep: () => api.activeSteps().find((s) => !steps[s.id].verified) ?? null,

    /** Paso anterior al actual, o null si ya estamos en el primero. */
    previousStep() {
      const list = api.activeSteps();
      const current = api.currentStep();
      if (!current) return list[list.length - 1] ?? null;
      const at = list.indexOf(current);
      return at > 0 ? list[at - 1] : null;
    },

    /** Volver atrás: reabre el paso y lo sostiene abierto. */
    reopen(id) {
      if (!steps[id]) return false;
      reopened.add(id);
      steps[id].verified = false;
      emit({ type: 'sync', keys: [], stepsChanged: true });
      return true;
    },

    /** Al verificar de nuevo, el paso deja de estar sostenido. */
    release: (id) => reopened.delete(id),

    /** El avance entre pasos es local: la central no guarda "verificado". */
    markStepVerified(id) {
      if (!steps[id] || steps[id].verified) return false;
      steps[id].verified = true;
      emit({ type: 'sync', keys: [], stepsChanged: true });
      return true;
    },

    /** Un paso puede verificarse si tiene todos sus campos o es opcional. */
    canVerify(id) {
      const step = STEPS.find((s) => s.id === id);
      if (!step) return false;
      if (step.kind === 'photos') return step.shots.every((s) => photos[s.id]?.id);
      const valid = step.fields.every((k) => !fieldError(k, fields[k].value));
      if (!valid) return false;
      if (step.optional) return true;
      return step.fields.every((k) => fields[k].value.trim());
    },

    /* ------------------------------------------------- escritura local */
    focus(key, on) {
      const f = fields[key];
      if (!f) return;
      f.focused = on;
      if (!on && !f.dirty && f.incoming !== null) {
        api.__accept(key, f.incoming);
        f.incoming = null;
        emit({ type: 'sync', keys: [key] });
      }
    },

    /** Edición manual desde la tablet. No toca la revisión: eso lo hace el envío. */
    edit(key, value) {
      const f = fields[key];
      if (!f) return false;
      const clean = String(value ?? '');
      if (f.value === clean) return false;
      f.value = clean;
      f.source = 'manual';
      f.dirty = true;
      f.incoming = null;
      emit({ type: 'field', key, value: clean, origin: 'manual' });
      return true;
    },

    /** Campos editados y todavía no enviados. */
    pendingEdits: () =>
      FIELDS.filter((f) => fields[f.key].dirty)
        .map((f) => ({ key: f.key, value: fields[f.key].value, revision: fields[f.key].revision })),

    /** Marca un envío en vuelo: la revisión sube de forma optimista. */
    markSent(updates) {
      for (const u of updates) {
        const f = fields[u.key];
        if (!f) continue;
        f.dirty = false;
        f.pending = true;
        f.revision = (u.revision ?? f.revision) + 1;
      }
    },

    /** El envío falló: se devuelve el campo a "sucio" para reintentar. */
    markFailed(updates) {
      for (const u of updates) {
        const f = fields[u.key];
        if (!f) continue;
        f.pending = false;
        f.dirty = true;
        f.revision = Math.max(0, f.revision - 1);
      }
    },

    /* ------------------------------------------------ llegada del backend */
    __accept(key, incoming) {
      const f = fields[key];
      f.value = incoming.value;
      f.source = incoming.source ?? f.source;
      f.revision = incoming.revision;
      f.pending = false;
      f.dirty = false;
    },

    /**
     * Aplica un snapshot normalizado. Devuelve las claves que cambiaron para
     * que la escena anime solo lo que llegó nuevo.
     */
    applySnapshot(snap) {
      const changed = [];
      // Adoptar un id donde no había ninguno no es un cambio de sesión: puede
      // ser el borrador que acaba de abrir nuestra primera edición manual.
      const fresh = Boolean(snap.sessionId && session.id && snap.sessionId !== session.id);
      if (fresh) api.resetLocal();

      session = {
        id: snap.sessionId,
        active: snap.active !== false,
        phase: snap.phase,
        printed: snap.printed
      };

      for (const { key } of FIELDS) {
        const inc = snap.fields[key];
        const f = fields[key];
        if (!inc) continue;

        // 2 · escritura en vuelo: el backend todavía no la refleja
        if (f.pending && inc.revision < f.revision) continue;

        // 1 · el usuario está escribiendo justo en este campo
        if (f.focused && f.dirty) {
          if (inc.value !== f.value) {
            f.incoming = inc;
            log.form(`«${key}» llegó del avatar mientras se escribía: se retiene`);
          }
          continue;
        }
        if (f.dirty && inc.value !== f.value) continue;

        if (inc.value === f.value && inc.revision <= f.revision) {
          f.pending = false;
          continue;
        }
        log.form(`«${key}» viene de la central: "${inc.value}"`);
        api.__accept(key, inc);
        changed.push(key);
      }

      // snap.steps === null: el backend no sabe de pasos, el avance es nuestro
      let stepsChanged = false;
      if (snap.steps) {
        for (const id of STEP_IDS) {
          if (reopened.has(id)) continue;   // el visitante volvió a este paso
          const v = Boolean(snap.steps[id]?.verified);
          if (steps[id].verified !== v) { steps[id].verified = v; stepsChanged = true; }
        }
      }

      const photosChanged = JSON.stringify(photos) !== JSON.stringify(snap.photos);
      if (photosChanged) photos = snap.photos;

      emit({ type: 'sync', keys: changed, fresh, stepsChanged, photosChanged });
      return { changed, fresh, stepsChanged, photosChanged };
    },

    /* ------------------------------------------------------------ ciclo */
    resetLocal() {
      for (const { key } of FIELDS) Object.assign(fields[key], blank());
      for (const id of STEP_IDS) steps[id].verified = false;
      reopened.clear();
      skipped.clear();
      photos = blankPhotos();
    },

    /** Se fue la sesión: la pantalla vuelve a estar vacía. */
    clear() {
      api.resetLocal();
      session = { id: null, active: false, phase: null, printed: false };
      emit({ type: 'clear' });
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };

  return api;
}

export const store = createStore();
