# Teleinfo · Onboarding

Pantalla de registro para el avatar conversacional de la feria Teleinfo.

El visitante habla con el avatar en la pantalla vertical; esta segunda pantalla,
ubicada frente a él, lo guía y refleja los datos a medida que se reconocen.
Corre en un navegador a pantalla completa.

## Cómo funciona

Esta pantalla se ocupa **solo del formulario**. No sabe de detección, ni de
conversaciones, ni de reconocimiento facial: eso vive en el avatar y en la
central. Aquí se llena, se corrige y se guarda un registro de persona.

El backend es `rt-face-recognition` (la central). El ciclo es:

| Momento | Qué pasa |
| --- | --- |
| Slider | Abre el formulario. Nada más — no crea ningún registro |
| Paso 1 | Al verificar nace la persona: `POST /api/persons` con nombre y apellido |
| Escribir | `PATCH /api/persons/{id}` parcial, con debounce de ~400 ms |
| Verificar | `PATCH` con los campos del paso y se avanza al siguiente |
| Sondeo | `GET /api/persons/{id}` cada ~1,5 s, para reflejar lo que escriba el avatar |

La persona no puede nacer en blanco porque la central exige `first_name` y
`paternal_surname`. Por eso el alta espera al paso 1, y mientras tanto lo que se
teclea vive en el store: no se crean registros a medio nombre por cada tecla.

El `PATCH` es `exclude_unset`: solo viajan los campos del paso, lo demás queda
intacto. Un string vacío **borra** el dato, así que omitir y vaciar no son lo
mismo — ver [`src/api/contract.js`](src/api/contract.js).

El tótem se identifica en la URL de la pantalla: `?totem=<id>`, `/t/<id>` o
`/totem/<id>`. `VITE_TOTEM_ID` es solo el respaldo de desarrollo.

Autenticación: un token fijo en `Authorization: Bearer`, desde `VITE_API_TOKEN`.

### Los cuatro pasos

| Paso | Campos | En la central |
| --- | --- | --- |
| 1 · Identidad | Nombre · Apellido | `first_name` · `paternal_surname` |
| 2 · Trabajo | Cargo · Empresa | `job_title` · `company` — opcional, se puede omitir |
| 3 · Contacto | Teléfono · Email | `phone_prefix` + `phone_number` · `email` |
| 4 · Fotos | frontal · perfil izq. · perfil der. | `GET /api/persons/{id}/photos` |

El flujo es estricto: no se avanza hasta verificar el paso. **El avance es
local** — `persons` no tiene el concepto de "paso verificado".

El teléfono es el único campo que no va 1:1: la pantalla muestra uno solo y
`contract.js` lo parte en prefijo (`^\+[0-9]{1,4}$`) y número (`^[0-9]{6,15}$`,
sin espacios), que es lo que exige la central. El prefijo por defecto sale de
`VITE_PHONE_PREFIX`.

Las fotos las toma el avatar; aquí solo se guía la postura y se muestra lo que
va apareciendo. Como la central no las etiqueta por pose, se reparten por orden
de llegada (1ª frontal, 2ª izquierda, 3ª derecha) y las imágenes se traen como
blob porque el endpoint va autenticado.

No hay botón de cancelar: el registro se cancela cuando la persona sale del
campo de visión del avatar. Lo que sí hay es **volver atrás**, que reabre el
paso anterior y lo sostiene para que el sondeo no lo dé por cerrado.

## Idea de diseño

**El espectro de color no es decoración: son los seis datos del registro.**
Nombre azul, Apellido índigo, Empresa violeta, Cargo magenta, Teléfono naranja,
Email verde. El slider de bienvenida muestra el espectro completo, la barra de
progreso son seis segmentos que se encienden en su color, y cada campo del
formulario lleva el suyo en el subrayado.

El flujo es una guía, no una fila de pasos: el visitante dice todos sus datos de
una sola vez, en el orden que prefiera, y los campos se llenan desordenados.

## Requisitos

- Node.js 18 o superior

## Puesta en marcha

```bash
npm install
cp .env.example .env
npm run dev
```

No hay simulación ni barra de demostración: el flujo se recorre a mano, como
lo haría un visitante. Sin backend, use el slider de la bienvenida para entrar
y escriba los campos usted mismo (con `VITE_SHOW_SLIDER=false` no habría por
dónde empezar).

```bash
npm run build     # genera dist/
npm run preview   # sirve dist/ para probar antes de desplegar
```

## Variables de entorno

| Variable | Valores | Descripción |
| --- | --- | --- |
| `VITE_TRANSPORT` | `local` · `http` | Central en memoria o central real |
| `VITE_API_BASE` | URL | Base de la central |
| `VITE_API_TOKEN` | texto | Token fijo para `Authorization: Bearer` |
| `VITE_TOTEM_ID` | texto | Respaldo del tótem cuando no viene en la URL |
| `VITE_POLL_MS` | número | Intervalo de sondeo (por defecto 1500) |
| `VITE_EDIT_DEBOUNCE_MS` | número | Espera antes de enviar una edición manual |
| `VITE_CREATE_ON` | `start` · `verify` | Cuándo nace la persona en la central |
| `VITE_CREATE_PATH` | ruta | Endpoint de creación en blanco |
| `VITE_PHONE_PREFIX` | `+591` | Prefijo por defecto del teléfono |
| `VITE_SHOW_SLIDER` | `true` · `false` | Muestra el slider de respaldo en la bienvenida |

