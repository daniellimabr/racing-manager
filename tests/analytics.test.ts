import { describe, it, expect, afterEach } from 'vitest';
import { consoleSink, configureAnalytics, track } from '../src/telemetry/analytics.js';

describe('analytics — wrapper com sink plugável', () => {
  afterEach(() => configureAnalytics(consoleSink)); // não vaza estado entre testes

  it('track() delega pro sink ativo, com o evento e as propriedades', () => {
    const calls: { event: string; properties?: Record<string, unknown> }[] = [];
    configureAnalytics({ track: (event, properties) => calls.push({ event, properties }) });

    track('race_start', { trackId: 'spa' });

    expect(calls).toEqual([{ event: 'race_start', properties: { trackId: 'spa' } }]);
  });

  it('funciona sem properties', () => {
    const calls: string[] = [];
    configureAnalytics({ track: (event) => calls.push(event) });

    track('session_start');

    expect(calls).toEqual(['session_start']);
  });

  it('consoleSink (modo offline) não lança erro', () => {
    expect(() => consoleSink.track('race_end', { position: 3 })).not.toThrow();
  });
});
