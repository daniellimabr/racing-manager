/**
 * Harness de economia (E-206, ver CLAUDE.md §6.2 e Claude-Tech.md §8) — roda
 * o `core/` headless (sem browser) simulando muitos DIAS de uso realista de
 * um jogador: abre o app algumas vezes por dia em horários plausíveis, joga
 * corridas até a energia não dar mais pro custo, acumula Gold/peças e fecha
 * fusões automaticamente. Serve pra calibrar: taxa de regen de energia,
 * tabela de Gold-por-posição e taxas de drop de peça (`core/economy.ts`).
 *
 * Script NOVO e separado de `tools/botHarness.ts` (dono: TechLead-Racing,
 * calibra dano/dificuldade da corrida em si — não tocado aqui). Reaproveita
 * as mesmas funções do `core/` (não duplica regras de jogo), só com um perfil
 * de piloto "Médio" fixo (não é o foco desta calibração — o foco é a camada
 * econômica em cima do resultado da corrida).
 *
 * Uso: npm run economy
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRace, currentEvent, resolveCurrent, advance, revive, tryUseNitro, toRaceOutput } from '../src/core/raceState.js';
import { canAttemptOvertake, rollTier, combineTiers } from '../src/core/timing.js';
import { DEFAULT_CAR_SETUP } from '../src/core/constants.js';
import {
  ENERGY_MAX, ENERGY_COST_PER_RACE,
  applyEnergyRegen, canAffordRace, computeRaceRewards, computeZoneScale,
  emptyInventory, receivePart, fuseAll, equippedRarity, PART_SLOTS,
  type PartInventory, type EnergyState,
} from '../src/core/economy.js';
import type { TrackDef, CarSetup, RaceOutput, Tier } from '../src/core/types.js';

// perfil "Médio" (mesma distribuição usada em tools/botHarness.ts, trilha
// Racing) — não é o foco desta calibração (a corrida em si já está calibrada
// lá); serve só pra gerar resultados de corrida realistas o bastante pra
// alimentar a simulação econômica (posição final, DNF, penalidade de Gold).
const MEDIO_WEIGHTS: Record<Tier, number> = { purple: 0.15, green: 0.40, amber: 0.35, red: 0.08, miss: 0.02 };

function loadTrack(): TrackDef {
  const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tracks/spa.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function simulateRace(track: TrackDef, carSetup: CarSetup): RaceOutput {
  const s = createRace(track, carSetup);
  let stepsTaken = 0;
  while (!s.finished && stepsTaken < 2000) {
    stepsTaken++;
    const ev = currentEvent(s);
    const isSaida = ev.kind === 'saida';
    const isPit = ev.kind === 'pit';

    if (s.dnf) {
      if (!s.usedRevive) revive(s);
      else break;
    }

    let overtakeAttempt = false;
    if (!isSaida && !isPit && canAttemptOvertake(s.gapToAhead)) overtakeAttempt = true;
    s.overtakeAttempt = overtakeAttempt;

    const nitroUsed = overtakeAttempt ? tryUseNitro(s) : false;

    const tier = ev.kind === 'frenagem'
      ? combineTiers(rollTier(MEDIO_WEIGHTS), rollTier(MEDIO_WEIGHTS))
      : rollTier(MEDIO_WEIGHTS);

    resolveCurrent(s, tier, { nitroUsed });
    advance(s);
  }
  return toRaceOutput(s);
}

interface PlayerSimState {
  energy: number;
  energyLastUpdateMs: number;
  gold: number;
  inventory: PartInventory;
}

interface DaySessionSchedule {
  /** horas do dia (0-23) em que o jogador abre o app, ex.: [9, 13, 20] */
  hours: number[];
}

interface SimResult {
  totalRaces: number;
  racesPerDay: number[];
  finalGold: number;
  finalInventory: PartInventory;
  /** dia fracionário (ex.: 3.5) da 1ª fusão, ou null se nenhuma ocorreu no período simulado */
  firstFusionDay: number | null;
  totalFusions: number;
}

