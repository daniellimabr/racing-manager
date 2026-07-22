# Claude-Manager.md — Trilha Manager, Projeto "Racing Manager"

> Documento vivo mantido pelo agente TechLead-Manager (ver protocolo em Claude-Tech.md, seção 1.1).
> Anexar junto com CLAUDE.md e Claude-Tech.md em conversas sobre a trilha Manager.
> Última atualização: 2026-07-22 (pedido pontual feito dentro de uma rodada da trilha Racing, cross-referenciado aqui: botão "Coletar tudo" na Sede — coleta a produção pendente dos 7 escritórios numa tacada só, em vez de 1 por 1. `collectAllOfficeParts()` novo em `gameSave.ts`. Ver seção 2.12.)
>
> Última atualização anterior: 2026-07-21 (sessão 5 — 3 épicos entregues numa rodada grande autorizada pelo PO sem interrupção: **Pilotos + Carro 2 pontuando (E-302/E-303)** — roster fixo de 4 pilotos contratáveis, Carro 2 (companheiro de IA) finalmente configurável em vez do perfil "Médio" fixo, `GameSave` v5; **patrocinadores da livery + escritório de marketing** — pendência antiga (seção 5, item 6, registrada desde a sessão 4) finalmente destravada, 8 patrocinadores pra 6 posições, custo em Reputação produzida pelo escritório de marketing, `GameSave` v6; **Loja/baús + Aura (E-305)** — 4 tiers de baú, moeda premium Aura ganha só de pódio (IAP real continua fora de escopo), `GameSave` v7. 169/169 testes, tsc limpo, build ok, smoke test manual (Playwright) das 3 telas novas sem erro de console. Ver seção 2.11 pro detalhe técnico completo.)
>
> Última atualização anterior: 2026-07-21 (sessão 4 — trabalho feito dentro de uma rodada grande da trilha Racing, a pedido direto do PO ["listar tarefas do Manager também, atacar sem esperar interferência"], cross-referenciado aqui: **Sede do time (E-301) entregue** — 7 escritórios de produção passiva de peças (1 por tipo de peça; o de marketing ficou de fora de propósito, depende do sistema de patrocinadores da livery, ainda não desenhado), primeiro sink real de Gold do jogo. `GameSave` v4. Achado e corrigido um bug real no processo: `defaultSave()` usava `Date.now()` internamente em vez do `nowMs` recebido por `loadGame()` — mascarado até então porque a energia começa sempre no teto (que resincroniza o relógio na 1ª chamada), mas quebrava silenciosamente a produção dos escritórios (que começam vazios, sem esse atalho). Ver seção 2.10.)
>
> Última atualização anterior: 2026-07-21 (sessão 3 — trabalho feito dentro de uma rodada da trilha Racing, a pedido direto do PO ["tela de instrução" + "avançar nos menus"], cross-referenciado aqui: `TutorialScene` nova (E-208, 3 páginas estáticas, opção A escolhida pelo PO entre 4 propostas), `GameSave` v3 (`hasSeenTutorial`, migração v1/v2→v3 trata saves existentes como "já viu"), e aviso na tela de resumo quando a fusão automática troca a peça que o jogador tinha equipado de propósito (fechava a pendência da seção 5 item 3 abaixo). Ver seção 2.9.)
>
> Sessão 1 (mesma data) — ativação da trilha Manager, Sprint 5/M2: E-201 a E-206 implementados de ponta a ponta numa rodada autônoma. Modelo de economia proposto do zero pelo TechLead-Manager, calibrado com um harness novo (`tools/economyHarness.ts`) em 2 rodadas de ajuste — a 1ª revelou que o modelo generoso demais deixava um jogador engajado (3x/dia) alcançar a raridade MÁXIMA de peça em só 21 dias; recalibrado pra isso levar meses. Hub/Garagem novo vira a tela inicial do jogo; corrida agora debita energia e paga Gold/peças reais ao final, tudo persistido em localStorage via wrapper próprio.

## 1. Status do backlog

| Épico | Status | Nota |
|---|---|---|
| E-201 Energia | ✅ Feito | Teto 30/custo 5 já eram decisão aprovada (CLAUDE.md §6.2); taxa de regen (12 min/ponto) é a proposta desta sessão — ver seção 2.1 |
| E-202 Recompensas pós-corrida | ✅ Feito | Gold por posição + peças, aplicados e exibidos na tela de resumo — ver seção 2.2 |
| E-203 Inventário + fusão 3→1 + `zoneScale` real | ✅ Feito | Modelo real de peças/fusão/`zoneScale`, equipar agora é escolha manual do jogador (ver E-207) — ver seção 2.3 |
| E-204 Hub Garagem/QG | ✅ Feito | Nova cena `HubScene`, vira a tela inicial — ver seção 2.4 |
| E-205 Persistência local | ✅ Feito (v2, migração v1→v2 nesta sessão) | `src/persistence/storage.ts` (wrapper) + `gameSave.ts` (schema) — ver seção 2.5 |
| E-206 Balance econômico via harness | ✅ Feito (2 rodadas de calibração) | `tools/economyHarness.ts` — ver seção 2.6 |
| E-207 Oficina (equipar manual) | ✅ Feito (sessão 2, 2026-07-21) | Nova cena `OficinaScene`; PO rejeitou auto-equip como solução permanente (pergunta 5 fechada) — ver seção 2.8 |
| E-208 Tutorial (TutorialScene) | ✅ Feito (sessão 3, 2026-07-21) | Opção A (estática, 3 páginas) escolhida pelo PO — ver seção 2.9 |
| Aviso de fusão trocando peça equipada | ✅ Feito (sessão 3) | Fechava a pendência da seção 5 item 3 — ver seção 2.9 |
| E-301 Sede/escritórios | ✅ Feito (sessão 4, 2026-07-21) | Adiantado do M3+ original. 7 escritórios (marketing fica de fora, depende do sistema de patrocinadores). Nova `SedeScene`, `GameSave` v4 — ver seção 2.10 |
| E-302 Pilotos (contratar/escalar) | ✅ Feito (sessão 5, 2026-07-21) | Roster fixo de 4, custo em Gold. Nova `PilotosScene`, `GameSave` v5 — ver seção 2.11 |
| E-303 Carro 2 pontuando de verdade | ✅ Feito (sessão 5, 2026-07-21) | Companheiro de IA configurável via piloto escalado (`TeammateProfile`, `core/grid.ts` — trilha Racing). Resumo da corrida mostra a posição do Carro 2 — ver seção 2.11 |
| Patrocinadores da livery + escritório de marketing | ✅ Feito (sessão 5, 2026-07-21) | Pendência da seção 5 item 6 (desde a sessão 4) — 8 patrocinadores/6 posições, custo em Reputação. `GameSave` v6 — ver seção 2.11 |
| E-305 Loja/baús + Aura | ✅ Feito (sessão 5, 2026-07-21) | 4 tiers de baú, Aura só de pódio (IAP real fora de escopo). `GameSave` v7 — ver seção 2.11 |
| Sede — botão "Coletar tudo" | ✅ Feito (2026-07-22) | `collectAllOfficeParts()`, coleta os 7 escritórios de uma vez — ver seção 2.12 |

