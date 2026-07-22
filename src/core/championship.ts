/**
 * Campeonato de construtores (sessão 15, pedido direto do PO — CLAUDE.md já
 * previa isso desde a Q11/seção 5 item 8 "Seleção de campeonato/corrida",
 * mas ficava deliberadamente adiado até existir uma 2ª pista de verdade).
 * Escopo mínimo: 2 corridas (Spa → Interlagos), pontuação de CONSTRUTORES
 * (não de pilotos) — já era a decisão registrada no CLAUDE.md Q4 ("Carro 2:
 * conta pontos para o campeonato de construtores"), e o grid (`core/grid.ts`)
 * já retorna `teamId` pra todos os 12 carros via `GridStanding`, então somar
 * pontos por equipe é direto a partir do que já existe — não precisou de
 * nenhum modelo novo de simulação.
 */
import type { RaceState } from './types.js';
import { raceStandings, toRaceOutput } from './raceState.js';
import type { TeamId } from './grid.js';

export interface ChampionshipRace {
  trackId: string;
}

/** 2 corridas — Spa primeiro (pista original do projeto), Interlagos depois (2ª pista, sessão 15). */
export const CHAMPIONSHIP_CALENDAR: ChampionshipRace[] = [
  { trackId: 'spa' },
  { trackId: 'interlagos' },
];

/**
 * Pontuação clássica de F1 (top 10, 25-18-15-12-10-8-6-4-2-1) — convenção
 * real, reconhecível, sem precisar inventar uma tabela nova. P11/P12 não
 * pontuam, igual à F1 de verdade.
 */
export const POINTS_BY_POSITION: readonly number[] = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function pointsForPosition(position: number): number {
  return POINTS_BY_POSITION[position - 1] ?? 0;
}

export interface ChampionshipState {
  /** índice (0-based) da próxima corrida a disputar no `CHAMPIONSHIP_CALENDAR`; >= length = campeonato encerrado. */
  raceIndex: number;
  /** pontos acumulados de construtores, por `teamId` (inclui `'player'`, a equipe do jogador). */
  teamPoints: Partial<Record<TeamId, number>>;
  /** histórico simples pra tela de resultados — 1 entrada por corrida já disputada. */
  history: { trackId: string; playerPosition: number; teammatePosition: number }[];
}

/** As 6 equipes que sempre disputam a corrida (`core/grid.ts` `AI_TEAMS` + `'player'`) — hardcoded aqui de propósito (não importado de `grid.ts`) pra não criar uma dependência circular só pra isso; só usado pra pré-popular `teamPoints` com 0, então uma equipe sem nenhum ponto ainda aparece na classificação em vez de sumir da lista. */
const ALL_TEAM_IDS: TeamId[] = ['player', 'alpha', 'bravo', 'charlie', 'delta', 'echo'];

export function createChampionship(): ChampionshipState {
  const teamPoints = Object.fromEntries(ALL_TEAM_IDS.map((id) => [id, 0])) as Partial<Record<TeamId, number>>;
  return { raceIndex: 0, teamPoints, history: [] };
}

export function currentChampionshipTrackId(state: ChampionshipState): string | null {
  return CHAMPIONSHIP_CALENDAR[state.raceIndex]?.trackId ?? null;
}

export function isChampionshipComplete(state: ChampionshipState): boolean {
  return state.raceIndex >= CHAMPIONSHIP_CALENDAR.length;
}

export interface ChampionshipRaceResult {
  state: ChampionshipState;
  /** pontos ganhos NESTA corrida por equipe (não o total acumulado) — pra exibir "+18 pts" etc. */
  pointsGainedThisRace: Partial<Record<TeamId, number>>;
}

/**
 * Aplica o resultado de uma corrida já finalizada (`raceState.finished` ou
 * `raceState.dnf`) ao campeonato: soma pontos de construtores dos 12 carros
 * (o jogador usa `toRaceOutput().position`, que já força último lugar em DNF
 * — ver `core/raceState.ts` — os outros 11 usam a posição "ao vivo" do grid,
 * que nunca DNFa na simulação atual) e avança pra próxima corrida do
 * calendário. Não muta `state`; devolve um novo `ChampionshipState`.
 */
export function applyRaceResultToChampionship(state: ChampionshipState, raceState: RaceState): ChampionshipRaceResult {
  const output = toRaceOutput(raceState);
  const standings = raceStandings(raceState);
  const teammateStanding = standings.find((s) => s.isTeammate)!;

  const pointsGainedThisRace: Partial<Record<TeamId, number>> = {};
  for (const standing of standings) {
    // o jogador usa a posição final "de verdade" (DNF força último lugar);
    // os outros 11 carros (incluindo o companheiro) usam a posição ao vivo
    // do grid, que já é a posição final deles (a simulação não roda mais
    // nada depois que a corrida do jogador termina).
    const position = standing.isPlayer ? output.position : standing.position;
    const pts = pointsForPosition(position);
    if (pts > 0) {
      pointsGainedThisRace[standing.teamId] = (pointsGainedThisRace[standing.teamId] ?? 0) + pts;
    }
  }

  const teamPoints: Partial<Record<TeamId, number>> = { ...state.teamPoints };
  for (const [teamId, pts] of Object.entries(pointsGainedThisRace) as [TeamId, number][]) {
    teamPoints[teamId] = (teamPoints[teamId] ?? 0) + pts;
  }

  const trackId = currentChampionshipTrackId(state) ?? raceState.track.id;
  const newState: ChampionshipState = {
    raceIndex: state.raceIndex + 1,
    teamPoints,
    history: [
      ...state.history,
      { trackId, playerPosition: output.position, teammatePosition: teammateStanding.position },
    ],
  };

  return { state: newState, pointsGainedThisRace };
}

/** Ordena as equipes por pontos (desc) — pra tela de standings. `'player'` é a equipe do jogador (Carro 1 + Carro 2/companheiro). */
export function sortedStandings(state: ChampionshipState): { teamId: TeamId; points: number }[] {
  return (Object.entries(state.teamPoints) as [TeamId, number][])
    .map(([teamId, points]) => ({ teamId, points }))
    .sort((a, b) => b.points - a.points);
}
