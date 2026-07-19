import { describe, it, expect } from 'vitest';
import { createGridSim, advanceGrid, deriveStandings } from '../src/core/grid.js';

describe('createGridSim', () => {
  it('cria 11 carros: 5 equipes x 2 + 1 companheiro de equipe', () => {
    const grid = createGridSim(() => 0.5);
    expect(grid.cars.length).toBe(11);
    expect(grid.cars.filter((c) => c.isTeammate).length).toBe(1);
    const teamCounts = new Map<string, number>();
    for (const c of grid.cars) {
      if (c.isTeammate) continue;
      teamCounts.set(c.teamId, (teamCounts.get(c.teamId) ?? 0) + 1);
    }
    expect(teamCounts.size).toBe(5);
    for (const count of teamCounts.values()) expect(count).toBe(2);
  });

  it('ids são únicos', () => {
    const grid = createGridSim();
    const ids = new Set(grid.cars.map((c) => c.id));
    expect(ids.size).toBe(grid.cars.length);
  });
});

describe('deriveStandings', () => {
  it('gera 12 posições únicas (11 carros + jogador), ordenadas por tempo', () => {
    const grid = createGridSim();
    const standings = deriveStandings(grid, { id: 'player', label: 'Jogador', cumulativeTime: 0 });
    expect(standings.length).toBe(12);
    const positions = standings.map((s) => s.position).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (let i = 1; i < standings.length; i++) {
      expect(standings[i].gapToLeader).toBeGreaterThanOrEqual(standings[i - 1].gapToLeader);
    }
    expect(standings[0].gapToLeader).toBe(0);
  });

  it('o jogador aparece exatamente 1x, marcado como isPlayer', () => {
    const grid = createGridSim();
    const standings = deriveStandings(grid, { id: 'player', label: 'Jogador', cumulativeTime: -3 });
    const playerEntries = standings.filter((s) => s.isPlayer);
    expect(playerEntries.length).toBe(1);
    expect(playerEntries[0].position).toBe(1); // muito à frente (tempo bem negativo) => líder
  });
});

describe('advanceGrid', () => {
  it('com rng determinístico (sempre tier roxo), reduz o tempo de cada carro pelo GAIN roxo * paceFactor', () => {
    const grid = createGridSim(() => 0.5); // jitter neutro
    const before = { ...grid.cumulativeTime };
    advanceGrid(grid, () => 0); // r=0 cai sempre no primeiro tier com peso > 0 (roxo)
    for (const car of grid.cars) {
      const expectedGain = 0.30 * car.paceFactor; // GAIN.purple
      expect(grid.cumulativeTime[car.id]).toBeCloseTo(before[car.id] - expectedGain, 5);
    }
  });

  it('ao longo de várias voltas, a ordem entre carros de IA muda (ultrapassagens acontecem)', () => {
    const grid = createGridSim();
    const initialOrder = deriveStandings(grid, { id: 'player', label: 'J', cumulativeTime: 0 })
      .filter((s) => !s.isPlayer).map((s) => s.id).join(',');

    for (let i = 0; i < 150; i++) advanceGrid(grid);

    const laterOrder = deriveStandings(grid, { id: 'player', label: 'J', cumulativeTime: 0 })
      .filter((s) => !s.isPlayer).map((s) => s.id).join(',');

    expect(laterOrder).not.toBe(initialOrder);
  });
});
