# Plan de pruebas

> Contrato de referencia: [`integracion-central.md`](integracion-central.md).

Tres niveles, del más barato al más caro. Los dos primeros **no necesitan la
central ni credenciales**; el tercero es la verificación final contra el
despliegue real.

| Nivel | Comando | Qué prueba | Necesita |
| --- | --- | --- | --- |
| 1 · Lógica | `npm run test:http`<br>`npm run test:modes` | Transporte, contrato, los tres modos de arranque | Nada |
| 2 · Flujo | `npm run mock` + `npm run dev` | La pantalla completa en el navegador, con fotos | Nada |
| 3 · Real | Postman / Newman | Que la central se comporte como creemos | URL de la central |

---

## Nivel 1 · Automático, sin navegador

```bash
npm run test:http     # el transporte HTTP real contra una central de mentira
npm run test:modes    # los tres modos de arranque
```

`test:http` levanta [`scripts/fake-central.mjs`](../scripts/fake-central.mjs) y
corre contra ella el mismo código que hablará con la central. Cubre:

- El multipart del alta y el `Idempotency-Key` UUID.
- Los cuerpos del `PATCH` por paso.
- El ida y vuelta del teléfono: `"700 12345"` → `+591`/`70012345` → `"+591 70012345"`.
- Que un `422` de la central llegue con su mensaje intacto.
- Que un `404` se resuelva como «no hay nadie» y no como error.
- Que ninguna llamada salga sin el token cuando hay token configurado.

`test:modes` corre cuatro escenarios, **cada uno en su propio proceso** porque
`VITE_START_MODE` se lee una sola vez:

| Escenario | Qué comprueba |
| --- | --- |
| `adopcion` | Adopta a la persona detectada · los rellenos («Desconocido») se leen vacíos · un `404` aislado no cierra la sesión · la ausencia sostenida sí |
| `relevo` | Si cambia el `person_id`, el flujo empieza de cero con la nueva persona |
| `slider` | No adopta a nadie aunque el tótem tenga persona · el alta es propia · el sondeo no confunde la persona propia con una ausencia |
| `hybrid` | El slider funciona sin detección · una detección posterior no roba la sesión ya empezada |

---

## Nivel 2 · El flujo completo en el navegador

Es lo más parecido a la feria que se puede montar sin la central. La central de
mentira sirve las mismas rutas —incluidas **fotos de verdad**, como SVG— y añade
unas rutas `/__sim/*` para hacer a mano lo que allí hace el avatar.

### Preparar

```bash
npm run mock          # deja la central en http://127.0.0.1:9099
```

En el `.env`:

```dotenv
VITE_TRANSPORT=http
VITE_API_BASE=http://127.0.0.1:9099
VITE_API_TOKEN=lo-que-sea      # solo hace falta para ver las fotos del paso 4
VITE_START_MODE=hybrid
```

Y en otra terminal:

```bash
npm run dev
# abrir http://localhost:5173/?totem=ef17a152-86c6-43fe-b5d1-dba3959d7c0b
```

### Guion A · Visitante detectado y desconocido

| # | Acción | Qué debe pasar en pantalla |
| --- | --- | --- |
| 1 | — | Bienvenida esperando; el slider aparece con el saludo |
| 2 | `sim detect` | Entra sola al paso 1, **con los campos vacíos** (no debe verse «Desconocido») |
| 3 | Escribir nombre y apellido | Se guardan solos ~400 ms después de dejar de teclear |
| 4 | **Verificar** | Pasa al paso 2; el stepper marca el 1 con un check |
| 5 | **Prefiero omitir estos datos** | Pasa al paso 3 sin escribir nada |
| 6 | Escribir `diego@` | El campo se marca en rojo y **Verificar** queda deshabilitado |
| 7 | Completar el correo y el teléfono | Se habilita **Verificar** |
| 8 | **Verificar** | Pasa al paso 4, con las tres guías de postura |
| 9 | `sim photo` ×3 | Las tomas van apareciendo de a una, en orden |
| 10 | **Confirmar fotos** | Pantalla final y vuelta a la bienvenida |

### Guion B · Visitante ya registrado

```bash
sim detect  con  {"first_name":"Ana","paternal_surname":"Perez",
                  "fields":{"company":"Hansa","job_title":"Gerente"}}
```

El formulario debe aparecer **precargado** con Ana Pérez y, en el paso 2, con
Hansa y Gerente ya escritos. Es el caso «ya está registrado pero no completó el
proceso».

### Guion C · El avatar dicta mientras el visitante habla

Estando en cualquier paso:

```bash
sim say  con  {"fields":{"company":"Patio Delivery","job_title":"Developer"}}
```

Los campos deben llenarse solos en el siguiente sondeo, **sin pisar** lo que se
esté escribiendo en ese momento en un campo con el foco puesto.

