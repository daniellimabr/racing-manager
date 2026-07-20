# Claude-Racing.md — Trilha Racing, Projeto "Racing Manager"

> Documento vivo mantido pelo agente TechLead-Racing (ver protocolo em Claude-Tech.md, seção 1.1).
> Anexar junto com CLAUDE.md e Claude-Tech.md em conversas sobre a trilha Racing.
> Última atualização: 2026-07-20 (sessão 2, encerramento — traçado de Spa corrigido com mapa real, deploy pendente de instabilidade do GitHub, seção 6 tem o handoff completo pra próxima sessão)

## 1. Status do backlog

| Tarefa | Status | Nota |
|---|---|---|
| T-001 Estrutura do projeto | ✅ Feito | (sessão 1) |
| T-002 Core extraído + testes | ✅ Feito | (sessão 1) |
| T-003 Pista como dado + render de debug | ✅ **Feito nesta sessão** | schema ganhou `path`/`pitPathIndex`/`pathIndex` (faltava na sessão 1); `track-debug.html` — ver seção 2.1 |
| T-004 Harness de bots | ✅ Feito | (sessão 1); estendido nesta sessão com métricas de vitória/pódio |
| T-005 Telemetria (PostHog) | ✅ **Feito nesta sessão** | Wrapper + modo offline + `session_start`/`session_end`/`race_start`/`race_end` — ver seção 2.5 |
| T-006 Deploy contínuo | ⏳ **Quase — bloqueado por outage do GitHub** | Todo o setup está pronto e correto (workflow, `base` do Vite, repo, Pages configurado); só falta a 1ª publicação completar, travada pelo "partial outage" do GitHub Actions no momento do encerramento desta sessão — ver seção 2.7 |
| T-101 Simulação de grid (12 carros) | ✅ **Feito nesta sessão** | `src/core/grid.ts` — ver seção 2.2 |
| T-102 Tela de corrida Phaser | ✅ **Feito nesta sessão** | `src/view/` — ver seção 2.3 |
| T-103 Fluxo completo integrado | ✅ **Feito nesta sessão** | Idem |
| T-104 Animação entre eventos | ✅ **Feito nesta sessão** | Idem |
| T-105 (benchmark CSR2) | ⏳ Bloqueada no PO | PO ainda não instalou o CSR2; parte mecânica adiantada via T-106 |
| T-106 (juice) | ✅ **Feito nesta sessão (parte mecânica)** | Contagem 3-2-1, SFX sintetizado, vibração, flash/shake — ver seção 2.9. Falta o "teste cego com/sem juice" (T-106 é sobre percepção humana, não dá pra validar sozinho) |
| T-107 Balance pass | ✅ **Rodada 1 feita nesta sessão** | Ver seção 2.4 — **nota:** era a 1ª rodada de verdade, não a 2ª (ver seção 5) |
| T-108 Telemetria completa | ✅ **Feito nesta sessão** | Ver seção 2.8 |
| T-109 a T-110 | ⏳ Não iniciado | Precisam de playtest humano (Gate 1) |

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

**Atualização — verificação de pit/resumo natural fechada nesta 2ª metade da sessão:** rodei uma corrida inteira automatizada (145 eventos, ~145 cliques) até o fim. Isso encontrou um **3º bug real**: `updateHud()` e `updateIconPositions()` chamavam `currentEvent(state)`, que retorna `undefined` quando a corrida termina (`eventIndex >= events.length`) — o acesso a `.kind` daí lançava `TypeError` e travava a corrida bem no finalzinho (nunca mostrava o resumo). Corrigido: `updateHud()` mostra "Corrida encerrada" quando `finished`; `updateIconPositions()` usa o último evento da sequência como referência de posição nesse caso. Reconfirmado depois: corrida completa até a bandeira quadriculada, resumo certo ("Posição 8/12, Voltas completadas 8/8, Chegou à bandeira quadriculada"), sem erros. O evento de pit também foi atravessado sem problema (volta 4→5 sem travar).

### 2.4 T-107 — Balance pass, rodada 1

Ver seção 4 (achados anteriores) e seção 5 (o que mudou). Resultado final (500 corridas/perfil):

