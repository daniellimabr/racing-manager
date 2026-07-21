import { describe, it, expect } from 'vitest';
import { createRace, currentEvent, resolveCurrent, advance, revive, tryUseNitro, toRaceOutput, applyBoost } from '../src/core/raceState.js';
import {
  POSITION_UNIT_SECONDS, REPAIR_BOOST_AMOUNT, DAMAGE, GOLD_CRASH_PENALTY,
  MISS_INSTANT_DNF_CHANCE_MIN, MISS_INSTANT_DNF_CHANCE_MAX,
} from '../src/core/constants.js';
import type { TrackDef, CarSetup } from '../src/core/types.js';

const track: TrackDef = {
  id: 'test', name: 'Test Track', laps: 2, pitAfterLap: 1,
  path: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0.5 }],
  pitPathIndex: 2,
  corners: [{ id: 'c1', name: 'Curva 1', pathIndex: 0 }, { id: 'c2', name: 'Curva 2', pathIndex: 1 }],
};
const setup: CarSetup = { zoneScale: 1, healthMax: 100, nitroCharges: 1 };

describe('createRace', () => {
  it('inicializa com saúde cheia e sem DNF', () => {
    const s = createRace(track, setup);
    expect(s.health).toBe(100);
    expect(s.dnf).toBe(false);
    expect(currentEvent(s).kind).toBe('saida'); // largada
  });
});

describe('resolveCurrent — gap e posição (progresso cumulativo, T-107)', () => {
  it('resultado perfeito reduz o gap mas também desgasta a saúde (decisão do PO, Claude-Racing.md §2.14)', () => {
    const s = createRace(track, setup);
    advance(s); // sai da largada, vai para 1ª frenagem
    const before = s.gapToAhead;
    const r = resolveCurrent(s, 'purple', { nitroUsed: false });
    expect(s.gapToAhead).toBeLessThan(before);
    expect(r.damage).toBeGreaterThan(0);
  });

  it('ultrapassagem acontece quando o progresso acumulado cruza o limiar da próxima posição', () => {
    // startProgress deixado bem perto do limiar (1 posição = POSITION_UNIT_SECONDS)
    const s = createRace(track, setup, { startProgress: POSITION_UNIT_SECONDS - 0.05 });
    advance(s); // 1ª frenagem
    const r = resolveCurrent(s, 'purple', { nitroUsed: false }); // ganha 0.30s, cruza o limiar
    expect(r.positionChanged).toBe('gained');
    expect(s.position).toBe(5); // largou em 6 (padrão)
    expect(s.gapToAhead).toBeGreaterThan(0); // gap "fresco" contra o PRÓXIMO carro à frente
  });

  it('ser ultrapassado acontece quando o progresso acumulado cai de volta pro limiar anterior', () => {
    // já dentro do "balde" da posição 5 (1 unidade abaixo da largada)
    const s = createRace(track, setup, { startProgress: POSITION_UNIT_SECONDS + 0.05 });
    advance(s);
    const r = resolveCurrent(s, 'miss', { nitroUsed: false }); // perde 0.40s, cai de volta pro balde da posição 6
    expect(s.gapToAhead).toBeGreaterThan(0);
    expect(r.positionChanged).toBe('lost');
    expect(s.position).toBe(6);
  });

  it('a posição inicial já reflete o startProgress (sem esperar o 1º evento)', () => {
    // 2 unidades inteiras de vantagem acumulada = 2 posições à frente da largada padrão
    const s = createRace(track, setup, { startProgress: 2 * POSITION_UNIT_SECONDS + 0.05 });
    expect(s.position).toBe(4); // largada padrão é 6; 2 unidades de vantagem = 2 posições
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