### Guion D · El visitante se va

```bash
sim leave
```

A los ~4,5 s (tres sondeos) la pantalla vuelve sola a la bienvenida. Un `leave`
seguido de un `detect` inmediato **no** debe cerrar nada: es la tolerancia al
parpadeo.

### Guion E · Camino manual

Sin ningún `detect`, deslizar el slider. Debe entrar al paso 1 y la persona
crearse recién al verificar. Después, un `sim detect` **no** debe robar la
sesión en curso.

### Guion F · Los tres modos

Cambiar `VITE_START_MODE` y reiniciar `npm run dev`:

- `polling` → no hay slider; solo entra por `sim detect`.
- `slider` → no mira al tótem; `sim detect` no hace nada.
- `hybrid` → las dos cosas.

### Comandos de simulación

```bash
B=http://127.0.0.1:9099
T=ef17a152-86c6-43fe-b5d1-dba3959d7c0b
sim(){ curl -s -X POST "$B/__sim/$1" -H "Content-Type: application/json" -d "$2"; echo; }

sim detect "{\"totem\":\"$T\"}"
sim detect "{\"totem\":\"$T\",\"first_name\":\"Ana\",\"paternal_surname\":\"Perez\"}"
sim say    "{\"totem\":\"$T\",\"fields\":{\"company\":\"Patio Delivery\"}}"
sim photo  "{\"totem\":\"$T\"}"
sim leave  "{\"totem\":\"$T\"}"
curl -s "$B/__sim/state"
```

---

## Nivel 3 · Contra la central real

La colección de Postman contiene **exactamente** las llamadas que hace la
pantalla, en el orden del flujo, con aserciones sobre cada una.

```bash
# En Postman: importar la colección y el entorno, rellenar baseUrl y totemId.
# O desde la terminal:
npx newman run postman/teleinfo-onboarding.postman_collection.json \
              -e postman/central.postman_environment.json
```

| Archivo | Para qué |
| --- | --- |
| `postman/teleinfo-onboarding.postman_collection.json` | Las 18 peticiones con 30 aserciones |
| `postman/local.postman_environment.json` | Apunta a `npm run mock` |
| `postman/central.postman_environment.json` | Rellenar con la URL y el UUID reales |

Verificado contra la central de mentira: **18 peticiones, 30 aserciones, 0 fallos.**

### Qué mira, carpeta por carpeta

| Carpeta | Comprueba |
| --- | --- |
| 0 · Disponibilidad | `/health` responde y en menos de 2 s |
| 1 · Detección | `current-person` es público · `404` con tótem inexistente · **que el `totem_id` deba ser UUID y no el `code`** |
| 2 · Alta | `POST /api/persons` es público · `Idempotency-Key` inválida da `422` · no se puede crear sin apellido |
| 3 · Pasos | `PATCH` es público · `exclude_unset` no pisa lo anterior · teléfono con espacios da `422` · el string vacío borra |
| 4 · Fotos | Si siguen pidiendo sesión o ya las liberaron |
| 5 · Lectura | Lo mismo para `GET /api/persons/{id}` · que todo lo escrito siga ahí |

### Dos aserciones que son canarios

Las carpetas 4 y 5 aceptan `200` **o** `401` a propósito. Si algún día devuelven
`200` sin token, la consola de Newman lo dice:

```
¡Liberaron el listado de fotos! Se puede quitar el token del paso 4.
¡Liberaron GET /api/persons/{id}! Se puede sondear la persona propia sin token.
```

Cuando eso pase, el token deja de hacer falta del todo.

---

## Lista de aceptación

Antes de dar el flujo por bueno contra la central real:

- [ ] `/health` responde desde la máquina del kiosco.
- [ ] `newman run` pasa entero con el entorno `central`.
- [ ] El origen de la pantalla está en `ALLOWED_ORIGINS` (si no, la UI falla aunque Newman pase).
- [ ] El `totem_id` de la URL es el **UUID** de `totems.id`, no el `code`.
- [ ] `sim detect` equivalente real: el avatar asigna y la pantalla lo adopta en menos de 2 s.
- [ ] Los rellenos que usa el tótem para un desconocido están en `PLACEHOLDERS` (`contract.js`).
- [ ] Una persona creada por el slider queda con su `totem_id` si la central ya lo lee.
- [ ] Las tres fotos aparecen en el paso 4 y en el orden esperado.

## Lo que todavía no se puede probar

- **Que la central guarde el `totem_id` del alta.** Se envía; hoy lo descarta sin
  error. Hasta que lo lean, no hay forma de verificarlo desde aquí.
- **El orden real de las fotos.** Las repartimos por orden de llegada porque la
  central no las etiqueta por pose. Con fotos reales habrá que mirar si la
  primera es de verdad la frontal.
- **La impresión de la credencial.** No es nuestra.
