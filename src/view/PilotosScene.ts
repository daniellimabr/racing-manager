import Phaser from 'phaser';
import { AVAILABLE_PILOTS, type Pilot } from '../core/pilots.js';
import { loadGame, hirePilot, setActivePilot, type GameSave } from '../persistence/gameSave.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { juice } from './juice.js';

const ROW_HEIGHT = 132;
const FIRST_ROW_Y = 96;

interface PilotRow {
  card: Phaser.GameObjects.Rectangle;
  statusText: Phaser.GameObjects.Text;
  actionBtn?: Phaser.GameObjects.Container;
}

/**
 * Pilotos (E-302, CLAUDE.md §5 tela 3, sessão 14) — roster fixo de 4
 * candidatos (`core/pilots.ts`), cada um com "Contratar" (custo em Gold, uma
 * vez só) e, depois de contratado, "Escalar pro Carro 2" (troca quem guia o
 * companheiro de equipe — CLAUDE.md Q8). Greybox puro, mesmo padrão visual
 * da SedeScene.
 */
export class PilotosScene extends Phaser.Scene {
  private save!: GameSave;
  private goldText!: Phaser.GameObjects.Text;
  private rows = new Map<string, PilotRow>();

  constructor() {
    super('PilotosScene');
  }

  create(): void {
    this.save = loadGame();
    this.rows.clear();

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'PILOTOS', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Contrate e escale quem guia o Carro 2 (companheiro de equipe, IA)', {
      fontSize: '11px', color: '#8899aa',
    }).setOrigin(0.5);

    this.goldText = this.add.text(16, 74, '', { fontSize: '13px', color: '#ffd54f', fontStyle: 'bold' });

    this.buildBackButton();
    AVAILABLE_PILOTS.forEach((pilot, i) => this.buildPilotRow(pilot, FIRST_ROW_Y + i * ROW_HEIGHT));

    this.updateGoldText();
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

  private skillsLine(pilot: Pilot): string {
    const s = pilot.skills;
    return `Acel ${s.aceleracao} · Freio ${s.frenagem} · Pace ${s.pace} · Ultr ${s.ultrapassagem} · Dev ${s.devCarro} · Mkt ${s.marketing}`;
  }

  private buildPilotRow(pilot: Pilot, y: number): void {
    const card = this.add.rectangle(12, y, CANVAS_WIDTH - 24, ROW_HEIGHT - 8, 0x22262c)
      .setOrigin(0, 0).setStrokeStyle(1, 0x333940);
    this.add.text(22, y + 8, pilot.name, { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' });
    this.add.text(22, y + 30, this.skillsLine(pilot), { fontSize: '10px', color: '#8899aa', fontFamily: 'monospace' });

    const statusText = this.add.text(22, y + 50, '', { fontSize: '11px', color: '#cccccc' });
    this.rows.set(pilot.id, { card, statusText });
    this.refreshPilotRow(pilot, y);
  }

  private refreshPilotRow(pilot: Pilot, y: number): void {
    const row = this.rows.get(pilot.id);
    if (!row) return;
    const hired = this.save.pilotRoster.includes(pilot.id);
    const active = this.save.activePilotId === pilot.id;

    row.card.setStrokeStyle(active ? 2 : 1, active ? 0x33ddff : 0x333940);
    if (active) {
      row.statusText.setText('Escalado no Carro 2');
    } else if (hired) {
      row.statusText.setText('Contratado');
    } else {
      row.statusText.setText(`Custo: ${pilot.hireCost} Gold`);
    }

    row.actionBtn?.destroy();
    const btnY = y + ROW_HEIGHT - 8 - 32;
    const btnW = CANVAS_WIDTH - 24 - 44;

    if (active) {
      row.actionBtn = this.makeButton(22, btnY, btnW, 28, 'Desescalar (voltar ao perfil padrão)', 0x2a2e34, true, () => {
        const updated = setActivePilot(this.save, null);
        if (!updated) return;
        this.save = updated;
        this.refreshAll();
      });
    } else if (hired) {
      row.actionBtn = this.makeButton(22, btnY, btnW, 28, 'Escalar pro Carro 2', 0x33ddff, true, () => {
        const updated = setActivePilot(this.save, pilot.id);
        if (!updated) return;
        this.save = updated;
        this.refreshAll();
      });
    } else {
      const canAfford = this.save.gold >= pilot.hireCost;
      row.actionBtn = this.makeButton(22, btnY, btnW, 28, 'Contratar', 0x2ecc71, canAfford, () => {
        const updated = hirePilot(this.save, pilot.id);
        if (!updated) return;
        this.save = updated;
        this.updateGoldText();
        this.refreshAll();
      });
    }
  }

  /** Escalar troca quem está ativo em todas as linhas (só 1 pode estar ativo) — mais simples redesenhar tudo do que rastrear a linha anterior. */
  private refreshAll(): void {
    this.updateGoldText();
    AVAILABLE_PILOTS.forEach((pilot, i) => this.refreshPilotRow(pilot, FIRST_ROW_Y + i * ROW_HEIGHT));
  }
}