## Conectar la central

Ponga `VITE_TRANSPORT=http`, apunte `VITE_API_BASE` a la central y cargue
`VITE_API_TOKEN`. Se usan cuatro rutas:

| | |
| --- | --- |
| `POST /api/persons` | Alta al cerrar el paso 1 (multipart + `Idempotency-Key`) |
| `GET /api/persons/{id}` | Sondeo del registro |
| `PATCH /api/persons/{id}` | Escritura parcial de campos |
| `GET /api/persons/{id}/photos` | Las tres tomas |

**Todo lo que depende de la forma real del backend vive en
[`src/api/contract.js`](src/api/contract.js).** Traduce entre los campos de la
pantalla y el modelo `persons`; escenas, store y flujo no conocen ni un nombre
de campo del backend.

> El detalle completo —qué llamada hace cada paso, el mapeo de campos, las
> reglas del `PATCH` parcial, los errores y los pendientes— está en
> [`docs/integracion-central.md`](docs/integracion-central.md).
> Cómo probarlo, en [`docs/plan-de-pruebas.md`](docs/plan-de-pruebas.md).

### Probar la conexión

```bash
npm run check              # /health, solo lectura
npm run check -- --write   # alta + PATCH + relectura (deja una persona de prueba)
npm run check -- --person=<uuid>
```

Corre en Node, sin navegador, así que aísla los problemas de red y token de los
de CORS. Si `check` pasa pero la UI no, es CORS: la central debe listar el
origen exacto de esta pantalla en `ALLOWED_ORIGINS`.

### Puntos abiertos

1. **Las fotos no vienen etiquetadas por pose.** Se asignan por orden de llegada.
2. **`persons` no dice quién escribió cada campo**, así que la pantalla no
   puede distinguir el dato que dictó el avatar del que se escribió a mano.
3. Si más adelante existe un alta en blanco, mover el momento de creación es
   un cambio local a `session.js`.

### Desarrollo sin central

Con `VITE_TRANSPORT=local` corre [`src/api/local.js`](src/api/local.js): una
central en memoria que habla el mismo contrato —`PersonDetailResponse`, PATCH
parcial con `exclude_unset`, las mismas validaciones de teléfono y email— pero
**no simula nada**. Solo guarda lo que se escribe a mano.

Consecuencia: el paso 4 no se puede cerrar sin central, porque las fotos las
toma el avatar.

## Estructura

```
src/
├── main.js            Composición: sesión + escenas + router
├── config.js          Campos, textos, tiempos y configuración de la API
├── steps.js           Los cuatro pasos del registro
├── session.js         Máquina de sesión: crear persona, escribir, avanzar
├── store.js           Estado con revisión y procedencia por campo
├── poll.js            Bucle de sondeo con backoff
├── validate.js        Reglas de teléfono y correo (las de la central)
├── router.js          Transición entre escenas (la elige el estado)
├── api/
│   ├── contract.js    ⚠ Único punto que conoce la forma real del backend
│   ├── client.js      pull · createPerson · writeStep · writeFields
│   ├── http.js        Transporte real, token fijo
│   └── local.js       Central en memoria, sin simulación
├── scenes/            welcome · step · photos · done
├── ui/                typewriter · slider · stepbar · pose (guías de foto)
└── styles/            tokens · fonts · base · components · scenes
```

### Reconciliación

Sondeamos cada segundo y el visitante puede estar escribiendo en el mismo campo.
Las reglas viven en [`src/store.js`](src/store.js):

1. Campo en foco y modificado → el snapshot no lo pisa; el valor remoto queda
   retenido y se aplica al salir del foco si no hubo más cambios.
2. Escritura en vuelo → se ignoran las revisiones menores a la enviada.
3. Resto → gana el remoto, y la fila se anima para que se vea llegar el dato.

## Tipografía

La familia es **Neue Haas Grotesk Display Pro**, de licencia comercial. Al
adquirirla, copie los `.woff2` en `public/fonts/` y descomente los `@font-face`
de `src/styles/fonts.css`. Sin ella, la cascada cae en Helvetica Neue —
descendiente directa de Neue Haas — e Inter.

## Notas de kiosco

- Chrome a pantalla completa:
  `chrome --kiosk --incognito --disable-pinch --overscroll-history-navigation=0 http://localhost:4173`
- La vibración (`navigator.vibrate`) funciona en Chrome sobre Android. Safari en
  iOS y los navegadores de escritorio la ignoran sin error.
- Si el tótem deja de responder aparece un indicador discreto arriba a la
  derecha y el sondeo reintenta con backoff hasta 8 s.
- La interfaz no guarda nada en el navegador: el registro vive en memoria y se
  borra al volver a la bienvenida.
- `prefers-reduced-motion` desactiva las animaciones y muestra los textos completos.