**Como rodar:** `npm install && npm test && npm run economy && npm run dev` (Hub é a tela inicial; botão OFICINA leva à nova tela de equipar; `npm run bots` continua sendo o harness da trilha Racing, não tocado aqui).

## 2. O que foi feito nesta sessão — decisões técnicas

### 2.1 Modelo de energia (E-201)

Teto (30) e custo por corrida (5) já eram decisão aprovada no CLAUDE.md §6.2 — não são propostos por mim. A taxa de regeneração (minutos por ponto) era explicitamente delegada a mim pelo CLAUDE.md ("no espírito Archero").

**Processo (vale registrar por causa de um erro corrigido no meio do caminho):** minha 1ª proposta citou de memória "Archero regenera 1 stamina a cada ~6 min, com teto de 144" — decidi verificar essa citação via busca antes de fechar a documentação (já que ela seria usada como justificativa formal de um número de design), e a memória estava errada: o Archero real regenera **1 energia a cada 12 minutos**, com teto **20 (ou 30 com o Battle Pass)**. Como nosso teto (30) já bate exatamente com o teto "boostado" do Archero, ajustei a taxa por ponto para a real (12 min), não a inventada.

**Resultado:** `ENERGY_REGEN_MINUTES_PER_POINT = 12` (`src/core/economy.ts`). Refill completo do zero: 30 × 12 = 360 min (6h). Recarregar 1 corrida (5 energia): 60 min (1h). Isso cria uma dinâmica emergente interessante confirmada pelo harness (seção 2.6): sessões espaçadas por menos de ~1h entre si não regeneram energia suficiente para "aproveitar" a visita extra — o jogador precisa espaçar as visitas para tirar proveito total do teto, igual ao comportamento real do Archero.

`applyEnergyRegen()` preserva o resto de milissegundos não convertido em ponto inteiro entre chamadas (não "reseta o relógio" a cada load/save) — testado em `tests/economy.test.ts`.

### 2.2 Recompensas pós-corrida (E-202)

**Gold por posição** (`GOLD_BY_POSITION`, `src/core/economy.ts`): tabela 1-indexed, P1=120 até P12=25 (curva suave, não um degrau — todo mundo ganha algo, pódio ganha claramente mais, P1 é 4,8× P12). Penalidade de crash (`GOLD_CRASH_PENALTY`, já existente no core da trilha Racing) é subtraída, nunca deixando o Gold líquido negativo.

**Peças:** ver seção 2.3 (modelo compartilhado com a fusão).

**Onde entra:** `RaceScene.showSummary()` calcula a recompensa 1x (guardado pelo mesmo campo `raceEnded` que já protegia a telemetria de disparar 2x), aplica ao save via `applyRaceRewards()` (persiste Gold + peças + roda fusão automática) e exibe o resultado na tela — Gold ganho, peças ganhas, fusões ocorridas. A tela de resumo precisou ser redesenhada pra ocupar o canvas inteiro (não só a faixa de 220px usada durante a corrida) porque o número de linhas agora é variável (ver "O que ficou stub" na seção 2.7 sobre esse ponto de integração).

**Decisão de design registrada:** a recompensa usa a posição do **grid** (`GridStanding.position`, a mesma que o HUD mostrou a corrida inteira), não `RaceOutput.position` (o modelo 1D do core, que a trilha Racing já documentou como podendo divergir do grid — Claude-Racing.md §3). Julguei mais correto pagar pela posição que o jogador efetivamente viu na tela, mesmo o pedido original desta tarefa citando `RaceOutput.position` como a fonte — ver pergunta 1 na seção 3 (não é uma decisão que eu deveria travar sozinho, já que é uma divergência conhecida entre os dois módulos).

### 2.3 Inventário, fusão 3→1 e `zoneScale` real (E-203)

**Modelo de dados (`src/core/economy.ts`):** 7 slots (`motor`, `asaDianteira`, `asaTraseira`, `chassis`, `suspensao`, `pneu`, `livery` — CLAUDE.md §7/Q7) × 6 raridades (`gray→green→blue→purple→gold→red` — CLAUDE.md §9/Q9). `PartInventory.counts[slot][rarity]` é uma contagem simples de posse. **Atualizado na sessão 2 (E-207, ver seção 2.8):** a peça "equipada" de cada slot deixou de ser sempre derivada automaticamente como a melhor raridade possuída — agora é uma escolha explícita e persistida do jogador (`PartInventory.equipped`), com fallback automático só quando não há escolha própria ou ela deixou de existir no inventário. A sessão 1 (histórico, mantido abaixo por completude) tinha implementado só o auto-equip, como scaffolding temporário até a Oficina existir — o PO rejeitou isso como solução permanente (seção 3, pergunta 5, fechada).

**Fusão 3→1 (`fuseAll()`):** 3 peças iguais (mesmo slot + raridade) viram 1 da raridade seguinte, em cascata (uma fusão pode gerar material pra próxima). `red` é o topo — peças nela só se acumulam.

**`zoneScale` real (`computeZoneScale()`):** soma um bônus por raridade equipada em cada um dos 7 slots (`RARITY_ZONE_BONUS`: gray=0 até red=0.08), somado a 1 (base). Com os 7 slots maxados em `red`, o bônus total é 0,56 (zoneScale efetivo 1,56) — deliberadamente conservador, já perto do teto global `MAX_SCALE` (1.5, `core/constants.ts`, dono é a trilha Racing) mesmo sem contar os outros multiplicadores (pit, boost, saúde) — maxar todos os 7 slots é conteúdo de muito longo prazo (ver seção 2.6), não deveria por si só tornar irrelevantes os outros sistemas de dificuldade da corrida.

**Ponto de integração com a corrida:** achei `DEFAULT_CAR_SETUP` usado direto em `RaceScene.create()` (`this.carSetup: CarSetup = DEFAULT_CAR_SETUP`, campo da classe). Adicionei um método `init(data: { carSetup?: CarSetup })` — Phaser chama `init()` antes de `create()` toda vez que a cena inicia, recebendo o que foi passado em `scene.start('RaceScene', { carSetup })`. `HubScene.startRace()` monta esse `carSetup` a partir de `DEFAULT_CAR_SETUP` (fallback pra `healthMax`/`nitroCharges`, que peças NÃO afetam nesta sprint) + `computeZoneScale(inventory)` real. Se a cena for iniciada sem dado (ex.: direto, sem passar pelo Hub), `this.carSetup` mantém o valor padrão do campo da classe — sem regressão pro fluxo antigo.

### 2.4 Hub / Garagem (E-204)

`src/view/HubScene.ts`, cena Phaser nova, virou a **1ª cena do jogo** (`src/view/main.ts`: `scene: [HubScene, RaceScene]`, era só `[RaceScene]`).

