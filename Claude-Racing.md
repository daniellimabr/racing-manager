# Claude-Racing.md — Trilha Racing, Projeto "Racing Manager"

> Documento vivo mantido pelo agente TechLead-Racing (ver protocolo em Claude-Tech.md, seção 1.1).
> Anexar junto com CLAUDE.md e Claude-Tech.md em conversas sobre a trilha Racing.
> Última atualização: 2026-07-19 (sessão 2 — trabalho autônomo com o PO ausente: T-003 finalizada, Sprint 2 completo (T-101 a T-104), T-107 rodada 1)

## 1. Status do backlog

| Tarefa | Status | Nota |
|---|---|---|
| T-001 Estrutura do projeto | ✅ Feito | (sessão 1) |
| T-002 Core extraído + testes | ✅ Feito | (sessão 1) |
| T-003 Pista como dado + render de debug | ✅ **Feito nesta sessão** | schema ganhou `path`/`pitPathIndex`/`pathIndex` (faltava na sessão 1); `track-debug.html` — ver seção 2.1 |
| T-004 Harness de bots | ✅ Feito | (sessão 1); estendido nesta sessão com métricas de vitória/pódio |
| T-005 Telemetria (PostHog) | ⏳ Não iniciado | Conta criada pelo PO (ver Claude-Tech.md), mas a integração (`analytics.ts`) ainda não foi feita — não estava na ordem de prioridade desta sessão |
| T-006 Deploy contínuo | 🚫 **Bloqueada** | Depende de conta Vercel/Netlify/GitHub Pages que só o PO pode criar — não tentada, conforme instrução |
| T-101 Simulação de grid (12 carros) | ✅ **Feito nesta sessão** | `src/core/grid.ts` — ver seção 2.2 |
| T-102 Tela de corrida Phaser | ✅ **Feito nesta sessão** | `src/view/` — ver seção 2.3 |
| T-103 Fluxo completo integrado | ✅ **Feito nesta sessão** | Idem |
| T-104 Animação entre eventos | ✅ **Feito nesta sessão** | Idem |
| T-105 a T-106 (feel/juice) | ⏳ Não iniciado | Fora da ordem de prioridade desta sessão |
| T-107 Balance pass | ✅ **Rodada 1 feita nesta sessão** | Ver seção 2.4 — **nota:** era a 1ª rodada de verdade, não a 2ª (ver seção 5) |
| T-108 a T-110 | ⏳ Não iniciado | Fora da ordem de prioridade desta sessão |

**Como rodar:** `npm install && npm test && npm run bots && npm run dev` (abre em `/index.html`; `/track-debug.html` é só o debug isolado da T-003).

## 2. O que foi feito nesta sessão — decisões técnicas

### 2.1 T-003 — Traçado como dado + render de debug

- `TrackDef` ganhou `path: {x,y}[]` (polilinha normalizada 0..1, loop fechado) e `pitPathIndex`; `CornerDef` ganhou `pathIndex`. Isso **faltava inteiramente** no schema herdado da sessão 1 (o `spa.json` só tinha a lista de curvas, sem nenhum traçado) — não dava pra desenhar nada sem isso. Resolvido criando um traçado estilizado (não geograficamente exato, só topologicamente plausível) de Spa com os 9 pontos de curva posicionados nele.
- `track-debug.html` + `src/debug/trackDebug.ts`: canvas simples e **isolado da view do jogo de verdade** (não usa Phaser), só pra conferência visual da curadoria. Verificado via dev server + Playwright headless — traçado fechado, 9 curvas numeradas e legíveis, marcador de pit.

### 2.2 T-101 — Simulação de grid (12 carros)

`src/core/grid.ts`, módulo **aditivo** — não toca `raceState.ts` (que já tinha 22 testes e é usado pelo harness, que precisa continuar rápido/determinístico o bastante pra milhares de corridas).

