import { describe, it, expect } from 'vitest';
import { CHEST_TIERS, CHESTS, openChest } from '../src/core/chests.js';

describe('CHESTS', () => {
  it('os 4 tiers existem, com custo em Aura e chance de raridade alta crescentes', () => {
    expect(CHEST_TIERS).toEqual(['bronze', 'prata', 'ouro', 'platina']);
    for (let i = 1; i < CHEST_TIERS.length; i++) {
      const prev = CHESTS[CHEST_TIERS[i - 1]];
      const curr = CHESTS[CHEST_TIERS[i]];
      expect(curr.auraCost).toBeGreaterThan(prev.auraCost);
      expect(curr.weights.gray).toBeLessThan(prev.weights.gray); // menos "gray" = mais chance de raridade alta
    }
  });

  it('os pesos de cada baú somam ~1', () => {
    for (const tier of CHEST_TIERS) {
      const w = CHESTS[tier].weights;
      const total = w.gray + w.green + w.blue + w.purple + w.gold + w.red;
      expect(total).toBeCloseTo(1, 5);
    }
  });
});

describe('openChest', () => {
  it('devolve exatamente partsCount peças', () => {
    for (const tier of CHEST_TIERS) {
      const drops = openChest(tier, () => 0.5);
      expect(drops.length).toBe(CHESTS[tier].partsCount);
    }
  });

  it('rng=0 sempre sorteia a raridade mais comum (gray) de cada baú', () => {
    const drops = openChest('bronze', () => 0);
    expect(drops.every((d) => d.rarity === 'gray')).toBe(true);
  });

  it('platina consegue sortear a raridade máxima (red) com rng no topo', () => {
    const drops = openChest('platina', () => 0.999999);
    expect(drops.some((d) => d.rarity === 'red')).toBe(true);
  });
});
