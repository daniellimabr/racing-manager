# CLAUDE.md — Projeto "Racing Manager" (nome provisório)

> Documento vivo de contexto do projeto. Anexar no início de novas conversas/tarefas.
> Ao decidir algo, mover o item de "Questões em aberto" para "Decisões" com a data.
> Documentos companheiros: Claude-Marketing.md (produto/mercado, CPO) e Claude-Tech.md (engenharia/backlog, CTO). Cada agente de trilha (TechLead-Racing, TechLead-Manager) mantém seu próprio Claude-Racing.md / Claude-Manager.md — ver protocolo na seção 1.1 do Claude-Tech.md.
> Última atualização: 2026-07-19 (rodada 6 — grid confirmado em 12 carros, boost confirmado 1/volta, protocolo de documentação viva por agente)

## 1. Visão

Jogo mobile free-to-play que combina **gestão de equipe de corrida** (meta-game no estilo Archero) com **pilotagem arcade de um toque** (estilo autorama) durante as corridas.

Fantasia do jogador: ser o dono/gestor de uma equipe de corrida — e também o piloto principal nos dias de prova.

## 2. Pilares de design

1. **Meta-game Archero**: moedas, baús, peças com raridade e fusão, talentos, energia para jogar.
2. **Corrida = a "run"**: sessão curta com elemento roguelike (escolhas aleatórias durante a prova).
3. **Pilotagem por desafio de precisão (autorama)**: o carro é um ícone no mapa do circuito; nos momentos de "saída" (largada, saída de curva, saída dos boxes) e "frenagem" (entrada de curva, entrada nos boxes) o jogador recebe um desafio de timing — apertar o botão no momento certo — não um simples segurar/soltar.
4. **Dois carros, uma equipe**: o jogador pilota um; o outro é guiado por IA (piloto contratado).
5. **Sessões curtas, progressão longa** (modelo F2P).

## 3. Decisões (DEFINIDO)

