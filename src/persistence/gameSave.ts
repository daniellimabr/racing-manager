/**
 * Esquema de save do Manager (E-205) — energia + timestamp de regen, Gold e
 * inventário/equipamento de peças. Fica sobre o wrapper genérico de
 * `storage.ts`; nenhuma outra parte do código deveria chamar `localStorage`
 * diretamente.
 */
import { loadJSON, saveJSON } from './storage.js';
import {
  ENERGY_MAX, applyEnergyRegen, emptyInventory, receivePart, fuseAll,
  type PartInventory, type PartDrop, type FusionResult, type RaceRewardResult,
} from '../core/economy.js';

const SAVE_KEY = 'save-v1';

export interface GameSave {
  version: 1;
  gold: number;
  energy: number;
  energyLastUpdateMs: number;
  inventory: PartInventory;
}

function defaultSave(): GameSave {
  return {
    version: 1,
    gold: 0,
    energy: ENERGY_MAX,
    energyLastUpdateMs: Date.now(),
    inventory: emptyInventory(),
  };
}

/**
 * Carrega o save (ou cria um novo na 1ª vez) e aplica o regen de energia
 * decorrido desde a última leitura, persistindo o resultado — chamar isto é
 * como "abrir o app" (mesmo espírito de coleta passiva do Archero).
 */
export function loadGame(nowMs: number = Date.now()): GameSave {
  const raw = loadJSON<GameSave>(SAVE_KEY, defaultSave());
  // proteção simples contra saves de versões futuras/incompatíveis — reseta
  // em vez de quebrar; não há migração de schema ainda (v1 é a primeira).
  const save: GameSave = raw.version === 1 && raw.inventory ? raw : defaultSave();
  const regen = applyEnergyRegen(save, nowMs);
  const updated: GameSave = { ...save, energy: regen.energy, energyLastUpdateMs: regen.energyLastUpdateMs };
  saveJSON(SAVE_KEY, updated);
  return updated;
}

export function saveGame(save: GameSave): void {
  saveJSON(SAVE_KEY, save);
}

/** Debita o custo de energia de 1 corrida. Chamador deve checar `canAffordRace` antes. */
export function spendEnergyForRace(save: GameSave, cost: number): GameSave {
  const updated: GameSave = { ...save, energy: Math.max(0, save.energy - cost) };
  saveGame(updated);
  return updated;
}

export interface ApplyRewardsResult {
  save: GameSave;
  fusions: FusionResult[];
}

/**
 * Aplica a recompensa de uma corrida (Gold + peças sorteadas, já calculada
 * por `computeRaceRewards` no core) ao save: soma Gold, recebe cada peça
 * (equipando ou guardando como sobra) e roda a fusão automática 3→1 em
 * cascata. Retorna o save atualizado (já persistido) + a lista de fusões
 * ocorridas, para exibir na tela de resumo.
 */
export function applyRaceRewards(save: GameSave, reward: RaceRewardResult): ApplyRewardsResult {
  // clona o inventário (não muta o objeto do save anterior in-place antes de decidir persistir)
  const inventory: PartInventory = {
    counts: Object.fromEntries(
      Object.entries(save.inventory.counts).map(([slot, counts]) => [slot, { ...counts }])
    ) as PartInventory['counts'],
  };
  for (const drop of reward.partsDropped as PartDrop[]) {
    receivePart(inventory, drop.slot, drop.rarity);
  }
  const fusions = fuseAll(inventory);
  const updated: GameSave = { ...save, gold: save.gold + reward.gold, inventory };
  saveGame(updated);
  return { save: updated, fusions };
}
