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
  createMarketingOffice, applyMarketingProduction, upgradeMarketingOffice,
  type OfficesState, type MarketingOfficeState,
} from '../core/offices.js';
import { findPilot } from '../core/pilots.js';
import { findSponsor, totalSponsorGoldBonusPct, LIVERY_SPONSOR_SLOTS } from '../core/sponsors.js';
import { CHESTS, openChest, type ChestTier } from '../core/chests.js';

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
 * v5 (sessão 14, Pilotos — E-302): `pilotRoster`/`activePilotId` passaram a
 * existir. Saves migrados começam sem nenhum piloto contratado — comportamento
 * idêntico ao que já existia (companheiro usa o perfil "Médio" fixo até
 * alguém contratar e escalar um piloto de verdade).
 *
 * v6 (sessão 14, Patrocinadores da livery — Claude-Manager.md §5 item 6):
 * `marketingOffice`, `reputacao` e `hiredSponsorIds` passaram a existir.
 * Saves migrados ganham um escritório de marketing NOVO (nível 1, sem
 * produção pendente — mesmo raciocínio dos outros 7 escritórios no v4: não
 * dá pra reconstruir um histórico de produção que nunca existiu) e nenhum
 * patrocinador contratado (Reputação também começa em 0).
 *
 * v7 (sessão 14, Loja/baús + Aura — E-305): `aura` passou a existir. Saves
 * migrados começam com 0 Aura — não tem como reconstruir pódios já corridos
 * antes desta feature existir, mesmo raciocínio de "começa do zero" do v4/v6.
 *
 * Ver `migrateSave` para como saves antigos são tratados sem perder progresso
 * nem mudar de comportamento.
 */
const CURRENT_VERSION = 7;