| Data | Decisão |
|---|---|
| 2026-07-18 | Plataforma: celular (mobile) |
| 2026-07-18 | 2 carros por equipe |
| 2026-07-18 | Gestão entre corridas: investir moedas em peças dos carros, base do time, pilotos e equipe |
| 2026-07-18 | Corrida liberada ao acumular energia suficiente |
| 2026-07-18 | Na corrida, o jogador pilota um dos carros: visão de mapa do circuito, carro como ícone, botão pressionado = acelerar (autorama) |
| 2026-07-18 | **Q1 — Anatomia da run:** a run é UMA corrida. Cada volta completada libera 1 boost (lista a definir). Boosts resetam a cada corrida (não acumulam entre corridas). Campeonato = 10 corridas |
| 2026-07-18 | **Q2 — Pilotagem (corrigido):** o jogador NÃO segura/solta o botão. Ele recebe um "desafio de precisão": um cursor percorre uma barra passando pelas zonas vermelha → amarela → verde → roxa (perfeita), e ele precisa apertar o botão no instante certo, dentro de um limite de tempo. Esse desafio acontece nas **saídas** (largada, saída de curva, saída dos boxes) e nas **frenagens** (entrada de curva, entrada nos boxes). Quanto mais precisa a zona acertada, maior o ganho de velocidade/qualidade da ação. Nitro é um especial que pode ser usado junto da aceleração ou da frenagem; usado na frenagem durante uma tentativa de ultrapassagem, aumenta a taxa de sucesso da ultrapassagem + da curva. Errar feio a aceleração/frenagem = perda de tempo (saída de traseira ou de frente) |
| 2026-07-18 | **Estrutura em rodadas:** a corrida é dividida em uma sequência de eventos: largada → 1ª curva → reta → curva seguinte → ... → fecha a volta, e assim por diante até o fim da corrida. Cada evento é uma "saída" ou uma "frenagem" |
| 2026-07-18 | **Saídas (largada, saída de curva, saída dos boxes):** o jogador aperta o botão para definir a velocidade até a próxima frenagem |
| 2026-07-19 | **Boost — confirmado (1 por volta):** o boost é oferecido 1x por volta completada (na saída da reta principal/largada de volta), não a cada saída — evita ~9 escolhas por volta em pistas como Spa. Jogador escolhe 1 de 3 |
| 2026-07-18 | **Frenagens (entrada de curva, entrada nos boxes):** o jogador só aperta o botão para definir a velocidade de contorno da curva (ou o tempo de parada nos boxes). O tempo de boxes também é calculado com base na qualidade da equipe de pit stop |
| 2026-07-18 | **Ultrapassagem (detalhado):** é um input do jogador — ele decide tentar a ultrapassagem *antes* da frenagem, quando está a uma certa distância do carro da frente. Tentar a ultrapassagem torna a frenagem mais difícil (zonas de acerto mais estreitas); quanto mais próximo do carro da frente, menor a dificuldade extra. Uma frenagem sem tentativa de ultrapassagem, mas com resultado perfeito (roxo), também pode resultar em ultrapassagem, se a diferença de velocidade for suficiente |
| 2026-07-18 | **Distância como gap de tempo:** a distância até o carro da frente é medida em segundos (ex.: "+1,482s" atrás, ou "-0,337s" à frente), não em porcentagem. A opção de tentar ultrapassagem só aparece se o gap for menor que 1 segundo (em módulo). O gap é atualizado a cada saída/frenagem conforme o resultado do desafio de timing, e a ultrapassagem acontece organicamente quando o gap cruza de positivo para negativo (ou o inverso, quando o jogador é ultrapassado) |
| 2026-07-18 | **Live-timing e animação entre eventos:** entre cada pedido de decisão/timing, os carros avançam visualmente na pista e o gap (live-timing) é atualizado em tempo real durante essa animação |
| 2026-07-18 | **Nitro (reformulado):** a decisão de usar nitro é apresentada *antes* do desafio de timing (não durante). Usar nitro melhora um resultado bom em uma porcentagem (ex.: +10% no tempo ganho) e reduz a penalidade se o jogador errar o botão |
| 2026-07-18 | **Curadoria de curvas:** sequências de curvas e chicanes (ex.: S do Senna em Interlagos, Maggots em Silverstone, Eau Rouge em Spa) contam como **1 curva só** para fins de desafio de timing. A curadoria de quantos desafios existem por pista será feita pista a pista, depois |
| 2026-07-18 | **Evolução das zonas:** o tamanho das zonas verde/roxa (mais fáceis de acertar) evolui com upgrade de peças do carro |
| 2026-07-18 | **Saúde do carro:** reseta a cada corrida (não precisa reparo entre corridas). Sem custo associado por enquanto |
| 2026-07-18 | **Q3 — Falha e dano:** erros geram perda de tempo ou batida, dependendo da gravidade. Acelerar demais e ir para a brita/erros grandes também consomem "saúde" do carro. Corrida termina se: bater forte OU acumular dano suficiente (saúde zerada) |
| 2026-07-18 | **Q4 — 2º carro:** conta pontos para o campeonato (campeonato de construtores). Pilotos contratáveis têm skills: aceleração, frenagem, pace, ultrapassagem, dev. do carro, marketing |
| 2026-07-18 | **Q5 — Escala da corrida:** grid de **12 carros no total** (10 oponentes + os 2 carros da equipe do jogador), equivalente a 6 equipes na pista. Corridas de ~5 minutos (por enquanto). Meta de ~10 voltas, variando conforme o tamanho do circuito |
| 2026-07-18 | **Pit stop:** por enquanto, obrigatório — acontece na metade da corrida (ex.: volta 5 de 10). Funciona como uma frenagem: se o jogador estiver perto o suficiente do carro da frente na hora do pit, um resultado muito bom no botão pode gerar ultrapassagem; um resultado ruim pode fazer o jogador ser ultrapassado. Não há decisão explícita de "tentar ultrapassar" no pit — é automático, a favor ou contra, conforme o resultado. A equipe de pit stop (contratável) deixa a zona de acerto mais larga/fácil |
| 2026-07-18 | **Fluxo de DNF (game over):** DNF exibe uma tela de fim de corrida com o motivo (batida ou defeito no carro). Jogador escolhe: (a) voltar à corrida pagando um custo — só disponível se ainda não usou essa opção nesta corrida (1x por corrida) — retornando com o carro reparado; ou (b) não voltar. Em seguida, tela de resumo da corrida: posição final e itens ganhos |
| 2026-07-18 | **Tela Oficina:** exibe a imagem do carro com os 7 slots posicionados sobre o desenho (motor, asa dianteira, asa traseira, chassis, suspensão, pneu, livery), cada um selecionável para equipar/fundir peças. O slot de livery abre um modal à parte com 6 posições de patrocinador para preencher |
| 2026-07-18 | **Q7 — Peças do carro:** motor, asa dianteira, asa traseira, chassis, suspensão, pneu, livery (marketing). Livery pode receber até 6 patrocinadores diferentes (equivalente às runas do Archero) |
| 2026-07-18 | **Q8 — Piloto titular vs. IA:** pilotos contratados só importam para o carro guiado pela IA. A skill de "dev. do carro" desse 2º piloto beneficia a equipe inteira |
| 2026-07-18 | **Q9 — Base do time:** escritórios geram peças de carro, com níveis de raridade (cinza, verde, azul, roxo, dourado, vermelho). 1 escritório por tipo de peça + 1 de marketing. É preciso investir nos escritórios para aumentar produção. Peças acumulam com o tempo real (estilo Archero) e precisam ser "coletadas"; corridas também entregam peças novas |
| 2026-07-18 | **Fluxo de moedas (Gold):** Gold permite ao jogador investir nos escritórios da base, em pilotos ou na equipe. Peças (ou receitas para upgrade de peças) são fabricadas pelos escritórios, OU obtidas nos "slots" do jogo, OU obtidas ao fim de uma corrida (dependendo do resultado). Mecânica de peça/receita semelhante ao Archero |
| 2026-07-18 | **Q11 — Progressão de mundo:** Kart → Turismo → Fórmula. Em cada categoria, jornada de corridas regionais (dentro do país) → continentais. Vencer o campeonato continental promove para a próxima categoria, repetindo a jornada, até chegar em Fórmula |
| 2026-07-18 | **Q12 — Formato/câmera:** retrato, estilo autorama, com o **circuito inteiro visível na tela** (sem câmera seguindo o carro). Ícone do piloto 1 (do jogador) é o maior da pista. Ícone do 2º piloto (IA) tem destaque próprio. 1º, 2º e 3º colocados têm ícones destacados (tamanhos escalonados). Demais carros usam ícones pequenos para evitar poluição visual. Engine: decisão adiada — será definida futuramente por um agente "Tech Lead" dedicado |
| 2026-07-18 | **Q6 — Boosts por volta:** lista da seção 6.1 (nitro extra, pneu novo/grip, freio reforçado, rasante/slipstream, reparo rápido, fôlego de ultrapassagem, janela ampliada, recuperação de erro) aprovada como ponto de partida |
| 2026-07-18 | **Q10 — Economia (aprovado):** Energia — teto de **30** (superável só via prêmio de slot), custo de **5 por corrida**, recarga por tempo/anúncio/gemas ao estilo Archero (valor exato de regen a definir). Moeda soft = **Gold**. Moeda premium = **Aura**. Baús de peças e fusão 3→1 confirmados como no Archero. Reparo/revive: carro volta com HP cheio após DNF, custa Aura ou anúncio. Passe de Temporada e estratégia de monetização: **adiados para muito mais à frente no projeto** — não detalhar agora |
| 2026-07-18 | **Extra — Cargos contratáveis da equipe:** 2º piloto, engenheiro de corrida (racing engineer), chefe de mecânicos (lead mechanic), equipe de pit stop, equipe de marketing. Um de cada por time |

