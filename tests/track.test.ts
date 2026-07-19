import { describe, it, expect } from 'vitest';
import { buildEventSequence } from '../src/core/track.js';
import type { TrackDef } from '../src/core/types.js';

const spa: TrackDef = {
  id: 'spa', name: 'Spa', laps: 8, pitAfterLap: 4,
  corners: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Curva ${i}` })),
};

describe('buildEventSequence', () => {
  it('gera 1 largada + 2 eventos por curva por volta + 1 pit', () => {
    const events = buildEventSequence(spa);
    // 1 largada + 8 voltas * 9 curvas * 2 eventos + 1 pit
    expect(events.length).toBe(1 + 8 * 9 * 2 + 1);
  });

  it('insere o pit exatamente 1x, ao final da volta configurada', () => {
    const events = buildEventSequence(spa);
    const pits = events.filter(e => e.kind === 'pit');
    expect(pits.length).toBe(1);
    expect(pits[0].lap).toBe(4);
  });

  it('oferece boost 1x por volta (largada + fim de cada volta, exceto a última)', () => {
    const events = buildEventSequence(spa);
    const boostable = events.filter(e => e.boostEligible);
    // largada (volta 1) + fim das voltas 1..7 (a volta 8 não libera boost pois a corrida acaba)
    expect(boostable.length).toBe(spa.laps); // 1 (largada) + 7 (fins de volta)
  });

  it('mantém a ordem frenagem -> saída para cada curva', () => {
    const events = buildEventSequence(spa);
    const firstLapEvents = events.filter(e => e.lap === 1).slice(1); // pula a largada
    for (let i = 0; i < firstLapEvents.length; i += 2) {
      expect(firstLapEvents[i].kind).toBe('frenagem');
      expect(firstLapEvents[i + 1].kind).toBe('saida');
    }
  });
});
