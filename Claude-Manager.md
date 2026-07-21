# Claude-Manager.md — Trilha Manager, Projeto "Racing Manager"

> Documento vivo mantido pelo agente TechLead-Manager (ver protocolo em Claude-Tech.md, seção 1.1).
> Anexar junto com CLAUDE.md e Claude-Tech.md em conversas sobre a trilha Manager.
> Última atualização: 2026-07-21 (sessão 1 — ativação da trilha Manager, Sprint 5/M2: E-201 a E-206 implementados de ponta a ponta numa rodada autônoma. Modelo de economia proposto do zero pelo TechLead-Manager, calibrado com um harness novo (`tools/economyHarness.ts`) em 2 rodadas de ajuste — a 1ª revelou que o modelo generoso demais deixava um jogador engajado (3x/dia) alcançar a raridade MÁXIMA de peça em só 21 dias; recalibrado pra isso levar meses. Hub/Garagem novo vira a tela inicial do jogo; corrida agora debita energia e paga Gold/peças reais ao final, tudo persistido em localStorage via wrapper próprio)

## 1. Status do backlog

| Épico | Status | Nota |
|---|---|---|
| E-201 Energia | ✅ Feito | Teto 30/custo 5 já eram decisão aprovada (CLAUDE.md §6.2); taxa de regen (12 min/ponto) é a proposta desta sessão — ver seção 2.1 |
| E-202 Recompensas pós-corrida | ✅ Feito | Gold por posição + peças, aplicados e exibidos na tela de resumo — ver seção 2.2 |
| E-203 Inventário + fusão 3→1 + `zoneScale` real | ✅ Feito (com uma simplificação deliberada) | Modelo real de peças/fusão/`zoneScale` funcionando; NÃO existe tela de Oficina ainda (auto-equipa a melhor peça por slot) — ver seção 2.3 |
| E-204 Hub Garagem/QG | ✅ Feito | Nova cena `HubScene`, vira a tela inicial — ver seção 2.4 |
| E-205 Persistência local | ✅ Feito | `src/persistence/storage.ts` (wrapper) + `gameSave.ts` (schema) — ver seção 2.5 |
| E-206 Balance econômico via harness | ✅ Feito (2 rodadas de calibração) | `tools/economyHarness.ts` — ver seção 2.6 |

**Como rodar:** `npm install && npm test && npm run economy && npm run dev` (Hub agora é a tela inicial; `npm run bots` continua sendo o harness da trilha Racing, não tocado aqui).

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

**Modelo de dados (`src/core/economy.ts`):** 7 slots (`motor`, `asaDianteira`, `asaTraseira`, `chassis`, `suspensao`, `pneu`, `livery` — CLAUDE.md §7/Q7) × 6 raridades (`gray→green→blue→purple→gold→red` — CLAUDE.md §9/Q9). `PartInventory.counts[slot][rarity]` é uma contagem simples — **decisão de simplificação desta sessão**: não existe conceito de "peça individual equipada" separado da pilha de sobras. A "peça equipada" de cada slot é sempre **derivada automaticamente como a melhor raridade que o jogador possui** (`equippedRarity()`). Cheguei nesse modelo depois de tentar um modelo equipado/sobra explícito (como o Archero de fato tem) e encontrar um caso de borda ruim nos testes: fundir uma peça melhor "desequipava" a antiga de volta pra pilha de sobras de um jeito confuso de raciocinar e explicar. Sem tela de Oficina nesta sprint (não fazia parte do escopo pedido — só o Hub, E-204), o modelo "sempre usa automaticamente sua melhor peça" é equivalente em resultado e muito mais simples.

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
- **Tela de Oficina:** não existe. Não dá pra escolher manualmente qual peça equipar num slot (sempre a melhor que o jogador possui) — só um resumo textual no Hub. Isso não estava no escopo pedido desta sessão (só E-204 Hub foi pedido como tela nova); a mecânica de fusão/`zoneScale` por trás é real, só falta a UI de equipar manualmente.
- **Sede/escritórios (produção passiva), pilotos, staff, Loja:** M3+, nem tocados.
- **Gold como recurso "gastável":** não há nada pra comprar ainda — Gold só acumula.

## 3. Questões em aberto — perguntas específicas pro PO

Perguntas objetivas depois de testar o build (não genéricas):

