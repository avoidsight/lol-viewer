// Continuous interpolation; subdued gray for low scores, orange-gold for high scores.
const stops = [[0, 148, 158, 171], [39, 148, 158, 171], [40, 136, 166, 187],
  [59, 89, 198, 202], [79, 229, 194, 102], [100, 245, 159, 70]] as const;
export function scoreColor(score: number): string {
  const value = Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i];
    if (value <= b[0]) {
      const fraction = (value - a[0]) / (b[0] - a[0]);
      return `rgb(${[1, 2, 3].map(index => Math.round(a[index] + (b[index] - a[index]) * fraction)).join(', ')})`;
    }
  }
  return 'rgb(245, 159, 70)';
}