- 5 equipes adversárias (2 carros cada, pace + agressividade variados) + 1 companheiro de equipe do jogador (guiado por IA) = 11 carros + o jogador = 12, conforme Q5 do CLAUDE.md.
- `deriveStandings()` funde o jogador (que entra só como um `cumulativeTime` calculado pela view a partir do `gainSeconds` de cada `resolveCurrent`) com o grid numa classificação única — é isso que dá o live-timing dos 12 carros.
- **Decisão de design não documentada em nenhum lugar (registrando aqui):** como mapear o modelo 1D de gaps (só relativo ao carro imediatamente à frente) pra uma posição 2D de 12 ícones na tela. Resolvido tratando a corrida como um "pelotão": todos os carros são desenhados perto da mesma posição de referência no traçado (derivada do evento atual do jogador), com um pequeno deslocamento ao longo do traçado proporcional ao `gapToLeader` de cada um (constantes `SECONDS_PER_LAP_VISUAL`/`MAX_VISUAL_GAP_SECONDS` em `viewConstants.ts`). É uma simplificação deliberada, coerente com o risco "escopo do grid" já registrado em Claude-Tech.md §9 — não é física real, é só pra dar a sensação de corrida em grupo.

### 2.3 T-102 a T-104 — View Phaser completa

`index.html` + `src/view/` (main.ts, RaceScene.ts, pathUtils.ts, viewConstants.ts). Não havia absolutamente nada de view antes desta sessão (nem `index.html` existia).

- **T-102:** traçado completo desenhado, ícones escalonados por tamanho/cor/anel conforme Q12 do CLAUDE.md (jogador maior, companheiro destacado, pódio com anel branco, demais pequenos), HUD com posição (derivada do grid, não do `raceState.position` bruto — ver pendência na seção 3)/volta/saúde/nitro/gap.
- **T-103:** máquina de estados da view espelha exatamente a sequência já testada em `raceState.ts`/`botHarness.ts` (resolve → sempre `advance()`, independente de DNF; o DNF só pausa a UI pra decisão humana, sem pular o `advance()` que já rodou). Boost 1x por volta (3 opções — `pneu`/`freio`/`janela`, os únicos `BoostId` que o core implementa; CLAUDE.md §6.1 lista 8 conceitos de boost, mas só esses 3 foram tipados no T-002 — não expandi o core pra isso nesta sessão, ver pendência). Decisão de nitro + ultrapassagem antes do desafio (ultrapassagem só quando `!isSaida && !isPit && gap<1s`, conforme CLAUDE.md: "não há decisão explícita de tentar ultrapassar no pit"). Pit obrigatório, DNF com revive (1x)/encerrar, resumo final.
- **T-104:** ícones interpolados ao longo do traçado real (`pathUtils.pointAtT`) via tween de 1s entre eventos — sem teleporte.
- **Pit crew quality:** RaceInput real só chega no M2; usei um default fixo `DEFAULT_PIT_CREW_QUALITY = 0.5` (não estava especificado em nenhum documento — registrando a decisão aqui).

**Verificação visual:** não há navegador disponível neste ambiente (Windows, sem `chromium-cli`), então instalei o Playwright temporariamente (`npm install --no-save`, removido ao final de cada rodada) e dirigi um Chromium headless via scripts descartáveis, com screenshots lidos a cada passo. **Isso encontrou e permitiu corrigir 2 bugs reais que não apareceriam só no typecheck/testes:**

1. `cursorGraphics` (o indicador da barra de timing) era adicionado como filho de `panel`, que é destruído inteiro (`removeAll(true)`) a cada troca de fase — no 2º desafio da corrida, a corrida travava com `TypeError: Cannot read properties of undefined (reading 'sys')` ao tentar reusar o objeto já destruído. Corrigido criando um `Graphics` novo por desafio.
2. O HUD não era atualizado ao sair do overlay de DNF — depois de um revive, a tela mostrava "Saúde: 0/100" em vez de "50/100" até a próxima animação. Corrigido centralizando `updateHud()` no topo de `startEventCycle()`.

**Não verificado visualmente** (custo proibitivo de cliques automatizados pra chegar lá numa corrida de 145 eventos): a tela do evento de pit (volta 4) e o resumo por chegada natural (sem DNF). Ambos usam exatamente os mesmos caminhos de código já exercitados (branch `isPit` em `computeScale`/`resolveCurrent`; branch `!output.dnf` em `showSummary`), risco avaliado como baixo, mas fica registrado como verificação pendente pro próximo playtest humano (T-109/T-110).

