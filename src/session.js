import { API, SKIP_PHOTOS, START_MODE, TIMING, TRANSPORT, WATCHES_TOTEM } from './config.js';
import { STEP_BY_ID } from './steps.js';
import { createClient, ApiError } from './api/client.js';
import { createPoller } from './poll.js';
import { log } from './log.js';
import { store } from './store.js';

/**
 * Máquina de sesión. Une el formulario con la central.
 *
 * Esta pantalla solo se ocupa del FORMULARIO: no sabe de detección, de
 * conversaciones ni de reconocimiento. Hay dos maneras de entrar al flujo, y
 * `VITE_START_MODE` decide cuáles están activas:
 *
 *   DETECTADA (polling · hybrid)
 *     Se sondea GET /api/totems/{id}/current-person. Cuando el tótem asigna a
 *     alguien, se ADOPTA esa persona: ya existe, así que no se crea nada y el
 *     formulario aparece con lo que la central ya tenga. Puede ser un visitante
 *     conocido o una fila recién hecha para un desconocido, con rellenos donde
 *     `persons` exige valor; unos y otros se tratan igual.
 *
 *   A MANO (slider · hybrid)
 *     Nadie detectó nada. El visitante entra por el slider y la persona se CREA
 *     al cerrar el paso 1, cuando ya hay nombre y apellido.
 *
 * De ahí en adelante los dos caminos son el mismo: PATCH parcial al escribir y
 * al verificar cada paso.
 */

/**
 * 404 seguidos del registro propio (no del tótem) antes de darlo por
 * perdido. Un parpadeo de red no cuenta.
 */
const ABSENT_TOLERANCE = 3;

