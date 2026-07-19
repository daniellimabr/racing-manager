export type Tier = 'purple' | 'green' | 'amber' | 'red' | 'miss';

export type EventKind = 'saida' | 'frenagem' | 'pit';

export type BoostId = 'pneu' | 'freio' | 'janela';

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
  position: number;
  startPosition: number;
  gridSize: number;
  /** soma acumulada (nunca reseta) do ganho/perda de tempo desde a largada — define a posição */
  raceProgress: number;
  gapToAhead: number; // segundos: positivo = atrás, negativo = à frente (derivado de raceProgress, ver resolveCurrent)
  nitro: number;
  usedRevive: boolean;
  pendingBoost: BoostId | null;
  overtakeAttempt: boolean;
  zoneScaleBase: number;
  finished: boolean;
  dnf: boolean;
  dnfReason?: string;
  log: string[];
}

export interface ResolveOptions {
  nitroUsed: boolean;
  overtakeAttempt?: boolean;
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
}
