# Claude-Marketing.md — Mercado/Produto, Projeto "Racing Manager"

> Documento vivo mantido pelo agente CPO (ver protocolo em Claude-Tech.md, seção 1.1).
> Anexar junto com CLAUDE.md e Claude-Tech.md em conversas sobre mercado, persona, gates de retenção, benchmarks e (mais à frente) validação de demanda/fake-ads.
> Última atualização: 2026-07-21 (sessão 1 — 1ª ativação real do documento. Ele nunca tinha sido criado, apesar de já ser citado por `Claude-Tech.md` como se decisões do CPO já existissem: gates de retenção D1≥30%/D7≥18% (linha 76), regra de sequenciamento das trilhas (linha 52), soft launch Brasil (linha 68) e um "risco P3" de leaderboard assíncrono (§7). Esta rodada formaliza esses números herdados como decisões registradas e responde, com pesquisa de mercado, a pergunta que o PO pediu explicitamente para o CPO avaliar: o ritmo de progressão de raridade calibrado pelo harness de economia do TechLead-Manager — Claude-Manager.md §2.6 — está certo, rápido demais ou devagar demais frente ao LTV potencial de um jogador engajado vs. o risco de perda de interesse?)

## 1. Mercado e persona (resumo mínimo, coerente com CLAUDE.md)

**Categoria:** F2P mobile, meta-game de gestão estilo Archero (moedas, peças com raridade e fusão, energia) + pilotagem arcade de precisão (autorama) durante as corridas. Não é um jogo de corrida "sim" tradicional — a fantasia é ser dono/gestor de equipe **e** piloto titular.

**Persona primária:** jogador mobile casual-a-médio já habituado a jogos de gacha/idle-RPG com fusão de equipamento (público de Archero, Survivor.io e afins) OU fã de corrida/F1 atraído pela fantasia de gestão de equipe. Sessões curtas (~5 min por corrida), jogadas várias vezes ao dia, gated por energia (teto 30, custo 5/corrida, regen 12 min/ponto — Claude-Manager.md §2.1). O "jogador muito engajado" da pergunta do PO (abre o app 5x/dia, todo dia) é a versão comportamental do que a indústria chama de perfil hardcore/potencial pagador — ver seção 3.

**Progressão de mundo:** Kart → Turismo → Fórmula, regional → continental por categoria (CLAUDE.md §Q11). Ainda sem conteúdo além do M1 (Spa).

**Plataforma/alvo:** mobile (Android de entrada priorizado no alvo de performance, Claude-Tech.md linha 68), pt-BR nativo desde o início.

## 2. Decisões (DEFINIDO)

| Data | Decisão |
|---|---|
| Herdada (citada em Claude-Tech.md linha 68, sem racional documentado antes deste arquivo) | **Soft launch Brasil** como alvo inicial de mercado/performance. Honrado como está — coerente com pt-BR nativo já decidido (CLAUDE.md §7) — mas a origem exata da escolha (custo de UA, familiaridade do PO com o mercado, tamanho de base testável) não está registrada em nenhum documento anterior. Registrado como lacuna herdada, não como decisão nova do CPO — ver seção 5 |
| Herdada (citada em Claude-Tech.md linha 76, sem racional documentado antes deste arquivo) | **Gates de retenção D1 ≥ 30%, D7 ≥ 18%.** Formalizados agora como decisão vigente do CPO — sem motivo forte para contradizer nesta 1ª rodada. **Achado desta sessão (pesquisa de mercado, seção 3):** D7 ≥ 18% é uma meta bem acima da média do gênero mesmo entre os melhores projetos (benchmarks 2025 apontam top 25% em ~7-8% de D7) — tratar como meta aspiracional/teto de excelência, não como piso saudável mínimo. Recalibrar com dado real assim que houver telemetria de usuários de verdade (fora do próprio PO) |
| Herdada (citada em Claude-Tech.md linha 52, sem contradição) | **Regra de sequenciamento:** trilha Racing lidera; meta-game mínimo só após o Gate 1; UA/monetização muito depois. Honrada sem alteração — coerente com o fora-de-escopo do CLAUDE.md §7 |
| 2026-07-21 | **Ritmo de progressão de raridade (resposta à pergunta 3 de Claude-Manager.md §3): manter o ritmo recalibrado do harness de economia** — mesmo o jogador mais engajado simulado (5x/dia) só alcança `purple` em 21 dias; `gold` fica para 1-3 meses e `red` para vários meses depois disso. Não acelerar (não voltar ao modelo da 1ª rodada, que maxava o carro em 21 dias) nem desacelerar mais (não empurrar `purple` para além de 3 semanas). Análise completa e condições de validade na seção 3 |
| 2026-07-21 | **Risco P3 (leaderboard assíncrono, citado em Claude-Tech.md §7)** formalizado no registro de riscos do CPO (seção 4) — reconstruído nesta rodada por não ter racional documentado antes; ver ressalva na seção 5 |

