import type { BoostId, Tier } from '../core/types.js';
export { DEFAULT_CAR_SETUP } from '../core/constants.js';
import { NOMINAL_LAP_SECONDS } from '../core/constants.js';

/** Constantes de "feel" da view (não fazem parte do core — são puramente de apresentação/input). */

export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 800;

/**
 * 78 → 108 → 78 de novo na sessão 15: a 2ª rodada tinha aberto uma linha
 * dedicada no HUD pros toggles de ultrapassagem/nitro; a 3ª rodada (feedback
 * do PO: aparência parecida com o painel de gaps + mais perto do botão do
 * desafio) moveu os toggles pra cima do painel inferior (`buildToggleButtons`,
 * perto de `PANEL_Y`) em vez do topo do HUD — não precisa mais da linha
 * extra aqui.
 */
export const HUD_HEIGHT = 78;
export const PANEL_HEIGHT = 220;
export const TRACK_RECT = {
  x: 10,
  y: HUD_HEIGHT,
  width: CANVAS_WIDTH - 20,
  height: CANVAS_HEIGHT - HUD_HEIGHT - PANEL_HEIGHT,
};

/**
 * tempo (ms) de uma volta completa do cursor (0 -> 100 -> 0) na barra de
 * timing — usado só no pit (sweep contínuo, T-105 não mudou isso). Reduzido
 * 900 → 700 na sessão 15 (pedido do PO: "cursor um pouco mais rápido", junto
 * com a redução de zona em ZONE_BASE_HALVES) — ~22% mais rápido, ajuste
 * moderado (o PO não pediu overshoot aqui, diferente das zonas).
 */
export const CURSOR_SWEEP_PERIOD_MS = 700;
/** tempo limite (ms) para apertar o botão antes de contar como "miss" automático — usado só no pit */
export const CHALLENGE_TIME_LIMIT_MS = 1500;

/**
 * ~~PRE_CHALLENGE_TIME_LIMIT_MS~~ — REMOVIDA na sessão 15. Era o timeout da
 * tela de decisão bloqueante de ultrapassagem/nitro (3000ms, expira -> "não"),
 * que passou a existir por causa do bug registrado em Claude-Racing.md §2.22
 * ("a tela de decisão pausava indefinidamente"). Essa tela em si não existe
 * mais — ultrapassagem/nitro viraram toggle-buttons persistentes no HUD
 * (`overtakeToggleOn`/`nitroToggleOn`, RaceScene.ts), sempre disponíveis, sem
 * nenhuma decisão bloqueante a resolver — o problema que este timeout
 * corrigia deixou de existir pela raiz, não só o sintoma. Também era, em
 * parte, a causa de o "bullet time" ligar cedo demais e durar longo demais
 * (pedido do PO nesta sessão): o carro desacelerava assim que a tela de
 * decisão aparecia, bem antes do desafio de timing em si começar.
 */

/**
 * T-105 (proposta CSR2, validada na demo greybox — ver Claude-Racing.md §2.10):
 * frenagem e aceleração deixam de usar o vaivém contínuo e passam a ser uma
 * única passagem (0->100) representando a aproximação/aceleração, não mais
 * um cursor oscilando indefinidamente.
 *
 * Reduzido 1300 → 1000 na sessão 15 (pedido do PO: "cursor um pouco mais
 * rápido", junto com ZONE_BASE_HALVES menor) — ~23% mais rápido, ajuste
 * moderado (pedido explicitamente como "um pouco", não um overshoot agressivo
 * como as zonas).
 */
export const RAMP_DURATION_MS = 1000;
/** centro da zona ideal na aceleração — perto do fim do percurso (limite de grip), não no meio */
export const ACCEL_CENTER = 75;
export const BRAKE_CENTER = 50;

/**
 * Largada: "segurar para controlar" a agulha até o sinal, não um toque de
 * reação. Velocidade reduzida na sessão 14 (pedido do PO: "o cursor tem uma
 * velocidade alta demais... um pouco mais lenta, um pouco elástica pra
 * conseguir manter o cursor dentro do roxo") — 0.16/0.10 → 0.10/0.065
 * (~35-40% mais lento), preservando a proporção subida:descida. "Elástica"
 * não virou física de mola de verdade nesta sessão — só desacelerado; o PO já
 * sinalizou que este mecanismo inteiro vai passar por um revamp quando a
 * Trilha 3 (UI/FX) entrar, então física de mola de verdade fica pra lá.
 */
