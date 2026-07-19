# Claude-Tech.md — Engenharia, Projeto "Racing Manager"

> Documento companheiro do CLAUDE.md (design/PO) e do Claude-Marketing.md (produto/mercado/CPO). Este arquivo é o repositório de engenharia: decisões técnicas, arquitetura, organização das trilhas/agentes, telemetria, bots testadores e backlog priorizado.
> Dono: CTO (agente). Anexar em toda conversa/tarefa de desenvolvimento (Claude Code/Cowork).
> Ao decidir algo técnico, registrar aqui com data. Ao concluir tarefa, marcar status.
> Última atualização: 2026-07-19 (rodada 5 — conta PostHog criada e credenciais registradas, T-005 desbloqueada)

## 1. Organização do time (humanos + agentes)

| Papel | Quem | Responsabilidade |
|---|---|---|
| Product Owner | Você (humano) | Decide, aprova, testa builds (~1h/dia; sprints de 1 semana) |
| CPO | Agente (Claude-Marketing.md) | Mercado, persona, benchmarks, gates de retenção, fake-ads |
| CTO | Agente (este documento) | Arquitetura, decisões técnicas, especificação de tarefas, revisão, backlog |
| TechLead-Racing | Agente | Trilha Racing — ativo desde o M0 |
| TechLead-Manager | Agente | Trilha Manager — ativado a partir do M2 |
| Testers humanos | PO + 2 irmãos | Diversão, fricção, feedback qualitativo (gates) |
| Testers bots | Harness de simulação | Balanceamento quantitativo (parâmetros de corrida e, depois, economia) |

**Ritual do sprint (1 semana):** dia 1 — CTO publica a spec do sprint (tarefas com critérios de aceite); dias 2–6 — TechLead implementa e mantém o link de build atualizado; dia 7 — PO testa via roteiro de 5 minutos e dá go/no-go; CTO revisa, fecha o sprint e atualiza este documento.

### 1.1 Protocolo de documentação viva (um `.md` por função)

Cada agente é dono de um documento e o mantém atualizado **sozinho**, sem que o PO precise pedir — é parte do trabalho, não uma tarefa à parte.

| Documento | Dono | Escopo |
|---|---|---|
| `CLAUDE.md` | PO / visão de produto (transversal) | Pilares, decisões de design, telas, glossário — a fonte da verdade sobre "o que é o jogo" |
| `Claude-Marketing.md` | CPO | Mercado, persona, benchmarks, gates de retenção, ativos de validação |
| `Claude-Tech.md` | CTO (este documento) | Arquitetura, decisões técnicas, marcos, backlog macro, riscos |
| `Claude-Racing.md` | TechLead-Racing | Detalhe de implementação da trilha Racing: decisões técnicas locais, estado do backlog, aprendizados de cada sprint |
| `Claude-Manager.md` | TechLead-Manager | O mesmo, para a trilha Manager (criado quando o agente for ativado, no M2) |

**Regras do protocolo:**

1. **Atualização automática, não sob demanda.** Ao final de cada sessão/sprint, ou sempre que uma decisão relevante for tomada durante a conversa, o agente edita seu próprio `.md` — data, o que mudou, por quê. Se a sessão não gerou decisão nova, não precisa editar por editar.
2. **Formato consistente** com os documentos existentes: cabeçalho com data da última atualização e uma linha de resumo da rodada; tabela de decisões datadas; seção de questões em aberto; próximos passos.
3. **Cross-reference, não duplicação.** Se uma decisão de um TechLead afeta outra trilha ou a visão geral, ele não copia o conteúdo para o outro arquivo — registra no próprio documento e sinaliza claramente (ex.: "→ impacta Claude-Tech.md: revisar contrato RaceInput") para o CTO propagar na revisão do sprint. O CTO é quem mantém os três documentos centrais (CLAUDE.md, Claude-Marketing.md, Claude-Tech.md) coerentes entre si.
4. **No Claude Code/Cowork**, isso é literal: o agente tem acesso ao sistema de arquivos do repositório e edita o `.md` diretamente a cada sessão, como faz com qualquer outro arquivo. Não depende do PO re-anexar nada — o arquivo vive versionado no repo junto com o código.
5. **Nesta interface (claude.ai / Projeto)**, como os agentes não escrevem direto nos arquivos do Projeto, cabe ao PO substituir a versão anexada pela versão gerada ao final de cada conversa relevante — o agente sempre avisa quando um documento foi atualizado e precisa ser re-anexado.
6. **O CTO nunca deixa um TechLead nascer com spec defasada:** ao abrir um novo sprint ou ativar um novo TechLead, o CTO confere se os documentos anexados estão na rodada mais recente antes de distribuir tarefas.

