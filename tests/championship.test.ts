import { describe, it, expect } from 'vitest';
import { createRace, resolveCurrent, advance } from '../src/core/raceState.js';
import {
  createChampionship, currentChampionshipTrackId, isChampionshipComplete, pointsForPosition,
  applyRaceResultToChampionship, sortedStandings, CHAMPIONSHIP_CALENDAR,
} from '../src/core/championship.js';
import type { TrackDef, CarSetup } from '../src/core/types.js';

const track: TrackDef = {
  id: 'test', name: 'Test Track', laps: 1, pitAfterLap: 1,
  path: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0.5 }],
  pitPathIndex: 2,
  corners: [{ id: 'c1', name: 'Curva 1', pathIndex: 0 }],
};
const setup: CarSetup = { zoneScale: 1, healthMax: 100, nitroCharges: 1 };

function runFullRace(tier: 'purple' | 'green' = 'purple') {
  const s = createRace(track, setup);
  let guard = 0;
  while (!s.finished && !s.dnf && guard < 1000) {
    resolveCurrent(s, tier, { nitroUsed: false });
    advance(s);
    guard++;
  }
  return s;
}

describe('pointsForPosition', () => {
  it('segue a tabela clássica de F1 (25-18-15-...-1) pro top 10', () => {
    expect(pointsForPosition(1)).toBe(25);
    expect(pointsForPosition(2)).toBe(18);
    expect(pointsForPosition(10)).toBe(1);
  });

  it('não pontua fora do top 10 (P11/P12)', () => {
    expect(pointsForPosition(11)).toBe(0);
    expect(pointsForPosition(12)).toBe(0);
  });
});

describe('createChampionship / calendário', () => {
  it('começa na 1ª corrida do calendário, com as 6 equipes zeradas (não ausentes), não encerrado', () => {
    const champ = createChampionship();
    expect(champ.raceIndex).toBe(0);
    expect(currentChampionshipTrackId(champ)).toBe(CHAMPIONSHIP_CALENDAR[0].trackId);
    expect(isChampionshipComplete(champ)).toBe(false);
    // pré-populadas com 0 (não ausentes) pra toda equipe aparecer na
    // classificação desde o início, mesmo sem pontuar ainda.
    expect(Object.keys(champ.teamPoints)).toHaveLength(6);
    expect(Object.values(champ.teamPoints).every((p) => p === 0)).toBe(true);
  });

  it('fica "encerrado" só depois de disputar todas as corridas do calendário', () => {
    let champ = createChampionship();
    for (let i = 0; i < CHAMPIONSHIP_CALENDAR.length; i++) {
      expect(isChampionshipComplete(champ)).toBe(false);
      const raceState = runFullRace('purple'); // jogador correndo bem -> tende a pontuar
      champ = applyRaceResultToChampionship(champ, raceState).state;
    }
    expect(isChampionshipComplete(champ)).toBe(true);
    expect(currentChampionshipTrackId(champ)).toBeNull();
  });
});

describe('applyRaceResultToChampionship', () => {
  it('soma pontos de construtores pra TODAS as equipes com posição no top 10, não só o jogador', () => {
    const champ = createChampionship();
    const raceState = runFullRace('purple');
    const { state, pointsGainedThisRace } = applyRaceResultToChampionship(champ, raceState);

    // pelo menos alguma equipe rival (alpha/bravo/etc.) deveria ter pontuado também,
    // já que 10 dos 12 carros pontuam (só P11/P12 ficam de fora).
    const rivalTeamsWithPoints = Object.keys(pointsGainedThisRace).filter((id) => id !== 'player');
    expect(rivalTeamsWithPoints.length).toBeGreaterThan(0);

    // avança o calendário em 1
    expect(state.raceIndex).toBe(champ.raceIndex + 1);
    expect(state.history).toHaveLength(1);
  });

  it('não muta o ChampionshipState original (retorna um novo)', () => {
    const champ = createChampionship();
    const raceState = runFullRace('purple');
    const { state } = applyRaceResultToChampionship(champ, raceState);
    expect(champ.raceIndex).toBe(0); // original intocado
    expect(state).not.toBe(champ);
  });

  it('jogador que termina em P1 contribui os 25 pontos de P1 pra sua equipe ("player")', () => {
    // a equipe "player" soma Carro 1 (jogador) + Carro 2 (companheiro, mesmo
    // teamId "player" no grid — CLAUDE.md Q4: campeonato é de CONSTRUTORES)
    // — por isso o total pode ser MAIOR que 25 se o companheiro também
    // pontuar, nunca menor.
    const champ = createChampionship();
    const s = createRace(track, setup, { startProgress: 10 }); // vantagem gigante -> líder de largada
    let guard = 0;
    while (!s.finished && !s.dnf && guard < 1000) {
      resolveCurrent(s, 'purple', { nitroUsed: false });
      advance(s);
      guard++;
    }
    const { pointsGainedThisRace } = applyRaceResultToChampionship(champ, s);
    expect(pointsGainedThisRace.player).toBeGreaterThanOrEqual(25);
  });
});

describe('sortedStandings', () => {
  it('ordena as equipes por pontos, do maior pro menor', () => {
    const champ = createChampionship();
    champ.teamPoints = { player: 18, alpha: 25, bravo: 6 };
    const standings = sortedStandings(champ);
    expect(standings.map((s) => s.teamId)).toEqual(['alpha', 'player', 'bravo']);
  });
});
