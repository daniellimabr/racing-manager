/**
 * Sede do time — escritórios (E-301, CLAUDE.md §9/Q9, sessão 13). Camada
 * `core`: pura, sem dependência de engine nem de `localStorage` (mesma regra
 * arquitetural do resto do `core/`, ver `economy.ts`).
 *
 * Modelo: CLAUDE.md pede "1 escritório por tipo de peça + 1 de marketing".
 * **Escopo desta sessão: só os 7 escritórios de peça** (`motor`, `asaDianteira`,
 * `asaTraseira`, `chassis`, `suspensao`, `pneu`, `livery`) — o escritório de
 * marketing fica de fora de propósito, porque ele se conecta ao sistema de
 * patrocinadores da livery, que já está registrado como pendência separada
 * em Claude-Manager.md ("precisa de uma sessão própria pra desenhar do
 * zero"). Não faz sentido construir metade de um sistema que depende do
 * outro ainda não desenhado.
 *
 * Produção passiva, estilo Archero (mesmo espírito da energia, `economy.ts`):
 * cada escritório acumula peças com o tempo real, até um teto — precisa ser
 * coletado. Nível do escritório (upgradável com Gold) acelera a produção.
 * Raridade produzida é DELIBERADAMENTE quase sempre `gray` (com uma pequena
 * chance de `green`), igual à filosofia já calibrada pelo harness de economia
 * pras recompensas de corrida (Claude-Manager.md §2.6): dar raridade alta
 * direto (sem fusão) esvaziaria o gancho de progressão de longo prazo. O
 * nível do escritório afeta VELOCIDADE de produção, não a raridade — duas
 * fontes de peça (corrida + escritório) usando a mesma regra evita
 * recalibrar a curva de fusão duas vezes.
 */
import type { PartSlot, Rarity } from './economy.js';
import { PART_SLOTS, RARITIES } from './economy.js';

/** Minutos por peça produzida no nível 1 — nível L produz 1 peça a cada `OFFICE_BASE_MINUTES_PER_PART / L` minutos. */
export const OFFICE_BASE_MINUTES_PER_PART = 20;
/** Nível máximo de um escritório (progressão de velocidade de produção, não de raridade). */
export const OFFICE_MAX_LEVEL = 5;
/** Teto de peças pendentes de coleta por escritório — força o jogador a voltar e coletar, mesmo espírito do teto de energia. */
export const OFFICE_PENDING_CAP = 10;
/** Custo em Gold pra subir do nível L pro L+1: `OFFICE_UPGRADE_BASE_COST * L`. */
export const OFFICE_UPGRADE_BASE_COST = 150;

/** Chance de a peça produzida sair `green` em vez de `gray` — ver racional na doc do módulo. */
const OFFICE_GREEN_CHANCE = 0.12;

export function officeUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= OFFICE_MAX_LEVEL) return null; // já no máximo, não dá pra upar mais
  return OFFICE_UPGRADE_BASE_COST * currentLevel;
}

export interface OfficeState {
  level: number; // 1..OFFICE_MAX_LEVEL
  /** peças prontas pra coletar, por raridade — mesmo formato de `PartInventory.counts[slot]`. */
  pending: Record<Rarity, number>;
  /** epoch ms da última vez que a produção decorrida foi consolidada (mesmo padrão de `EnergyState.energyLastUpdateMs`). */
  lastUpdateMs: number;
}

export type OfficesState = Record<PartSlot, OfficeState>;

function emptyPending(): Record<Rarity, number> {
  return { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 };
}

export function createOffices(nowMs: number = Date.now()): OfficesState {
  const offices = {} as OfficesState;
  for (const slot of PART_SLOTS) {
    offices[slot] = { level: 1, pending: emptyPending(), lastUpdateMs: nowMs };
  }
  return offices;
}

function pendingTotal(pending: Record<Rarity, number>): number {
  let total = 0;
  for (const r of RARITIES) total += pending[r];
  return total;
}

/**
 * Aplica a produção decorrida de UM escritório entre `office.lastUpdateMs` e
 * `nowMs`, preservando o resto de tempo não convertido em peça inteira (mesmo
 * princípio de `applyEnergyRegen`, `economy.ts`). Para de produzir (mas não
 * perde o relógio) quando `OFFICE_PENDING_CAP` é atingido — peça "não
 * produzida" por estar no teto não é recuperada depois, incentiva coletar.
 */
function applyOneOfficeProduction(office: OfficeState, nowMs: number, rng: () => number): OfficeState {
  const totalPending = pendingTotal(office.pending);
  if (totalPending >= OFFICE_PENDING_CAP) {
    return { ...office, lastUpdateMs: nowMs }; // no teto: só avança o relógio, sem acumular "crédito" de sobra
  }
  const intervalMs = (OFFICE_BASE_MINUTES_PER_PART / office.level) * 60_000;
  const elapsedMs = Math.max(0, nowMs - office.lastUpdateMs);
  const partsElapsed = Math.floor(elapsedMs / intervalMs);
  if (partsElapsed <= 0) return office;

  const partsToAdd = Math.min(partsElapsed, OFFICE_PENDING_CAP - totalPending);
  const pending = { ...office.pending };
  for (let i = 0; i < partsToAdd; i++) {
    const rarity: Rarity = rng() < OFFICE_GREEN_CHANCE ? 'green' : 'gray';
    pending[rarity] += 1;
  }
  // mesmo espírito de applyEnergyRegen: se parou no teto usando menos peças que
  // o tempo decorrido "pagaria", o excedente de tempo é descartado; senão,
  // avança o relógio exatamente pelas peças convertidas, preservando o resto.
  const newTotal = totalPending + partsToAdd;
  const newTimestamp = newTotal >= OFFICE_PENDING_CAP ? nowMs : office.lastUpdateMs + partsElapsed * intervalMs;
  return { level: office.level, pending, lastUpdateMs: newTimestamp };
}