| Perfil | pos. média | DNF | vitórias | pódio |
|---|---|---|---|---|
| Casual | 6.73 | 2.0% | 0.0% | 0.0% |
| Médio | 4.11 | 0.0% | 0.0% | 5.2% |
| Skilled | 1.69 | 0.0% | **31.4%** | 100.0% |
| Temerário | 5.59 | 0.2% | 0.0% | 0.0% |

Bate com todas as metas da seção 5 do Claude-Tech.md: Médio entre 4º-7º ✅, DNF do Médio <15% ✅ (na verdade 0%), Skilled vence 30–40% ✅ (31.4%), Casual completa ≥70% das tentativas ✅ (98%). DNF não reabriu em nenhum perfil.

### 2.5 T-005 — Telemetria (PostHog + modo offline)

- `src/telemetry/analytics.ts`: wrapper com sink plugável (`configureAnalytics`/`track`). Sem `VITE_POSTHOG_KEY`, fica no `consoleSink` (modo offline). Zero dependência de Node — seguro pra bundlar no navegador.
- `src/telemetry/fileSink.ts`: modo offline em arquivo, **Node-only** (pro harness de bots usar no futuro) — deliberadamente separado do wrapper do navegador, porque `node:fs` quebraria o bundle do Vite se importado de `src/view/`.
- `.env.example` versionado (template); `.env` real gitignorado, com o token do Claude-Tech.md §3 preenchido.
- Ligados como prova de conceito: `session_start`/`session_end` (`main.ts`) e `race_start`/`race_end` (`RaceScene.ts`). **Deliberadamente não liguei** `challenge_result`, `boost_chosen`, `overtake`, `dnf`, `revive_decision` nem a tela de nota 1–5 — isso é escopo do T-108, não pedido nesta sessão.
- Só Product Analytics fica ligado no client (`capture_pageview`, `autocapture`, `disable_session_recording`, `capture_performance` todos desligados no `posthog.init()`), coerente com a decisão já registrada no Claude-Tech.md §3 de deixar os outros produtos do PostHog de fora por ora.
- **Verificação:** meus próprios testes automatizados (Playwright headless) deram falso negativo — não consegui ver a requisição de captura na rede, mesmo confirmando que (a) o token/host estavam corretos, (b) o SDK inicializava sem erro, (c) a rede alcançava a API do PostHog (testei com uma chamada HTTP direta, fora do browser). Investiguei bastante sem achar a causa exata; provavelmente uma particularidade do Chromium headless de sessão curta, não um bug no código. **O PO confirmou ao vivo no painel do PostHog** (`session_start`, `session_end`, `race_start` aparecendo na aba Activity, com timestamps reais de uma sessão jogada manualmente) — a integração funciona de verdade, só a minha verificação automatizada que não prestava pra esse caso específico.
- 5 testes novos (`tests/analytics.test.ts`, `tests/fileSink.test.ts`).

### 2.6 Traçado de Spa — 2 rodadas de correção (feedback do PO)

O traçado da T-003 (seção 2.1) era só "topologicamente plausível" — uma curva genérica, sem nenhuma tentativa séria de parecer com o circuito real.

**Rodada 1:** redesenhei de memória (La Source hairpin, reta de Kemmel, retorno por Blanchimont). O PO testou e disse que **continuava completamente errado**.

**Rodada 2 (a que ficou):** em vez de confiar na memória, busquei o mapa oficial do circuito (Wikipedia, `Spa-Francorchamps_of_Belgium.svg`) e tracei a topologia de verdade a partir da imagem anotada. Correções principais em relação à rodada 1: **Pouhon é uma curva ampla à direita** (uma volta em U de verdade, não perto da largada como eu tinha desenhado), **Bruxelles é uma ponta isolada e apertada** no lado direito do traçado (não fundida visualmente com o resto), e **Blanchimont é o retorno longo pelo lado esquerdo** de volta até a Bus Stop — não um "kink" curto do lado direito. A ordem dos 9 desafios curados bate com a sequência real do mapa: La Source → Eau Rouge/Raidillon → (reta de Kemmel) → Les Combes → Bruxelles → Pouhon → Fagnes/Campus → Stavelot → (Courbe Paul Frère) → Blanchimont → Bus Stop → largada.