function simulatePlayer(days: number, schedule: DaySessionSchedule, track: TrackDef): SimResult {
  const state: PlayerSimState = {
    energy: ENERGY_MAX, energyLastUpdateMs: 0, gold: 0, inventory: emptyInventory(),
  };
  let totalRaces = 0;
  let firstFusionDay: number | null = null;
  let totalFusions = 0;
  const racesPerDay: number[] = [];

  for (let day = 0; day < days; day++) {
    let racesToday = 0;
    for (const hour of schedule.hours) {
      const nowMs = (day * 24 + hour) * 3_600_000;
      const regen: EnergyState = applyEnergyRegen(state, nowMs);
      state.energy = regen.energy;
      state.energyLastUpdateMs = regen.energyLastUpdateMs;

      // joga corridas até a energia não dar mais pro custo (pedido explícito
      // do PO/CLAUDE.md pra este harness — sessão "drena" a energia disponível)
      while (canAffordRace(state.energy)) {
        state.energy -= ENERGY_COST_PER_RACE;
        totalRaces++;
        racesToday++;

        const carSetup: CarSetup = { ...DEFAULT_CAR_SETUP, zoneScale: computeZoneScale(state.inventory) };
        const output = simulateRace(track, carSetup);
        const reward = computeRaceRewards({ position: output.position, dnf: output.dnf, goldPenalty: output.goldPenalty });
        state.gold += reward.gold;
        for (const drop of reward.partsDropped) receivePart(state.inventory, drop.slot, drop.rarity);
        const fusions = fuseAll(state.inventory);
        totalFusions += fusions.length;
        if (fusions.length > 0 && firstFusionDay === null) {
          firstFusionDay = day + hour / 24;
        }
      }
    }
    racesPerDay.push(racesToday);
  }

  return {
    totalRaces, racesPerDay, finalGold: state.gold, finalInventory: state.inventory, firstFusionDay, totalFusions,
  };
}

interface Scenario {
  name: string;
  hours: number[];
}

const SCENARIOS: Scenario[] = [
  { name: '1x/dia (só à noite, 20h)', hours: [20] },
  { name: '2x/dia (almoço 13h + noite 20h)', hours: [13, 20] },
  { name: '3x/dia (manhã 9h, almoço 13h, noite 20h)', hours: [9, 13, 20] },
  { name: '5x/dia (jogador muito engajado)', hours: [8, 11, 14, 18, 21] },
];

const DAYS = 21;
const TRIALS_PER_SCENARIO = 100; // reduz ruído de RNG no relatório (mesmo espírito do N=500/perfil do botHarness)

function summarizeRarities(inv: PartInventory): string {
  return PART_SLOTS.map((slot) => equippedRarity(inv, slot) ?? '—').join(',');
}

function main() {
  const track = loadTrack();
  console.log(`\nHarness de economia — ${track.name}, ${DAYS} dias simulados, ${TRIALS_PER_SCENARIO} jogadores/cenário\n`);
  console.log('(perfil de corrida fixo: "Médio", mesma distribuição do botHarness — o foco aqui é a camada econômica)\n');

  for (const scenario of SCENARIOS) {
    const results: SimResult[] = [];
    for (let t = 0; t < TRIALS_PER_SCENARIO; t++) {
      results.push(simulatePlayer(DAYS, scenario, track));
    }

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgRacesPerDay = avg(results.map((r) => r.totalRaces / DAYS));
    const avgGold = avg(results.map((r) => r.finalGold));
    const fusionDays = results.map((r) => r.firstFusionDay).filter((d): d is number => d !== null);
    const fusionRate = (fusionDays.length / results.length) * 100;
    const avgFirstFusionDay = fusionDays.length ? avg(fusionDays) : NaN;
    const avgTotalFusions = avg(results.map((r) => r.totalFusions));
    const sampleRarities = summarizeRarities(results[0].finalInventory);

    console.log(`${scenario.name}`);
    console.log(`  corridas/dia (média): ${avgRacesPerDay.toFixed(2)}`);
    console.log(`  Gold acumulado após ${DAYS} dias (média): ${avgGold.toFixed(0)}`);
    console.log(`  1ª fusão: ${fusionRate.toFixed(0)}% dos jogadores fundiram algo em ${DAYS} dias` + (fusionDays.length ? `, no dia ${avgFirstFusionDay.toFixed(1)} (média)` : ''));
    console.log(`  total de fusões em ${DAYS} dias (média): ${avgTotalFusions.toFixed(2)}`);
    console.log(`  exemplo de raridades finais por slot (1 jogador simulado): ${sampleRarities}`);
    console.log('');
  }
}

main();
