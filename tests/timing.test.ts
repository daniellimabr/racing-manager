import { describe, it, expect } from 'vitest';
import { tierFromPosition, zoneHalves, computeScale, canAttemptOvertake, combineTiers } from '../src/core/timing.js';

describe('tierFromPosition', () => {
  const halves = zoneHalves(1);

  it('acerta roxo no centro exato', () => {
    expect(tierFromPosition(50, halves)).toBe('purple');
  });
  it('acerta vermelho nas bordas', () => {
    expect(tierFromPosition(0, halves)).toBe('red');
    expect(tierFromPosition(100, halves)).toBe('red');
  });
  it('respeita a fronteira entre verde e âmbar', () => {
    expect(tierFromPosition(50 - halves.green, halves)).toBe('green');
    expect(tierFromPosition(50 - halves.green - 0.01, halves)).toBe('amber');
  });

  it('aceita um centro deslocado (ex.: aceleração, centro em 75)', () => {
    expect(tierFromPosition(75, halves, 75)).toBe('purple');
    expect(tierFromPosition(0, halves, 75)).toBe('red'); // longe do centro 75 (d=75 > halves.amber)
    expect(tierFromPosition(75 - halves.purple, halves, 75)).toBe('purple');
  });

  it('centro default (50) continua igual sem passar o 3º argumento', () => {
    expect(tierFromPosition(50, halves)).toBe(tierFromPosition(50, halves, 50));
  });
});

describe('combineTiers', () => {
  it('dois roxos combinam em roxo', () => {
    expect(combineTiers('purple', 'purple')).toBe('purple');
  });
  it('roxo + verde combina em roxo (média 85, no limite)', () => {
    expect(combineTiers('purple', 'green')).toBe('purple');
  });
  it('roxo + miss combina em amber (regressão à média)', () => {
    expect(combineTiers('purple', 'miss')).toBe('amber');
  });
  it('dois miss combinam em miss', () => {
    expect(combineTiers('miss', 'miss')).toBe('miss');
  });
  it('é simétrico (ordem dos argumentos não importa)', () => {
    expect(combineTiers('green', 'red')).toBe(combineTiers('red', 'green'));
  });
});

describe('computeScale', () => {
  it('pit stop alarga a zona (scale > 1)', () => {
    const s = computeScale({ base: 1, isPit: true, isSaida: false, overtakeAttempt: false, gap: 0, pendingBoostIsPneu: false, pitCrewQuality: 0.5 });
    expect(s).toBeGreaterThan(1);
  });

  it('tentar ultrapassar com gap próximo de 0 quase não penaliza', () => {
    const s = computeScale({ base: 1, isPit: false, isSaida: false, overtakeAttempt: true, gap: 0.02, pendingBoostIsPneu: false });
    expect(s).toBeGreaterThan(0.95);
  });

  it('tentar ultrapassar com gap próximo do limite (1s) é bem mais difícil', () => {
    const s = computeScale({ base: 1, isPit: false, isSaida: false, overtakeAttempt: true, gap: 0.99, pendingBoostIsPneu: false });
    expect(s).toBeLessThan(0.55);
  });

  it('nunca ultrapassa o teto de escala (MAX_SCALE)', () => {
    const s = computeScale({ base: 1.4, isPit: true, isSaida: false, overtakeAttempt: false, gap: 0, pendingBoostIsPneu: true, pitCrewQuality: 1 });
    expect(s).toBeLessThanOrEqual(1.5);
  });
});

describe('canAttemptOvertake', () => {
  it('permite tentar abaixo de 1s (em módulo)', () => {
    expect(canAttemptOvertake(0.99)).toBe(true);
    expect(canAttemptOvertake(-0.99)).toBe(true);
  });
  it('bloqueia a partir de 1s', () => {
    expect(canAttemptOvertake(1.0)).toBe(false);
    expect(canAttemptOvertake(1.5)).toBe(false);
  });
});
