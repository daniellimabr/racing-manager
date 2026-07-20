import Phaser from 'phaser';
import spaTrack from '../../tracks/spa.json';
import type { TrackDef, RaceState, RaceEvent, Tier, BoostId, CarSetup } from '../core/types.js';
import {
  createRace, currentEvent, resolveCurrent, advance, revive, toRaceOutput,
  setOvertakeAttempt, applyBoost, tryUseNitro,
} from '../core/raceState.js';
import { tierFromPosition, zoneHalves, computeScale, canAttemptOvertake } from '../core/timing.js';
import { createGridSim, advanceGrid, deriveStandings } from '../core/grid.js';
import type { GridState, GridStanding } from '../core/grid.js';
import { normalizedToScreen, pathIndexToT, pointAtT } from './pathUtils.js';
import {
  TRACK_RECT, CANVAS_WIDTH, CANVAS_HEIGHT, HUD_HEIGHT, PANEL_HEIGHT,
  CURSOR_SWEEP_PERIOD_MS, CHALLENGE_TIME_LIMIT_MS, TWEEN_DURATION_MS,
  SECONDS_PER_LAP_VISUAL, MAX_VISUAL_GAP_SECONDS, TIER_COLORS, BOOST_LABELS, TEAM_COLORS,
  DEFAULT_CAR_SETUP, DEFAULT_PIT_CREW_QUALITY,
} from './viewConstants.js';
import { track as trackEvent } from '../telemetry/analytics.js';

const track = spaTrack as unknown as TrackDef;
const PANEL_Y = CANVAS_HEIGHT - PANEL_HEIGHT;

function pathIndexForEvent(ev: RaceEvent): number {
  if (ev.kind === 'pit') return track.pitPathIndex;
  if (ev.cornerId) {
    const corner = track.corners.find((c) => c.id === ev.cornerId);
    if (corner) return corner.pathIndex;
  }
  return 0; // largada
}

function formatGap(gap: number): string {
  const sign = gap >= 0 ? '+' : '-';
  return `${sign}${Math.abs(gap).toFixed(3).replace('.', ',')}s`;
}

function triangleWave(elapsedMs: number, periodMs: number): number {
  const t = (elapsedMs % periodMs) / periodMs;
  const phase = t < 0.5 ? t * 2 : 2 - t * 2;
  return phase * 100;
}

interface IconEntry {
  container: Phaser.GameObjects.Container;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

export class RaceScene extends Phaser.Scene {
  private raceState!: RaceState;
  private gridState!: GridState;
  private carSetup: CarSetup = DEFAULT_CAR_SETUP;
  private playerCumulativeTime = 0;

  private trackGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private icons = new Map<string, IconEntry>();
  private panel!: Phaser.GameObjects.Container;

  private challengeActive = false;
  private challengeStartTime = 0;
  private challengeHalves = { purple: 8, green: 20, amber: 35 };
  private cursorGraphics!: Phaser.GameObjects.Graphics;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private pendingNitro = false;
  private pendingOvertake = false;
  private raceStartTime = 0;
  private raceEnded = false;

  constructor() {
    super('RaceScene');
  }

  create(): void {
    this.raceState = createRace(track, this.carSetup);
    this.gridState = createGridSim();
    this.playerCumulativeTime = 0;
    this.raceStartTime = Date.now();
    this.raceEnded = false;
    trackEvent('race_start', { trackId: track.id });

    this.add.rectangle(0, 0, CANVAS_WIDTH, HUD_HEIGHT, 0x222222).setOrigin(0, 0);
    this.hudText = this.add.text(10, 8, '', { fontSize: '14px', color: '#eeeeee', lineSpacing: 4 });

    this.trackGraphics = this.add.graphics();
    this.drawTrack();

    for (const standing of this.currentStandings()) {
      this.icons.set(standing.id, this.createIcon(standing));
    }

    this.add.rectangle(0, PANEL_Y, CANVAS_WIDTH, PANEL_HEIGHT, 0x1a1a1a).setOrigin(0, 0);
    this.panel = this.add.container(0, PANEL_Y);

    this.updateIconPositions(false);
    this.startEventCycle();
  }

  update(time: number): void {
    if (this.challengeActive) this.drawCursor(time);
  }

  // ---------- desenho estático ----------

