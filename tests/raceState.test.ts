import { describe, it, expect } from 'vitest';
import { createRace, currentEvent, resolveCurrent, advance, revive, tryUseNitro, toRaceOutput, applyBoost, raceStandings } from '../src/core/raceState.js';
import {
  REPAIR_BOOST_AMOUNT, DAMAGE, GAIN, GOLD_CRASH_PENALTY, PLAYER_GRID_PACE_SCALE,
  MISS_INSTANT_DNF_CHANCE_MIN, MISS_INSTANT_DNF_CHANCE_MAX, NOMINAL_LAP_SECONDS,
} from '../src/core/constants.js';
import type { TrackDef, CarSetup, RaceState } from '../src/core/types.js';

const track: TrackDef = {
  id: 'test', name: 'Test Track', laps: 2, pitAfterLap: 1,
  path: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0.5 }],
  pitPathIndex: 2,
  corners: [{ id: 'c1', name: 'Curva 1', pathIndex: 0 }, { id: 'c2', name: 'Curva 2', pathIndex: 1 }],
};
const setup: CarSetup = { zoneScale: 1, healthMax: 100, nitroCharges: 1 };

/**
 * Helper de teste (sessão 11, unificação core/grid — ver Claude-Racing.md §3
 * /§6 item 5): manda todos os 11 carros de IA pra bem longe (não influenciam
 * mais nada do teste) e planta exatamente 1 "rival" a um tempo conhecido —
 * dá um cenário 100% determinístico de gap/posição, independente de
 * jitter/RNG do grid e à prova de futuras recalibrações de `AI_TEAMS`
 * (`core/grid.ts`), diferente de tentar prever a ordem exata dos 11 carros.
 *
 * Também sincroniza `s.position` com o cenário recém-plantado: `position` só
 * é recalculado dentro de `resolveCurrent` (em eventos não-saída) — sem isso,
 * o teste compararia o resultado contra um `position` desatualizado (o que a
 * grid tinha ANTES de plantarmos o rival), o que já mascarou um teste com o
 * resultado certo pelo motivo errado numa 1ª versão desta função.
 */
function pinRival(s: RaceState, rivalId: string, rivalCumulativeTime: number): void {
  for (const car of s.grid.cars) s.grid.cumulativeTime[car.id] = 1000;
  s.grid.cumulativeTime[rivalId] = rivalCumulativeTime;
  const playerTime = -s.raceProgress * PLAYER_GRID_PACE_SCALE; // mesma fórmula de raceStandings()
  s.position = rivalCumulativeTime < playerTime ? 2 : 1; // só 1 rival de verdade neste cenário
}

describe('createRace', () => {
  it('inicializa com saúde cheia e sem DNF', () => {
    const s = createRace(track, setup);
    expect(s.health).toBe(100);
    expect(s.dnf).toBe(false);
    expect(currentEvent(s).kind).toBe('saida'); // largada
  });
});

