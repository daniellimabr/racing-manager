import type { Tier } from './types.js';
import { ZONE_BASE_HALVES, MAX_SCALE, OVERTAKE_GAP_THRESHOLD } from './constants.js';

export interface ZoneHalves {
  purple: number;
  green: number;
  amber: number;
}

/** Meias-larguras de zona (0-50) dado um fator de escala. 1 = base; >1 = mais fácil. */
export function zoneHalves(scale: number): ZoneHalves {
  return {
    purple: ZONE_BASE_HALVES.purple * scale,
    green: ZONE_BASE_HALVES.green * scale,
    amber: ZONE_BASE_HALVES.amber * scale,
  };
}

/** Dado um valor 0-100 no cursor e as meias-larguras, retorna o tier acertado. */
export function tierFromPosition(pos: number, halves: ZoneHalves): Tier {
  const d = Math.abs(pos - 50);
  if (d <= halves.purple) return 'purple';
  if (d <= halves.green) return 'green';
  if (d <= halves.amber) return 'amber';
  return 'red';
}

export interface ScaleOptions {
  base: number; // zoneScale do carro (upgrades de peças)
  isPit: boolean;
  isSaida: boolean;
  overtakeAttempt: boolean;
  gap: number;
  pendingBoostIsPneu: boolean;
  pitCrewQuality?: number; // 0..1
}

/** Calcula o fator de escala final da zona para um desafio específico. */
export function computeScale(opts: ScaleOptions): number {
  let scale = opts.base;
  if (opts.isPit) {
    scale *= 1.3 + (opts.pitCrewQuality ?? 0) * 0.3; // equipe melhor = zona ainda mais larga
  }
  if (!opts.isSaida && !opts.isPit && opts.overtakeAttempt) {
    const closeness = Math.min(1, Math.abs(opts.gap) / OVERTAKE_GAP_THRESHOLD);
    scale *= 1 - 0.5 * closeness;
  }
  if (!opts.isSaida && opts.pendingBoostIsPneu) {
    scale *= 1.2;
  }
  return Math.min(scale, MAX_SCALE);
}

export function canAttemptOvertake(gap: number): boolean {
  return Math.abs(gap) < OVERTAKE_GAP_THRESHOLD;
}

/** Sorteia um tier dado uma distribuição de probabilidades (usado por IAs e bots). */
export function rollTier(weights: Record<Tier, number>, rng: () => number = Math.random): Tier {
  const r = rng();
  let acc = 0;
  for (const tier of ['purple', 'green', 'amber', 'red', 'miss'] as Tier[]) {
    acc += weights[tier];
    if (r <= acc) return tier;
  }
  return 'miss';
}