export const LARGADA_PREP_MS = 1500;
export const LARGADA_LIGHT_INTERVAL_MS = 500;
export const LARGADA_HOLD_MIN_MS = 300;
export const LARGADA_HOLD_MAX_MS = 700;
export const LARGADA_HOLD_RATE = 0.10; // unidades/ms subindo enquanto segura
export const LARGADA_FALL_RATE = 0.065; // unidades/ms caindo quando solta

/**
 * Compensa o cursor mais lento/controlável: zona roxa/verde só da largada
 * fica mais estreita que o resto do jogo (ZONE_BASE_HALVES, core/constants.ts
 * — compartilhado por frenagem/aceleração/pit, que o PO já confirmou estar na
 * medida certa e não deve ser tocado). Multiplica a escala calculada por
 * `computeScale()` só na largada, ver `startTimingChallenge` (RaceScene.ts).
 */
export const LARGADA_ZONE_SCALE = 0.7;
/**
 * Pausa de ritmo (não mais duração de tween — ver nota da sessão 15 abaixo)
 * entre resolver um evento e mostrar a decisão do próximo, dando tempo de ler
 * o resultado antes da próxima tela aparecer (T-104: 0,8–1,2s por trecho).
 */
export const TWEEN_DURATION_MS = 1000;

/**
 * Reformulação da animação da corrida (sessão 15, feedback do PO: "o visual
 * dos carros parados na pista é bem ruim, fica parecendo um jogo de trivia").
 *
 * Tentativa inicial (perseguir um alvo fixo — a posição do evento atual —
 * com suavização exponencial, só variando a velocidade de perseguição por
 * `bulletTime`) não resolvia o problema de verdade: o alvo fica PARADO
 * durante toda a decisão (só muda quando `advance()` roda), e a fase normal
 * (rápida) já alcançava esse alvo bem antes do desafio começar — resultado:
 * o carro chegava e ficava parado do mesmo jeito, só que com um pequeno
 * "ease-in" na chegada. Verificado visualmente (Playwright, sessão 15):
 * ícones idênticos em screenshots tiradas 500ms+ à parte durante o passo de
 * decisão (nitro/overtake).
 *
 * Modelo corrigido: o jogador tem uma posição visual contínua
 * (`RaceScene.visualPlayerT`) que sempre avança para frente, todo frame, na
 * direção do PRÓXIMO evento (`state.events[eventIndex+1]`, espiado com
 * antecedência — a sequência de eventos é pré-computada) — nunca fica parada
 * enquanto o desafio atual não resolve, só desacelera. `LEG_PROGRESS_CAP`
 * trava o avanço perto (não em cima) da marca do próximo evento, pra nunca
 * "chegar e passar" antes de `advance()` de fato commitar essa transição —
 * sem isso, uma cadeia de decisões muito longa (múltiplos timeouts em
 * sequência) poderia fazer o ícone ultrapassar visualmente curvas que ainda
 * nem começaram. Como a progressão é recalculada do zero a cada frame a
 * partir da distância até o evento atual (não um contador incremental
 * separado), a transição de uma etapa pra próxima (`advance()`) não precisa
 * de nenhum reset explícito — ela simplesmente continua de onde estava.
 *
 * Os outros 11 carros do grid continuam posicionados por deslocamento de gap
 * em relação a essa mesma referência contínua do jogador (mesmo modelo de
 * sempre) — o pelotão inteiro "anda junto" com o crawl do jogador.
 *
 * Recalibrado na mesma sessão, 2ª rodada de feedback do PO: com as telas de
 * decisão de ultrapassagem/nitro removidas (viraram toggles — ver
 * PRE_CHALLENGE_TIME_LIMIT_MS acima), o tempo em velocidade normal antes do
 * bullet time ligar ficou bem mais curto e prévisível (~1,7s: banner de
 * resultado + pausa de ritmo, `TWEEN_DURATION_MS`). "Os carros dão um dash
 * muito rápido" — 0,00005 cruzava uma perna típica em ~1s, chegando ANTES do
 * bullet time começar e ficando parado esperando; reduzido pra 0,00003
 * (~1,7s por perna típica) pra terminar de chegar bem na hora em que o
 * bullet time assume, sem sobra de tempo parado nem chegada "correndo".
 */
