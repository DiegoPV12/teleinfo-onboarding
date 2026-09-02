/**
 * Central de mentira.
 *
 * Habla el contrato documentado de rt-face-recognition —incluida la
 * autenticación tal como quedó tras el commit 8fb6661— y añade unas rutas
 * `/__sim/*` para hacer a mano lo que en la feria hace el avatar: detectar a
 * alguien, dictar datos y tomar fotos.
 *
 * Se usa de dos maneras:
 *   npm run mock        levantarla y recorrer el flujo real en el navegador
 *   npm run test:http   ejercitar el transporte sin navegador
 */
import { createServer } from 'node:http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = () => new Date().toISOString();

const BLANK = {
  category: 'registered', first_name: null, paternal_surname: null,
  maternal_surname: null, description: null, company: null, job_title: null,
  phone_prefix: null, phone_number: null, email: null
};

/** Retrato de relleno: un SVG plano, que el navegador pinta en un <img>. */
const portrait = (shot, name) => {
  const hue = { front: '#007AFF', left: '#AF52DE', right: '#FF9500' }[shot] ?? '#8E8E93';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
  <rect width="300" height="400" fill="${hue}" opacity=".12"/>
  <circle cx="150" cy="148" r="60" fill="${hue}" opacity=".45"/>
  <path d="M42 400c0-62 48-108 108-108s108 46 108 108z" fill="${hue}" opacity=".45"/>
  <text x="150" y="382" font-family="system-ui,sans-serif" font-size="15" fill="${hue}"
        text-anchor="middle" opacity=".95">${name ?? shot}</text>
</svg>`;
};

export const calls = [];

export function startFakeCentral(port = 9099, { requireToken = true } = {}) {
  const people = new Map();
  const photos = new Map();     // person_id -> [muestra]
  const totems = new Map();     // totem_id  -> person_id
  const seenKeys = new Map();
  let seq = 0;

  const detail = (p) => ({
    id: p.id, category: p.category,
    first_name: p.first_name, paternal_surname: p.paternal_surname,
    maternal_surname: p.maternal_surname, description: p.description,
    company: p.company, job_title: p.job_title,
    phone_prefix: p.phone_prefix, phone_number: p.phone_number, email: p.email,
    is_active: true, consent_at: null, consent_reference: null,
    consent_revoked_at: null, delete_after: null,
    created_at: p.created_at, updated_at: p.updated_at,
    active_sample_count: (photos.get(p.id) ?? []).length,
    pending_sample_count: 0, failed_sample_count: 0
  });

  const create = (fields = {}) => {
    seq += 1;
    const id = uuid(seq);
    const p = { ...BLANK, ...fields, id, created_at: now(), updated_at: now() };
    people.set(id, p);
    photos.set(id, []);
    return p;
  };

  /** Las mismas validaciones que corre la central sobre el objeto resultante. */
  const validate = (p) => {
    if (!p.first_name || !p.paternal_surname) return 'Nombre y apellido paterno son obligatorios.';
    if (p.phone_number && !/^[0-9]{6,15}$/.test(p.phone_number)) return 'El numero telefonico debe contener entre 6 y 15 digitos.';
    if (p.phone_prefix && !/^\+[0-9]{1,4}$/.test(p.phone_prefix)) return 'El prefijo telefonico debe tener el formato +<codigo de pais>.';
    if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return 'El email no tiene un formato valido.';
    return null;
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const method = req.method.toLowerCase();

    // CORS abierto: esto es una herramienta de desarrollo, no un despliegue.
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      'Authorization,Content-Type,Idempotency-Key,If-None-Match,X-API-Key,X-CSRF-Token');
    if (method === 'options') { res.writeHead(204); return res.end(); }

    const json = (status, out) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(out === null ? '' : JSON.stringify(out));
    };
    const readBody = async () => {
      const text = await new Response(req).text();
      try { return text ? JSON.parse(text) : {}; } catch { return {}; }
    };

    calls.push({ method: req.method, path, auth: req.headers.authorization ?? null });

    /* --------------------------------------------- simulación del avatar */
    if (path.startsWith('/__sim/')) {
      const payload = await readBody();
      const totem = payload.totem ?? 'default';

      if (path === '/__sim/detect') {
        const p = create({
          first_name: payload.first_name ?? 'Desconocido',
          paternal_surname: payload.paternal_surname ?? 'Sin apellido',
          ...(payload.fields ?? {})
        });
        totems.set(totem, p.id);
        return json(200, { assigned: p.id, totem });
      }
      if (path === '/__sim/leave') {
        totems.delete(totem);
        return json(200, { ok: true });
      }
      if (path === '/__sim/say') {
        const p = people.get(payload.person_id ?? totems.get(totem));
        if (!p) return json(404, { detail: 'Persona no encontrada.' });
        Object.assign(p, payload.fields ?? {}, { updated_at: now() });
        return json(200, detail(p));
      }
      if (path === '/__sim/photo') {
        const id = payload.person_id ?? totems.get(totem);
        const list = photos.get(id);
        if (!list) return json(404, { detail: 'Persona no encontrada.' });
        const shot = payload.shot ?? ['front', 'left', 'right'][list.length] ?? 'front';
        list.push({
          id: uuid(900 + seq * 10 + list.length),
          person_id: id, is_active: true, processing_status: 'completed',
          detection_score: 0.94, source: 'totem_capture',
          captured_at: now(), created_at: now(), shot,
          mime_type: 'image/svg+xml', image_size_bytes: 900
        });
        return json(200, { total: list.length });
      }
      if (path === '/__sim/state') {
        return json(200, {
          totems: Object.fromEntries(totems),
          people: [...people.values()].map(detail),
          photos: Object.fromEntries([...photos].map(([k, v]) => [k, v.length]))
        });
      }
      return json(404, { detail: 'Ruta de simulación desconocida.' });
    }

    if (path === '/health') return json(200, { status: 'ok' });

    /* ------------------------------------------------ rutas de la central */

    const totemMatch = path.match(/^\/api\/totems\/([^/]+)\/current-person$/);
    const personMatch = path.match(/^\/api\/persons\/([^/]+)$/);
    const photosMatch = path.match(/^\/api\/persons\/([^/]+)\/photos$/);
    const imageMatch = path.match(/^\/api\/persons\/([^/]+)\/photos\/([^/]+)\/image$/);

    // Pública desde 8fb6661.
    if (totemMatch && method === 'get') {
      const id = totems.get(totemMatch[1]) ?? totems.get('default');
      const p = id ? people.get(id) : null;
      if (!p) return json(404, { detail: 'Totem sin persona asignada.' });
      return json(200, detail(p));
    }

    // Estas tres siguen pidiendo sesión en la central real.
    const needsToken = method === 'get' && (personMatch || photosMatch || imageMatch);
    if (requireToken && needsToken && !req.headers.authorization) {
      return json(401, { detail: 'Sesion ausente o expirada.' });
    }

    if (method === 'post' && path === '/api/persons') {
      const key = req.headers['idempotency-key'];
      if (!key || !UUID.test(key)) return json(422, { detail: 'Idempotency-Key debe ser un UUID valido.' });
      if (seenKeys.has(key)) return json(201, seenKeys.get(key));

      const form = await new Response(req, {
        headers: { 'content-type': req.headers['content-type'] }
      }).formData();
      const fields = {};
      for (const [k, v] of form.entries()) if (k in BLANK) fields[k] = String(v).trim() || null;

      const p = create(fields);
      const error = validate(p);
      if (error) { people.delete(p.id); photos.delete(p.id); return json(422, { detail: error }); }

      const out = {
        person_id: p.id, display_name: `${p.first_name} ${p.paternal_surname}`,
        category: p.category, samples_accepted: 0, processing_status: 'completed'
      };
      seenKeys.set(key, out);
      return json(201, out);
    }

    if (personMatch) {
      const p = people.get(personMatch[1]);
      if (!p) return json(404, { detail: 'Persona no encontrada.' });
      if (method === 'get') return json(200, detail(p));
      if (method === 'patch') {
        const changes = await readBody();
        const next = { ...p };
        for (const [k, v] of Object.entries(changes)) {
          if (!(k in BLANK)) continue;
          const clean = typeof v === 'string' ? v.trim() : v;
          next[k] = clean === '' ? null : clean;
        }
        const error = validate(next);
        if (error) return json(422, { detail: error });
        Object.assign(p, next, { updated_at: now() });
        return json(200, detail(p));
      }
    }

    if (photosMatch && method === 'get') {
      const list = photos.get(photosMatch[1]);
      if (!list) return json(404, { detail: 'Persona no encontrada.' });
      return json(200, { items: list, total: list.length });
    }

    if (imageMatch && method === 'get') {
      const item = (photos.get(imageMatch[1]) ?? []).find((x) => x.id === imageMatch[2]);
      if (!item) return json(404, { detail: 'Fotografia no encontrada.' });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end(portrait(item.shot, people.get(imageMatch[1])?.first_name));
    }

    return json(404, { detail: 'No encontrado.' });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, people, photos, totems, calls }));
  });
}
