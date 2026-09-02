# Integración con la central

> **Backend:** `patio-delivery/rt-face-recognition` — la central de reconocimiento facial.
> **Fuente del contrato:** `src/api.py` (`PersonDetailResponse`, `PersonUpdateRequest`, `PersonPhotoListResponse`).
> **Todo lo que traduce entre esta pantalla y la central vive en [`src/api/contract.js`](../src/api/contract.js).**

---

## 1. Qué hace esta pantalla y qué no

Esta pantalla es **solo el formulario**. Llena, corrige y guarda un registro en
la tabla `persons`.

| Sí | No |
| --- | --- |
| Escribir y corregir los datos de la persona | Detectar a nadie |
| Crear la persona y actualizarla | Conversar con el avatar |
| Mostrar las fotos que ya existen | Tomar las fotos |
| Reflejar lo que el avatar escriba en el mismo registro | Reconocimiento facial |
| | Imprimir la credencial |

Consecuencia práctica: **las llamadas son CRUD sobre `/api/persons`**, más una
sola lectura a `/api/totems/{id}/current-person` para saber quién está delante.
No se tocan `visitor-encounters`, `experience-sessions`, `recognize` ni
`/ws/totems`.

---

## 2. Configuración

```dotenv
VITE_TRANSPORT=http                       # local = central en memoria
VITE_API_BASE=https://central.example.com
VITE_API_TOKEN=<token que no expira>
VITE_START_MODE=hybrid                    # polling · slider · hybrid
VITE_POLL_MS=1500
VITE_EDIT_DEBOUNCE_MS=400
VITE_PHONE_PREFIX=+591
```

**Autenticación.** Desde el commit `8fb6661` de la central, casi todo lo que
usamos es público. El token es **opcional** y solo hace falta para el paso 4:

| Llamada | Autenticación |
| --- | --- |
| `GET /api/totems/{id}/current-person` | pública |
| `POST /api/persons` | pública |
| `PATCH /api/persons/{id}` | pública |
| `GET /api/persons/{id}` | **sesión de panel** |
| `GET /api/persons/{id}/photos` | **sesión de panel** |
| `GET /api/persons/{id}/photos/{sid}/image` | **sesión de panel** |

Cuando hay token va como `Authorization: Bearer <VITE_API_TOKEN>` en cada
petición; sin login, sin CSRF, sin refresh.

Sin token la pantalla funciona igual salvo en dos puntos:

- **El paso 4 no puede leer las fotos.** Se ve la guía de postura, nunca las
  tomas. Es el único agujero real.
- **Una sesión empezada por el slider no se relee.** `GET /api/persons/{id}`
  pide sesión, así que no se sondea; da igual, porque un registro que el tótem
  no conoce solo lo escribimos nosotros. La sesión **adoptada** sí se relee
  entera, porque `current-person` devuelve el `PersonDetailResponse` completo
  y es pública.

**Identidad del tótem.** Llega en la URL de la pantalla, no en la configuración:

```
https://onboarding.example.com/?totem=<id>
https://onboarding.example.com/t/<id>
https://onboarding.example.com/totem/<id>
```

`VITE_TOTEM_ID` queda solo como respaldo de desarrollo.

El `totem_id` **ya viaja en el alta**, como un campo más del multipart de
`POST /api/persons`. Mientras la central no lo lea, lo descarta sin error:
ese endpoint declara sus campos con `Form(...)` y FastAPI ignora los que no
conoce. El día que lo guarden, ya está llegando — no hay nada que cambiar de
este lado.

Se manda solo en el alta, no en cada `PATCH`: es de dónde salió el registro, no
un dato que cambie. El nombre del campo (`TOTEM_FIELD` en `contract.js`) es el
único supuesto; si terminan llamándolo distinto, es una línea.

---

## 3. Cómo empieza una sesión

Hay **dos caminos de entrada** y `VITE_START_MODE` decide cuáles están activos.
La diferencia entre ellos es de fondo: uno **adopta** una persona que ya existe,
el otro la **crea**.

| Modo | Sondea el tótem | Slider | Entrada |
| --- | :---: | :---: | --- |
| `polling` | sí | no | Solo por detección |
| `slider` | no | sí | Solo a mano |
| `hybrid` | sí | sí | Lo que ocurra primero |

