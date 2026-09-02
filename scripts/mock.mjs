/**
 * Levanta la central de mentira para recorrer el flujo completo en el navegador.
 *
 *   npm run mock
 *
 * En otra terminal, con el .env apuntando a http://127.0.0.1:9099:
 *   npm run dev
 *
 * Los comandos `sim` de abajo hacen a mano lo que en la feria hace el avatar.
 */
import { startFakeCentral } from './fake-central.mjs';

const PORT = Number(process.env.MOCK_PORT ?? 9099);
const TOTEM = process.env.MOCK_TOTEM ?? 'ef17a152-86c6-43fe-b5d1-dba3959d7c0b';

await startFakeCentral(PORT, { requireToken: true });

const base = `http://127.0.0.1:${PORT}`;
const sim = (ruta, cuerpo = {}) =>
  `curl -s -X POST ${base}/__sim/${ruta} -H "Content-Type: application/json" -d '${JSON.stringify({ totem: TOTEM, ...cuerpo })}'`;

console.log(`
  Central de mentira en ${base}
  Totem: ${TOTEM}

  1 · Configure el .env de la pantalla:

     VITE_TRANSPORT=http
     VITE_API_BASE=${base}
     VITE_API_TOKEN=lo-que-sea      # solo para ver las fotos del paso 4
     VITE_START_MODE=hybrid

  2 · Abra la pantalla con el totem en la URL:

     npm run dev
     http://localhost:5173/?totem=${TOTEM}

  3 · Haga de avatar desde otra terminal:

     # llega alguien desconocido (la pantalla lo adopta sola)
     ${sim('detect')}

     # llega alguien ya registrado
     ${sim('detect', { first_name: 'Ana', paternal_surname: 'Perez', fields: { company: 'Hansa', job_title: 'Gerente' } })}

     # el avatar dicta datos mientras el visitante habla
     ${sim('say', { fields: { company: 'Patio Delivery', job_title: 'Developer' } })}

     # el avatar toma las tres fotos, una a una
     ${sim('photo')}

     # el visitante se va
     ${sim('leave')}

     # ver el estado completo
     curl -s ${base}/__sim/state

  Ctrl+C para parar.
`);
