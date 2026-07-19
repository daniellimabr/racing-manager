import type { TrackPoint } from '../core/types.js';

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Converte um ponto normalizado (0..1) do traçado em pixel, ajustado (fit, sem distorcer) dentro de um retângulo da tela. */
export function normalizedToScreen(p: TrackPoint, rect: ScreenRect, padding = 20): { x: number; y: number } {
  const size = Math.min(rect.width, rect.height) - padding * 2;
  const offsetX = rect.x + (rect.width - size) / 2;
  const offsetY = rect.y + (rect.height - size) / 2;
  return { x: offsetX + p.x * size, y: offsetY + p.y * size };
}

/** Fração (0..1) ao longo do traçado correspondente a um índice de `path`. */
export function pathIndexToT(pathIndex: number, pathLength: number): number {
  return pathIndex / pathLength;
}

/** Ponto interpolado no traçado (loop fechado) para uma fração t (0..1, com wrap). */
export function pointAtT(path: TrackPoint[], t: number): TrackPoint {
  const n = path.length;
  const wrapped = ((t % 1) + 1) % 1;
  const scaled = wrapped * n;
  const i0 = Math.floor(scaled) % n;
  const i1 = (i0 + 1) % n;
  const frac = scaled - Math.floor(scaled);
  const p0 = path[i0];
  const p1 = path[i1];
  return { x: p0.x + (p1.x - p0.x) * frac, y: p0.y + (p1.y - p0.y) * frac };
}