Mostra: 2 carros (placeholder greybox — retângulo + triângulo simulando uma silhueta de carro, no mesmo espírito greybox do resto do jogo nesta fase; carro 2 rotulado "IA (companheiro — em breve)", já que o carro 2 de verdade é E-303/M3+, fora de escopo), energia (barra + "X/30" + contagem regressiva pro próximo ponto, ou "Energia cheia" no teto), Gold, um resumo textual das peças (melhor raridade por slot + o `zoneScale` resultante — não é a tela de Oficina, só uma prévia legível do que `computeZoneScale` está calculando de verdade) e o botão CORRER.

**Botão CORRER:** verde/habilitado quando `energy >= ENERGY_COST_PER_RACE`; cinza + texto "Energia insuficiente" caso contrário (não é só um desabilitar visual raso — o handler de clique também checa `canAffordRace` antes de agir, então nem um clique "por trás" do estado cinza faz nada). Ao clicar: debita energia, persiste, monta o `carSetup` real e chama `scene.start('RaceScene', { carSetup })`.

A energia é reavaliada a cada 1s (`this.time.addEvent`) sem reescrever o `localStorage` a cada tick — só quando o valor efetivamente muda (comparado com o save já carregado em memória).

### 2.5 Persistência local (E-205)

`src/persistence/storage.ts`: wrapper genérico (`loadJSON`/`saveJSON`/`clear`), nenhuma outra parte do código deveria chamar `localStorage` diretamente (mesmo princípio já usado em `src/telemetry/analytics.ts`). Cai para um `Map` em memória se `localStorage` não existir ou lançar (harness/testes em Node sem DOM; Safari modo privado; quota estourada) — o jogo continua funcionando, só sem persistir entre recargas nesses casos.

`src/persistence/gameSave.ts`: o schema de fato (`GameSave { version, gold, energy, energyLastUpdateMs, inventory }`) + `loadGame()` (carrega e já aplica o regen decorrido, persistindo o resultado — "abrir o app"), `saveGame()`, `spendEnergyForRace()`, `applyRaceRewards()` (soma Gold, recebe peças, funde automaticamente, persiste, retorna as fusões ocorridas pra exibir).

**Testado via `tests/gameSave.test.ts`** (fallback em memória, já que vitest roda em Node) **e via smoke test real em Chromium** (`localStorage` de verdade — ver seção 2.7) — os dois caminhos foram verificados, não só o fallback.

### 2.6 Harness de economia (E-206) — resultados e as 2 rodadas de calibração

`tools/economyHarness.ts` (novo, separado de `tools/botHarness.ts` — não toquei nesse arquivo, é da trilha Racing). Simula **21 dias** de um jogador, com **100 jogadores simulados por cenário** (reduz ruído de RNG, mesmo espírito do N=500/perfil do `botHarness`), em 4 cenários de frequência de sessão (1×/2×/3×/5× por dia, em horários plausíveis do dia). Cada sessão: aplica o regen de energia decorrido, joga corridas (perfil "Médio" do `botHarness`, reaproveitando as mesmas funções do `core/` — não duplica regra de jogo) **até a energia não dar mais pro custo** (pedido explícito da tarefa), acumula Gold/peças e funde automaticamente.

**1ª rodada (modelo inicial) — achado importante:** a 1ª proposta de raridade por drop (`DROP_WEIGHTS_BY_TIER`) dava uma chance real de raridade alta (blue/purple/gold) **direto no drop**, e todo drop era garantido (1 peça por corrida, 2 no pódio). Resultado do harness: um jogador de **3×/dia** alcançava a raridade **MÁXIMA (red, em quase todos os 7 slots)** em só **21 dias simulados**. Isso esvazia completamente o gancho de progressão de longo prazo do Archero (CLAUDE.md pede explicitamente esse mapeamento) — grind de meses virando grind de 3 semanas.

**Causa raiz:** dar raridade alta direto no drop deixa a fusão em cascata (3→1, já uma decisão aprovada) "atalhar" demais o caminho até o topo — reduzir só a raridade do drop (fiz isso primeiro, quase sem efeito) não resolve, porque o volume TOTAL de peças por dia (garantido a cada corrida) já é suficiente pra cascatear várias peças até o topo via fusão pura, mesmo só com drops de `gray`.

**2ª rodada (modelo final):** duas mudanças na direção certa:
1. Acima de `green`, a raridade praticamente só nasce de fusão — `blue` direto sobrevive como um "golpe de sorte" raro só pro pódio (2%); `purple`/`gold`/`red` diretos foram zerados.
2. O drop deixou de ser garantido — virou uma **chance por corrida** (`DROP_CHANCE_BY_TIER`: pódio 55% + 15% de bônus (chance de 2), meio de tabela 35%, fundo de tabela 22%), reduzindo o volume total de material disponível pra fusão.

**Resultado final calibrado** (21 dias, perfil "Médio", 100 jogadores/cenário):

| Cenário | Corridas/dia | Gold acum. (21 dias) | 1ª fusão (dia médio) | Fusões totais (21 dias) | Raridade final típica (7 slots) |
|---|---|---|---|---|---|
| 1×/dia (20h) | 6,0 | ~8.998 | dia 4,0 | ~18,3 | maioria `blue`, 1 `green` |
| 2×/dia (13h+20h) | 12,0 | ~17.932 | dia 1,9 | ~43,9 | maioria `blue`, 1 `purple` |
| 3×/dia (9h+13h+20h) | 16,0 | ~23.872 | dia 1,4 | ~61,2 | mistura `blue`/`purple` |
| 5×/dia (muito engajado) | 19,0 | ~28.434 | dia 1,1 | ~76,1 | quase todos `purple` |

**Leitura do resultado:** a 1ª fusão continua rápida (gancho de onboarding preservado — dia 1 a 4 dependendo do engajamento), mas **mesmo o jogador mais engajado simulado (5×/dia) só alcança `purple`, nunca `gold` nem `red`, em 21 dias** — o topo da árvore de raridades passa a exigir semanas/meses de jogo real, não 3 semanas. Reparo importante sobre os números de "corridas/dia": note que 3×/dia e 5×/dia NÃO escalam linearmente com o número de sessões (16 e 19, não 18 e 30) — é a taxa de regen de 12 min/ponto criando exatamente a dinâmica pretendida (sessões espaçadas por menos de ~1h não acumulam energia suficiente pra "valer a pena" a visita extra).

**Gold:** os valores acumulados (9k–28k em 21 dias) não têm nenhum significado absoluto ainda — não existe NENHUM sink de Gold implementado (Sede/escritórios e Loja são M3+, CLAUDE.md §7/Claude-Tech.md §8). Este número é só uma checagem de ordem de grandeza, não um balanceamento final — ver pergunta 4 na seção 3.

**Reprodutibilidade:** `npm run economy` roda o harness a qualquer momento; os números podem variar ligeiramente entre rodadas (RNG não seedado, mesmo padrão do `botHarness`), mas a mediana deveria ficar estável dado N=100/cenário.

### 2.7 O que ficou real vs. stub/placeholder (importante pro PO saber o que testar)

