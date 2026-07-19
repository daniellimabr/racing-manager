import type { Tier, CarSetup } from './types.js';

/** Ganho de tempo (segundos) por tier — positivo = ganha tempo, negativo = perde */
export const GAIN: Record<Tier, number> = {
  purple: 0.30,
  green: 0.15,
  amber: 0,
  red: -0.20,
  miss: -0.40,
};

/**
 * Dano de saúde por tier, em uma frenagem/pit cheios (saída aplica metade).
 * Recalibrado no T-107 (rodada 1, ver Claude-Racing.md): os valores originais
 * (amber 5 / red 15 / miss 25) somados aos 145 eventos de uma corrida em Spa
 * geravam DNF de 56–100% em todos os perfis — dano por evento precisava cair.
 */
export const DAMAGE: Record<Tier, number> = {
  purple: 0,
  green: 0,
  amber: 1,
  red: 3,
  miss: 6,
};

export const NITRO_GOOD_BONUS = 1.10; // +10% em ganhos positivos
export const NITRO_BAD_RELIEF = 0.6; // penalidade cai para 60% do valor original

export const OVERTAKE_GAP_THRESHOLD = 1.0; // segundos — só pode tentar ultrapassar abaixo disso
export const PIT_SCALE = 1.3; // equipe de pit stop alarga a zona
export const PNEU_BOOST_SCALE = 1.2;
export const MAX_SCALE = 1.5;

export const ZONE_BASE_HALVES = { purple: 8, green: 20, amber: 35 };

/**
 * Segundos de vantagem acumulada equivalentes a 1 posição no grid.
 *
 * T-107 (rodada 1, ver Claude-Racing.md): a 1ª tentativa de calibração usava
 * cruzamento de sinal do gap com reset pra um valor fixo a cada ultrapassagem.
 * Isso saturava — o número de ultrapassagens por corrida NÃO escalava com a
 * habilidade do perfil (Skilled e Médio convergiam pro mesmo ~2 por corrida),
 * porque a maior parte do progresso teórico se perdia em reversões de curto
 * prazo do passeio aleatório. Trocado por um modelo de progresso cumulativo
 * (`RaceState.raceProgress`, nunca reseta): a posição é `startPosition -
 * floor(raceProgress / POSITION_UNIT_SECONDS)`. Calibrado via harness (bots)
 * pra Skilled vencer 30–40% das corridas: 3.7 → ~36%.
 */
export const POSITION_UNIT_SECONDS = 3.7;

/** valores padrão do carro do jogador até o Manager alimentar o RaceInput de verdade (M2) */
export const DEFAULT_CAR_SETUP: CarSetup = { zoneScale: 1, healthMax: 180, nitroCharges: 3 };