describe('resolveCurrent — gap e posição (unificadas com o grid, sessão 11)', () => {
  it('resultado perfeito reduz o gap mas também desgasta a saúde (decisão do PO, Claude-Racing.md §2.14)', () => {
    const s = createRace(track, setup);
    advance(s); // sai da largada, vai para 1ª frenagem
    const before = s.gapToAhead;
    const r = resolveCurrent(s, 'purple', { nitroUsed: false });
    expect(s.gapToAhead).toBeLessThan(before);
    expect(r.damage).toBeGreaterThan(0);
  });

  it('ultrapassagem acontece quando o progresso do jogador cruza o tempo do carro diretamente à frente', () => {
    const s = createRace(track, setup);
    advance(s); // 1ª frenagem
    pinRival(s, 'alpha-1', -0.15); // único rival de verdade: 0,15s à frente do jogador (tempo 0)
    const r = resolveCurrent(s, 'purple', { nitroUsed: false }); // ganha 0.30s (frenagem, sem meio-dano de saída) — cruza os 0,15s
    expect(r.positionChanged).toBe('gained');
    expect(s.gapToAhead).toBeLessThan(0); // agora à frente do rival
  });

  it('ser ultrapassado acontece quando o jogador perde tempo e o rival (antes atrás) volta a ficar à frente', () => {
    const s = createRace(track, setup);
    advance(s);
    pinRival(s, 'alpha-1', 0.10); // rival 0,10s atrás — jogador lidera por enquanto
    const r = resolveCurrent(s, 'miss', { nitroUsed: false }); // perde 0.40s — passa a ficar atrás do rival
    expect(r.positionChanged).toBe('lost');
    expect(s.gapToAhead).toBeGreaterThan(0); // agora atrás do rival
  });

  it('a posição inicial já reflete o startProgress (sem esperar o 1º evento)', () => {
    // vantagem bem maior que o espalhamento inicial do grid (~±2,4s, ver core/grid.ts)
    // garante virar líder (ou último) na criação, sem precisar de nenhum evento resolvido.
    const ahead = createRace(track, setup, { startProgress: 10 });
    expect(ahead.position).toBe(1);

    const behind = createRace(track, setup, { startProgress: -10 });
    expect(behind.position).toBe(12);
  });

  it('nitro melhora um resultado bom em +10% e reduz a penalidade de um erro', () => {
    const s1 = createRace(track, setup);
    advance(s1);
    const withNitro = resolveCurrent(s1, 'purple', { nitroUsed: true });

    const s2 = createRace(track, setup);
    advance(s2);
    const withoutNitro = resolveCurrent(s2, 'purple', { nitroUsed: false });

    expect(withNitro.gainSeconds).toBeCloseTo(withoutNitro.gainSeconds * 1.10, 5);

    const s3 = createRace(track, setup);
    advance(s3);
    const missNitro = resolveCurrent(s3, 'miss', { nitroUsed: true });
    const s4 = createRace(track, setup);
    advance(s4);
    const missNoNitro = resolveCurrent(s4, 'miss', { nitroUsed: false });
    expect(Math.abs(missNitro.gainSeconds)).toBeLessThan(Math.abs(missNoNitro.gainSeconds));
  });
});

describe('saúde e DNF', () => {
  it('saúde some após falhas seguidas e dispara DNF', () => {
    const s = createRace(track, setup);
    advance(s);
    for (let i = 0; i < 20 && !s.dnf; i++) resolveCurrent(s, 'miss', { nitroUsed: false });
    expect(s.dnf).toBe(true);
    expect(s.dnfReason).toBe('batida forte');
    expect(s.goldPenalty).toBe(GOLD_CRASH_PENALTY); // penalidade só é aplicada 1x (sessão 9, §2.26)
  });

  it('revive só funciona 1x por corrida e restaura metade da saúde', () => {
    const s = createRace(track, setup);
    advance(s);
    for (let i = 0; i < 20 && !s.dnf; i++) resolveCurrent(s, 'miss', { nitroUsed: false });
    expect(revive(s)).toBe(true);
    expect(s.health).toBe(50);
    expect(s.dnf).toBe(false);

    for (let i = 0; i < 20 && !s.dnf; i++) resolveCurrent(s, 'miss', { nitroUsed: false });
    expect(s.dnf).toBe(true);
    expect(revive(s)).toBe(false); // já usou
  });
});

