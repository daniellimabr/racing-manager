import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame, saveGame, spendEnergyForRace, applyRaceRewards } from '../src/persistence/gameSave.js';
import { clear } from '../src/persistence/storage.js';
import { ENERGY_MAX, ENERGY_COST_PER_RACE, ENERGY_REGEN_MINUTES_PER_POINT } from '../src/core/economy.js';

// Ambiente de teste (vitest) roda em Node — sem `localStorage`, o wrapper cai
// no fallback em memória (ver storage.ts). `clear` entre testes evita um save
// vazar para o próximo (o fallback em memória é global ao módulo/processo).
beforeEach(() => clear('save-v1'));

describe('gameSave (E-205)', () => {
  it('1ª carga cria um save novo com energia cheia e 0 Gold', () => {
    const save = loadGame(1_000_000);
    expect(save.energy).toBe(ENERGY_MAX);
    expect(save.gold).toBe(0);
    expect(save.inventory).toBeDefined();
  });

  it('persiste entre chamadas (simula fechar/reabrir o app)', () => {
    const save = loadGame(1_000_000);
    const spent = spendEnergyForRace(save, ENERGY_COST_PER_RACE);
    expect(spent.energy).toBe(ENERGY_MAX - ENERGY_COST_PER_RACE);

    const reloaded = loadGame(1_000_000); // "reabre o app" no mesmo instante — sem regen ainda
    expect(reloaded.energy).toBe(ENERGY_MAX - ENERGY_COST_PER_RACE);
  });

  it('regenera energia entre 2 loads com o tempo passando', () => {
    const save = loadGame(0);
    spendEnergyForRace(save, ENERGY_COST_PER_RACE);
    const intervalMs = ENERGY_REGEN_MINUTES_PER_POINT * 60_000;
    const reloaded = loadGame(intervalMs * 3);
    expect(reloaded.energy).toBe(ENERGY_MAX - ENERGY_COST_PER_RACE + 3);
  });

  it('applyRaceRewards soma Gold e peças, aplicando fusão automática', () => {
    const save = loadGame(0);
    const r1 = applyRaceRewards(save, { gold: 100, partsDropped: [{ slot: 'motor', rarity: 'gray' }] });
    expect(r1.save.gold).toBe(100);
    expect(r1.save.inventory.counts.motor.gray).toBe(1);
    expect(r1.fusions).toEqual([]);

    const r2 = applyRaceRewards(r1.save, {
      gold: 50,
      partsDropped: [
        { slot: 'motor', rarity: 'gray' },
        { slot: 'motor', rarity: 'gray' },
      ],
    });
    expect(r2.save.gold).toBe(150);
    expect(r2.fusions).toEqual([{ slot: 'motor', from: 'gray', to: 'green' }]);
    expect(r2.save.inventory.counts.motor.green).toBe(1);
    expect(r2.save.inventory.counts.motor.gray).toBe(0);
  });

  it('saveGame grava o objeto exato passado (round-trip via loadGame)', () => {
    const save = loadGame(0);
    const modified = { ...save, gold: 999 };
    saveGame(modified);
    const reloaded = loadGame(0);
    expect(reloaded.gold).toBe(999);
  });
});