### 3.A · Detectada — **ADOPTAR**

```http
GET /api/totems/{totem_id}/current-person
```

Sin headers: **este endpoint no pide autenticación**, es una decisión explícita
del backend. Se sondea desde la bienvenida al mismo ritmo que el resto.

`404` significa «ahora no hay nadie» y cubre tres causas que el cliente no puede
distinguir —el tótem no existe, no tiene persona asignada, o apunta a una
persona borrada. Para esta pantalla las tres son lo mismo.

`200` devuelve el mismo `PersonDetailResponse` de `GET /api/persons/{id}`. En ese
momento la pantalla **adopta** ese `person_id`:

- **No se crea nada.** El tótem ya creó o resolvió la fila; `POST /api/persons`
  no se usa en este camino.
- El formulario aparece **precargado** con lo que la central tenga.
- Da igual si es un visitante conocido con todos sus datos o una fila recién
  hecha para un desconocido: se tratan igual.

> **Rellenos de persona desconocida.** `persons` exige `first_name` y
> `paternal_surname`, así que una persona recién detectada no puede nacer vacía:
> llega con algún marcador («Desconocido», «Sin apellido»…). Mostrarlo tal cual
> obligaría al visitante a borrarlo antes de escribir, así que esos valores se
> leen como **campo vacío** — ver `PLACEHOLDERS` en `contract.js`. Los valores
> exactos dependen de lo que use el backend: **confirmar**.

Mientras la sesión está adoptada, el mismo sondeo sirve de dos cosas: refleja lo
que el avatar escriba y avisa cuándo la persona se fue.

- **Se fue** → tres `404` seguidos (~4,5 s) y la pantalla vuelve a la bienvenida.
  Uno suelto no cuenta: un parpadeo del seguimiento no debe tirar el formulario.
- **Llegó otra** → si el `id` cambia, se reinicia el flujo con la nueva persona.

### 3.B · Slider — **CREAR**

Abre el formulario y nada más. **No crea ningún registro todavía.**

> La persona no puede nacer en blanco: la central exige `first_name` y
> `paternal_surname`. Por eso el alta espera al paso 1 y lo que se teclea antes
> vive en memoria. Así no se generan registros a medio nombre por cada tecla.

Una sesión empezada a mano **no vive en el tótem**, así que a partir del alta el
sondeo pasa a `GET /api/persons/{id}`. Si siguiera preguntando por
`current-person` recibiría `404` para siempre y se cerraría sola. Por lo mismo,
en modo `hybrid` una detección posterior **no roba** una sesión ya empezada a
mano.

---

---

## 4. El ciclo del formulario

### Paso 1 · Identidad

**Si la persona fue adoptada**, este paso no crea nada: es un `PATCH` como los
demás, con `first_name` y `paternal_surname`.

**Si se entró por el slider**, aquí nace la persona. Se teclea `Nombre` y
`Apellido`, nada viaja todavía, y al pulsar **Verificar**:

```http
POST /api/persons HTTP/1.1
Authorization: Bearer <token>
Idempotency-Key: 72249dc5-b8be-46ab-96cf-2600861b4c2b
Content-Type: multipart/form-data; boundary=----...

category=registered
first_name=Diego
paternal_surname=Párraga
totem_id=totem-feria-01
```

```json
201 Created
{
  "person_id": "7e0f2890-f65c-431f-9234-5a27bd62ed67",
  "display_name": "Diego Párraga",
  "category": "registered",
  "samples_accepted": 0,
  "processing_status": "completed"
}
```

A partir de aquí se guarda el `person_id` y arranca el sondeo.

> Si el visitante ya había escrito datos de otros pasos (porque el avatar los
> dictó), el alta los incluye en el mismo multipart en vez de dejarlos para un
> `PATCH` posterior.

**`Idempotency-Key` debe ser un UUID v4 real.** Un valor como `idem-${Date.now()}`
devuelve `422`. La pantalla lo genera con `crypto.randomUUID` y, cuando no existe
—servida por `http://` sobre una IP de red no hay contexto seguro— con un
generador propio sobre `getRandomValues`.

### Paso 2 · Trabajo → **UPDATE**

