import Phaser from 'phaser';
import type { CarSetup } from '../core/types.js';
import type { TeamId } from '../core/grid.js';
import {
  CHAMPIONSHIP_CALENDAR, currentChampionshipTrackId, isChampionshipComplete, sortedStandings,
} from '../core/championship.js';
import {
  loadGame, startChampionship, spendEnergyForRace, type GameSave,
} from '../persistence/gameSave.js';
import { findPilot, pilotTierWeights, pilotPaceFactor, pilotDevCarroBonus } from '../core/pilots.js';
import { computeZoneScale, canAffordRace, ENERGY_COST_PER_RACE } from '../core/economy.js';
import { DEFAULT_CAR_SETUP } from '../core/constants.js';
import type { TeammateProfile } from '../core/grid.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { TRACKS } from './RaceScene.js';
import { juice } from './juice.js';

const TEAM_LABELS: Record<TeamId, string> = {
  player: 'Sua Equipe',
  alpha: 'Equipe Alpha',
  bravo: 'Equipe Bravo',
  charlie: 'Equipe Charlie',
  delta: 'Equipe Delta',
  echo: 'Equipe Echo',
};

/**
 * Campeonato de construtores (sessão 15, pedido direto do PO — CLAUDE.md §5
 * item 8 "Seleção de campeonato/corrida" já previa essa tela, deliberadamente
 * adiada até existir uma 2ª pista de verdade). Escopo mínimo: calendário fixo
 * de 2 corridas (`core/championship.ts`), 3 estados possíveis — sem
 * campeonato ativo (botão "Iniciar"), em andamento (calendário + classificação
 * + botão pra próxima corrida), encerrado (campeão + classificação final +
 * botão "Novo Campeonato"). Greybox puro, mesmo espírito do resto do jogo
 * nesta fase — sem arte.
 */
export class ChampionshipScene extends Phaser.Scene {
  private save!: GameSave;

  constructor() {
    super('ChampionshipScene');
  }