export const NORMAL_LEG_SPEED_T_PER_MS = 0.00003;
/** Quanto maior, mais lento o "bullet time" (divide a velocidade normal de avanço durante a decisão/desafio ativo). */
export const BULLET_TIME_SLOWDOWN = 10;
/** Fração máxima da distância até o teto (`MAX_VISUAL_OVERSHOOT_T`) que o avanço contínuo pode cobrir antes de `advance()` commitar a transição (nunca chega a 100%, evita "ultrapassar" visualmente o próprio teto). */
export const LEG_PROGRESS_CAP = 0.95;

/**
 * Sessão 15, 3ª rodada (feedback do PO: "os carros ainda estão parando no
 * mapa, aguardando o input do desafio"): mirar só no PRÓXIMO evento
 * (`eventIndex+1`) não bastava — pra qualquer curva, a perna frenagem→saída
 * (mesma curva) é bem curta (só 0,5 de 20 `pathIndex`, ~2,5% da volta), e o
 * avanço batia no teto em bem menos de 1s, ficando parado o resto da espera.
 * A correção original (`EVENT_LOOKAHEAD_STEPS`, mirar N eventos à frente em
 * vez de só o próximo) resolvia o "parado" trocando o alvo por um evento bem
 * mais à frente — mas "N eventos" é uma distância que varia MUITO conforme a
 * pista (em Interlagos, mais curvas por volta = eventos mais próximos entre
 * si; curvas combinadas/curadas como 1 desafio só mudam a densidade também).
 * Isso é exatamente a causa raiz do bug reportado 3x pelo PO em sessões
 * seguintes ("carro aparece bem mais à frente da curva anunciada no desafio
 * e no HUD"): com N=4, o avanço contínuo tinha permissão de cobrir até 95%
 * da distância até um evento 4 passos à frente do atual — em pistas com
 * curvas mais densas, isso já passava visualmente de 1-2 curvas reais, então
 * o ícone ficava adiantado do desafio/rótulo (que sempre reflete o evento
 * ATUAL, ainda não resolvido), não só percepção.
 *
 * Fix de verdade: desacoplar "quanto o avanço pode cobrir" de "quantos
 * eventos existem pela frente" — usar um teto FIXO em fração da volta
 * (`MAX_VISUAL_OVERSHOOT_T`), pequeno o suficiente pra o ícone nunca sair
 * visualmente da vizinhança da curva sendo desafiada, mas maior que a perna
 * degenerada frenagem→saída da mesma curva (~0,025 da volta) pra continuar
 * dando "fôlego" de animação nesse caso sem precisar espiar `state.events`
 * nenhuma distância à frente. `advance()` continua sendo o único ponto que
 * de fato "commita" a posição.
 */
export const MAX_VISUAL_OVERSHOOT_T = 0.035;
/** Meia-vida (ms) da suavização de polimento por ícone — absorve saltos pequenos de gap entre carros (ex.: ultrapassagem registrada no grid), não representa mais a velocidade geral do crawl (isso agora é NORMAL_LEG_SPEED_T_PER_MS/BULLET_TIME_SLOWDOWN). */
export const VISUAL_CATCHUP_HALFLIFE_MS = 220;

/**
 * Tempo (ms) entre o desafio aparecer na tela (rótulo + barra visíveis, cursor
 * parado na posição inicial) e o cursor começar de fato a se mover — dá tempo
 * de LER qual curva/tipo de desafio é antes de precisar reagir. Feedback de um
 * dos irmãos do PO (Claude-Racing.md §2.28): o cursor começava a andar (e o
 * timer de miss já contava) no mesmo instante em que o desafio aparecia, sem
 * nenhuma janela de leitura. O irmão sugeriu um modelo de "2 toques" (1º inicia
 * o desafio, 2º tenta acertar); o PO escolheu deliberadamente a solução mais
 * simples — só atrasar o início do movimento — mantendo a interação em 1
 * toque só. Aplica-se a `ramp` (frenagem/aceleração) e `sweep` (pit); a
 * largada já tinha seu próprio "PREPARE-SE" (LARGADA_PREP_MS, 1500ms) desde o
 * T-105 e não foi alterada — é um princípio parecido, mecanismo diferente.
 * 600ms escolhido por sensação (dá pra ler um rótulo curto como "Eau
 * Rouge/Raidillon — ponto de frenagem (1/2)" sem alongar demais a cadência de
 * ~150 eventos/corrida — 600ms × 150 ≈ 90s extra numa corrida de ~5min,
 * aceitável; bem mais curto que o LARGADA_PREP_MS porque este se repete a
 * cada desafio, não só 1x por corrida).
 */