1. **Recompensa por posição do grid vs. do core:** paguei a recompensa pela posição que aparece no HUD/painel lateral (grid, `GridStanding.position`), não pelo `RaceOutput.position` que a spec desta tarefa citava — porque a trilha Racing já documentou que os dois podem divergir (Claude-Racing.md §3) e me pareceu mais justo pagar pelo que o jogador viu na tela a corrida inteira. Você concorda, ou prefere que a recompensa siga estritamente `RaceOutput.position` mesmo sabendo da divergência?
2. **Ritmo de energia:** com 12 min/ponto (igual ao Archero real) e teto 30, o refill completo leva 6h; recarregar 1 corrida leva 1h. Um jogador que abre 3×/dia (manhã/almoço/noite) joga ~16 corridas/dia no total. Isso parece certo pro ritmo que você imagina, ou prefere um refill mais rápido (sessões mais curtas, mais frequentes) ou mais lento (mais pressão pra usar Aura/anúncio pra recarregar, monetização mais cedo — hoje isso nem existe ainda, é M3+)?
3. **Progressão de raridade:** com o modelo calibrado, mesmo um jogador MUITO engajado (5×/dia, "sem vida") só alcança `purple` em 21 dias — `gold`/`red` ficam pra depois disso (não simulei além de 21 dias nesta sessão; a curva sugere ordem de 1-3 meses pra `gold` e vários meses pra `red`, mas não confirmei com uma simulação mais longa). Isso parece um ritmo bom pro "grind de longo prazo" que você imagina, ou muito lento/muito rápido? Se quiser, rodo o harness com um período maior (ex.: 90 dias) numa próxima sessão pra confirmar a estimativa de `gold`/`red`.
4. **Gold sem sink:** os números de Gold acumulado (9k-28k em 21 dias) não significam nada ainda, porque não existe onde gastar (Sede/Loja são M3+). Quando a Sede (E-301) entrar, vou precisar revisitar a tabela de Gold-por-posição em função dos custos reais dos escritórios — ok deixar isso pra lá, ou você quer que eu já proponha uma ordem de grandeza de custos futuros agora, só pra não ter que refazer a tabela de Gold do zero depois?
5. **Auto-equipar vs. Oficina manual:** o modelo atual sempre usa a melhor peça que você possui em cada slot (sem escolha manual) — isso é aceitável como está até a Oficina (tela dedicada) entrar em outra sprint, ou você prioriza a Oficina antes do que eu tinha planejado nos próximos passos?
6. **Drop de peça sem posição boa:** hoje mesmo o último colocado (P12) tem 22% de chance de ganhar uma peça (`gray`/`green`) por corrida — nenhuma corrida garante 0% de recompensa de peça. Isso combina com a filosofia "não deixar o jogador de mãos vazias" que você já usou pro dano/DNF (Claude-Racing.md), ou prefere que posições muito ruins não ganhem nada às vezes (mais punitivo)?

## 4. → impacta Claude-Tech.md

Sinalizando pro CTO propagar na revisão do sprint (protocolo §1.1):

- Seção 8 (backlog): E-201 a E-206 (Sprint 5/M2) podem ser marcados como ✅ feitos nesta sessão — já apliquei essa marcação diretamente na tabela de status dos épicos M2 (única edição feita em Claude-Tech.md nesta sessão, conforme escopo combinado).
- Seção 7 (marcos/gates): M2 agora tem uma entrega real de ponta a ponta (energia, hub, recompensas, inventário/fusão, persistência, harness de economia) — o Gate 2 ("D7 direcional + economia validada pelos bots") ganha o harness pedido, mas a validação de D7 em si depende de testers reais, fora do meu escopo.
- Contrato Manager↔Racing (seção 3): `RaceInput.carSetup` agora é alimentado de verdade a partir do inventário persistido (antes era só `DEFAULT_CAR_SETUP` fixo) — o contrato em si (formato do `CarSetup`) não mudou, só quem preenche o `zoneScale`.
- Pergunta 1 da seção 3 acima (posição do grid vs. `RaceOutput.position` pra recompensa) toca diretamente a dívida técnica já registrada em Claude-Tech.md/Claude-Racing.md sobre a divergência core/grid — vale o CTO decidir se isso vira prioridade de correção arquitetural agora que o Manager também depende dessa posição para pagar recompensas (antes só afetava a UI/oferta de ultrapassagem).

## 5. Próximos passos sugeridos (não bloqueiam nada, é só a visão do TechLead-Manager)

1. Rodar o harness com um período mais longo (90 dias) pra confirmar a estimativa de `gold`/`red` citada na pergunta 3.
2. Se o PO priorizar, montar a tela de Oficina (equipar manualmente, ver as 6 raridades por slot, modal de livery com 6 patrocinadores — CLAUDE.md tela 2) — hoje só existe o modelo de dados por trás dela.
3. Iniciar E-301 (Sede/escritórios) só depois de alguma resposta às perguntas 3/4 acima, já que produção passiva + custos de escritório vão puxar a tabela de Gold pra outro ajuste.
4. Revisitar a divergência core/grid (pergunta 1) em conjunto com a trilha Racing, já que agora afeta recompensa (Gold/peças), não só UI.
