import { FIELDS } from './config.js';

const values = {};
const listeners = new Set();

function emit(event) {
  listeners.forEach((fn) => fn(event, { ...values }));
}

export const store = {
  get(key) {
    return values[key] ?? '';
  },
  all() {
    return { ...values };
  },
  set(key, value) {
    const clean = String(value ?? '').trim();
    if (values[key] === clean) return;
    if (clean) values[key] = clean;
    else delete values[key];
    emit({ type: 'field', key, value: clean });
    if (this.isComplete()) emit({ type: 'complete' });
  },
  filled() {
    return FIELDS.filter((f) => values[f.key]).length;
  },
  isComplete() {
    return FIELDS.every((f) => values[f.key]);
  },
  reset() {
    Object.keys(values).forEach((k) => delete values[k]);
    emit({ type: 'reset' });
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
