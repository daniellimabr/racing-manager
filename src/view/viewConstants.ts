import type { BoostId, Tier } from '../core/types.js';
export { DEFAULT_CAR_SETUP } from '../core/constants.js';

/** Constantes de "feel" da view (não fazem parte do core — são puramente de apresentação/input). */

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 800;

export const HUD_HEIGHT = 60;
export const PANEL_HEIGHT = 220;
export const TRACK_RECT = {
  x: 10,
  y: HUD_HEIGHT,
  width: CANVAS_WIDTH - 20,
  height: CANVAS_HEIGHT - HUD_HEIGHT - PANEL_HEIGHT,
};

/** tempo (ms) de uma volta completa do cursor (0 -> 100 -> 0) na barra de timing */
export const CURSOR_SWEEP_PERIOD_MS = 900;
/** tempo limite (ms) para apertar o botão antes de contar como "miss" automático */
export const CHALLENGE_TIME_LIMIT_MS = 1500;
/** duração da animação dos carros entre eventos (T-104: 0,8–1,2s por trecho) */
export const TWEEN_DURATION_MS = 1000;

/**
 * Conversão de segundos de gap em fração do traçado, para posicionar os
 * carros do grid num "pelotão" visualmente coerente (modelo 1D, sem física —
 * ver risco "escopo do grid" em Claude-Tech.md §9). ~5 min / 8 voltas.
 */
export const SECONDS_PER_LAP_VISUAL = 37.5;
export const MAX_VISUAL_GAP_SECONDS = SECONDS_PER_LAP_VISUAL * 0.9;

export const TIER_COLORS: Record<Tier, number> = {
  purple: 0xb266ff,
  green: 0x2ecc71,
  amber: 0xf1c40f,
  red: 0xe74c3c,
  miss: 0x555555,
};

export const BOOST_LABELS: Record<BoostId, string> = {
  pneu: 'Pneu novo (grip)',
  freio: 'Freio reforçado',
  janela: 'Janela ampliada',
};

export const TEAM_COLORS: Record<string, number> = {
  player: 0xffdd33,
  alpha: 0xff5566,
  bravo: 0x55dd88,
  charlie: 0xffaa33,
  delta: 0x7788ff,
  echo: 0xcc66ff,
};

export const DEFAULT_PIT_CREW_QUALITY = 0.5;
