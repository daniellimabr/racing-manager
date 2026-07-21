import type { Tier } from './types.js';
import { GAIN } from './constants.js';
import { rollTier } from './timing.js';

/**
 * Simulação do grid de 12 carros (T-101): 10 oponentes (5 equipes) + o
 * companheiro de equipe do jogador guiado por IA. É uma camada ADITIVA —
 * não substitui nem altera `raceState.ts` (já testado no T-002 e usado pelo
 * harness de bots, que precisa continuar rápido e determinístico o
 * suficiente para 500+ corridas/perfil). O jogador entra na simulação do
 * grid apenas como um tempo acumulado (`playerCumulativeTime`), calculado
 * pela view a partir do `gainSeconds` de cada `resolveCurrent`.
 *
 * Modelo (herdado do risco "escopo do grid" em Claude-Tech.md §9): 1D,
 * sem física — cada carro tem um pace de equipe + ruído por piloto,
 * avançando em lockstep com os eventos da corrida do jogador.
 */

export type TeamId = 'player' | 'alpha' | 'bravo' | 'charlie' | 'delta' | 'echo';

export interface GridCarDef {
  id: string;
  label: string;
  teamId: TeamId;
  /** true = é o 2º carro do jogador (companheiro de equipe, guiado por IA) */
  isTeammate: boolean;
  /** multiplicador de ganho por evento — pace do carro/equipe (1 = média do grid) */
  paceFactor: number;
  weights: Record<Tier, number>;
}

export interface GridState {
  /** os 11 carros que não são o jogador: 10 oponentes + 1 companheiro de equipe */
  cars: GridCarDef[];
  /** segundos acumulados por car.id — menor valor = mais à frente na corrida */
  cumulativeTime: Record<string, number>;
}

interface TeamSpec {
  teamId: TeamId;
  paceFactor: number;
  weights: Record<Tier, number>;
}

/** 5 equipes adversárias com pace e agressividade decrescentes (grid variado) */
const AI_TEAMS: TeamSpec[] = [
  { teamId: 'alpha', paceFactor: 1.06, weights: { purple: 0.30, green: 0.45, amber: 0.20, red: 0.04, miss: 0.01 } },
  { teamId: 'bravo', paceFactor: 1.02, weights: { purple: 0.20, green: 0.42, amber: 0.30, red: 0.06, miss: 0.02 } },
  { teamId: 'charlie', paceFactor: 1.00, weights: { purple: 0.15, green: 0.40, amber: 0.35, red: 0.08, miss: 0.02 } },
  { teamId: 'delta', paceFactor: 0.97, weights: { purple: 0.10, green: 0.35, amber: 0.40, red: 0.12, miss: 0.03 } },
  { teamId: 'echo', paceFactor: 0.94, weights: { purple: 0.08, green: 0.30, amber: 0.40, red: 0.17, miss: 0.05 } },
];

/** perfil "Médio" como padrão do companheiro de equipe até M2 (skill de piloto contratável) */
const TEAMMATE_WEIGHTS: Record<Tier, number> = { purple: 0.15, green: 0.40, amber: 0.35, red: 0.08, miss: 0.02 };

export function createGridSim(rng: () => number = Math.random): GridState {
  const cars: GridCarDef[] = [];

  AI_TEAMS.forEach((team) => {
    for (let carSlot = 1; carSlot <= 2; carSlot++) {
      const jitter = 1 + (rng() - 0.5) * 0.04; // +-2% de variação entre pilotos da mesma equipe
      cars.push({
        id: `${team.teamId}-${carSlot}`,
        label: `${team.teamId.toUpperCase()} ${carSlot}`,
        teamId: team.teamId,
        isTeammate: false,
        paceFactor: team.paceFactor * jitter,
        weights: team.weights,
      });
    }
  });

  cars.push({
    id: 'teammate',
    label: 'Companheiro',
    teamId: 'player',
    isTeammate: true,
    paceFactor: 1.0,
    weights: TEAMMATE_WEIGHTS,
  });

  // grid de largada: ordena por pace e espalha em ~0.4s por posição, centrado
  // no jogador (tempo 0) — aproxima o padrão de largada P6/12 do core (ver raceState.createRace).
  // O jogador ocupa o tempo 0 sozinho (ver `playerCumulativeTime = 0` em RaceScene) — os 11
  // carros de IA pulam esse valor (índice 5 vai pra +0.4, não pra 0) pra não empatar com ele.
  // Sem esse pulo, o carro de IA de pace mediano caía exatamente em (5-5)*0.4 = 0, empatando
  // com o jogador toda largada e gerando 2 posições com o mesmo gap exibido (bug de playtest).
  const rankedByPace = [...cars].sort((a, b) => b.paceFactor - a.paceFactor);
  const cumulativeTime: Record<string, number> = {};
  rankedByPace.forEach((car, i) => {
    const slot = i < 5 ? i - 5 : i - 4;
    cumulativeTime[car.id] = slot * 0.4;
  });

  return { cars, cumulativeTime };
}

/** Avança 1 tick (1 evento da corrida) para todos os carros que não são o jogador. */
export function advanceGrid(state: GridState, rng: () => number = Math.random): void {
  for (const car of state.cars) {
    const tier = rollTier(car.weights, rng);
    const gain = GAIN[tier] * car.paceFactor;
    state.cumulativeTime[car.id] -= gain;
  }
}

export interface GridStanding {
  id: string;
  label: string;
  teamId: TeamId;
  isPlayer: boolean;
  isTeammate: boolean;
  position: number;
  /** segundos atrás do líder (>= 0) */
  gapToLeader: number;
}

/** Mescla o jogador na simulação e deriva a classificação completa (12 carros). */
export function deriveStandings(
  state: GridState,
  player: { id: string; label: string; cumulativeTime: number }
): GridStanding[] {
  const entries = [
    ...state.cars.map((c) => ({
      id: c.id, label: c.label, teamId: c.teamId, isPlayer: false, isTeammate: c.isTeammate,
      time: state.cumulativeTime[c.id],
    })),
    { id: player.id, label: player.label, teamId: 'player' as TeamId, isPlayer: true, isTeammate: false, time: player.cumulativeTime },
  ];
  entries.sort((a, b) => a.time - b.time);
  const leaderTime = entries[0].time;

  return entries.map((e, i) => ({
    id: e.id,
    label: e.label,
    teamId: e.teamId,
    isPlayer: e.isPlayer,
    isTeammate: e.isTeammate,
    position: i + 1,
    gapToLeader: e.time - leaderTime,
  }));
}