**Definition of Done (toda tarefa):** build compila e o deploy está atualizado; testes do core passam; eventos de telemetria dos fluxos novos implementados; roteiro de fumaça sem regressão; documentos atualizados se a spec mudou.

## 2. Trilhas de desenvolvimento

- **Trilha 0 — Fundação/Plataforma** (CTO + TechLead-Racing, no M0): stack, estrutura do projeto, contrato Manager↔Racing, pista-como-dado, telemetria, harness de bots, deploy.
- **Trilha 1 — Racing** (TechLead-Racing, M1 em diante): módulo da corrida — pista, tela de corrida, mecânica, feel, conteúdo de circuitos.
- **Trilha 2 — Manager** (TechLead-Manager, M2 em diante): meta-game — energia, hub, peças/fusão, sede/escritórios, pilotos/equipe, loja.
- **Trilha 3 — Arte/Conteúdo/Som** (futura): direção de arte, VFX, trilha sonora, volume de pistas. Fora de escopo até o Gate 1 — estética greybox basta para validar diversão.

**Regra de sequenciamento (herdada do CPO):** a trilha Racing lidera. Meta-game mínimo só após o Gate 1 (diversão validada). UA/monetização muito depois. As trilhas não têm peso igual no começo.

## 3. Decisões técnicas (DEFINIDO)

| Data | Decisão |
|---|---|
| 2026-07-19 | **Stack de validação: TypeScript + Phaser + Vite**, jogo web mobile em retrato, hospedado como site estático gratuito. Motivos: iteração máxima; link jogável compartilhável (WhatsApp); domínio amplo dos agentes; 2D/tweens/input cobertos pela engine; 100% gratuito. Versão exata do Phaser (3.x estável ou 4 se estável) confirmada pelo TechLead na T-001 |
| 2026-07-19 | **Arquitetura em 2 camadas:** `core/` = simulação pura em TypeScript, sem nenhuma dependência de engine (estado da corrida, gaps, zonas de timing, dano, grid, e futuramente economia); `view/` = Phaser renderiza e captura input. Regra dura: nenhuma lógica de jogo dentro da camada Phaser. Ganhos: (a) porte futuro para engine nativa troca só a view; (b) o core roda "headless" — é a base do harness de bots |
| 2026-07-19 | **Pista como dado:** cada circuito é um arquivo JSON em `tracks/` com: traçado (polilinha normalizada para desenho), lista curada de desafios (id, nome, tipo saída/frenagem, dificuldade base, posição no traçado), voltas da corrida, posição do pit e volta do pit obrigatório. Curadoria de pistas = edição de dados, não código |
| 2026-07-19 | **Contrato Manager↔Racing v1 (congelado antes da paralelização):** `RaceInput { carSetup: { zoneScale, healthMax, nitroCharges }, pitCrewQuality, trackId, championshipRound }` → `RaceOutput { position, dnf, reviveUsed, durationSec, gold, partsDrops[], events[] }`. No M1, o RaceInput usa valores padrão fixos; no M2, o Manager passa a alimentá-lo |
| 2026-07-19 | **Persistência local** (localStorage/IndexedDB) até o M2. Sem backend/nuvem por ora; só entra se o Gate 2 exigir (sync entre aparelhos, leaderboard) |
| 2026-07-19 | **Telemetria: PostHog (tier gratuito)** atrás de um wrapper próprio (`analytics.ts`) para permitir troca de fornecedor sem dor. Modo offline: eventos logados em arquivo local (mesmo formato) — usado também pelos bots |
| 2026-07-19 | **Conta PostHog criada pelo PO.** Project token (write-only, seguro para expor no client): `phc_rVnVUkBRjhXiEesYFbuYnXzbb76UQyfPthD9wXT9zMdV` · Project ID: `519550` · Região: US Cloud → API Host `https://us.i.posthog.com`. Produto habilitado: só Product Analytics (Web Analytics, Session Replay, Error Tracking etc. deliberadamente deixados de fora por ora). Desbloqueia a T-005 — o `analytics.ts` deve ler o token de uma env var (`VITE_POSTHOG_KEY`), não hardcoded, mesmo sendo uma chave "segura para público" |
| 2026-07-19 | **Deploy contínuo** em hospedagem estática gratuita (Vercel/Netlify/GitHub Pages — TechLead escolhe na T-006), com um link fixo de "última versão" para o PO e testers |
| 2026-07-19 | **Git:** repositório inicializado na migração para o Claude Code. Agentes operam o repo; o PO não precisa tocar em git (sessões pelo celular = decisão/revisão via conversa) |
| 2026-07-19 | **Reavaliação de engine no Gate 1→M2:** caminho A (provável) — manter web e empacotar com Capacitor para as lojas; caminho B — portar a view para Godot/Unity se performance ou feel exigirem. O core em TS puro protege o investimento nos dois caminhos |
| 2026-07-19 | **Alvo de performance:** Android de entrada (~2 GB RAM, Chrome), 60 fps na tela de corrida, load < 5 s em 4G. Herdado do soft launch Brasil (Claude-Marketing.md) |
| 2026-07-19 | **pt-BR nativo**, com strings centralizadas desde o início (i18n barato agora, caro depois) |
| 2026-07-19 | **Primeira pista real: Spa-Francorchamps**, com curadoria proposta de 9 desafios (ver seção 6). Corrida em Spa: 8 voltas, pit obrigatório ao fim da volta 4 |