```http
PATCH /api/persons/7e0f2890-f65c-431f-9234-5a27bd62ed67 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{ "job_title": "Full Stack Developer", "company": "Patio Delivery" }
```

```json
200 OK
{ "id": "7e0f...", "first_name": "Diego", "job_title": "Full Stack Developer",
  "company": "Patio Delivery", "updated_at": "2026-09-02T18:04:11Z", ... }
```

Devuelve el `PersonDetailResponse` completo. Solo viajan los campos del paso: el
resto queda intacto porque el endpoint usa `exclude_unset`.

Este paso es **opcional**. Con «Prefiero omitir estos datos» se envía el mismo
`PATCH` con ambos vacíos, lo que en la central equivale a `null`.

### Paso 3 · Contacto → **UPDATE**

Aquí está la única traducción no trivial. La pantalla muestra **un** campo de
teléfono; la central quiere **dos**:

```
"700 12345"   →   { "phone_prefix": "+591", "phone_number": "70012345" }
"+54 9 11 1234 5678"  →  { "phone_prefix": "+54", "phone_number": "91112345678" }
```

Si el visitante escribe su propio `+xx` se respeta; si no, se usa
`VITE_PHONE_PREFIX`. El número se limpia de espacios, guiones y paréntesis
porque `phone_number` es `^[0-9]{6,15}$` y cualquier otra cosa da `422`.

```http
PATCH /api/persons/{id}
Content-Type: application/json

{ "phone_prefix": "+591", "phone_number": "70012345", "email": "diego@patio.bo" }
```

### Paso 4 · Fotos → **READ**

Las fotos las toma el avatar. Esta pantalla solo guía la postura y muestra lo
que va apareciendo. Mientras se está en este paso, cada tick del sondeo agrega:

```http
GET /api/persons/{id}/photos
```

```json
200 OK
{
  "items": [
    { "id": "a1b2...", "person_id": "7e0f...", "is_active": true,
      "processing_status": "pending", "detection_score": 0.94,
      "source": "totem_capture", "created_at": "2026-09-02T18:06:02Z" }
  ],
  "total": 1
}
```

Cada imagen se trae aparte, porque el endpoint va autenticado y un `<img src>`
pelado no puede mandar el header:

```http
GET /api/persons/{id}/photos/{sample_id}/image
→ bytes → URL.createObjectURL(blob)
```

Las object URL se cachean por `sample_id` y se liberan al salir de la escena.

> **Supuesto:** la central no etiqueta las fotos por pose. Se reparten por orden
> de llegada — 1ª frontal, 2ª izquierda, 3ª derecha.

### Fin

Pantalla de éxito y vuelta a la bienvenida. La impresión de la credencial no es
nuestra. No se envía nada.

---

## 5. Escritura mientras se teclea

Además del `PATCH` al verificar, cada edición manual se guarda sola:

```
tecla → store.edit() → debounce 400 ms → PATCH con solo los campos tocados
```

Si varios campos cambian dentro de la ventana, salen en **un solo** `PATCH`.
Mientras no exista la persona (antes del paso 1) las ediciones se acumulan en el
store y no se pierde nada.

Si el `PATCH` falla, el campo vuelve a marcarse como pendiente y se reintenta en
la siguiente ventana.

---

## 6. Sondeo y reconciliación

```http
GET /api/totems/{totem_id}/current-person     cada 1500 ms  (persona adoptada)
GET /api/persons/{id}                         cada 1500 ms  (persona propia)
```

Cuál de los dos se pide depende de dónde vino la persona — ver §3. Sirve para
reflejar lo que el avatar escriba sobre el mismo registro, y en el caso adoptado
también para saber cuándo se fue. Se encadena
con `setTimeout` tras cada respuesta —nunca `setInterval`, que solaparía
peticiones— y con backoff 1 s → 2 s → 4 s → 8 s cuando la central no responde.
Sin `person_id` no se sondea nada.

El problema real es que sondeamos cada segundo y medio mientras el visitante
puede estar escribiendo en el mismo campo. Las reglas están en
[`src/store.js`](../src/store.js):

| Situación | Qué gana |
| --- | --- |
| Campo con el foco puesto y modificado | **Lo local.** Lo remoto se retiene y se aplica al salir del foco si no hubo más cambios |
| `PATCH` en vuelo | **Lo local.** Se ignoran respuestas cuyo `updated_at` sea anterior al que enviamos |
| Cualquier otro caso | **Lo remoto**, y la fila se anima para que se vea llegar el dato |

