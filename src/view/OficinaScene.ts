import Phaser from 'phaser';
import {
  PART_SLOTS, PART_SLOT_LABELS, RARITIES, RARITY_LABELS, equippedRarity,
  type Rarity, type PartSlot,
} from '../core/economy.js';
import { loadGame, equipPart, type GameSave } from '../persistence/gameSave.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { juice } from './juice.js';

const RARITY_COLORS: Record<Rarity, number> = {
  gray: 0x9e9e9e, green: 0x2ecc71, blue: 0x2196f3, purple: 0x9b59b6, gold: 0xffc107, red: 0xe74c3c,
};

const ROW_HEIGHT = 96;
const FIRST_ROW_Y = 84;

interface RarityButton {
  rarity: Rarity;
  bg: Phaser.GameObjects.Rectangle;
}

interface SlotRow {
  equippedText: Phaser.GameObjects.Text;
  rarityButtons: RarityButton[];
}

/**
 * Oficina (E-207, CLAUDE.md §5 tela 2 / §3 decisão sobre a Oficina) — equipar
 * peça vira escolha explícita do jogador. O PO rejeitou o auto-equip (E-203,
 * sessão anterior) como solução permanente: "equipar deve ser escolha do
 * jogador" (Claude-Manager.md §3, pergunta 5). Mostra os 7 slots (CLAUDE.md
 * §7/Q7: motor, asa dianteira, asa traseira, chassis, suspensão, pneu,
 * livery); cada um lista as raridades que o jogador possui em quantidade > 0
 * (com a contagem) e permite tocar pra equipar qualquer uma delas — mesmo
 * que não seja a melhor. A lógica de qual raridade fica efetivamente
 * equipada (escolha do jogador, com fallback automático se ela sumir do
 * inventário) vive em `core/economy.ts` (`equippedRarity`/`setEquipped`);
 * esta cena só é a UI por cima de `persistence/gameSave.ts` (`equipPart`).
 *
 * Greybox puro (texto/retângulos), mesmo espírito do resto do jogo nesta
 * fase — sem arte.
 *
 * FORA DE ESCOPO (pendência registrada em Claude-Manager.md, não é parte
 * desta entrega): o modal de livery com os 6 slots de patrocinador que o
 * CLAUDE.md menciona como parte da tela Oficina. Não existe NENHUM sistema
 * de patrocinadores modelado em `economy.ts` ainda — é uma feature própria
 * maior, não uma variação do equipar normal. Aqui, `livery` é só mais um
 * slot equipável por raridade, igual aos outros 6.
 */
export class OficinaScene extends Phaser.Scene {
  private save!: GameSave;
  private slotRows: Partial<Record<PartSlot, SlotRow>> = {};

  constructor() {
    super('OficinaScene');
  }

  create(): void {
    this.save = loadGame();
    this.slotRows = {};

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'OFICINA', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Toque numa raridade para equipar', {
      fontSize: '12px', color: '#8899aa',
    }).setOrigin(0.5);

    this.buildBackButton();
    PART_SLOTS.forEach((slot, i) => this.buildSlotRow(slot, FIRST_ROW_Y + i * ROW_HEIGHT));
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

  private buildSlotRow(slot: PartSlot, y: number): void {
    this.add.rectangle(12, y, CANVAS_WIDTH - 24, ROW_HEIGHT - 8, 0x22262c)
      .setOrigin(0, 0).setStrokeStyle(1, 0x333940);
    this.add.text(22, y + 8, PART_SLOT_LABELS[slot], {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    });

    const equippedText = this.add.text(22, y + 28, '', { fontSize: '11px', color: '#8899aa' });

    const owned = RARITIES.filter((r) => this.save.inventory.counts[slot][r] > 0);
    const rarityButtons: RarityButton[] = [];

    if (owned.length === 0) {
      this.add.text(22, y + 48, '(nenhuma peça possuída neste slot)', { fontSize: '11px', color: '#556677' });
    } else {
      let bx = 22;
      const buttonY = y + 48;
      for (const rarity of owned) {
        const count = this.save.inventory.counts[slot][rarity];
        const label = `${RARITY_LABELS[rarity]} x${count}`;
        const w = 22 + label.length * 6.4;
        const bg = this.add.rectangle(bx, buttonY, w, 28, RARITY_COLORS[rarity], 0.25)
          .setOrigin(0, 0).setStrokeStyle(2, RARITY_COLORS[rarity]).setInteractive({ useHandCursor: true });
        this.add.text(bx + w / 2, buttonY + 14, label, { fontSize: '11px', color: '#ffffff' }).setOrigin(0.5);
        bg.on('pointerdown', () => this.onEquip(slot, rarity));
        rarityButtons.push({ rarity, bg });
        bx += w + 8;
      }
    }

    this.slotRows[slot] = { equippedText, rarityButtons };
    this.refreshSlotRow(slot);
  }

  private onEquip(slot: PartSlot, rarity: Rarity): void {
    this.save = equipPart(this.save, slot, rarity);
    juice.click();
    this.refreshSlotRow(slot);
  }

  /** Atualiza o texto "Equipado: X" e realça (stroke mais grosso + preenchimento mais forte) o botão da raridade efetivamente equipada. */
  private refreshSlotRow(slot: PartSlot): void {
    const row = this.slotRows[slot];
    if (!row) return;
    const rarity = equippedRarity(this.save.inventory, slot);
    row.equippedText.setText(rarity ? `Equipado: ${RARITY_LABELS[rarity]}` : 'Equipado: — (nenhuma peça)');

    for (const btn of row.rarityButtons) {
      const isEquipped = btn.rarity === rarity;
      btn.bg.setStrokeStyle(isEquipped ? 4 : 2, RARITY_COLORS[btn.rarity]);
      btn.bg.setFillStyle(RARITY_COLORS[btn.rarity], isEquipped ? 0.55 : 0.25);
    }
  }
}
