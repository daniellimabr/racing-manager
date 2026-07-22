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
import {
  createOffices, applyOfficesProduction, collectOffice, upgradeOffice,
  type OfficesState,
} from '../core/offices.js';

const SAVE_KEY = 'save-v1';

/**
 * v2 (E-207): `inventory.equipped` passou a existir (escolha manual de
 * equipar via Oficina — ver `core/economy.ts`). v1 (sessão anterior,
 * E-203/E-204) não tinha esse campo.
 *
 * v3 (sessão 12, TutorialScene — pedido do PO): `hasSeenTutorial` passou a
 * existir. Saves migrados de v1/v2 (jogador que já tem progresso) entram como
 * `true` — não faz sentido interromper quem já conhece o jogo com o tutorial
 * na próxima vez que abrir. Só saves NOVOS (`defaultSave()`) começam `false`.
 *
 * v4 (sessão 13, Sede/escritórios — E-301): `offices` passou a existir (ver
 * `core/offices.ts`). Saves migrados de v1/v2/v3 ganham escritórios NOVOS
 * (nível 1, sem produção pendente) — não tem como "reconstruir" um histórico
 * de produção que nunca existiu, então começar do zero é o único
 * comportamento que faz sentido aqui (diferente de `hasSeenTutorial`, onde
 * dava pra inferir "já viu" a partir de progresso existente).
 *
 * Ver `migrateSave` para como saves antigos são tratados sem perder progresso
 * nem mudar de comportamento.
 */
const CURRENT_VERSION = 4;

export interface GameSave {
  version: 4;
  gold: number;
  energy: number;
  energyLastUpdateMs: number;
  inventory: PartInventory;
  /** true depois que o jogador viu (ou pulou) a TutorialScene ao menos 1 vez. */
  hasSeenTutorial: boolean;
  /** Sede do time (E-301) — produção passiva de peças por escritório. */
  offices: OfficesState;
}

/**
 * `nowMs` explícito (não `Date.now()` interno): achado real na sessão 13 —
 * `energyLastUpdateMs` "funcionava" mesmo com `Date.now()` hardcoded aqui
 * porque `applyEnergyRegen` resincroniza o relógio pro `nowMs` de verdade
 * sempre que a energia já está no teto (que é o caso de um save novo). Os
 * escritórios não têm esse mesmo atalho (começam com 0 pendente, não "no
 * teto"), então usar `Date.now()` aqui fazia `applyOfficesProduction` comparar
 * contra um timestamp de parede real vs. o `nowMs` sintético dos testes —
 * `elapsedMs` dava sempre negativo (viravam 0 pelo `Math.max`), produção
 * nunca avançava. Corrigido usando o mesmo `nowMs` em tudo.
 */
function defaultSave(nowMs: number): GameSave {
  return {
    version: CURRENT_VERSION,
    gold: 0,
    energy: ENERGY_MAX,
    energyLastUpdateMs: nowMs,
    inventory: emptyInventory(),
    hasSeenTutorial: false,
    offices: createOffices(nowMs),
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
function migrateSave(raw: unknown, nowMs: number): GameSave {
  if (!raw || typeof raw !== 'object') return defaultSave(nowMs);
  const r = raw as {
    version?: unknown; gold?: unknown; energy?: unknown; energyLastUpdateMs?: unknown; hasSeenTutorial?: unknown;
    offices?: unknown;
    inventory?: { counts?: PartInventory['counts']; equipped?: Partial<Record<PartSlot, Rarity | null>> };
  };
  const knownVersion = r.version === 1 || r.version === 2 || r.version === 3 || r.version === CURRENT_VERSION;
  if (!knownVersion || !r.inventory?.counts) return defaultSave(nowMs);

  const equipped = { ...(r.inventory.equipped ?? {}) } as Record<PartSlot, Rarity | null>;
  for (const slot of PART_SLOTS) {
    if (!(slot in equipped)) equipped[slot] = null;
  }
  // saves v1/v2 (sem hasSeenTutorial) são de jogador com progresso existente —
  // tratado como "já viu" o tutorial, pra não interromper quem já conhece o jogo.
  const hasSeenTutorial = typeof r.hasSeenTutorial === 'boolean' ? r.hasSeenTutorial : true;
  // saves v1/v2/v3 (sem offices) ganham escritórios novos — não tem histórico
  // de produção pra reconstruir, ver nota de versão acima.
  const offices = (r.offices && typeof r.offices === 'object') ? (r.offices as OfficesState) : createOffices(nowMs);
  return {
    version: CURRENT_VERSION,
    gold: typeof r.gold === 'number' ? r.gold : 0,
    energy: typeof r.energy === 'number' ? r.energy : ENERGY_MAX,
    energyLastUpdateMs: typeof r.energyLastUpdateMs === 'number' ? r.energyLastUpdateMs : nowMs,
    inventory: { counts: r.inventory.counts, equipped },
    hasSeenTutorial,
    offices,
  };
}

/**
 * Carrega o save (ou cria um novo na 1ª vez) e aplica o regen de energia
 * decorrido desde a última leitura, persistindo o resultado — chamar isto é
 * como "abrir o app" (mesmo espírito de coleta passiva do Archero).
 */
export function loadGame(nowMs: number = Date.now()): GameSave {
  const raw = loadJSON<unknown>(SAVE_KEY, null);
  const save: GameSave = raw === null ? defaultSave(nowMs) : migrateSave(raw, nowMs);
  const regen = applyEnergyRegen(save, nowMs);
  const offices = applyOfficesProduction(save.offices, nowMs);
  const updated: GameSave = { ...save, energy: regen.energy, energyLastUpdateMs: regen.energyLastUpdateMs, offices };
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

/** Marca o tutorial como visto/pulado (TutorialScene, sessão 12) — persistido pra não aparecer de novo sozinho. */
export function markTutorialSeen(save: GameSave): GameSave {
  const updated: GameSave = { ...save, hasSeenTutorial: true };
  saveGame(updated);
  return updated;
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

/**
 * Coleta a produção pendente de 1 escritório (Sede, E-301) — soma as peças
 * ao inventário (podem disparar fusão automática, igual às peças de corrida)
 * e persiste. Retorna as fusões ocorridas pra exibir na tela, mesmo padrão
 * de `applyRaceRewards`.
 */
export function collectOfficeParts(save: GameSave, slot: PartSlot): ApplyRewardsResult {
  const { offices, collected } = collectOffice(save.offices, slot);
  const inventory = cloneInventory(save.inventory);
  for (const part of collected) receivePart(inventory, part.slot, part.rarity);
  const fusions = fuseAll(inventory);
  const updated: GameSave = { ...save, offices, inventory };
  saveGame(updated);
  return { save: updated, fusions };
}

/**
 * Sobe 1 nível um escritório (Sede, E-301), debitando o custo em Gold. `null`
 * = não aplicado (sem Gold suficiente ou escritório já no nível máximo) —
 * mesmo padrão defensivo de `equipPart`.
 */
export function upgradeOfficeLevel(save: GameSave, slot: PartSlot): GameSave | null {
  const result = upgradeOffice(save.offices, slot, save.gold);
  if (!result) return null;
  const updated: GameSave = { ...save, offices: result.offices, gold: save.gold - result.goldSpent };
  saveGame(updated);
  return updated;
}
