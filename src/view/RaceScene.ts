import Phaser from 'phaser';
import spaTrack from '../../tracks/spa.json';
import interlagosTrack from '../../tracks/interlagos.json';
import type { TrackDef, RaceState, RaceEvent, Tier, BoostId, CarSetup } from '../core/types.js';
import {
  createRace, currentEvent, resolveCurrent, advance, revive, toRaceOutput,
  setOvertakeAttempt, applyBoost, tryUseNitro, raceStandings, abandonRace,
} from '../core/raceState.js';
import { tierFromPosition, zoneHalves, computeScale, canAttemptOvertake, combineTiers } from '../core/timing.js';
import type { GridStanding, TeammateProfile } from '../core/grid.js';
import { normalizedToScreen, pathIndexToT, pointAtT } from './pathUtils.js';
import {
  TRACK_RECT, CANVAS_WIDTH, CANVAS_HEIGHT, HUD_HEIGHT, PANEL_HEIGHT,
  CURSOR_SWEEP_PERIOD_MS, CHALLENGE_TIME_LIMIT_MS, TWEEN_DURATION_MS, CHALLENGE_PREP_MS,
  SECONDS_PER_LAP_VISUAL, MAX_VISUAL_GAP_SECONDS, TIER_COLORS, BOOST_LABELS, BOOST_DESCRIPTIONS, TEAM_COLORS,
  DEFAULT_CAR_SETUP, DEFAULT_PIT_CREW_QUALITY,
  RAMP_DURATION_MS, ACCEL_CENTER, BRAKE_CENTER, JANELA_DURATION_SCALE,
  LARGADA_PREP_MS, LARGADA_LIGHT_INTERVAL_MS, LARGADA_HOLD_MIN_MS, LARGADA_HOLD_MAX_MS,
  LARGADA_HOLD_RATE, LARGADA_FALL_RATE, LARGADA_ZONE_SCALE,
  VISUAL_CATCHUP_HALFLIFE_MS, BULLET_TIME_SLOWDOWN, NORMAL_LEG_SPEED_T_PER_MS, LEG_PROGRESS_CAP,
  EVENT_LOOKAHEAD_STEPS,
} from './viewConstants.js';
import { track as trackEvent } from '../telemetry/analytics.js';
import { juice } from './juice.js';
import { GOLD_CRASH_PENALTY, FOLEGO_THRESHOLD_SCALE } from '../core/constants.js';
// E-202/E-203 (Manager, M2): recompensas pós-corrida (Gold + peças) — ponto de
// integração mínimo pedido nesta sessão, ver Claude-Manager.md.
import { computeRaceRewards, RARITY_LABELS, PART_SLOT_LABELS, equippedRarity, PART_SLOTS } from '../core/economy.js';
import type { RaceRewardResult, FusionResult, PartSlot, Rarity } from '../core/economy.js';
import { loadGame, applyRaceRewards, applyChampionshipRaceResult } from '../persistence/gameSave.js';
import type { TeamId } from '../core/grid.js';

/**
 * Registro de pistas disponíveis (sessão 15 — campeonato de 2 corridas,
 * pedido do PO). `RaceScene` recebe qual pista rodar via `init({ trackId })`
 * — sem isso, mantém `spa` como padrão (compatibilidade com quem inicia a
 * cena direto, sem passar pelo fluxo de campeonato/Hub).
 */
export const TRACKS: Record<string, TrackDef> = {
  spa: spaTrack as unknown as TrackDef,
  interlagos: interlagosTrack as unknown as TrackDef,
};
export const DEFAULT_TRACK_ID = 'spa';

const PANEL_Y = CANVAS_HEIGHT - PANEL_HEIGHT;