Como `persons` tiene un solo `updated_at` y no revisión por campo, se usa ese
timestamp como revisión común. Funciona igual para descartar respuestas viejas:
cualquier escritura nuestra deja el reloj del servidor por delante.

---

## 7. Mapeo de campos

| Pantalla | Central | Paso | Notas |
| --- | --- | :---: | --- |
| — | `totem_id` | 1 | Sale de la URL; solo en el alta |
| Nombre | `first_name` | 1 | Obligatorio para el alta |
| Apellido | `paternal_surname` | 1 | Obligatorio para el alta |
| Cargo | `job_title` | 2 | Opcional |
| Empresa | `company` | 2 | Opcional |
| Teléfono | `phone_prefix` + `phone_number` | 3 | Se parte en `contract.js` |
| Email | `email` | 3 | |

Campos de `persons` que esta pantalla **no** toca: `maternal_surname`,
`description`, `category` (siempre `registered`), `consent_at`,
`consent_reference`, `is_active`.

---

## 8. Reglas que importan

**Omitir ≠ vaciar.** `PATCH` usa `exclude_unset`: lo que no va en el cuerpo no se
toca, pero un string vacío se normaliza a `null` y **borra** el dato. Por eso
solo se envían los campos del paso que se está cerrando.

**La validación corre sobre el objeto resultante**, no sobre lo enviado. Un
`PATCH` que dejaría `first_name` vacío devuelve `422` aunque no toque ese campo.

**Las validaciones locales son las mismas regex de la central**, para que el
`422` no llegue nunca por algo que se podía ver antes de enviar
([`src/validate.js`](../src/validate.js)):

| Campo | Regla |
| --- | --- |
| `email` | `^[^@\s]+@[^@\s]+\.[^@\s]+$` |
| `phone_prefix` | `^\+[0-9]{1,4}$` |
| `phone_number` | `^[0-9]{6,15}$` |

**El avance entre pasos es local.** `persons` no tiene el concepto de «paso
verificado», así que el sondeo no puede pisarlo. Volver atrás reabre el paso y lo
sostiene abierto hasta que se vuelva a verificar.

---

## 9. Errores

| Código | Cuándo | Qué hace la pantalla |
| --- | --- | --- |
| `401` | Token ausente o inválido | Indicador de reconexión; sigue reintentando |
| `404` | La persona ya no existe, o el tótem no tiene a nadie | Con persona adoptada, tres seguidos cierran la sesión; con persona propia, reinicia |
| `409` | Conflicto de `Idempotency-Key` | Se reporta; no se reintenta con la misma clave |
| `422` | Valor rechazado (teléfono, email, nombre vacío) | Se marca el campo y no se avanza |
| `429` | Rate limit | Backoff del sondeo |
| Red caída | Sin respuesta | Indicador arriba a la derecha y backoff hasta 8 s |

---

## 10. Dónde está cada cosa

```
src/
├── api/
│   ├── contract.js   ⚠ ÚNICO archivo que conoce el modelo `persons`
│   ├── client.js       pull · createPerson · writeStep · writeFields
│   ├── http.js         fetch, token, UUID v4, imágenes como blob
│   └── local.js        Central en memoria con el mismo contrato
├── session.js        Cuándo se crea, cuándo se escribe, cuándo se avanza
├── poll.js           Bucle de sondeo con backoff
├── store.js          Reconciliación entre lo tecleado y lo sondeado
└── validate.js       Las regex de la central, del lado del cliente
```

Escenas, store y flujo **no conocen ni un nombre de campo del backend**. Cuando
el contrato cambie, se ajusta `contract.js` y nada más.

---

## 11. Observaciones y pendientes

### CORS — lo primero que va a fallar

La central valida `ALLOWED_ORIGINS` contra el **origen exacto**, sin comodines, y
en producción exige `https://`. Hay que agregar allí:

```dotenv
ALLOWED_ORIGINS=http://localhost:5173,https://<origen-real-del-kiosco>
```

