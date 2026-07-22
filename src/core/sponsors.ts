/**
 * Patrocinadores da livery (CLAUDE.md §5 tela 2/§7 Q7, pendência antiga —
 * Claude-Manager.md §5 item 6, sessão 14). Camada `core`: pura, sem
 * dependência de engine nem `localStorage` (mesma regra do resto do `core/`).
 *
 * Modelo: até `LIVERY_SPONSOR_SLOTS` (6, CLAUDE.md "6 posições de
 * patrocinador") patrocinadores contratados simultaneamente, de um roster
 * fixo (mesmo espírito não-gacha de `core/pilots.ts`). Custo em **Reputação**
 * (não Gold) — produzida pelo escritório de marketing (`core/offices.ts`),
 * que este sistema finalmente destrava. Cada patrocinador contratado soma um
 * bônus percentual ao Gold ganho ao final de cada corrida (aplicado em
 * `persistence/gameSave.ts` `applyRaceRewards`) — a lógica comercial de "um
 * patrocinador paga pela exposição da marca no carro".
 *
 * Escopo desta sessão: só o bônus de Gold. Raridade própria de patrocinador,
 * troca/upgrade individual e o modal dedicado dentro da Oficina (CLAUDE.md
 * pede um modal específico; aqui é uma tela própria, `MarketingScene` — ver
 * racional na doc dessa cena) ficam fora — greybox simples primeiro.
 */

export const LIVERY_SPONSOR_SLOTS = 6;

export interface Sponsor {
  id: string;
  name: string;
  /** Custo em Reputação (produzida pelo escritório de marketing), não Gold. */
  reputationCost: number;
  /** Bônus percentual somado ao Gold ganho em cada corrida (aditivo entre patrocinadores contratados). */
  goldBonusPct: number;
}

/**
 * 8 candidatos pra 6 posições — dá escolha real de quais 6 contratar, custo e
 * bônus crescentes (mesmo padrão de trade-off simples de `AVAILABLE_PILOTS`).
 */
export const AVAILABLE_SPONSORS: Sponsor[] = [
  { id: 'oficina-local', name: 'Oficina Local', reputationCost: 20, goldBonusPct: 3 },
  { id: 'posto-combustivel', name: 'Posto de Combustível', reputationCost: 35, goldBonusPct: 5 },
  { id: 'pneus-veloz', name: 'Pneus Veloz', reputationCost: 55, goldBonusPct: 7 },
  { id: 'bebida-energetica', name: 'Bebida Energética', reputationCost: 80, goldBonusPct: 9 },
  { id: 'banco-regional', name: 'Banco Regional', reputationCost: 110, goldBonusPct: 12 },
  { id: 'seguradora-nacional', name: 'Seguradora Nacional', reputationCost: 150, goldBonusPct: 15 },
  { id: 'montadora-parceira', name: 'Montadora Parceira', reputationCost: 200, goldBonusPct: 18 },
  { id: 'marca-global', name: 'Marca Global', reputationCost: 260, goldBonusPct: 22 },
];

export function findSponsor(id: string): Sponsor | undefined {
  return AVAILABLE_SPONSORS.find((s) => s.id === id);
}

/** Soma os bônus percentuais dos patrocinadores contratados — ignora ids desconhecidos silenciosamente (defensivo, mesmo espírito de `equippedRarity`). */
export function totalSponsorGoldBonusPct(hiredSponsorIds: string[]): number {
  return hiredSponsorIds.reduce((sum, id) => sum + (findSponsor(id)?.goldBonusPct ?? 0), 0);
}