describe('DNF instantâneo no miss + penalidade de gold (sessão 9, Claude-Racing.md §2.26)', () => {
  it('miss pode causar DNF instantâneo mesmo com saúde alta, se o rng cair abaixo da chance', () => {
    const s = createRace(track, setup); // saúde cheia
    advance(s);
    resolveCurrent(s, 'miss', { nitroUsed: false, rng: () => 0 }); // rng sempre "acerta" o crash
    expect(s.dnf).toBe(true);
    expect(s.dnfReason).toBe('batida forte');
    expect(s.health).toBe(0);
    expect(s.goldPenalty).toBe(GOLD_CRASH_PENALTY);
  });

  it('miss não causa DNF instantâneo se o rng cair acima da chance máxima', () => {
    const s = createRace(track, setup);
    advance(s);
    resolveCurrent(s, 'miss', { nitroUsed: false, rng: () => 0.999 }); // acima de MISS_INSTANT_DNF_CHANCE_MAX
    expect(s.dnf).toBe(false);
    expect(s.goldPenalty).toBe(0);
  });

  it('a chance de DNF instantâneo cresce conforme a saúde já está baixa', () => {
    // rng calculado a partir das próprias constantes (não mais um valor mágico fixo,
    // ex. 0.3) — um número hardcoded quebra silenciosamente toda vez que
    // MISS_INSTANT_DNF_CHANCE_MIN/MAX é recalibrado (aconteceu nesta sessão: 0.08/0.5 ->
    // 0.04/0.28 fez esse teste específico falhar). O ponto médio entre a chance da saúde
    // cheia e a chance da saúde baixa continua válido pra qualquer valor futuro de MIN/MAX.
    const chanceAtHealth = (healthBeforeDamage: number) => {
      const healthAfterDamage = Math.max(0, healthBeforeDamage - DAMAGE.miss); // evento é frenagem = dano cheio
      const fraction = healthAfterDamage / setup.healthMax;
      return MISS_INSTANT_DNF_CHANCE_MIN + (MISS_INSTANT_DNF_CHANCE_MAX - MISS_INSTANT_DNF_CHANCE_MIN) * (1 - fraction);
    };
    const fullHealthChance = chanceAtHealth(setup.healthMax);
    const lowHealthChance = chanceAtHealth(30);
    const rng = () => (fullHealthChance + lowHealthChance) / 2;

    const sFull = createRace(track, setup); // saúde cheia
    advance(sFull);
    resolveCurrent(sFull, 'miss', { nitroUsed: false, rng });
    expect(sFull.dnf).toBe(false); // saúde alta -> chance baixa -> rng não "acerta"

    const sLow = createRace(track, setup);
    sLow.health = 30; // bem danificado
    advance(sLow);
    resolveCurrent(sLow, 'miss', { nitroUsed: false, rng });
    expect(sLow.dnf).toBe(true); // saúde baixa -> chance mais alta -> o mesmo rng agora "acerta"
  });

  it('DNF por "defeito no carro" (não crash) não aplica penalidade de gold', () => {
    const s = createRace(track, setup);
    advance(s);
    for (let i = 0; i < 100 && !s.dnf; i++) resolveCurrent(s, 'amber', { nitroUsed: false });
    expect(s.dnf).toBe(true);
    expect(s.dnfReason).toBe('defeito no carro');
    expect(s.goldPenalty).toBe(0);
  });
});

describe('saída aplica metade do dano, sem arredondar (regressão da sessão 9, §2.26)', () => {
  it('resolve a largada (saída) com metade exata do dano cheio do tier', () => {
    const s = createRace(track, setup); // currentEvent já é a largada (saída)
    const before = s.health;
    const r = resolveCurrent(s, 'green', { nitroUsed: false });
    expect(r.damage).toBeCloseTo(DAMAGE.green / 2, 5);
    expect(s.health).toBeCloseTo(before - DAMAGE.green / 2, 5);
  });
});

describe('classificação de DNF + staleness de position (sessão 13, bug reportado pelo PO)', () => {
  it('state.position fica sempre atualizado, mesmo em eventos de saída', () => {
    const s = createRace(track, setup);
    expect(currentEvent(s).kind).toBe('saida'); // largada
    resolveCurrent(s, 'purple', { nitroUsed: false });
    const live = raceStandings(s).find((x) => x.isPlayer)!.position;
    expect(s.position).toBe(live); // antes do fix, ficava travado no valor de antes de resolver
  });

  it('RaceOutput.position força último lugar quando a corrida termina em DNF', () => {
    const s = createRace(track, setup); // saúde cheia
    advance(s);
    resolveCurrent(s, 'miss', { nitroUsed: false, rng: () => 0 }); // DNF instantâneo garantido
    expect(s.dnf).toBe(true);
    const output = toRaceOutput(s);
    expect(output.position).toBe(12); // 11 IAs + o jogador
  });

  it('RaceOutput.position usa a posição real (não força nada) quando a corrida termina normalmente', () => {
    const s = createRace(track, setup);
    let guard = 0;
    while (!s.finished && !s.dnf && guard < 1000) {
      resolveCurrent(s, 'purple', { nitroUsed: false });
      advance(s);
      guard++;
    }
    const output = toRaceOutput(s);
    const live = raceStandings(s).find((x) => x.isPlayer)!.position;
    expect(output.dnf).toBe(false);
    expect(output.position).toBe(live);
  });
});