Verificado visualmente no debug (T-003) e na view real do jogo em ambas as rodadas — a rodada 2 é a primeira vez que a silhueta bate com uma referência real, não só com minha própria leitura da rodada anterior. **Lição registrada:** pra geometria "real" (mapas, layouts, formas reconhecíveis), buscar uma referência de verdade em vez de reconstruir de memória — a rodada 1 parecia razoável olhando isolada, e só a comparação direta com a fonte revelou o quão errada estava.

### 2.7 T-006 — Deploy contínuo (GitHub Pages)

- Repositório criado pelo PO em `github.com/daniellimabr/racing-manager`; git local apontado pra ele (`origin`), branch renomeado de `master` pra `main` (era o nome herdado do `git init` da sessão anterior, antes de eu ajustar `init.defaultBranch`).
- `.github/workflows/deploy.yml`: a cada push na `main`, roda `npm ci && npm test && npm run build` e publica `dist/` via `actions/upload-pages-artifact` + `actions/deploy-pages`. PO trocou a fonte do Pages pra "GitHub Actions" nas configurações do repo (só o dono consegue mexer nisso).
- `vite.config.ts` ganhou `base: '/racing-manager/'` — o site fica em `daniellimabr.github.io/racing-manager/`, não na raiz do domínio; sem isso os assets quebrariam.
- Token do PostHog injetado como env var direto no passo de build do workflow (não fica em arquivo do repo) — é o mesmo project token write-only já documentado como seguro pra expor no client (Claude-Tech.md §3), agora alimentando o build de produção também, não só o `.env` local.
- **Autenticação do push:** não guardei nenhuma credencial neste ambiente (sem credential helper configurado). O PO gerou 2 tokens fine-grained de curta duração (repo `racing-manager`, permissões Contents + Workflows em "Read and write") e colou no chat pra eu usar só no comando do push — nunca gravados em `.git/config` nem em nenhum arquivo (usados só inline no argumento do comando). Os fine-grained tokens do GitHub exigem a permissão "Workflows" separada de "Contents" pra aceitar mudanças em `.github/workflows/` — na 1ª tentativa faltou essa permissão, corrigido gerando outro token já com as duas.
- Build de produção verificado localmente antes do push (`npm run build`, ~365 KB gzip no bundle principal — a maior parte é o Phaser; aviso de chunk grande do Vite, não bloqueia nada agora mas vale revisitar se afetar o load em 4G).
- 1ª run do workflow falhou com `startup_failure` — aconteceu antes do PO trocar a fonte do Pages pra "Actions", não é um problema no workflow em si.
- **Status ao encerrar esta sessão: deploy ainda não completou.** Depois da troca de fonte do Pages, mais 2 tentativas (push automático + disparo manual via `workflow_dispatch`) falharam com a mesma mensagem genérica do GitHub ("An unexpected error has occurred... Errors are sometimes temporary"). Confirmado via `githubstatus.com` que o componente **Actions estava em "partial outage"** no momento (2026-07-20, ~00:49 UTC) — não é problema de configuração do repo nem do workflow. **Próximo passo, sem precisar de mim:** quando o Actions do GitHub voltar ao normal, o PO clica em "Re-run all jobs" na run mais recente (ou "Run workflow" de novo) e deve completar. Não requer nenhuma mudança de código.

### 2.8 T-108 — Telemetria completa (eventos v1)

Sobre o que já existia do T-005 (`session_start`/`session_end`/`race_start`/`race_end`), completei o funil inteiro descrito no Claude-Tech.md §4:

- `challenge_result`: a cada desafio resolvido (trackId, challengeId, kind, tier, nitroUsed, overtakeAttempt, gapBefore/gapAfter, healthAfter).
- `boost_chosen`: ao confirmar a escolha (opções oferecidas + escolhida, volta).
- `overtake`: quando `resolveCurrent` reporta `positionChanged` (direção + contexto: `attempt`/`natural`/`pit`).
- `dnf`: no instante em que `raceState.dnf` vira `true` (motivo, volta, desafio).
- `revive_decision`: nos 2 botões do overlay de DNF — só dispara quando o revive de fato estava disponível como opção (não dispara um "recusou" falso quando não havia revive pra recusar).
- `race_end` ganhou `manualAbandon` (`true` quando termina via "Encerrar corrida" no overlay de DNF, `false` na chegada natural).
- Tela de fim ganhou o prompt "quer jogar de novo? (1–5)" — `feedback_score` ao clicar numa nota. Implementado com um sub-container próprio pra não destruir o texto do resumo ao mostrar "Valeu pelo feedback!".