export function createSession({ onScene, onStatus } = {}) {
  const client = createClient();
  let personId = null;
  /** true si la persona vino del tótem; false si la creamos nosotros. */
  let adopted = false;
  let absent = 0;
  let flushTimer = null;
  let flushing = false;
  let creating = null;
  let scene = null;
  let started = false;
  let abandonTimer = null;

  const read = (key) => store.get(key);
  /** El listado de fotos sigue pidiendo sesión: sin token no se puede leer. */
  const onPhotos = () => Boolean(API.token) && store.currentStep()?.kind === 'photos';

  function derive() {
    if (!started) return 'welcome';
    const step = store.currentStep();
    if (!step) return 'done';
    return step.kind === 'photos' ? 'photos' : 'step';
  }

  function settle() {
    const next = derive();
    if (next === scene) return;
    log.session(`escena ${scene ?? '—'} → ${next}`);
    scene = next;
    onScene?.(next);
  }

  function reset() {
    if (personId) log.session(`sesión cerrada · ${personId}`);
    started = false;
    personId = null;
    adopted = false;
    absent = 0;
    creating = null;
    notifiedStep = null;
    clearTimeout(flushTimer);
    clearTimeout(abandonTimer);
    store.clear();
    settle();
  }

  /**
   * Avisa al tótem qué paso se está mostrando, cada vez que cambia — al
   * aterrizar en el primero (detección o slider), al avanzar y al volver
   * atrás. Se dedupe contra el último avisado para no repetir el mismo paso
   * en cada sondeo.
   */
  let notifiedStep = null;
  function announceStep() {
    const current = store.currentStep();
    if (!current || current.id === notifiedStep) return;
    notifiedStep = current.id;
    client.notifyStep(current.id).then((delivered) => {
      if (delivered === false) {
        log.change('totem-event', 'sin-uuid-o-token', () =>
          log.poll('aviso «paso actualizado»: falta VITE_TOTEM_UUID o VITE_API_TOKEN'));
      } else if (delivered === 0) {
        log.poll(`aviso «paso actualizado» → ${current.id}: encolado, tótem sin conexión abierta`);
      } else {
        log.ok(`aviso «paso actualizado» → ${current.id}: entregado a ${delivered} conexión(es)`);
      }
    }).catch(() => {});
  }

  /**
   * Reinicia la cuenta atrás del abandono. Se llama en cada cosa que prueba
   * que sigue habiendo alguien ahí: escribir, verificar un paso, volver
   * atrás, y también cuando llega una actualización del avatar (dictado o
   * foto) — eso también es señal de que la persona sigue presente.
   *
   * Es el reemplazo de la vieja detección por ausencia del tótem: aquella
   * medía «¿el tótem todavía la ve?», y punto flojo era que un registro a
   * medio llenar se cerraba solo porque el visitante se movió un momento.
   * Esta mide «¿pasó algo en el formulario en los últimos N segundos?», que
   * es lo que de verdad importa para no dejar una sesión viva para siempre.
   */
  function bumpActivity() {
    clearTimeout(abandonTimer);
    if (!started || scene === 'done') return;
    abandonTimer = setTimeout(() => {
      log.session(`sin actividad ${TIMING.abandonMs} ms: se abandona el registro`);
      reset();
    }, TIMING.abandonMs);
  }

  /* ----------------------------------------------------------- sondeo */

  /**
   * Qué se pide en cada tick depende de dónde estamos:
   *
   *   sin persona     → al tótem, a ver si asignó a alguien
   *   persona suya    → al tótem, que además trae lo que el avatar va
   *                     dictando y las fotos — sigue siendo el único canal
   *                     sin token para eso
   *   persona nuestra → a la persona directamente; el tótem no la conoce y
   *                     respondería 404 para siempre
   */
  function pull(signal) {
    const manual = started && !adopted;
    const watching = WATCHES_TOTEM && API.totem && !manual;
    if (WATCHES_TOTEM && !API.totem) {
      log.change('sin-totem', true, () =>
        log.bad('modo con vigilancia pero sin totem: agregue ?totem=<code> a la URL'));
    }
    if (watching) {
      return client.pullCurrent(API.totem, { signal, withPhotos: onPhotos() })
        .then((res) => ({ ...res, from: 'totem' }))
        .catch((err) => {
          if (err?.name === 'AbortError') throw err;
          // Errores de red o del servidor al preguntar por el tótem: se trata
          // como «nadie enfrente» para no dejar la bienvenida en «Reconectando»
          // para siempre por un fallo ajeno.
          log.change('totem-falla', String(err?.message ?? err), () =>
            log.bad(`no se pudo preguntar por el tótem ${API.totem}`, err?.message ?? err));
          return { kind: 'empty', from: 'totem' };
        });
    }
    // Persona propia: `GET /api/persons/{id}` todavía exige sesión. Sin token
    // no hay nada que releer — y tampoco hace falta, porque un registro que el
    // tótem no conoce solo lo escribimos nosotros.
    if (personId && API.token) {
      return client.pull(personId, { signal, withPhotos: onPhotos() })
        .then((res) => ({ ...res, from: 'person' }));
    }
    // Persona propia y sin token: no hay a quién preguntarle. Se dice una vez.
    if (personId) {
      log.change('sin-relectura', personId, () =>
        log.poll('persona propia sin token: no se relee, solo se escribe'));
    }
    return Promise.resolve({ kind: 'idle' });
  }

  function onResult(res) {
    if (res.kind === 'idle') return;
    if (res.kind === 'state') return present(res.state);
    return missing(res.from);
  }

  /** El tótem —o la relectura directa— tiene datos frescos de la persona. */
  function present(state) {
    absent = 0;
    const incoming = state.sessionId;

    // Llegó otra persona mientras trabajábamos.
    if (personId && incoming && incoming !== personId) {
      if (!adopted) {
        log.change('otro-detectado', incoming, () =>
          log.session(`el tótem detectó a ${incoming}, pero la sesión a mano sigue`));
        return;   // la nuestra la creamos a mano: no se abandona
      }
      log.session(`relevo de persona · ${personId} → ${incoming}`);
      reset();
    }

    if (!personId && incoming) {
      personId = incoming;
      adopted = true;
      started = true;         // detectada: el formulario se abre solo
      if (SKIP_PHOTOS) store.skip('photos');
      log.session(`persona adoptada del tótem · ${incoming}`, {
        nombre: [state.fields?.nombre?.value, state.fields?.apellido?.value]
          .filter(Boolean).join(' ') || '(vacío: desconocido)',
        empresa: state.fields?.empresa?.value || '—',
        fotos: state.photos ? Object.keys(state.photos).length : 0
      });
    }

    store.applySnapshot(state);
    settle();
    bumpActivity();   // el avatar dictando o tomando fotos también es actividad
    announceStep();   // puede ser el aterrizaje en el paso 1 recién detectada
  }

  /**
   * `kind: 'empty'` en un tick. Según de dónde vino:
   *
   *   from: 'totem'   → el tótem no ve a nadie (o a esta persona ya no).
   *                     UNA VEZ ADOPTADA, ESO YA NO IMPORTA: el visitante
   *                     puede alejarse del avatar sin perder su registro a
   *                     medio llenar. Quien cierra la sesión ahora es el
   *                     timer de inactividad (`bumpActivity`), no esto.
   *   from: 'person'  → `GET /api/persons/{id}` respondió 404: el registro
   *                     EN SÍ desapareció de la central. Eso sí se cuenta.
   */
  function missing(from) {
    if (!personId) {
      log.change('presencia', 'nadie', () => log.poll('nadie frente al tótem'));
      return;                 // esperando en la bienvenida
    }
    if (from === 'totem') return;   // ausencia del tótem: ya no decide nada
    if (!adopted) return;     // la nuestra no vive en la central hasta que la creamos
    absent += 1;
    log.session(`el registro ya no existe en la central · ${absent}/${ABSENT_TOLERANCE}`);
    if (absent >= ABSENT_TOLERANCE) reset();
  }

  const poller = createPoller({ pull, onResult, onStatus });

  function fail(err) {
    if (err instanceof ApiError) {
      if (err.unauthorized) log.bad('la central pidió sesión: falta VITE_API_TOKEN', err.message);
      else if (err.invalid) log.bad(`la central rechazó el dato: ${err.message}`);
      else log.bad(`error de la central (${err.status})`, err.message);
    }
    if (err instanceof ApiError && err.gone) return reset();
    onStatus?.({ online: false, error: err });
  }

  /**
   * La persona nace una sola vez, al cerrar el paso 1 — y solo en el camino a
   * mano. Si dos llamadas caen juntas, ambas esperan a la misma promesa.
   */
  function ensurePerson() {
    if (personId) return Promise.resolve(personId);
    if (!creating) {
      creating = client
        .createPerson(read)
        .then((id) => {
          personId = id;
          adopted = false;
          log.ok(`persona creada a mano · ${id}`);
          store.markSent(store.pendingEdits());   // lo del paso 1 ya viajó
          poller.kick();
          return id;
        })
        .catch((err) => { creating = null; fail(err); return null; });
    }
    return creating;
  }

  /**
   * Cierre del registro. `pending_to_print = 0` es la señal para la cola de
   * impresión, y vale para cualquier registro: detectado o a mano. Si falla, el
   * registro ya está guardado: se avisa y no se le arruina el final al visitante.
   */
  async function complete(id) {
    try {
      await client.finishRegistration(id);
      log.ok(`registro cerrado · ${id} encolado para imprimir`);
    } catch (err) {
      log.bad('el registro se guardó pero no se pudo encolar la impresión', err?.message ?? err);
    }
  }

  /* -------------------------------------------------------- escritura */

  /** Sin persona todavía no hay dónde escribir: lo tecleado espera en el store. */
  async function flush() {
    if (flushing || !personId) return;
    const updates = store.pendingEdits();
    if (!updates.length) return;

    flushing = true;
    store.markSent(updates);
    log.form(`guardando ${updates.map((u) => u.key).join(', ')}`);
    try {
      await client.writeFields(personId, updates);
      poller.kick();
    } catch (err) {
      store.markFailed(updates);
      log.bad(`no se pudieron guardar ${updates.map((u) => u.key).join(', ')}`, err?.message);
      fail(err);
    } finally {
      flushing = false;
      if (store.pendingEdits().length) queueFlush();
    }
  }

  function queueFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, TIMING.editDebounce);
  }

  /* ---------------------------------------------------------- acciones */

  return {
    store,
    get scene() { return scene; },
    get personId() { return personId; },
    /** true si la persona la asignó el tótem; false si la creamos nosotros. */
    get adopted() { return adopted; },
    get mode() { return START_MODE; },

    start() {
      log.boot({
        central: { valor: API.base || '(sin VITE_API_BASE)' },
        transporte: { valor: TRANSPORT },
        modo: { valor: START_MODE },
        totem: { valor: API.totem || '(no viene en la URL)' },
        token: { valor: API.token ? 'presente' : 'ausente — sin fotos ni relectura' },
        sondeo: { valor: `${API.pollMs} ms` }
      });
      if (TRANSPORT === 'http' && !API.base) log.bad('falta VITE_API_BASE: no hay a dónde llamar');
      poller.start();
      settle();
    },
    stop() {
      clearTimeout(flushTimer);
      clearTimeout(abandonTimer);
      poller.stop();
    },

    /** Slider: solo abre el formulario. La persona nace al cerrar el paso 1. */
    begin() {
      if (started) return false;
      started = true;
      // Sin avatar no hay quien tome las fotos: en el camino a mano el paso se
      // quita antes de dibujar nada, para que el stepper cuente los que hay.
      if (SKIP_PHOTOS && store.skip('photos')) {
        log.session('registro a mano: se salta el paso de fotos');
      }
      log.session('entrada a mano por el slider');
      settle();
      bumpActivity();
      announceStep();
      return true;
    },

    edit(key, value) {
      if (store.edit(key, value)) { queueFlush(); bumpActivity(); }
    },
    focus: (key, on) => store.focus(key, on),

    /** Cierra un paso: escribe lo que haya y avanza. */
    async verifyStep(id = store.currentStep()?.id) {
      if (!id || !store.canVerify(id)) {
        log.form(`paso ${id} todavía no se puede verificar`);
        return false;
      }
      log.form(`verificando paso ${id}`);
      clearTimeout(flushTimer);
      const hadPerson = personId;
      const personKey = await ensurePerson();
      if (!personKey) return false;

      try {
        // Si la persona acaba de nacer, el alta ya llevó los datos del paso 1.
        if (STEP_BY_ID[id]?.kind !== 'photos' && hadPerson) {
          await client.writeStep(personKey, id, read);
          store.markSent(store.pendingEdits());
        }
        store.release(id);
        store.markStepVerified(id);
        log.ok(`paso ${id} guardado`);

        // Último paso: el registro queda encolado para imprimir la credencial.
        if (!store.currentStep()) await complete(personKey);

        settle();
        bumpActivity();
        announceStep();   // el paso que se muestra ahora cambió (o se acabó)
        poller.kick();
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },

    /** Vuelve al paso anterior y lo sostiene abierto. */
    back() {
      const previous = store.previousStep();
      if (!previous) return false;
      clearTimeout(flushTimer);
      flush();
      store.reopen(previous.id);
      log.form(`vuelve al paso ${previous.id}`);
      settle();
      bumpActivity();
      announceStep();
      return true;
    },

    /** La imagen va autenticada: se pide como blob. */
    photoUrl: (sampleId) => client.photoUrl(personId, sampleId),

    /** Fin del registro: la pantalla vuelve a la bienvenida. */
    finish: () => reset(),

    stepOf: (id) => STEP_BY_ID[id],
    resync: () => poller.resync()
  };
}