**Real, testado e funcional:**
- Energia: teto/custo/regen, cálculo de regen decorrido preservando o resto de tempo, debitar ao correr.
- Gold por posição + penalidade de crash aplicada.
- Inventário/fusão 3→1/`zoneScale` — o `carSetup` que chega na corrida de verdade reflete o inventário persistido.
- Persistência via `localStorage` real (testado em Chromium, não só o fallback em memória do Node).
- Hub como tela inicial, navegação Hub↔Corrida nos 2 sentidos.

**Stub/placeholder, deliberadamente fora de escopo desta sessão:**
- **Arte dos carros:** retângulo+triângulo, greybox puro (consistente com o resto do jogo nesta fase — CLAUDE.md §7 trata isso como fora de escopo até o Gate 1/trilha de Arte).
- **Carro 2 (IA):** só um placeholder visual no Hub ("em breve") — não pontua, não tem piloto contratável (isso é E-302/E-303, M3+).
- **Tela de Oficina:** ~~não existe~~ **implementada na sessão 2 (E-207) — ver seção 2.8.**
- **Sede/escritórios (produção passiva), pilotos, staff, Loja:** M3+, nem tocados.
- **Gold como recurso "gastável":** não há nada pra comprar ainda — Gold só acumula.

### 2.8 Oficina — equipar manual (E-207, sessão 2, 2026-07-21)

**Contexto:** a sessão 1 implementou o inventário/fusão com auto-equip (a melhor raridade possuída era sempre "a equipada", sem escolha manual), deliberadamente como scaffolding temporário porque não havia tela de Oficina naquela sprint. **O PO rejeitou isso como solução permanente** ("equipar deve ser escolha do jogador" — pergunta 5, seção 3, agora fechada). Esta sessão troca o auto-equip por uma escolha manual real, persistida.

**Modelo de dados (`core/economy.ts`):** `PartInventory` ganhou um segundo campo, `equipped: Record<PartSlot, Rarity | null>`, separado de `counts`. É só uma **referência de raridade escolhida pelo jogador** (não uma "peça reservada" com identidade própria) — a fusão continua podendo consumir qualquer trinca da mesma raridade sem precisar saber o que está "em uso", exatamente como antes.

- `equippedRarity(inv, slot)`: retorna a escolha do jogador (`inv.equipped[slot]`) **se ele ainda possuir ao menos 1 unidade dela**; senão cai automaticamente para a melhor raridade restante (`bestOwnedRarity`, função interna). Isso cobre 2 casos com a mesma regra: (1) nunca equipou nada manualmente (`equipped[slot] === null`, inclusive saves antigos migrados — ver abaixo) e (2) equipou algo que depois sumiu do inventário (ex.: foi toda consumida numa fusão). Em nenhum dos dois casos o jogo força "sempre a melhor" de propósito — só preenche a ausência de uma escolha válida.
- `setEquipped(inv, slot, rarity)`: aplica a escolha do jogador, mas só se ele possuir `> 0` daquela raridade naquele slot; senão é um no-op (`false`). A `OficinaScene` só oferece raridades possuídas, então isso é mais defensivo do que necessário na prática.
- `cloneInventory(inv)`: extraído nesta sessão (antes só existia inline dentro de `applyRaceRewards`) para reaproveitar no novo `equipPart` do `gameSave.ts` — clona `counts` E `equipped` antes de mutar.
- `computeZoneScale()` não mudou de assinatura — continua somando o bônus de `equippedRarity()` por slot; como essa função agora respeita a escolha do jogador, o `zoneScale` da corrida passa a refletir a escolha manual, não mais sempre a melhor peça possuída (testado em `tests/economy.test.ts`).

**Migração de saves (`persistence/gameSave.ts`):** saves reais já existem da sessão 1 sem o campo `inventory.equipped`. Bumpei `GameSave.version` de `1` para `2` e escrevi uma migração explícita (`migrateSave`): se o save é v1 (ou já v2) e tem `inventory.counts`, preenche qualquer slot ausente em `equipped` com `null` — que é exatamente o fallback automático que já existia, então **nenhum save perde Gold/energia/peças, e o comportamento não muda até o jogador equipar manualmente pela 1ª vez na Oficina**. Save irreconhecível (corrompido, versão futura desconhecida) continua resetando pra um save novo, mesma proteção simples de antes. Testado em `tests/gameSave.test.ts` com um save "cru" v1 sem `equipped` gravado diretamente via `saveJSON`, simulando um save real da sessão anterior.

**`equipPart(save, slot, rarity)` (novo em `gameSave.ts`):** clona o inventário, aplica `setEquipped`, persiste e retorna o save atualizado; se a escolha for inválida (raridade não possuída), retorna o mesmo `save` recebido sem persistir nada (no-op detectável por referência, testado).

**Nova cena `OficinaScene` (`src/view/OficinaScene.ts`):** greybox (texto/retângulos, sem arte), mostra os 7 slots em lista vertical; cada slot lista as raridades possuídas em quantidade > 0 (com a contagem) como botões coloridos por raridade, realça o botão da raridade efetivamente equipada (stroke mais grosso + preenchimento mais forte), e mostra "Equipado: X". Tocar num botão chama `equipPart` e re-renderiza a linha na hora. Acessível via botão "OFICINA" no canto superior direito do `HubScene`; botão "< Hub" volta. `HubScene` também teve o rótulo do resumo de peças atualizado ("PEÇAS (equipadas — toque OFICINA pra trocar)") — o resumo em si não mudou de lógica, só passou a refletir escolha manual porque `equippedRarity()` mudou por baixo.

**Verificado:** `npm test` (92 testes, 10 novos cobrindo escolha manual + fallback + migração + persistência), `npx tsc --noEmit` e `npm run build` limpos. Smoke test real via Playwright + Chromium contra `npm run dev`: Hub → clique em OFICINA → 7 slots renderizam corretamente (inventário vazio mostra "nenhuma peça possuída" em todos) → clique em "< Hub" → volta sem erro de console. (Um teste adicional com inventário populado via `localStorage` seeded, clicando nos botões de raridade, foi interrompido no meio porque o `node_modules/playwright` do ambiente compartilhado sumiu no meio da sessão — provavelmente uma operação do TechLead-Racing rodando em paralelo no mesmo diretório, sem isolamento de git, como avisado na tarefa. A cobertura desse fluxo específico — equipar não-ótimo, persistir, fallback ao fundir — ficou só nos testes automatizados de `economy.test.ts`/`gameSave.test.ts`, que exercitam exatamente essa lógica de ponta a ponta sem depender do Playwright.)

**Tensão registrada, não resolvida (não bloqueava a tarefa pedida):** fusão continua automática (3→1, sempre roda) enquanto equipar virou manual — um jogador pode equipar deliberadamente uma raridade pior e, na corrida seguinte, ver 3 exemplares dela desaparecerem numa fusão automática "por baixo", forçando o fallback pra outra raridade sem aviso explícito na hora em que acontece (só a próxima visita à Oficina/Hub mostra o resultado). Não implementei nenhuma notificação ou opção de "não fundir a raridade equipada" — não foi pedido, e mudar a fusão está fora do escopo desta tarefa. Fica como pendência de UX pro PO decidir (ex.: um toast ao voltar da corrida avisando "sua peça equipada em X mudou de Y para Z por fusão").

