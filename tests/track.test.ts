import { describe, it, expect } from 'vitest';
import { buildEventSequence } from '../src/core/track.js';
import type { TrackDef } from '../src/core/types.js';

const spa: TrackDef = {
  id: 'spa', name: 'Spa', laps: 8, pitAfterLap: 4,
  path: Array.from({ length: 10 }, (_, i) => ({ x: i / 10, y: i / 10 })),
  pitPathIndex: 9,
  corners: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Curva ${i}`, pathIndex: i })),
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

  it('oferece boost 1x por volta (largada + saída da 1ª curva de cada volta seguinte, depois da linha)', () => {
    const events = buildEventSequence(spa);
    const boostable = events.filter(e => e.boostEligible);
    // largada (volta 1) + saída da curva 1 das voltas 2..8 (depois de já ter cruzado a linha)
    expect(boostable.length).toBe(spa.laps); // 1 (largada) + 7 (início das voltas seguintes)
    expect(boostable[0].kind).toBe('saida');
    expect(boostable[0].cornerName).toBe('Largada');
    for (const ev of boostable.slice(1)) {
      // precisa ser 'saida' (não 'frenagem') — boost "rasante" só funciona se
      // aplicado na própria saída em que foi escolhido, ver comentário em track.ts
      expect(ev.kind).toBe('saida');
      expect(ev.cornerId).toBe('c0');
    }
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