## 4. Mapeamento Archero → Racing Manager (referência de design)

| Sistema no Archero | Equivalente no Racing Manager | Status |
|---|---|---|
| Hub/lobby (herói + capítulo + jogar) | Garagem/QG (2 carros + próxima corrida + CORRER) | Definido |
| Energia (custo por run, recarga por tempo/anúncio/gemas) | Energia por corrida | Definido (valores a definir) |
| Equipamento com slots, raridades, fusão 3→1, upgrade com moedas | Peças do carro: motor, asa dianteira, asa traseira, chassis, suspensão, pneu, livery (6 slots de patrocinador) | Definido |
| Heróis (bônus passivos, evolução) | Pilotos contratáveis com skills: aceleração, frenagem, pace, ultrapassagem, dev. do carro, marketing | Definido |
| Pet/Espírito (luta sozinho ao seu lado) | 2º carro guiado por IA (piloto contratado), pontua no campeonato de construtores | Definido |
| Talentos (moedas → bônus aleatório permanente) | Escritórios da base (1 por tipo de peça + marketing), níveis de raridade cinza→vermelho, geram peças passivamente (coletar como no Archero); investimento com Gold | Definido |
| Habilidade aleatória a cada nível na run (1 de 3) | Boost aleatório a cada saída (largada/saída de curva/saída dos boxes), 1 de 3, reseta por corrida | Definido |
| Sala do anjo (curar OU buff) | Pit stop: tempo calculado pela qualidade da equipe de pit stop + desafio de frenagem do jogador | Definido |
| Morte na run + revive (anúncio/gemas) | Batida forte ou saúde do carro zerada = DNF; reparo (HP cheio) via Aura ou anúncio | Definido |
| Capítulos com salas, dificuldade crescente, farm | Progressão Kart → Turismo → Fórmula; regional → continental por categoria; campeonato de 10 corridas | Definido |
| Loja (baús, ofertas diárias, gemas) | Loja de peças/baús, moeda premium = Aura | Definido |
| Eventos + battle pass | GPs especiais + passe de "Temporada" acoplado ao campeonato | Adiado (seção 7) |

