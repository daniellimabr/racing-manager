import type {
  RaceState, RaceEvent, Tier, BoostId, CarSetup, TrackDef,
  ResolveOptions, ResolveResult, RaceOutput,
} from './types.js';
import { buildEventSequence } from './track.js';
import { createGridSim, advanceGrid, deriveStandings } from './grid.js';
import type { GridStanding } from './grid.js';
import {
  GAIN, DAMAGE, NITRO_GOOD_BONUS, NITRO_BAD_RELIEF,
  REPAIR_BOOST_AMOUNT, ERROR_RECOVERY_RELIEF, PLAYER_GRID_PACE_SCALE,
  MISS_INSTANT_DNF_CHANCE_MIN, MISS_INSTANT_DNF_CHANCE_MAX, GOLD_CRASH_PENALTY,
  NOMINAL_LAP_SECONDS, RASANTE_BOOST_SCALE,
} from './constants.js';

/**
 * Unificação core/grid (sessão 11, ver Claude-Racing.md §3/§6 item 5): o grid
 * de 12 carros (`core/grid.ts`) é agora a ÚNICA fonte de verdade de "onde o
 * jogador está na corrida" — o jogador entra na simulação como mais um carro,
 * a partir do seu próprio `raceProgress` (não um pace fixo como as IAs).
 * `RaceState.position`/`gapToAhead` deixam de ser calculados por uma fórmula
 * escalar em paralelo (`POSITION_UNIT_SECONDS`, removida) — passam a ser só um
 * cache do último valor derivado daqui, atualizado em `resolveCurrent`.
 *
 * `cumulativeTime` do jogador no grid é `-raceProgress`: `raceProgress`
 * acumula ganho (positivo = mais rápido), enquanto no grid tempo MENOR =
 * carro mais à frente (mesma convenção já usada pelas IAs em `advanceGrid`,
 * que faz `cumulativeTime -= gain`) — os dois modelos já usavam a mesma
 * álgebra internamente (a view somava `-gainSeconds` no seu próprio
 * `playerCumulativeTime` para desenhar os ícones); agora é uma única fonte,
 * não duas contas equivalentes mantidas em paralelo.
 */
export function raceStandings(state: RaceState): GridStanding[] {
  return deriveStandings(state.grid, {
    id: 'player', label: 'Você', cumulativeTime: -state.raceProgress * PLAYER_GRID_PACE_SCALE,
  });
}

function derivePlayerStanding(state: RaceState): GridStanding {
  return raceStandings(state).find((s) => s.isPlayer)!;
}

export function createRace(
  track: TrackDef,
  setup: CarSetup,
  opts: { startProgress?: number; rng?: () => number } = {}
): RaceState {
  const raceProgress = opts.startProgress ?? 0;
  const state: RaceState = {
    track,
    events: buildEventSequence(track),
    eventIndex: 0,
    lap: 1,
    health: setup.healthMax,
    healthMax: setup.healthMax,
    position: 1, // recalculado abaixo, já com o grid pronto
    grid: createGridSim(opts.rng),
    raceProgress,
    gapToAhead: 0, // recalculado abaixo
    nitro: setup.nitroCharges,
    usedRevive: false,
    pendingBoost: null,
    overtakeAttempt: false,
    zoneScaleBase: setup.zoneScale,
    finished: false,
    dnf: false,
    goldPenalty: 0,
    lapTimes: [],
    currentLapGain: 0,
    log: [],
  };
  // posição/gap iniciais já refletem o startProgress (se houver), sem esperar
  // o 1º evento resolver — mesmo espírito do modelo escalar anterior.
  state.position = derivePlayerStanding(state).position;
  state.gapToAhead = computeGapToAhead(state);
  return state;
}

/**
 * Segundos de vantagem/atraso até o carro imediatamente à frente na
 * classificação (positivo = atrás, negativo = à frente) — derivado do grid a
 * cada chamada, nunca armazenado como um cálculo independente. Idêntico ao
 * que a HUD (`RaceScene.displayGap`, antes desta sessão) já calculava a partir
 * do grid — a duplicação era exatamente a divergência registrada em
 * Claude-Racing.md §3; agora existe 1 só lugar de verdade.
 */
function computeGapToAhead(state: RaceState): number {
  const standings = raceStandings(state);
  const player = standings.find((s) => s.isPlayer)!;
  if (player.position === 1) {
    const second = standings.find((s) => s.position === 2);
    return second ? -second.gapToLeader : 0; // líder: distância (negativa) até o 2º
  }
  const ahead = standings.find((s) => s.position === player.position - 1);
  return ahead ? player.gapToLeader - ahead.gapToLeader : 0;
}

export function currentEvent(state: RaceState): RaceEvent {
  return state.events[state.eventIndex];
}