/** `track` passado explicitamente (não mais um módulo-level fixo em Spa) — ver `TRACKS`/`RaceScene.track`. */
function pathIndexForEvent(ev: RaceEvent, trackDef: TrackDef): number {
  if (ev.kind === 'pit') return trackDef.pitPathIndex;
  if (ev.cornerId) {
    const corner = trackDef.corners.find((c) => c.id === ev.cornerId);
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

/** Tempo de volta (pedido do PO, sessão 12) — segundos com 2 casas, vírgula decimal (pt-BR). */
function formatLapTime(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(2).replace('.', ',')}s`;
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
  /** Posição atual (0..1, fração do traçado) perseguindo o alvo continuamente — ver `tickVisualPositions`. `undefined` até o 1º tick (snap imediato). */
  visualT?: number;
}

/** Menor distância com sinal (na circular 0..1, com wrap) de `from` até `to` — usada pra perseguir o alvo sempre pelo caminho mais curto na pista fechada. */
function shortestDeltaT(from: number, to: number): number {
  let d = (to - from) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

export class RaceScene extends Phaser.Scene {
  private raceState!: RaceState;
  private carSetup: CarSetup = DEFAULT_CAR_SETUP;
  /** Perfil do piloto escalado pro Carro 2 (E-302/E-303, sessão 14) — `undefined` = perfil "Médio" padrão, ver core/grid.ts. */
  private teammate?: TeammateProfile;
  /** Pista da corrida atual — vem de `init({ trackId })` (campeonato, sessão 15); `spa` por padrão. Ver `TRACKS`. */
  private trackId: string = DEFAULT_TRACK_ID;
  private track!: TrackDef;
  /** true = esta corrida é uma etapa de um campeonato ativo (vem de `ChampionshipScene`) — aplica pontos de construtores no resumo. */
  private isChampionshipRace = false;
  private lastChampionshipPoints: Partial<Record<TeamId, number>> | null = null;

  private trackGraphics!: Phaser.GameObjects.Graphics;
  private startFinishLabel?: Phaser.GameObjects.Text;
  private pitLabel?: Phaser.GameObjects.Text;
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
  private hudLapTimeText!: Phaser.GameObjects.Text;
  private hudLastGap: number | null = null;

  // painel lateral esquerdo: gap ao líder de todos os 12 pilotos, em tempo real
  // (feedback do PO: ajuda a validar a simulação de corrida durante o jogo)
  private hudLeaderboardTexts: Phaser.GameObjects.Text[] = [];

  private challengeActive = false;
  private challengeStartTime = 0;
  private challengeHalves = { purple: 8, green: 20, amber: 35 };
  private cursorGraphics!: Phaser.GameObjects.Graphics;
  private challengeTimer?: Phaser.Time.TimerEvent;
  private challengePrepTimer?: Phaser.Time.TimerEvent;
  private pendingNitro = false;
  private pitAnnounced = false;
  private raceStartTime = 0;
  private raceEnded = false;

  // Bullet time (sessão 15): true enquanto o jogador está decidindo/resolvendo
  // o desafio do evento atual — desacelera o avanço contínuo dos carros sem
  // nunca parar de vez. Ver NORMAL_LEG_SPEED_T_PER_MS/BULLET_TIME_SLOWDOWN.
  private bulletTime = false;

  // Posição visual contínua do jogador (fração 0..1 do traçado) — sempre
  // avança em direção ao próximo evento, nunca fica parada. Ver
  // `advancePlayerRefT` e o comentário de NORMAL_LEG_SPEED_T_PER_MS
  // (viewConstants.ts) pro racional completo.
  private visualPlayerT = 0;
  private visualPlayerTInitialized = false;

  /**
   * Snapshot do `gapToLeader` do jogador usado pra posicionar os OUTROS 11
   * carros (deslocamento relativo, ver `tickVisualPositions`). Bug real
   * reportado pelo PO na sessão 15 ("os carros dão um pequeno passo atrás
   * antes de seguir à frente"): `resolveCurrent()` já muda `raceProgress`
   * (e portanto o gap do jogador) na hora, bem antes de `advance()` rodar —
   * como `tickVisualPositions` roda todo frame, ler o gap AO VIVO durante o
   * banner de resultado fazia os outros carros recalcularem sua posição
   * relativa contra um `refT` que ainda não tinha se movido, um instante
   * antes do refT alcançar, lido como um "passo atrás". Congelando o gap até
   * `advance()` rodar (mesmo instante em que `refT`/curT também mudam),
   * ambos os lados andam sempre em sincronia — igual ao comportamento de
   * antes desta sessão (quando a posição só era recalculada 1x por evento).
   */
  private frozenPlayerGapToLeader = 0;

  // Pausa (sessão 15): botão no HUD abre um modal com "Continuar"/"Desistir".
  private paused = false;
  private pauseStartedAt = 0;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private pauseButtonContainer?: Phaser.GameObjects.Container;

  // Toggles persistentes de ultrapassagem/nitro (sessão 15, pedido do PO):
  // substituem as antigas telas de decisão bloqueantes — o jogador liga/
  // desliga a qualquer momento, e a intenção só é aplicada de fato quando a
  // condição permite (ver showPreChallenge/updateToggleVisuals).
  private overtakeToggleOn = false;
  private nitroToggleOn = false;
  private toggleRowContainer?: Phaser.GameObjects.Container;
  private overtakeToggleBg?: Phaser.GameObjects.Rectangle;
  private overtakeToggleText?: Phaser.GameObjects.Text;
  private nitroToggleBg?: Phaser.GameObjects.Rectangle;
  private nitroToggleText?: Phaser.GameObjects.Text;

  // E-202 (Manager, M2): recompensa da corrida atual, calculada 1x em showSummary()
  private lastReward: RaceRewardResult | null = null;
  private lastFusions: FusionResult[] = [];
  private lastGoldTotal = 0;
  /** Gold efetivamente creditado nesta corrida, já com o bônus dos patrocinadores da livery (sessão 14) — pode ser > `lastReward.gold`. */
  private lastGoldAdded = 0;
  // Sessão 12 (pendência do Claude-Manager.md §2.8/§5 item 3): avisa quando a
  // fusão automática consome a raridade que o jogador tinha equipado de
  // propósito, mudando o que está de fato equipado sem o jogador ter pedido.
  private lastEquipChanges: { slot: PartSlot; from: Rarity; to: Rarity }[] = [];

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

  /**
   * Recebe o `carSetup` real do Hub (E-204/E-203) via `scene.start('RaceScene', { carSetup, teammate })`.
   * Sem dado (ex.: cena iniciada direto, sem passar pelo Hub) mantém o
   * `DEFAULT_CAR_SETUP`/perfil "Médio" padrão já usados como valor inicial.
   * `teammate` (E-302/E-303, sessão 14): perfil do piloto escalado pro Carro 2.
   */
  init(data: {
    carSetup?: CarSetup; teammate?: TeammateProfile; trackId?: string; isChampionshipRace?: boolean;
  } = {}): void {
    if (data.carSetup) this.carSetup = data.carSetup;
    this.teammate = data.teammate;
    this.trackId = data.trackId && TRACKS[data.trackId] ? data.trackId : DEFAULT_TRACK_ID;
    this.isChampionshipRace = data.isChampionshipRace ?? false;
    this.lastChampionshipPoints = null;
  }

  create(): void {
    this.track = TRACKS[this.trackId];
    this.raceState = createRace(this.track, this.carSetup, { teammate: this.teammate });
    this.raceStartTime = Date.now();
    this.raceEnded = false;
    this.bulletTime = false;
    this.paused = false;
    this.pauseOverlay = undefined;
    this.visualPlayerTInitialized = false;
    this.overtakeToggleOn = false;
    this.nitroToggleOn = false;
    trackEvent('race_start', { trackId: this.track.id });

    this.refreshFrozenGap();
    this.buildHud();
    this.buildPauseButton();
    this.buildToggleButtons();

    this.trackGraphics = this.add.graphics();
    this.drawTrack();

    for (const standing of this.currentStandings()) {
      this.icons.set(standing.id, this.createIcon(standing));
    }

    this.add.rectangle(0, PANEL_Y, CANVAS_WIDTH, PANEL_HEIGHT, 0x1a1a1a).setOrigin(0, 0);
    this.panel = this.add.container(0, PANEL_Y);

    this.input.once('pointerdown', () => juice.unlock());

    this.tickVisualPositions(0);
    this.updateHud();
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
    // Pausado: não avança nada (nem o crawl contínuo dos carros, nem o
    // cursor/largada) — `this.time.paused` já congela os TimerEvents; os
    // anchors baseados em `this.time.now` (challengeStartTime/largada*) são
    // compensados em `closePauseMenu()` pelo tempo total pausado.
    if (this.paused) return;
    if (this.challengeMode === 'hold') {
      if (this.challengeActive) this.updateLargada(time, dt);
    } else if (this.challengeActive) {
      this.drawCursor();
    }
    this.tickVisualPositions(dt);
  }

  // ---------- desenho estático ----------

  private drawTrack(): void {
    const g = this.trackGraphics;
    g.clear();
    g.lineStyle(6, 0x555555, 1);
    g.beginPath();
    this.track.path.forEach((p, i) => {
      const s = normalizedToScreen(p, TRACK_RECT);
      if (i === 0) g.moveTo(s.x, s.y);
      else g.lineTo(s.x, s.y);
    });
    const s0 = normalizedToScreen(this.track.path[0], TRACK_RECT);
    g.lineTo(s0.x, s0.y);
    g.strokePath();

    for (const corner of this.track.corners) {
      const s = normalizedToScreen(this.track.path[corner.pathIndex], TRACK_RECT);
      g.fillStyle(0x444444, 1);
      g.fillCircle(s.x, s.y, 4);
    }

    // Largada/chegada (sessão 15, feedback do PO: "a linha de partida/chegada
    // parece estar no local errado" — investigado; não havia NENHUM marcador
    // pra ela, só o círculo azul do pit, que fica geometricamente bem perto
    // de `path[0]` em Spa — fácil confundir os dois sem um marcador próprio).
    // Xadrez 2x2 em `path[0]`, visualmente distinto do círculo azul do pit e
    // dos pontos cinza das curvas.
    const cs = 5;
    g.fillStyle(0xffffff, 1);
    g.fillRect(s0.x - cs, s0.y - cs, cs, cs);
    g.fillRect(s0.x, s0.y, cs, cs);
    g.fillStyle(0x000000, 1);
    g.fillRect(s0.x, s0.y - cs, cs, cs);
    g.fillRect(s0.x - cs, s0.y, cs, cs);
    g.lineStyle(1, 0xffffff, 0.9);
    g.strokeRect(s0.x - cs, s0.y - cs, cs * 2, cs * 2);

    const pit = normalizedToScreen(this.track.path[this.track.pitPathIndex], TRACK_RECT);
    g.fillStyle(0x2196f3, 1);
    g.fillCircle(pit.x, pit.y, 6);

    // Rótulos (fora do Graphics — precisam ser destruídos/recriados à parte
    // a cada `drawTrack()`, senão vazam entre corridas igual ao bug já
    // corrigido de `hudLeaderboardTexts`, ver seção 2.34 do Claude-Racing.md).
    this.startFinishLabel?.destroy();
    this.startFinishLabel = this.add.text(s0.x, s0.y - 14, 'LARGADA/CHEGADA', {
      fontSize: '8px', color: '#ffffff',
    }).setOrigin(0.5);
    this.pitLabel?.destroy();
    this.pitLabel = this.add.text(pit.x, pit.y + 12, 'PIT', {
      fontSize: '8px', color: '#64b5f6',
    }).setOrigin(0.5);
  }

  /**
   * Unificação core/grid (sessão 11, ver Claude-Racing.md §3/§6 item 5): a
   * view não mantém mais seu próprio `gridState`/`playerCumulativeTime` em
   * paralelo — o grid mora dentro do `RaceState` (`core/raceState.ts`), e
   * `raceStandings()` é a mesma função usada pelo harness headless
   * internamente (via `state.position`/`gapToAhead`). 1 fonte de verdade só.
   */
  private currentStandings(): GridStanding[] {
    return raceStandings(this.raceState);
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

  /**
   * Avança `visualPlayerT` continuamente em direção ao PRÓXIMO evento
   * (espiado com antecedência — `state.events` é pré-computado), nunca em
   * direção ao evento atual (que fica parado até `advance()` rodar) — ver
   * comentário completo em `NORMAL_LEG_SPEED_T_PER_MS` (viewConstants.ts)
   * sobre por que perseguir um alvo fixo não resolvia o "carro parado".
   * `LEG_PROGRESS_CAP` trava o avanço perto da marca do próximo evento, sem
   * chegar/passar antes de `advance()` commitar. Recalcula a distância já
   * percorrida do zero a cada frame (não acumula um contador à parte), então
   * a transição para o próximo evento não precisa de nenhum reset explícito.
   */
  private advancePlayerRefT(dtMs: number): number {
    const s = this.raceState;
    const lastEvent = s.events[s.events.length - 1];
    const curT = pathIndexToT(pathIndexForEvent(s.finished ? lastEvent : currentEvent(s), this.track), this.track.path.length);

    if (!this.visualPlayerTInitialized) {
      this.visualPlayerT = curT;
      this.visualPlayerTInitialized = true;
    }

    if (s.finished) {
      // corrida encerrada: trava no último evento, sem mais avanço.
      this.visualPlayerT = curT;
      return this.visualPlayerT;
    }

    // Mira alguns eventos à frente, não só o próximo — ver EVENT_LOOKAHEAD_STEPS.
    const lookaheadIndex = Math.min(s.eventIndex + EVENT_LOOKAHEAD_STEPS, s.events.length - 1);
    const nextEvent = s.events[lookaheadIndex] ?? currentEvent(s);
    const nextT = pathIndexToT(pathIndexForEvent(nextEvent, this.track), this.track.path.length);
    const legDist = Math.max(0, shortestDeltaT(curT, nextT));

    const speedTPerMs = this.bulletTime
      ? NORMAL_LEG_SPEED_T_PER_MS / BULLET_TIME_SLOWDOWN
      : NORMAL_LEG_SPEED_T_PER_MS;
    let progress = Math.max(0, shortestDeltaT(curT, this.visualPlayerT));
    progress = Math.min(legDist * LEG_PROGRESS_CAP, progress + speedTPerMs * dtMs);
    this.visualPlayerT = curT + progress;
    return this.visualPlayerT;
  }

  /** Atualiza o snapshot de `frozenPlayerGapToLeader` — ver o comentário do campo. */
  private refreshFrozenGap(): void {
    const standings = this.currentStandings();
    this.frozenPlayerGapToLeader = standings.find((x) => x.isPlayer)?.gapToLeader ?? 0;
  }

  /**
   * Posiciona todos os ícones do grid a partir da referência contínua do
   * jogador (`advancePlayerRefT`) + gap — o pelotão inteiro anda junto com o
   * crawl do jogador. Uma suavização de polimento por ícone (meia-vida curta,
   * fixa — não escala com `bulletTime`, que já é tratado na referência)
   * absorve saltos pequenos de gap entre carros (ex.: ultrapassagem
   * registrada no grid a cada `advance()`), sem representar mais a
   * velocidade geral do avanço.
   */
  private tickVisualPositions(dtMs: number): void {
    const standings = this.currentStandings();
    const refT = this.advancePlayerRefT(dtMs);
    // `refT` é a posição do JOGADOR (deriva do evento atual dele), não do líder.
    // Cada carro precisa ser deslocado pelo gap RELATIVO AO JOGADOR, não pelo
    // `gapToLeader` bruto — senão o líder (gapToLeader = 0) cai exatamente em
    // cima de `refT`, ou seja, em cima do próprio jogador, ficando mais errado
    // quanto maior o gap do jogador (bug reportado em playtest, Claude-Racing.md §2.22).
    const factor = dtMs > 0 ? 1 - Math.pow(0.5, dtMs / VISUAL_CATCHUP_HALFLIFE_MS) : 0;

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

      const gapToPlayer = standing.gapToLeader - this.frozenPlayerGapToLeader;
      const clampedGap = Math.max(-MAX_VISUAL_GAP_SECONDS, Math.min(MAX_VISUAL_GAP_SECONDS, gapToPlayer));
      const targetT = refT - clampedGap / SECONDS_PER_LAP_VISUAL;

      entry.visualT = entry.visualT === undefined ? targetT : entry.visualT + shortestDeltaT(entry.visualT, targetT) * factor;

      const point = pointAtT(this.track.path, entry.visualT);
      const screen = normalizedToScreen(point, TRACK_RECT);
      entry.container.setPosition(screen.x, screen.y);
    }
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

    // Ancorado CANVAS_WIDTH-42 (não -16): sessão 15, o botão de pausa moveu
    // pro canto superior direito de vez (pedido do PO) e precisa da faixa
    // mais externa (~38px) livre — ver buildPauseButton().
    this.hudGapText = this.add.text(CANVAS_WIDTH - 42, 6, '', {
      fontSize: '20px', color: '#e74c3c', fontStyle: 'bold',
    }).setOrigin(1, 0);
    this.hudGapTrendText = this.add.text(CANVAS_WIDTH - 42, 28, '', {
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

    // Tempo de volta (pedido do PO, sessão 12) — última volta completada + melhor volta até agora.
    this.hudLapTimeText = this.add.text(16, 64, '', { fontSize: '10px', color: '#8899aa' });

    this.buildLeaderboardPanel();
  }

  /**
   * Painel lateral esquerdo com o gap ao líder de todos os 12 pilotos (não só o carro da frente).
   * Bug real encontrado na sessão 15 (Playwright, causa raiz do "não consigo
   * iniciar uma nova corrida"): `hudLeaderboardTexts` é um campo persistente
   * da cena, e `create()` roda de novo a cada corrida — sem limpar o array
   * primeiro, a 2ª corrida EMPILHAVA mais 12 textos em cima dos 12 antigos
   * (já destruídos pelo Phaser ao sair da cena), e `updateLeaderboardPanel`
   * lia os índices 0-11 (os objetos mortos) em vez dos novos, quebrando com
   * `Cannot read properties of null (reading 'drawImage')` ao tentar
   * `setColor()` num Text destruído — só na 2ª corrida em diante, nunca na 1ª.
   */
  private buildLeaderboardPanel(): void {
    this.hudLeaderboardTexts.forEach((t) => t.destroy());
    this.hudLeaderboardTexts = [];
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

  /**
   * Botão de pausa (sessão 15, pedido do PO): abre um modal com "Continuar" e
   * "Desistir da corrida" (DNF instantâneo por desistência). Movido pro canto
   * superior direito nesta mesma sessão (2ª rodada de feedback) — o centro do
   * topo passou a ser ocupado pela linha de toggles de ultrapassagem/nitro
   * (ver buildToggleButtons). `hudGapText`/`hudGapTrendText` (buildHud) já
   * ficam ancorados mais pra dentro (CANVAS_WIDTH-42) pra abrir espaço aqui.
   */
  private buildPauseButton(): void {
    const w = 34, h = 26, x = CANVAS_WIDTH - w - 4, y = 4;
    const container = this.add.container(x, y).setDepth(900);
    const bg = this.add.rectangle(0, 0, w, h, 0x333640, 1).setOrigin(0, 0)
      .setStrokeStyle(1, 0x556677).setInteractive({ useHandCursor: true });
    const text = this.add.text(w / 2, h / 2, 'II', { fontSize: '13px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      this.openPauseMenu();
    });
    container.add([bg, text]);
    this.pauseButtonContainer = container;
  }

  /**
   * Toggles persistentes de ultrapassagem/nitro (sessão 15, pedido do PO):
   * "deixá-los como toggle-buttons na tela, disponíveis para serem alterados
   * todo o tempo, mas só seriam ativados se possível". Sempre visíveis
   * durante a corrida — ao contrário das antigas telas de decisão
   * (showOvertakeStep/showNitroStep, removidas), não bloqueiam nada nem têm
   * timeout: o jogador liga/desliga quando quiser, e a intenção só "pega" de
   * verdade quando `showPreChallenge` checa a condição real (posição/gap pra
   * ultrapassagem, carga disponível pro nitro).
   *
   * Reposicionados na 3ª rodada de feedback (mesma sessão): ficavam no topo
   * do HUD; PO pediu aparência parecida com o painel de gaps (esquerda,
   * `buildLeaderboardPanel` — fundo preto semi-transparente, monoespaçado) e
   * mais perto do botão do desafio (que fica dentro de `this.panel`, no
   * rodapé) — movidos pra uma faixa fixa logo ACIMA de `this.panel` (fora
   * dele, pra sobreviver a `clearPanel()`), com o mesmo estilo visual do
   * painel de gaps em vez do preenchimento sólido colorido de antes.
   */
  private buildToggleButtons(): void {
    const y = PANEL_Y - 34, h = 28, gap = 8;
    const w = (CANVAS_WIDTH - 32 - gap) / 2;
    const container = this.add.container(0, 0).setDepth(900);

    const overtakeBg = this.add.rectangle(16, y, w, h, 0x000000, 0.55).setOrigin(0, 0)
      .setStrokeStyle(1, 0x556677).setInteractive({ useHandCursor: true });
    const overtakeText = this.add.text(16 + w / 2, y + h / 2, 'ULTRAPASSAGEM', {
      fontSize: '11px', color: '#cccccc', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    overtakeBg.on('pointerdown', () => {
      juice.click();
      this.overtakeToggleOn = !this.overtakeToggleOn;
      this.updateToggleVisuals();
    });

    const nitroX = 16 + w + gap;
    const nitroBg = this.add.rectangle(nitroX, y, w, h, 0x000000, 0.55).setOrigin(0, 0)
      .setStrokeStyle(1, 0x556677).setInteractive({ useHandCursor: true });
    const nitroText = this.add.text(nitroX + w / 2, y + h / 2, 'NITRO', {
      fontSize: '11px', color: '#cccccc', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    nitroBg.on('pointerdown', () => {
      juice.click();
      this.nitroToggleOn = !this.nitroToggleOn;
      this.updateToggleVisuals();
    });

    container.add([overtakeBg, overtakeText, nitroBg, nitroText]);
    this.toggleRowContainer = container;
    this.overtakeToggleBg = overtakeBg;
    this.overtakeToggleText = overtakeText;
    this.nitroToggleBg = nitroBg;
    this.nitroToggleText = nitroText;
    this.updateToggleVisuals();
  }

  /**
   * Reflete o estado real dos toggles (ligado/desligado × disponível/
   * indisponível agora) — chamado de `updateHud()` (então atualiza a cada
   * evento, incluindo quando o próprio clique no toggle já dispara na hora).
   */
  private updateToggleVisuals(): void {
    if (!this.overtakeToggleBg || !this.nitroToggleBg) return;
    const s = this.raceState;
    const ev = !s.finished && !s.dnf ? currentEvent(s) : undefined;
    const isSaida = ev?.kind === 'saida';
    const isPit = ev?.kind === 'pit';
    const overtakeThresholdScale = s.pendingBoost === 'folego_ultrapassagem' ? FOLEGO_THRESHOLD_SCALE : 1;
    const canOvertakeNow = !!ev && !isSaida && !isPit && s.position > 1
      && canAttemptOvertake(s.gapToAhead, overtakeThresholdScale);
    const hasNitroNow = s.nitro > 0;

    this.styleToggle(this.overtakeToggleBg, this.overtakeToggleText!, this.overtakeToggleOn, canOvertakeNow, 'ULTRAPASSAGEM');
    // Sempre "NITRO" (feedback do PO, 3ª rodada): o rótulo contextual
    // KERS/Magic (sessão 9) fazia sentido numa tela de decisão que só
    // aparecia 1x por evento — num toggle PERSISTENTE, visível o tempo
    // todo através de vários tipos de evento, o rótulo trocando sozinho
    // parecia sugerir 2 mecanismos diferentes, quando é sempre o mesmo
    // nitro (`state.nitro`/`tryUseNitro`), só usável tanto na saída quanto
    // na frenagem/pit.
    this.styleToggle(this.nitroToggleBg, this.nitroToggleText!, this.nitroToggleOn, hasNitroNow, 'NITRO');
  }

  /** Visual "painel de gaps" (fundo escuro semi-transparente, monoespaçado) — cor do texto/borda indica o estado, não mais um preenchimento sólido colorido. */
  private styleToggle(
    bg: Phaser.GameObjects.Rectangle, text: Phaser.GameObjects.Text, on: boolean, available: boolean, label: string
  ): void {
    text.setText(on ? `${label}: ON` : label);
    if (on && available) {
      bg.setStrokeStyle(1, 0x81c784);
      text.setColor('#81c784');
    } else if (on) {
      // ligado mas não disponível agora (ex.: sem nitro, ou longe demais pra ultrapassar) — "armado", esperando a condição.
      bg.setStrokeStyle(1, 0xd4a574);
      text.setColor('#d4a574');
    } else {
      bg.setStrokeStyle(1, 0x556677);
      text.setColor('#cccccc');
    }
  }

  private openPauseMenu(): void {
    if (this.paused || this.raceState.dnf || this.raceState.finished) return;
    this.paused = true;
    this.pauseStartedAt = this.time.now;
    this.time.paused = true;

    const overlay = this.add.container(0, 0).setDepth(2000);
    const bg = this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x000000, 0.75)
      .setOrigin(0, 0).setInteractive();
    overlay.add(bg);
    overlay.add(this.add.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 110, 'PAUSADO', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5));

    const btnW = CANVAS_WIDTH - 80;
    overlay.add(this.makeButton(40, CANVAS_HEIGHT / 2 - 44, btnW, 48, 'Continuar', 0x64b5f6, () => {
      this.closePauseMenu();
    }));
    overlay.add(this.makeButton(40, CANVAS_HEIGHT / 2 + 24, btnW, 48, 'Desistir da corrida', 0xe57373, () => {
      this.time.paused = false;
      overlay.destroy();
      this.pauseOverlay = undefined;
      this.paused = false;
      this.bulletTime = false;
      this.pauseButtonContainer?.setVisible(false);
      this.toggleRowContainer?.setVisible(false);
      trackEvent('race_abandon', { trackId: this.track.id, lap: this.raceState.lap });
      abandonRace(this.raceState);
      this.showSummary(true);
    }));

    this.pauseOverlay = overlay;
  }

  private closePauseMenu(): void {
    // Compensa os anchors de tempo do desafio ativo (baseados em `this.time.now`,
    // que continua correndo mesmo com `this.time.paused` — só os TimerEvents
    // congelam) pelo tempo total em que o jogo ficou pausado, senão o cursor
    // "pula" pra frente ao despausar.
    const pausedDuration = this.time.now - this.pauseStartedAt;
    this.challengeStartTime += pausedDuration;
    this.largadaGoAt += pausedDuration;
    this.largadaLightsDoneAt += pausedDuration;

    this.time.paused = false;
    this.pauseOverlay?.destroy();
    this.pauseOverlay = undefined;
    this.paused = false;
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
    // gap relativo ao carro imediatamente à frente — vem direto do core
    // (`raceState.gapToAhead`, derivado do grid via `raceStandings`, ver
    // Claude-Racing.md §3/§6 item 5). Antes disso a view recalculava o mesmo
    // valor à parte a partir do grid local (`displayGap`, removido nesta
    // sessão) — 1 fonte de verdade só agora, sem risco de divergência.
    const gap = s.gapToAhead;

    this.hudPositionText.setText(`P${playerStanding.position}`);
    this.hudLapValueText.setText(`${s.lap}/${this.track.laps}`);

    this.hudGapText.setText(formatGap(gap)).setColor(gap > 0 ? '#e74c3c' : '#2ecc71');
    if (this.hudLastGap !== null && gap !== this.hudLastGap) {
      this.hudGapTrendText.setText(gap < this.hudLastGap ? '▼ diminuindo' : '▲ aumentando');
    }
    this.hudLastGap = gap;

    const hpPct = s.healthMax > 0 ? Math.max(0, s.health / s.healthMax) : 0;
    this.hudHealthBarFill.width = 260 * hpPct;
    this.hudHealthBarFill.setFillStyle(hpPct > 0.5 ? 0x2ecc71 : hpPct > 0.25 ? 0xf1c40f : 0xe74c3c);
    this.hudHealthLabelText.setText(`SAÚDE ${Math.round(s.health)}/${s.healthMax}`);

    this.drawHudNitro(s.nitro, this.carSetup.nitroCharges);

    this.hudEventText.setText(eventLabel);

    if (s.lapTimes.length > 0) {
      const last = s.lapTimes[s.lapTimes.length - 1];
      const best = Math.min(...s.lapTimes);
      this.hudLapTimeText.setText(`Última: ${formatLapTime(last)}  Melhor: ${formatLapTime(best)}`);
    } else {
      this.hudLapTimeText.setText('');
    }

    this.updateLeaderboardPanel(standings);
    this.updateToggleVisuals();
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
    this.pauseButtonContainer?.setVisible(true);
    this.toggleRowContainer?.setVisible(true);

    if (this.raceState.dnf) {
      this.bulletTime = false;
      this.pauseButtonContainer?.setVisible(false);
      this.toggleRowContainer?.setVisible(false);
      this.showDnfOverlay();
      return;
    }
    if (this.raceState.finished) {
      this.bulletTime = false;
      this.pauseButtonContainer?.setVisible(false);
      this.toggleRowContainer?.setVisible(false);
      this.showSummary();
      return;
    }

    const ev = currentEvent(this.raceState);
    this.pendingNitro = false;
    this.pitAnnounced = false;

    if (ev.boostEligible) {
      this.showBoostChoice(ev);
      return;
    }
    this.showPreChallenge(ev);
  }

  private showBoostChoice(ev: RaceEvent): void {
    this.clearPanel();
    this.panel.add(this.add.text(16, 12, 'Boost da volta — escolha 1:', { fontSize: '14px', color: '#fff' }));
    const allBoosts: BoostId[] = [
      'pneu', 'freio', 'janela', 'reparo_rapido', 'nitro_extra', 'recuperacao_erro',
      'rasante', 'folego_ultrapassagem',
    ];
    const options: BoostId[] = allBoosts.sort(() => Math.random() - 0.5).slice(0, 3);
    options.forEach((id, i) => {
      const rowY = 40 + i * 60;
      const btn = this.makeButton(16, rowY, CANVAS_WIDTH - 32, 40, BOOST_LABELS[id], 0xffd54f, () => {
        trackEvent('boost_chosen', { trackId: this.track.id, lap: this.raceState.lap, options, chosen: id });
        applyBoost(this.raceState, id);
        this.showPreChallenge(ev);
      });
      this.panel.add(btn);
      // Feedback do PO: os nomes dos boosts não deixavam claro o efeito (Claude-Racing.md §2.21).
      this.panel.add(this.add.text(16, rowY + 42, BOOST_DESCRIPTIONS[id], { fontSize: '11px', color: '#aaa' }));
    });
  }

  /**
   * Banner curto ao entrar no pit — feedback de playtest do PO: a atenção
   * fica presa no botão do desafio e o pit passa despercebido (Claude-Racing.md §2.21).
   */
  private showPitAnnouncement(ev: RaceEvent): void {
    this.clearPanel();
    this.panel.add(this.add.text(CANVAS_WIDTH / 2, 60, 'BOXES!', {
      fontSize: '40px', color: '#64b5f6', fontStyle: 'bold',
    }).setOrigin(0.5));
    this.panel.add(this.add.text(CANVAS_WIDTH / 2, 110, 'Entrando no pit stop...', {
      fontSize: '14px', color: '#fff',
    }).setOrigin(0.5));
    this.cameras.main.flash(250, 30, 60, 100);
    juice.pitEntry();
    this.time.delayedCall(900, () => this.showPreChallenge(ev));
  }

  /**
   * Sessão 15 (pedido do PO): ultrapassagem/nitro deixam de ser telas de
   * decisão bloqueantes (com o próprio timeout) — agora são 2 toggle-buttons
   * persistentes no HUD (`buildToggleButtons`/`updateToggleVisuals`), que o
   * jogador liga/desliga a qualquer momento. Aqui só aplicamos a INTENÇÃO já
   * armada (`overtakeToggleOn`/`nitroToggleOn`) se a condição de verdade
   * permitir — sem isso, os carros ficavam "presos" numa tela de decisão
   * bloqueante bem antes do desafio de timing de fato começar (motivo do
   * bullet time entrar cedo demais — ver comentário de `startTimingChallenge`).
   */
  private showPreChallenge(ev: RaceEvent): void {
    const isSaida = ev.kind === 'saida';
    const isPit = ev.kind === 'pit';
    if (isPit && !this.pitAnnounced) {
      this.pitAnnounced = true;
      this.showPitAnnouncement(ev);
      return;
    }
    this.clearPanel();
    // Unificação core/grid (sessão 11, ver Claude-Racing.md §3/§6 item 5):
    // `raceState.position` agora É a posição do grid (mesma fonte, sempre em
    // sincronia) — não precisa mais consultar o grid separadamente só pra
    // confirmar que o jogador não é o líder antes de oferecer ultrapassagem
    // (bug antigo, corrigido estruturalmente aqui, não só por um guard pontual
    // como na sessão 7).
    // Boost "fôlego de ultrapassagem" (sessão 13): alarga o gap máximo em que
    // dá pra tentar, enquanto pendente (limpo pelo core na próxima frenagem/pit
    // resolvida, mesmo padrão dos outros boosts "aguarda a próxima").
    const overtakeThresholdScale = this.raceState.pendingBoost === 'folego_ultrapassagem' ? FOLEGO_THRESHOLD_SCALE : 1;
    const canOvertake = !isSaida && !isPit && this.raceState.position > 1
      && canAttemptOvertake(this.raceState.gapToAhead, overtakeThresholdScale);
    if (this.overtakeToggleOn && canOvertake) setOvertakeAttempt(this.raceState, true);
    this.pendingNitro = this.nitroToggleOn && this.raceState.nitro > 0;
    this.startTimingChallenge(ev);
  }

  private startTimingChallenge(ev: RaceEvent): void {
    // Bullet time (sessão 15, revisado): liga só aqui — bem quando o desafio
    // de timing de fato começa a ser mostrado/lido (prep + cursor ativo) —
    // não mais desde a decisão de ultrapassagem/nitro (que virou um toggle
    // sempre disponível, sem tela própria — ver showPreChallenge). Feedback
    // do PO: o tempo de decisão+interação era maior que o de viagem, e o
    // "dash" rápido em velocidade normal chegava e ficava esperando parado.
    // Desliga de novo no início de `resolveChallenge`.
    this.bulletTime = true;
    const isSaida = ev.kind === 'saida';
    const isPit = ev.kind === 'pit';
    const scale = computeScale({
      base: this.raceState.zoneScaleBase,
      isPit, isSaida,
      overtakeAttempt: this.raceState.overtakeAttempt,
      gap: this.raceState.gapToAhead,
      pendingBoostIsPneu: this.raceState.pendingBoost === 'pneu',
      pitCrewQuality: DEFAULT_PIT_CREW_QUALITY,
      healthFraction: this.raceState.health / this.raceState.healthMax,
    });
    const isLargada = isSaida && ev.cornerName === 'Largada';
    // Cursor da largada ficou mais lento/controlável (sessão 14, pedido do
    // PO) — compensado com zona roxa/verde mais estreita só aqui, sem tocar
    // no ZONE_BASE_HALVES global (compartilhado com frenagem/aceleração/pit,
    // que o PO já confirmou estarem na medida certa).
    this.challengeHalves = zoneHalves(isLargada ? scale * LARGADA_ZONE_SCALE : scale);

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

  /**
   * Pit: mantém o vaivém contínuo original (fora do escopo da revisão CSR2 do
   * T-105). Rótulo + barra aparecem na hora; o cursor só começa a se mover
   * depois de CHALLENGE_PREP_MS (tempo de leitura, ver Claude-Racing.md §2.28).
   */
  private startSweepChallenge(): void {
    this.clearPanel();
    this.challengeMode = 'sweep';
    this.renderChallengeBarAndButton('Pit stop — toque no momento certo!');
    this.challengeActive = false;
    this.challengePrepTimer?.remove();
    this.challengePrepTimer = this.time.delayedCall(CHALLENGE_PREP_MS, () => {
      this.challengeActive = true;
      this.challengeStartTime = this.time.now;
      const timeLimit = this.raceState.pendingBoost === 'janela' ? CHALLENGE_TIME_LIMIT_MS * JANELA_DURATION_SCALE : CHALLENGE_TIME_LIMIT_MS;
      this.challengeTimer = this.time.delayedCall(timeLimit, () => this.onChallengeTapResolved('miss'));
    });
  }

  /**
   * Frenagem e aceleração (T-105): uma única passagem 0->100, sem vaivém
   * contínuo. Mesmo atraso de leitura do sweep (CHALLENGE_PREP_MS) antes do
   * cursor começar a andar — não interage com JANELA_DURATION_SCALE, que só
   * escala a duração do desafio em si, não o atraso antes dele começar.
   */
  private startRampChallenge(label: string): void {
    this.clearPanel();
    this.challengeMode = 'ramp';
    // "janela ampliada" (boost) só se aplica à frenagem/pit, mesma convenção de pneu/freio (não afeta a aceleração da saída que a ofereceu).
    const ev = currentEvent(this.raceState);
    const janelaActive = ev.kind !== 'saida' && this.raceState.pendingBoost === 'janela';
    this.challengeDurationMs = janelaActive ? RAMP_DURATION_MS * JANELA_DURATION_SCALE : RAMP_DURATION_MS;
    this.renderChallengeBarAndButton(label);
    this.challengeActive = false;
    this.challengePrepTimer?.remove();
    this.challengePrepTimer = this.time.delayedCall(CHALLENGE_PREP_MS, () => {
      this.challengeActive = true;
      this.challengeStartTime = this.time.now;
      this.challengeTimer = this.time.delayedCall(this.challengeDurationMs, () => this.onChallengeTapResolved('miss'));
    });
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
    // cursor parado na posição inicial durante o prep (CHALLENGE_PREP_MS) — só
    // passa a se mover quando o desafio de fato ativa (ver startRampChallenge/startSweepChallenge).
    this.drawCursorAt(0, barX, barY, barW, barH);
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
    bg.on('pointerdown', () => { if (this.paused) return; juice.click(); this.largadaHolding = true; });
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
    const barX = 16, barY = 48, barW = CANVAS_WIDTH - 32, barH = 28;
    this.drawCursorAt(this.currentCursorPos(), barX, barY, barW, barH);
  }

  /** Desenha o cursor numa posição 0-100 explícita — usado tanto pela animação (drawCursor) quanto pelo cursor parado durante o prep de leitura (CHALLENGE_PREP_MS). */
  private drawCursorAt(pos: number, barX: number, barY: number, barW: number, barH: number): void {
    const x = barX + (pos / 100) * barW;
    this.cursorGraphics.clear();
    this.cursorGraphics.fillStyle(0xffffff, 1);
    this.cursorGraphics.fillRect(x - 2, barY - 4, 4, barH + 8);
  }

  private handleTap(): void {
    if (this.paused || !this.challengeActive) return;
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
    // Bullet time desliga assim que o resultado é conhecido — carros voltam
    // à velocidade normal pra "ilustrar" o resultado (ex.: ultrapassagem) e
    // seguir até o próximo evento (ver tickVisualPositions/showPreChallenge).
    this.bulletTime = false;
    const ev = currentEvent(this.raceState);
    const challengeId = ev.cornerId ?? (ev.kind === 'pit' ? 'pit' : 'largada');
    const gapBefore = this.raceState.gapToAhead;
    const overtakeAttempt = this.raceState.overtakeAttempt;
    const wasDnf = this.raceState.dnf;
    // frenagem em 2 etapas: `tier` aqui já é o combinado (combineTiers) — guarda a etapa 1 separada pra telemetria
    const stage1Tier = ev.kind === 'frenagem' ? this.frenagemStage1Tier ?? undefined : undefined;

    const nitroUsed = this.pendingNitro ? tryUseNitro(this.raceState) : false;
    const result = resolveCurrent(this.raceState, tier, { nitroUsed });
    // (sessão 11) não há mais `playerCumulativeTime` separado na view — o core
    // já contabiliza o progresso do jogador internamente (`raceState.raceProgress`,
    // consultado pelo grid via `raceStandings()`).

    trackEvent('challenge_result', {
      trackId: this.track.id, challengeId, kind: ev.kind, tier, nitroUsed, overtakeAttempt,
      gapBefore, gapAfter: this.raceState.gapToAhead, healthAfter: this.raceState.health,
      ...(stage1Tier ? { stage1Tier } : {}),
    });

    if (result.positionChanged) {
      trackEvent('overtake', {
        trackId: this.track.id, lap: this.raceState.lap, direction: result.positionChanged,
        context: ev.kind === 'pit' ? 'pit' : overtakeAttempt ? 'attempt' : 'natural',
      });
    }

    if (!wasDnf && this.raceState.dnf) {
      trackEvent('dnf', {
        trackId: this.track.id, lap: this.raceState.lap, reason: this.raceState.dnfReason, challengeId,
        goldPenalty: this.raceState.dnfReason === 'batida forte' ? GOLD_CRASH_PENALTY : 0,
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
    // `advance()` agora também avança o grid internamente (sessão 11, ver
    // Claude-Racing.md §3/§6 item 5) — não precisa mais de um `advanceGrid`
    // separado aqui em lockstep. O deslocamento visual dos ícones em direção
    // ao novo evento é contínuo (`tickVisualPositions`, chamado todo frame em
    // `update()`) — não precisa mais disparar aqui; este delay é só um
    // respiro de ritmo antes de mostrar a próxima decisão.
    advance(this.raceState);
    // Sincroniza o snapshot de gap dos outros carros com a MESMA transição
    // (curT/refT também mudam agora) — ver comentário de `frozenPlayerGapToLeader`.
    this.refreshFrozenGap();
    this.updateHud();
    this.time.delayedCall(TWEEN_DURATION_MS, () => this.startEventCycle());
  }

  // ---------- DNF / resumo ----------

  private showDnfOverlay(): void {
    this.clearPanel();
    this.panel.add(this.add.text(16, 12, `DNF — ${this.raceState.dnfReason ?? 'motivo desconhecido'}`, {
      fontSize: '16px', color: '#ff6666', fontStyle: 'bold',
    }));
    let y = 40;
    if (this.raceState.dnfReason === 'batida forte') {
      this.panel.add(this.add.text(16, y, `Penalidade: -${GOLD_CRASH_PENALTY} Gold`, {
        fontSize: '13px', color: '#ffd54f',
      }));
      y += 24;
    }
    const reviveOffered = !this.raceState.usedRevive;
    if (reviveOffered) {
      const reviveBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 44, 'Voltar à corrida (revive)', 0x81c784, () => {
        trackEvent('revive_decision', { trackId: this.track.id, accepted: true });
        revive(this.raceState);
        this.startEventCycle();
      });
      this.panel.add(reviveBtn);
      y += 56;
    }
    const endBtn = this.makeButton(16, y, CANVAS_WIDTH - 32, 44, 'Encerrar corrida', 0xe57373, () => {
      if (reviveOffered) trackEvent('revive_decision', { trackId: this.track.id, accepted: false });
      this.showSummary(true);
    });
    this.panel.add(endBtn);
  }

  /**
   * Tela de resumo — única tela que usa a altura INTEIRA do canvas (não só a
   * faixa de 220px do `panel`): virou a tela final da sessão (E-202 adicionou
   * Gold/peças/fusões, uma quantidade variável de linhas que não cabe mais na
   * faixa curta usada durante a corrida). `this.panel` é reaproveitado
   * (reposicionado pra (0,0) só aqui) em vez de criar um container novo — ele
   * já é destruído/recriado no próximo `create()` (próxima corrida), então
   * reposicioná-lo aqui não vaza estado pra nenhum outro fluxo desta cena.
   */
  private showSummary(manualAbandon = false): void {
    this.clearPanel();
    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x0d0f12, 0.97).setOrigin(0, 0).setDepth(500);
    this.panel.setPosition(0, 0).setDepth(501);

    const output = toRaceOutput(this.raceState);
    // Carro 2 (E-303, sessão 14): pontua no campeonato de construtores (CLAUDE.md
    // Q4) — mostra a posição final do companheiro de equipe, guiado por IA, na
    // mesma classificação de 12 carros. Sempre "termina" (o grid não simula
    // DNF pras IAs ainda), então a posição ao vivo já é a final.
    const teammateStanding = raceStandings(this.raceState).find((s) => s.isTeammate);
    const lines = [
      'Corrida finalizada',
      `Posição: ${output.position}/12`,
      teammateStanding ? `Carro 2 (companheiro): P${teammateStanding.position}/12` : '',
      `Voltas completadas: ${output.lapsCompleted}/${this.track.laps}`,
      output.dnf ? `DNF (${output.dnfReason})` : 'Chegou à bandeira quadriculada',
      output.reviveUsed ? 'Revive usado nesta corrida' : '',
      output.goldPenalty > 0 ? `Penalidade total: -${output.goldPenalty} Gold` : '',
    ].filter(Boolean);

    // Tempo de volta (pedido do PO, sessão 12): lista cada volta completada, com a melhor destacada.
    if (output.lapTimes.length > 0) {
      const bestLapTime = Math.min(...output.lapTimes);
      lines.push('');
      lines.push('Voltas:');
      output.lapTimes.forEach((t, i) => {
        const marker = t === bestLapTime ? ' ★ melhor' : '';
        lines.push(`  Volta ${i + 1}: ${formatLapTime(t)}${marker}`);
      });
    }

    // E-202 (Manager, M2): Gold + peças ganhas nesta corrida, aplicadas ao save
    // persistido uma única vez (mesmo guard `raceEnded` já usado pra telemetria
    // não disparar 2x se showSummary for chamado de novo).
    if (!this.raceEnded) {
      this.raceEnded = true;
      trackEvent('race_end', {
        trackId: this.track.id,
        position: output.position,
        durationSec: Math.round((Date.now() - this.raceStartTime) / 1000),
        lapsCompleted: output.lapsCompleted,
        dnf: output.dnf,
        reviveUsed: output.reviveUsed,
        manualAbandon,
        lapTimes: output.lapTimes,
      });

      // `output.position` já reflete a regra de classificação de DNF (sessão
      // 13, core/raceState.ts `toRaceOutput`) — último lugar quando o jogador
      // não terminou, em vez da posição "ao vivo" congelada no abandono.
      const reward = computeRaceRewards({
        position: output.position, dnf: output.dnf, goldPenalty: output.goldPenalty,
      });
      const save = loadGame();
      // Pendência do Claude-Manager.md §2.8/§5 item 3: a fusão automática pode
      // consumir a raridade que o jogador tinha equipado de propósito, trocando
      // o que está de fato equipado sem ele ter pedido — captura o "antes" pra
      // comparar depois de aplicar a recompensa/fusão e avisar na tela.
      const equippedBefore = Object.fromEntries(
        PART_SLOTS.map((slot) => [slot, equippedRarity(save.inventory, slot)])
      );
      const { save: updatedSave, fusions, goldAdded } = applyRaceRewards(save, reward);
      this.lastReward = reward;
      this.lastFusions = fusions;
      this.lastGoldTotal = updatedSave.gold;
      this.lastGoldAdded = goldAdded;
      this.lastEquipChanges = PART_SLOTS
        .map((slot) => ({ slot, from: equippedBefore[slot], to: equippedRarity(updatedSave.inventory, slot) }))
        .filter((c): c is { slot: PartSlot; from: Rarity; to: Rarity } => c.from !== null && c.from !== c.to && c.to !== null);

      // Campeonato de construtores (sessão 15, pedido do PO): só aplica se
      // esta corrida foi de fato lançada como etapa de um campeonato ativo
      // (`ChampionshipScene`) — uma corrida avulsa (botão CORRER do Hub)
      // nunca mexe no campeonato, mesmo que um esteja em andamento.
      if (this.isChampionshipRace) {
        const { pointsGainedThisRace } = applyChampionshipRaceResult(updatedSave, this.raceState);
        this.lastChampionshipPoints = pointsGainedThisRace;
      }
    }

    if (this.lastReward) {
      lines.push('');
      const bonusNote = this.lastGoldAdded > this.lastReward.gold ? ' (com bônus de patrocinador)' : '';
      lines.push(`+${this.lastGoldAdded} Gold${bonusNote} (saldo: ${this.lastGoldTotal})`);
      if (this.lastReward.aura) lines.push(`+${this.lastReward.aura} Aura (pódio!)`);
      for (const drop of this.lastReward.partsDropped) {
        lines.push(`Peça ganha: ${PART_SLOT_LABELS[drop.slot]} (${RARITY_LABELS[drop.rarity]})`);
      }
      for (const fusion of this.lastFusions) {
        lines.push(`Fusão! ${PART_SLOT_LABELS[fusion.slot]}: ${RARITY_LABELS[fusion.from]} → ${RARITY_LABELS[fusion.to]}`);
      }
      // Pendência do Claude-Manager.md §2.8/§5 item 3: avisa quando a fusão
      // automática mudou o que está de fato equipado (o jogador tinha
      // escolhido uma raridade específica, e ela foi toda consumida).
      for (const change of this.lastEquipChanges) {
        lines.push(`⚠ Peça equipada em ${PART_SLOT_LABELS[change.slot]} mudou: ${RARITY_LABELS[change.from]} → ${RARITY_LABELS[change.to]} (fusão)`);
      }
    }

    if (this.lastChampionshipPoints) {
      lines.push('');
      lines.push('— Campeonato de Construtores —');
      const playerPts = this.lastChampionshipPoints.player ?? 0;
      lines.push(playerPts > 0 ? `+${playerPts} pontos pra sua equipe` : 'Sem pontos nesta corrida (fora do top 10)');
      lines.push('Etapa concluída — ver classificação completa no Campeonato');
    }

    this.panel.add(this.add.text(24, 32, lines.join('\n'), { fontSize: '16px', color: '#fff', lineSpacing: 8 }));

    // altura ocupada pelo texto acima (aproximação por linha — fonte monoespaçada
    // o suficiente pra isso ser só uma estimativa de layout, não de medida exata)
    const textBottomY = 32 + lines.length * 24 + 24;
    this.showFeedbackPrompt(textBottomY);
    this.showBackToHubButton(textBottomY + 96);
  }

  /**
   * Botão pra voltar ao Hub (E-204) depois do resumo — fecha o loop
   * corrida→hub→corrida. Corridas de campeonato (sessão 15) voltam direto
   * pra tela do Campeonato em vez do Hub — é lá que o jogador vê a
   * classificação atualizada e o botão pra próxima etapa.
   */
  private showBackToHubButton(y: number): void {
    const label = this.isChampionshipRace ? 'Ver Campeonato' : 'Voltar ao Hub';
    const targetScene = this.isChampionshipRace ? 'ChampionshipScene' : 'HubScene';
    const btn = this.makeButton(24, y, CANVAS_WIDTH - 48, 44, label, 0x64b5f6, () => {
      this.scene.start(targetScene);
    });
    this.panel.add(btn);
  }

  /** "Quer jogar de novo?" 1-5, na tela de fim (T-108). */
  private showFeedbackPrompt(y: number): void {
    const feedbackContainer = this.add.container(0, 0);
    this.panel.add(feedbackContainer);
    feedbackContainer.add(this.add.text(24, y, 'Quer jogar de novo?', { fontSize: '14px', color: '#fff' }));

    const gap = 8;
    const btnW = (CANVAS_WIDTH - 48 - gap * 4) / 5;
    for (let score = 1; score <= 5; score++) {
      const x = 24 + (score - 1) * (btnW + gap);
      const btn = this.makeButton(x, y + 30, btnW, 40, String(score), 0xffd54f, () => {
        trackEvent('feedback_score', { trackId: this.track.id, score });
        feedbackContainer.removeAll(true);
        feedbackContainer.add(this.add.text(24, y, 'Valeu pelo feedback!', { fontSize: '14px', color: '#81c784' }));
      });
      feedbackContainer.add(btn);
    }
  }
}
