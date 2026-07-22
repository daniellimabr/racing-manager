import { describe, it, expect } from 'vitest';
import {
  createOffices, applyOfficesProduction, collectOffice, upgradeOffice,
  officeUpgradeCost, OFFICE_BASE_MINUTES_PER_PART, OFFICE_PENDING_CAP, OFFICE_MAX_LEVEL,
  OFFICE_UPGRADE_BASE_COST,
} from '../src/core/offices.js';

describe('createOffices', () => {
  it('cria os 7 escritórios de peça, todos nível 1 e sem produção pendente', () => {
    const offices = createOffices(0);
    expect(Object.keys(offices).sort()).toEqual(
      ['motor', 'asaDianteira', 'asaTraseira', 'chassis', 'suspensao', 'pneu', 'livery'].sort()
    );
    for (const slot of Object.keys(offices) as (keyof typeof offices)[]) {
      expect(offices[slot].level).toBe(1);
      expect(offices[slot].pending.gray).toBe(0);
    }
  });
});

describe('applyOfficesProduction (regen, mesmo espírito de applyEnergyRegen)', () => {
  it('produz 1 peça por intervalo decorrido, no nível 1', () => {
    const offices = createOffices(0);
    const intervalMs = OFFICE_BASE_MINUTES_PER_PART * 60_000;
    const updated = applyOfficesProduction(offices, intervalMs * 3, () => 1); // rng=1 nunca cai em "green"
    expect(updated.motor.pending.gray).toBe(3);
    expect(updated.motor.pending.green).toBe(0);
  });

  it('nível mais alto produz mais rápido (proporcional ao nível)', () => {
    const offices = createOffices(0);
    offices.motor.level = 2;
    const intervalMs = OFFICE_BASE_MINUTES_PER_PART * 60_000; // 1 intervalo "base"
    const updated = applyOfficesProduction(offices, intervalMs, () => 1);
    expect(updated.motor.pending.gray).toBe(2); // nível 2 = metade do tempo por peça = o dobro no mesmo período
  });

  it('não passa do teto de peças pendentes, mesmo com muito tempo decorrido', () => {
    const offices = createOffices(0);
    const intervalMs = OFFICE_BASE_MINUTES_PER_PART * 60_000;
    const updated = applyOfficesProduction(offices, intervalMs * 1000, () => 1);
    expect(updated.motor.pending.gray).toBe(OFFICE_PENDING_CAP);
  });

  it('preserva o resto de tempo não convertido em peça inteira entre chamadas', () => {
    const offices = createOffices(0);
    const intervalMs = OFFICE_BASE_MINUTES_PER_PART * 60_000;
    const half = applyOfficesProduction(offices, intervalMs * 0.5, () => 1);
    expect(half.motor.pending.gray).toBe(0); // ainda não completou 1 intervalo
    const full = applyOfficesProduction(half, intervalMs, () => 1); // mais 0.5 intervalo -> completa 1 no total
    expect(full.motor.pending.gray).toBe(1);
  });
});

describe('collectOffice', () => {
  it('coleta tudo que está pendente e zera o escritório', () => {
    const offices = createOffices(0);
    const intervalMs = OFFICE_BASE_MINUTES_PER_PART * 60_000;
    const produced = applyOfficesProduction(offices, intervalMs * 2, () => 1);
    const { offices: after, collected } = collectOffice(produced, 'motor');
    expect(collected).toEqual([{ slot: 'motor', rarity: 'gray' }, { slot: 'motor', rarity: 'gray' }]);
    expect(after.motor.pending.gray).toBe(0);
  });
});

describe('upgradeOffice', () => {
  it('custa OFFICE_UPGRADE_BASE_COST * nível atual, e sobe 1 nível', () => {
    const offices = createOffices(0);
    const cost = officeUpgradeCost(1);
    expect(cost).toBe(OFFICE_UPGRADE_BASE_COST);
    const result = upgradeOffice(offices, 'motor', cost!);
    expect(result).not.toBeNull();
    expect(result!.offices.motor.level).toBe(2);
    expect(result!.goldSpent).toBe(cost);
  });

  it('retorna null se não houver Gold suficiente', () => {
    const offices = createOffices(0);
    const result = upgradeOffice(offices, 'motor', 1);
    expect(result).toBeNull();
  });

  it('retorna null (e officeUpgradeCost retorna null) no nível máximo', () => {
    const offices = createOffices(0);
    offices.motor.level = OFFICE_MAX_LEVEL;
    expect(officeUpgradeCost(OFFICE_MAX_LEVEL)).toBeNull();
    const result = upgradeOffice(offices, 'motor', 999_999);
    expect(result).toBeNull();
  });
});
