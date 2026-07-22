import { describe, it, expect } from 'vitest';
import {
  ENERGY_MAX, ENERGY_COST_PER_RACE, ENERGY_REGEN_MINUTES_PER_POINT,
  applyEnergyRegen, msUntilNextEnergyPoint, canAffordRace,
  goldForPosition, computeRaceRewards, rollPartDropsForRace, auraForPosition,
  emptyInventory, receivePart, fuseAll, computeZoneScale, equippedRarity, setEquipped,
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

  it('computeRaceRewards só dá Aura pro pódio (P1-P3), 0 fora dele (E-305, sessão 14)', () => {
    expect(computeRaceRewards({ position: 1, dnf: false, goldPenalty: 0 }).aura).toBeGreaterThan(0);
    expect(computeRaceRewards({ position: 3, dnf: false, goldPenalty: 0 }).aura).toBeGreaterThan(0);
    expect(computeRaceRewards({ position: 4, dnf: false, goldPenalty: 0 }).aura).toBe(0);
    expect(computeRaceRewards({ position: 12, dnf: false, goldPenalty: 0 }).aura).toBe(0);
  });

  it('auraForPosition dá mais pra P1 do que pra P3', () => {
    expect(auraForPosition(1)).toBeGreaterThan(auraForPosition(3));
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

describe('equipar manualmente (E-207, Oficina — PO rejeitou auto-equip como solução permanente)', () => {
  it('setEquipped só aceita raridade que o jogador possui em quantidade > 0', () => {
    const inv = emptyInventory();
    receivePart(inv, 'pneu', 'gray');
    expect(setEquipped(inv, 'pneu', 'blue')).toBe(false); // não possui blue
    expect(equippedRarity(inv, 'pneu')).toBe('gray'); // continua no fallback automático (só tem gray)
  });

  it('equipar manualmente uma raridade não-ótima é respeitado, não força a melhor', () => {
    const inv = emptyInventory();
    receivePart(inv, 'chassis', 'gray');
    receivePart(inv, 'chassis', 'purple'); // jogador também possui uma peça melhor
    expect(setEquipped(inv, 'chassis', 'gray')).toBe(true);
    expect(equippedRarity(inv, 'chassis')).toBe('gray'); // escolha do jogador prevalece sobre a melhor possuída
  });

  it('sem escolha própria (equipped null), continua caindo no fallback automático (comportamento antigo preservado)', () => {
    const inv = emptyInventory();
    receivePart(inv, 'motor', 'gray');
    receivePart(inv, 'motor', 'blue');
    expect(equippedRarity(inv, 'motor')).toBe('blue'); // nunca chamou setEquipped
  });

  it('fallback automático quando a raridade escolhida pelo jogador some do inventário (ex.: toda fundida)', () => {
    const inv = emptyInventory();
    receivePart(inv, 'motor', 'gray');
    receivePart(inv, 'motor', 'gray');
    receivePart(inv, 'motor', 'gray');
    receivePart(inv, 'motor', 'blue');
    expect(setEquipped(inv, 'motor', 'gray')).toBe(true); // escolhe gray de propósito, mesmo tendo blue
    expect(equippedRarity(inv, 'motor')).toBe('gray');

    fuseAll(inv); // funde os 3 gray em 1 green — a raridade escolhida (gray) some do inventário
    expect(inv.counts.motor.gray).toBe(0);
    // fallback automático pra melhor restante (blue > green), não força a raridade recém-criada (green)
    expect(equippedRarity(inv, 'motor')).toBe('blue');
  });

  it('computeZoneScale reflete a escolha manual, não sempre a melhor possuída', () => {
    const invAuto = emptyInventory();
    receivePart(invAuto, 'pneu', 'gold');

    const invManual = emptyInventory();
    receivePart(invManual, 'pneu', 'gray');
    receivePart(invManual, 'pneu', 'gold');
    setEquipped(invManual, 'pneu', 'gray'); // escolhe a pior de propósito

    expect(computeZoneScale(invManual)).toBeLessThan(computeZoneScale(invAuto));
  });
});
