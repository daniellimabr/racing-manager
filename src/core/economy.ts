/**
 * Modelo de economia do Manager (M2, ver CLAUDE.md §6.2 e Claude-Tech.md §8,
 * épicos E-201/E-202/E-203). Camada `core`: pura, sem dependência de engine
 * nem de `localStorage` (isso fica em `src/persistence/`) — mesma regra
 * arquitetural do resto do `core/` (Claude-Tech.md §3). Testável headless e
 * reaproveitável pelo `tools/economyHarness.ts`.
 *
 * Proposta inicial do TechLead-Manager (sessão 1 da trilha Manager), calibrada
 * via `economyHarness.ts` — ver `Claude-Manager.md` para o raciocínio completo
 * e a tabela de resultados do harness. Números aqui documentados são o ponto
 * de partida, não valores definitivos — o PO ainda vai revisar (ver perguntas
 * em Claude-Manager.md).
 */

// ---------------------------------------------------------------------------
// Energia (E-201)
// ---------------------------------------------------------------------------

/** Teto de energia — CLAUDE.md §6.2, já era uma decisão aprovada (não é proposta minha). */
export const ENERGY_MAX = 30;
/** Custo por corrida — CLAUDE.md §6.2, idem. */
export const ENERGY_COST_PER_RACE = 5;

/**
 * Minutos por ponto de energia regenerado — ESTA é a taxa que o CLAUDE.md
 * pediu explicitamente para eu propor ("no espírito Archero").
 *
 * Raciocínio (documentado com mais detalhe em Claude-Manager.md):
 * verificado via busca (não confiei só na memória — ver Claude-Manager.md
 * sobre esse cuidado): o Archero real regenera 1 energia a cada **12
 * minutos**, com teto de 20 (ou **30 com o Battle Pass**). Nosso teto (30,
 * decisão já aprovada no CLAUDE.md) já bate exatamente com o teto "boostado"
 * do Archero — copiei também a taxa real por ponto (12 min), não uma taxa
 * inventada. Isso dá um refill completo do zero em 30 × 12 = 360 min (6h);
 * gastar as 5 de uma corrida regenera em 60 min (1h) — ritmo de "volta ao
 * app a cada 1-2h", coerente com "sessões curtas, progressão longa" (CLAUDE.md
 * pilar 5) e calibrado/confirmado com o harness (ver Claude-Manager.md).
 */
export const ENERGY_REGEN_MINUTES_PER_POINT = 12;

export interface EnergyState {
  energy: number;
  /** epoch ms da última vez que o regen foi calculado/consolidado. */
  energyLastUpdateMs: number;
}

/**
 * Aplica a regeneração de energia decorrida entre `energyLastUpdateMs` e
 * `nowMs`, preservando o "resto" de tempo não convertido em ponto inteiro
 * (evita perder progresso parcial a cada load/save). Uma vez no teto, o
 * timestamp não acumula mais (não faz sentido guardar "crédito" acima do
 * teto — mesmo comportamento do Archero/Clash-like).
 */
export function applyEnergyRegen(state: EnergyState, nowMs: number): EnergyState {
  if (state.energy >= ENERGY_MAX) {
    return { energy: state.energy, energyLastUpdateMs: nowMs };
  }
  const intervalMs = ENERGY_REGEN_MINUTES_PER_POINT * 60_000;
  const elapsedMs = Math.max(0, nowMs - state.energyLastUpdateMs);
  const pointsElapsed = Math.floor(elapsedMs / intervalMs);
  if (pointsElapsed <= 0) return state;

  const pointsApplied = Math.min(pointsElapsed, ENERGY_MAX - state.energy);
  const newEnergy = state.energy + pointsApplied;
  // se bateu no teto usando menos pontos que os "disponíveis" no tempo
  // decorrido, o excedente é descartado (mesmo espírito do teto sem overflow);
  // senão, avança o relógio exatamente pelos pontos convertidos, preservando
  // o resto de milissegundos que ainda não vira 1 ponto inteiro.
  const newTimestamp = newEnergy >= ENERGY_MAX
    ? nowMs
    : state.energyLastUpdateMs + pointsElapsed * intervalMs;
  return { energy: newEnergy, energyLastUpdateMs: newTimestamp };
}