**Fora de escopo, registrado como próximo passo separado (não é parte de E-207):** o modal de livery com os 6 slots de patrocinador (CLAUDE.md §5 tela 2 menciona isso como parte da tela Oficina). Não existe NENHUM sistema de patrocinadores modelado em `economy.ts` — é uma feature própria maior (efeitos por patrocinador, raridade própria?, etc.), não uma variação do equipar normal. Por ora, `livery` na `OficinaScene` é só mais um slot equipável por raridade, igual aos outros 6 — sem o modal.

### 2.9 Tutorial (E-208) + aviso de fusão trocando peça equipada (sessão 3, feita dentro de uma rodada da trilha Racing)

Contexto: o PO pediu uma tela de instrução (opção A entre 4 propostas — estática, uma vez antes da 1ª corrida) e "avançar o que mais for possível nos menus" numa rodada de trabalho que já estava rodando pela trilha Racing (tempo de volta, ver Claude-Racing.md §2.30). Peguei essas 2 tarefas porque eram claramente escopo Manager (persistência, telas de menu), registrando aqui e cross-referenciando lá.

**`TutorialScene` (`src/view/TutorialScene.ts`):** 3 páginas estáticas (texto curto + indicador de página), cobrindo: (1) mecânica geral de toque na zona certa; (2) o que cada cor de zona significa, incluindo que miss é grave e pode causar batida; (3) saída vs. frenagem (2 etapas), nomes contextuais KERS/Magic, saúde/DNF. Botão "Próximo" avança; "Pular tutorial" (só nas 2 primeiras páginas) e o botão final "Vamos correr!" levam pro mesmo lugar — `markTutorialSeen()` + volta pro Hub. **Não implementadas** as opções B (tutorial interativo guiado) e C (dicas contextuais na 1ª vez) que eu tinha proposto como alternativas — o PO escolheu a mais barata deliberadamente, já que o público de teste atual ainda recebe explicação verbal antes de jogar.

**`GameSave` v3 (`src/persistence/gameSave.ts`):** novo campo `hasSeenTutorial: boolean`. Migração: saves v1/v2 (jogador com progresso existente) entram como `true` — não faz sentido interromper quem já joga; só `defaultSave()` (save genuinamente novo) começa `false`. Nova função `markTutorialSeen(save)`.

**Hub (`HubScene.ts`):** `create()` agora checa `!save.hasSeenTutorial` logo no início e redireciona pra `TutorialScene` antes de desenhar qualquer coisa do Hub. Novo botão "COMO JOGAR" (canto superior esquerdo, simétrico ao "OFICINA" à direita) reabre o tutorial a qualquer momento, mesmo já tendo sido visto.

**Aviso de fusão trocando peça equipada (`RaceScene.showSummary()`):** pendência registrada desde a sessão 2 (§2.8, "o jogador não é avisado no momento em que uma fusão automática consome a raridade que ele tinha equipado de propósito"). Resolvido: `showSummary()` agora captura `equippedRarity()` de cada um dos 7 slots ANTES de `applyRaceRewards()`, compara com depois, e mostra uma linha de aviso (`⚠ Peça equipada em X mudou: Y → Z (fusão)`) pra cada slot cuja raridade efetivamente equipada mudou — só quando havia uma escolha anterior de verdade (não dispara pra slots que não tinham nada equipado ainda, isso já aparece separado como "peça ganha").

**Testes novos:** `tests/gameSave.test.ts` ganhou 3 casos (save novo começa `false`, save v2 migra como `true`, `markTutorialSeen` persiste entre loads) + os 2 testes de migração existentes atualizados de `version 2` pra `version 3`. Não escrevi teste automatizado pro aviso de fusão em si (é lógica simples de comparação dentro da view, já coberta indiretamente pelos testes de `equippedRarity`/`fuseAll` em `economy.test.ts`) — decisão de escopo, não esquecimento.

**Verificação:** 98/98 testes, `tsc`/`build` limpos, `npm run economy` rodado de novo (números na mesma faixa de antes, nada quebrado). Smoke test Playwright headless confirmou visualmente: save novo cai direto na página 1/3 do tutorial; "Próximo" avança as 3 páginas; "Vamos correr!" volta pro Hub; botão "COMO JOGAR" reabre o tutorial; "Pular tutorial" também volta pro Hub — tudo sem erro de console. Não fechei uma corrida completa nesse smoke test pra ver o aviso de fusão na prática (exigiria uma sessão bem mais longa) — coberto só por leitura de código + os testes de `economy`/`gameSave`.

### 2.10 Sede do time — escritórios de produção passiva (E-301, sessão 4, 2026-07-21)

Feito dentro de uma rodada grande da trilha Racing (pedido do PO: "listar tarefas do Manager também, atacar sem esperar interferência"). Detalhe técnico completo no commit/código; resumo aqui:

**Escopo — só 7 dos 8 escritórios do CLAUDE.md:** motor, asaDianteira, asaTraseira, chassis, suspensao, pneu, livery. O escritório de **marketing ficou de fora de propósito** — ele só faz sentido depois que o sistema de patrocinadores da livery existir (§5 item 6), e não valia construir metade de um sistema que depende do outro ainda não desenhado.

**Modelo (`src/core/offices.ts`, módulo aditivo, mesmo espírito de `grid.ts`):** produção passiva estilo Archero/energia — cada escritório acumula peças com o tempo real até um teto (10), precisa ser coletado. Nível (1 a 5, upgradável com Gold, custo `150 × nível atual`) acelera a produção (`20 min / nível` por peça); a **raridade produzida é deliberadamente quase sempre `gray`** (12% de chance de `green`), mesma filosofia já calibrada pelo harness de economia pras recompensas de corrida (§2.6) — dar raridade alta direto de uma segunda fonte desalinharia a curva de fusão já calibrada.

**Primeiro sink de Gold de verdade do jogo:** até aqui, Gold só acumulava (pergunta 4, §3, aprovada "deixar como está" pelo PO) — upar escritórios é a primeira coisa em que dá pra gastar.

**`GameSave` v4:** novo campo `offices`. Saves v1/v2/v3 migram com escritórios NOVOS (nível 1, sem produção pendente) — não tem histórico de produção pra reconstruir, diferente de `hasSeenTutorial` (v3), onde dava pra inferir "já viu" a partir de progresso existente.