## 4. Telemetria

**O que é:** o jogo registra automaticamente eventos de gameplay e sessão, enviados ao PostHog (ou gravados localmente). Transforma os gates do CPO (D1 ≥ 30%, D7 ≥ 18%) e o balanceamento em decisões baseadas em dados.

**Eventos v1:**

| Evento | Propriedades |
|---|---|
| `session_start` / `session_end` | duração, plataforma, versão do build |
| `race_start` | trackId, championshipRound |
| `challenge_result` | trackId, challengeId, kind (saida/frenagem/pit), tier (roxo→falha), nitroUsed, overtakeAttempt, gapBefore, gapAfter, healthAfter |
| `boost_chosen` | opções ofertadas, escolhida, volta |
| `overtake` | direção (ganhou/perdeu posição), contexto (tentativa, natural, pit) |
| `dnf` | motivo, volta, desafio |
| `revive_decision` | aceitou/recusou |
| `race_end` | posição, duração, voltas completadas, abandono manual |
| `feedback_score` | nota 1–5 "quero jogar de novo?" (tela de fim, M1) |

**Perguntas que responde:** onde os jogadores morrem (mapa de calor por desafio)? O revive é aceito? Qual a duração real da corrida? Quem erra a largada abandona mais? Retenção D1/D7 quando houver mais testers.

## 5. Bots testadores (harness de simulação)

**O que é:** um executável de linha de comando que roda o `core/` sem interface, milhares de corridas em segundos, com "políticas de jogador" simulando perfis humanos. Atende diretamente ao pedido do PO de usar agentes de IA para definir parâmetros do jogo.

**Perfis v1** (distribuição de acerto por zona + política de risco):

| Perfil | Roxo | Verde | Amarelo | Vermelho/Falha | Política |
|---|---|---|---|---|---|
| Casual | 5% | 25% | 45% | 25% | raramente tenta ultrapassar; usa nitro cedo |
| Médio | 15% | 40% | 35% | 10% | tenta ultrapassar com gap < 0,5 s; nitro em ultrapassagem |
| Skilled | 35% | 45% | 17% | 3% | agressivo com gap < 1 s; nitro otimizado |
| Temerário | 15% | 30% | 30% | 25% | tenta tudo; sempre usa nitro |

**Saídas do relatório:** taxa de DNF por perfil; distribuição de posições finais; duração média da corrida; "curvas assassinas" (dano/DNF por desafio); sensibilidade de parâmetros (o que acontece se GAIN do roxo subir 10%?).

**Metas iniciais de calibração (proposta do CTO, a validar):** corrida ≈ 5 min; perfil Médio termina entre 4º e 7º; DNF do Médio < 15%; Skilled vence com frequência mas não sempre (30–40% das corridas); Casual completa a prova em ≥ 70% das tentativas.

**No M2:** os mesmos bots passam a simular a economia — dias de coleta/fusão/upgrade — para calibrar taxas dos escritórios, custos e drops.

**Limite honesto:** bots validam matemática e balanceamento; não medem diversão. O Gate 1 é humano, sempre.

## 6. Curadoria proposta — Spa-Francorchamps (9 desafios)

