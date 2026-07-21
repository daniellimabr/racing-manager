import Phaser from 'phaser';
import { loadGame, markTutorialSeen } from '../persistence/gameSave.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './viewConstants.js';
import { juice } from './juice.js';

interface TutorialPage {
  title: string;
  lines: string[];
}

/**
 * Tela de instrução estática (Opção A, pedido do PO, sessão 12) — 3 páginas
 * curtas explicando a mecânica antes da 1ª corrida. Aparece automaticamente
 * na 1ª vez que o Hub carrega (save novo, `hasSeenTutorial = false`) e fica
 * disponível a qualquer momento via botão "Como jogar" no Hub.
 *
 * Decisão do PO (não a opção B/C consideradas): tela estática com texto
 * curto, sem tutorial interativo — o público de teste atual (PO + irmãos)
 * ainda recebe explicação verbal antes de jogar, então o ganho de um
 * tutorial guiado/contextual mais caro é baixo por ora.
 */
const PAGES: TutorialPage[] = [
  {
    title: 'Como jogar — 1/3',
    lines: [
      'Você é o piloto titular da equipe.',
      'Nas saídas e frenagens, uma barra',
      'colorida aparece com um cursor',
      'se movendo. Toque em TOCAR na',
      'hora certa pra acertar a zona.',
    ],
  },
  {
    title: 'As zonas — 2/3',
    lines: [
      'Roxo = perfeito. Verde = bom.',
      'Amarelo = ok. Vermelho = erro,',
      'perde tempo e saúde. Miss (não',
      'tocar a tempo) é grave — pode',
      'causar batida na hora.',
    ],
  },
  {
    title: 'Saída, frenagem e saúde — 3/3',
    lines: [
      'Saída define a velocidade até a',
      'próxima curva. Frenagem tem 2',
      'etapas: ponto de freada + duração.',
      'KERS (saída) e Magic (frenagem)',
      'melhoram um resultado bom.',
      'Saúde zerada = DNF. Boa corrida!',
    ],
  },
];

export class TutorialScene extends Phaser.Scene {
  private pageIndex = 0;
  private contentContainer!: Phaser.GameObjects.Container;

  constructor() {
    super('TutorialScene');
  }

  init(): void {
    this.pageIndex = 0;
  }

  create(): void {
    this.add.rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 0x14161a).setOrigin(0, 0);
    this.contentContainer = this.add.container(0, 0);
    this.input.once('pointerdown', () => juice.unlock());
    this.renderPage();
  }

  private renderPage(): void {
    this.contentContainer.removeAll(true);
    const page = PAGES[this.pageIndex];

    this.contentContainer.add(this.add.text(CANVAS_WIDTH / 2, 100, page.title, {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5));

    const bodyText = page.lines.join('\n');
    this.contentContainer.add(this.add.text(CANVAS_WIDTH / 2, 220, bodyText, {
      fontSize: '17px', color: '#cccccc', align: 'center', lineSpacing: 12,
    }).setOrigin(0.5, 0));

    // indicador de página (bolinhas)
    const dotsY = CANVAS_HEIGHT - 220;
    const dotSpacing = 20;
    const startX = CANVAS_WIDTH / 2 - ((PAGES.length - 1) * dotSpacing) / 2;
    for (let i = 0; i < PAGES.length; i++) {
      const dot = this.add.circle(startX + i * dotSpacing, dotsY, 4, i === this.pageIndex ? 0xffd54f : 0x444a52);
      this.contentContainer.add(dot);
    }

    const isLastPage = this.pageIndex === PAGES.length - 1;
    const btnY = CANVAS_HEIGHT - 160;
    const btnW = CANVAS_WIDTH - 48;

    const mainBtn = this.makeButton(24, btnY, btnW, 56, isLastPage ? 'Vamos correr!' : 'Próximo', 0x2ecc71, () => {
      if (isLastPage) this.finish();
      else { this.pageIndex++; this.renderPage(); }
    });
    this.contentContainer.add(mainBtn);

    if (!isLastPage) {
      const skipBtn = this.makeButton(24, btnY + 68, btnW, 40, 'Pular tutorial', 0x2a2e34, () => this.finish());
      this.contentContainer.add(skipBtn);
    }
  }

  private makeButton(
    x: number, y: number, w: number, h: number, label: string, color: number, onClick: () => void
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, color, 1).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    const text = this.add.text(w / 2, h / 2, label, { fontSize: '14px', color: '#111111', fontStyle: 'bold' })
      .setOrigin(0.5);
    bg.on('pointerdown', () => {
      juice.click();
      onClick();
    });
    c.add([bg, text]);
    return c;
  }

  private finish(): void {
    const save = loadGame();
    markTutorialSeen(save);
    this.scene.start('HubScene');
  }
}