export const CHALLENGE_PREP_MS = 600;

/**
 * Conversão de segundos de gap em fração do traçado, para posicionar os
 * carros do grid num "pelotão" visualmente coerente (modelo 1D, sem física —
 * ver risco "escopo do grid" em Claude-Tech.md §9). ~5 min / 8 voltas.
 * Reaproveita `NOMINAL_LAP_SECONDS` (core/constants.ts) — mesmo número, agora
 * também é a base do cálculo de tempo de volta real (sessão 12), pra não ter
 * 2 "volta nominal" desencontradas entre core e view.
 */
export const SECONDS_PER_LAP_VISUAL = NOMINAL_LAP_SECONDS;
export const MAX_VISUAL_GAP_SECONDS = SECONDS_PER_LAP_VISUAL * 0.9;

/**
 * Nº de eventos resolvidos até o gap de largada (grid) passar a valer 100%
 * como distância visual na pista (ver comentário em `tickVisualPositions`,
 * RaceScene.ts) — antes disso, o gap é aplicado em rampa linear
 * (`eventIndex / GRID_GAP_RAMP_EVENTS`), não tudo de uma vez no evento 0.
 * 8 cobre aproximadamente as 2 primeiras curvas curadas (frenagem+saída ×2)
 * depois da largada — dá tempo do pelotão "descolar" visualmente aos poucos,
 * como um grid de largada de verdade, em vez de saltar pro gap de
 * classificação inteiro (até ~4,4s num grid de 12) assim que o 1º evento
 * resolve.
 */
export const GRID_GAP_RAMP_EVENTS = 8;

export const TIER_COLORS: Record<Tier, number> = {
  purple: 0xb266ff,
  green: 0x2ecc71,
  amber: 0xf1c40f,
  red: 0xe74c3c,
  miss: 0x555555,
};

export const BOOST_LABELS: Record<BoostId, string> = {
  pneu: 'Bono, My Tyres',
  freio: 'Freio reforçado',
  janela: 'Janela ampliada',
  reparo_rapido: 'Reparo rápido',
  nitro_extra: 'Nitro extra',
  recuperacao_erro: 'Recuperação de erro',
  rasante: 'Rasante',
  folego_ultrapassagem: 'Fôlego de ultrapassagem',
};

/** Feedback de playtest do PO: os nomes dos boosts não deixavam claro o efeito (Claude-Racing.md §2.21). */
export const BOOST_DESCRIPTIONS: Record<BoostId, string> = {
  pneu: 'Aumenta a zona verde/roxa na próxima frenagem/pit',
  freio: 'Reduz o dano se errar a próxima frenagem/pit',
  janela: 'Mais tempo de reação no próximo desafio de frenagem/pit',
  reparo_rapido: 'Recupera saúde na próxima frenagem/pit resolvida',
  nitro_extra: '+1 carga de nitro, concedida na hora',
  recuperacao_erro: 'Reduz a perda de tempo do seu próximo erro (vermelho/miss)',
  rasante: 'Pega o rastro nesta saída: +25% no ganho, se já for positivo',
  folego_ultrapassagem: 'Facilita tentar ultrapassagem na próxima frenagem/pit (gap máximo maior)',
};

/** Boost "janela ampliada": fator de aumento no tempo disponível do próximo desafio de frenagem/pit. */
export const JANELA_DURATION_SCALE = 1.3;

export const TEAM_COLORS: Record<string, number> = {
  player: 0xffdd33,
  alpha: 0xff5566,
  bravo: 0x55dd88,
  charlie: 0xffaa33,
  delta: 0x7788ff,
  echo: 0xcc66ff,
};

export const DEFAULT_PIT_CREW_QUALITY = 0.5;