**Bug real encontrado e corrigido no processo:** `defaultSave()` usava `Date.now()` internamente em vez do `nowMs` recebido por `loadGame()`. Isso "funcionava" pra energia só por acidente — `applyEnergyRegen` resincroniza o relógio pro `nowMs` de verdade sempre que a energia já está no teto (que é o caso de um save novo), mascarando o problema. Escritórios não têm esse atalho (começam com 0 pendente, não "no teto"), então `applyOfficesProduction` comparava um timestamp de parede real contra o `nowMs` sintético dos testes — `elapsedMs` dava sempre negativo (virava 0 pelo `Math.max`), produção nunca avançava. Corrigido threading `nowMs` por todo `defaultSave`/`migrateSave`. Achado pelos próprios testes automatizados falhando (não foi visual) — reforça o valor de testar a lógica de tempo decorrido com timestamps sintéticos, não só `Date.now()` real.

**`SedeScene` nova (`src/view/SedeScene.ts`):** lista os 7 escritórios (nível, produção pendente por raridade, botões Coletar/Upar). Acessível via botão "SEDE" no Hub (abaixo do "OFICINA"). Greybox puro, sem arte, mesmo padrão do resto do jogo nesta fase.

**Verificado:** testes novos em `tests/offices.test.ts` (módulo core isolado) e `tests/gameSave.test.ts` (persistência/migração/coleta/upgrade) — 120 no total do projeto depois desta sessão. `tsc`/`build` limpos. Smoke test Playwright headless: Hub → Sede → Hub navegando sem erro, os 7 escritórios renderizando corretamente (nível 1/5, "Nada pronto ainda", botões desabilitados corretamente com 0 Gold).

### 2.11 Sessão 5 (2026-07-21) — Pilotos + Carro 2, patrocinadores/marketing, Loja/baús + Aura

PO confirmou 3 itens de calibração/UX pendentes (registrados em `Claude-Racing.md` §2.32) e autorizou "atacar a lista sem esperar minha interação" cobrindo os 3 épicos abaixo, todos entregues na mesma rodada. `GameSave` passou de v4 pra **v7** nesta sessão (3 migrações em sequência, mesmo padrão incremental de sempre — cada versão preserva progresso existente e some com valores neutros pros campos novos).

**Pilotos (E-302) + Carro 2 pontuando de verdade (E-303):**

- `src/core/pilots.ts` (novo, módulo puro): roster fixo de 4 candidatos não-gacha (Rookie Promissor 300 Gold → Veterano de Equipe 2500 Gold), cada um com 6 skills 1-100 (`aceleracao`, `frenagem`, `pace`, `ultrapassagem`, `devCarro`, `marketing`). `pilotTierWeights()` interpola entre a distribuição "fraca" e "forte" já usada pelo `botHarness` (média de aceleração/frenagem/ultrapassagem como o composto 0..1); `pilotPaceFactor()` mapeia `pace` pra 0,90-1,10 (mesma faixa das equipes de IA em `core/grid.ts`); `pilotDevCarroBonus()` mapeia `devCarro` pra até +0,1 de `zoneScale` — CLAUDE.md Q8 é explícito que essa skill "beneficia a equipe inteira", então o bônus vai pro zoneScale do PRÓPRIO jogador, não só do Carro 2. `marketing` não tem efeito de jogo ainda (não tinha onde plugar até este mesmo pacote de tarefas nascer, ver patrocinadores abaixo — mas não conectei os dois, ficou como pendência).
- `core/grid.ts` (trilha Racing, mudança compartilhada): `createGridSim(rng, teammate?)` aceita um `TeammateProfile` opcional; sem ele, cai no perfil "Médio" fixo de sempre. `createRace(track, setup, { teammate })` repassa. Ver detalhe completo em `Claude-Racing.md` §2.32 — só resumindo aqui o lado que o Manager consome.
- `GameSave` v5: `pilotRoster: string[]` (contratados) + `activePilotId: string | null` (quem guia o Carro 2 agora). `hirePilot()`/`setActivePilot()` seguem o mesmo padrão defensivo de `upgradeOfficeLevel` (retornam `null` em vez de lançar erro pra qualquer caso inválido: Gold insuficiente, id desconhecido, já contratado, fora do roster).
- `PilotosScene` nova: lista os 4 candidatos com skills, custo, e um botão que muda de "Contratar" → "Escalar pro Carro 2" → "Desescalar" conforme o estado. Botão "PILOTOS" novo no Hub.
- `HubScene.startRace()`: calcula o `TeammateProfile` a partir do `activePilotId` (se houver) e passa pra `RaceScene` junto do `carSetup` (que agora também soma o `devCarroBonus`). `RaceScene.showSummary()` ganhou uma linha "Carro 2 (companheiro): P<n>/12" — como o grid não simula DNF pras IAs ainda, a posição ao vivo do companheiro já É a final.

**Patrocinadores da livery + escritório de marketing** (pendência registrada desde a sessão 4, §5 item 5/6 — "não modelado, depende do sistema de patrocinadores existir primeiro"):

- `src/core/sponsors.ts` (novo): 8 patrocinadores fixos pra 6 posições (`LIVERY_SPONSOR_SLOTS`, CLAUDE.md "6 posições de patrocinador") — dá escolha real de quais contratar. Custo em **Reputação** (não Gold), bônus % de Gold por corrida somado entre os contratados (3% a 22%, crescente com o custo). Números são proposta inicial minha, sem calibração de harness ainda (mesmo aviso que já se aplica a `CHESTS`/`AVAILABLE_PILOTS` — sujeito a revisão quando houver dado real).
- `core/offices.ts` ganhou o 8º escritório que faltava desde a sessão 4: **Marketing**, produzindo Reputação (contador escalar simples, não por raridade — não faz sentido forçar "raridade de Reputação" no mesmo molde dos outros 7). Mesmo algoritmo de acúmulo passivo + teto + coleta manual, só que sem o sorteio de raridade.
- `GameSave` v6: `marketingOffice`/`reputacao`/`hiredSponsorIds`. `applyRaceRewards()` agora aplica o bônus % dos patrocinadores contratados ao Gold ganho em cada corrida (`ApplyRaceRewardsResult.goldAdded` — sempre ≥ `reward.gold`, exposto separado do Gold "bruto" da tabela por posição pra não confundir os dois números na tela).
- **Simplificação deliberada do design original:** CLAUDE.md descreve um "modal com 6 posições de patrocinador" dentro da Oficina. Virou uma tela própria, `MarketingScene` (mesmo padrão de `SedeScene`/`PilotosScene` desta sessão), não um modal — mais rápido de construir no estágio de greybox e mais consistente com o resto do jogo (nenhuma outra tela usa modal hoje). Revisitar se o PO achar que o fluxo importa (ex.: querer trocar patrocinador direto de dentro da Oficina olhando a livery).
- Botão "MARKETING" novo no Hub, mostra saldo de Aura/Gold + Reputação (indireto, dentro da própria `MarketingScene`).

**Loja/baús + Aura (E-305):**