## 3. Análise — ritmo de progressão de raridade vs. LTV e risco de engajamento

### 3.1 A pergunta, reformulada

O harness de economia (`tools/economyHarness.ts`, Claude-Manager.md §2.6) simula 21 dias e mostra: mesmo o cenário mais engajado (5x/dia, ~19 corridas/dia efetivas por causa do teto de energia) só alcança a raridade `purple` — o 4º de 6 degraus (cinza→verde→azul→**roxo**→dourado→vermelho) — nesse período. `gold`/`red` ficam para além da janela simulada (estimativa não confirmada: 1-3 meses e "vários meses" respectivamente). A pergunta do PO: esse ritmo está certo, deveria ser mais rápido (satisfação em semanas, risco de esvaziar o gancho de longo prazo cedo) ou mais devagar/raro (mais prestígio no topo, risco de frustrar quem não vê progresso e evadir antes de virar engajado)?

Importante: isso é sobre **ritmo do loop de progressão**, não sobre monetização/IAP — essa frente segue formalmente fora de escopo (CLAUDE.md §7).

### 3.2 O que a pesquisa de mercado mostra

**Benchmarks de retenção do gênero mobile F2P (2024-2025):** agregadores de dados de mercado (Mistplay, maf.ad, Gamigion) reportam D1 médio do quartil superior de projetos em ~26-28% (até 31-33% em iOS), D7 mediano geral de só 3,4-3,9%, e D7 do quartil superior em 7-8%; 75% dos projetos têm D28 abaixo de 3%. **Achado direto para a pergunta 2 do CTO/Manager e para os gates herdados:** nossa meta de D7 ≥ 18% é mais que o dobro do que os melhores projetos do mercado atingem — é uma meta de elite, não uma linha de corte razoável para "jogo saudável". Isso não muda a recomendação de ritmo por si só, mas contextualiza o quão ambicioso é o funil que estamos tentando sustentar com esse ritmo de progressão.

**Concentração de LTV (whales/engajados):** múltiplas fontes de mercado (Udonis, SQ Magazine, Superscale) convergem: ~1-2% dos jogadores ("whales") geram 50-70% da receita; um "mid-tier" de jogadores moderados soma outros 30-40%; a maioria contribui pouco. Esses jogadores de LTV alto são justamente os que **logam com mais frequência e passam mais tempo no jogo** — o perfil "5x/dia todo dia" da pergunta do PO é, comportamentalmente, o próprio perfil de maior potencial de LTV que o jogo pode ter (mesmo antes de existir qualquer IAP). Perder o interesse desse perfil por falta de meta de longo prazo é, na prática, perder justamente a cauda que mais importa para LTV futuro.

