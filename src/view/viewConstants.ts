import type { BoostId, Tier } from '../core/types.js';
export { DEFAULT_CAR_SETUP } from '../core/constants.js';
import { NOMINAL_LAP_SECONDS } from '../core/constants.js';

/** Constantes de "feel" da view (não fazem parte do core — são puramente de apresentação/input). */

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 800;

export const HUD_HEIGHT = 78;
export const PANEL_HEIGHT = 220;
export const TRACK_RECT = {
  x: 10,
  y: HUD_HEIGHT,
  width: CANVAS_WIDTH - 20,
  height: CANVAS_HEIGHT - HUD_HEIGHT - PANEL_HEIGHT,
};

/** tempo (ms) de uma volta completa do cursor (0 -> 100 -> 0) na barra de timing — usado só no pit (sweep contínuo, T-105 não mudou isso) */
export const CURSOR_SWEEP_PERIOD_MS = 900;
/** tempo limite (ms) para apertar o botão antes de contar como "miss" automático — usado só no pit */
export const CHALLENGE_TIME_LIMIT_MS = 1500;
/**
 * Tempo limite (ms) pra decidir ultrapassagem/nitro antes do desafio de timing.
 * Expirando, assume "não" e o jogo segue — feedback de playtest do PO: a tela
 * de decisão pausava indefinidamente, diferente do resto do jogo, que sempre
 * tem pressão de tempo (Claude-Racing.md §2.22).
 */
export const PRE_CHALLENGE_TIME_LIMIT_MS = 3000;

/**
 * T-105 (proposta CSR2, validada na demo greybox — ver Claude-Racing.md §2.10):
 * frenagem e aceleração deixam de usar o vaivém contínuo e passam a ser uma
 * única passagem (0->100) representando a aproximação/aceleração, não mais
 * um cursor oscilando indefinidamente.
 */
export const RAMP_DURATION_MS = 1300;
/** centro da zona ideal na aceleração — perto do fim do percurso (limite de grip), não no meio */
export const ACCEL_CENTER = 75;
export const BRAKE_CENTER = 50;

/**
 * Largada: "segurar para controlar" a agulha até o sinal, não um toque de
 * reação. Velocidade reduzida na sessão 14 (pedido do PO: "o cursor tem uma
 * velocidade alta demais... um pouco mais lenta, um pouco elástica pra
 * conseguir manter o cursor dentro do roxo") — 0.16/0.10 → 0.10/0.065
 * (~35-40% mais lento), preservando a proporção subida:descida. "Elástica"
 * não virou física de mola de verdade nesta sessão — só desacelerado; o PO já
 * sinalizou que este mecanismo inteiro vai passar por um revamp quando a
 * Trilha 3 (UI/FX) entrar, então física de mola de verdade fica pra lá.
 */
export const LARGADA_PREP_MS = 1500;
export const LARGADA_LIGHT_INTERVAL_MS = 500;
export const LARGADA_HOLD_MIN_MS = 300;
export const LARGADA_HOLD_MAX_MS = 700;
export const LARGADA_HOLD_RATE = 0.10; // unidades/ms subindo enquanto segura
export const LARGADA_FALL_RATE = 0.065; // unidades/ms caindo quando solta

/**
 * Compensa o cursor mais lento/controlável: zona roxa/verde só da largada
 * fica mais estreita que o resto do jogo (ZONE_BASE_HALVES, core/constants.ts
 * — compartilhado por frenagem/aceleração/pit, que o PO já confirmou estar na
 * medida certa e não deve ser tocado). Multiplica a escala calculada por
 * `computeScale()` só na largada, ver `startTimingChallenge` (RaceScene.ts).
 */
export const LARGADA_ZONE_SCALE = 0.7;
/** duração da animação dos carros entre eventos (T-104: 0,8–1,2s por trecho) */
export const TWEEN_DURATION_MS = 1000;

