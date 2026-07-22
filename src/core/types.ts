import type { GridState } from './grid.js';

export type Tier = 'purple' | 'green' | 'amber' | 'red' | 'miss';

export type EventKind = 'saida' | 'frenagem' | 'pit';

export type BoostId =
  | 'pneu' | 'freio' | 'janela' | 'reparo_rapido' | 'nitro_extra' | 'recuperacao_erro'
  | 'rasante' | 'folego_ultrapassagem';

export interface CornerDef {
  id: string;
  name: string;
  /** índice em `TrackDef.path` onde este desafio fica posicionado no traçado */
  pathIndex: number;
}

/** Ponto normalizado (0..1 em x e y) do traçado, para desenho independente de resolução */
export interface TrackPoint {
  x: number;
  y: number;
}

export interface TrackDef {
  id: string;
  name: string;
  laps: number;
  /** Volta (1-indexed) após a qual o pit stop obrigatório acontece */
  pitAfterLap: number;
  /** Polilinha normalizada (0..1) do traçado, loop fechado (o último ponto conecta de volta ao primeiro) */
  path: TrackPoint[];
  /** índice em `path` onde a entrada do pit fica posicionada */
  pitPathIndex: number;
  corners: CornerDef[];
}

/** Um evento concreto na sequência da corrida (pré-computado a partir da pista) */
export interface RaceEvent {
  kind: EventKind;
  lap: number;
  cornerId?: string;
  cornerName?: string;
  /** true se este for o evento de saída elegível a oferecer boost (1x por volta) */
  boostEligible?: boolean;
}

/** Setup do carro do jogador, vindo do Manager (contrato RaceInput) */
export interface CarSetup {
  /** multiplicador de largura de zona vindo do upgrade de peças (1 = base) */
  zoneScale: number;
  healthMax: number;
  nitroCharges: number;
}

export interface PitCrew {
  /** 0..1, qualidade da equipe de pit stop — alarga a zona do pit */
  quality: number;
}

export interface RaceInput {
  trackId: string;
  carSetup: CarSetup;
  pitCrew: PitCrew;
  championshipRound?: number;
}

export interface RaceState {
  track: TrackDef;
  events: RaceEvent[];
  eventIndex: number;
  lap: number;
  health: number;
  healthMax: number;
  /**
   * Posição do jogador na classificação de 12 carros — DERIVADA do grid (ver
   * `grid` abaixo + `raceStandings()` em raceState.ts), não mais calculada por
   * uma fórmula escalar em paralelo. Unificação feita na sessão 11 (ver
   * Claude-Racing.md §3/§6 item 5): antes existiam 2 modelos de posição
   * (este campo, calculado por `POSITION_UNIT_SECONDS`, e o grid usado só pela
   * view) que podiam divergir entre si — já causou 2 bugs reais (líder
   * recebendo oferta de ultrapassagem; dúvida de qual posição pagar a
   * recompensa do Manager). Agora `position`/`gapToAhead` são só um cache do
   * último valor derivado do grid (atualizado em `resolveCurrent`/`createRace`),
   * nunca uma fonte independente.
   */
  position: number;
  /**
   * Simulação dos outros 11 carros (10 oponentes + companheiro de equipe) —
   * ver `core/grid.ts`. Antes vivia só na view (`RaceScene.gridState`); agora
   * mora aqui porque é a fonte de verdade única de onde vem a posição/gap do
   * jogador, usada tanto pelo harness headless (`tools/botHarness.ts`) quanto
   * pela view (HUD/painel de gaps). O jogador entra na simulação através do
   * seu próprio `raceProgress` (ver `raceStandings()`), não como mais um carro
   * do array `grid.cars`.
   */
  grid: GridState;
  /** soma acumulada (nunca reseta) do ganho/perda de tempo desde a largada — define a posição via o grid (ver raceStandings) */
  raceProgress: number;
  gapToAhead: number; // segundos: positivo = atrás, negativo = à frente (derivado do grid, ver resolveCurrent)
  nitro: number;
  usedRevive: boolean;
  pendingBoost: BoostId | null;
  overtakeAttempt: boolean;
  zoneScaleBase: number;
  finished: boolean;
  dnf: boolean;
  dnfReason?: string;
  /** Gold "perdido" acumulado em crashes (batida forte) — preview da conexão com o Manager (M2), ver GOLD_CRASH_PENALTY. */
  goldPenalty: number;
  /** Tempos (segundos) das voltas já completadas, na ordem — ver `advance()` e NOMINAL_LAP_SECONDS. */
  lapTimes: number[];
  /** Ganho/perda acumulado (soma de `gain`) desde o início da volta atual — zera a cada volta fechada. */
  currentLapGain: number;
  log: string[];
}

export interface ResolveOptions {
  nitroUsed: boolean;
  overtakeAttempt?: boolean;
  /** Injetável para testes determinísticos (ex.: chance de DNF instantâneo no miss). Default: Math.random. */
  rng?: () => number;
}

export interface ResolveResult {
  tier: Tier;
  gainSeconds: number;
  damage: number;
  positionChanged: 'gained' | 'lost' | null;
  message: string;
}

export interface RaceOutput {
  position: number;
  dnf: boolean;
  dnfReason?: string;
  reviveUsed: boolean;
  lapsCompleted: number;
  events: string[];
  /** Gold "perdido" acumulado em crashes nesta corrida — ver `RaceState.goldPenalty`. */
  goldPenalty: number;
  /** Tempos (segundos) das voltas completadas, na ordem — ver `RaceState.lapTimes`. */
  lapTimes: number[];
}
