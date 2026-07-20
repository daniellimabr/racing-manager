/**
 * Sink de arquivo local (Node-only) — "modo offline" da telemetria, mesmo
 * formato usado pelo PostHog, pra ser lido depois por qualquer ferramenta
 * de análise. Usado pelo harness de bots (ver Claude-Tech.md §4/§5).
 *
 * NUNCA importar este arquivo de `src/view/` — depende de `node:fs` e
 * quebraria o bundle do navegador.
 */
import { appendFileSync } from 'node:fs';
import type { AnalyticsSink } from './analytics.js';

export function createFileSink(path: string): AnalyticsSink {
  return {
    track(event, properties) {
      const line = JSON.stringify({ ts: new Date().toISOString(), event, properties: properties ?? {} });
      appendFileSync(path, line + '\n');
    },
  };
}
