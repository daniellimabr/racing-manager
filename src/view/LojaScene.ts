import Phaser from 'phaser';
import { CHEST_TIERS, CHESTS, type ChestTier } from '../core/chests.js';
import { PART_SLOT_LABELS, RARITY_LABELS } from '../core/economy.js';
import { loadGame, buyChest, type GameSave } from '../persistence/gameSave.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { juice } from './juice.js';

const CHEST_ROW_HEIGHT = 110;
const FIRST_ROW_Y = 108;

interface ChestRow {
  card: Phaser.GameObjects.Rectangle;
  buyBtn?: Phaser.GameObjects.Container;
  resultText: Phaser.GameObjects.Text;
}

/**
 * Loja (E-305, CLAUDE.md §5 tela 6/§6.2, sessão 14) — baús comprados com Aura
 * (`core/chests.ts`). Greybox puro: 4 tiers fixos, sem ofertas diárias/gemas
 * ainda (CLAUDE.md menciona isso mas não é bloqueio pra ter a Loja
 * funcionando — ofertas rotativas ficam pra uma sessão futura).
 */
export class LojaScene extends Phaser.Scene {
  private save!: GameSave;
  private auraText!: Phaser.GameObjects.Text;
  private rows = new Map<ChestTier, ChestRow>();

  constructor() {
    super('LojaScene');
  }

  create(): void {
    this.save = loadGame();
    this.rows.clear();

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'LOJA', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Baús de peças — compre com Aura (ganha no pódio das corridas)', {
      fontSize: '11px', color: '#8899aa',
    }).setOrigin(0.5);

    this.auraText = this.add.text(16, 74, '', { fontSize: '13px', color: '#ba68c8', fontStyle: 'bold' });

    this.buildBackButton();
    CHEST_TIERS.forEach((tier, i) => this.buildChestRow(tier, FIRST_ROW_Y + i * CHEST_ROW_HEIGHT));

    this.refreshAll();
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

  private buildChestRow(tier: ChestTier, y: number): void {
    const chest = CHESTS[tier];
    const card = this.add.rectangle(12, y, CANVAS_WIDTH - 24, CHEST_ROW_HEIGHT - 8, 0x22262c)
      .setOrigin(0, 0).setStrokeStyle(1, 0x333940);
    this.add.text(22, y + 8, chest.name, { fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });
    this.add.text(22, y + 30, `${chest.partsCount}x peça${chest.partsCount > 1 ? 's' : ''} — chance crescente de raridade alta`, {
      fontSize: '10px', color: '#8899aa',
    });

    const resultText = this.add.text(22, y + 48, '', {
      fontSize: '10px', color: '#cccccc', wordWrap: { width: CANVAS_WIDTH - 44 },
    });
    this.rows.set(tier, { card, resultText });
    this.refreshChestRow(tier, y);
  }

  private refreshChestRow(tier: ChestTier, y: number): void {
    const row = this.rows.get(tier);
    if (!row) return;
    const chest = CHESTS[tier];

    row.buyBtn?.destroy();
    const btnY = y + CHEST_ROW_HEIGHT - 8 - 30;
    const canAfford = this.save.aura >= chest.auraCost;
    row.buyBtn = this.makeButton(22, btnY, 200, 26, `Abrir (-${chest.auraCost} Aura)`, 0xba68c8, canAfford, () => {
      const result = buyChest(this.save, tier);
      if (!result) return;
      this.save = result.save;
      const parts = result.partsDropped.map((d) => `${PART_SLOT_LABELS[d.slot]} (${RARITY_LABELS[d.rarity]})`);
      const fusions = result.fusions.map((f) => `Fusão! ${PART_SLOT_LABELS[f.slot]}: ${RARITY_LABELS[f.from]} → ${RARITY_LABELS[f.to]}`);
      row.resultText.setText([...parts, ...fusions].join('\n'));
      this.refreshAll();
    });
  }

  private refreshAll(): void {
    this.auraText.setText(`Aura: ${this.save.aura}`);
    CHEST_TIERS.forEach((tier, i) => this.refreshChestRow(tier, FIRST_ROW_Y + i * CHEST_ROW_HEIGHT));
  }
}
