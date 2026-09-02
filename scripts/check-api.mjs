/**
 * Prueba de conexión contra la central, sin navegador.
 *
 *   npm run check            solo lectura: /health y, si se le pasa, una persona
 *   npm run check -- --write recorrido completo: crea, actualiza y lee
 *
 * Lee VITE_API_BASE y VITE_API_TOKEN de .env. El modo --write deja una persona
 * de prueba en la base: úselo contra un entorno de pruebas.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const env = {};
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.error('No pude leer .env — copie .env.example primero.');
  process.exit(1);
}

const BASE = (env.VITE_API_BASE ?? '').replace(/\/$/, '');
const TOKEN = env.VITE_API_TOKEN ?? '';
const WRITE = process.argv.includes('--write');
const PERSON = process.argv.find((a) => a.startsWith('--person='))?.split('=')[1];

if (!BASE) {
  console.error('Falta VITE_API_BASE en .env');
  process.exit(1);
}

const auth = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
let failed = 0;

async function call(label, path, options = {}) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { ...auth, ...(options.headers ?? {}) }
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 200); }
    const ms = Date.now() - started;
    const mark = res.ok ? '✓' : '✗';
    if (!res.ok) failed += 1;
    console.log(`  ${mark} ${String(res.status).padEnd(3)} ${label.padEnd(34)} ${ms}ms`);
    if (!res.ok) console.log(`      ${JSON.stringify(body)?.slice(0, 220)}`);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ERR ${label.padEnd(34)} ${err.message}`);
    return { ok: false, status: 0, body: null };
  }
}

console.log(`\nCentral: ${BASE}`);
console.log(`Token:   ${TOKEN ? `${TOKEN.slice(0, 6)}… (${TOKEN.length} car.)` : 'SIN TOKEN'}\n`);

await call('GET /health', '/health');

if (PERSON) {
  await call('GET  persona', `/api/persons/${PERSON}`);
  await call('GET  fotos', `/api/persons/${PERSON}/photos`);
}

if (WRITE) {
  console.log('\n  --write: alta y actualización de una persona de prueba');
  const form = new FormData();
  form.append('category', 'registered');
  form.append('first_name', 'Prueba');
  form.append('paternal_surname', `Onboarding ${Date.now().toString(36)}`);

  const created = await call('POST /api/persons', '/api/persons', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: form
  });

  const id = created.body?.person_id ?? created.body?.id;
  if (id) {
    console.log(`      person_id: ${id}`);
    await call('PATCH  cargo + empresa', `/api/persons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_title: 'QA', company: 'Teleinfo' })
    });
    await call('PATCH  telefono + email', `/api/persons/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_prefix: '+591',
        phone_number: '70012345',
        email: `prueba.${Date.now().toString(36)}@teleinfo.test`
      })
    });
    const read = await call('GET    persona actualizada', `/api/persons/${id}`);
    if (read.ok) {
      const p = read.body;
      console.log(`      → ${p.first_name} ${p.paternal_surname} · ${p.job_title} · ${p.company}`);
      console.log(`      → ${p.phone_prefix} ${p.phone_number} · ${p.email}`);
    }
    await call('GET    fotos', `/api/persons/${id}/photos`);
  }
}

console.log(
  failed === 0
    ? '\nTodo respondió. Puede levantar la UI con VITE_TRANSPORT=http.\n'
    : `\n${failed} llamada(s) fallaron — revise base, token y CORS.\n`
);
process.exit(failed === 0 ? 0 : 1);
