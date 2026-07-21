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
 * não só errar.
 *
 * Recalibrado de novo na sessão 9 (Claude-Racing.md §2.26), a pedido do PO após
 * o playtest: todo tier passa a desgastar a saúde, inclusive `green` (antes
 * gratuito) — a lógica real é "consumo de pneu/desgaste", não só erro. Ordem
 * relativa preservada (green < amber < purple < red < miss), só a régua muda.
 * `miss` sobe bem mais que os outros (6 → 12): o PO pediu que fosse grave —
 * "como se o piloto nem freiasse, é caixa de brita na hora" — e ganhou também
 * uma chance de DNF instantâneo (ver MISS_INSTANT_DNF_CHANCE_*), não só dano.
 * `healthMax` do carro padrão foi recalibrado junto — ver DEFAULT_CAR_SETUP.
 *
 * Esta tabela não mudou na sessão 10 (calibração final da tensão healthMax ×
 * DNF, ver Claude-Racing.md §2.27) — só `healthMax` e `MISS_INSTANT_DNF_CHANCE_*`
 * foram recalibrados dessa vez.
 */
export const DAMAGE: Record<Tier, number> = {
  purple: 3,
  green: 1,
  amber: 2,
  red: 5,
  miss: 12,
};

/**
 * Chance de DNF instantâneo ("batida forte") ao tirar `miss`, independente da
 * saúde ainda não ter zerado — feedback do PO (sessão 9, Claude-Racing.md
 * §2.26): um miss é "caixa de brita na hora", não só perda de tempo. Cresce
 * conforme a saúde já está baixa (carro mais debilitado, mais fácil de perder
 * de vez o controle). Interpolação linear entre os 2 valores por `health/healthMax`.
 *
 * Recalibrado na sessão 10 (0.08/0.5 → 0.04/0.28, ver Claude-Racing.md §2.27):
 * a sessão 9 tinha fixado `healthMax = 260` como meio-termo capenga entre os 2
 * critérios do PO (verde à toa = metade da saúde vs. roxo à toa = quase
 * impossível terminar), porque baixar `healthMax` pro valor que cumpre o
 * critério do verde (219) deixava o DNF de Casual/Temerário em ~50% — só que
 * esse piso de DNF vinha majoritariamente DESTA chance de crash instantâneo,
 * não do acúmulo de dano (que é o que `healthMax` de fato controla). Reduzindo
 * MIN/MAX (e não `healthMax`) o piso caiu para uma faixa razoável, permitindo
 * `healthMax` voltar a 219 (honrando o critério do "verde" com exatidão) sem
 * DNF explodir pros perfis que mais erram. Ver tabela de calibração em
 * Claude-Racing.md §2.27.
 */
export const MISS_INSTANT_DNF_CHANCE_MIN = 0.04; // saúde cheia
export const MISS_INSTANT_DNF_CHANCE_MAX = 0.28; // saúde baixa

/**
 * Penalidade de Gold aplicada num crash (DNF por "batida forte"). Pedido do PO
 * (sessão 9): primeiro fio de conexão com a economia do Manager (M2) — ainda
 * não existe carteira de verdade em M1, então isso só é calculado e exposto
 * (RaceOutput.goldPenalty + telemetria `dnf`), não subtraído de lugar nenhum
 * de verdade ainda. Valor provisório, sem calibração de economia (isso é
 * trabalho de M2).
 */
export const GOLD_CRASH_PENALTY = 50;

/**
 * Piso do multiplicador de dificuldade por saúde (`computeScale`, core/timing.ts).
 * Pedido do PO (sessão 9): carro mais danificado fica mais difícil de guiar —
 * a zona de acerto nunca fica menor que este piso, mesmo com saúde zerada
 * (pra não virar literalmente impossível). Valor inicial não confirmado pelo
 * PO, a validar em playtest.
 *
 * **Ainda não confirmado pelo PO na sessão 10** (Claude-Racing.md §2.27) —
 * deliberadamente não mexido nesta sessão: afeta dificuldade física de acerto
 * humano, não sorteio de probabilidade, então o harness de bots não consegue
 * validar se 0.6 está certo. Fica igual até o PO confirmar em playtest.
 */
export const HEALTH_DIFFICULTY_FLOOR = 0.6;

