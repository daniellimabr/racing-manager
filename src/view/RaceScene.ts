import Phaser from 'phaser';
import spaTrack from '../../tracks/spa.json';
import type { TrackDef, RaceState, RaceEvent, Tier, BoostId, CarSetup } from '../core/types.js';
import {
  createRace, currentEvent, resolveCurrent, advance, revive, toRaceOutput,
  setOvertakeAttempt, applyBoost, tryUseNitro,
} from '../core/raceState.js';
import { tierFromPosition, zoneHalves, computeScale, canAttemptOvertake, combineTiers } from '../core/timing.js';
import { createGridSim, advanceGrid, deriveStandings } from '../core/grid.js';
import type { GridState, GridStanding } from '../core/grid.js';
import { normalizedToScreen, pathIndexToT, pointAtT } from './pathUtils.js';
import {
  TRACK_RECT, CANVAS_WIDTH, CANVAS_HEIGHT, HUD_HEIGHT, PANEL_HEIGHT,
  CURSOR_SWEEP_PERIOD_MS, CHALLENGE_TIME_LIMIT_MS, TWEEN_DURATION_MS,
  SECONDS_PER_LAP_VISUAL, MAX_VISUAL_GAP_SECONDS, TIER_COLORS, BOOST_LABELS, TEAM_COLORS,
  DEFAULT_CAR_SETUP, DEFAULT_PIT_CREW_QUALITY,
  RAMP_DURATION_MS, ACCEL_CENTER, BRAKE_CENTER, JANELA_DURATION_SCALE,
  LARGADA_PREP_MS, LARGADA_LIGHT_INTERVAL_MS, LARGADA_HOLD_MIN_MS, LARGADA_HOLD_MAX_MS,
  LARGADA_HOLD_RATE, LARGADA_FALL_RATE,
} from './viewConstants.js';
import { track as trackEvent } from '../telemetry/analytics.js';
import { juice } from './juice.js';

const track = spaTrack as unknown as TrackDef;
const PANEL_Y = CANVAS_HEIGHT - PANEL_HEIGHT;

