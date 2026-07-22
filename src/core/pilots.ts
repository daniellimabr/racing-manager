/**
 * Pilotos contratáveis (E-302, CLAUDE.md §4/Q4/Q8, sessão 14). Camada `core`:
 * pura, sem dependência de engine nem `localStorage` (mesma regra do resto
 * do `core/`).
 *
 * Escopo desta sessão: só o **piloto do Carro 2** (quem "escala" pra guiar
 * o carro guiado por IA — CLAUDE.md tela 3, "Pilotos"). Os outros cargos
 * listados no CLAUDE.md ("Extra — Cargos contratáveis": racing engineer,
 * lead mechanic, pit stop team, marketing team — tela 4, "Equipe/Staff")
 * ficam de fora — são um sistema maior e separado, não bloqueiam o Carro 2
 * pontuar de verdade (E-303), que é o que dá valor concreto a este épico
 * agora. `Pilotos` também não tem "evoluir" nesta sessão (CLAUDE.md menciona
 * contratar/evoluir/escalar) — só contratar (custo fixo) e escalar (trocar
 * quem está ativo); evoluir fica pra quando fizer sentido ter uma economia
 * de XP/upgrade de piloto desenhada.
 */
import type { Tier } from './types.js';

export interface PilotSkills {
  aceleracao: number; // 1-100
  frenagem: number;
  pace: number;
  ultrapassagem: number;
  /** CLAUDE.md Q8: "a skill de dev. do carro desse 2º piloto beneficia a equipe inteira" — bônus no zoneScale do próprio jogador, não só do carro 2. */
  devCarro: number;
  /** Sem efeito de jogo ainda — depende do sistema de patrocinadores/marketing office, que ou não existe ou está sendo desenhado na mesma sessão (ver Claude-Manager.md). */
  marketing: number;
}

export interface Pilot {
  id: string;
  name: string;
  skills: PilotSkills;
  hireCost: number; // Gold
}

/**
 * Roster fixo de candidatos (não é um sistema de recrutamento/gacha — isso
 * fica pra outra sessão se fizer sentido). 4 arquétipos com trade-offs
 * simples, preços na mesma ordem de grandeza dos upgrades de escritório
 * (150-750 Gold cada) mas mais caros — contratar um piloto é um investimento
 * maior que upar 1 escritório.
 */
export const AVAILABLE_PILOTS: Pilot[] = [
  {
    id: 'rookie',
    name: 'Rookie Promissor',
    skills: { aceleracao: 40, frenagem: 35, pace: 45, ultrapassagem: 30, devCarro: 25, marketing: 50 },
    hireCost: 300,
  },
  {
    id: 'consistente',
    name: 'Piloto Consistente',
    skills: { aceleracao: 55, frenagem: 60, pace: 55, ultrapassagem: 50, devCarro: 50, marketing: 40 },
    hireCost: 800,
  },
  {
    id: 'agressivo',
    name: 'Piloto Agressivo',
    skills: { aceleracao: 70, frenagem: 45, pace: 65, ultrapassagem: 80, devCarro: 35, marketing: 45 },
    hireCost: 1200,
  },
  {
    id: 'veterano',
    name: 'Veterano de Equipe',
    skills: { aceleracao: 75, frenagem: 78, pace: 72, ultrapassagem: 65, devCarro: 80, marketing: 70 },
    hireCost: 2500,
  },
];

export function findPilot(id: string): Pilot | undefined {
  return AVAILABLE_PILOTS.find((p) => p.id === id);
}

/** Distribuição de tier de um piloto "fraco" (perto do perfil Casual do botHarness) — piso da interpolação abaixo. */
const WEAK_WEIGHTS: Record<Tier, number> = { purple: 0.05, green: 0.25, amber: 0.45, red: 0.20, miss: 0.05 };
/** Distribuição de tier de um piloto "forte" (perto do perfil Skilled do botHarness) — teto da interpolação abaixo. */
const STRONG_WEIGHTS: Record<Tier, number> = { purple: 0.35, green: 0.45, amber: 0.17, red: 0.02, miss: 0.01 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Média de aceleração/frenagem/ultrapassagem (as 3 skills "de pilotagem")
 * vira 1 composto 0..1, interpolando entre WEAK_WEIGHTS e STRONG_WEIGHTS —
 * mesma escala de distribuição já usada pelos perfis do harness de bots
 * (`tools/botHarness.ts`), pra um piloto contratado "parecer" um perfil
 * plausível de verdade, não um número inventado do zero.
 */
export function pilotTierWeights(pilot: Pilot): Record<Tier, number> {
  const { aceleracao, frenagem, ultrapassagem } = pilot.skills;
  const t = (aceleracao + frenagem + ultrapassagem) / 3 / 100;
  const weights = {} as Record<Tier, number>;
  for (const tier of Object.keys(WEAK_WEIGHTS) as Tier[]) {
    weights[tier] = lerp(WEAK_WEIGHTS[tier], STRONG_WEIGHTS[tier], t);
  }
  return weights;
}

/** `pace` 1-100 vira paceFactor 0.90-1.10 — mesma faixa das equipes de IA (`AI_TEAMS`, core/grid.ts, 0.94-1.06), um pouco mais larga pro piloto contratado ter uma diferença perceptível. */
export function pilotPaceFactor(pilot: Pilot): number {
  return 0.90 + (pilot.skills.pace / 100) * 0.20;
}

/** `devCarro` 1-100 vira um bônus de zoneScale de até +0.1 — mesma unidade do bônus de raridade de peças (`RARITY_ZONE_BONUS`, core/economy.ts), aplicado ao carro do JOGADOR (CLAUDE.md Q8: beneficia a equipe inteira). */
export function pilotDevCarroBonus(pilot: Pilot): number {
  return (pilot.skills.devCarro / 100) * 0.1;
}
