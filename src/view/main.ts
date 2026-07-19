import Phaser from 'phaser';
import { RaceScene } from './RaceScene.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';

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
  scene: [RaceScene],
});