## 5. Telas previstas

1. **Garagem/QG (hub)** — carros, energia, próxima corrida, botão CORRER, navegação inferior
2. **Oficina** — inventário de peças, equipar, fundir, aprimorar
3. **Pilotos** — contratar, evoluir, escalar quem guia o carro 2
4. **Equipe/Staff** — contratar 2º piloto, racing engineer, lead mechanic, pit stop team, marketing team (1 de cada por time)
5. **Sede do time** — escritórios por tipo de peça + marketing, upgrade de nível/raridade, coleta de produção passiva
6. **Loja** — baús, ofertas diárias, gemas
7. **Eventos / Temporada** — GPs especiais e passe
8. **Seleção de campeonato/corrida** — mostra progressão Kart/Turismo/Fórmula e regional/continental
9. **Corrida (gameplay)** — mapa do circuito em retrato, ícones escalonados (piloto 1 maior, piloto 2 destacado, pódio destacado, demais pequenos), HUD com barra de timing (zonas vermelha/amarela/verde/roxa), botão acelerar/frear, botão nitro, indicador de saúde do carro
10. **Escolha de boost** — overlay ao completar cada volta
11. **Resultado/pódio** — posição, pontos de construtores, peças e moedas ganhas, progressão do passe

## 6. Questões em aberto (A DEFINIR)

Nenhuma pergunta estrutural em aberto no momento. Pendências de **conteúdo/detalhamento futuro** (não bloqueiam o design):

- Curadoria de quantos desafios de curva existem em cada pista real/fictícia (feita pista a pista, mais à frente).
- Valor exato de regeneração de energia (ex.: 1 a cada X minutos).
- Passe de Temporada e estratégia de monetização — deliberadamente adiados (ver seção 7).

### 6.1 Boosts por volta (aprovado como ponto de partida)

Cada saída (largada, saída de curva, saída dos boxes) oferece 1 de 3 opções aleatórias, efeito válido só para a corrida atual:

- **Nitro extra**: +1 carga de nitro disponível
- **Pneu novo (grip)**: aumenta a zona "verde/roxa" de precisão nas próximas 3 curvas
- **Freio reforçado**: reduz a chance de travar/perder tempo ao errar a frenagem
- **Rasante (slipstream)**: ganho de velocidade automático se estiver colado no carro da frente por X segundos
- **Reparo rápido**: recupera uma fatia de saúde do carro
- **Fôlego de ultrapassagem**: +% de sucesso em tentativas de ultrapassagem pelas próximas 2 curvas
- **Janela ampliada**: aumenta o tempo disponível para acertar o timing nas próximas curvas
- **Recuperação de erro**: a próxima curva errada perde menos tempo que o normal

### 6.2 Economia (aprovada)

- **Energia**: teto de **30** (superável só ganhando prêmio em um slot); custo de **5 por corrida**; regenera com o tempo real, estilo Archero (valor exato de regen a definir); recarga extra via anúncio recompensado ou Aura.
- **Gold (moeda soft)**: ganho ao final de cada corrida (por posição) + produção passiva dos escritórios da base (coletada manualmente, como no Archero). Usado para investir em escritórios, pilotos e equipe.
- **Aura (moeda premium)**: comprada ou ganha em eventos. Usada para: recarregar energia, abrir baús premium, acelerar produção dos escritórios, reparo/revive pós-DNF.
- **Baús de peças**: bronze/prata/ouro/platina, com chance de raridade crescente (cinza→vermelho). Ganhos em corridas, eventos e loja (slots).
- **Fusão**: 3 peças iguais (mesmo tipo + raridade) fundem em 1 peça da raridade seguinte — igual ao Archero.
- **Reparo/revive pós-DNF**: carro volta com HP cheio, custa Aura ou assistir a um anúncio.

