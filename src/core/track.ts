import type { TrackDef, RaceEvent } from './types.js';

/**
 * Expande a curadoria de curvas de uma pista (dado) na sequência completa de
 * eventos de uma corrida: largada -> [frenagem, saída] por curva, repetido
 * por volta, com o pit stop obrigatório inserido após `pitAfterLap`.
 *
 * O boost (1x por volta) é oferecido na saída da reta principal: a largada
 * (volta 1) e a saída da última curva de cada volta seguinte.
 */
export function buildEventSequence(track: TrackDef): RaceEvent[] {
  const events: RaceEvent[] = [];

  events.push({ kind: 'saida', lap: 1, boostEligible: true, cornerName: 'Largada' });

  for (let lap = 1; lap <= track.laps; lap++) {
    track.corners.forEach((corner, i) => {
      const isLastCornerOfLap = i === track.corners.length - 1;
      events.push({ kind: 'frenagem', lap, cornerId: corner.id, cornerName: corner.name });
      events.push({
        kind: 'saida',
        lap,
        cornerId: corner.id,
        cornerName: corner.name,
        boostEligible: isLastCornerOfLap && lap < track.laps,
      });
    });
    if (lap === track.pitAfterLap) {
      events.push({ kind: 'pit', lap, cornerName: 'Pit stop' });
    }
  }

  // remove o evento inicial de largada duplicado com o primeiro "saída" de curva
  // (a largada É a saída inicial; nenhuma ação extra necessária aqui — mantido
  // explícito para leitura do backlog/testes)
  return events;
}

export function totalEvents(track: TrackDef): number {
  return buildEventSequence(track).length;
}
