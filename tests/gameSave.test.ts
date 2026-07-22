import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadGame, saveGame, spendEnergyForRace, applyRaceRewards, equipPart, markTutorialSeen,
  collectOfficeParts, upgradeOfficeLevel, hirePilot, setActivePilot,
  collectMarketingReputacao, upgradeMarketingOfficeLevel, hireSponsor, releaseSponsor, buyChest,
} from '../src/persistence/gameSave.js';
import { clear, saveJSON } from '../src/persistence/storage.js';
import { ENERGY_MAX, ENERGY_COST_PER_RACE, ENERGY_REGEN_MINUTES_PER_POINT, equippedRarity } from '../src/core/economy.js';
import { OFFICE_BASE_MINUTES_PER_PART, OFFICE_UPGRADE_BASE_COST, MARKETING_BASE_MINUTES_PER_POINT, MARKETING_UPGRADE_BASE_COST } from '../src/core/offices.js';
import { LIVERY_SPONSOR_SLOTS } from '../src/core/sponsors.js';

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
    expect(save.pilotRoster).toEqual([]);
    expect(save.activePilotId).toBeNull();
    expect(save.marketingOffice.level).toBe(1);
    expect(save.reputacao).toBe(0);
    expect(save.hiredSponsorIds).toEqual([]);
    expect(save.aura).toBe(0);
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
      expect(loaded.version).toBe(7);
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
      expect(loaded.version).toBe(7);
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
      expect(loaded.version).toBe(7);
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
      expect(loaded.version).toBe(7);
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

  describe('Pilotos (E-302, sessão 14)', () => {
    it('hirePilot debita o Gold certo e adiciona ao roster, persistindo', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 1000, partsDropped: [] }).save;

      const hired = hirePilot(save, 'rookie');
      expect(hired).not.toBeNull();
      expect(hired!.pilotRoster).toEqual(['rookie']);
      expect(hired!.gold).toBe(1000 - 300);

      const reloaded = loadGame(0);
      expect(reloaded.pilotRoster).toEqual(['rookie']); // persistiu
    });

    it('hirePilot retorna null sem Gold suficiente', () => {
      const save = loadGame(0); // 0 Gold
      expect(hirePilot(save, 'rookie')).toBeNull();
    });

    it('hirePilot retorna null pra um id de piloto desconhecido', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 5000, partsDropped: [] }).save;
      expect(hirePilot(save, 'nao-existe')).toBeNull();
    });

    it('hirePilot retorna null se o piloto já foi contratado', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 5000, partsDropped: [] }).save;
      save = hirePilot(save, 'rookie')!;
      expect(hirePilot(save, 'rookie')).toBeNull();
    });

    it('setActivePilot escala um piloto do roster e persiste', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 5000, partsDropped: [] }).save;
      save = hirePilot(save, 'rookie')!;

      const activated = setActivePilot(save, 'rookie');
      expect(activated).not.toBeNull();
      expect(activated!.activePilotId).toBe('rookie');

      const reloaded = loadGame(0);
      expect(reloaded.activePilotId).toBe('rookie'); // persistiu
    });

    it('setActivePilot retorna null pra um piloto fora do roster', () => {
      const save = loadGame(0);
      expect(setActivePilot(save, 'rookie')).toBeNull();
    });

    it('setActivePilot(null) desescala, voltando pro perfil padrão', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 5000, partsDropped: [] }).save;
      save = hirePilot(save, 'rookie')!;
      save = setActivePilot(save, 'rookie')!;

      const deactivated = setActivePilot(save, null);
      expect(deactivated).not.toBeNull();
      expect(deactivated!.activePilotId).toBeNull();
    });
  });

  describe('Marketing e patrocinadores da livery (sessão 14, Claude-Manager.md §5 item 5/6)', () => {
    it('produção passiva de Reputação acumula e loadGame aplica antes de retornar', () => {
      loadGame(0);
      const intervalMs = MARKETING_BASE_MINUTES_PER_POINT * 60_000;
      const reloaded = loadGame(intervalMs * 2);
      expect(reloaded.marketingOffice.pendingReputacao).toBe(2);
    });

    it('collectMarketingReputacao move a produção pendente pro saldo e persiste', () => {
      const intervalMs = MARKETING_BASE_MINUTES_PER_POINT * 60_000;
      loadGame(0);
      const withProduction = loadGame(intervalMs * 3);
      expect(withProduction.marketingOffice.pendingReputacao).toBe(3);

      const collected = collectMarketingReputacao(withProduction);
      expect(collected.reputacao).toBe(3);
      expect(collected.marketingOffice.pendingReputacao).toBe(0);

      const reloaded = loadGame(intervalMs * 3); // mesmo instante — sem produção nova no meio
      expect(reloaded.reputacao).toBe(3);
    });

    it('upgradeMarketingOfficeLevel debita o Gold certo e sobe o nível, persistindo', () => {
      let save = loadGame(0);
      save = applyRaceRewards(save, { gold: 1000, partsDropped: [] }).save;

      const upgraded = upgradeMarketingOfficeLevel(save);
      expect(upgraded).not.toBeNull();
      expect(upgraded!.marketingOffice.level).toBe(2);
      expect(upgraded!.gold).toBe(1000 - MARKETING_UPGRADE_BASE_COST);
    });

    it('upgradeMarketingOfficeLevel retorna null sem Gold suficiente', () => {
      const save = loadGame(0); // 0 Gold
      expect(upgradeMarketingOfficeLevel(save)).toBeNull();
    });

    it('hireSponsor debita a Reputação certa e adiciona à lista de contratados, persistindo', () => {
      const intervalMs = MARKETING_BASE_MINUTES_PER_POINT * 60_000;
      let save = loadGame(0);
      save = loadGame(intervalMs * 20); // acumula Reputação suficiente (teto)
      save = collectMarketingReputacao(save);
      const reputacaoBefore = save.reputacao;

      const hired = hireSponsor(save, 'oficina-local'); // custa 20 Reputação
      expect(hired).not.toBeNull();
      expect(hired!.hiredSponsorIds).toEqual(['oficina-local']);
      expect(hired!.reputacao).toBe(reputacaoBefore - 20);

      const reloaded = loadGame(intervalMs * 20);
      expect(reloaded.hiredSponsorIds).toEqual(['oficina-local']); // persistiu
    });

    it('hireSponsor retorna null sem Reputação suficiente, com id desconhecido, já contratado, ou sem posição livre', () => {
      let save = loadGame(0);
      expect(hireSponsor(save, 'oficina-local')).toBeNull(); // 0 Reputação

      save = { ...save, reputacao: 10_000 };
      expect(hireSponsor(save, 'nao-existe')).toBeNull();

      save = hireSponsor(save, 'oficina-local')!;
      expect(hireSponsor(save, 'oficina-local')).toBeNull(); // já contratado

      // enche as 6 posições com os outros patrocinadores disponíveis
      const others = ['posto-combustivel', 'pneus-veloz', 'bebida-energetica', 'banco-regional', 'seguradora-nacional'];
      for (const id of others) save = hireSponsor(save, id)!;
      expect(save.hiredSponsorIds.length).toBe(LIVERY_SPONSOR_SLOTS);
      expect(hireSponsor(save, 'montadora-parceira')).toBeNull(); // sem posição livre
    });

    it('releaseSponsor libera 1 posição, sem reembolso de Reputação, e persiste', () => {
      let save = { ...loadGame(0), reputacao: 100 };
      save = hireSponsor(save, 'oficina-local')!;
      expect(save.hiredSponsorIds).toEqual(['oficina-local']);

      const released = releaseSponsor(save, 'oficina-local');
      expect(released.hiredSponsorIds).toEqual([]);
      expect(released.reputacao).toBe(80); // sem reembolso

      const reloaded = loadGame(0);
      expect(reloaded.hiredSponsorIds).toEqual([]); // persistiu
    });

    it('applyRaceRewards aplica o bônus de Gold dos patrocinadores contratados', () => {
      let save = { ...loadGame(0), reputacao: 100 };
      save = hireSponsor(save, 'oficina-local')!; // +3% Gold

      const result = applyRaceRewards(save, { gold: 100, partsDropped: [] });
      expect(result.goldAdded).toBe(103); // 100 * 1.03
      expect(result.save.gold).toBe(103);
    });

    it('applyRaceRewards não altera o Gold sem nenhum patrocinador contratado', () => {
      const save = loadGame(0);
      const result = applyRaceRewards(save, { gold: 100, partsDropped: [] });
      expect(result.goldAdded).toBe(100);
    });
  });

  describe('Loja/baús + Aura (E-305, sessão 14)', () => {
    it('applyRaceRewards soma Aura de pódio ao save', () => {
      const save = loadGame(0);
      const result = applyRaceRewards(save, { gold: 100, partsDropped: [], aura: 5 });
      expect(result.save.aura).toBe(5);

      const reloaded = loadGame(0);
      expect(reloaded.aura).toBe(5); // persistiu
    });

    it('applyRaceRewards não altera Aura sem reward.aura (fixture antiga, sem pódio)', () => {
      const save = loadGame(0);
      const result = applyRaceRewards(save, { gold: 100, partsDropped: [] });
      expect(result.save.aura).toBe(0);
    });

    it('buyChest debita a Aura certa, entrega as peças e roda fusão, persistindo', () => {
      const save = { ...loadGame(0), aura: 100 };
      const result = buyChest(save, 'bronze', () => 0); // rng=0 → sempre gray, determinístico
      expect(result).not.toBeNull();
      expect(result!.save.aura).toBe(90); // bronze custa 10
      expect(result!.partsDropped.length).toBe(1);
      expect(result!.save.inventory.counts[result!.partsDropped[0].slot].gray).toBe(1);

      const reloaded = loadGame(0);
      expect(reloaded.aura).toBe(90); // persistiu
    });

    it('buyChest retorna null sem Aura suficiente, sem persistir nada', () => {
      const save = loadGame(0); // 0 Aura
      expect(buyChest(save, 'bronze')).toBeNull();
    });
  });
});
