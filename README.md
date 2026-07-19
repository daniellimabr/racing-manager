# Racing Manager — Racing (core)

Setup inicial da Trilha Racing (Sprint 1 / M0). Ver `Claude-Racing.md` para o
histórico de decisões e `../Claude-Tech.md` (no projeto) para o backlog macro.

## Rodando

```
npm install
npm test        # suíte de testes do core (vitest)
npm run bots     # harness de bots — 500 corridas simuladas por perfil em Spa
npm run dev      # servidor de desenvolvimento (Vite) — view Phaser entra no Sprint 2
```

## Estrutura

- `src/core/` — simulação pura em TypeScript, sem dependência de engine.
  É a mesma lógica usada pelo jogo (via view/) e pelo harness de bots (headless).
- `src/view/` — camada Phaser (a construir no Sprint 2, T-101 a T-104).
- `tracks/` — pistas como dado (JSON). Curadoria de curvas = editar dado, não código.
- `tools/botHarness.ts` — simulação headless para calibrar parâmetros de jogo.
- `tests/` — testes do core (vitest).
