import { describe, it, expect } from 'vitest';
import { normalizedToScreen, pathIndexToT, pointAtT } from '../src/view/pathUtils.js';

describe('normalizedToScreen', () => {
  it('mapeia (0,0) e (1,1) para os cantos do maior quadrado que cabe no retângulo, com padding', () => {
    const rect = { x: 0, y: 0, width: 400, height: 800 };
    const topLeft = normalizedToScreen({ x: 0, y: 0 }, rect, 20);
    const bottomRight = normalizedToScreen({ x: 1, y: 1 }, rect, 20);
    expect(topLeft.x).toBeCloseTo(20, 5);
    expect(bottomRight.x).toBeCloseTo(380, 5);
    expect(bottomRight.x - topLeft.x).toBeCloseTo(bottomRight.y - topLeft.y, 5); // quadrado, sem distorção
  });
});

describe('pointAtT / pathIndexToT', () => {
  const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

  it('pathIndexToT + pointAtT reproduz o vértice original', () => {
    const t = pathIndexToT(2, path.length);
    expect(pointAtT(path, t)).toEqual({ x: 1, y: 1 });
  });

  it('interpola no meio de um segmento', () => {
    const p = pointAtT(path, 0.125); // meio do segmento 0->1 (t entre 0 e 0.25)
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('dá wrap em t negativo ou > 1', () => {
    expect(pointAtT(path, -0.0)).toEqual(pointAtT(path, 1));
    expect(pointAtT(path, 1.25)).toEqual(pointAtT(path, 0.25));
  });
});