describe('tempo de volta (sessão 12, pedido do PO)', () => {
  it('fecha a 1ª volta ao entrar na 2ª, com o tempo = nominal menos o ganho acumulado (inclui o pit, que conta pra volta em que aconteceu)', () => {
    const s = createRace(track, setup);
    // pista de teste: largada(saida,lap1) -> frenagem/saida c1(lap1) -> frenagem/saida c2(lap1,boost) -> pit(lap1) -> ...lap2
    let guard = 0;
    while (s.lap === 1 && !s.finished && guard < 20) {
      resolveCurrent(s, 'green', { nitroUsed: false });
      advance(s);
      guard++;
    }
    expect(s.lapTimes.length).toBe(1);
    // largada(saida,0.5x) + frenagem c1 + saida c1(0.5x) + frenagem c2 + saida c2(0.5x) + pit(cheio) = 3x cheio + 3x meio
    const expectedGain = GAIN.green * 3 + GAIN.green * 0.5 * 3;
    expect(s.lapTimes[0]).toBeCloseTo(NOMINAL_LAP_SECONDS - expectedGain, 5);
    expect(s.currentLapGain).toBe(0); // zera pra próxima volta
  });

  it('fecha a última volta também quando a corrida termina, e RaceOutput.lapTimes bate com o nº de voltas', () => {
    const s = createRace(track, setup);
    let guard = 0;
    while (!s.finished && guard < 1000) {
      resolveCurrent(s, 'green', { nitroUsed: false });
      advance(s);
      guard++;
    }
    expect(s.lapTimes.length).toBe(track.laps);
    const output = toRaceOutput(s);
    expect(output.lapTimes).toEqual(s.lapTimes);
  });

  it('não fecha volta nenhuma antes da 1ª transição de volta (currentLapGain só acumula)', () => {
    const s = createRace(track, setup);
    resolveCurrent(s, 'purple', { nitroUsed: false }); // ainda a largada, sem advance()
    expect(s.lapTimes.length).toBe(0);
    expect(s.currentLapGain).toBeCloseTo(GAIN.purple * 0.5, 5);
  });
});

describe('nitro', () => {
  it('só pode usar se houver carga disponível', () => {
    const s = createRace(track, setup); // 1 carga
    expect(tryUseNitro(s)).toBe(true);
    expect(s.nitro).toBe(0);
    expect(tryUseNitro(s)).toBe(false);
  });
});

describe('boosts (sessão 5)', () => {
  it('nitro_extra concede 1 carga na hora, sem virar pendingBoost', () => {
    const s = createRace(track, setup); // 1 carga
    applyBoost(s, 'nitro_extra');
    expect(s.nitro).toBe(2);
    expect(s.pendingBoost).toBeNull();
  });

  it('reparo_rapido recupera saúde na próxima frenagem/pit (não na saída)', () => {
    const s = createRace(track, setup);
    s.health = 50;
    applyBoost(s, 'reparo_rapido');
    advance(s); // vai para a 1ª frenagem
    resolveCurrent(s, 'amber', { nitroUsed: false }); // amber: DAMAGE.amber de dano, +REPAIR_BOOST_AMOUNT de cura
    expect(s.health).toBe(50 - DAMAGE.amber + REPAIR_BOOST_AMOUNT);
  });

  it('reparo_rapido não deixa a saúde passar do máximo', () => {
    const s = createRace(track, setup); // saúde cheia (100)
    applyBoost(s, 'reparo_rapido');
    advance(s);
    resolveCurrent(s, 'green', { nitroUsed: false });
    expect(s.health).toBe(setup.healthMax);
  });

  it('recuperacao_erro reduz a perda de tempo do próximo erro (vermelho/miss), não afeta saída', () => {
    const s1 = createRace(track, setup);
    advance(s1);
    const withBoost = resolveCurrent(s1, 'miss', { nitroUsed: false });

    const s2 = createRace(track, setup);
    advance(s2);
    applyBoost(s2, 'recuperacao_erro');
    const withoutVsWith = resolveCurrent(s2, 'miss', { nitroUsed: false });

    expect(Math.abs(withoutVsWith.gainSeconds)).toBeLessThan(Math.abs(withBoost.gainSeconds));
  });

  it('recuperacao_erro não altera resultados positivos (só alivia erro)', () => {
    const s = createRace(track, setup);
    advance(s);
    applyBoost(s, 'recuperacao_erro');
    const r = resolveCurrent(s, 'purple', { nitroUsed: false });
    expect(r.gainSeconds).toBeCloseTo(0.30, 5);
  });
});

describe('corrida completa', () => {
  it('percorre todos os eventos e termina a corrida', () => {
    const s = createRace(track, setup);
    let guard = 0;
    while (!s.finished && !s.dnf && guard < 1000) {
      resolveCurrent(s, 'green', { nitroUsed: false });
      advance(s);
      guard++;
    }
    expect(s.finished).toBe(true);
    const out = toRaceOutput(s);
    expect(out.lapsCompleted).toBe(track.laps);
    expect(out.events.length).toBeGreaterThan(0);
  });
});
