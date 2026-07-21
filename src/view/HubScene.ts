import Phaser from 'phaser';
import type { CarSetup } from '../core/types.js';
import {
  ENERGY_MAX, ENERGY_COST_PER_RACE, canAffordRace, computeZoneScale,
  msUntilNextEnergyPoint, PART_SLOTS, PART_SLOT_LABELS, equippedRarity, RARITY_LABELS,
} from '../core/economy.js';
import { DEFAULT_CAR_SETUP } from '../core/constants.js';
import { loadGame, spendEnergyForRace, type GameSave } from '../persistence/gameSave.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
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
  private runButtonBg!: Phaser.GameObjects.Rectangle;
  private runButtonText!: Phaser.GameObjects.Text;
  private partsSummaryText!: Phaser.GameObjects.Text;

  constructor() {
    super('HubScene');
  }

  create(): void {
    this.save = loadGame();

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'RACING MANAGER', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Garagem / QG', { fontSize: '13px', color: '#8899aa' }).setOrigin(0.5);

    this.buildCars();
    this.buildOficinaButton();
    this.buildEnergyPanel();
    this.buildGoldPanel();
    this.buildPartsSummary();
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

    drawCarCard(16, 'Carro 1', 'Você (piloto titular)', 0xffdd33);
    drawCarCard(16 + cardW + 16, 'Carro 2', 'IA (companheiro — em breve)', 0x33ddff);
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

  private startRace(): void {
    this.save = spendEnergyForRace(this.save, ENERGY_COST_PER_RACE);
    this.updateHud();

    const carSetup: CarSetup = {
      ...DEFAULT_CAR_SETUP,
      zoneScale: computeZoneScale(this.save.inventory),
    };
    this.scene.start('RaceScene', { carSetup });
  }
}
