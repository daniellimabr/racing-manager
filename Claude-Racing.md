# Claude-Racing.md — Trilha Racing, Projeto "Racing Manager"

> Documento vivo mantido pelo agente TechLead-Racing (ver protocolo em Claude-Tech.md, seção 1.1).
> Anexar junto com CLAUDE.md e Claude-Tech.md em conversas sobre a trilha Racing.
> Última atualização: 2026-07-19 (sessão 1 — Sprint 1/M0, executado pelo celular via chat, sem IDE)

## 1. Status do Sprint 1 (M0 — Fundação)

| Tarefa | Status | Nota |
|---|---|---|
| T-001 Estrutura do projeto | ✅ Feito | Vite + TS + Vitest + tsx; Phaser instalado, view/ ainda vazia |
| T-002 Core extraído + testes | ✅ Feito | `src/core/` sem dependência de engine; 22 testes (vitest), typecheck estrito limpo |
| T-003 Pista como dado + Spa | ✅ Feito (parcial) | `tracks/spa.json` com os 9 desafios curados; **falta** o render de debug do traçado (precisa de canvas/Phaser — fica para a sessão com IDE) |
| T-004 Harness de bots | ✅ Feito | `tools/botHarness.ts`, 4 perfis, roda 500 corridas/perfil em < 1s |
| T-005 Telemetria (PostHog) | ⏳ Não iniciado | Precisa de conta PostHog (decisão do PO) |
| T-006 Deploy contínuo | ⏳ Não iniciado | Precisa de conta Vercel/Netlify (decisão do PO) |

**Por que T-005/T-006 ficaram de fora:** exigem criar contas em serviços externos — mais produtivo fazer isso interativamente na primeira sessão com IDE/terminal completo, não pelo chat no celular.

## 2. Decisões técnicas tomadas nesta sessão

| Data | Decisão |
|---|---|
| 2026-07-19 | **Modelo de eventos da pista:** cada curva curada vira 2 eventos na sequência da corrida (frenagem ao entrar, saída ao sair), repetidos por volta. O pit stop é inserido como 1 evento extra ao final da volta configurada (`pitAfterLap`). Função pura `buildEventSequence(track)` em `src/core/track.ts` |
| 2026-07-19 | **Boost 1x por volta, interpretado como:** largada (volta 1) + saída da última curva de cada volta seguinte (exceto a última volta, que não libera boost pois a corrida termina). Para Spa (8 voltas) = 8 boosts na corrida inteira. Testado em `tests/track.test.ts` |
| 2026-07-19 | **Gap/ultrapassagem como função pura:** `resolveCurrent()` não sorteia ultrapassagem — ela é uma consequência de o gap cruzar de sinal (positivo→negativo = ultrapassou; negativo→positivo = foi ultrapassado), só verificado em eventos de frenagem/pit, nunca em saída. Confere exatamente com a decisão do CLAUDE.md |
| 2026-07-19 | **Nitro:** `tryUseNitro()` é uma função separada, chamada pela UI/bot *antes* de `resolveCurrent()` — o core nunca decrementa nitro sozinho, evita duplo consumo |
| 2026-07-19 | **`RaceState` é mutável e a `resolveCurrent`/`advance` o modificam in-place** (por simplicidade e performance no harness de bots, que roda milhares de corridas). Se a view Phaser precisar de imutabilidade para re-render (ex.: React), reavaliar no Sprint 2 |

## 3. Achado do harness de bots (primeira rodada) — ⚠️ requer ação

Rodando 500 corridas simuladas por perfil em Spa (146 eventos/corrida):

| Perfil | Posição média | Taxa de DNF | Curvas mais punitivas |
|---|---|---|---|
| Casual | 6.00 | **100%** | La Source, Les Combes, Bruxelles/Rivage |
| Médio | 5.33 | **100%** | Les Combes, Bruxelles/Rivage, Eau Rouge+Raidillon |
| Skilled | 5.31 | 56.6% | Stavelot, Pouhon, Fagnes |
| Temerário | 5.82 | **100%** | La Source, Les Combes, Eau Rouge+Raidillon |

**Diagnóstico:** as constantes de dano/ganho (`src/core/constants.ts`) foram herdadas do greybox de validação, calibrado para uma demo de ~20 eventos. A corrida completa tem 146 eventos (72 curvas × 2 + largada + pit) — o dano acumulado estoura os 100 de saúde muito antes da chegada, mesmo para o perfil Skilled.

**Isso não é um bug — é exatamente para isso que o harness existe** (ver Claude-Tech.md, seção 5): encontrar isso agora, com números, é muito mais barato que descobrir no Gate 1 com testers humanos frustrados.

**Ação recomendada para a T-107 (balance pass):** o dano por evento precisa cair proporcionalmente ao número de eventos por corrida, ou a saúde máxima precisa subir bastante, ou (mais provável, o certo) uma combinação: reduzir DAMAGE de amber/red/miss, e/ou aumentar a regeneração implícita via boosts de saúde/"freio reforçado" com mais frequência. Não ajustei os números sozinho agora — é uma tarefa de iteração com o harness, melhor feita com mais tempo de sessão.

## 4. Próximos passos (retomar com IDE)

1. **T-107 (balance pass):** iterar as constantes de `constants.ts` contra as metas da seção 5 do Claude-Tech.md, usando `npm run bots` a cada ajuste.
2. **T-003 (finalizar):** render de debug do traçado de Spa (canvas simples, só para conferir visualmente a curadoria).
3. **T-101 a T-104 (Sprint 2):** view Phaser — grid de 12 carros, tela de corrida, integração do fluxo completo, animação entre eventos.
4. **T-005/T-006:** criar contas PostHog + hospedagem estática, integrar `analytics.ts`.

## 5. Como rodar (para retomar no VS Code)

```
cd racing-manager
npm install
npm test        # 22 testes devem passar
npm run bots     # ver a tabela de balanceamento acima se reproduzir
npm run dev      # ainda não há view Phaser — próximo passo
```
