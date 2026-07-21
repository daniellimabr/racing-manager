import { describe, it, expect } from 'vitest';
import {
  ENERGY_MAX, ENERGY_COST_PER_RACE, ENERGY_REGEN_MINUTES_PER_POINT,
  applyEnergyRegen, msUntilNextEnergyPoint, canAffordRace,
  goldForPosition, computeRaceRewards, rollPartDropsForRace,
  emptyInventory, receivePart, fuseAll, computeZoneScale, equippedRarity,
  RARITIES, PART_SLOTS,
} from '../src/core/economy.js';

const INTERVAL_MS = ENERGY_REGEN_MINUTES_PER_POINT * 60_000;

describe('energia (E-201)', () => {
  it('não regenera antes de 1 intervalo completo', () => {
    const state = { energy: 10, energyLastUpdateMs: 0 };
    const after = applyEnergyRegen(state, INTERVAL_MS - 1);
    expect(after.energy).toBe(10);
    expect(after.energyLastUpdateMs).toBe(0);
  });

  it('regenera 1 ponto por intervalo completo, preservando o resto', () => {
    const state = { energy: 10, energyLastUpdateMs: 0 };
    const after = applyEnergyRegen(state, INTERVAL_MS + 1000);
    expect(after.energy).toBe(11);
    // o timestamp avança exatamente 1 intervalo (não pula pra "now") — o resto de
    // 1000ms ainda não convertido em ponto continua contando na próxima chamada
    expect(after.energyLastUpdateMs).toBe(INTERVAL_MS);
  });

  it('regenera múltiplos pontos de uma vez (app fechado por horas)', () => {
    const state = { energy: 0, energyLastUpdateMs: 0 };
    const after = applyEnergyRegen(state, INTERVAL_MS * 5);
    expect(after.energy).toBe(5);
  });

  it('nunca ultrapassa o teto, mesmo com muito tempo decorrido', () => {
    const state = { energy: 0, energyLastUpdateMs: 0 };
    const after = applyEnergyRegen(state, INTERVAL_MS * 1000);
    expect(after.energy).toBe(ENERGY_MAX);
  });

  it('já no teto, não faz nada além de atualizar o timestamp', () => {
    const state = { energy: ENERGY_MAX, energyLastUpdateMs: 0 };
    const after = applyEnergyRegen(state, 999_999);
    expect(after.energy).toBe(ENERGY_MAX);
    expect(after.energyLastUpdateMs).toBe(999_999);
  });

  it('msUntilNextEnergyPoint conta corretamente dentro do intervalo', () => {
    const state = { energy: 5, energyLastUpdateMs: 0 };
    expect(msUntilNextEnergyPoint(state, 1000)).toBe(INTERVAL_MS - 1000);
    expect(msUntilNextEnergyPoint({ energy: ENERGY_MAX, energyLastUpdateMs: 0 }, 1000)).toBe(0);
  });

  it('canAffordRace respeita o custo por corrida', () => {
    expect(canAffordRace(ENERGY_COST_PER_RACE)).toBe(true);
    expect(canAffordRace(ENERGY_COST_PER_RACE - 1)).toBe(false);
  });
});