**Estudo de caso direto (Archero é a referência de design explícita do projeto):** duas análises de design públicas — Deconstructor of Fun, *"How Archero Shot to the Top, and How You Can Do Better"* (2019), e Reverse Nerf, *"Retention Made Easy With Archero and What Its Missing"* — chegam à mesma conclusão sobre o motivo real de churn de médio/longo prazo do Archero: **não foi progressão lenta demais**, foi "velocidade de progressão do meta lenta, falta de momentos recompensadores de médio/longo prazo e ausência de definição de metas de longo prazo" — ou seja, o problema não é o topo ser distante, é o **meio do caminho ser vazio/sem graça** (poucas trilhas de progressão, poucas fusões acontecendo, sensação de estagnação entre uma recompensa e outra). O sucessor Archero 2, aliás, dobra a aposta em progressão de muito longo prazo: adicionou "Godforge", um sistema de upgrade **depois** do topo de raridade (Mythic+3), reforçando que o gênero trata metas de meses como normais e desejáveis para o jogador engajado — desde que o caminho até lá seja pontuado de recompensas frequentes.

### 3.3 Cruzando com o nosso harness

A recalibração do TechLead-Manager já entrega exatamente a característica que faltou no Archero real, e não por acidente: mesmo no cenário mais devagar (1x/dia), a 1ª fusão acontece no dia ~4, e no cenário engajado (5x/dia) há **~76 fusões em 21 dias** — ou seja, o jogador tem um evento de "subiu de raridade" acontecendo com frequência real ao longo de todo o período, não só quando (se) chegar ao topo. Isso é a "trilha de progressão com momentos recompensadores de médio prazo" que a análise do Archero real aponta como o que faltou lá. O ritmo do TOPO (meses até `red`) só seria um problema real se o MEIO estivesse vazio — e os dados do harness mostram que não está.

## 4. Recomendação final

**Manter o ritmo recalibrado como está — não acelerar, não desacelerar ainda mais.** Nem "satisfação em semanas" (repetiria o erro já detectado e corrigido na 1ª rodada do harness — carro maxado em 21 dias esvazia o gancho de longo prazo exatamente do perfil de maior LTV potencial) nem "mais raro/lento que isso" (arriscaria replicar a real falha de retenção do Archero: nada de errado em o topo ser distante, desde que o caminho até lá continue pontuado — e hoje continua).

Condições para essa recomendação valer, registradas como acompanhamento (não como bloqueio):

1. **Cada fusão/subida de raridade precisa ser celebrada na UI**, não só a chegada ao topo — isso é o que transforma "meses até red" de frustração em expectativa. Depende da tela de Oficina (já priorizada nos próximos passos do Manager) ter feedback visual de verdade por fusão, não só o resumo textual atual do Hub.
2. **O perfil de risco real não é o jogador de 5x/dia da pergunta — é o de 1x/dia** (tabela do harness: só chega a "maioria blue, 1 green" em 21 dias). Esse é o perfil mais representativo de uma coorte real de D7/D30 (a maioria dos jogadores reais não abre o app 5x/dia). Recomendo que, quando houver telemetria real, o funil de retenção seja cruzado especificamente com esse cenário mais lento — se o jogador casual sentir estagnação antes do dia 4 (1ª fusão), esse é o sintoma que bateria com o padrão de churn real do Archero, não o ritmo do topo.
3. **Meta de D7 ≥ 18% deve ser tratada como aspiracional**, não como piso — o benchmark de mercado (seção 3.2) mostra que mesmo os melhores projetos do gênero giram em torno de 7-8%. Um resultado real de 10-15% de D7 já seria, pelo benchmark, um resultado de topo de mercado — não um fracasso da meta herdada.
4. **Confirmar a estimativa com dado real**, não só extrapolação: já está sugerido pelo TechLead-Manager rodar o harness a 90 dias (Claude-Manager.md §5, item 3) — recomendo isso especificamente para checar se a estimativa de "1-3 meses para gold, vários meses para red" se sustenta, já que hoje é estimativa, não simulação.