- `src/core/chests.ts` (novo): 4 tiers (bronze/prata/ouro/platina — nomenclatura já prevista no CLAUDE.md §6.2), custo em Aura crescente (10/25/60/150), chance de raridade alta crescente e mais peças por abertura no tier mais caro (1/1/2/3). Pesos são proposta inicial minha, mesmo espírito conservador de `DROP_WEIGHTS_BY_TIER` — não entregar o topo (`red`) fácil, mesmo no baú mais caro (2% platina).
- `auraForPosition()` (`core/economy.ts`): **única fonte de Aura modelada nesta sessão** — só pódio (P1=5, P2=3, P3=1). IAP real (comprar Aura com dinheiro) continua fora de escopo (CLAUDE.md §7) — isso é só a estrutura de dado, não monetização.
- `GameSave` v7: `aura: number` + `buyChest()` (mesmo padrão defensivo — `null` sem Aura suficiente).
- `LojaScene` nova (4 baús, botão "Abrir" por tier, mostra o resultado da última abertura). Botão "LOJA" novo no Hub. `RaceScene.showSummary()` ganhou uma linha "+X Aura (pódio!)" quando aplicável.

**Verificação:** 169/169 testes (49 novos: `pilots.test.ts`, `sponsors.test.ts`, `chests.test.ts` + extensões em `gameSave.test.ts`/`offices.test.ts`/`economy.test.ts`), `npx tsc --noEmit` limpo, `npm run build` ok (37 módulos, antes 33). Smoke test manual via Playwright (temp-install/uninstall no `node_modules`, nunca commitado — mesmo processo de sempre): Hub → Pilotos → Hub → Marketing → Hub → Loja → Hub, sem erro de console em nenhuma tela. **1 bug visual real encontrado e corrigido nesse smoke test:** o subtítulo da `MarketingScene` estourava a largura do canvas (texto longo demais pra 480px, sem word-wrap configurado) — encurtado. Não testado neste smoke test (exigiria completar uma corrida de verdade, fora do escopo de um teste automatizado rápido): contratar um piloto/patrocinador de verdade com Gold/Reputação reais, abrir um baú de verdade com Aura real — esses fluxos estão cobertos pelos testes determinísticos de `gameSave.test.ts`, não por observação visual.

### 2.12 Sede — botão "Coletar tudo" (2026-07-22, pedido feito dentro de uma rodada da trilha Racing, cross-referenciado aqui — ver Claude-Racing.md sessão 15, 3ª rodada)

Pedido direto do PO: coletar a produção pendente dos 7 escritórios um por um (botão "Coletar" de cada linha) era repetitivo. Adicionado `collectAllOfficeParts(save)` em `persistence/gameSave.ts` — mesmo espírito de `collectOfficeParts(save, slot)` (já existente), só que passa pelos 7 slots numa volta só, acumulando as peças coletadas de todos antes de rodar `fuseAll()` e salvar 1x só no final (em vez de 7 leituras/escritas separadas). `SedeScene` ganhou um botão "Coletar tudo (N peças prontas)" logo acima da lista de escritórios (`FIRST_ROW_Y` 96→132 pra abrir espaço) — mostra a contagem total pendente em todos os escritórios juntos, some (fica desabilitado, "nada pronto ainda") quando não há nada, e atualiza junto com qualquer coleta individual também (`refreshCollectAllButton()` chamado nos 2 caminhos).

**Verificação:** `npm run build` limpo, smoke test Playwright — forçou produção pendente em todos os 7 escritórios (via localStorage direto, mesmo formato de `loadGame()`), clicou "Coletar tudo", confirmou as peças caindo no inventário dos 7 slots numa tacada só e o botão voltando a "nada pronto ainda" depois. Sem teste automatizado dedicado (`gameSave.test.ts`) ainda — a função é pequena e seguiu o padrão exato de uma função já testada (`collectOfficeParts`); considerar adicionar um teste determinístico se `collectAllOfficeParts` ganhar lógica própria no futuro.

## 3. Questões em aberto — perguntas específicas pro PO

**Feedback do PO testando o build (2026-07-21, registrado por uma sessão da trilha Racing que também tocou o Hub/Oficina nesta conversa — sinalizando aqui pro TechLead-Manager formalizar):** o inventário/equipamento hoje é um único pool global (`PartInventory` em `core/economy.ts`) — não existe o conceito de "peça equipada no Carro 1" vs. "peça equipada no Carro 2". O PO quer poder decidir em qual dos 2 carros instalar cada peça; remover de um carro devolveria a peça pro inventário geral, disponível pra equipar no outro. Isso é consistente com o Hub já mostrar 2 carros (`buildCars()`), mas hoje `computeZoneScale`/`equippedRarity` só existem numa dimensão (sem "por carro"). Não implementado — registrado como pendência real de design de dados (provavelmente `equipped` precisa virar `Record<CarId, Record<PartSlot, Rarity | null>>`, ou algo equivalente), fica pra próxima sessão da trilha Manager avaliar o esforço, especialmente considerando que o Carro 2 ainda não pontua/não tem IA de verdade (E-303, M3+) — vale a pena investir nisso antes do Carro 2 existir de fato, ou só documentar a intenção por ora?

Perguntas objetivas depois de testar o build (não genéricas):

1. ~~**Recompensa por posição do grid vs. do core**~~ **— respondido pelo PO (2026-07-21): nenhum dos dois — quer os 2 modelos unificados numa fonte única de verdade**, não mais escolher um lado por sintoma (já foram 2: ultrapassagem indevida do líder, e agora esta). Virou prioridade #1 da próxima sessão da trilha Racing (decisão datada em Claude-Tech.md §3, plano técnico em Claude-Racing.md seção 6, item 5). **Até essa unificação acontecer, o código desta sessão continua usando a posição do grid** (decisão de curto prazo mantida, não é a solução final) — revisitar o cálculo de recompensa quando a trilha Racing entregar o modelo unificado.
2. **Ritmo de energia:** com 12 min/ponto (igual ao Archero real) e teto 30, o refill completo leva 6h; recarregar 1 corrida leva 1h. Um jogador que abre 3×/dia (manhã/almoço/noite) joga ~16 corridas/dia no total. Isso parece certo pro ritmo que você imagina, ou prefere um refill mais rápido (sessões mais curtas, mais frequentes) ou mais lento (mais pressão pra usar Aura/anúncio pra recarregar, monetização mais cedo — hoje isso nem existe ainda, é M3+)?
3. ~~**Progressão de raridade**~~ **— respondido pelo CPO (2026-07-21, a pedido explícito do PO): manter o ritmo recalibrado como está, não acelerar nem desacelerar mais.** Análise completa (benchmarks de retenção do gênero, concentração de LTV em jogadores engajados, estudo de caso do próprio Archero sobre a causa real do churn de longo prazo, e as condições para a recomendação valer) em `Claude-Marketing.md`, seções 3-4. Resumo: o risco real não é o topo (`gold`/`red`) ser distante — é o meio do caminho ficar vazio de recompensas, e o harness já mostra dezenas de fusões acontecendo ao longo dos 21 dias mesmo no cenário mais devagar, então essa condição está OK por ora. Ponto de atenção registrado pelo CPO: o perfil de real risco de estagnação percebida é o de baixa frequência (1x/dia), não o de 5x/dia da pergunta original — vale cruzar com telemetria real quando houver. Rodar o harness a 90 dias (item já nos próximos passos, seção 5) continua recomendado para confirmar a estimativa de `gold`/`red` com dado em vez de extrapolação.
4. **Gold sem sink:** os números de Gold acumulado (9k-28k em 21 dias) não significam nada ainda, porque não existe onde gastar (Sede/Loja são M3+). Quando a Sede (E-301) entrar, vou precisar revisitar a tabela de Gold-por-posição em função dos custos reais dos escritórios — ok deixar isso pra lá, ou você quer que eu já proponha uma ordem de grandeza de custos futuros agora, só pra não ter que refazer a tabela de Gold do zero depois?
5. ~~**Auto-equipar vs. Oficina manual**~~ **— respondido pelo PO (2026-07-21): não, equipar deve ser escolha do jogador. IMPLEMENTADO na sessão 2 (mesma data, E-207) — ver seção 2.8.** Não é mais scaffolding temporário: `PartInventory.equipped` guarda a escolha explícita do jogador, a `OficinaScene` (nova) permite equipar qualquer raridade possuída (não força a melhor), e saves antigos migram sem perder progresso (v1→v2). ~~Pendência remanescente: modal de livery com 6 patrocinadores~~ **— IMPLEMENTADO na sessão 5 (§2.11), como uma tela própria (`MarketingScene`), não um modal dentro da Oficina — simplificação deliberada, ver a nota completa em §2.11.**
6. **Drop de peça sem posição boa:** hoje mesmo o último colocado (P12) tem 22% de chance de ganhar uma peça (`gray`/`green`) por corrida — nenhuma corrida garante 0% de recompensa de peça. Isso combina com a filosofia "não deixar o jogador de mãos vazias" que você já usou pro dano/DNF (Claude-Racing.md), ou prefere que posições muito ruins não ganhem nada às vezes (mais punitivo)?

