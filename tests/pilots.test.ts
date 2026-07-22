import { describe, it, expect } from 'vitest';
import { AVAILABLE_PILOTS, findPilot, pilotTierWeights, pilotPaceFactor, pilotDevCarroBonus } from '../src/core/pilots.js';

describe('AVAILABLE_PILOTS', () => {
  it('tem 4 candidatos com ids únicos', () => {
    expect(AVAILABLE_PILOTS.length).toBe(4);
    const ids = new Set(AVAILABLE_PILOTS.map((p) => p.id));
    expect(ids.size).toBe(4);
  });

  it('findPilot acha um piloto existente e retorna undefined pra um id desconhecido', () => {
    expect(findPilot('veterano')?.name).toBe('Veterano de Equipe');
    expect(findPilot('nao-existe')).toBeUndefined();
  });
});

describe('pilotTierWeights', () => {
  it('soma ~1 (é uma distribuição de probabilidade válida) pra qualquer piloto', () => {
    for (const pilot of AVAILABLE_PILOTS) {
      const w = pilotTierWeights(pilot);
      const total = w.purple + w.green + w.amber + w.red + w.miss;
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('piloto com skills de pilotagem mais altas tem mais chance de purple/green', () => {
    const rookie = findPilot('rookie')!;
    const veterano = findPilot('veterano')!;
    const wRookie = pilotTierWeights(rookie);
    const wVeterano = pilotTierWeights(veterano);
    expect(wVeterano.purple).toBeGreaterThan(wRookie.purple);
    expect(wVeterano.miss).toBeLessThan(wRookie.miss);
  });
});

describe('pilotPaceFactor', () => {
  it('fica entre 0.90 e 1.10', () => {
    for (const pilot of AVAILABLE_PILOTS) {
      const pace = pilotPaceFactor(pilot);
      expect(pace).toBeGreaterThanOrEqual(0.90);
      expect(pace).toBeLessThanOrEqual(1.10);
    }
  });

  it('piloto com pace maior tem paceFactor maior', () => {
    const rookie = findPilot('rookie')!; // pace 45
    const veterano = findPilot('veterano')!; // pace 72
    expect(pilotPaceFactor(veterano)).toBeGreaterThan(pilotPaceFactor(rookie));
  });
});

describe('pilotDevCarroBonus', () => {
  it('fica entre 0 e 0.1', () => {
    for (const pilot of AVAILABLE_PILOTS) {
      const bonus = pilotDevCarroBonus(pilot);
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(bonus).toBeLessThanOrEqual(0.1);
    }
  });
});
