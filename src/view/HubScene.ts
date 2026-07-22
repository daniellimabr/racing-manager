import Phaser from 'phaser';
import type { CarSetup } from '../core/types.js';
import {
  ENERGY_MAX, ENERGY_COST_PER_RACE, canAffordRace, computeZoneScale,
  msUntilNextEnergyPoint, PART_SLOTS, PART_SLOT_LABELS, equippedRarity, RARITY_LABELS,
} from '../core/economy.js';
import { DEFAULT_CAR_SETUP } from '../core/constants.js';
import { loadGame, spendEnergyForRace, type GameSave } from '../persistence/gameSave.js';
import { currentChampionshipTrackId, isChampionshipComplete } from '../core/championship.js';
import { findPilot, pilotTierWeights, pilotPaceFactor, pilotDevCarroBonus } from '../core/pilots.js';
import type { TeammateProfile } from '../core/grid.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { TRACKS } from './RaceScene.js';
import { juice } from './juice.js';

/**
 * Hub/Garagem (E-204) — nova tela inicial do jogo (CLAUDE.md §5, tela 1).
 * Mostra os 2 carros (arte placeholder — greybox, igual ao resto do jogo
 * nesta fase), energia (X/30), Gold e o botão CORRER, que debita a energia e
 * inicia a corrida passando o `carSetup` real (derivado do inventário de
 * peças persistido — E-203) em vez do `DEFAULT_CAR_SETUP` fixo.
 */
export class HubScene extends Phaser.Scene {
  private save!: GameSave;

  private energyBarBg!: Phaser.GameObjects.Rectangle;
  private energyBarFill!: Phaser.GameObjects.Rectangle;
  private energyLabelText!: Phaser.GameObjects.Text;
  private energyTimerText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private auraText!: Phaser.GameObjects.Text;
  private runButtonBg!: Phaser.GameObjects.Rectangle;
  private runButtonText!: Phaser.GameObjects.Text;
  private partsSummaryText!: Phaser.GameObjects.Text;

  constructor() {
    super('HubScene');
  }

