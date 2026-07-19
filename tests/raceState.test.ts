import { describe, it, expect } from 'vitest';
import { createRace, currentEvent, resolveCurrent, advance, revive, tryUseNitro, toRaceOutput } from '../src/core/raceState.js';
import type { TrackDef, CarSetup } from '../src/core/types.js';

const track: TrackDef = {
  id: 'test', name: 'Test Track', laps: 2, pitAfterLap: 1,
  corners: [{ id: 'c1', name: 'Curva 1' }, { id: 'c2', name: 'Curva 2' }],
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

describe('resolveCurrent — gap e ultrapassagem', () => {
  it('resultado perfeito reduz o gap e não causa dano', () => {
    const s = createRace(track, setup, { startGap: 1.5 });
    advance(s); // sai da largada, vai para 1ª frenagem
    const before = s.gapToAhead;
    const r = resolveCurrent(s, 'purple', { nitroUsed: false });
    expect(s.gapToAhead).toBeLessThan(before);
    expect(r.damage).toBe(0);
  });

  it('ultrapassagem acontece quando o gap cruza de positivo para negativo', () => {
    const s = createRace(track, setup, { startGap: 0.1 }); // bem perto, atrás
    advance(s); // 1ª frenagem
    const r = resolveCurrent(s, 'purple', { nitroUsed: false }); // ganha 0.30s > 0.1s de gap
    expect(s.gapToAhead).toBeLessThan(0);
    expect(r.positionChanged).toBe('gained');
  });

  it('ser ultrapassado acontece quando o gap cruza de negativo para positivo', () => {
    const s = createRace(track, setup, { startGap: -0.1 }); // já um pouco à frente
    advance(s);
    const r = resolveCurrent(s, 'miss', { nitroUsed: false }); // perde 0.40s
    expect(s.gapToAhead).toBeGreaterThan(0);
    expect(r.positionChanged).toBe('lost');
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
    for (let i = 0; i < 10 && !s.dnf; i++) resolveCurrent(s, 'miss', { nitroUsed: false });
    expect(s.dnf).toBe(true);
    expect(s.dnfReason).toBe('batida forte');
  });

  it('revive só funciona 1x por corrida e restaura metade da saúde', () => {
    const s = createRace(track, setup);
    advance(s);
    for (let i = 0; i < 10 && !s.dnf; i++) resolveCurrent(s, 'miss', { nitroUsed: false });
    expect(revive(s)).toBe(true);
    expect(s.health).toBe(50);
    expect(s.dnf).toBe(false);

    for (let i = 0; i < 10 && !s.dnf; i++) resolveCurrent(s, 'miss', { nitroUsed: false });
    expect(s.dnf).toBe(true);
    expect(revive(s)).toBe(false); // já usou
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
