import type { TrackDef, RaceEvent } from './types.js';

/**
 * Expande a curadoria de curvas de uma pista (dado) na sequência completa de
 * eventos de uma corrida: largada -> [frenagem, saída] por curva, repetido
 * por volta, com o pit stop obrigatório inserido após `pitAfterLap`.
 *
 * O boost (1x por volta) é oferecido depois que o jogador já passou pela
 * linha de largada/chegada: a largada (volta 1, tratada à parte antes do
 * countdown — ver RaceScene.create()) e, a partir da volta 2, na SAÍDA da 1ª
 * curva de cada volta. Antes ficava na saída da ÚLTIMA curva da volta
 * anterior — ou seja, ainda ANTES de cruzar a linha (e, em voltas com pit,
 * antes até do próprio pit) — bug reportado pelo PO (Claude-Racing.md).
 * Precisa continuar sendo uma SAÍDA (não a frenagem da 1ª curva): o boost
 * "rasante" só tem efeito na PRÓPRIA saída em que é escolhido (ver
 * RASANTE_BOOST_SCALE/resolveCurrent em core/raceState.ts) — colocar o
 * `boostEligible` numa frenagem faria esse boost nunca ter efeito, já que
 * `pendingBoost` é sempre zerado ao final de qualquer evento não-saída. Ainda
 * assim, marcar a saída da 1ª curva (em vez da última da volta anterior)
 * garante que o boost só apareça depois da linha — e, se houver pit na volta
 * anterior, depois do pit também, já que o evento de pit e a frenagem da 1ª
 * curva sempre vêm antes desta saída na sequência.
 */
export function buildEventSequence(track: TrackDef): RaceEvent[] {
  const events: RaceEvent[] = [];

  events.push({ kind: 'saida', lap: 1, boostEligible: true, cornerName: 'Largada' });

  for (let lap = 1; lap <= track.laps; lap++) {
    track.corners.forEach((corner, i) => {
      const isFirstCornerOfLap = i === 0;
      events.push({ kind: 'frenagem', lap, cornerId: corner.id, cornerName: corner.name });
      events.push({
        kind: 'saida',
        lap,
        cornerId: corner.id,
        cornerName: corner.name,
        boostEligible: isFirstCornerOfLap && lap > 1,
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