  create(): void {
    this.save = loadGame();

    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.add.text(CANVAS_WIDTH / 2, 28, 'CAMPEONATO', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(CANVAS_WIDTH / 2, 54, 'Construtores — 2 corridas', {
      fontSize: '13px', color: '#8899aa',
    }).setOrigin(0.5);

    this.buildBackButton();

    const champ = this.save.championship;
    if (!champ) {
      this.renderNotStarted();
    } else if (isChampionshipComplete(champ)) {
      this.renderComplete(champ.teamPoints);
    } else {
      this.renderInProgress(champ);
    }
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
      fontSize: '13px', color: enabled ? '#111111' : '#556677', fontStyle: 'bold',
    }).setOrigin(0.5);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => { juice.click(); onClick(); });
    }
    c.add([bg, text]);
    return c;
  }

  private drawCalendar(y: number, raceIndexDone: number): number {
    this.add.text(16, y, 'Calendário', { fontSize: '13px', color: '#ffffff', fontStyle: 'bold' });
    y += 24;
    CHAMPIONSHIP_CALENDAR.forEach((race, i) => {
      const t = TRACKS[race.trackId];
      const done = i < raceIndexDone;
      const isNext = i === raceIndexDone;
      const marker = done ? '✓' : isNext ? '▶' : ' ';
      const color = done ? '#4caf50' : isNext ? '#ffd54f' : '#8899aa';
      this.add.text(24, y, `${marker} ${i + 1}. ${t.name}`, { fontSize: '13px', color, fontFamily: 'monospace' });
      y += 22;
    });
    return y + 12;
  }

  private drawStandings(y: number, teamPoints: Partial<Record<TeamId, number>>): number {
    this.add.text(16, y, 'Classificação (construtores)', { fontSize: '13px', color: '#ffffff', fontStyle: 'bold' });
    y += 24;
    const standings = sortedStandings({ raceIndex: 0, teamPoints, history: [] });
    if (standings.length === 0) {
      this.add.text(24, y, 'Nenhum ponto marcado ainda.', { fontSize: '12px', color: '#8899aa' });
      return y + 22;
    }
    standings.forEach((s, i) => {
      const label = TEAM_LABELS[s.teamId] ?? s.teamId;
      const color = s.teamId === 'player' ? '#ffdd33' : '#cccccc';
      this.add.text(24, y, `P${i + 1}  ${label.padEnd(16, ' ')} ${s.points} pts`, {
        fontSize: '12px', color, fontFamily: 'monospace',
      });
      y += 20;
    });
    return y + 12;
  }

  private renderNotStarted(): void {
    let y = 100;
    y = this.drawCalendar(y, 0);
    this.add.text(16, y, 'Pontuação: F1 clássica (25-18-15-12-10-8-6-4-2-1 pros 10 primeiros).', {
      fontSize: '11px', color: '#8899aa', wordWrap: { width: CANVAS_WIDTH - 32 },
    });
    y += 40;
    this.add.text(16, y, 'Carro 2 (companheiro de equipe) também pontua pra sua equipe.', {
      fontSize: '11px', color: '#8899aa', wordWrap: { width: CANVAS_WIDTH - 32 },
    });
    y += 50;

    this.makeButton(16, y, CANVAS_WIDTH - 32, 48, 'Iniciar Campeonato', 0x2ecc71, true, () => {
      this.save = startChampionship(this.save);
      this.scene.restart();
    });
  }

  private renderInProgress(champ: NonNullable<GameSave['championship']>): void {
    let y = 100;
    y = this.drawCalendar(y, champ.raceIndex);
    y = this.drawStandings(y, champ.teamPoints);

    const nextTrackId = currentChampionshipTrackId(champ);
    if (!nextTrackId) return; // não deveria acontecer (isChampionshipComplete já cobriria), guarda defensivo
    const nextTrack = TRACKS[nextTrackId];
    const affordable = canAffordRace(this.save.energy);
    const label = affordable
      ? `Correr: ${nextTrack.name} (-${ENERGY_COST_PER_RACE} energia)`
      : `Energia insuficiente pra ${nextTrack.name}`;
    this.makeButton(16, y, CANVAS_WIDTH - 32, 56, label, 0x2ecc71, affordable, () => {
      this.startChampionshipRace(nextTrackId);
    });
  }

  private renderComplete(teamPoints: Partial<Record<TeamId, number>>): void {
    const standings = sortedStandings({ raceIndex: 0, teamPoints, history: [] });
    const champion = standings[0];

    let y = 100;
    if (champion) {
      const isPlayerChampion = champion.teamId === 'player';
      this.add.text(CANVAS_WIDTH / 2, y, isPlayerChampion ? '🏆 SUA EQUIPE É CAMPEÃ! 🏆' : `Campeã: ${TEAM_LABELS[champion.teamId]}`, {
        fontSize: '16px', color: isPlayerChampion ? '#ffd54f' : '#ffffff', fontStyle: 'bold',
        wordWrap: { width: CANVAS_WIDTH - 32 }, align: 'center',
      }).setOrigin(0.5, 0);
      y += 50;
    }

    y = this.drawStandings(y, teamPoints);
    y += 20;

    this.makeButton(16, y, CANVAS_WIDTH - 32, 48, 'Novo Campeonato', 0x2ecc71, true, () => {
      this.save = startChampionship(this.save);
      this.scene.restart();
    });
  }

  private startChampionshipRace(trackId: string): void {
    this.save = spendEnergyForRace(this.save, ENERGY_COST_PER_RACE);

    // mesmo cálculo de carSetup/teammate do Hub (HubScene.startRace) — CLAUDE.md
    // Q8: a skill de dev. do carro do 2º piloto beneficia a equipe inteira.
    const pilot = this.save.activePilotId ? findPilot(this.save.activePilotId) : undefined;
    const devCarroBonus = pilot ? pilotDevCarroBonus(pilot) : 0;
    const carSetup: CarSetup = {
      ...DEFAULT_CAR_SETUP,
      zoneScale: computeZoneScale(this.save.inventory) + devCarroBonus,
    };
    const teammate: TeammateProfile | undefined = pilot
      ? { weights: pilotTierWeights(pilot), paceFactor: pilotPaceFactor(pilot) }
      : undefined;

    this.scene.start('RaceScene', { carSetup, teammate, trackId, isChampionshipRace: true });
  }
}
