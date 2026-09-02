# Teleinfo · Onboarding

Pantalla de registro para el avatar conversacional de la feria Teleinfo.

El visitante habla con el avatar en la pantalla vertical; esta segunda pantalla,
ubicada frente a él, lo guía y refleja los datos a medida que se reconocen.
Corre en un navegador a pantalla completa.

## Cómo funciona

El backend es la única fuente de verdad. Esta pantalla **sondea** el estado del
tótem (`GET /api/{totem}/state`, ~1 s, con `If-None-Match`) y refleja lo que el
avatar va escribiendo. El flujo es bidireccional: el visitante puede dictar cada
dato o corregirlo aquí a mano, y ambas cosas terminan en el mismo `draft`.

Una **sesión** empieza cuando el avatar detecta a alguien delante. La pantalla no
decide el paso: lo deriva del estado. Lo único que envía son intenciones —
editar un campo, verificar un paso, repetir una foto, cancelar.

Por si la detección falla, la bienvenida puede mostrar un **slider de respaldo**:
el visitante entra por su cuenta y la primera cosa que escriba abre el borrador
en el tótem. Se enciende y apaga con `VITE_SHOW_SLIDER`; no hay espera, si está
en `true` se muestra con el saludo.

### Los cuatro pasos

| Paso | Campos | Nota |
| --- | --- | --- |
| 1 · Identidad | Nombre · Apellido | |
| 2 · Trabajo | Cargo · Empresa | opcional, se puede omitir |
| 3 · Contacto | Teléfono · Email | con validación antes de verificar |
| 4 · Fotos | frontal · perfil izq. · perfil der. | guía de postura en SVG |

El flujo es estricto: no se avanza hasta que el paso queda verificado. Si el
visitante se va a medias, el backend conserva lo escrito y devuelve todos los
pasos a `verified: false`.

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
| `VITE_TRANSPORT` | `local` · `http` | Borrador en memoria o servicio real |
| `VITE_API_BASE` | URL | Base del servicio del tótem |
| `VITE_TOTEM_ID` | texto | Identificador del tótem en la ruta |
| `VITE_POLL_MS` | número | Intervalo de sondeo (por defecto 1000) |
| `VITE_EDIT_DEBOUNCE_MS` | número | Espera antes de enviar una edición manual |
| `VITE_VERIFY_MODE` | `command` · `fields` | Cómo se avisa que un paso quedó verificado |
| `VITE_SHOW_SLIDER` | `true` · `false` | Muestra el slider de respaldo en la bienvenida |

## Conectar el tótem real

Ponga `VITE_TRANSPORT=http` y apunte `VITE_API_BASE` / `VITE_TOTEM_ID` al
servicio. Se usan tres endpoints:

| | |
| --- | --- |
| `GET /api/{totem}/state` | sondeo del draft (204 sin sesión · 304 sin cambios) |
| `POST /api/{totem}/fields` | ediciones manuales, con `expected_field_revision` |
| `POST /api/{totem}/command` | verificar paso, repetir foto, cancelar, confirmar |

**Todo lo que depende de la forma real del backend vive en
[`src/api/contract.js`](src/api/contract.js).** Ese archivo lee el estado de
forma tolerante (acepta claves en español o inglés, campos como string suelto o
como objeto con metadatos) y lo normaliza al modelo interno. Cuando el contrato
quede cerrado se ajusta ahí y nada más.

### Puntos abiertos con backend

1. Forma exacta de `state` (el PDF lo documenta como `{ ... }`).
2. Idioma canónico de las claves de campo.
3. Cómo llegan las fotos: URL, id de asset o data URL.
4. Cómo se señaliza una sesión *terminada* frente a una *no iniciada* (ambas
   parecen 204).
5. Qué representa `registration_ticket_choice` en este flujo.
6. **Cómo abre sesión el slider de respaldo.** No hay endpoint para iniciarla,
   así que hoy la pantalla se adelanta y el borrador nace con la primera
   edición. Si el backend necesita un aviso explícito, va en `contract.js`.

Mientras tanto, `VITE_VERIFY_MODE` permite cerrar un paso por comando
(`registration_data_confirmed` + `target`) o por un pseudo-campo
`<paso>_verified`, sin tocar código.

### Desarrollo sin backend

Con `VITE_TRANSPORT=local` corre [`src/api/local.js`](src/api/local.js): un tótem
en memoria que respeta el mismo contrato — ETag, 204/304/409/422, revisiones por
campo e idempotencia por `command_id` — pero **no simula nada**. No detecta, no
dicta datos y no toma fotos: el borrador se abre con la primera edición y solo
guarda lo que se escriba a mano.

Consecuencia: el paso 4 no se puede cerrar sin backend, porque las fotos las
toma el tótem. La guía de postura sí se ve; el estado con foto, no.

## Estructura

```
src/
├── main.js            Composición: sesión + escenas + router
├── config.js          Campos, textos, tiempos y configuración de la API
├── steps.js           Los cuatro pasos del registro
├── session.js         Máquina de sesión: sondeo + estado + comandos
├── store.js           Estado con revisión y procedencia por campo
├── poll.js            Bucle de sondeo con ETag y backoff
├── validate.js        Reglas de teléfono y correo
├── router.js          Transición entre escenas (la elige el estado)
├── api/
│   ├── contract.js    ⚠ Único punto que conoce la forma real del backend
│   ├── client.js      pull · sendFields · sendCommand · verifyStep
│   ├── http.js        Transporte real
│   └── local.js       Borrador en memoria, sin simulación
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
