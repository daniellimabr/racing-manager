import Phaser from 'phaser';
import { AVAILABLE_SPONSORS, LIVERY_SPONSOR_SLOTS, type Sponsor } from '../core/sponsors.js';
import { MARKETING_MAX_LEVEL, marketingUpgradeCost } from '../core/offices.js';
import {
  loadGame, collectMarketingReputacao, upgradeMarketingOfficeLevel, hireSponsor, releaseSponsor, type GameSave,
} from '../persistence/gameSave.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { juice } from './juice.js';

const SPONSOR_ROW_HEIGHT = 68;
const SPONSOR_FIRST_ROW_Y = 234;

interface SponsorRow {
  card: Phaser.GameObjects.Rectangle;
  statusText: Phaser.GameObjects.Text;
  actionBtn?: Phaser.GameObjects.Container;
}

/**
 * Marketing (Claude-Manager.md §5 item 5/6, sessão 14) — junta o escritório de
 * marketing (produção passiva de Reputação, mesmo padrão dos outros 7 da
 * Sede) com a contratação de patrocinadores da livery (`core/sponsors.ts`),
 * que finalmente destrava esse escritório: sem patrocinador pra contratar,
 * Reputação não tinha em que ser gasta. CLAUDE.md descreve isso como um modal
 * dentro da Oficina — aqui virou uma tela própria (mesmo padrão das outras
 * cenas de sistema desta sessão: Pilotos, Sede), simplificação deliberada de
 * greybox, registrada em Claude-Manager.md.
 */
export class MarketingScene extends Phaser.Scene {
  private save!: GameSave;
  private officeLevelText!: Phaser.GameObjects.Text;
  private pendingText!: Phaser.GameObjects.Text;
  private reputacaoText!: Phaser.GameObjects.Text;
  private slotsText!: Phaser.GameObjects.Text;
  private collectBtn?: Phaser.GameObjects.Container;
  private upgradeBtn?: Phaser.GameObjects.Container;
  private rows = new Map<string, SponsorRow>();

  constructor() {
    super('MarketingScene');
  }

  create(): void {
    this.save = loadGame();
    this.rows.clear();

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'MARKETING', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Reputação vira patrocinador: mais % de Gold por corrida', {
      fontSize: '11px', color: '#8899aa',
    }).setOrigin(0.5);

    this.buildBackButton();
    this.buildMarketingOffice();
    AVAILABLE_SPONSORS.forEach((sponsor, i) => this.buildSponsorRow(sponsor, SPONSOR_FIRST_ROW_Y + i * SPONSOR_ROW_HEIGHT));

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

  private buildMarketingOffice(): void {
    this.add.rectangle(12, 76, CANVAS_WIDTH - 24, 148, 0x22262c).setOrigin(0, 0).setStrokeStyle(1, 0x333940);
    this.add.text(22, 84, 'Escritório de Marketing', { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' });
    this.officeLevelText = this.add.text(220, 87, '', { fontSize: '11px', color: '#8899aa' });
    this.pendingText = this.add.text(22, 106, '', { fontSize: '11px', color: '#cccccc' });
    this.reputacaoText = this.add.text(22, 124, '', { fontSize: '13px', color: '#ffd54f', fontStyle: 'bold' });
    this.slotsText = this.add.text(22, 144, '', { fontSize: '11px', color: '#8899aa' });
  }

  private refreshMarketingOffice(): void {
    const office = this.save.marketingOffice;
    this.officeLevelText.setText(`Nível ${office.level}/${MARKETING_MAX_LEVEL}`);
    this.pendingText.setText(office.pendingReputacao > 0 ? `Pronto: ${office.pendingReputacao} Reputação` : 'Nada pronto ainda');
    this.reputacaoText.setText(`Reputação: ${this.save.reputacao}`);
    this.slotsText.setText(`Patrocinadores: ${this.save.hiredSponsorIds.length}/${LIVERY_SPONSOR_SLOTS} posições`);

    this.collectBtn?.destroy();
    this.upgradeBtn?.destroy();

    const btnY = 76 + 148 - 8 - 32;
    const btnW = 210;
    this.collectBtn = this.makeButton(22, btnY, btnW, 28, 'Coletar', 0x2ecc71, office.pendingReputacao > 0, () => {
      this.save = collectMarketingReputacao(this.save);
      this.refreshAll();
    });

    const cost = marketingUpgradeCost(office.level);
    const upgradeLabel = cost === null ? 'Nível MÁX' : `Upar (-${cost} Gold)`;
    const canUpgrade = cost !== null && this.save.gold >= cost;
    this.upgradeBtn = this.makeButton(22 + btnW + 12, btnY, btnW, 28, upgradeLabel, 0x64b5f6, canUpgrade, () => {
      const updated = upgradeMarketingOfficeLevel(this.save);
      if (!updated) return;
      this.save = updated;
      this.refreshAll();
    });
  }

  private buildSponsorRow(sponsor: Sponsor, y: number): void {
    const card = this.add.rectangle(12, y, CANVAS_WIDTH - 24, SPONSOR_ROW_HEIGHT - 8, 0x22262c)
      .setOrigin(0, 0).setStrokeStyle(1, 0x333940);
    this.add.text(22, y + 6, sponsor.name, { fontSize: '13px', color: '#ffffff', fontStyle: 'bold' });
    this.add.text(22, y + 24, `+${sponsor.goldBonusPct}% Gold por corrida`, { fontSize: '10px', color: '#8899aa' });

    const statusText = this.add.text(CANVAS_WIDTH - 200, y + 6, '', { fontSize: '10px', color: '#cccccc' }).setOrigin(0, 0);
    this.rows.set(sponsor.id, { card, statusText });
    this.refreshSponsorRow(sponsor, y);
  }

  private refreshSponsorRow(sponsor: Sponsor, y: number): void {
    const row = this.rows.get(sponsor.id);
    if (!row) return;
    const hired = this.save.hiredSponsorIds.includes(sponsor.id);

    row.card.setStrokeStyle(hired ? 2 : 1, hired ? 0x33ddff : 0x333940);
    row.statusText.setText(hired ? 'Contratado' : `Custo: ${sponsor.reputationCost} Reputação`);

    row.actionBtn?.destroy();
    const btnW = 110;
    const btnX = CANVAS_WIDTH - 24 - btnW - 8;
    const btnY = y + (SPONSOR_ROW_HEIGHT - 8 - 26) / 2;

    if (hired) {
      row.actionBtn = this.makeButton(btnX, btnY, btnW, 26, 'Liberar', 0x2a2e34, true, () => {
        this.save = releaseSponsor(this.save, sponsor.id);
        this.refreshAll();
      });
    } else {
      const slotsFull = this.save.hiredSponsorIds.length >= LIVERY_SPONSOR_SLOTS;
      const canAfford = this.save.reputacao >= sponsor.reputationCost;
      row.actionBtn = this.makeButton(btnX, btnY, btnW, 26, slotsFull ? 'Sem posição' : 'Contratar', 0x2ecc71, canAfford && !slotsFull, () => {
        const updated = hireSponsor(this.save, sponsor.id);
        if (!updated) return;
        this.save = updated;
        this.refreshAll();
      });
    }
  }

  /** Contratar/liberar/upar afeta Gold e posições disponíveis pra todo mundo — mais simples redesenhar tudo do que rastrear dependências entre linhas. */
  private refreshAll(): void {
    this.refreshMarketingOffice();
    AVAILABLE_SPONSORS.forEach((sponsor, i) => this.refreshSponsorRow(sponsor, SPONSOR_FIRST_ROW_Y + i * SPONSOR_ROW_HEIGHT));
  }
}