### 2.4 T-107 — Balance pass, rodada 1

Ver seção 4 (achados anteriores) e seção 5 (o que mudou). Resultado final (500 corridas/perfil):

| Perfil | pos. média | DNF | vitórias | pódio |
|---|---|---|---|---|
| Casual | 6.73 | 2.0% | 0.0% | 0.0% |
| Médio | 4.11 | 0.0% | 0.0% | 5.2% |
| Skilled | 1.69 | 0.0% | **31.4%** | 100.0% |
| Temerário | 5.59 | 0.2% | 0.0% | 0.0% |

Bate com todas as metas da seção 5 do Claude-Tech.md: Médio entre 4º-7º ✅, DNF do Médio <15% ✅ (na verdade 0%), Skilled vence 30–40% ✅ (31.4%), Casual completa ≥70% das tentativas ✅ (98%). DNF não reabriu em nenhum perfil.

## 3. Pendências / decisões ambíguas registradas nesta sessão

- **Boost: só 3 dos 8 conceitos do CLAUDE.md §6.1 estão implementados no core** (`pneu`/`freio`/`janela`; faltam nitro extra, rasante, reparo rápido, fôlego de ultrapassagem, recuperação de erro). Isso já era assim desde o T-002, não é uma regressão desta sessão — só nunca tinha sido registrado. A view oferece as 3 disponíveis a cada boost elegível. Decisão de qual conjunto priorizar pro M1 fica para o CTO/PO.
- **Posição exibida na HUD/resumo vem do grid (`deriveStandings`), não do `raceState.position` bruto.** São dois sistemas paralelos calculando "posição" (um pro harness headless, rápido; outro pro grid visual, mais rico) que **podem divergir entre si** — não há garantia formal de que concordem sempre, já que são independentes por design (ver seção 2.2). Pra M1 isso é aceitável (a UI só mostra a posição do grid, nunca a do core puro), mas é uma dívida de arquitetura a reavaliar se o Manager (M2) precisar ler `RaceOutput.position` de forma que precise bater exatamente com o que o jogador viu na tela — nesse caso, meça de novo, porque o `RaceOutput.position` atual (usado por `toRaceOutput`) ainda é o do core puro, não o do grid.
- **`DEFAULT_PIT_CREW_QUALITY = 0.5`** — valor não especificado em nenhum documento, escolhido como ponto médio razoável até o M2 alimentar de verdade via `RaceInput.pitCrew`.
- **Git não estava de fato inicializado** neste diretório, apesar do CLAUDE.md (seção 3, decisão de 2026-07-19) dizer "repositório inicializado na migração para o Claude Code". Inicializei nesta sessão (commit inicial = baseline do Sprint 1 antes de eu tocar em qualquer coisa) — sinalizando pro CTO corrigir essa entrada em Claude-Tech.md/CLAUDE.md se relevante.

## 4. Achado do harness de bots — rodada 0 (herdado da sessão 1, T-004)

Rodando 500 corridas simuladas por perfil em Spa (146 eventos/corrida), com as constantes originais do greybox:

| Perfil | Posição média | Taxa de DNF |
|---|---|---|
| Casual | 6.00 | 100% |
| Médio | 5.33 | 100% |
| Skilled | 5.31 | 56.6% |
| Temerário | 5.82 | 100% |

**Diagnóstico da sessão 1:** as constantes de dano (`DAMAGE`) foram herdadas de uma demo de ~20 eventos; a corrida completa tem 146 — dano acumulado estourava os 100 de saúde muito antes da chegada, mesmo pro perfil Skilled.

## 5. T-107 — o que foi tentado nesta sessão (rodada 1 real)

