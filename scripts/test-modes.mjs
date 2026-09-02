/**
 * Los tres modos de arranque, contra la central en memoria.
 *
 *   npm run test:modes
 *
 * Cada escenario corre en su propio proceso: `VITE_START_MODE` se lee una sola
 * vez al cargar la configuración, así que no se puede cambiar en caliente.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url).href;
const TOTEM = 'ef17a152-86c6-43fe-b5d1-dba3959d7c0b';
const SCENARIOS = ['adopcion', 'relevo', 'slider', 'hybrid', 'sinfotos', 'confotos'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, label, ms = 5000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout esperando ${label}`);
    await wait(60);
  }
}

/* ------------------------------------------------------------ runner */

const scenario = process.argv[2];
if (!scenario) {
  let failed = 0;
  for (const name of SCENARIOS) {
    const out = await new Promise((resolve) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), name], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let text = '';
      child.stdout.on('data', (d) => { text += d; });
      child.stderr.on('data', (d) => { text += d; });
      const kill = setTimeout(() => child.kill('SIGKILL'), 30000);
      child.on('close', (codeOut) => { clearTimeout(kill); resolve({ text, codeOut }); });
    });
    process.stdout.write(out.text);
    if (out.codeOut !== 0) failed += 1;
  }
  console.log(failed === 0 ? '\nMODOS DE ARRANQUE OK\n' : `\n${failed} escenario(s) fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}

/* --------------------------------------------------------- escenarios */

const MODE = { adopcion: 'polling', relevo: 'polling', slider: 'slider',
               hybrid: 'hybrid', sinfotos: 'slider', confotos: 'slider' }[scenario];
process.env.VITE_START_MODE = MODE;
process.env.VITE_SKIP_PHOTOS = scenario === 'confotos' ? 'false' : 'true';
process.env.VITE_POLL_MS = '120';
process.env.VITE_EDIT_DEBOUNCE_MS = '60';
globalThis.location = { search: `?totem=${TOTEM}`, pathname: '/' };

const { createSession } = await import(`${SRC}session.js`);
const { store } = await import(`${SRC}store.js`);
const { createClient } = await import(`${SRC}api/client.js`);

const log = [];
const say = (line) => log.push(`  ✓ ${scenario} · ${line}`);
const seed = createClient();
const person = (nombre, apellido) =>
  seed.createPerson((k) => ({ nombre, apellido }[k] ?? ''));

let scene = null;
const session = createSession({ onScene: (s) => { scene = s; } });
let code = 0;

try {
  if (scenario === 'adopcion') {
    // El tótem crea la fila del desconocido: `persons` exige nombre y apellido.
    const id = await person('Desconocido', 'Sin apellido');
    session.start();

    await wait(400);
    if (scene !== 'welcome') throw new Error('sin nadie asignado debe esperar');
    say('nadie asignado → espera en la bienvenida');

    seed.assign(id);
    await until(() => scene === 'step', 'adopción');
    say(`detectada → adoptada ${session.personId}, adopted=${session.adopted}`);

    await until(() => store.session().id === id, 'snapshot aplicado');
    if (store.get('nombre') || store.get('apellido')) {
      throw new Error(`los rellenos deberían leerse vacíos: "${store.get('nombre')}" "${store.get('apellido')}"`);
    }
    say('"Desconocido / Sin apellido" se leen como campos vacíos');

    seed.release();                       // parpadeo del seguimiento
    await wait(180);
    seed.assign(id);
    await wait(400);
    if (scene !== 'step') throw new Error('un 404 aislado no debería cerrar la sesión');
    say('un 404 aislado no cierra la sesión (tolerancia 3)');

    seed.release();                       // se fue de verdad
    await until(() => scene === 'welcome', 'cierre por ausencia');
    say('ausencia sostenida → vuelve a la bienvenida');
  }

  if (scenario === 'relevo') {
    const uno = await person('Ana', 'Pérez');
    const dos = await person('Luis', 'Gómez');
    session.start();

    seed.assign(uno);
    await until(() => session.personId === uno, 'primera persona');
    await until(() => store.get('nombre') === 'Ana', 'datos de la primera');
    say(`adopta a ${store.get('nombre')} ${store.get('apellido')}`);

    seed.assign(dos);
    await until(() => session.personId === dos, 'relevo');
    await until(() => store.get('nombre') === 'Luis', 'datos del relevo');
    say(`llega otra persona → empieza de cero con ${store.get('nombre')} ${store.get('apellido')}`);
  }

  if (scenario === 'slider') {
    const otro = await person('Nadie', 'Mas');
    seed.assign(otro);                    // hay alguien, pero este modo no mira
    session.start();

    await wait(500);
    if (scene !== 'welcome' || session.personId) {
      throw new Error('el modo slider no debe adoptar a nadie');
    }
    say('ignora al tótem aunque tenga persona asignada');

    session.begin();
    await until(() => scene === 'step', 'entrada por slider');
    session.edit('nombre', 'Diego');
    session.edit('apellido', 'Párraga');
    await session.verifyStep('identity');
    await until(() => session.personId, 'alta al cerrar el paso 1');
    say(`alta propia ${session.personId}, adopted=${session.adopted}`);

    await wait(500);
    if (!session.personId) throw new Error('el sondeo descartó la persona propia');
    say('el sondeo no confunde la persona propia con una ausencia');
  }

  if (scenario === 'hybrid') {
    session.start();
    await wait(400);
    if (scene !== 'welcome') throw new Error('sin detección debe esperar');
    say('sin detección se queda esperando, con el slider disponible');

    session.begin();
    await until(() => scene === 'step', 'entrada por slider');

    // La ventana peligrosa: se entró a mano pero la persona todavía no nace
    // (nace al verificar el paso 1). Si el tótem asigna a alguien aquí, la
    // sesión no debe cambiar de dueño.
    const temprano = await person('Intruso', 'Temprano');
    seed.assign(temprano);
    await wait(500);
    if (session.personId === temprano) {
      throw new Error('una detección durante el paso 1 se robó la sesión manual');
    }
    say('una detección antes del alta no roba la sesión manual');
    seed.release();

    session.edit('nombre', 'Rosa');
    session.edit('apellido', 'Quispe');
    await session.verifyStep('identity');
    await until(() => session.personId, 'alta manual');
    say(`slider → alta propia ${session.personId}`);

    const intruso = await person('Otro', 'Visitante');
    seed.assign(intruso);
    await wait(600);
    if (store.get('nombre') !== 'Rosa') {
      throw new Error(`la sesión manual fue robada: ahora dice "${store.get('nombre')}"`);
    }
    say('una detección posterior no roba la sesión ya empezada a mano');
  }

  /* El registro a mano no puede pedir fotos: no hay avatar que las tome. */
  if (scenario === 'sinfotos' || scenario === 'confotos') {
    session.start();
    session.begin();
    await until(() => scene === 'step', 'entrada por slider');

    const pasos = store.activeSteps().map((s) => s.id);
    const esperados = scenario === 'sinfotos'
      ? ['identity', 'work', 'contact']
      : ['identity', 'work', 'contact', 'photos'];
    if (pasos.join() !== esperados.join()) {
      throw new Error(`pasos ${pasos.join()} - se esperaba ${esperados.join()}`);
    }
    say(`el stepper muestra ${pasos.length} pasos: ${pasos.join(' + ')}`);

    session.edit('nombre', 'Rosa');
    session.edit('apellido', 'Quispe');
    await session.verifyStep('identity');
    await until(() => session.personId, 'alta manual');
    await session.verifyStep('work');
    session.edit('telefono', '700 12345');
    session.edit('email', 'rosa@teleinfo.bo');
    await session.verifyStep('contact');

    if (scenario === 'sinfotos') {
      await until(() => scene === 'done', 'fin del registro sin fotos');
      say('el paso de fotos se saltó y el registro terminó');

      const { state } = await seed.pull(session.personId);
      if (state.raw.pending_to_print !== 0) {
        throw new Error(`pending_to_print = ${state.raw.pending_to_print}, se esperaba 0`);
      }
      say('pending_to_print = 0: encolado para imprimir');
    } else {
      await wait(200);
      if (scene === 'done') throw new Error('con la bandera en false las fotos deben pedirse');
      if (store.currentStep()?.id !== 'photos') {
        throw new Error(`quedó en ${store.currentStep()?.id}, se esperaba photos`);
      }
      say('con la bandera en false el paso de fotos se pide igual');

      const { state } = await seed.pull(session.personId);
      if (state.raw.pending_to_print !== null) {
        throw new Error('no debe encolarse la impresión antes de terminar');
      }
      say('sin terminar el registro no se encola nada');
    }
  }

  console.log(log.join('\n'));
} catch (err) {
  console.log(log.join('\n'));
  console.error(`  ✗ ${scenario} · ${err.message}`);
  code = 1;
} finally {
  session.stop();
}
process.exit(code);
