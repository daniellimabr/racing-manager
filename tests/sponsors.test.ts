import { describe, it, expect } from 'vitest';
import { AVAILABLE_SPONSORS, LIVERY_SPONSOR_SLOTS, findSponsor, totalSponsorGoldBonusPct } from '../src/core/sponsors.js';

describe('AVAILABLE_SPONSORS', () => {
  it('tem mais candidatos do que posições (dá escolha real de quais 6 contratar)', () => {
    expect(AVAILABLE_SPONSORS.length).toBeGreaterThan(LIVERY_SPONSOR_SLOTS);
    const ids = new Set(AVAILABLE_SPONSORS.map((s) => s.id));
    expect(ids.size).toBe(AVAILABLE_SPONSORS.length);
  });

  it('findSponsor acha um patrocinador existente e retorna undefined pra um id desconhecido', () => {
    expect(findSponsor('marca-global')?.name).toBe('Marca Global');
    expect(findSponsor('nao-existe')).toBeUndefined();
  });
});

describe('totalSponsorGoldBonusPct', () => {
  it('soma 0 sem nenhum patrocinador contratado', () => {
    expect(totalSponsorGoldBonusPct([])).toBe(0);
  });

  it('soma os bônus dos patrocinadores contratados', () => {
    const a = findSponsor('oficina-local')!;
    const b = findSponsor('posto-combustivel')!;
    expect(totalSponsorGoldBonusPct([a.id, b.id])).toBe(a.goldBonusPct + b.goldBonusPct);
  });

  it('ignora ids desconhecidos silenciosamente (defensivo)', () => {
    const a = findSponsor('oficina-local')!;
    expect(totalSponsorGoldBonusPct([a.id, 'nao-existe'])).toBe(a.goldBonusPct);
  });
});
