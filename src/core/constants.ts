import type { Tier, CarSetup } from './types.js';

/** Ganho de tempo (segundos) por tier — positivo = ganha tempo, negativo = perde */
export const GAIN: Record<Tier, number> = {
  purple: 0.30,
  green: 0.15,
  amber: 0,
  red: -0.20,
  miss: -0.40,
};

/**
 * Dano de saúde por tier, em uma frenagem/pit cheios (saída aplica metade).
 * Recalibrado no T-107 (rodada 1, ver Claude-Racing.md): os valores originais
 * (amber 5 / red 15 / miss 25) somados aos 145 eventos de uma corrida em Spa
 * geravam DNF de 56–100% em todos os perfis — dano por evento precisava cair.
 *
 * `purple` > 0 (sessão 5): decisão do PO registrada em Claude-Racing.md §2.14 —
 * acertar a zona perfeita também desgasta o carro (correr no limite tem custo),
 * não só errar. Valor inicial igual ao de `amber` (conservador); recalibrado
 * empiricamente via harness nesta mesma sessão — ver Claude-Racing.md.
 */
export const DAMAGE: Record<Tier, number> = {
  purple: 2,
  green: 0,
  amber: 1,
  red: 3,
  miss: 6,
};

/** Boost "reparo rápido" (CLAUDE.md §6.1): saúde recuperada na próxima frenagem/pit após escolhido. */
export const REPAIR_BOOST_AMOUNT = 15;

/** Boost "recuperação de erro" (CLAUDE.md §6.1): fator de alívio na perda de tempo do próximo erro (vermelho/miss). */
export const ERROR_RECOVERY_RELIEF = 0.5;

export const NITRO_GOOD_BONUS = 1.10; // +10% em ganhos positivos
export const NITRO_BAD_RELIEF = 0.6; // penalidade cai para 60% do valor original

export const OVERTAKE_GAP_THRESHOLD = 1.0; // segundos — só pode tentar ultrapassar abaixo disso
export const PIT_SCALE = 1.3; // equipe de pit stop alarga a zona
export const PNEU_BOOST_SCALE = 1.2;
export const MAX_SCALE = 1.5;

export const ZONE_BASE_HALVES = { purple: 8, green: 20, amber: 35 };

/**
 * Segundos de vantagem acumulada equivalentes a 1 posição no grid.
 *
 * T-107 (rodada 1, ver Claude-Racing.md): a 1ª tentativa de calibração usava
 * cruzamento de sinal do gap com reset pra um valor fixo a cada ultrapassagem.
 * Isso saturava — o número de ultrapassagens por corrida NÃO escalava com a
 * habilidade do perfil (Skilled e Médio convergiam pro mesmo ~2 por corrida),
 * porque a maior parte do progresso teórico se perdia em reversões de curto
 * prazo do passeio aleatório. Trocado por um modelo de progresso cumulativo
 * (`RaceState.raceProgress`, nunca reseta): a posição é `startPosition -
 * floor(raceProgress / POSITION_UNIT_SECONDS)`. Calibrado via harness (bots)
 * pra Skilled vencer 30–40% das corridas: 3.7 → ~36%.
 *
 * T-107 (rodada 2, ver Claude-Racing.md §2.13): a frenagem passou a ser 2
 * sub-desafios combinados (`combineTiers`, T-105/CSR2) — isso reduz bastante
 * a frequência de resultados vermelho/miss em ~metade dos eventos da corrida
 * (regressão à média de 2 sorteios), o que inflou o ganho médio de perfis já
 * bons desproporcionalmente (Skilled foi de 31% pra 99% de vitórias com o
 * valor antigo). Recalibrado de 3.7 → 4.25 (empírico, harness) pra trazer
 * Skilled de volta a 30–40%. Isso puxou o Médio um pouco além da meta
 * original (pos. média 3.67, meta era 4º–7º) e zerou quase toda taxa de DNF
 * em todos os perfis — o dano de frenagem também sofre a mesma regressão à
 * média. Ambos ficam registrados como pendência pra revisão após playtest
 * humano (T-109/T-110), não foram forçados a caber com um 2º parâmetro
 * porque o modelo se mostrou sensível nesta faixa (99% -> 1% de vitória do
 * Skilled entre 3.7 e 4.6) — não é seguro afinar mais sem dado humano real.
 */
export const POSITION_UNIT_SECONDS = 4.25;

/** valores padrão do carro do jogador até o Manager alimentar o RaceInput de verdade (M2) */
export const DEFAULT_CAR_SETUP: CarSetup = { zoneScale: 1, healthMax: 180, nitroCharges: 3 };
