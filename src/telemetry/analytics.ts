/**
 * Wrapper de telemetria (T-005, ver Claude-Tech.md §4). Fica atrás desta
 * interface pra permitir trocar de fornecedor sem tocar no resto do código.
 *
 * Seguro pra bundlar no navegador: nenhuma dependência de Node (`fs` etc.)
 * aqui — isso vive em `fileSink.ts`, usado só pelo harness de bots (Node).
 */

export interface AnalyticsSink {
  track(event: string, properties?: Record<string, unknown>): void;
}

/** Fallback padrão ("modo offline"): loga no console, sempre disponível. */
export const consoleSink: AnalyticsSink = {
  track(event, properties) {
    console.log(`[analytics] ${event}`, properties ?? {});
  },
};

let activeSink: AnalyticsSink = consoleSink;

export function configureAnalytics(sink: AnalyticsSink): void {
  activeSink = sink;
}

export function track(event: string, properties?: Record<string, unknown>): void {
  activeSink.track(event, properties);
}

/**
 * Inicializa o PostHog a partir de `VITE_POSTHOG_KEY` (env var — nunca
 * hardcoded, mesmo sendo um project token write-only "seguro pra público").
 * Sem a env var, fica no `consoleSink` (modo offline).
 */
export async function initPostHogFromEnv(
  env: Record<string, string | undefined> = import.meta.env as unknown as Record<string, string | undefined>
): Promise<void> {
  const key = env.VITE_POSTHOG_KEY;
  if (!key) {
    console.info('[analytics] VITE_POSTHOG_KEY ausente — modo offline (console)');
    return;
  }
  const host = env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  const { default: posthog } = await import('posthog-js');
  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    // só Product Analytics por ora (ver Claude-Tech.md §3) — o resto dos
    // produtos do PostHog fica desligado deliberadamente no client também
    capture_pageview: false,
    autocapture: false,
    disable_session_recording: true,
    capture_performance: false,
  });
  configureAnalytics({
    track(event, properties) {
      posthog.capture(event, properties);
    },
  });
}