Amarrando ao estágio do projeto: ainda não existe base de jogadores real (Gate 1 é provisório, n=1 — o próprio PO), então **esta é uma aposta de design, não uma decisão validada por dado próprio** — só por benchmark de mercado e por um estudo de caso do próprio jogo de referência do projeto. É uma aposta de baixo custo de reverter: é sempre mais fácil (e bem recebido pelo jogador) **acelerar** um ritmo depois de ver dado real de que está devagar demais do que **desacelerar** um ritmo já entregue (isso é percebido como nerf e gera reação negativa real em jogos ao vivo). Portanto, errar agora para o lado "um pouco devagar" (como está) é a aposta mais segura neste estágio.

## 5. Pendências / lacunas herdadas (não são decisões novas do CPO — são buracos no rastro documental que este documento formaliza mas não preenche)

- **Origem dos números D1 ≥ 30% / D7 ≥ 18%:** não há registro em nenhum documento de como/quando esses valores foram fixados antes de serem citados em Claude-Tech.md linha 76. Formalizados aqui como meta vigente (seção 2), mas sem rastro do racional original. Recalibrar com dado real assim que houver telemetria de usuários fora do PO.
- **Origem do "soft launch Brasil":** citado como alvo (Claude-Tech.md linha 68) sem documentação prévia do porquê especificamente Brasil (custo de UA? mercado de referência do PO? tamanho de amostra testável?). pt-BR nativo já é decisão registrada (CLAUDE.md §7), mas a escolha do soft launch em si não tem racional escrito.
- **Risco P3 "leaderboard assíncrono" (Claude-Tech.md §7, tabela de marcos M3+):** citado como um risco do CPO associado a essa feature, sem detalhamento do racional original em nenhum documento. Registro reconstruído nesta rodada (hipótese razoável, não a intenção original confirmada): um leaderboard assíncrono como único gancho competitivo de longo prazo pode ser um hook fraco sem pressão social em tempo real — vale validar contra jogadores reais antes de investir (E-306 é M3+, sem urgência).
- **Fake-ads / validação de demanda de mercado:** atribuído ao CPO no protocolo (Claude-Tech.md §1.1, linha 13) mas nunca executado nem detalhado neste documento — ainda não é prioridade no estágio atual (sem base de jogadores, Gate 1 provisório), registrado como próximo passo futuro.

## 6. Próximos passos

1. Quando houver telemetria real de usuários fora do PO (mesmo que poucos), comparar D1/D7 reais com os benchmarks de mercado desta sessão (seção 3.2) para recalibrar os gates herdados com dado próprio, não só benchmark externo.
2. Acompanhar o resultado do harness de economia a 90 dias (já sugerido pelo TechLead-Manager) para confirmar ou corrigir a estimativa de "1-3 meses até gold, vários meses até red".
3. Cruzar telemetria real do funil de fusão/raridade especificamente no cenário de baixa frequência (1x/dia) quando houver dado — é o perfil de maior risco de estagnação percebida, não o engajado.
4. Esclarecer com o PO, só por rastreabilidade (não bloqueia nada agora), a origem dos números D1/D7 e do soft launch Brasil — sem isso, seguimos tratando como herdados/aspiracionais.
5. Quando o projeto se aproximar de validar demanda de mercado (fora de escopo por ora, junto com monetização — CLAUDE.md §7), iniciar a frente de fake-ads mencionada no protocolo de agentes.
6. Revisitar esta análise quando a trilha Arte/Conteúdo (Trilha 3, Claude-Tech.md §2) for ativada — greybox "estilo Atari" pode estar deprimindo qualquer leitura de retenção atual além do próprio PO.

## 7. → impacta outros documentos

Sinalizando para o CTO propagar na revisão do sprint (protocolo §1.1):

- Claude-Manager.md §3, pergunta 3: marcada como respondida, com resumo curto e referência a este documento (seção 3-4) — não duplicar o conteúdo completo lá.
- Claude-Tech.md linha 76 (gates D1/D7) e linha 68 (soft launch Brasil): seguem citando os mesmos números, agora com lastro formal aqui; nenhuma mudança de valor proposta nesta rodada, só formalização + ressalva de que são metas aspiracionais/sem racional documentado, a recalibrar com dado real.
