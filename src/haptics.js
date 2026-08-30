/**
 * Vibración táctil. 
 */
const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const HAPTICS = {
  touch: 8,
  detent: 3,
  cancel: 4,
  field: 5,
  complete: [16, 44, 26],
  confirm: [12, 30, 18],
  tap: 6
};

export function buzz(pattern) {
  if (!supported) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
