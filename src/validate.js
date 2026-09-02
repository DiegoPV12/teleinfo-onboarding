/**
 * Validación de los campos que la tienen. El backend valida por su cuenta;
 * esto solo evita que el visitante cierre un paso con un correo mal escrito.
 */
const RULES = {
  // Mismo patrón que valida la central sobre `email`.
  email: {
    test: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    message: 'Revise el correo: falta el @ o el dominio.'
  },
  // La central exige `phone_number` de 6 a 15 dígitos, sin espacios ni signos.
  telefono: {
    test: (v) => {
      const digits = v.replace(/^\+\d{1,4}/, '').replace(/\D/g, '');
      return digits.length >= 6 && digits.length <= 15;
    },
    message: 'El teléfono debe tener entre 6 y 15 dígitos.'
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