/** ms restantes até o próximo ponto de energia (0 se já no teto). Útil para exibir um contador no Hub. */
export function msUntilNextEnergyPoint(state: EnergyState, nowMs: number): number {
  if (state.energy >= ENERGY_MAX) return 0;
  const intervalMs = ENERGY_REGEN_MINUTES_PER_POINT * 60_000;
  const elapsedMs = Math.max(0, nowMs - state.energyLastUpdateMs);
  const rest = elapsedMs % intervalMs;
  return intervalMs - rest;
}

export function canAffordRace(energy: number): boolean {
  return energy >= ENERGY_COST_PER_RACE;
}

// ---------------------------------------------------------------------------
// Gold por posição (E-202)
// ---------------------------------------------------------------------------

/**
 * Gold ganho por posição final (1..12, ver CLAUDE.md Q5 — grid de 12 carros).
 * Proposta inicial (a validar): curva suave, não um degrau brusco — recompensa
 * o esforço de qualquer posição (retenção de quem joga mal), mas com um prêmio
 * claro pro pódio (P1 é 4,8x o valor de P12). Índice 0 não é usado (posição é
 * 1-indexed); mantido só pra indexar direto por `position` sem `-1` toda hora.
 */
export const GOLD_BY_POSITION: readonly number[] = [
  0, // não usado
  120, 100, 90, 80, 70, 60, 50, 45, 40, 35, 30, 25,
];

export function goldForPosition(position: number): number {
  const idx = Math.max(1, Math.min(12, Math.round(position)));
  return GOLD_BY_POSITION[idx];
}

export interface RaceRewardInput {
  /** RaceOutput.position — ver nota de divergência core/grid em Claude-Racing.md §3, discutida em Claude-Manager.md. */
  position: number;
  dnf: boolean;
  /** RaceOutput.goldPenalty (crash "batida forte") — já vem calculado do core da trilha Racing. */
  goldPenalty: number;
}

export interface RaceRewardResult {
  /** Gold líquido desta corrida (tabela por posição − penalidade de crash, nunca negativo). */
  gold: number;
  /** Peças sorteadas nesta corrida (antes de fusão). */
  partsDropped: PartDrop[];
}

/**
 * Calcula a recompensa de 1 corrida (Gold líquido + peças sorteadas). Não
 * aplica nada a nenhum estado persistido — isso é papel do
 * `src/persistence/gameSave.ts` (`applyRaceRewards`), que soma ao save e roda
 * a fusão automática.
 */
export function computeRaceRewards(input: RaceRewardInput, rng: () => number = Math.random): RaceRewardResult {
  const base = goldForPosition(input.position);
  const gold = Math.max(0, base - input.goldPenalty);
  const partsDropped = rollPartDropsForRace(input.position, rng);
  return { gold, partsDropped };
}

// ---------------------------------------------------------------------------
// Peças, raridade, drops e fusão (E-203)
// ---------------------------------------------------------------------------

/** CLAUDE.md §9/Q9: cinza→verde→azul→roxo→dourado→vermelho. */
export type Rarity = 'gray' | 'green' | 'blue' | 'purple' | 'gold' | 'red';
export const RARITIES: readonly Rarity[] = ['gray', 'green', 'blue', 'purple', 'gold', 'red'];
export const RARITY_LABELS: Record<Rarity, string> = {
  gray: 'Cinza', green: 'Verde', blue: 'Azul', purple: 'Roxo', gold: 'Dourado', red: 'Vermelho',
};

/** CLAUDE.md §7/Q7: motor, asa dianteira, asa traseira, chassis, suspensão, pneu, livery. */
export type PartSlot = 'motor' | 'asaDianteira' | 'asaTraseira' | 'chassis' | 'suspensao' | 'pneu' | 'livery';
export const PART_SLOTS: readonly PartSlot[] = [
  'motor', 'asaDianteira', 'asaTraseira', 'chassis', 'suspensao', 'pneu', 'livery',
];
export const PART_SLOT_LABELS: Record<PartSlot, string> = {
  motor: 'Motor', asaDianteira: 'Asa dianteira', asaTraseira: 'Asa traseira',
  chassis: 'Chassis', suspensao: 'Suspensão', pneu: 'Pneu', livery: 'Livery',
};

