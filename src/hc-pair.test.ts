import {
  contrastFraction,
  levelFraction,
  numberAt,
  pairHC,
  pairNormal,
  parseToneValue,
  parseToneValueAt,
} from './hc-pair';

describe('hc-pair', () => {
  describe('pair selection', () => {
    it('reads both ends of a pair', () => {
      expect(pairNormal([30, 60])).toBe(30);
      expect(pairHC([30, 60])).toBe(60);
    });

    it('treats a bare value as both ends', () => {
      expect(pairNormal(42)).toBe(42);
      expect(pairHC(42)).toBe(42);
    });
  });

  describe('contrastFraction', () => {
    it("is undefined in 'auto' mode", () => {
      expect(contrastFraction({})).toBeUndefined();
      expect(contrastFraction({ contrastLevel: 'auto' })).toBeUndefined();
    });

    it('maps 0–100 onto 0–1', () => {
      expect(contrastFraction({ contrastLevel: 0 })).toBe(0);
      expect(contrastFraction({ contrastLevel: 50 })).toBe(0.5);
      expect(contrastFraction({ contrastLevel: 100 })).toBe(1);
    });

    it("distinguishes level 0 from 'auto'", () => {
      // Level 0 pins the output to normal contrast AND drops the HC tier;
      // 'auto' keeps the tier. They must not collapse into each other.
      expect(contrastFraction({ contrastLevel: 0 })).not.toBeUndefined();
    });

    it('clamps out-of-range levels', () => {
      expect(contrastFraction({ contrastLevel: 150 })).toBe(1);
      expect(contrastFraction({ contrastLevel: -20 })).toBe(0);
      expect(levelFraction(150)).toBe(1);
      expect(levelFraction(-20)).toBe(0);
    });
  });

  describe('numberAt', () => {
    it('interpolates a numeric pair', () => {
      expect(numberAt([30, 60], 0.5)).toBe(45);
      expect(numberAt([30, 60], 0.25)).toBe(37.5);
    });

    it('returns the authored ends by identity', () => {
      expect(numberAt([0.1, 0.3], 0)).toBe(0.1);
      // `0.1 + (0.3 - 0.1) * 1` is not bit-exactly 0.3 in IEEE 754, so the
      // endpoints must short-circuit rather than compute.
      expect(numberAt([0.1, 0.3], 1)).toBe(0.3);
    });

    it('passes a bare value through at every fraction', () => {
      expect(numberAt(42, 0)).toBe(42);
      expect(numberAt(42, 0.5)).toBe(42);
      expect(numberAt(42, 1)).toBe(42);
    });
  });

  describe('parseToneValueAt', () => {
    it('interpolates two absolute tones', () => {
      expect(parseToneValueAt([30, 20], 0.5)).toEqual({
        kind: 'absolute',
        value: 25,
      });
    });

    it('interpolates two relative deltas without a string round-trip', () => {
      expect(parseToneValueAt(['+10', '+20'], 0.5)).toEqual({
        kind: 'relative',
        value: 15,
      });
      expect(parseToneValueAt(['-6', '-12'], 0.5)).toEqual({
        kind: 'relative',
        value: -9,
      });
    });

    it('returns the authored ends verbatim', () => {
      expect(parseToneValueAt([30, 20], 0)).toEqual(parseToneValue(30));
      expect(parseToneValueAt([30, 20], 1)).toEqual(parseToneValue(20));
    });

    it('passes a bare tone through', () => {
      expect(parseToneValueAt('max', 0.5)).toEqual({
        kind: 'extreme',
        value: 100,
      });
      expect(parseToneValueAt('+20', 0.5)).toEqual({
        kind: 'relative',
        value: 20,
      });
    });

    it('keeps identical ends stable', () => {
      expect(parseToneValueAt(['max', 'max'], 0.5)).toEqual({
        kind: 'extreme',
        value: 100,
      });
    });

    it('switches mixed-kind pairs at level 50 instead of interpolating', () => {
      // Blending across kinds would change which resolver branch runs
      // mid-ramp, so these step instead.
      expect(parseToneValueAt([50, 'max'], 0.49)).toEqual({
        kind: 'absolute',
        value: 50,
      });
      expect(parseToneValueAt([50, 'max'], 0.5)).toEqual({
        kind: 'extreme',
        value: 100,
      });
      expect(parseToneValueAt([50, '+20'], 0.49)).toEqual({
        kind: 'absolute',
        value: 50,
      });
      expect(parseToneValueAt([50, '+20'], 0.5)).toEqual({
        kind: 'relative',
        value: 20,
      });
    });

    it('switches differing extremes at level 50', () => {
      expect(parseToneValueAt(['max', 'min'], 0.49)).toEqual({
        kind: 'extreme',
        value: 100,
      });
      expect(parseToneValueAt(['max', 'min'], 0.5)).toEqual({
        kind: 'extreme',
        value: 0,
      });
    });
  });
});
