/**
 * Prueba del transporte HTTP contra una central de mentira que habla el
 * contrato documentado de rt-face-recognition.
 *
 *   npm run test:http
 *
 * Valida lo que la central en memoria no puede: headers, multipart,
 * Idempotency-Key, cuerpos del PATCH, propagación de 422 y 404, y el ida y
 * vuelta del teléfono partido. No necesita credenciales ni red.
 */
import { startFakeCentral, calls } from './fake-central.mjs';

const PORT = Number(process.env.FAKE_PORT ?? 9099);
const TOKEN = 'tok-de-prueba';

process.env.VITE_TRANSPORT = 'http';
process.env.VITE_API_BASE = `http://127.0.0.1:${PORT}`;
process.env.VITE_API_TOKEN = TOKEN;
globalThis.location = { search: '?totem=totem-feria-01', pathname: '/' };

const { server } = await startFakeCentral(PORT, { token: TOKEN });

const log = [];
let code = 0;
try {
  const { createClient } = await import('../src/api/client.js');
  const { store } = await import('../src/store.js');
  const client = createClient();
  const read = (k) => store.get(k);

  store.edit('nombre', 'Diego');
  store.edit('apellido', 'Párraga');
  const id = await client.createPerson(read);
  log.push(`POST /api/persons → ${id}`);

  store.edit('cargo', 'Full Stack Developer');
  store.edit('empresa', 'Patio Delivery');
  await client.writeStep(id, 'work', read);
  log.push('PATCH paso 2 (cargo + empresa)');

  store.edit('telefono', '700 12345');
  store.edit('email', 'diego@patio.bo');
  await client.writeStep(id, 'contact', read);
  log.push('PATCH paso 3 (teléfono partido + email)');

  const pulled = await client.pull(id, { withPhotos: true });
  const f = pulled.state.fields;
  log.push(`GET persona → ${f.nombre.value} ${f.apellido.value} · ${f.cargo.value} · ${f.empresa.value}`);
  log.push(`             ${f.telefono.value} · ${f.email.value}`);
  if (f.telefono.value !== '+591 70012345') {
    throw new Error(`teléfono mal reconstruido: "${f.telefono.value}"`);
  }

  try {
    await client.writeFields(id, [{ key: 'email', value: 'no-es-un-correo' }]);
    throw new Error('la central debería haber rechazado ese email');
  } catch (err) {
    if (err.status !== 422) throw err;
    log.push(`422 propagado tal cual: "${err.message}"`);
  }

  const gone = await client.pull('00000000-0000-4000-8000-999999999999');
  if (gone.kind !== 'empty') throw new Error('un 404 debería resolverse como "empty"');
  log.push('persona inexistente → kind="empty"');

  const auths = new Set(calls.filter((c) => c.path !== '/health').map((c) => c.auth));
  if (auths.size !== 1 || [...auths][0] !== `Bearer ${TOKEN}`) {
    throw new Error('alguna llamada salió sin el token');
  }
  log.push('token presente en todas las llamadas');

  console.log('\n' + log.map((l) => '  ✓ ' + l).join('\n'));
  console.log('\nTRANSPORTE HTTP OK\n');
} catch (err) {
  console.log('\n' + log.map((l) => '  · ' + l).join('\n'));
  console.error('\nFALLÓ: ' + err.message + '\n');
  code = 1;
} finally {
  // Cerrar y esperar: salir con el servidor a medio cerrar revienta libuv.
  await new Promise((resolve) => server.close(resolve));
}
process.exitCode = code;