  private drawTrack(): void {
    const g = this.trackGraphics;
    g.clear();
    g.lineStyle(6, 0x555555, 1);
    g.beginPath();
    track.path.forEach((p, i) => {
      const s = normalizedToScreen(p, TRACK_RECT);
      if (i === 0) g.moveTo(s.x, s.y);
      else g.lineTo(s.x, s.y);
    });
    const s0 = normalizedToScreen(track.path[0], TRACK_RECT);
    g.lineTo(s0.x, s0.y);
    g.strokePath();

    for (const corner of track.corners) {
      const s = normalizedToScreen(track.path[corner.pathIndex], TRACK_RECT);
      g.fillStyle(0x444444, 1);
      g.fillCircle(s.x, s.y, 4);
    }
    const pit = normalizedToScreen(track.path[track.pitPathIndex], TRACK_RECT);
    g.fillStyle(0x2196f3, 1);
    g.fillCircle(pit.x, pit.y, 6);
  }

  private currentStandings(): GridStanding[] {
    return deriveStandings(this.gridState, {
      id: 'player', label: 'Você', cumulativeTime: this.playerCumulativeTime,
    });
  }

  private createIcon(standing: GridStanding): IconEntry {
    const radius = this.iconRadius(standing);
    const color = this.iconColor(standing);
    const container = this.add.container(0, 0);
    if (standing.position <= 3) {
      const ring = this.add.circle(0, 0, radius + 3, 0xffffff, 0);
      ring.setStrokeStyle(2, 0xffffff, 0.9);
      container.add(ring);
    }
    const circle = this.add.circle(0, 0, radius, color, 1);
    const label = this.add.text(0, 0, String(standing.position), {
      fontSize: '10px', color: '#111111', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([circle, label]);
    container.setDepth(standing.isPlayer ? 100 : standing.isTeammate ? 90 : 50 - standing.position);
    return { container, circle, label };
  }

  private iconRadius(standing: GridStanding): number {
    if (standing.isPlayer) return 14;
    if (standing.isTeammate) return 11;
    if (standing.position <= 3) return 10;
    return 7;
  }

  private iconColor(standing: GridStanding): number {
    if (standing.isPlayer) return TEAM_COLORS.player;
    if (standing.isTeammate) return 0x33ddff;
    return TEAM_COLORS[standing.teamId] ?? 0xffffff;
  }

  /** Recalcula a posição de todos os ícones a partir do evento atual + gaps do grid. */
  private updateIconPositions(animate: boolean): void {
    const standings = this.currentStandings();
    const s = this.raceState;
    const referenceEvent = s.finished ? s.events[s.events.length - 1] : currentEvent(s);
    const refT = pathIndexToT(pathIndexForEvent(referenceEvent), track.path.length);

    for (const standing of standings) {
      let entry = this.icons.get(standing.id);
      if (!entry) {
        entry = this.createIcon(standing);
        this.icons.set(standing.id, entry);
      }
      // tamanho/cor podem mudar conforme a posição evolui (pódio, etc.)
      entry.circle.setRadius(this.iconRadius(standing));
      entry.circle.setFillStyle(this.iconColor(standing));
      entry.label.setText(String(standing.position));

      const clampedGap = Math.min(standing.gapToLeader, MAX_VISUAL_GAP_SECONDS);
      const t = refT - clampedGap / SECONDS_PER_LAP_VISUAL;
      const point = pointAtT(track.path, t);
      const screen = normalizedToScreen(point, TRACK_RECT);

      if (animate) {
        this.tweens.add({
          targets: entry.container, x: screen.x, y: screen.y,
          duration: TWEEN_DURATION_MS, ease: 'Sine.easeInOut',
        });
      } else {
        entry.container.setPosition(screen.x, screen.y);
      }
    }
    this.updateHud();
  }

  private updateHud(): void {
    const s = this.raceState;
    const standings = this.currentStandings();
    const playerStanding = standings.find((x) => x.isPlayer)!;
    const ev = s.finished ? undefined : currentEvent(s);
    const eventLabel = !ev ? 'Corrida encerrada' : ev.kind === 'pit' ? 'Pit stop' : `${ev.cornerName ?? ''} (${ev.kind})`;
    const lines = [
      `Posição: ${playerStanding.position}/12   Volta: ${s.lap}/${track.laps}`,
      `Saúde: ${s.health}/${s.healthMax}   Nitro: ${s.nitro}`,
      `Gap: ${formatGap(s.gapToAhead)}   ${eventLabel}`,
    ];
    this.hudText.setText(lines.join('\n'));
  }

  // ---------- painel inferior (decisões) ----------

  private clearPanel(): void {
    this.panel.removeAll(true);
  }

  private makeButton(
    x: number, y: number, w: number, h: number, label: string, color: number, onClick: () => void
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, color, 1).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const text = this.add.text(w / 2, h / 2, label, { fontSize: '13px', color: '#111111', fontStyle: 'bold' })
      .setOrigin(0.5);
    bg.on('pointerdown', onClick);
    c.add([bg, text]);
    return c;
  }

  // ---------- ciclo principal do evento ----------

  private startEventCycle(): void {
    this.clearPanel();
    this.updateHud();

    if (this.raceState.dnf) {
      this.showDnfOverlay();
      return;
    }
    if (this.raceState.finished) {
      this.showSummary();
      return;
    }

    const ev = currentEvent(this.raceState);
    this.pendingNitro = false;
    this.pendingOvertake = false;

    if (ev.boostEligible) {
      this.showBoostChoice(ev);
      return;
    }
    this.showPreChallenge(ev);
  }

  private showBoostChoice(ev: RaceEvent): void {
    this.clearPanel();
    this.panel.add(this.add.text(16, 12, 'Boost da volta — escolha 1:', { fontSize: '14px', color: '#fff' }));
    const options: BoostId[] = ['pneu', 'freio', 'janela'].sort(() => Math.random() - 0.5) as BoostId[];
    options.forEach((id, i) => {
      const btn = this.makeButton(16, 44 + i * 48, CANVAS_WIDTH - 32, 40, BOOST_LABELS[id], 0xffd54f, () => {
        applyBoost(this.raceState, id);
        this.showPreChallenge(ev);
      });
      this.panel.add(btn);
    });
  }

  private showPreChallenge(ev: RaceEvent): void {
    this.clearPanel();
    const isSaida = ev.kind === 'saida';
    const isPit = ev.kind === 'pit';
    const canOvertake = !isSaida && !isPit && canAttemptOvertake(this.raceState.gapToAhead);
    const hasNitro = this.raceState.nitro > 0;

    if (!canOvertake && !hasNitro) {
      this.startTimingChallenge(ev);
      return;
    }

    this.pendingNitro = false;
    this.pendingOvertake = false;
    let y = 12;
    this.panel.add(this.add.text(16, y, `${ev.cornerName ?? 'Largada'} — antes de encarar:`, { fontSize: '14px', color: '#fff' }));
    y += 36;

    let nitroBtn: Phaser.GameObjects.Container | undefined;
    if (hasNitro) {
      nitroBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 40, `Nitro: NÃO (${this.raceState.nitro} disponíveis)`, 0x64b5f6, () => {
        this.pendingNitro = !this.pendingNitro;
        nitroBtn!.getAt<Phaser.GameObjects.Text>(1).setText(`Nitro: ${this.pendingNitro ? 'SIM' : 'NÃO'} (${this.raceState.nitro} disponíveis)`);
      });
      this.panel.add(nitroBtn);
      y += 48;
    }

    let overtakeBtn: Phaser.GameObjects.Container | undefined;
    if (canOvertake) {
      overtakeBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 40, 'Tentar ultrapassagem: NÃO', 0xff8a65, () => {
        this.pendingOvertake = !this.pendingOvertake;
        overtakeBtn!.getAt<Phaser.GameObjects.Text>(1).setText(`Tentar ultrapassagem: ${this.pendingOvertake ? 'SIM' : 'NÃO'}`);
      });
      this.panel.add(overtakeBtn);
      y += 48;
    }

