/**
 * Esquema de save do Manager (E-205) — energia + timestamp de regen, Gold e
 * inventário/equipamento de peças. Fica sobre o wrapper genérico de
 * `storage.ts`; nenhuma outra parte do código deveria chamar `localStorage`
 * diretamente.
 */
import { loadJSON, saveJSON } from './storage.js';
import {
  ENERGY_MAX, applyEnergyRegen, emptyInventory, receivePart, fuseAll, cloneInventory, setEquipped, PART_SLOTS,
  type PartInventory, type PartDrop, type FusionResult, type RaceRewardResult, type PartSlot, type Rarity,
} from '../core/economy.js';

const SAVE_KEY = 'save-v1';

/**
 * v2 (E-207, esta sessão): `inventory.equipped` passou a existir (escolha
 * manual de equipar via Oficina — ver `core/economy.ts`). v1 (sessão
 * anterior, E-203/E-204) não tinha esse campo — ver `migrateSave` para como
 * saves antigos são tratados sem perder progresso nem mudar de comportamento.
 */
const CURRENT_VERSION = 2;

export interface GameSave {
  version: 2;
  gold: number;
  energy: number;
  energyLastUpdateMs: number;
  inventory: PartInventory;
}

function defaultSave(): GameSave {
  return {
    version: CURRENT_VERSION,
    gold: 0,
    energy: ENERGY_MAX,
    energyLastUpdateMs: Date.now(),
    inventory: emptyInventory(),
  };
}

/**
 * Migra um valor "cru" lido do storage (JSON.parse, tipo desconhecido) pro
 * schema atual (v2). Trata especificamente o caso real de saves já gravados
 * pela sessão anterior (v1, sem `inventory.equipped`): a ausência do campo
 * é tratada como "sem escolha própria ainda" (`null` em todos os 7 slots),
 * que é EXATAMENTE o comportamento antigo de auto-equipar a melhor raridade
 * possuída (`equippedRarity()` já cai nesse fallback automático quando não
 * há escolha) — nenhum save existente perde Gold/energia/peças, e o
 * jogador só percebe qualquer diferença quando equipar manualmente pela 1ª
 * vez na Oficina. Qualquer coisa irreconhecível (corrompida, versão futura
 * desconhecida) reseta para um save novo — mesma proteção simples de antes.
 */
function migrateSave(raw: unknown): GameSave {
  if (!raw || typeof raw !== 'object') return defaultSave();
  const r = raw as {
    version?: unknown; gold?: unknown; energy?: unknown; energyLastUpdateMs?: unknown;
    inventory?: { counts?: PartInventory['counts']; equipped?: Partial<Record<PartSlot, Rarity | null>> };
  };
  if ((r.version !== 1 && r.version !== CURRENT_VERSION) || !r.inventory?.counts) return defaultSave();

  const equipped = { ...(r.inventory.equipped ?? {}) } as Record<PartSlot, Rarity | null>;
  for (const slot of PART_SLOTS) {
    if (!(slot in equipped)) equipped[slot] = null;
  }
  return {
    version: CURRENT_VERSION,
    gold: typeof r.gold === 'number' ? r.gold : 0,
    energy: typeof r.energy === 'number' ? r.energy : ENERGY_MAX,
    energyLastUpdateMs: typeof r.energyLastUpdateMs === 'number' ? r.energyLastUpdateMs : Date.now(),
    inventory: { counts: r.inventory.counts, equipped },
  };
}

/**
 * Carrega o save (ou cria um novo na 1ª vez) e aplica o regen de energia
 * decorrido desde a última leitura, persistindo o resultado — chamar isto é
 * como "abrir o app" (mesmo espírito de coleta passiva do Archero).
 */
export function loadGame(nowMs: number = Date.now()): GameSave {
  const raw = loadJSON<unknown>(SAVE_KEY, null);
  const save: GameSave = raw === null ? defaultSave() : migrateSave(raw);
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
  const inventory: PartInventory = cloneInventory(save.inventory);
  for (const drop of reward.partsDropped as PartDrop[]) {
    receivePart(inventory, drop.slot, drop.rarity);
  }
  const fusions = fuseAll(inventory);
  const updated: GameSave = { ...save, gold: save.gold + reward.gold, inventory };
  saveGame(updated);
  return { save: updated, fusions };
}

/**
 * Equipa manualmente uma raridade num slot (Oficina, E-207) — escolha
 * explícita do jogador (`core/economy.ts` `setEquipped`), persistida no save.
 * Só aceita raridades que o jogador efetivamente possui em quantidade > 0;
 * uma escolha inválida é um no-op silencioso que retorna o mesmo `save`
 * (defensivo — a `OficinaScene` só deveria oferecer raridades possuídas, então
 * isso não deveria acontecer na prática pela UI normal).
 */
export function equipPart(save: GameSave, slot: PartSlot, rarity: Rarity): GameSave {
  const inventory = cloneInventory(save.inventory);
  const applied = setEquipped(inventory, slot, rarity);
  if (!applied) return save;
  const updated: GameSave = { ...save, inventory };
  saveGame(updated);
  return updated;
}