/** Aplica a produção decorrida de TODOS os escritórios — chamar ao "abrir o app"/a Sede, mesmo espírito de `loadGame()`. */
export function applyOfficesProduction(offices: OfficesState, nowMs: number = Date.now(), rng: () => number = Math.random): OfficesState {
  const updated = {} as OfficesState;
  for (const slot of PART_SLOTS) {
    updated[slot] = applyOneOfficeProduction(offices[slot], nowMs, rng);
  }
  return updated;
}

export interface CollectResult {
  offices: OfficesState;
  collected: { slot: PartSlot; rarity: Rarity }[];
}

/** Coleta tudo que está pendente num escritório — devolve a lista de peças (pra `receivePart` no inventário) e zera o pendente. */
export function collectOffice(offices: OfficesState, slot: PartSlot): CollectResult {
  const office = offices[slot];
  const collected: { slot: PartSlot; rarity: Rarity }[] = [];
  for (const rarity of RARITIES) {
    for (let i = 0; i < office.pending[rarity]; i++) collected.push({ slot, rarity });
  }
  return {
    offices: { ...offices, [slot]: { ...office, pending: emptyPending() } },
    collected,
  };
}

export interface UpgradeResult {
  offices: OfficesState;
  goldSpent: number;
}

/** Upa 1 nível um escritório, se houver Gold suficiente e não estiver no nível máximo. `null` = não aplicado (sem Gold ou já no máximo). */
export function upgradeOffice(offices: OfficesState, slot: PartSlot, gold: number): UpgradeResult | null {
  const office = offices[slot];
  const cost = officeUpgradeCost(office.level);
  if (cost === null || gold < cost) return null;
  return {
    offices: { ...offices, [slot]: { ...office, level: office.level + 1 } },
    goldSpent: cost,
  };
}

// ---------------------------------------------------------------------------
// Escritório de marketing (sessão 14, destravado pelo sistema de
// patrocinadores da livery, `core/sponsors.ts`) — pendência antiga do E-301
// (Claude-Manager.md §5 item 5): "não modelado, depende do sistema de
// patrocinadores existir primeiro". Produz **Reputação** (um contador simples,
// não peças por raridade — não há "raridade de reputação"), gasta pra
// contratar patrocinadores. Mesmo padrão de acúmulo passivo + teto +
// coleta manual dos outros 7 escritórios, mas como um valor escalar único em
// vez de `Record<Rarity, number>`, porque não faz sentido forçar reputação
// num modelo pensado pra peças fundíveis.
// ---------------------------------------------------------------------------

/** Minutos por ponto de Reputação no nível 1 — mesma fórmula de escala por nível dos outros escritórios. */
export const MARKETING_BASE_MINUTES_PER_POINT = 15;
export const MARKETING_MAX_LEVEL = 5;
/** Teto de Reputação pendente de coleta — mesmo espírito do `OFFICE_PENDING_CAP`. */
export const MARKETING_PENDING_CAP = 20;
/** Custo em Gold pra subir do nível L pro L+1: `MARKETING_UPGRADE_BASE_COST * L`. */
export const MARKETING_UPGRADE_BASE_COST = 150;

export interface MarketingOfficeState {
  level: number;
  pendingReputacao: number;
  lastUpdateMs: number;
}

export function createMarketingOffice(nowMs: number = Date.now()): MarketingOfficeState {
  return { level: 1, pendingReputacao: 0, lastUpdateMs: nowMs };
}

/** Aplica a produção de Reputação decorrida — mesmo algoritmo de `applyOneOfficeProduction`, sem o sorteio de raridade. */
export function applyMarketingProduction(office: MarketingOfficeState, nowMs: number = Date.now()): MarketingOfficeState {
  if (office.pendingReputacao >= MARKETING_PENDING_CAP) {
    return { ...office, lastUpdateMs: nowMs };
  }
  const intervalMs = (MARKETING_BASE_MINUTES_PER_POINT / office.level) * 60_000;
  const elapsedMs = Math.max(0, nowMs - office.lastUpdateMs);
  const pointsElapsed = Math.floor(elapsedMs / intervalMs);
  if (pointsElapsed <= 0) return office;

  const pointsToAdd = Math.min(pointsElapsed, MARKETING_PENDING_CAP - office.pendingReputacao);
  const newTotal = office.pendingReputacao + pointsToAdd;
  const newTimestamp = newTotal >= MARKETING_PENDING_CAP ? nowMs : office.lastUpdateMs + pointsElapsed * intervalMs;
  return { level: office.level, pendingReputacao: newTotal, lastUpdateMs: newTimestamp };
}

export function marketingUpgradeCost(currentLevel: number): number | null {
  if (currentLevel >= MARKETING_MAX_LEVEL) return null;
  return MARKETING_UPGRADE_BASE_COST * currentLevel;
}

export interface MarketingUpgradeResult {
  office: MarketingOfficeState;
  goldSpent: number;
}

export function upgradeMarketingOffice(office: MarketingOfficeState, gold: number): MarketingUpgradeResult | null {
  const cost = marketingUpgradeCost(office.level);
  if (cost === null || gold < cost) return null;
  return { office: { ...office, level: office.level + 1 }, goldSpent: cost };
}
