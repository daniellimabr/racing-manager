import type { Tier } from './types.js';
import { ZONE_BASE_HALVES, MAX_SCALE, OVERTAKE_GAP_THRESHOLD, PNEU_BOOST_SCALE } from './constants.js';

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

/** Dado um valor 0-100 no cursor e as meias-larguras, retorna o tier acertado. `center` (default 50) permite desafios com a zona ideal deslocada (ex.: aceleração — limite de grip perto do fim do percurso, não no meio). */
export function tierFromPosition(pos: number, halves: ZoneHalves, center = 50): Tier {
  const d = Math.abs(pos - center);
  if (d <= halves.purple) return 'purple';
  if (d <= halves.green) return 'green';
  if (d <= halves.amber) return 'amber';
  return 'red';
}

const TIER_POINTS: Record<Tier, number> = { purple: 100, green: 70, amber: 40, red: 10, miss: 0 };

/**
 * Combina 2 tiers (ex.: os 2 desafios da frenagem — ponto + duração) numa
 * única nota final, pela média dos pontos remapeada pro tier mais próximo.
 * Usado tanto pela view (RaceScene) quanto pelo harness de bots, pra manter
 * o mesmo efeito de "regressão à média" em ambos.
 */
export function combineTiers(a: Tier, b: Tier): Tier {
  const avg = (TIER_POINTS[a] + TIER_POINTS[b]) / 2;
  if (avg >= 85) return 'purple';
  if (avg >= 55) return 'green';
  if (avg >= 20) return 'amber';
  if (avg > 0) return 'red';
  return 'miss';
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
    scale *= PNEU_BOOST_SCALE;
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