  create(): void {
    this.save = loadGame();

    // TutorialScene (sessão 12, pedido do PO): save novo (1ª vez) redireciona
    // pro tutorial antes de mostrar o Hub. Saves migrados de v1/v2 entram como
    // "já viu" (ver gameSave.ts) — não interrompe quem já joga.
    if (!this.save.hasSeenTutorial) {
      this.scene.start('TutorialScene');
      return;
    }

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'RACING MANAGER', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Garagem / QG', { fontSize: '13px', color: '#8899aa' }).setOrigin(0.5);

    this.buildCars();
    this.buildTutorialButton();
    this.buildOficinaButton();
    this.buildSedeButton();
    this.buildPilotosButton();
    this.buildMarketingButton();
    this.buildLojaButton();
    this.buildEnergyPanel();
    this.buildGoldPanel();
    this.buildPartsSummary();
    this.buildChampionshipButton();
    this.buildRunButton();

    this.input.once('pointerdown', () => juice.unlock());

    this.updateHud();
    // atualiza a energia (regen) periodicamente sem precisar reabrir a cena —
    // não escreve em localStorage a cada tick, só quando o valor muda de fato
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshEnergy() });
  }

  /** Placeholder greybox dos 2 carros da equipe (CLAUDE.md — 2 carros por equipe, Q4). */
  private buildCars(): void {
    const y = 100;
    const cardW = (CANVAS_WIDTH - 48) / 2;
    const cardH = 150;

    const drawCarCard = (x: number, label: string, sublabel: string, color: number): void => {
      this.add.rectangle(x, y, cardW, cardH, 0x22262c).setOrigin(0, 0).setStrokeStyle(1, 0x333940);
      // "carro" placeholder: um retângulo com um triângulo de asa — só pra dar
      // silhueta de carro sem depender de nenhum asset de arte ainda
      const cx = x + cardW / 2;
      const cy = y + 62;
      this.add.rectangle(cx, cy, 70, 34, color).setOrigin(0.5).setStrokeStyle(2, 0xffffff, 0.4);
      this.add.triangle(cx, cy, -20, 20, 20, 20, 0, -6, color).setOrigin(0.5);
      this.add.text(cx, y + cardH - 34, label, {
        fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(cx, y + cardH - 16, sublabel, { fontSize: '10px', color: '#8899aa' }).setOrigin(0.5);
    };

    const activePilot = this.save.activePilotId ? findPilot(this.save.activePilotId) : undefined;
    const car2Sublabel = activePilot ? `IA — ${activePilot.name}` : 'IA (perfil padrão — contrate um piloto)';

    drawCarCard(16, 'Carro 1', 'Você (piloto titular)', 0xffdd33);
    drawCarCard(16 + cardW + 16, 'Carro 2', car2Sublabel, 0x33ddff);
  }

  /** Reabre a TutorialScene a qualquer momento (sessão 12) — mesmo depois de já ter sido vista/pulada. */
  private buildTutorialButton(): void {
    const bg = this.add.rectangle(16, 14, 100, 28, 0x2a2e34)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444a52).setInteractive({ useHandCursor: true });
    this.add.text(66, 28, 'COMO JOGAR', {
      fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('TutorialScene');
    });
  }

  /** Leva à Oficina (E-207, CLAUDE.md §5 tela 2) — equipar peça manualmente por slot. */
  private buildOficinaButton(): void {
    const bg = this.add.rectangle(CANVAS_WIDTH - 100, 14, 84, 28, 0x2a2e34)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444a52).setInteractive({ useHandCursor: true });
    this.add.text(CANVAS_WIDTH - 58, 28, 'OFICINA', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('OficinaScene');
    });
  }

  /** Leva à Sede do time (E-301, CLAUDE.md §5 tela 5) — escritórios de produção passiva. */
  private buildSedeButton(): void {
    const bg = this.add.rectangle(CANVAS_WIDTH - 100, 46, 84, 28, 0x2a2e34)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444a52).setInteractive({ useHandCursor: true });
    this.add.text(CANVAS_WIDTH - 58, 60, 'SEDE', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('SedeScene');
    });
  }

  /** Leva a Pilotos (E-302, CLAUDE.md §5 tela 3) — contratar/escalar quem guia o Carro 2. */
  private buildPilotosButton(): void {
    const bg = this.add.rectangle(CANVAS_WIDTH - 100, 78, 84, 28, 0x2a2e34)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444a52).setInteractive({ useHandCursor: true });
    this.add.text(CANVAS_WIDTH - 58, 92, 'PILOTOS', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('PilotosScene');
    });
  }

  /**
   * Leva a Marketing (sessão 14, Claude-Manager.md §5 item 5/6) — escritório
   * de marketing + patrocinadores da livery. Posicionado no lado ESQUERDO,
   * abaixo de "COMO JOGAR" (não junto da coluna OFICINA/SEDE/PILOTOS à
   * direita) — essa coluna já termina a 6px do topo dos cards dos carros
   * (y=100); um 4º botão empilhado ali entraria por cima do card do Carro 2.
   */
  private buildMarketingButton(): void {
    const bg = this.add.rectangle(16, 46, 100, 28, 0x2a2e34)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444a52).setInteractive({ useHandCursor: true });
    this.add.text(66, 60, 'MARKETING', {
      fontSize: '9px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('MarketingScene');
    });
  }

  /** Leva a Loja (E-305, CLAUDE.md §5 tela 6, sessão 14) — baús comprados com Aura. Empilhado abaixo de MARKETING, mesmo lado esquerdo. */
  private buildLojaButton(): void {
    const bg = this.add.rectangle(16, 78, 100, 28, 0x2a2e34)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444a52).setInteractive({ useHandCursor: true });
    this.add.text(66, 92, 'LOJA', {
      fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('LojaScene');
    });
  }

  private buildEnergyPanel(): void {
    const y = 280;
    this.add.text(16, y, 'ENERGIA', { fontSize: '11px', color: '#8899aa' });
    const barX = 16, barY = y + 16, barW = CANVAS_WIDTH - 32, barH = 22;
    this.energyBarBg = this.add.rectangle(barX, barY, barW, barH, 0x2a2e34).setOrigin(0, 0).setStrokeStyle(1, 0x444a52);
    this.energyBarFill = this.add.rectangle(barX, barY, barW, barH, 0x42a5f5).setOrigin(0, 0);
    this.energyLabelText = this.add.text(barX + 8, barY + 3, '', { fontSize: '13px', color: '#ffffff', fontStyle: 'bold' });
    this.energyTimerText = this.add.text(barX, barY + barH + 6, '', { fontSize: '11px', color: '#8899aa' });
  }

  private buildGoldPanel(): void {
    this.goldText = this.add.text(16, 340, '', { fontSize: '15px', color: '#ffd54f', fontStyle: 'bold' });
    this.auraText = this.add.text(180, 340, '', { fontSize: '15px', color: '#ba68c8', fontStyle: 'bold' });
  }

  /**
   * Resumo textual das peças efetivamente equipadas (escolha do jogador via
   * Oficina, E-207 — ver `OficinaScene`; fallback automático pra melhor
   * raridade possuída se não houver escolha própria ou ela tiver sumido do
   * inventário, ver `equippedRarity` em core/economy.ts). Não é a tela de
   * Oficina em si, só uma prévia legível do que `computeZoneScale` calcula.
   */
  private buildPartsSummary(): void {
    this.add.text(16, 372, 'PEÇAS (equipadas — toque OFICINA pra trocar)', { fontSize: '11px', color: '#8899aa' });
    this.partsSummaryText = this.add.text(16, 388, '', {
      fontSize: '11px', color: '#cccccc', lineSpacing: 4, fontFamily: 'monospace',
    });
  }

  /**
   * Campeonato de construtores (sessão 15, pedido direto do PO) — leva pra
   * `ChampionshipScene`, que trata os 3 estados (não iniciado/em andamento/
   * encerrado). O rótulo aqui já dá uma prévia do estado sem precisar entrar.
   * Fica no espaço livre entre o resumo de peças e o botão CORRER (que
   * continua sendo a corrida avulsa em Spa, sem tocar no campeonato).
   */
  private buildChampionshipButton(): void {
    const y = 560;
    const w = CANVAS_WIDTH - 32, h = 48;
    const bg = this.add.rectangle(16, y, w, h, 0x2a2e34).setOrigin(0, 0)
      .setStrokeStyle(1, 0x64b5f6).setInteractive({ useHandCursor: true });
    const label = this.championshipButtonLabel();
    this.add.text(16 + w / 2, y + h / 2, label, {
      fontSize: '13px', color: '#64b5f6', fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('ChampionshipScene');
    });
  }

  private championshipButtonLabel(): string {
    const champ = this.save.championship;
    if (!champ) return 'CAMPEONATO — Iniciar (2 corridas)';
    if (isChampionshipComplete(champ)) return 'CAMPEONATO — Encerrado, ver resultado';
    const trackId = currentChampionshipTrackId(champ);
    const trackName = trackId ? TRACKS[trackId].name : '';
    return `CAMPEONATO — Corrida ${champ.raceIndex + 1}/2 (${trackName})`;
  }

  private buildRunButton(): void {
    const y = CANVAS_HEIGHT - 100;
    const w = CANVAS_WIDTH - 32, h = 64;
    this.runButtonBg = this.add.rectangle(16, y, w, h, 0x2ecc71).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.runButtonText = this.add.text(16 + w / 2, y + h / 2, '', {
      fontSize: '18px', color: '#111111', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.runButtonBg.on('pointerdown', () => {
      if (!canAffordRace(this.save.energy)) return;
      juice.click();
      this.startRace();
    });
  }

  private refreshEnergy(): void {
    const reloaded = loadGame();
    if (reloaded.energy !== this.save.energy) this.save = reloaded;
    this.updateHud();
  }

  private updateHud(): void {
    const pct = this.save.energy / ENERGY_MAX;
    this.energyBarFill.width = (CANVAS_WIDTH - 32) * pct;
    this.energyLabelText.setText(`${this.save.energy}/${ENERGY_MAX}`);

    if (this.save.energy >= ENERGY_MAX) {
      this.energyTimerText.setText('Energia cheia');
    } else {
      const ms = msUntilNextEnergyPoint(this.save, Date.now());
      const totalSec = Math.ceil(ms / 1000);
      const mm = Math.floor(totalSec / 60);
      const ss = totalSec % 60;
      this.energyTimerText.setText(`Próximo ponto em ${mm}:${String(ss).padStart(2, '0')}`);
    }

    this.goldText.setText(`Gold: ${this.save.gold}`);
    this.auraText.setText(`Aura: ${this.save.aura}`);

    const zoneScale = computeZoneScale(this.save.inventory);
    const lines = PART_SLOTS.map((slot) => {
      const rarity = equippedRarity(this.save.inventory, slot);
      const rarityLabel = rarity ? RARITY_LABELS[rarity] : '—';
      return `${PART_SLOT_LABELS[slot].padEnd(14, ' ')} ${rarityLabel}`;
    });
    lines.push('');
    lines.push(`Zona de precisão: x${zoneScale.toFixed(2)}`);
    this.partsSummaryText.setText(lines.join('\n'));

    const affordable = canAffordRace(this.save.energy);
    this.runButtonBg.setFillStyle(affordable ? 0x2ecc71 : 0x444a52);
    this.runButtonText.setColor(affordable ? '#111111' : '#777777');
    this.runButtonText.setText(affordable ? `CORRER (-${ENERGY_COST_PER_RACE} energia)` : 'Energia insuficiente');
  }

  /**
   * Piloto escalado pro Carro 2 (E-302/E-303, sessão 14) — sem ninguém
   * escalado (`activePilotId` nulo, ou apontando pra um piloto que de
   * alguma forma não existe mais) usa `undefined`, que `core/grid.ts` já
   * trata como o perfil "Médio" padrão de sempre.
   */
  private teammateProfile(): TeammateProfile | undefined {
    const pilot = this.save.activePilotId ? findPilot(this.save.activePilotId) : undefined;
    if (!pilot) return undefined;
    return { weights: pilotTierWeights(pilot), paceFactor: pilotPaceFactor(pilot) };
  }

  private startRace(): void {
    this.save = spendEnergyForRace(this.save, ENERGY_COST_PER_RACE);
    this.updateHud();

    // CLAUDE.md Q8: "a skill de dev. do carro desse 2º piloto beneficia a
    // equipe inteira" — soma ao zoneScale do próprio jogador, não só ao
    // desempenho do Carro 2 (que já vem do `teammate` passado à RaceScene).
    const pilot = this.save.activePilotId ? findPilot(this.save.activePilotId) : undefined;
    const devCarroBonus = pilot ? pilotDevCarroBonus(pilot) : 0;
    const carSetup: CarSetup = {
      ...DEFAULT_CAR_SETUP,
      zoneScale: computeZoneScale(this.save.inventory) + devCarroBonus,
    };
    this.scene.start('RaceScene', { carSetup, teammate: this.teammateProfile() });
  }
}
