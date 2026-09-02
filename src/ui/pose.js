/**
 * Guías de postura para las tres tomas.
 *
 * La silueta queda entera dentro de los marcadores de cámara —nada de hombros
 * cortados por el borde— y el lado se indica con una flecha simple a media
 * altura de la figura. La toma frontal no lleva flecha.
 *
 * Sistema de coordenadas (viewBox 120 × 150):
 *   marco útil   x 10..110 · y 13..139
 *   figura       x 30..90  · y 30..128
 */
const DIRS = { front: 0, left: -1, right: 1 };

const FRAME = `
  <path d="M10 30V18a5 5 0 0 1 5-5h13"/>
  <path d="M110 30V18a5 5 0 0 0-5-5H92"/>
  <path d="M10 122v12a5 5 0 0 0 5 5h13"/>
  <path d="M110 122v12a5 5 0 0 1-5 5H92"/>`;

/** Cabeza y busto cerrado: la figura no toca ningún marcador. */
const FIGURE = `
  <ellipse cx="60" cy="50" rx="17" ry="20"/>
  <path d="M30 128c0-31 13.4-56 30-56s30 25 30 56z"/>`;

/** Flecha recta al costado, centrada sobre la altura de la figura. */
function arrow(dir) {
  if (!dir) return '';
  const y = 79;
  const from = 60 + dir * 28;
  const to = 60 + dir * 46;
  const tip = to - dir * 8;
  return `
    <g class="turn" stroke-width="2">
      <path d="M${from} ${y}H${to}"/>
      <path d="M${tip} ${y - 6} L${to} ${y} L${tip} ${y + 6}"/>
    </g>`;
}

export function poseGuide(shot) {
  return `
  <svg viewBox="0 0 120 150" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true">
    <g class="frame" opacity=".4">${FRAME}</g>
    <g class="body">${FIGURE}</g>
    ${arrow(DIRS[shot] ?? 0)}
  </svg>`;
}
