import { WS_URL } from '../config.js';

/**
 * Fuente real: escucha lo que publica el backend del avatar.
 *
 * Contrato de mensajes (JSON):
 *   { "type": "transcript", "text": "Hola, soy..." }
 *   { "type": "field", "key": "empresa", "value": "Patio Delivery", "confidence": 0.94 }
 *   { "type": "reset" }
 *
 * El backend es la única fuente de verdad del reconocimiento; esta pantalla
 * solo refleja e invita a corregir.
 */
export function createWsSource(url = WS_URL) {
  let socket = null;
  let retry = null;

  return {
    start({ onTranscript, onField, onReset }) {
      if (!url) {
        console.warn('[teleinfo] VITE_AVATAR_WS_URL no está configurada');
        return;
      }

      const connect = () => {
        socket = new WebSocket(url);

        socket.addEventListener('message', (event) => {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          if (msg.type === 'transcript') onTranscript(msg.text ?? '');
          else if (msg.type === 'field') onField(msg.key, msg.value, msg.confidence);
          else if (msg.type === 'reset') onReset?.();
        });

        socket.addEventListener('close', () => {
          retry = setTimeout(connect, 2000);
        });

        socket.addEventListener('error', () => socket.close());
      };

      connect();
    },
    stop() {
      clearTimeout(retry);
      socket?.close();
      socket = null;
    }
  };
}
