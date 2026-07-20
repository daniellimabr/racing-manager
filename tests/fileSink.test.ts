import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileSink } from '../src/telemetry/fileSink.js';

const path = join(tmpdir(), `racing-manager-telemetry-test-${process.pid}.jsonl`);

describe('fileSink — modo offline em arquivo (usado pelo harness de bots)', () => {
  afterEach(() => {
    if (existsSync(path)) rmSync(path);
  });

  it('grava 1 linha JSON por evento, no formato { ts, event, properties }', () => {
    const sink = createFileSink(path);
    sink.track('dnf', { motivo: 'batida forte', volta: 3 });
    sink.track('race_end', { position: 1 });

    const lines = readFileSync(path, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.length).toBe(2);
    expect(lines[0].event).toBe('dnf');
    expect(lines[0].properties).toEqual({ motivo: 'batida forte', volta: 3 });
    expect(typeof lines[0].ts).toBe('string');
    expect(lines[1].event).toBe('race_end');
  });
});
