import type {
  RaceState, RaceEvent, Tier, BoostId, CarSetup, TrackDef,
  ResolveOptions, ResolveResult, RaceOutput,
} from './types.js';
import { buildEventSequence } from './track.js';
import { GAIN, DAMAGE, NITRO_GOOD_BONUS, NITRO_BAD_RELIEF } from './constants.js';

export function createRace(
  track: TrackDef,
  setup: CarSetup,
  opts: { gridSize?: number; startPosition?: number; startGap?: number } = {}
): RaceState {
  return {
    track,
    events: buildEventSequence(track),
    eventIndex: 0,
    lap: 1,
    health: setup.healthMax,
    healthMax: setup.healthMax,
    position: opts.startPosition ?? 6,
    gridSize: opts.gridSize ?? 12,
    gapToAhead: opts.startGap ?? 1.5,
    nitro: setup.nitroCharges,
    usedRevive: false,
    pendingBoost: null,
    overtakeAttempt: false,
    zoneScaleBase: setup.zoneScale,
    finished: false,
    dnf: false,
    log: [],
  };
}

export function currentEvent(state: RaceState): RaceEvent {
  return state.events[state.eventIndex];
}

/** Consome uma carga de nitro, se disponível. Chamar ANTES de resolveCurrent. */
export function tryUseNitro(state: RaceState): boolean {
  if (state.nitro <= 0) return false;
  state.nitro -= 1;
  return true;
}

export function setOvertakeAttempt(state: RaceState, attempt: boolean): void {
  state.overtakeAttempt = attempt;
}

export function applyBoost(state: RaceState, boost: BoostId): void {
  state.pendingBoost = boost;
}

/**
 * Resolve o desafio de timing atual dado o tier obtido, atualizando saúde,
 * gap (live-timing) e posição. Não avança o índice de evento — use advance().
 */
export function resolveCurrent(state: RaceState, tier: Tier, opts: ResolveOptions): ResolveResult {
  const ev = currentEvent(state);
  const isSaida = ev.kind === 'saida';

  let dmg = DAMAGE[tier];
  if (!isSaida && state.pendingBoost === 'freio') dmg = Math.round(dmg / 2);
  const appliedDmg = isSaida ? Math.round(dmg / 2) : dmg;
  state.health = Math.max(0, state.health - appliedDmg);

  let gain = GAIN[tier];
  if (opts.nitroUsed) gain = gain >= 0 ? gain * NITRO_GOOD_BONUS : gain * NITRO_BAD_RELIEF;
  if (isSaida) gain *= 0.5;

  const prevGap = state.gapToAhead;
  state.gapToAhead = prevGap - gain;

  let positionChanged: 'gained' | 'lost' | null = null;
  if (!isSaida) {
    if (prevGap > 0 && state.gapToAhead <= 0) {
      state.position = Math.max(1, state.position - 1);
      positionChanged = 'gained';
    } else if (prevGap <= 0 && state.gapToAhead > 0) {
      state.position = Math.min(state.gridSize, state.position + 1);
      positionChanged = 'lost';
    }
    state.pendingBoost = null;
    state.overtakeAttempt = false;
  }

  const message = `${gain >= 0 ? 'ganhou' : 'perdeu'} ${Math.abs(gain).toFixed(2)}s`;
  state.log.push(`volta ${ev.lap} · ${ev.cornerName ?? ev.kind} (${ev.kind}): ${tier} — ${message}`);

  if (state.health <= 0 && !state.dnf) {
    state.dnf = true;
    state.dnfReason = (tier === 'red' || tier === 'miss') ? 'batida forte' : 'defeito no carro';
  }

  return { tier, gainSeconds: gain, damage: appliedDmg, positionChanged, message };
}

/** Avança para o próximo evento da corrida. Marca `finished` ao acabar a pista. */
export function advance(state: RaceState): void {
  state.eventIndex += 1;
  if (state.eventIndex >= state.events.length) {
    state.finished = true;
    return;
  }
  state.lap = state.events[state.eventIndex].lap;
}

/** Volta à corrida após DNF, 1x por corrida, com metade da saúde. */
export function revive(state: RaceState): boolean {
  if (state.usedRevive) return false;
  state.usedRevive = true;
  state.dnf = false;
  state.dnfReason = undefined;
  state.health = Math.round(state.healthMax / 2);
  return true;
}

export function toRaceOutput(state: RaceState): RaceOutput {
  return {
    position: state.position,
    dnf: state.dnf,
    dnfReason: state.dnfReason,
    reviveUsed: state.usedRevive,
    lapsCompleted: state.finished ? state.track.laps : Math.max(0, state.lap - 1),
    events: state.log,
  };
}