`allow_credentials = true` impide usar `*`. Los headers que mandamos
(`Authorization`, `Content-Type`, `Idempotency-Key`) ya están en la lista
permitida del `CORSMiddleware`, así que el problema será el origen, no los
headers.

Buena noticia: `compose.local.yaml` de la central **ya trae**
`ALLOWED_ORIGINS: http://localhost:5173,...`, así que quien la levante en local
tiene nuestro puerto de desarrollo permitido de entrada.

Para separar un problema de CORS de uno de red o token:

```bash
npm run check              # /health, solo lectura
npm run check -- --write   # alta + PATCH + relectura
```

Corre en Node, **sin navegador**, así que no pasa por CORS. Si `check` pasa y la
UI no, es CORS.

### Probar sin central

```bash
npm run test:http     # el transporte HTTP real contra una central de mentira
npm run test:modes    # los tres modos de arranque
```

`test:modes` cubre la adopción de una persona detectada, los rellenos del
desconocido leídos como vacío, la tolerancia a un `404` aislado, el relevo por
otra persona y el camino del slider. Cada escenario corre en su propio proceso
porque `VITE_START_MODE` se lee una sola vez.

```bash
npm run test:http
```

Levanta una central de mentira ([`scripts/fake-central.mjs`](../scripts/fake-central.mjs))
que habla el contrato documentado y corre el transporte HTTP **real** contra
ella. Valida lo que la central en memoria no puede: los headers, el multipart
del alta, el `Idempotency-Key`, los cuerpos del `PATCH`, la propagación de `422`
y `404`, y el ida y vuelta del teléfono partido. No necesita credenciales.

### Lo que falta para probar contra la central real

1. **`VITE_API_BASE`** — la URL donde responde la central. **No sirve una
   `DATABASE_URL`**: el navegador no habla PostgreSQL y este cliente solo hace
   HTTP contra `/api/persons`.
2. **`VITE_API_TOKEN`** — el token que no expira. Debe poder llamar a
   `POST /api/persons` y `PATCH /api/persons/{id}`, que en la documentación
   figuran como rutas de **panel administrativo**, no de tótem.
3. **`ALLOWED_ORIGINS`** con el origen de esta pantalla.

Levantar la central en local es posible pero caro: `src/api.py` instancia
`FaceEngine` al construir la app, así que arranca el motor facial completo
(ONNX Runtime + InsightFace) aunque nunca toquemos una ruta de reconocimiento.
Además haría falta `AUTH_PEPPER`, aplicar migraciones y crear un administrador
con `scripts.bootstrap_admin` para obtener un token de sesión. Contra una base
compartida, tanto las migraciones como el alta de administrador escriben en el
entorno de todos.

### Supuestos que conviene confirmar

- **Las fotos se asignan por orden de llegada.** Si la central puede etiquetar la
  pose, mejor: hoy no hay forma de saber cuál es la frontal.
- **No se distingue quién escribió cada campo.** `persons` no guarda origen, así
  que la pantalla no puede resaltar el dato que dictó el avatar frente al escrito
  a mano. La animación de llegada está lista para cuando exista ese dato.
- **El nombre del campo del tótem.** Se envía como `totem_id` en el alta. Si en
  la central termina llamándose distinto, hay que ajustar `TOTEM_FIELD` en
  `contract.js`.
- **Los rellenos de la persona desconocida.** Se leen como campo vacío una lista
  de marcadores («Desconocido», «Sin apellido», «N/A»…). Hay que saber cuáles
  usa el tótem de verdad, o la pantalla los mostrará como si fueran el nombre.
- **Qué pasa si el visitante se va a medias.** Hoy el `404` sostenido cierra el
  flujo y lo escrito queda guardado en `persons`. Si el tótem debe liberar
  `person_id` de otra forma, conviene saberlo.
- **`category` se envía siempre como `registered`.** Si algún visitante debe ser
  `vip`, falta decidir quién y cómo lo marca.

### Deuda conocida

- El paso 4 no se puede cerrar sin central, porque las fotos las toma el avatar.
  Con `VITE_TRANSPORT=local` el flujo llega hasta ahí y se queda.
- No hay reintento con `Idempotency-Key` persistida: si el alta falla por red
  justo después de que la central la aceptó, un segundo intento genera una clave
  nueva y podría duplicar la persona. Poco probable en el kiosco, pero está.