function pathIndexForEvent(ev: RaceEvent): number {
  if (ev.kind === 'pit') return track.pitPathIndex;
  if (ev.cornerId) {
    const corner = track.corners.find((c) => c.id === ev.cornerId);
    // frenagem = ponto de entrada da curva; saída = meio caminho até o próximo
    // ponto do traçado (representa a saída/ápice) — sem isso as duas fases da
    // mesma curva caem no mesmo pathIndex e o tween entre elas não move nada
    // (feedback do PO: carros "não se moviam" entre frenagem e aceleração).
    if (corner) return ev.kind === 'saida' ? corner.pathIndex + 0.5 : corner.pathIndex;
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
  private icons = new Map<string, IconEntry>();
  private panel!: Phaser.GameObjects.Container;

  // HUD (mockup A — texto refinado, ver design/hud-mockups/hud-a-texto-refinado.html)
  private hudPositionText!: Phaser.GameObjects.Text;
  private hudLapLabelText!: Phaser.GameObjects.Text;
  private hudLapValueText!: Phaser.GameObjects.Text;
  private hudGapText!: Phaser.GameObjects.Text;
  private hudGapTrendText!: Phaser.GameObjects.Text;
  private hudHealthBarBg!: Phaser.GameObjects.Rectangle;
  private hudHealthBarFill!: Phaser.GameObjects.Rectangle;
  private hudHealthLabelText!: Phaser.GameObjects.Text;
  private hudNitroGraphics!: Phaser.GameObjects.Graphics;
  private hudEventText!: Phaser.GameObjects.Text;
  private hudLastGap: number | null = null;

  // painel lateral esquerdo: gap ao líder de todos os 12 pilotos, em tempo real
  // (feedback do PO: ajuda a validar a simulação de corrida durante o jogo)
  private hudLeaderboardTexts: Phaser.GameObjects.Text[] = [];

  private challengeActive = false;
  private challengeStartTime = 0;
  private challengeHalves = { purple: 8, green: 20, amber: 35 };
  private cursorGraphics!: Phaser.GameObjects.Graphics;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private pendingNitro = false;
  private pendingOvertake = false;
  private raceStartTime = 0;
  private raceEnded = false;

  // T-105: modelo de input varia por tipo de desafio (ver Claude-Racing.md §2.10/§2.13)
  private challengeMode: 'sweep' | 'ramp' | 'hold' = 'sweep';
  private challengeCenter = BRAKE_CENTER;
  private challengeDurationMs = RAMP_DURATION_MS;

  // frenagem: 2 sub-desafios (ponto + duração), combinados no final
  private frenagemStage: 1 | 2 = 1;
  private frenagemStage1Tier: Tier | null = null;

  // largada: segurar para controlar a agulha até o sinal (não mais reação única)
  private largadaPos = 0;
  private largadaHolding = false;
  private largadaGoAt = 0;
  private largadaLightsDoneAt = 0;
  private largadaResolved = false;
  private largadaStatusText?: Phaser.GameObjects.Text;
  private largadaLightsGfx?: Phaser.GameObjects.Graphics;
  private lastFrameTime = 0;

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

    this.buildHud();

    this.trackGraphics = this.add.graphics();
    this.drawTrack();

    for (const standing of this.currentStandings()) {
      this.icons.set(standing.id, this.createIcon(standing));
    }

    this.add.rectangle(0, PANEL_Y, CANVAS_WIDTH, PANEL_HEIGHT, 0x1a1a1a).setOrigin(0, 0);
    this.panel = this.add.container(0, PANEL_Y);

    this.input.once('pointerdown', () => juice.unlock());

    this.updateIconPositions(false);
    this.showCountdown(() => this.startEventCycle());
  }

  /** Contagem 3-2-1 + "Já!" antes da largada (T-106 — juice). */
  private showCountdown(onComplete: () => void): void {
    const text = this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, '3', {
      fontSize: '96px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(1000);
    juice.unlock();
    juice.countdownBeep();
    let count = 3;
    const tick = () => {
      count--;
      if (count > 0) {
        text.setText(String(count));
        juice.countdownBeep();
        this.time.delayedCall(650, tick);
      } else {
        text.setText('JÁ!');
        juice.go();
        this.cameras.main.flash(150, 255, 255, 255);
        this.time.delayedCall(450, () => {
          text.destroy();
          onComplete();
        });
      }
    };
    this.time.delayedCall(650, tick);
  }

  update(time: number): void {
    const dt = this.lastFrameTime ? time - this.lastFrameTime : 0;
    this.lastFrameTime = time;
    if (this.challengeMode === 'hold') {
      if (this.challengeActive) this.updateLargada(time, dt);
    } else if (this.challengeActive) {
      this.drawCursor();
    }
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

  /** Monta os elementos estáticos do HUD (mockup A) uma única vez; updateHud() só atualiza valores. */
  private buildHud(): void {
    this.add.rectangle(0, 0, CANVAS_WIDTH, HUD_HEIGHT, 0x202225).setOrigin(0, 0);
    this.add.rectangle(0, HUD_HEIGHT - 1, CANVAS_WIDTH, 1, 0x000000).setOrigin(0, 0);

    this.hudPositionText = this.add.text(16, 8, '', {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    });

    this.hudLapLabelText = this.add.text(76, 8, 'VOLTA', { fontSize: '10px', color: '#999999' });
    this.hudLapValueText = this.add.text(76, 20, '', { fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });

    this.hudGapText = this.add.text(CANVAS_WIDTH - 16, 6, '', {
      fontSize: '20px', color: '#e74c3c', fontStyle: 'bold',
    }).setOrigin(1, 0);
    this.hudGapTrendText = this.add.text(CANVAS_WIDTH - 16, 28, '', {
      fontSize: '10px', color: '#8899aa',
    }).setOrigin(1, 0);

    const barX = 16, barY = 46, barW = 260, barH = 14;
    this.hudHealthBarBg = this.add.rectangle(barX, barY, barW, barH, 0x333333).setOrigin(0, 0).setStrokeStyle(1, 0x555555);
    this.hudHealthBarFill = this.add.rectangle(barX, barY, barW, barH, 0x2ecc71).setOrigin(0, 0);
    this.hudHealthLabelText = this.add.text(barX + 4, barY + 2, '', { fontSize: '10px', color: '#ffffff' });

    this.hudNitroGraphics = this.add.graphics();

    this.hudEventText = this.add.text(CANVAS_WIDTH - 16, 64, '', {
      fontSize: '10px', color: '#8899aa',
    }).setOrigin(1, 0);

    this.buildLeaderboardPanel();
  }

  /** Painel lateral esquerdo com o gap ao líder de todos os 12 pilotos (não só o carro da frente). */
  private buildLeaderboardPanel(): void {
    const rowH = 14, padding = 4, gridSize = 12;
    const panelW = 112, panelH = rowH * gridSize + padding * 2;
    this.add.rectangle(0, HUD_HEIGHT, panelW, panelH, 0x000000, 0.5).setOrigin(0, 0);
    for (let i = 0; i < gridSize; i++) {
      const t = this.add.text(4, HUD_HEIGHT + padding + i * rowH, '', {
        fontSize: '10px', color: '#cccccc', fontFamily: 'monospace',
      });
      this.hudLeaderboardTexts.push(t);
    }
  }

  private updateLeaderboardPanel(standings: GridStanding[]): void {
    standings.forEach((s, i) => {
      const t = this.hudLeaderboardTexts[i];
      if (!t) return;
      const gapStr = s.position === 1 ? 'Líder' : `+${s.gapToLeader.toFixed(3).replace('.', ',')}s`;
      t.setText(`P${String(s.position).padStart(2, ' ')} ${gapStr}`);
      t.setColor(s.isPlayer ? '#ffdd33' : s.isTeammate ? '#33ddff' : '#cccccc');
    });
  }

  private updateHud(): void {
    const s = this.raceState;
    const standings = this.currentStandings();
    const playerStanding = standings.find((x) => x.isPlayer)!;
    const ev = s.finished ? undefined : currentEvent(s);
    const eventLabel = !ev ? 'Corrida encerrada' : ev.kind === 'pit' ? 'Pit stop' : `${ev.cornerName ?? ''} (${ev.kind})`;
    const gap = this.displayGap(standings, playerStanding);

    this.hudPositionText.setText(`P${playerStanding.position}`);
    this.hudLapValueText.setText(`${s.lap}/${track.laps}`);

    this.hudGapText.setText(formatGap(gap)).setColor(gap > 0 ? '#e74c3c' : '#2ecc71');
    if (this.hudLastGap !== null && gap !== this.hudLastGap) {
      this.hudGapTrendText.setText(gap < this.hudLastGap ? '▼ diminuindo' : '▲ aumentando');
    }
    this.hudLastGap = gap;

    const hpPct = s.healthMax > 0 ? Math.max(0, s.health / s.healthMax) : 0;
    this.hudHealthBarFill.width = 260 * hpPct;
    this.hudHealthBarFill.setFillStyle(hpPct > 0.5 ? 0x2ecc71 : hpPct > 0.25 ? 0xf1c40f : 0xe74c3c);
    this.hudHealthLabelText.setText(`SAÚDE ${s.health}/${s.healthMax}`);

    this.drawHudNitro(s.nitro, this.carSetup.nitroCharges);

    this.hudEventText.setText(eventLabel);

    this.updateLeaderboardPanel(standings);
  }

  private drawHudNitro(charges: number, total: number): void {
    const g = this.hudNitroGraphics;
    g.clear();
    const startX = 290, y = 53, spacing = 20, r = 7;
    for (let i = 0; i < total; i++) {
      const x = startX + i * spacing;
      g.fillStyle(i < charges ? 0x64b5f6 : 0x333333, 1);
      g.lineStyle(1, 0x556677, 1);
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r, y);
      g.lineTo(x, y + r);
      g.lineTo(x - r, y);
      g.closePath();
      g.fillPath();
      g.strokePath();
    }
  }

  /**
   * Gap exibido no HUD — sempre relativo ao carro imediatamente à frente na
   * classificação do grid (não ao líder; feedback do PO). Derivado 100% do
   * grid (`gapToLeader` de cada standing), a mesma fonte do painel lateral —
   * evita a divergência com o `raceState.gapToAhead` do core (modelo 1D
   * separado, ver Claude-Racing.md §3). Líder não tem "carro da frente":
   * mostra a distância (negativa) até o 2º colocado, ou seja, sua vantagem.
   */
  private displayGap(standings: GridStanding[], playerStanding: GridStanding): number {
    if (playerStanding.position === 1) {
      const second = standings.find((x) => x.position === 2);
      return second ? -second.gapToLeader : 0;
    }
    const ahead = standings.find((x) => x.position === playerStanding.position - 1);
    return ahead ? playerStanding.gapToLeader - ahead.gapToLeader : this.raceState.gapToAhead;
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
    bg.on('pointerdown', () => {
      juice.click();
      onClick();
    });
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
    const allBoosts: BoostId[] = ['pneu', 'freio', 'janela', 'reparo_rapido', 'nitro_extra', 'recuperacao_erro'];
    const options: BoostId[] = allBoosts.sort(() => Math.random() - 0.5).slice(0, 3);
    options.forEach((id, i) => {
      const btn = this.makeButton(16, 44 + i * 48, CANVAS_WIDTH - 32, 40, BOOST_LABELS[id], 0xffd54f, () => {
        trackEvent('boost_chosen', { trackId: track.id, lap: this.raceState.lap, options, chosen: id });
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
    // `raceState.position` (core, modelo 1D) pode divergir do grid (12 carros
    // de verdade, ver Claude-Racing.md §3) — sem esse guard, o jogador já
    // líder no grid podia receber a oferta de ultrapassagem (bug reportado
    // pelo PO em playtest: gap negativo grande, mas ainda "líder" pro core).
    const isGridLeader = this.currentStandings().find((x) => x.isPlayer)?.position === 1;
    const canOvertake = !isSaida && !isPit && !isGridLeader && canAttemptOvertake(this.raceState.gapToAhead);
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

    let overtakeBtn: Phaser.GameObjects.Container | undefined;
    if (canOvertake) {
      overtakeBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 40, 'Tentar ultrapassagem: NÃO', 0xff8a65, () => {
        this.pendingOvertake = !this.pendingOvertake;
        overtakeBtn!.getAt<Phaser.GameObjects.Text>(1).setText(`Tentar ultrapassagem: ${this.pendingOvertake ? 'SIM' : 'NÃO'}`);
      });
      this.panel.add(overtakeBtn);
      y += 48;
    }

    if (hasNitro) {
      // Feedback do PO: o toggle+confirmar do nitro não estava claro — agora são
      // 2 botões diretos (Sim/Não), cada um já define a opção e avança pro desafio.
      const nitroWord = this.raceState.nitro === 1 ? 'disponível' : 'disponíveis';
      this.panel.add(this.add.text(16, y, `Usar nitro? (${this.raceState.nitro} ${nitroWord})`, {
        fontSize: '13px', color: '#ccc',
      }));
      y += 22;
      const gap = 8;
      const halfW = (CANVAS_WIDTH - 32 - gap) / 2;
      const goWithNitro = (useNitro: boolean) => {
        this.pendingNitro = useNitro;
        if (this.pendingOvertake) setOvertakeAttempt(this.raceState, true);
        this.startTimingChallenge(ev);
      };
      this.panel.add(this.makeButton(16, y, halfW, 44, 'Nitro: SIM', 0x64b5f6, () => goWithNitro(true)));
      this.panel.add(this.makeButton(16 + halfW + gap, y, halfW, 44, 'Nitro: NÃO', 0x455a64, () => goWithNitro(false)));
      return;
    }

    const confirmBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 40, 'Confirmar', 0x81c784, () => {
      if (this.pendingOvertake) setOvertakeAttempt(this.raceState, true);
      this.startTimingChallenge(ev);
    });
    this.panel.add(confirmBtn);
  }

  private startTimingChallenge(ev: RaceEvent): void {
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

    const isLargada = isSaida && ev.cornerName === 'Largada';
    if (isLargada) {
      this.startLargadaChallenge();
      return;
    }
    if (ev.kind === 'frenagem') {
      this.frenagemStage = 1;
      this.frenagemStage1Tier = null;
      this.challengeCenter = BRAKE_CENTER;
      this.startRampChallenge(`${ev.cornerName ?? ''} — ponto de frenagem (1/2)`);
      return;
    }
    if (isSaida) {
      this.challengeCenter = ACCEL_CENTER;
      this.startRampChallenge(`${ev.cornerName ?? ''} — aceleração, toque perto do limite de grip!`);
      return;
    }
    this.challengeCenter = BRAKE_CENTER;
    this.startSweepChallenge();
  }

  /** Pit: mantém o vaivém contínuo original (fora do escopo da revisão CSR2 do T-105). */
  private startSweepChallenge(): void {
    this.clearPanel();
    this.challengeMode = 'sweep';
    this.renderChallengeBarAndButton('Pit stop — toque no momento certo!');
    this.challengeActive = true;
    this.challengeStartTime = this.time.now;
    const timeLimit = this.raceState.pendingBoost === 'janela' ? CHALLENGE_TIME_LIMIT_MS * JANELA_DURATION_SCALE : CHALLENGE_TIME_LIMIT_MS;
    this.challengeTimer = this.time.delayedCall(timeLimit, () => this.onChallengeTapResolved('miss'));
  }

  /** Frenagem e aceleração (T-105): uma única passagem 0->100, sem vaivém contínuo. */
  private startRampChallenge(label: string): void {
    this.clearPanel();
    this.challengeMode = 'ramp';
    // "janela ampliada" (boost) só se aplica à frenagem/pit, mesma convenção de pneu/freio (não afeta a aceleração da saída que a ofereceu).
    const ev = currentEvent(this.raceState);
    const janelaActive = ev.kind !== 'saida' && this.raceState.pendingBoost === 'janela';
    this.challengeDurationMs = janelaActive ? RAMP_DURATION_MS * JANELA_DURATION_SCALE : RAMP_DURATION_MS;
    this.renderChallengeBarAndButton(label);
    this.challengeActive = true;
    this.challengeStartTime = this.time.now;
    this.challengeTimer = this.time.delayedCall(this.challengeDurationMs, () => this.onChallengeTapResolved('miss'));
  }

  private renderChallengeBarAndButton(label: string): void {
    this.panel.add(this.add.text(16, 8, `${label}`, { fontSize: '13px', color: '#fff' }));
    const barX = 16, barY = 48, barW = CANVAS_WIDTH - 32, barH = 28;
    const bar = this.add.graphics();
    this.drawZoneBarGraphics(bar, barX, barY, barW, barH, this.challengeCenter);
    this.panel.add(bar);
    this.panel.add(this.makeButton(16, barY + barH + 20, barW, 56, 'TOCAR', 0xffffff, () => this.handleTap()));
    this.cursorGraphics = this.add.graphics();
    this.panel.add(this.cursorGraphics);
  }

  /** Desenha as zonas aninhadas (vermelho->amber->verde->roxo) em torno de um centro qualquer (não só 50 — ver aceleração). */
  private drawZoneBarGraphics(
    g: Phaser.GameObjects.Graphics, barX: number, barY: number, barW: number, barH: number, center: number
  ): void {
    const bands: [Tier, number, number][] = [
      ['red', 0, 100],
      ['amber', center - this.challengeHalves.amber, center + this.challengeHalves.amber],
      ['green', center - this.challengeHalves.green, center + this.challengeHalves.green],
      ['purple', center - this.challengeHalves.purple, center + this.challengeHalves.purple],
    ];
    for (const [tier, from, to] of bands) {
      const f = Math.max(0, from);
      const t = Math.min(100, to);
      if (t <= f) continue;
      g.fillStyle(TIER_COLORS[tier], 1);
      g.fillRect(barX + (f / 100) * barW, barY, ((t - f) / 100) * barW, barH);
    }
  }

  // ---------- largada: segurar para controlar a agulha (T-105) ----------

  private startLargadaChallenge(): void {
    this.clearPanel();
    this.challengeMode = 'hold';
    this.challengeCenter = BRAKE_CENTER;
    this.largadaPos = 0;
    this.largadaHolding = false;
    this.largadaResolved = false;

    const now = this.time.now;
    this.challengeStartTime = now;
    this.largadaLightsDoneAt = now + LARGADA_PREP_MS + LARGADA_LIGHT_INTERVAL_MS * 3;
    const hold = LARGADA_HOLD_MIN_MS + Math.random() * (LARGADA_HOLD_MAX_MS - LARGADA_HOLD_MIN_MS);
    this.largadaGoAt = this.largadaLightsDoneAt + hold;

    this.panel.add(this.add.text(16, 8, 'Largada — segure para controlar a rotação!', { fontSize: '13px', color: '#fff' }));
    this.largadaStatusText = this.add.text(CANVAS_WIDTH / 2, 30, 'PREPARE-SE', { fontSize: '13px', color: '#889988' }).setOrigin(0.5);
    this.panel.add(this.largadaStatusText);
    this.largadaLightsGfx = this.add.graphics();
    this.panel.add(this.largadaLightsGfx);

    const barX = 16, barY = 96, barW = CANVAS_WIDTH - 32, barH = 28;
    const bar = this.add.graphics();
    this.drawZoneBarGraphics(bar, barX, barY, barW, barH, BRAKE_CENTER);
    this.panel.add(bar);
    this.cursorGraphics = this.add.graphics();
    this.panel.add(this.cursorGraphics);

    const holdBtn = this.add.container(16, barY + barH + 20);
    const bg = this.add.rectangle(0, 0, barW, 56, 0xffffff, 1).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const text = this.add.text(barW / 2, 28, 'SEGURE', { fontSize: '13px', color: '#111111', fontStyle: 'bold' }).setOrigin(0.5);
    bg.on('pointerdown', () => { juice.click(); this.largadaHolding = true; });
    bg.on('pointerup', () => { this.largadaHolding = false; });
    bg.on('pointerout', () => { this.largadaHolding = false; });
    holdBtn.add([bg, text]);
    this.panel.add(holdBtn);

    this.challengeActive = true;
  }

  private updateLargada(time: number, dt: number): void {
    const rate = this.largadaHolding ? LARGADA_HOLD_RATE : -LARGADA_FALL_RATE;
    this.largadaPos = Math.max(0, Math.min(100, this.largadaPos + rate * dt));

    const prepEnd = this.challengeStartTime + LARGADA_PREP_MS;
    let label: string; let color: string;
    if (time < prepEnd) { label = 'PREPARE-SE (ainda não conta)'; color = '#889988'; }
    else if (time < this.largadaLightsDoneAt) { label = 'Mantenha a agulha na zona roxa...'; color = '#889988'; }
    else if (time < this.largadaGoAt) { label = 'AGUARDE...'; color = '#e74c3c'; }
    else { label = 'VAI!!'; color = '#2ecc71'; }
    this.largadaStatusText?.setText(label).setColor(color);

    this.largadaLightsGfx?.clear();
    for (let i = 0; i < 3; i++) {
      const onAt = prepEnd + i * LARGADA_LIGHT_INTERVAL_MS;
      const isOn = time >= onAt && time < this.largadaGoAt;
      this.largadaLightsGfx?.fillStyle(isOn ? 0xe74c3c : 0x332222, 1);
      this.largadaLightsGfx?.fillCircle(180 + i * 40, 60, 10);
    }

    const barX = 16, barY = 96, barW = CANVAS_WIDTH - 32, barH = 28;
    const x = barX + (this.largadaPos / 100) * barW;
    this.cursorGraphics.clear();
    this.cursorGraphics.fillStyle(0xffffff, 1);
    this.cursorGraphics.fillRect(x - 2, barY - 4, 4, barH + 8);

    if (!this.largadaResolved && time >= this.largadaGoAt) {
      this.largadaResolved = true;
      const tier = tierFromPosition(this.largadaPos, this.challengeHalves, BRAKE_CENTER);
      this.onChallengeTapResolved(tier);
    }
  }

  // ---------- resolução (comum a sweep/ramp/hold) ----------

  private currentCursorPos(): number {
    const elapsed = this.time.now - this.challengeStartTime;
    if (this.challengeMode === 'sweep') return triangleWave(elapsed, CURSOR_SWEEP_PERIOD_MS);
    return Math.min(100, (elapsed / this.challengeDurationMs) * 100);
  }

  private drawCursor(): void {
    const pos = this.currentCursorPos();
    const barX = 16, barY = 48, barW = CANVAS_WIDTH - 32, barH = 28;
    const x = barX + (pos / 100) * barW;
    this.cursorGraphics.clear();
    this.cursorGraphics.fillStyle(0xffffff, 1);
    this.cursorGraphics.fillRect(x - 2, barY - 4, 4, barH + 8);
  }

  private handleTap(): void {
    if (!this.challengeActive) return;
    const pos = this.currentCursorPos();
    const tier = tierFromPosition(pos, this.challengeHalves, this.challengeCenter);
    this.onChallengeTapResolved(tier);
  }

  /**
   * Ponto único de resolução de um toque/timeout, seja de sweep/ramp/hold.
   * Trata o caso especial da frenagem em 2 etapas: a 1ª etapa não chama o
   * core (resolveChallenge) — só guarda o tier e inicia a 2ª etapa.
   */
  private onChallengeTapResolved(tier: Tier): void {
    if (!this.challengeActive) return;
    this.challengeActive = false;
    this.challengeTimer?.remove();
    this.cursorGraphics?.clear();

    const ev = currentEvent(this.raceState);
    if (ev.kind === 'frenagem' && this.frenagemStage === 1) {
      this.advanceFrenagemStage(tier);
      return;
    }
    const finalTier = (ev.kind === 'frenagem' && this.frenagemStage === 2 && this.frenagemStage1Tier)
      ? combineTiers(this.frenagemStage1Tier, tier)
      : tier;
    this.resolveChallenge(finalTier);
  }

  /** Frenagem, etapa 1 (ponto de frenagem) resolvida — mostra o resultado parcial e inicia a etapa 2 (duração). */
  private advanceFrenagemStage(tier: Tier): void {
    this.frenagemStage1Tier = tier;
    this.frenagemStage = 2;
    this.clearPanel();
    this.panel.add(this.add.text(16, 60, `Etapa 1/2 — ${tier.toUpperCase()}. Agora a duração da frenagem...`, {
      fontSize: '16px', color: '#fff', fontStyle: 'bold',
    }));
    this.time.delayedCall(500, () => {
      const ev = currentEvent(this.raceState);
      this.startRampChallenge(`${ev.cornerName ?? ''} — duração da frenagem (2/2)`);
    });
  }

  private resolveChallenge(tier: Tier): void {
    const ev = currentEvent(this.raceState);
    const challengeId = ev.cornerId ?? (ev.kind === 'pit' ? 'pit' : 'largada');
    const gapBefore = this.raceState.gapToAhead;
    const overtakeAttempt = this.raceState.overtakeAttempt;
    const wasDnf = this.raceState.dnf;
    // frenagem em 2 etapas: `tier` aqui já é o combinado (combineTiers) — guarda a etapa 1 separada pra telemetria
    const stage1Tier = ev.kind === 'frenagem' ? this.frenagemStage1Tier ?? undefined : undefined;

    const nitroUsed = this.pendingNitro ? tryUseNitro(this.raceState) : false;
    const result = resolveCurrent(this.raceState, tier, { nitroUsed });
    this.playerCumulativeTime -= result.gainSeconds;

    trackEvent('challenge_result', {
      trackId: track.id, challengeId, kind: ev.kind, tier, nitroUsed, overtakeAttempt,
      gapBefore, gapAfter: this.raceState.gapToAhead, healthAfter: this.raceState.health,
      ...(stage1Tier ? { stage1Tier } : {}),
    });

    if (result.positionChanged) {
      trackEvent('overtake', {
        trackId: track.id, lap: this.raceState.lap, direction: result.positionChanged,
        context: ev.kind === 'pit' ? 'pit' : overtakeAttempt ? 'attempt' : 'natural',
      });
    }

    if (!wasDnf && this.raceState.dnf) {
      trackEvent('dnf', {
        trackId: track.id, lap: this.raceState.lap, reason: this.raceState.dnfReason, challengeId,
      });
    }

    // juice (T-106): som + vibração + câmera reagindo ao resultado
    if (!wasDnf && this.raceState.dnf) {
      juice.crash();
      juice.vibrate([100, 50, 100]);
      this.cameras.main.shake(300, 0.02);
      this.cameras.main.flash(200, 200, 0, 0);
    } else if (tier === 'purple') {
      juice.perfect();
      juice.vibrate(20);
    } else if (tier === 'green') {
      juice.good();
    } else if (tier === 'red' || tier === 'miss') {
      juice.crash();
      juice.vibrate(40);
      if (result.damage > 0) this.cameras.main.shake(150, 0.008);
    }

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
    const reviveOffered = !this.raceState.usedRevive;
    if (reviveOffered) {
      const reviveBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 44, 'Voltar à corrida (revive)', 0x81c784, () => {
        trackEvent('revive_decision', { trackId: track.id, accepted: true });
        revive(this.raceState);
        this.startEventCycle();
      });
      this.panel.add(reviveBtn);
      y += 56;
    }
    const endBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 44, 'Encerrar corrida', 0xe57373, () => {
      if (reviveOffered) trackEvent('revive_decision', { trackId: track.id, accepted: false });
      this.showSummary(true);
    });
    this.panel.add(endBtn);
  }

  private showSummary(manualAbandon = false): void {
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
        manualAbandon,
      });
    }

    this.showFeedbackPrompt();
  }

  /** "Quer jogar de novo?" 1-5, na tela de fim (T-108). */
  private showFeedbackPrompt(): void {
    const feedbackContainer = this.add.container(0, 0);
    this.panel.add(feedbackContainer);
    feedbackContainer.add(this.add.text(16, 145, 'Quer jogar de novo?', { fontSize: '14px', color: '#fff' }));

    const gap = 8;
    const btnW = (CANVAS_WIDTH - 32 - gap * 4) / 5;
    for (let score = 1; score <= 5; score++) {
      const x = 16 + (score - 1) * (btnW + gap);
      const btn = this.makeButton(x, 175, btnW, 40, String(score), 0xffd54f, () => {
        trackEvent('feedback_score', { trackId: track.id, score });
        feedbackContainer.removeAll(true);
        feedbackContainer.add(this.add.text(16, 145, 'Valeu pelo feedback!', { fontSize: '14px', color: '#81c784' }));
      });
      feedbackContainer.add(btn);
    }
  }
}
