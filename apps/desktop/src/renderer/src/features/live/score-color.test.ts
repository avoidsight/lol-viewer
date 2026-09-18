import { expect, it } from 'vitest';
import { scoreColor } from './score-color';
it('interpolates score colors, clamps extremes and keeps low scores gray', () => {
  expect(scoreColor(0)).toBe(scoreColor(39));
  expect(scoreColor(-1)).toBe(scoreColor(0)); expect(scoreColor(NaN)).toBe(scoreColor(0));
  expect(scoreColor(101)).toBe(scoreColor(100));
  expect(scoreColor(69)).toBe('rgb(159, 196, 152)');
  expect(scoreColor(100)).toBe('rgb(245, 159, 70)');
});
