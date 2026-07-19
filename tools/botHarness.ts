/**
 * Harness de bots — roda o core/ headless (sem browser, sem Phaser) para
 * calibrar parâmetros de jogo. Ver Claude-Tech.md, seção 5.
 *
 * Uso: npm run bots
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createRace, currentEvent, resolveCurrent, advance, revive, tryUseNitro, toRaceOutput,
} from '../src/core/index.js';
import { tierFromPosition, zoneHalves, computeScale, canAttemptOvertake, rollTier } from '../src/core/timing.js';
import { DEFAULT_CAR_SETUP } from '../src/core/constants.js';
import type { TrackDef, Tier } from '../src/core/types.js';

interface Profile {
  name: string;
  // probabilidade acumulada de cair em cada tier, em um desafio "neutro" (sem dificuldade extra)
  weights: Record<Tier, number>;
  overtakeIfClose: boolean; // tenta ultrapassar sempre que possível?
  nitroPolicy: 'never' | 'onOvertake' | 'always';
}

const PROFILES: Profile[] = [
  { name: 'Casual', weights: { purple: 0.05, green: 0.25, amber: 0.45, red: 0.20, miss: 0.05 }, overtakeIfClose: false, nitroPolicy: 'always' },
  { name: 'Médio', weights: { purple: 0.15, green: 0.40, amber: 0.35, red: 0.08, miss: 0.02 }, overtakeIfClose: true, nitroPolicy: 'onOvertake' },
  { name: 'Skilled', weights: { purple: 0.35, green: 0.45, amber: 0.17, red: 0.02, miss: 0.01 }, overtakeIfClose: true, nitroPolicy: 'onOvertake' },
  { name: 'Temerário', weights: { purple: 0.15, green: 0.30, amber: 0.30, red: 0.20, miss: 0.05 }, overtakeIfClose: true, nitroPolicy: 'always' },
];

function loadTrack(): TrackDef {
  const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tracks/spa.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function simulateOne(track: TrackDef, profile: Profile) {
  const s = createRace(track, DEFAULT_CAR_SETUP);
  let killerCorners: Record<string, number> = {};
  let stepsTaken = 0;

  while (!s.finished && stepsTaken < 2000) {
    stepsTaken++;
    const ev = currentEvent(s);
    const isSaida = ev.kind === 'saida';
    const isPit = ev.kind === 'pit';

    if (s.dnf) {
      if (!s.usedRevive) revive(s);
      else break; // encerra a corrida
    }

    let overtakeAttempt = false;
    if (!isSaida && !isPit && profile.overtakeIfClose && canAttemptOvertake(s.gapToAhead)) {
      overtakeAttempt = true;
    }
    s.overtakeAttempt = overtakeAttempt;

    let nitroUsed = false;
    if (profile.nitroPolicy === 'always') nitroUsed = tryUseNitro(s);
    else if (profile.nitroPolicy === 'onOvertake' && overtakeAttempt) nitroUsed = tryUseNitro(s);

    const scale = computeScale({
      base: s.zoneScaleBase, isPit, isSaida, overtakeAttempt,
      gap: s.gapToAhead, pendingBoostIsPneu: s.pendingBoost === 'pneu',
    });
    const halves = zoneHalves(scale);
    const tier = rollTier(profile.weights);
    // valida que o tier sorteado é alcançável dado o "cursor" simulado (aqui já é direto o tier)
    void tierFromPosition(50, halves);

    const result = resolveCurrent(s, tier, { nitroUsed });
    if ((tier === 'red' || tier === 'miss') && ev.cornerName) {
      killerCorners[ev.cornerName] = (killerCorners[ev.cornerName] ?? 0) + 1;
    }
    void result;
    advance(s);
  }

  return { output: toRaceOutput(s), killerCorners };
}

function main() {
  const track = loadTrack();
  const N = 500;
  console.log(`\nHarness de bots — ${track.name}, ${N} corridas por perfil\n`);

  for (const profile of PROFILES) {
    let dnfCount = 0;
    let positions: number[] = [];
    let killerAgg: Record<string, number> = {};

    for (let i = 0; i < N; i++) {
      const { output, killerCorners } = simulateOne(track, profile);
      if (output.dnf) dnfCount++;
      positions.push(output.position);
      for (const [k, v] of Object.entries(killerCorners)) killerAgg[k] = (killerAgg[k] ?? 0) + v;
    }

    const avgPos = (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(2);
    const dnfRate = ((dnfCount / N) * 100).toFixed(1);
    const winRate = ((positions.filter((p) => p === 1).length / N) * 100).toFixed(1);
    const podiumRate = ((positions.filter((p) => p <= 3).length / N) * 100).toFixed(1);
    const topKillers = Object.entries(killerAgg).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} (${v})`).join(', ');

    console.log(`${profile.name.padEnd(12)} | pos. média: ${avgPos.padStart(5)} | DNF: ${dnfRate.padStart(5)}% | vitórias: ${winRate.padStart(5)}% | pódio: ${podiumRate.padStart(5)}% | curvas assassinas: ${topKillers}`);
  }
  console.log('');
}

main();