/** Consome uma carga de nitro, se disponível. Chamar ANTES de resolveCurrent. */
export function tryUseNitro(state: RaceState): boolean {
  if (state.nitro <= 0) return false;
  state.nitro -= 1;
  return true;
}

export function setOvertakeAttempt(state: RaceState, attempt: boolean): void {
  state.overtakeAttempt = attempt;
}

/**
 * Aplica um boost escolhido (1x por volta). A maioria fica "pendente" até o
 * próximo evento não-saída (frenagem/pit) resolver — ver `resolveCurrent`.
 * `nitro_extra` é exceção: concede a carga na hora, não há nada a adiar.
 */
export function applyBoost(state: RaceState, boost: BoostId): void {
  if (boost === 'nitro_extra') {
    state.nitro += 1;
    return;
  }
  state.pendingBoost = boost;
}

/**
 * Resolve o desafio de timing atual dado o tier obtido, atualizando saúde,
 * gap (live-timing) e posição. Não avança o índice de evento — use advance().
 */
export function resolveCurrent(state: RaceState, tier: Tier, opts: ResolveOptions): ResolveResult {
  const ev = currentEvent(state);
  const isSaida = ev.kind === 'saida';

  let dmg = DAMAGE[tier];
  if (!isSaida && state.pendingBoost === 'freio') dmg = Math.round(dmg / 2);
  // sem arredondar aqui: com os valores baixos de DAMAGE (sessão 9, ex. green=1),
  // Math.round(1/2) virava 1 de novo — a saída deixava de aplicar "metade" de
  // verdade pra tiers de dano ímpar. `health` aceita fração; só a exibição arredonda.
  const appliedDmg = isSaida ? dmg / 2 : dmg;
  state.health = Math.max(0, state.health - appliedDmg);
  if (!isSaida && state.pendingBoost === 'reparo_rapido') {
    state.health = Math.min(state.healthMax, state.health + REPAIR_BOOST_AMOUNT);
  }

  let gain = GAIN[tier];
  if (opts.nitroUsed) gain = gain >= 0 ? gain * NITRO_GOOD_BONUS : gain * NITRO_BAD_RELIEF;
  if (!isSaida && gain < 0 && state.pendingBoost === 'recuperacao_erro') gain *= ERROR_RECOVERY_RELIEF;
  // Boost "rasante" (slipstream) — só se aplica na PRÓPRIA saída em que foi
  // escolhido (a única saída elegível a oferecer boost), não numa saída
  // futura — ver comentário completo em RASANTE_BOOST_SCALE (constants.ts).
  // Consumido na hora (diferente dos outros boosts, que ficam pendentes até
  // a próxima frenagem/pit e são limpos lá).
  if (isSaida && gain >= 0 && state.pendingBoost === 'rasante') {
    gain *= RASANTE_BOOST_SCALE;
    state.pendingBoost = null;
  }
  if (isSaida) gain *= 0.5;

  state.raceProgress += gain;
  // Tempo de volta (pedido do PO, sessão 12): soma o ganho/perda desde o
  // início da volta atual — fechado em `advance()` quando a volta muda.
  state.currentLapGain += gain;

  // Bug real encontrado na sessão 13 (Claude-Racing.md §3): `state.position`
  // só era atualizado em eventos não-saída — como toda corrida que termina
  // naturalmente termina numa saída (última curva da última volta), o campo
  // ficava sempre 1 evento desatualizado no fim de qualquer corrida (usado
  // por `tools/botHarness.ts` pra calcular posição média/vitórias/pódio).
  // Agora `state.position` é sempre recalculado; só a DETECÇÃO de
  // ultrapassagem (`positionChanged`, usada pra mensagem "ultrapassou!" e
  // telemetria) continua restrita a eventos não-saída — ultrapassagem só
  // acontece organicamente na frenagem/pit (CLAUDE.md), não faz sentido
  // reportar "ultrapassou" no meio de uma saída.
  const newPosition = derivePlayerStanding(state).position;
  let positionChanged: 'gained' | 'lost' | null = null;
  if (!isSaida) {
    if (newPosition < state.position) positionChanged = 'gained';
    else if (newPosition > state.position) positionChanged = 'lost';
    state.pendingBoost = null;
    state.overtakeAttempt = false;
  }
  state.position = newPosition;
  state.gapToAhead = computeGapToAhead(state);

  const message = `${gain >= 0 ? 'ganhou' : 'perdeu'} ${Math.abs(gain).toFixed(2)}s`;
  state.log.push(`volta ${ev.lap} · ${ev.cornerName ?? ev.kind} (${ev.kind}): ${tier} — ${message}`);

  // DNF instantâneo no "miss" — feedback do PO (Claude-Racing.md §2.26): um miss
  // é grave ("caixa de brita na hora"), não só perda de tempo. Chance cresce
  // conforme a saúde já está baixa neste ponto (após o dano deste evento).
  let instantCrash = false;
  if (tier === 'miss' && state.health > 0) {
    const healthFraction = state.health / state.healthMax;
    const chance = MISS_INSTANT_DNF_CHANCE_MIN
      + (MISS_INSTANT_DNF_CHANCE_MAX - MISS_INSTANT_DNF_CHANCE_MIN) * (1 - healthFraction);
    const rng = opts.rng ?? Math.random;
    instantCrash = rng() < chance;
  }

  if ((state.health <= 0 || instantCrash) && !state.dnf) {
    if (instantCrash) state.health = 0;
    state.dnf = true;
    state.dnfReason = (tier === 'red' || tier === 'miss') ? 'batida forte' : 'defeito no carro';
    // Penalidade de Gold só em crash de verdade ("batida forte"), não em
    // "defeito no carro" — preview da conexão com o Manager (M2), ver GOLD_CRASH_PENALTY.
    if (state.dnfReason === 'batida forte') state.goldPenalty += GOLD_CRASH_PENALTY;
  }

  return { tier, gainSeconds: gain, damage: appliedDmg, positionChanged, message };
}

