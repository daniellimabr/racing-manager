import type { Tier } from './types.js';

/** Ganho de tempo (segundos) por tier — positivo = ganha tempo, negativo = perde */
export const GAIN: Record<Tier, number> = {
  purple: 0.30,
  green: 0.15,
  amber: 0,
  red: -0.20,
  miss: -0.40,
};

/** Dano de saúde por tier, em uma frenagem/pit cheios (saída aplica metade) */
export const DAMAGE: Record<Tier, number> = {
  purple: 0,
  green: 0,
  amber: 5,
  red: 15,
  miss: 25,
};

export const NITRO_GOOD_BONUS = 1.10; // +10% em ganhos positivos
export const NITRO_BAD_RELIEF = 0.6; // penalidade cai para 60% do valor original

export const OVERTAKE_GAP_THRESHOLD = 1.0; // segundos — só pode tentar ultrapassar abaixo disso
export const PIT_SCALE = 1.3; // equipe de pit stop alarga a zona
export const PNEU_BOOST_SCALE = 1.2;
export const MAX_SCALE = 1.5;

export const ZONE_BASE_HALVES = { purple: 8, green: 20, amber: 35 };