/**
 * Fator de escala aplicado ao `raceProgress` do jogador ao entrar no grid como
 * "mais um carro" (ver `raceStandings()`, `core/raceState.ts`) — calibração
 * equivalente em espírito ao antigo `POSITION_UNIT_SECONDS` (removido nesta
 * sessão, unificação core/grid, ver Claude-Racing.md §3/§6 item 5), só que
 * agora expressa como "quanto o progresso do jogador vale em segundos de
 * grid" (mesma unidade das IAs), não mais como um divisor de "unidades de
 * posição" arbitrárias e desconectadas do pace real dos oponentes.
 *
 * Necessário porque a frenagem do jogador combina 2 sorteios independentes
 * (`combineTiers`, T-105/CSR2) — a mesma regressão à média que já tinha
 * forçado recalibrar `POSITION_UNIT_SECONDS` de 3.7→4.25 no T-107 rodada 2 —
 * enquanto as IAs do grid sempre sortearam só 1 tier por evento (não têm o
 * conceito de "2 sub-desafios"). Sem este fator, um perfil "Skilled" vencia
 * ~86% das corridas contra o grid de verdade (meta: 30–40%, Claude-Tech.md
 * §5) — bem mais que a vantagem real de habilidade justificaria, porque a
 * combinação de 2 sorteios também empurra sistematicamente o tier médio do
 * jogador pra cima do que o MESMO perfil produziria num sorteio único (que é
 * como as IAs continuam operando).
 *
 * Calibrado via harness nesta sessão (busca binária manual, 500 corridas/perfil
 * por tentativa): 1.0→86% vitórias do Skilled, 0.92→48,8%, 0.85→11,2%,
 * 0.72→0%. **0.89** ficou consistente em 3 rodadas (~30-33% vitórias do
 * Skilled) contra as metas da sessão 10 (Claude-Racing.md §2.27): Casual DNF
 * 20–35% ✅ (~30-34%), Médio DNF 5–15% ✅ (~7-9%), Skilled vitórias 30–40% ✅.
 * **Temerário ficou na borda** (27,8–30,6% nas 3 rodadas, meta 30–45%) — mais
 * perto do piso da meta que confortavelmente dentro; registrado como pendência
 * de calibração fina (mesmo espírito de `HEALTH_DIFFICULTY_FLOOR`: aceitável
 * por ora, mas sinalizado pra revisão após playtest humano em vez de caçar um
 * ajuste "perfeito" só com o harness). Extremamente sensível nesta faixa
 * (mesma fragilidade já registrada pro extinto `POSITION_UNIT_SECONDS`, ver
 * Claude-Racing.md §3) — não afinar mais sem dado humano real.
 */
export const PLAYER_GRID_PACE_SCALE = 0.89;

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

/**
 * Meias-larguras base (0-50) de cada zona de precisão. `purple` reduzido de
 * 8 → 6 na sessão 10 (Claude-Racing.md §2.27, ~25% mais estreita) — resposta
 * direta ao playtest do PO ("acertar o roxo não é um grande desafio", sessão
 * 8, §2.21), reconfirmado pelo harness (DNF ~0% com a tabela DAMAGE antiga).
 * **Isto NÃO é validado pelo harness de bots** — os bots simulam o resultado
 * de cada tier por sorteio de probabilidade fixa por perfil, não a
 * dificuldade física de acertar a zona (isso depende de reflexo humano real).
 * Só um playtest humano pode confirmar se 6 é o valor certo, ou se ainda
 * precisa cair mais / passou do ponto. Ver pergunta 1 pro PO em Claude-Racing.md §2.27.
 */
export const ZONE_BASE_HALVES = { purple: 6, green: 20, amber: 35 };

/**
 * ~~POSITION_UNIT_SECONDS~~ — REMOVIDA na sessão 11 (unificação core/grid, ver
 * Claude-Racing.md §3/§6 item 5). Era o parâmetro do modelo escalar antigo de
 * posição (`startPosition - floor(raceProgress / POSITION_UNIT_SECONDS)`),
 * calculado em paralelo ao grid de 12 carros (`core/grid.ts`) — os 2 modelos
 * já haviam divergido 2x na prática (líder recebendo oferta de ultrapassagem;
 * dúvida de qual posição pagar a recompensa do Manager). A posição agora vem
 * SEMPRE do grid (`raceStandings()` em `core/raceState.ts`), com o jogador
 * entrando na simulação como mais um carro a partir do seu próprio
 * `raceProgress` — não sobrou nenhum uso desta constante em código de
 * produção; mantida fora do arquivo de propósito (não só comentada) para não
 * haver 2 mecanismos "quase iguais" tentadores de usar por engano numa sessão
 * futura. Se precisar do valor histórico (4.25, calibrado via harness pro
 * Skilled vencer 30–40%), ver o histórico do arquivo antes desta sessão.
 */

/**
 * valores padrão do carro do jogador até o Manager alimentar o RaceInput de
 * verdade (M2). `healthMax` recalibrado na sessão 9 junto com o novo `DAMAGE`
 * (180 → 260): meta do PO é "correr tudo no verde e chegar com ~metade da
 * saúde" ser razoável, e "correr tudo no roxo" ser praticamente inviável de
 * terminar.
 *
 * Recalibrado de novo na sessão 10 (260 → 219, ver Claude-Racing.md §2.27):
 * a sessão 9 tinha ficado num meio-termo porque baixar pro valor exato do
 * critério "verde" (219) inflava demais o DNF de Casual/Temerário — mas a
 * causa real desse DNF era `MISS_INSTANT_DNF_CHANCE_MIN/MAX`, não `healthMax`
 * (ver comentário lá). Corrigindo a causa raiz, `healthMax` pôde voltar ao
 * valor que honra o critério do PO com exatidão: uma corrida em Spa tem 73
 * eventos de frenagem/pit (dano cheio) + 73 de saída (meio dano); com
 * DAMAGE.green = 1, isso dá `73*1 + 73*0.5 = 109.5` de dano rodando tudo
 * verde — `healthMax = 2 * 109.5 = 219` sobra exatamente metade. Confirmado
 * com um script determinístico (sem depender de sorteio) e também com o
 * harness de bots (ver tabela em Claude-Racing.md §2.27).
 */
export const DEFAULT_CAR_SETUP: CarSetup = { zoneScale: 1, healthMax: 219, nitroCharges: 3 };