export interface GameSave {
  version: 7;
  gold: number;
  energy: number;
  energyLastUpdateMs: number;
  inventory: PartInventory;
  /** true depois que o jogador viu (ou pulou) a TutorialScene ao menos 1 vez. */
  hasSeenTutorial: boolean;
  /** Sede do time (E-301) — produção passiva de peças por escritório. */
  offices: OfficesState;
  /** ids dos pilotos contratados (E-302) — não confundir com quem está ativo, ver `activePilotId`. */
  pilotRoster: string[];
  /** id do piloto escalado pra guiar o Carro 2, ou `null` (usa o perfil "Médio" padrão). */
  activePilotId: string | null;
  /** Escritório de marketing — produz Reputação, usada pra contratar patrocinadores da livery. */
  marketingOffice: MarketingOfficeState;
  /** Reputação acumulada (já coletada do escritório de marketing), gasta em `hireSponsor`. */
  reputacao: number;
  /** ids dos patrocinadores contratados na livery, até `LIVERY_SPONSOR_SLOTS`. */
  hiredSponsorIds: string[];
  /** Moeda premium (CLAUDE.md §6.2) — ganha só de pódio de corrida nesta sessão (`auraForPosition`), gasta em `buyChest`. */
  aura: number;
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
    pilotRoster: [],
    activePilotId: null,
    marketingOffice: createMarketingOffice(nowMs),
    reputacao: 0,
    hiredSponsorIds: [],
    aura: 0,
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
    offices?: unknown; pilotRoster?: unknown; activePilotId?: unknown;
    marketingOffice?: unknown; reputacao?: unknown; hiredSponsorIds?: unknown; aura?: unknown;
    inventory?: { counts?: PartInventory['counts']; equipped?: Partial<Record<PartSlot, Rarity | null>> };
  };
  const knownVersion = r.version === 1 || r.version === 2 || r.version === 3 || r.version === 4
    || r.version === 5 || r.version === 6 || r.version === CURRENT_VERSION;
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
  // saves v1-v4 (sem pilotos) começam sem nenhum contratado — mesmo
  // comportamento de sempre (companheiro usa o perfil "Médio" padrão).
  const pilotRoster = Array.isArray(r.pilotRoster) ? (r.pilotRoster as string[]) : [];
  const activePilotId = typeof r.activePilotId === 'string' ? r.activePilotId : null;
  // saves v1-v5 (sem marketing/patrocinadores) ganham um escritório de
  // marketing novo e 0 Reputação/patrocinadores — mesmo raciocínio do v4.
  const marketingOffice = (r.marketingOffice && typeof r.marketingOffice === 'object')
    ? (r.marketingOffice as MarketingOfficeState) : createMarketingOffice(nowMs);
  const reputacao = typeof r.reputacao === 'number' ? r.reputacao : 0;
  const hiredSponsorIds = Array.isArray(r.hiredSponsorIds) ? (r.hiredSponsorIds as string[]) : [];
  // saves v1-v6 (sem Aura) começam com 0 — mesmo raciocínio do v4/v6.
  const aura = typeof r.aura === 'number' ? r.aura : 0;
  return {
    version: CURRENT_VERSION,
    gold: typeof r.gold === 'number' ? r.gold : 0,
    energy: typeof r.energy === 'number' ? r.energy : ENERGY_MAX,
    energyLastUpdateMs: typeof r.energyLastUpdateMs === 'number' ? r.energyLastUpdateMs : nowMs,
    inventory: { counts: r.inventory.counts, equipped },
    hasSeenTutorial,
    offices,
    pilotRoster,
    activePilotId,
    marketingOffice,
    reputacao,
    hiredSponsorIds,
    aura,
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
  const marketingOffice = applyMarketingProduction(save.marketingOffice, nowMs);
  const updated: GameSave = {
    ...save, energy: regen.energy, energyLastUpdateMs: regen.energyLastUpdateMs, offices, marketingOffice,
  };
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

export interface ApplyRaceRewardsResult extends ApplyRewardsResult {
  /** Gold efetivamente creditado, já com o bônus dos patrocinadores da livery (>= `reward.gold`). */
  goldAdded: number;
}

/**
 * Aplica a recompensa de uma corrida (Gold + peças sorteadas + Aura de pódio,
 * já calculada por `computeRaceRewards` no core) ao save: soma Gold (com o
 * bônus percentual dos patrocinadores contratados na livery —
 * `core/sponsors.ts`, sessão 14), soma Aura (E-305, sessão 14), recebe cada
 * peça (equipando ou guardando como sobra) e roda a fusão automática 3→1 em
 * cascata. Retorna o save atualizado (já persistido) + a lista de fusões
 * ocorridas, para exibir na tela de resumo.
 */
export function applyRaceRewards(save: GameSave, reward: RaceRewardResult): ApplyRaceRewardsResult {
  // clona o inventário (não muta o objeto do save anterior in-place antes de decidir persistir)
  const inventory: PartInventory = cloneInventory(save.inventory);
  for (const drop of reward.partsDropped as PartDrop[]) {
    receivePart(inventory, drop.slot, drop.rarity);
  }
  const fusions = fuseAll(inventory);
  const bonusPct = totalSponsorGoldBonusPct(save.hiredSponsorIds);
  const goldAdded = Math.round(reward.gold * (1 + bonusPct / 100));
  const updated: GameSave = {
    ...save, gold: save.gold + goldAdded, aura: save.aura + (reward.aura ?? 0), inventory,
  };
  saveGame(updated);
  return { save: updated, fusions, goldAdded };
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
 * Coleta a produção pendente de TODOS os escritórios de uma vez (botão
 * "Coletar tudo" da Sede, pedido do PO). Mesmo espírito de
 * `collectOfficeParts`, só que dobrado pra 1 volta só nos 7 escritórios em
 * vez de 7 chamadas separadas — 1 save só no final, e as fusões de todos os
 * escritórios juntas numa lista só (a ordem de `PART_SLOTS` é a mesma usada
 * pela Oficina/Sede em outros lugares).
 */
export function collectAllOfficeParts(save: GameSave): ApplyRewardsResult {
  let offices = save.offices;
  const inventory = cloneInventory(save.inventory);
  for (const slot of PART_SLOTS) {
    const result = collectOffice(offices, slot);
    offices = result.offices;
    for (const part of result.collected) receivePart(inventory, part.slot, part.rarity);
  }
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

/**
 * Contrata um piloto do roster fixo (E-302, `core/pilots.ts`) — custo fixo em
 * Gold, uma vez só (não é assinatura recorrente). `null` = não aplicado (Gold
 * insuficiente, id desconhecido, ou já contratado — contratar de novo o mesmo
 * piloto não faz sentido e é ignorado).
 */
export function hirePilot(save: GameSave, pilotId: string): GameSave | null {
  const pilot = findPilot(pilotId);
  if (!pilot) return null;
  if (save.pilotRoster.includes(pilotId)) return null;
  if (save.gold < pilot.hireCost) return null;
  const updated: GameSave = {
    ...save,
    gold: save.gold - pilot.hireCost,
    pilotRoster: [...save.pilotRoster, pilotId],
  };
  saveGame(updated);
  return updated;
}

/**
 * Escala um piloto já contratado pra guiar o Carro 2 — `null` = não aplicado
 * (piloto não está no roster do jogador). Passar `null` como `pilotId`
 * desescala (volta pro perfil "Médio" padrão).
 */
export function setActivePilot(save: GameSave, pilotId: string | null): GameSave | null {
  if (pilotId !== null && !save.pilotRoster.includes(pilotId)) return null;
  const updated: GameSave = { ...save, activePilotId: pilotId };
  saveGame(updated);
  return updated;
}

/**
 * Coleta a Reputação pendente do escritório de marketing (sessão 14) — move
 * pro saldo gasto em `hireSponsor`. Mesmo padrão de `collectOfficeParts`, só
 * que sem peças/fusão (Reputação é um contador simples, não fundível).
 */
export function collectMarketingReputacao(save: GameSave): GameSave {
  const gained = save.marketingOffice.pendingReputacao;
  const updated: GameSave = {
    ...save,
    reputacao: save.reputacao + gained,
    marketingOffice: { ...save.marketingOffice, pendingReputacao: 0 },
  };
  saveGame(updated);
  return updated;
}

/** Sobe 1 nível o escritório de marketing, debitando o custo em Gold. `null` = sem Gold suficiente ou já no nível máximo. */
export function upgradeMarketingOfficeLevel(save: GameSave): GameSave | null {
  const result = upgradeMarketingOffice(save.marketingOffice, save.gold);
  if (!result) return null;
  const updated: GameSave = { ...save, marketingOffice: result.office, gold: save.gold - result.goldSpent };
  saveGame(updated);
  return updated;
}

/**
 * Contrata um patrocinador da livery (`core/sponsors.ts`, sessão 14) — custo
 * em Reputação (não Gold), uma vez só. `null` = não aplicado: Reputação
 * insuficiente, id desconhecido, já contratado, ou as `LIVERY_SPONSOR_SLOTS`
 * (6) já estão todas ocupadas.
 */
export function hireSponsor(save: GameSave, sponsorId: string): GameSave | null {
  const sponsor = findSponsor(sponsorId);
  if (!sponsor) return null;
  if (save.hiredSponsorIds.includes(sponsorId)) return null;
  if (save.hiredSponsorIds.length >= LIVERY_SPONSOR_SLOTS) return null;
  if (save.reputacao < sponsor.reputationCost) return null;
  const updated: GameSave = {
    ...save,
    reputacao: save.reputacao - sponsor.reputationCost,
    hiredSponsorIds: [...save.hiredSponsorIds, sponsorId],
  };
  saveGame(updated);
  return updated;
}

/** Libera 1 posição de patrocinador (sem reembolso de Reputação — mesma lógica de "investimento não é assinatura" de `hirePilot`). */
export function releaseSponsor(save: GameSave, sponsorId: string): GameSave {
  const updated: GameSave = { ...save, hiredSponsorIds: save.hiredSponsorIds.filter((id) => id !== sponsorId) };
  saveGame(updated);
  return updated;
}

export interface BuyChestResult extends ApplyRewardsResult {
  /** Peças sorteadas nesta abertura (antes de fusão) — pra exibir na LojaScene, mesmo espírito de `lastReward.partsDropped` na tela de resumo da corrida. */
  partsDropped: PartDrop[];
}

/**
 * Compra e abre 1 baú (Loja, E-305, sessão 14) — debita Aura, sorteia as
 * peças do baú (`core/chests.ts`) e roda a fusão automática, mesmo padrão de
 * `applyRaceRewards`/`collectOfficeParts`. `null` = sem Aura suficiente.
 */
export function buyChest(save: GameSave, tier: ChestTier, rng: () => number = Math.random): BuyChestResult | null {
  const chest = CHESTS[tier];
  if (save.aura < chest.auraCost) return null;
  const partsDropped = openChest(tier, rng);
  const inventory = cloneInventory(save.inventory);
  for (const drop of partsDropped) receivePart(inventory, drop.slot, drop.rarity);
  const fusions = fuseAll(inventory);
  const updated: GameSave = { ...save, aura: save.aura - chest.auraCost, inventory };
  saveGame(updated);
  return { save: updated, fusions, partsDropped };
}
