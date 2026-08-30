# Teleinfo · Onboarding

Pantalla de registro para el avatar conversacional de la feria Teleinfo.

El visitante habla con el avatar en la pantalla vertical; esta segunda pantalla,
ubicada frente a él, lo guía y refleja los datos a medida que se reconocen.
Corre en un navegador a pantalla completa.

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

En modo desarrollo aparece una barra de control abajo a la derecha y quedan
activos los atajos: `←` `→` para navegar, `R` para reiniciar y `H` para ocultar
la barra. Nada de esto se incluye en el build de producción.

```bash
npm run build     # genera dist/
npm run preview   # sirve dist/ para probar antes de desplegar
```

## Variables de entorno

| Variable | Valores | Descripción |
| --- | --- | --- |
| `VITE_SOURCE` | `mock` · `ws` | De dónde llegan los datos reconocidos |
| `VITE_AVATAR_WS_URL` | URL | WebSocket del backend del avatar |
| `VITE_IDLE_RESET_MS` | número | Espera antes de volver solo a la bienvenida |

## Conectar el avatar

La UI no reconoce voz: solo refleja lo que publica el backend. Con
`VITE_SOURCE=ws` se conecta al WebSocket y espera estos mensajes JSON:

```json
{ "type": "transcript", "text": "Hola, soy Diego Párraga" }
{ "type": "field", "key": "empresa", "value": "Patio Delivery", "confidence": 0.94 }
{ "type": "reset" }
```

Las claves válidas de `field` son `nombre`, `apellido`, `empresa`, `cargo`,
`telefono` y `email`. Para agregar o quitar campos alcanza con editar
`src/config.js`: la guía, la grilla, el progreso y el formulario se regeneran solos.

Para escribir otra fuente (HTTP polling, SSE, `postMessage` desde la app del
avatar) basta con crear un módulo en `src/sources/` que exponga
`start({ onTranscript, onField, onReset })` y `stop()`, y registrarlo en
`src/sources/index.js`.

## Estructura

```
src/
├── main.js            Composición: fuente + escenas + router
├── config.js          Campos, frase modelo, textos y tiempos
├── store.js           Estado del registro, observable
├── router.js          Transición entre escenas
├── haptics.js         Patrones de vibración
├── timers.js          Timers cancelables por escena
├── scenes/            welcome · guide · capture · confirm · done
├── ui/                typewriter · slider
├── sources/           mock · ws
└── styles/            tokens · fonts · base · components · scenes
```

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
- La interfaz no guarda nada en el navegador: el registro vive en memoria y se
  borra al volver a la bienvenida.
- `prefers-reduced-motion` desactiva las animaciones y muestra los textos completos.
