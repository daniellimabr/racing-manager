import Phaser from 'phaser';
import { PART_SLOTS, PART_SLOT_LABELS, RARITIES, RARITY_LABELS, type Rarity, type PartSlot } from '../core/economy.js';
import { OFFICE_MAX_LEVEL, officeUpgradeCost } from '../core/offices.js';
import {
  loadGame, collectOfficeParts, collectAllOfficeParts, upgradeOfficeLevel, type GameSave,
} from '../persistence/gameSave.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { juice } from './juice.js';

const ROW_HEIGHT = 88;
// 96 → 132: abre espaço pro botão "Coletar tudo" (pedido do PO) logo acima da lista de escritórios.
const FIRST_ROW_Y = 132;

interface OfficeRow {
  levelText: Phaser.GameObjects.Text;
  pendingText: Phaser.GameObjects.Text;
  collectBtn?: Phaser.GameObjects.Container;
  upgradeBtn?: Phaser.GameObjects.Container;
}

/**
 * Sede do time (E-301, CLAUDE.md §9/Q9, sessão 13) — 1 escritório por tipo de
 * peça (o de marketing fica de fora por ora, ver `core/offices.ts`). Cada
 * linha mostra o nível do escritório, quanto está pronto pra coletar, e 2
 * botões: "Coletar" (se houver produção pendente) e "Upar" (mostra o custo em
 * Gold, ou "Nível MÁX" no teto). Greybox puro, mesmo espírito do resto do
 * jogo nesta fase — sem arte.
 */
export class SedeScene extends Phaser.Scene {
  private save!: GameSave;
  private goldText!: Phaser.GameObjects.Text;
  private rows: Partial<Record<PartSlot, OfficeRow>> = {};
  private collectAllBtn?: Phaser.GameObjects.Container;

  constructor() {
    super('SedeScene');
  }

  create(): void {
    this.save = loadGame();
    this.rows = {};

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'SEDE DO TIME', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Escritórios produzem peças com o tempo — colete e invista pra acelerar', {
      fontSize: '11px', color: '#8899aa',
    }).setOrigin(0.5);

    this.goldText = this.add.text(16, 74, '', { fontSize: '13px', color: '#ffd54f', fontStyle: 'bold' });

    this.buildBackButton();
    this.buildCollectAllButton();
    PART_SLOTS.forEach((slot, i) => this.buildOfficeRow(slot, FIRST_ROW_Y + i * ROW_HEIGHT));

    this.updateGoldText();
  }

  private totalPendingAllOffices(): number {
    return PART_SLOTS.reduce((sum, slot) => {
      const office = this.save.offices[slot];
      return sum + RARITIES.reduce((s, r) => s + office.pending[r], 0);
    }, 0);
  }

  /** "Coletar tudo" (pedido do PO): coleta a produção pendente dos 7 escritórios de uma vez, sem precisar entrar linha por linha. */
  private buildCollectAllButton(): void {
    this.refreshCollectAllButton();
  }

  private refreshCollectAllButton(): void {
    this.collectAllBtn?.destroy();
    const total = this.totalPendingAllOffices();
    const y = 96, h = 30;
    this.collectAllBtn = this.makeButton(
      16, y, CANVAS_WIDTH - 32, h,
      total > 0 ? `Coletar tudo (${total} peças prontas)` : 'Coletar tudo (nada pronto ainda)',
      0x2ecc71, total > 0, () => {
        const { save } = collectAllOfficeParts(this.save);
        this.save = save;
        PART_SLOTS.forEach((slot, i) => this.refreshOfficeRow(slot, FIRST_ROW_Y + i * ROW_HEIGHT));
        this.refreshCollectAllButton();
      }
    );
  }

  private buildBackButton(): void {
    const bg = this.add.rectangle(CANVAS_WIDTH - 90, 14, 74, 28, 0x2a2e34)
      .setOrigin(0, 0).setStrokeStyle(1, 0x444a52).setInteractive({ useHandCursor: true });
    this.add.text(CANVAS_WIDTH - 53, 28, '< Hub', { fontSize: '12px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.scene.start('HubScene');
    });
  }

  private updateGoldText(): void {
    this.goldText.setText(`Gold: ${this.save.gold}`);
  }

  private makeButton(
    x: number, y: number, w: number, h: number, label: string, color: number, enabled: boolean, onClick: () => void
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, enabled ? color : 0x2a2e34, 1).setOrigin(0, 0);
    const text = this.add.text(w / 2, h / 2, label, {
      fontSize: '11px', color: enabled ? '#111111' : '#556677', fontStyle: 'bold',
    }).setOrigin(0.5);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => { juice.click(); onClick(); });
    }
    c.add([bg, text]);
    return c;
  }

  private buildOfficeRow(slot: PartSlot, y: number): void {
    this.add.rectangle(12, y, CANVAS_WIDTH - 24, ROW_HEIGHT - 8, 0x22262c)
      .setOrigin(0, 0).setStrokeStyle(1, 0x333940);
    this.add.text(22, y + 8, PART_SLOT_LABELS[slot], {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    });

    const levelText = this.add.text(180, y + 11, '', { fontSize: '11px', color: '#8899aa' });
    const pendingText = this.add.text(22, y + 30, '', { fontSize: '11px', color: '#cccccc' });

    this.rows[slot] = { levelText, pendingText };
    this.refreshOfficeRow(slot, y);
  }

  private refreshOfficeRow(slot: PartSlot, y: number): void {
    const row = this.rows[slot];
    if (!row) return;
    const office = this.save.offices[slot];

    row.levelText.setText(`Nível ${office.level}/${OFFICE_MAX_LEVEL}`);

    const pendingParts = RARITIES
      .map((r): [Rarity, number] => [r, office.pending[r]])
      .filter(([, n]) => n > 0)
      .map(([r, n]) => `${n}x ${RARITY_LABELS[r]}`);
    row.pendingText.setText(pendingParts.length > 0 ? `Pronto: ${pendingParts.join(', ')}` : 'Nada pronto ainda');

    const totalPending = RARITIES.reduce((sum, r) => sum + office.pending[r], 0);
    const cost = officeUpgradeCost(office.level);

    row.collectBtn?.destroy();
    row.upgradeBtn?.destroy();

    const btnY = y + ROW_HEIGHT - 8 - 32;
    const btnW = 170;

    row.collectBtn = this.makeButton(22, btnY, btnW, 28, 'Coletar', 0x2ecc71, totalPending > 0, () => {
      const { save } = collectOfficeParts(this.save, slot);
      this.save = save;
      this.refreshOfficeRow(slot, y);
      this.refreshCollectAllButton();
    });

    const upgradeLabel = cost === null ? 'Nível MÁX' : `Upar (-${cost} Gold)`;
    const canUpgrade = cost !== null && this.save.gold >= cost;
    row.upgradeBtn = this.makeButton(22 + btnW + 12, btnY, btnW, 28, upgradeLabel, 0x64b5f6, canUpgrade, () => {
      const updated = upgradeOfficeLevel(this.save, slot);
      if (!updated) return;
      this.save = updated;
      this.updateGoldText();
      this.refreshOfficeRow(slot, y);
    });
  }
}
