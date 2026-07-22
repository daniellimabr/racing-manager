/**
 * Loja/baús + Aura (E-305, CLAUDE.md §5 tela 6/§6.2, sessão 14). Camada
 * `core`: pura, sem dependência de engine nem `localStorage` (mesma regra do
 * resto do `core/`).
 *
 * CLAUDE.md §6.2 já definia o formato ("Baús de peças: bronze/prata/ouro/
 * platina, com chance de raridade crescente... Ganhos em corridas, eventos e
 * loja (slots)") mas não os números — proposta inicial nesta sessão, mesmo
 * espírito conservador de `DROP_WEIGHTS_BY_TIER` (economy.ts): baú caro tem
 * chance MELHOR de raridade alta, mas raramente entrega o topo (`red`) direto
 * — isso continua vindo principalmente de fusão em cascata, não de sorte de
 * baú. Sujeito a calibração pelo `economyHarness` numa sessão futura.
 *
 * **Fonte de Aura nesta sessão:** só pódio de corrida (`auraForPosition`) —
 * IAP real está deliberadamente fora de escopo (CLAUDE.md §7, "estratégia de
 * monetização... adiada"). O valor da moeda Aura em si e a tela de Loja não
 * são monetização, só a estrutura de dado — comprar Aura com dinheiro real
 * continua fora de escopo.
 */
import { PART_SLOTS, RARITIES, type PartSlot, type Rarity, type PartDrop } from './economy.js';

export type ChestTier = 'bronze' | 'prata' | 'ouro' | 'platina';
export const CHEST_TIERS: readonly ChestTier[] = ['bronze', 'prata', 'ouro', 'platina'];

export interface ChestDef {
  tier: ChestTier;
  name: string;
  auraCost: number;
  /** quantas peças o baú entrega de uma vez (independentes entre si, mesmo peso de raridade cada) */
  partsCount: number;
  weights: Record<Rarity, number>;
}

export const CHESTS: Record<ChestTier, ChestDef> = {
  bronze: {
    tier: 'bronze', name: 'Baú de Bronze', auraCost: 10, partsCount: 1,
    weights: { gray: 0.70, green: 0.25, blue: 0.05, purple: 0, gold: 0, red: 0 },
  },
  prata: {
    tier: 'prata', name: 'Baú de Prata', auraCost: 25, partsCount: 1,
    weights: { gray: 0.55, green: 0.30, blue: 0.13, purple: 0.02, gold: 0, red: 0 },
  },
  ouro: {
    tier: 'ouro', name: 'Baú de Ouro', auraCost: 60, partsCount: 2,
    weights: { gray: 0.30, green: 0.35, blue: 0.25, purple: 0.08, gold: 0.02, red: 0 },
  },
  platina: {
    tier: 'platina', name: 'Baú de Platina', auraCost: 150, partsCount: 3,
    weights: { gray: 0.10, green: 0.25, blue: 0.35, purple: 0.20, gold: 0.08, red: 0.02 },
  },
};

function weightedPickRarity(weights: Record<Rarity, number>, rng: () => number): Rarity {
  const r = rng();
  let acc = 0;
  for (const rarity of RARITIES) {
    acc += weights[rarity];
    if (r <= acc) return rarity;
  }
  return 'gray';
}

/** Abre 1 baú — devolve `chest.partsCount` peças, cada uma com slot aleatório e raridade sorteada pelo peso do baú. */
export function openChest(tier: ChestTier, rng: () => number = Math.random): PartDrop[] {
  const chest = CHESTS[tier];
  const drops: PartDrop[] = [];
  for (let i = 0; i < chest.partsCount; i++) {
    const slot: PartSlot = PART_SLOTS[Math.floor(rng() * PART_SLOTS.length)];
    const rarity = weightedPickRarity(chest.weights, rng);
    drops.push({ slot, rarity });
  }
  return drops;
}