/**
 * Bônus de `zoneScale` por peça equipada, por raridade (aditivo entre os 7
 * slots). Curva propositalmente conservadora: com os 7 slots no topo (red),
 * o bônus somado é 0,56 (zoneScale efetivo 1,56) — já bem perto do teto global
 * `MAX_SCALE` (1.5, `core/constants.ts`, dono é a trilha Racing) mesmo sem
 * contar bônus de pit/boost/saúde. Isso é proposital: máximo de peças é
 * conteúdo de endgame (fusão em cascata, ver `fuseAll`) e não deveria por si
 * só tornar irrelevantes os outros multiplicadores do desafio de timing.
 */
export const RARITY_ZONE_BONUS: Record<Rarity, number> = {
  gray: 0, green: 0.01, blue: 0.02, purple: 0.035, gold: 0.055, red: 0.08,
};

export interface PartDrop {
  slot: PartSlot;
  rarity: Rarity;
}

/**
 * Peso de raridade por faixa de posição final — melhor posição, melhor chance
 * de raridade alta. Faixas: pódio (1-3), meio de tabela (4-8), fundo (9-12).
 *
 * **Recalibrado na 1ª rodada do harness** (ver Claude-Manager.md): acima de
 * `green`, a raridade praticamente só nasce de fusão (cascata 3→1, CLAUDE.md
 * §6.2), quase nunca de um drop direto — só `blue` sobrevive como um "golpe
 * de sorte" raro pro pódio. Dar raridade alta DIRETO no drop deixava a fusão
 * em cascata "atalhar" demais o caminho até o topo (ver histórico abaixo).
 */
const DROP_WEIGHTS_BY_TIER: Record<'top3' | 'mid' | 'back', Record<Rarity, number>> = {
  top3: { gray: 0.78, green: 0.20, blue: 0.02, purple: 0.00, gold: 0.00, red: 0.00 },
  mid: { gray: 0.87, green: 0.13, blue: 0.00, purple: 0.00, gold: 0.00, red: 0.00 },
  back: { gray: 0.93, green: 0.07, blue: 0.00, purple: 0.00, gold: 0.00, red: 0.00 },
};

/**
 * Chance de dropar peça(s) ao final de UMA corrida, por faixa de posição —
 * NÃO é mais garantido (1 peça toda corrida, sempre). **2ª recalibração desta
 * sessão** (ver Claude-Manager.md): mesmo só com raridades baixas no drop
 * direto (ver `DROP_WEIGHTS_BY_TIER` acima), um drop GARANTIDO a cada corrida
 * ainda gerava volume suficiente pra um jogador de 3x/dia cascatear até
 * `gold`/`red` (a raridade máxima) em só ~21 dias — o gargalo real não era só
 * "que raridade vem", era "quantas peças entram por dia". Reduzido pra uma
 * chance por corrida (`base`), com uma chance extra pequena (`bonus`) só pro
 * pódio — resultado observado no harness: 1ª fusão continua rápida (bom gatilho
 * de onboarding), mas o topo da árvore de raridades passa a levar
 * semanas/meses de jogo engajado, não 3 semanas.
 */
const DROP_CHANCE_BY_TIER: Record<'top3' | 'mid' | 'back', { base: number; bonus: number }> = {
  top3: { base: 0.55, bonus: 0.15 },
  mid: { base: 0.35, bonus: 0 },
  back: { base: 0.22, bonus: 0 },
};

function tierForPosition(position: number): 'top3' | 'mid' | 'back' {
  if (position <= 3) return 'top3';
  if (position <= 8) return 'mid';
  return 'back';
}

function weightedPickRarity(weights: Record<Rarity, number>, rng: () => number): Rarity {
  const r = rng();
  let acc = 0;
  for (const rarity of RARITIES) {
    acc += weights[rarity];
    if (r <= acc) return rarity;
  }
  return 'gray';
}

export function rollPartDrop(position: number, rng: () => number = Math.random): PartDrop {
  const weights = DROP_WEIGHTS_BY_TIER[tierForPosition(position)];
  const rarity = weightedPickRarity(weights, rng);
  const slot = PART_SLOTS[Math.floor(rng() * PART_SLOTS.length)];
  return { slot, rarity };
}