/**
 * Avança para o próximo evento da corrida. Marca `finished` ao acabar a
 * pista. Também avança 1 tick a simulação do grid (as 11 IAs) — antes disso
 * era responsabilidade da view (`advanceGrid` chamado à parte, em lockstep,
 * depois de `advance()`); unificado aqui pra que o harness headless
 * (`tools/botHarness.ts`, que só chama `advance()`) ganhe a mesma simulação
 * de grid "de graça", sem precisar de nenhuma mudança no laço do harness.
 * `rng` é injetável (mesmo padrão de `resolveCurrent`) — default `Math.random`.
 */
export function advance(state: RaceState, rng: () => number = Math.random): void {
  // capturado ANTES do índice avançar: precisamos saber se o evento que
  // ACABOU de ser resolvido era uma saída, pra aplicar a mesma regra de
  // "metade do ganho" nas IAs (ver comentário de `advanceGrid` em grid.ts).
  const wasSaida = currentEvent(state).kind === 'saida';
  const finishedLap = currentEvent(state).lap;
  state.eventIndex += 1;
  if (state.eventIndex >= state.events.length) {
    state.finished = true;
  } else {
    state.lap = state.events[state.eventIndex].lap;
  }
  // Tempo de volta: a volta que acabou de ser percorrida fecha quando o
  // próximo evento pertence a outra volta (ou a corrida terminou). O evento
  // de pit tem `lap` igual à volta que ele encerra (ver track.ts), então o
  // tempo gasto no pit entra na volta em que ele aconteceu — coerente com
  // "volta do pit" ficando mais lenta em transmissões de corrida de verdade.
  if (state.finished || state.lap !== finishedLap) {
    state.lapTimes.push(NOMINAL_LAP_SECONDS - state.currentLapGain);
    state.currentLapGain = 0;
  }
  advanceGrid(state.grid, rng, wasSaida);
}

/** Volta à corrida após DNF, 1x por corrida, com metade da saúde. */
export function revive(state: RaceState): boolean {
  if (state.usedRevive) return false;
  state.usedRevive = true;
  state.dnf = false;
  state.dnfReason = undefined;
  state.health = Math.round(state.healthMax / 2);
  return true;
}

/**
 * Classificação de DNF (sessão 13, bug reportado pelo PO): a corrida não tem
 * como "deixar o resto do grid terminar sozinho" quando o jogador desiste
 * (a simulação dos 11 carros de IA só avança em lockstep com os eventos do
 * jogador — ver `advance()`), então usar a posição "ao vivo" congelada no
 * instante do abandono podia mostrar coisas sem sentido, tipo P1 pra quem
 * bateu e não terminou. Regra adotada: DNF sempre classifica em último lugar
 * — mais simples que simular o resto da corrida pras IAs, e alinhado com a
 * convenção real de corrida (não terminar é sempre pior que terminar).
 */
export function toRaceOutput(state: RaceState): RaceOutput {
  const lastPlace = state.grid.cars.length + 1; // 11 IAs + o jogador = 12 (ver core/grid.ts)
  return {
    position: state.dnf ? lastPlace : state.position,
    dnf: state.dnf,
    dnfReason: state.dnfReason,
    reviveUsed: state.usedRevive,
    lapsCompleted: state.finished ? state.track.laps : Math.max(0, state.lap - 1),
    events: state.log,
    goldPenalty: state.goldPenalty,
    lapTimes: state.lapTimes,
  };
}
