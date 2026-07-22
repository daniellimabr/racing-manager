import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadGame, saveGame, spendEnergyForRace, applyRaceRewards, equipPart, markTutorialSeen,
  collectOfficeParts, upgradeOfficeLevel,
} from '../src/persistence/gameSave.js';
import { clear, saveJSON } from '../src/persistence/storage.js';
import { ENERGY_MAX, ENERGY_COST_PER_RACE, ENERGY_REGEN_MINUTES_PER_POINT, equippedRarity } from '../src/core/economy.js';
import { OFFICE_BASE_MINUTES_PER_PART, OFFICE_UPGRADE_BASE_COST } from '../src/core/offices.js';

// Ambiente de teste (vitest) roda em Node — sem `localStorage`, o wrapper cai
// no fallback em memória (ver storage.ts). `clear` entre testes evita um save
// vazar para o próximo (o fallback em memória é global ao módulo/processo).
beforeEach(() => clear('save-v1'));

describe('gameSave (E-205)', () => {
  it('1ª carga cria um save novo com energia cheia e 0 Gold', () => {
    const save = loadGame(1_000_000);
    expect(save.energy).toBe(ENERGY_MAX);
    expect(save.gold).toBe(0);
    expect(save.inventory).toBeDefined();
  });

  it('persiste entre chamadas (simula fechar/reabrir o app)', () => {
    const save = loadGame(1_000_000);
    const spent = spendEnergyForRace(save, ENERGY_COST_PER_RACE);
    expect(spent.energy).toBe(ENERGY_MAX - ENERGY_COST_PER_RACE);

    const reloaded = loadGame(1_000_000); // "reabre o app" no mesmo instante — sem regen ainda
    expect(reloaded.energy).toBe(ENERGY_MAX - ENERGY_COST_PER_RACE);
  });

  it('regenera energia entre 2 loads com o tempo passando', () => {
    const save = loadGame(0);
    spendEnergyForRace(save, ENERGY_COST_PER_RACE);
    const intervalMs = ENERGY_REGEN_MINUTES_PER_POINT * 60_000;
    const reloaded = loadGame(intervalMs * 3);
    expect(reloaded.energy).toBe(ENERGY_MAX - ENERGY_COST_PER_RACE + 3);
  });

  it('applyRaceRewards soma Gold e peças, aplicando fusão automática', () => {
    const save = loadGame(0);
    const r1 = applyRaceRewards(save, { gold: 100, partsDropped: [{ slot: 'motor', rarity: 'gray' }] });
    expect(r1.save.gold).toBe(100);
    expect(r1.save.inventory.counts.motor.gray).toBe(1);
    expect(r1.fusions).toEqual([]);

    const r2 = applyRaceRewards(r1.save, {
      gold: 50,
      partsDropped: [
        { slot: 'motor', rarity: 'gray' },
        { slot: 'motor', rarity: 'gray' },
      ],
    });
    expect(r2.save.gold).toBe(150);
    expect(r2.fusions).toEqual([{ slot: 'motor', from: 'gray', to: 'green' }]);
    expect(r2.save.inventory.counts.motor.green).toBe(1);
    expect(r2.save.inventory.counts.motor.gray).toBe(0);
  });

  it('saveGame grava o objeto exato passado (round-trip via loadGame)', () => {
    const save = loadGame(0);
    const modified = { ...save, gold: 999 };
    saveGame(modified);
    const reloaded = loadGame(0);
    expect(reloaded.gold).toBe(999);
  });

  describe('migração de save v1 → v2 (E-207: inventory.equipped não existia antes)', () => {
    it('save v1 sem inventory.equipped carrega sem quebrar, preservando o auto-equip antigo', () => {
      // save "cru" como a sessão anterior de fato gravava (sem `equipped`) — ver Claude-Manager.md §2.3
      const v1Raw = {
        version: 1,
        gold: 250,
        energy: 12,
        energyLastUpdateMs: 500_000,
        inventory: {
          counts: {
            motor: { gray: 1, green: 0, blue: 2, purple: 0, gold: 0, red: 0 },
            asaDianteira: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            asaTraseira: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            chassis: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            suspensao: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            pneu: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            livery: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
          },
          // sem campo `equipped` de propósito — é exatamente isso que um save real da sessão anterior tem
        },
      };
      saveJSON('save-v1', v1Raw);

      const loaded = loadGame(500_000); // mesmo instante do save — sem regen no meio
      expect(loaded.version).toBe(4);
      expect(loaded.gold).toBe(250);
      expect(loaded.energy).toBe(12);
      // sem escolha própria migrada (equipped ausente) → cai no mesmo fallback automático de sempre
      expect(equippedRarity(loaded.inventory, 'motor')).toBe('blue');
      // save v1 = jogador com progresso existente → tratado como "já viu" o tutorial (sessão 12)
      expect(loaded.hasSeenTutorial).toBe(true);
    });

    it('save corrompido/desconhecido não quebra o load — reseta para um save novo', () => {
      saveJSON('save-v1', { lixo: true });
      const loaded = loadGame(0);
      expect(loaded.version).toBe(4);
      expect(loaded.gold).toBe(0);
      expect(loaded.energy).toBe(ENERGY_MAX);
    });
  });

  describe('hasSeenTutorial (sessão 12, TutorialScene)', () => {
    it('save novo começa sem ter visto o tutorial', () => {
      const save = loadGame(0);
      expect(save.hasSeenTutorial).toBe(false);
    });

    it('save v2 (sem hasSeenTutorial) migra como "já viu" — jogador com progresso não deveria ser interrompido', () => {
      const v2Raw = {
        version: 2,
        gold: 10,
        energy: 30,
        energyLastUpdateMs: 0,
        inventory: {
          counts: {
            motor: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            asaDianteira: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            asaTraseira: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            chassis: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            suspensao: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            pneu: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            livery: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
          },
          equipped: {
            motor: null, asaDianteira: null, asaTraseira: null, chassis: null,
            suspensao: null, pneu: null, livery: null,
          },
        },
      };
      saveJSON('save-v1', v2Raw);
      const loaded = loadGame(0);
      expect(loaded.version).toBe(4);
      expect(loaded.hasSeenTutorial).toBe(true);
    });

    it('markTutorialSeen persiste entre loads', () => {
      let save = loadGame(0);
      expect(save.hasSeenTutorial).toBe(false);
      save = markTutorialSeen(save);
      expect(save.hasSeenTutorial).toBe(true);

      const reloaded = loadGame(0);
      expect(reloaded.hasSeenTutorial).toBe(true);
    });
  });

  describe('equipPart (E-207, Oficina) — equipar é escolha do jogador, persistida', () => {
    it('equipa manualmente uma raridade não-ótima e persiste entre loads', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 0, partsDropped: [{ slot: 'pneu', rarity: 'gray' }] }).save;
      save = applyRaceRewards(save, { gold: 0, partsDropped: [{ slot: 'pneu', rarity: 'blue' }] }).save;

      save = equipPart(save, 'pneu', 'gray'); // escolhe a pior de propósito, mesmo possuindo blue
      expect(equippedRarity(save.inventory, 'pneu')).toBe('gray');

      const reloaded = loadGame(0);
      expect(equippedRarity(reloaded.inventory, 'pneu')).toBe('gray'); // persistiu
    });

    it('ignora (no-op) escolha de raridade que o jogador não possui', () => {
      const save = loadGame(0);
      const result = equipPart(save, 'motor', 'red');
      expect(result).toBe(save); // mesmo objeto, nada mudou
    });

    it('fallback automático quando a raridade escolhida manualmente é consumida por uma fusão', () => {
      let save = loadGame(0);
      let r = applyRaceRewards(save, {
        gold: 0,
        partsDropped: [{ slot: 'chassis', rarity: 'gray' }, { slot: 'chassis', rarity: 'gray' }],
      });
      save = r.save;
      expect(r.fusions).toEqual([]); // só 2 gray ainda, não funde

      save = equipPart(save, 'chassis', 'gray'); // escolha explícita do jogador
      expect(equippedRarity(save.inventory, 'chassis')).toBe('gray');

      r = applyRaceRewards(save, { gold: 0, partsDropped: [{ slot: 'chassis', rarity: 'gray' }] });
      save = r.save;
      expect(r.fusions).toEqual([{ slot: 'chassis', from: 'gray', to: 'green' }]);
      expect(save.inventory.counts.chassis.gray).toBe(0);
      // a escolha do jogador (gray) sumiu do inventário → fallback automático pra melhor restante (green)
      expect(equippedRarity(save.inventory, 'chassis')).toBe('green');
    });
  });

  describe('Sede/escritórios (E-301, sessão 13)', () => {
    it('save novo já vem com os 7 escritórios, nível 1', () => {
      const save = loadGame(0);
      expect(save.offices.motor.level).toBe(1);
      expect(save.offices.livery.level).toBe(1);
    });

    it('save v1/v2/v3 (sem offices) migra com escritórios novos, sem quebrar', () => {
      const v3Raw = {
        version: 3,
        gold: 500,
        energy: 30,
        energyLastUpdateMs: 0,
        hasSeenTutorial: true,
        inventory: {
          counts: {
            motor: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            asaDianteira: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            asaTraseira: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            chassis: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            suspensao: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            pneu: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
            livery: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0 },
          },
          equipped: {
            motor: null, asaDianteira: null, asaTraseira: null, chassis: null,
            suspensao: null, pneu: null, livery: null,
          },
        },
        // sem campo `offices` de propósito — save real de antes do E-301
      };
      saveJSON('save-v1', v3Raw);
      const loaded = loadGame(0);
      expect(loaded.version).toBe(4);
      expect(loaded.gold).toBe(500); // progresso existente preservado
      expect(loaded.offices.motor.level).toBe(1); // escritório novo, começa do zero
    });

    it('produção passiva acumula com o tempo e loadGame aplica antes de retornar', () => {
      const save = loadGame(0);
      const intervalMs = OFFICE_BASE_MINUTES_PER_PART * 60_000;
      const reloaded = loadGame(intervalMs * 2);
      const total = reloaded.offices.motor.pending.gray + reloaded.offices.motor.pending.green;
      expect(total).toBe(2);
      void save;
    });

    it('collectOfficeParts move a produção pendente pro inventário e persiste', () => {
      const intervalMs = OFFICE_BASE_MINUTES_PER_PART * 60_000;
      loadGame(0);
      // só 2 intervalos de propósito: com 3+ peças da mesma raridade a fusão
      // automática (mesmo comportamento de applyRaceRewards) entraria no meio
      // e "3 gray -> 1 green" quebraria a comparação simples de total abaixo.
      const withProduction = loadGame(intervalMs * 2);
      const totalBefore = withProduction.offices.motor.pending.gray + withProduction.offices.motor.pending.green;
      expect(totalBefore).toBeGreaterThan(0);

      const { save: afterCollect } = collectOfficeParts(withProduction, 'motor');
      const totalCollected = afterCollect.inventory.counts.motor.gray + afterCollect.inventory.counts.motor.green;
      expect(totalCollected).toBe(totalBefore);
      expect(afterCollect.offices.motor.pending.gray).toBe(0);

      const reloaded = loadGame(intervalMs * 2); // mesmo instante — sem produção nova no meio
      expect(reloaded.inventory.counts.motor.gray + reloaded.inventory.counts.motor.green).toBe(totalCollected);
    });

    it('upgradeOfficeLevel debita o Gold certo e sobe o nível, persistindo', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 1000, partsDropped: [] }).save;

      const upgraded = upgradeOfficeLevel(save, 'motor');
      expect(upgraded).not.toBeNull();
      expect(upgraded!.offices.motor.level).toBe(2);
      expect(upgraded!.gold).toBe(1000 - OFFICE_UPGRADE_BASE_COST);

      const reloaded = loadGame(0);
      expect(reloaded.offices.motor.level).toBe(2); // persistiu
    });

    it('upgradeOfficeLevel retorna null sem Gold suficiente, sem persistir nada', () => {
      const save = loadGame(0); // 0 Gold
      const result = upgradeOfficeLevel(save, 'motor');
      expect(result).toBeNull();
    });
  });
});
