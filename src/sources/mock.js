import { createTimers } from '../timers.js';

/** Guion de demostración: los datos llegan desordenados, como en el habla real. */
const SCRIPT = [
  { text: 'Hola, soy Diego Párraga.',      fields: { nombre: 'Diego', apellido: 'Párraga' }, wait: 1500 },
  { text: ' Trabajo en Patio Delivery',    fields: { empresa: 'Patio Delivery' },            wait: 1300 },
  { text: ' como Full Stack Developer.',   fields: { cargo: 'Full Stack Developer' },        wait: 1400 },
  { text: ' Mi correo es diego@patio.bo',  fields: { email: 'diego@patio.bo' },              wait: 1500 },
  { text: ' y el teléfono 700 12345.',     fields: { telefono: '700 12345' },                wait: 1300 }
];

export function createMockSource() {
  const timers = createTimers();

  return {
    start({ onTranscript, onField }) {
      timers.clear();
      let transcript = '';
      let delay = 0;

      SCRIPT.forEach((step) => {
        delay += step.wait;
        timers.after(() => {
          transcript += step.text;
          onTranscript(transcript);
          Object.entries(step.fields).forEach(([key, value], i) => {
            timers.after(() => onField(key, value), 260 + i * 220);
          });
        }, delay);
      });
    },
    stop() {
      timers.clear();
    }
  };
}