Proposta do CTO para a T-003, sujeita a ajuste do TechLead/PO:

1. La Source (hairpin) — frenagem forte
2. Eau Rouge + Raidillon — 1 desafio (exemplo canônico do CLAUDE.md)
3. Les Combes (chicane) — 1 desafio
4. Bruxelles/Rivage — 1 desafio
5. Pouhon (dupla à esquerda) — 1 desafio
6. Fagnes (chicane) — 1 desafio
7. Stavelot — 1 desafio
8. Blanchimont — 1 desafio (alta velocidade, zona estreita)
9. Bus Stop (chicane) — 1 desafio; entrada do pit logo após

## 7. Marcos e gates

| Marco | Conteúdo | Gate de saída |
|---|---|---|
| **M0 — Fundação** (Sprint 1) | Projeto estruturado, core extraído, Spa como dado, harness v1, telemetria, deploy | Tudo roda: bots geram relatório; link abre no celular |
| **M1 — Corrida jogável** (Sprints 2–4) | Spa completo, grid de 12 carros simulado (10 oponentes + 2 do jogador), tela de corrida final (Q12), feel pass, boosts/pit/DNF/revive/resumo | **Gate 1 (humano):** playtest com PO + irmãos; funil de telemetria saudável; "quer jogar de novo?" ≥ 4/5 |
| **M2 — Meta mínimo viável** (Sprints 5–8, ~4–6 semanas conforme regra do CPO) | Energia, recompensas pós-corrida, inventário + fusão + upgrade afetando zonas, hub Garagem, persistência | **Gate 2:** D7 direcional com círculo ampliado de testers; economia validada pelos bots |
| **M3+** | Sede/escritórios, pilotos/equipe, carro 2 IA pontuando, campeonato de 10 corridas, categorias, loja/baús, leaderboard assíncrono (sonda do risco P3 do CPO) | Por época, a definir |

## 8. Backlog priorizado

### Sprint 1 — M0 Fundação (TechLead-Racing)

**Status (2026-07-19): T-001 a T-004 concluídos numa sessão pelo celular, sem IDE — detalhes e um achado de balanceamento importante em `Claude-Racing.md`. T-005/T-006 pendentes (precisam de contas externas, melhor feitas com sessão completa).**

| ID | Tarefa | Critério de aceite |
|---|---|---|
| T-001 | ✅ Estrutura do projeto: Vite + TS + Phaser; pastas `core/`, `view/`, `tracks/`, `tools/`; lint básico | `npm run dev` sobe; canvas retrato vazio renderiza no celular |
| T-002 | ✅ Extrair o core do greybox para TS puro: estado da corrida, zonas/tiers, gap, dano/saúde, nitro, pit, DNF/revive — com testes unitários | Suíte de testes roda sem browser (22 testes, vitest); paridade de comportamento com o greybox v2 |
| T-003 | ⏳ Formato de pista (schema JSON) + `tracks/spa.json` com a curadoria da seção 6; render de debug do traçado | Schema validado ✅; traçado de Spa desenhado na tela com os 9 pontos de desafio marcados — **pendente**, precisa de canvas |
| T-004 | ✅ Harness de bots v1 (CLI): N corridas × perfil → relatório (DNF, posições, duração, curvas assassinas) | 1.000 corridas < 10 s ✅ (500 em <1s); relatório gerado ✅ — **revelou DNF de 56–100% com as constantes atuais, ver Claude-Racing.md seção 3** |
| T-005 | Telemetria: PostHog + modo offline | Pendente — depende de conta PostHog do PO |
| T-006 | Deploy contínuo + link fixo | Pendente — depende de conta de hospedagem do PO |

### Sprint 2 — M1 Corrida em Spa com grid completo

| ID | Tarefa | Critério de aceite |
|---|---|---|
| T-101 | Simulação do grid: 12 carros (2 do jogador + 10 IA), pace por carro/equipe, gaps entre todos, posições derivadas; desafio focado no carro da frente | Posições consistentes ao longo da prova; ultrapassagens entre IAs acontecem; live-timing de todos disponível no estado |
| T-102 | Tela de corrida: Spa inteiro visível, ícones escalonados conforme Q12 (jogador maior; P1–P3 destacados; demais pequenos), HUD com posição/volta/saúde/gap | Legível em tela de 5–6 pol.; 60 fps em Android de entrada |
| T-103 | Fluxo completo integrado ao core: saída → frenagem (decisão de ultrapassagem com gap < 1 s antes de cada frenagem de curva); boost 1x por volta (na saída da reta principal); pit obrigatório na volta 4; DNF/revive; resumo | Corrida completa de ponta a ponta sem erro; regras batem com o CLAUDE.md |
| T-104 | Animações entre eventos: carros percorrendo o traçado real, gap animando (0,8–1,2 s por trecho) | Sensação de corrida contínua; sem "teleporte" de ícones |