## 7. Fora de escopo (por enquanto)

- **Engine/tecnologia**: decisão provisória tomada pelo CTO em 2026-07-19 (web/TypeScript/Phaser para a fase de validação, com reavaliação no Gate 1) — detalhes e racional no **Claude-Tech.md**. Engine nativa definitiva continua fora de escopo até o Gate 1.
- **Passe de Temporada**: conceito aceito, mas detalhamento adiado para muito mais à frente no projeto.
- **Estratégia de monetização (IAP, anúncios)**: adiada para muito mais à frente no projeto.

## 8. Glossário

- **Run**: uma corrida (unidade de gameplay que consome energia).
- **Energia**: recurso que libera a próxima corrida. Teto 30, custo 5 por corrida.
- **Rodada**: um evento dentro da corrida — largada, curva, reta ou fechamento de volta — parte da sequência largada → curva → reta → curva → ... → fecha a volta.
- **Saída**: momento de largada, saída de curva ou saída dos boxes; jogador aperta o botão para definir velocidade até a próxima frenagem e escolhe 1 de 3 boosts.
- **Frenagem**: momento de entrada de curva ou entrada nos boxes; jogador aperta o botão só para definir a velocidade de contorno (ou o tempo de boxes, também influenciado pela qualidade da equipe de pit stop).
- **Boost**: melhoria temporária escolhida a cada saída; vale só para a corrida atual.
- **Zona de timing**: faixa (vermelha/amarela/verde/roxa) usada para medir a precisão do input em cada saída/frenagem; roxa = perfeita. Tamanho das zonas evolui com upgrade de peças.
- **Nitro**: especial usável junto da aceleração ou frenagem; na frenagem durante ultrapassagem, aumenta taxa de sucesso da manobra + da curva.
- **Saúde do carro**: recurso que se esgota com erros de pilotagem (acelerar demais, ir para a brita, batidas); ao zerar, causa DNF. Reseta a cada corrida.
- **DNF**: did not finish — corrida encerrada por batida forte ou saúde zerada.
- **Reparo/revive**: opção de voltar à prova após DNF com HP cheio, via Aura ou anúncio.
- **Autorama**: pilotagem em mapa 2D visto de cima, circuito inteiro visível, ícone do carro na pista, desafios de timing em saídas e frenagens.
- **Escritório**: estrutura da base que produz peças de um tipo específico; precisa ser coletado e pode ser upado em raridade (cinza→vermelho).
- **Gold**: moeda soft. Investida em escritórios, pilotos e equipe.
- **Aura**: moeda premium. Usada em energia, baús, aceleração de produção e reparo/revive.

## 9. Próximos passos

1. **Prototipar greybox da mecânica de pilotagem** (prioridade máxima): validar se o desafio de precisão em saídas/frenagens + ultrapassagem é divertido sozinho.
2. Definir valor exato de regeneração de energia e balancear o custo do "voltar à corrida" pós-DNF (em Aura).
3. Iniciar curadoria de curvas por pista, começando por 2–3 pistas de referência.
4. Detalhar regras de produção/coleta dos escritórios da Sede (taxa de geração por nível, tempo até encher).
5. Especificar o sistema de fusão de peças e patrocinadores da livery (raridades, efeitos de cada patrocinador).
6. Quando o greybox validar a diversão do core loop: retomar Passe de Temporada e monetização (fora de escopo por ora).

## 10. Registro de entregas visuais

- Fluxograma de telas do Manager (hub Garagem/QG + navegação inferior + caminho até a corrida).
- Fluxograma da corrida (visão geral com pit stop obrigatório na metade + detalhe do ciclo de cada curva).
- Fluxo de DNF/game over (motivo, opção de voltar 1x por corrida, resumo da corrida).
- Mockups de tela: Oficina (carro com 7 slots + modal de livery/patrocinadores), Pilotos, Equipe/Staff, Sede (escritórios), Loja.
- **Protótipo greybox jogável** (`greybox-pilotagem.html`): pista quadrada de 4 curvas com largada/chegada e pit, carros animados entre eventos, live-timing em segundos (gap ao carro da frente), decisão de nitro antecipada com bônus/penalidade percentual, desafio de timing em saídas/frenagens, boost por saída, ultrapassagem orgânica pelo cruzamento do gap, pit stop obrigatório na volta 5/10, saúde do carro, DNF com motivo + revive 1x por corrida, tela de resumo