Verificado visualmente (forçando DNF via corrida automatizada): resumo + prompt de feedback renderizam juntos sem sobreposição, clique na nota funciona, sem erros de console.

### 2.9 T-106 — Juice (parte mecânica)

`src/view/juice.ts`: SFX **sintetizados via Web Audio API** (osciladores + ruído filtrado) em vez de arquivos de áudio baixados de algum lugar — evita qualquer questão de licença nesta fase greybox e funciona offline, sem pipeline de asset. Vibração via `navigator.vibrate()` (Android; no-op silencioso em iOS/desktop, conforme já esperado no CLAUDE.md §9).

- Contagem regressiva 3-2-1 + "JÁ!" antes da largada, com beep a cada número e tom mais grave + flash branco de câmera no "JÁ!".
- Som de "clique" em todo botão (centralizado em `makeButton()`, um único lugar cobre boost/confirmar/nitro/ultrapassagem/TOCAR/revive/encerrar/nota).
- Resultado do desafio: roxo = tom agudo + vibração curta; verde = tom neutro; vermelho/miss = ruído + vibração + shake leve de câmera (só se causou dano de verdade); DNF = ruído mais forte + vibração em padrão + shake maior + flash vermelho.
- `juice.unlock()` chamado no 1º `pointerdown` da cena (política de autoplay dos navegadores exige gesto do usuário pra liberar `AudioContext`) — sem isso o primeiro som ficaria mudo.

**Não dá pra validar sozinho:** o critério de aceite do T-106 é "perceptível em teste cego com/sem juice" — isso é sobre percepção humana, só o PO consegue avaliar. Fiz a parte de engenharia (some, vibra, brilha, sacode); falta o julgamento de "está bom" ou "está exagerado/de menos".

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

1. **T-006 — concluir o deploy:** só falta o Actions do GitHub sair do "partial outage" e o PO clicar em "Re-run all jobs" (seção 2.7). Confirmar que `https://daniellimabr.github.io/racing-manager/` carrega o jogo de verdade antes de considerar o T-006 100% fechado (o build local já foi validado, só falta a publicação em si).
2. **T-105 (benchmark CSR2):** aguardando o PO instalar o jogo de referência e trazer feedback — é a única peça do feel pass que só um humano faz.
3. **Reavaliar `OVERTAKE_GAP_THRESHOLD`** contra a nova escala de `gapToAhead` — feedback já recebido do PO nesta sessão: "overtake parece ok". Considerar resolvido por ora; reabrir só se um playtest mais longo (T-109/T-110) indicar o contrário.
4. Se o Manager (M2) for consumir `RaceOutput.position`, revisitar a divergência entre posição do core e posição do grid (seção 3).
5. **T-109/T-110:** playtest estruturado (PO + irmãos) — bloqueia no Gate 1, é o próximo marco depois que o feel pass (T-105) fechar.
6. Chunk do bundle principal está grande (~365 KB gzip, majoritariamente Phaser) — considerar code-splitting se o load em 4G virar problema real no playtest.
7. **Traçado de Spa (seção 2.6):** corrigido nesta sessão com base num mapa real, mas ainda vale conferência humana — a curadoria de onde exatamente cada desafio "pega" no traçado é aproximada.

## 7. Como rodar

```
npm install
npm test        # 37 testes devem passar
npm run bots     # relatório de balanceamento (ver seção 2.4)
npm run dev      # jogo local
```

**Atenção ao `base` do Vite (T-006):** desde que `vite.config.ts` ganhou `base: '/racing-manager/'` (pra bater com o GitHub Pages), o dev server serve tudo sob esse prefixo — a URL fica `http://localhost:5173/racing-manager/index.html` (ou `/racing-manager/track-debug.html`), não mais na raiz. Se a porta 5173 já estiver ocupada, o Vite sobe na próxima livre (5174, etc.) — confira o terminal do `npm run dev` pra saber a URL exata.

Telemetria real (PostHog) precisa de um `.env` com `VITE_POSTHOG_KEY` (ver `.env.example`; token no Claude-Tech.md §3). Sem isso, fica em modo offline (console).

**Deploy publicado (quando o T-006 fechar de vez):** `https://daniellimabr.github.io/racing-manager/`