/**
 * Tempo (ms) entre o desafio aparecer na tela (rótulo + barra visíveis, cursor
 * parado na posição inicial) e o cursor começar de fato a se mover — dá tempo
 * de LER qual curva/tipo de desafio é antes de precisar reagir. Feedback de um
 * dos irmãos do PO (Claude-Racing.md §2.28): o cursor começava a andar (e o
 * timer de miss já contava) no mesmo instante em que o desafio aparecia, sem
 * nenhuma janela de leitura. O irmão sugeriu um modelo de "2 toques" (1º inicia
 * o desafio, 2º tenta acertar); o PO escolheu deliberadamente a solução mais
 * simples — só atrasar o início do movimento — mantendo a interação em 1
 * toque só. Aplica-se a `ramp` (frenagem/aceleração) e `sweep` (pit); a
 * largada já tinha seu próprio "PREPARE-SE" (LARGADA_PREP_MS, 1500ms) desde o
 * T-105 e não foi alterada — é um princípio parecido, mecanismo diferente.
 * 600ms escolhido por sensação (dá pra ler um rótulo curto como "Eau
 * Rouge/Raidillon — ponto de frenagem (1/2)" sem alongar demais a cadência de
 * ~150 eventos/corrida — 600ms × 150 ≈ 90s extra numa corrida de ~5min,
 * aceitável; bem mais curto que o LARGADA_PREP_MS porque este se repete a
 * cada desafio, não só 1x por corrida).
 */
export const CHALLENGE_PREP_MS = 600;

/**
 * Conversão de segundos de gap em fração do traçado, para posicionar os
 * carros do grid num "pelotão" visualmente coerente (modelo 1D, sem física —
 * ver risco "escopo do grid" em Claude-Tech.md §9). ~5 min / 8 voltas.
 * Reaproveita `NOMINAL_LAP_SECONDS` (core/constants.ts) — mesmo número, agora
 * também é a base do cálculo de tempo de volta real (sessão 12), pra não ter
 * 2 "volta nominal" desencontradas entre core e view.
 */
export const SECONDS_PER_LAP_VISUAL = NOMINAL_LAP_SECONDS;
export const MAX_VISUAL_GAP_SECONDS = SECONDS_PER_LAP_VISUAL * 0.9;

export const TIER_COLORS: Record<Tier, number> = {
  purple: 0xb266ff,
  green: 0x2ecc71,
  amber: 0xf1c40f,
  red: 0xe74c3c,
  miss: 0x555555,
};

export const BOOST_LABELS: Record<BoostId, string> = {
  pneu: 'Bono, My Tyres',
  freio: 'Freio reforçado',
  janela: 'Janela ampliada',
  reparo_rapido: 'Reparo rápido',
  nitro_extra: 'Nitro extra',
  recuperacao_erro: 'Recuperação de erro',
  rasante: 'Rasante',
  folego_ultrapassagem: 'Fôlego de ultrapassagem',
};

/** Feedback de playtest do PO: os nomes dos boosts não deixavam claro o efeito (Claude-Racing.md §2.21). */
export const BOOST_DESCRIPTIONS: Record<BoostId, string> = {
  pneu: 'Aumenta a zona verde/roxa na próxima frenagem/pit',
  freio: 'Reduz o dano se errar a próxima frenagem/pit',
  janela: 'Mais tempo de reação no próximo desafio de frenagem/pit',
  reparo_rapido: 'Recupera saúde na próxima frenagem/pit resolvida',
  nitro_extra: '+1 carga de nitro, concedida na hora',
  recuperacao_erro: 'Reduz a perda de tempo do seu próximo erro (vermelho/miss)',
  rasante: 'Pega o rastro nesta saída: +25% no ganho, se já for positivo',
  folego_ultrapassagem: 'Facilita tentar ultrapassagem na próxima frenagem/pit (gap máximo maior)',
};

/** Boost "janela ampliada": fator de aumento no tempo disponível do próximo desafio de frenagem/pit. */
export const JANELA_DURATION_SCALE = 1.3;

export const TEAM_COLORS: Record<string, number> = {
  player: 0xffdd33,
  alpha: 0xff5566,
  bravo: 0x55dd88,
  charlie: 0xffaa33,
  delta: 0x7788ff,
  echo: 0xcc66ff,
};

export const DEFAULT_PIT_CREW_QUALITY = 0.5;
