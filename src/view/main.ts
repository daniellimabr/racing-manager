import Phaser from 'phaser';
import pkg from '../../package.json';
import { RaceScene } from './RaceScene.js';
import { HubScene } from './HubScene.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { initPostHogFromEnv, track } from '../telemetry/analytics.js';

const sessionStart = Date.now();

// não bloqueia o boot do jogo atrás do round-trip do PostHog (meta de load <5s
// em 4G, Claude-Tech.md §3) — só dispara o session_start quando o sink real
// estiver configurado (ou de volta síncrono pro consoleSink, se offline)
initPostHogFromEnv().finally(() => {
  track('session_start', { platform: 'web', buildVersion: pkg.version });
});

window.addEventListener('pagehide', () => {
  track('session_end', { durationSec: Math.round((Date.now() - sessionStart) / 1000) });
});

new Phaser.Game({
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#111111',
  parent: 'game',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Hub (E-204) vira a tela inicial (CLAUDE.md §5) — antes o jogo ia direto
  // pra corrida; RaceScene continua registrada, só deixa de ser a 1ª cena.
  scene: [HubScene, RaceScene],
});