## 4. → impacta Claude-Tech.md

Sinalizando pro CTO propagar na revisão do sprint (protocolo §1.1):

- Seção 8 (backlog): E-201 a E-206 (Sprint 5/M2) podem ser marcados como ✅ feitos nesta sessão — já apliquei essa marcação diretamente na tabela de status dos épicos M2 (única edição feita em Claude-Tech.md nesta sessão, conforme escopo combinado).
- Seção 7 (marcos/gates): M2 agora tem uma entrega real de ponta a ponta (energia, hub, recompensas, inventário/fusão, persistência, harness de economia) — o Gate 2 ("D7 direcional + economia validada pelos bots") ganha o harness pedido, mas a validação de D7 em si depende de testers reais, fora do meu escopo.
- Contrato Manager↔Racing (seção 3): `RaceInput.carSetup` agora é alimentado de verdade a partir do inventário persistido (antes era só `DEFAULT_CAR_SETUP` fixo) — o contrato em si (formato do `CarSetup`) não mudou, só quem preenche o `zoneScale`.
- Pergunta 1 da seção 3 acima (posição do grid vs. `RaceOutput.position` pra recompensa) toca diretamente a dívida técnica já registrada em Claude-Tech.md/Claude-Racing.md sobre a divergência core/grid — vale o CTO decidir se isso vira prioridade de correção arquitetural agora que o Manager também depende dessa posição para pagar recompensas (antes só afetava a UI/oferta de ultrapassagem).

## 5. Próximos passos sugeridos

**Atualizado 2026-07-21 (sessão 4 — Sede/escritórios entregue):**

1. ~~**Montar a tela de Oficina de verdade**~~ — **feito na sessão 2** (E-207, §2.8).
2. ~~**Tensão fusão automática vs. equipar manual**~~ — **resolvido na sessão 3** (§2.9): aviso explícito na tela de resumo.
3. ~~**Bloqueado até a trilha Racing entregar (unificação core/grid)**~~ — **a trilha Racing entregou na sessão 11 dela** (Claude-Racing.md §2.29). `computeRaceRewards` já usa `output.position`, agora com a regra de classificação de DNF também aplicada (Claude-Racing.md §2.31) — não é mais provisório.
4. ~~**Iniciar E-301 (Sede/escritórios)**~~ — **feito na sessão 4** (§2.10). Escopo: só os 7 escritórios de peça, marketing fica de fora (ver item 5).
5. ~~**Escritório de marketing**~~ — **feito na sessão 5** (§2.11), junto do item 6 (um destravava o outro).
6. ~~**Modal de livery/patrocinadores**~~ — **feito na sessão 5** (§2.11), como tela própria (`MarketingScene`), não modal dentro da Oficina.
7. **Peças equipáveis por carro, não só um pool global** (pedido do PO, sessão 13 da trilha Racing, registrado na seção 3 abaixo): estava deliberadamente adiado até o Carro 2 (E-303) pontuar de verdade — **essa condição foi cumprida na sessão 5 (§2.11)**, então o item está desbloqueado. Ainda não implementado — fica pra uma próxima sessão avaliar o esforço (provavelmente `equipped` precisa virar `Record<CarId, Record<PartSlot, Rarity | null>>`).
8. Rodar o harness com um período mais longo (90 dias) pra confirmar a estimativa de `gold`/`red` citada na pergunta 3 (CPO já analisou e recomendou manter o ritmo como está — Claude-Marketing.md §3-4 — mas a confirmação a 90 dias segue pendente).
9. **Novo (sessão 5) — calibrar `AVAILABLE_PILOTS`/`AVAILABLE_SPONSORS`/`CHESTS` com dado real.** Todos os 3 são propostas iniciais minhas (custo, bônus, chances de raridade), sem passar pelo `economyHarness` ainda — o harness não tem hoje um jeito de simular "jogador contrata pilotos/patrocinadores/baús ao longo de N dias" (só simula corridas). Vale estender o harness quando esses sistemas tiverem uso real de playtest pra calibrar em vez de julgamento.
10. **Novo (sessão 5) — skill `marketing` do piloto (E-302) segue sem efeito de jogo.** `core/pilots.ts` documenta isso como escopo deliberadamente de fora ("depende do sistema de patrocinadores/marketing office, que ou não existe ou está sendo desenhado na mesma sessão") — agora que o sistema de patrocinadores existe (§2.11), dá pra conectar (ex.: `marketing` do piloto ativo reduzindo o custo em Reputação de contratar patrocinadores, ou acelerando o escritório de marketing). Não conectado nesta sessão — os dois sistemas nasceram juntos sem essa ponte de propósito, pra não acoplar 2 features novas na mesma rodada sem confirmação do PO.
11. **Novo (sessão 5) — 1º campeonato (2 corridas) e 2ª pista real, deliberadamente adiados pelo PO** ("quando criarmos a 2ª pista, vai fazer sentido criarmos já o 1º campeonato... podemos deixar isso para o próximo pacote de tarefas"). Fica pro próximo pacote de tarefas quando houver uma referência real (imagem/SVG) pra 2ª pista — mesma trava já registrada em `Claude-Racing.md`.