describe('gold por posição (E-202)', () => {
  it('P1 ganha mais que P12', () => {
    expect(goldForPosition(1)).toBeGreaterThan(goldForPosition(12));
  });

  it('clampa posições fora de 1..12', () => {
    expect(goldForPosition(0)).toBe(goldForPosition(1));
    expect(goldForPosition(99)).toBe(goldForPosition(12));
  });

  it('computeRaceRewards deduz a penalidade de crash sem ficar negativo', () => {
    const r = computeRaceRewards({ position: 12, dnf: true, goldPenalty: 9999 });
    expect(r.gold).toBe(0);
  });

  it('rollPartDropsForRace nunca sorteia mais que 2 peças', () => {
    const rngAlwaysHit = () => 0; // sempre "acerta" a chance de drop (e a raridade mais comum)
    expect(rollPartDropsForRace(1, rngAlwaysHit).length).toBeLessThanOrEqual(2);
  });

  it('rngAlwaysMiss (rng=1) nunca sorteia peça nenhuma', () => {
    const rngNeverHits = () => 0.999999;
    expect(rollPartDropsForRace(1, rngNeverHits)).toEqual([]);
    expect(rollPartDropsForRace(12, rngNeverHits)).toEqual([]);
  });

  it('pódio (top3) tem chance de drop maior que fora do pódio', () => {
    // com um rng fixo "no meio" (0.5), pódio já teria acertado a chance base
    // (0.55) enquanto o fundo de tabela (chance 0.22) não — confirma a ordem
    // sem depender de estatística/RNG de verdade
    const rngMid = () => 0.5;
    expect(rollPartDropsForRace(1, rngMid).length).toBeGreaterThan(rollPartDropsForRace(12, rngMid).length);
  });
});

describe('inventário, drops e fusão 3→1 (E-203)', () => {
  it('sem nenhuma peça, o slot não tem "equipada" (melhor raridade possuída)', () => {
    const inv = emptyInventory();
    expect(equippedRarity(inv, 'motor')).toBeNull();
  });

  it('"equipada" é sempre a melhor raridade que o jogador possui no slot', () => {
    const inv = emptyInventory();
    receivePart(inv, 'motor', 'gray');
    receivePart(inv, 'motor', 'blue');
    receivePart(inv, 'motor', 'green');
    expect(equippedRarity(inv, 'motor')).toBe('blue');
  });

  it('3 peças iguais fundem em 1 da raridade seguinte', () => {
    const inv = emptyInventory();
    receivePart(inv, 'pneu', 'gray');
    receivePart(inv, 'pneu', 'gray');
    receivePart(inv, 'pneu', 'gray');
    const fusions = fuseAll(inv);
    expect(fusions).toEqual([{ slot: 'pneu', from: 'gray', to: 'green' }]);
    expect(inv.counts.pneu.gray).toBe(0);
    expect(inv.counts.pneu.green).toBe(1);
    expect(equippedRarity(inv, 'pneu')).toBe('green');
  });

  it('fusão em cascata: 9 gray viram 1 blue (via 3 green intermediários)', () => {
    const inv = emptyInventory();
    for (let i = 0; i < 9; i++) receivePart(inv, 'chassis', 'gray');
    const fusions = fuseAll(inv);
    expect(fusions.map((f) => `${f.from}->${f.to}`)).toEqual(['gray->green', 'gray->green', 'gray->green', 'green->blue']);
    expect(equippedRarity(inv, 'chassis')).toBe('blue');
    expect(inv.counts.chassis.gray).toBe(0);
    expect(inv.counts.chassis.green).toBe(0);
    expect(inv.counts.chassis.blue).toBe(1);
  });

  it('red é raridade máxima — peças nela não fundem em nada', () => {
    const inv = emptyInventory();
    receivePart(inv, 'motor', 'red');
    receivePart(inv, 'motor', 'red');
    receivePart(inv, 'motor', 'red');
    receivePart(inv, 'motor', 'red');
    const fusions = fuseAll(inv);
    expect(fusions).toEqual([]);
    expect(inv.counts.motor.red).toBe(4);
  });

  it('computeZoneScale é 1 (base) sem nenhuma peça', () => {
    const inv = emptyInventory();
    expect(computeZoneScale(inv)).toBe(1);
  });

  it('computeZoneScale sobe com peças melhores', () => {
    const inv = emptyInventory();
    for (const slot of PART_SLOTS) receivePart(inv, slot, 'gold');
    expect(computeZoneScale(inv)).toBeGreaterThan(1);
  });

  it('todas as raridades estão em ordem crescente conhecida', () => {
    expect(RARITIES).toEqual(['gray', 'green', 'blue', 'purple', 'gold', 'red']);
  });
});