/**
 * Sorteia as peças ganhas ao final de UMA corrida (0, 1 ou, raramente no
 * pódio, 2) — ver `DROP_CHANCE_BY_TIER` para o raciocínio de calibração.
 * DNF não é tratado como um caso especial: a posição final (mesmo com DNF) já
 * reflete o desempenho — não há garantia extra nem penalidade extra aqui.
 */
export function rollPartDropsForRace(position: number, rng: () => number = Math.random): PartDrop[] {
  const chance = DROP_CHANCE_BY_TIER[tierForPosition(position)];
  const drops: PartDrop[] = [];
  if (rng() < chance.base) drops.push(rollPartDrop(position, rng));
  if (chance.bonus > 0 && rng() < chance.bonus) drops.push(rollPartDrop(position, rng));
  return drops;
}

/**
 * Inventário do jogador: contagem simples de quantas peças de cada
 * slot+raridade o jogador possui. Não há "peças individuais" com identidade
 * própria (mesmo modelo do Archero). **Decisão de simplificação desta sessão**
 * (ver Claude-Manager.md): não existe uma tela de Oficina ainda (fora do
 * escopo — só o Hub, E-204, foi pedido), então não há equipar/desequipar
 * manual. "Equipada" é sempre derivada como a MELHOR raridade que o jogador
 * possui em cada slot (`equippedRarity`) — equivale a "o jogo sempre usa a
 * sua melhor peça automaticamente". Isso também simplifica a fusão: os 3
 * exemplares consumidos podem ser quaisquer 3 (não precisa reservar a "peça
 * em uso" como especial), o que evita um caso de borda confuso onde fundir
 * uma peça melhor "desequiparia" a antiga de volta para a pilha de sobras.
 */
export interface PartInventory {
  counts: Record<PartSlot, Record<Rarity, number>>;
}

export function emptyInventory(): PartInventory {
  const counts = {} as Record<PartSlot, Record<Rarity, number>>;
  for (const slot of PART_SLOTS) {
    counts[slot] = { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 };
  }
  return { counts };
}

/** Recebe 1 peça (de drop ou de fusão) num slot — só soma à contagem daquela raridade. */
export function receivePart(inv: PartInventory, slot: PartSlot, rarity: Rarity): void {
  inv.counts[slot][rarity] += 1;
}

/** A melhor raridade que o jogador possui neste slot (ou `null` se não tem nenhuma) — "equipada" automática. */
export function equippedRarity(inv: PartInventory, slot: PartSlot): Rarity | null {
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    if (inv.counts[slot][RARITIES[i]] > 0) return RARITIES[i];
  }
  return null;
}

export interface FusionResult {
  slot: PartSlot;
  from: Rarity;
  to: Rarity;
}

/**
 * Funde 3 peças iguais (mesmo slot+raridade) em 1 da raridade seguinte
 * (CLAUDE.md §6.2 — igual ao Archero), em cascata (uma fusão pode gerar
 * material para a próxima). Roda sobre TODO o inventário; retorna a lista de
 * fusões aplicadas (para telemetria/exibição). `red` é a raridade máxima —
 * peças nela só se acumulam (fim da linha de fusão).
 */
export function fuseAll(inv: PartInventory): FusionResult[] {
  const results: FusionResult[] = [];
  for (const slot of PART_SLOTS) {
    for (let i = 0; i < RARITIES.length - 1; i++) {
      const rarity = RARITIES[i];
      while (inv.counts[slot][rarity] >= 3) {
        inv.counts[slot][rarity] -= 3;
        const next = RARITIES[i + 1];
        inv.counts[slot][next] += 1;
        results.push({ slot, from: rarity, to: next });
      }
    }
  }
  return results;
}

/** `zoneScale` real (E-203) a partir do que está "equipado" (melhor peça possuída por slot) — soma os bônus de raridade dos 7 slots. */
export function computeZoneScale(inv: PartInventory): number {
  let bonus = 0;
  for (const slot of PART_SLOTS) {
    const rarity = equippedRarity(inv, slot);
    if (rarity) bonus += RARITY_ZONE_BONUS[rarity];
  }
  return 1 + bonus;
}