**Nota sobre a numeração:** a instrução desta sessão pedia pra continuar "mais uma rodada de calibração... ver seção 6 para o que já foi tentado", mas **essa seção 6 nunca existiu** — a sessão 1 só tinha o achado (seção 4 acima) e uma recomendação, nenhuma calibração de fato tinha sido feita ainda. Tratando esta sessão como a rodada 1 real, não a 2ª. Registrando isso como a inconsistência da trilha nesta sessão (a outra é a do git, seção 3).

**Parte A — DNF (resolvendo o achado da rodada 0):**

- `DAMAGE`: `amber` 5→1, `red` 15→3, `miss` 25→6.
- `DEFAULT_CAR_SETUP.healthMax`: 100→180 (centralizado em `core/constants.ts`; antes duplicado à mão em `botHarness.ts` e `viewConstants.ts` — risco de drift).

**Parte B — taxa de vitória do Skilled (achado novo desta sessão, não estava na rodada 0):**

Depois de resolver o DNF, medi a taxa de vitória e encontrei outro problema, mais sutil: **Skilled tinha uma taxa de vitória MENOR que Médio** (14.0% vs 16.8%), apesar de ter o dobro do ganho esperado por evento. Isolei a causa com um protótipo standalone fora do core (não era bug de implementação): o modelo original de posição (gap escalar único, cruzamento de sinal reseta pra um valor fixo a cada ultrapassagem) **satura** — o número de ultrapassagens por corrida convergia pro mesmo patamar (~2) pra qualquer perfil, porque a maior parte do progresso teórico se perdia em reversões de curto prazo do passeio aleatório, independente da diferença real de acurácia entre os perfis.

**Correção:** substituí por um modelo de **progresso cumulativo** — `RaceState.raceProgress` nunca reseta; a posição é `startPosition - floor(raceProgress / POSITION_UNIT_SECONDS)`. `gapToAhead` virou um valor **derivado** (distância até o próximo limiar de posição), não mais um estado independente. `POSITION_UNIT_SECONDS = 3.7` foi calibrado empiricamente (protótipo + harness real) pra Skilled vencer 30–40%.

Essa é uma mudança de arquitetura no core (`raceState.ts`), não só um ajuste de constante — os testes que checavam o sinal/valor exato do gap após uma ultrapassagem foram reescritos pra validar o novo mecanismo (`tests/raceState.test.ts`). `createRace(opts.startGap)` foi removido (não fazia mais sentido no novo modelo); `createRace(opts.startProgress)` entrou no lugar.

**Não verificado ainda:** o alvo "corrida ≈ 5 min" (seção 5 do Claude-Tech.md) — o harness não simula tempo de parede, isso só é medível num playtest humano real (T-105/T-110). `OVERTAKE_GAP_THRESHOLD` (1.0s, usado pra decidir quando a UI oferece "tentar ultrapassagem") não foi recalibrado junto com a nova escala de `gapToAhead` (que agora varia bem mais, até ~3.7s) — vale reavaliar num playtest humano se a opção de ultrapassagem estiver aparecendo raro/cedo demais na prática.

## 6. Próximos passos (retomar na próxima sessão)

1. **T-006 (bloqueada):** aguardando o PO criar conta Vercel/Netlify/GitHub Pages.
2. **T-005:** integrar `analytics.ts` (conta PostHog já existe, credenciais em Claude-Tech.md).
3. **T-105/T-106:** feel pass (benchmark CSR2, juice) — precisa de playtest humano, não dá pra fazer 100% autônomo.
4. **T-108:** telemetria nos eventos de corrida (depende da T-005).
5. **Verificação visual pendente** (seção 2.3): evento de pit e resumo por chegada natural — conferir no próximo playtest ou com uma sessão de teste automatizado mais longa.
6. **Reavaliar `OVERTAKE_GAP_THRESHOLD`** contra a nova escala de `gapToAhead` num playtest humano (seção 5).
7. Se o Manager (M2) for consumir `RaceOutput.position`, revisitar a divergência entre posição do core e posição do grid (seção 3).

## 7. Como rodar

```
npm install
npm test        # 33 testes devem passar
npm run bots     # relatório de balanceamento (ver seção 2.4)
npm run dev      # abre http://localhost:5173/index.html (jogo) e /track-debug.html (debug do traçado)
```
