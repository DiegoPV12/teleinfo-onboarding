/**
 * Validación de los campos que la tienen. El backend valida por su cuenta;
 * esto solo evita que el visitante cierre un paso con un correo mal escrito.
 */
const RULES = {
  email: {
    test: (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v),
    message: 'Revise el correo: falta el @ o el dominio.'
  },
  telefono: {
    test: (v) => (v.match(/\d/g) ?? []).length >= 7,
    message: 'El teléfono parece incompleto.'
  }
};

/** Devuelve el mensaje de error, o null si el valor sirve. */
export function fieldError(key, value) {
  const v = String(value ?? '').trim();
  if (!v) return null;                       // vacío no es inválido: es "falta"
  const rule = RULES[key];
  if (!rule) return null;
  return rule.test(v) ? null : rule.message;
}

export const hasRule = (key) => Boolean(RULES[key]);