### Sprint 3 — M1 Feel e calibração

| ID | Tarefa | Critério de aceite |
|---|---|---|
| T-105 | Benchmark CSR2: roteiro de 15 min para PO + irmãos (o que observar no timing de troca de marcha); tradução em parâmetros da barra (curva de velocidade do cursor, tempo-limite por dificuldade, antecipação visual) | Documento curto de achados + parâmetros ajustados no core |
| T-106 | Juice: vibração (Vibration API — Android; iOS web não suporta, compensar com áudio/visual), SFX gratuitos (largada, perfeito, batida), flash/shake leves, contagem 3-2-1 na largada | Perceptível em teste cego "com/sem juice" |
| T-107 | Balance pass 1 via harness: calibrar GAIN por tier, dano, escala de zonas e pace das IAs contra as metas da seção 5 (**ponto de partida: DNF de 56–100% encontrado na sessão do Sprint 1, ver Claude-Racing.md**) | Relatório dos bots dentro das metas; parâmetros versionados |
| T-108 | Telemetria integrada em todos os eventos v1 + tela de fim com nota 1–5 | Funil completo visível no PostHog em um teste real |

### Sprint 4 — M1 Gate 1

| ID | Tarefa | Critério de aceite |
|---|---|---|
| T-109 | Correções e polimentos do playtest interno do PO | Lista de bugs do PO zerada ou triada |
| T-110 | Playtest estruturado: 3 sessões (PO + 2 irmãos), roteiro + coleta de telemetria + nota | Relatório Gate 1 (CTO + CPO): funil, notas, recomendação go/no-go para M2 |

### M2 — Épicos (detalhamento de tarefas após o Gate 1)

E-201 Energia (teto 30, custo 5, regen a definir com bots) · E-202 Recompensas pós-corrida (Gold + drops de peças por posição) · E-203 Inventário + fusão 3→1 + upgrade → `zoneScale` real no RaceInput · E-204 Hub Garagem/QG + navegação · E-205 Persistência local completa · E-206 Balance econômico via harness estendido.

### M3+ — Épicos

E-301 Sede/escritórios (produção passiva + coleta) · E-302 Pilotos e equipe/staff (efeitos no RaceInput: pitCrewQuality, dev. do carro) · E-303 Carro 2 IA pontuando (campeonato de construtores) · E-304 Campeonato de 10 corridas + progressão Kart→Turismo→Fórmula · E-305 Loja/baús · E-306 Leaderboard assíncrono de tempo de volta (sonda barata do risco P3) · E-307 Novas pistas (pipeline de dados da T-003).

## 9. Riscos técnicos e mitigações

| Risco | Mitigação |
|---|---|
| Feel do timing no navegador (latência de toque) | Medir input latency na T-106; testar cedo em Android fraco; se falhar, antecipa a decisão de engine do Gate 1 |
| Escopo da simulação do grid crescer demais | Modelo 1D de gaps (sem física 2D real); IAs são curvas de pace + ruído, nada mais no M1 |
| Bots "aprovarem" um jogo chato | Gate 1 é humano e obrigatório; bots só calibram números |
| Poucos testers humanos | Roteiro estruturado + telemetria maximizam sinal de 3 pessoas; ampliar círculo no M2 |
| Contexto dos agentes se perder entre sessões | Os 3 documentos (.md) anexados em toda conversa; CTO atualiza este arquivo ao fim de cada sprint |
| Vibração indisponível em iOS web | Compensação por áudio/efeito visual; háptico real fica para o empacotamento nativo (Capacitor) |

## 10. Questões em aberto (engenharia)

- Nome/URL do link fixo de build (definido na T-006).

## 11. Próximos passos imediatos

1. PO aprova este plano (ou ajusta) e responde as 2 confirmações pendentes.
2. Migração para Claude Code/Cowork: init do repositório, anexar os 3 documentos, executar o Sprint 1 (M0) com o TechLead-Racing.
3. CPO em paralelo: fake-ad e deep-dive de CSR2 (o deep-dive alimenta a T-105).