    const confirmBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 40, 'Confirmar', 0x81c784, () => {
      if (this.pendingOvertake) setOvertakeAttempt(this.raceState, true);
      this.startTimingChallenge(ev);
    });
    this.panel.add(confirmBtn);
  }

  private startTimingChallenge(ev: RaceEvent): void {
    this.clearPanel();
    const isSaida = ev.kind === 'saida';
    const isPit = ev.kind === 'pit';
    const scale = computeScale({
      base: this.raceState.zoneScaleBase,
      isPit, isSaida,
      overtakeAttempt: this.raceState.overtakeAttempt,
      gap: this.raceState.gapToAhead,
      pendingBoostIsPneu: this.raceState.pendingBoost === 'pneu',
      pitCrewQuality: DEFAULT_PIT_CREW_QUALITY,
    });
    this.challengeHalves = zoneHalves(scale);

    this.panel.add(this.add.text(16, 8, `${isPit ? 'Pit stop' : ev.cornerName ?? 'Largada'} — toque no momento certo!`, { fontSize: '13px', color: '#fff' }));

    // barra de fundo com as zonas coloridas (vermelho -> amber -> verde -> roxo -> verde -> amber -> vermelho)
    const barX = 16, barY = 48, barW = CANVAS_WIDTH - 32, barH = 28;
    const bar = this.add.graphics();
    const zones: [Tier, number][] = [
      ['red', 50], ['amber', this.challengeHalves.amber], ['green', this.challengeHalves.green], ['purple', this.challengeHalves.purple],
    ];
    let prevHalf = 50;
    for (const [tier, half] of zones) {
      const w = ((prevHalf) / 50) * barW;
      bar.fillStyle(TIER_COLORS[tier], 1);
      bar.fillRect(barX + barW / 2 - w / 2, barY, w, barH);
      prevHalf = half;
    }
    this.panel.add(bar);

    const goBtn = this.makeButton(16, barY + barH + 20, barW, 56, 'TOCAR', 0xffffff, () => this.handleTap());
    this.panel.add(goBtn);

    this.cursorGraphics = this.add.graphics();
    this.panel.add(this.cursorGraphics);
    this.challengeActive = true;
    this.challengeStartTime = this.time.now;
    this.challengeTimer = this.time.delayedCall(CHALLENGE_TIME_LIMIT_MS, () => {
      if (this.challengeActive) this.resolveChallenge('miss');
    });
  }

  private drawCursor(time: number): void {
    const elapsed = time - this.challengeStartTime;
    const pos = triangleWave(elapsed, CURSOR_SWEEP_PERIOD_MS);
    const barX = 16, barY = 48, barW = CANVAS_WIDTH - 32, barH = 28;
    const x = barX + (pos / 100) * barW;
    this.cursorGraphics.clear();
    this.cursorGraphics.fillStyle(0xffffff, 1);
    this.cursorGraphics.fillRect(x - 2, barY - 4, 4, barH + 8);
  }

  private handleTap(): void {
    if (!this.challengeActive) return;
    const pos = triangleWave(this.time.now - this.challengeStartTime, CURSOR_SWEEP_PERIOD_MS);
    const tier = tierFromPosition(pos, this.challengeHalves);
    this.resolveChallenge(tier);
  }

  private resolveChallenge(tier: Tier): void {
    if (!this.challengeActive) return;
    this.challengeActive = false;
    this.challengeTimer?.remove();
    this.cursorGraphics.clear();

    const nitroUsed = this.pendingNitro ? tryUseNitro(this.raceState) : false;
    const result = resolveCurrent(this.raceState, tier, { nitroUsed });
    this.playerCumulativeTime -= result.gainSeconds;

    this.clearPanel();
    const msg = result.positionChanged === 'gained' ? ' — ultrapassou!' : result.positionChanged === 'lost' ? ' — foi ultrapassado!' : '';
    this.panel.add(this.add.text(16, 60, `${tier.toUpperCase()} — ${result.message}${msg}`, {
      fontSize: '18px', color: '#fff', fontStyle: 'bold',
    }));

    this.time.delayedCall(700, () => this.advanceAndAnimate());
  }

  private advanceAndAnimate(): void {
    advance(this.raceState);
    advanceGrid(this.gridState);
    this.updateIconPositions(true);
    this.time.delayedCall(TWEEN_DURATION_MS, () => this.startEventCycle());
  }

  // ---------- DNF / resumo ----------

  private showDnfOverlay(): void {
    this.clearPanel();
    this.panel.add(this.add.text(16, 12, `DNF — ${this.raceState.dnfReason ?? 'motivo desconhecido'}`, {
      fontSize: '16px', color: '#ff6666', fontStyle: 'bold',
    }));
    let y = 56;
    if (!this.raceState.usedRevive) {
      const reviveBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 44, 'Voltar à corrida (revive)', 0x81c784, () => {
        revive(this.raceState);
        this.startEventCycle();
      });
      this.panel.add(reviveBtn);
      y += 56;
    }
    const endBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 44, 'Encerrar corrida', 0xe57373, () => {
      this.showSummary();
    });
    this.panel.add(endBtn);
  }

  private showSummary(): void {
    this.clearPanel();
    const standings = this.currentStandings();
    const playerStanding = standings.find((x) => x.isPlayer)!;
    const output = toRaceOutput(this.raceState);
    const lines = [
      'Corrida finalizada',
      `Posição: ${playerStanding.position}/12`,
      `Voltas completadas: ${output.lapsCompleted}/${track.laps}`,
      output.dnf ? `DNF (${output.dnfReason})` : 'Chegou à bandeira quadriculada',
      output.reviveUsed ? 'Revive usado nesta corrida' : '',
    ].filter(Boolean);
    this.panel.add(this.add.text(16, 12, lines.join('\n'), { fontSize: '15px', color: '#fff', lineSpacing: 8 }));

    if (!this.raceEnded) {
      this.raceEnded = true;
      trackEvent('race_end', {
        trackId: track.id,
        position: playerStanding.position,
        durationSec: Math.round((Date.now() - this.raceStartTime) / 1000),
        lapsCompleted: output.lapsCompleted,
        dnf: output.dnf,
        reviveUsed: output.reviveUsed,
      });
    }
  }
}
