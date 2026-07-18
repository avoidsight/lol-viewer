import { describe, expect, it } from 'vitest';
import { createFixtureLiveMatch, fixtureModeEnabled } from './live-match';

describe('fixture live match', () => {
  it('contains ten players with ten history records each', () => {
    const fixture = createFixtureLiveMatch('ranked-solo');
    expect(fixture.players).toHaveLength(10);
    expect(fixture.players.flatMap((player) => player.matches)).toHaveLength(100);
  });

  it('requires the flag and an explicit test guard in an unpackaged app', () => {
    expect(fixtureModeEnabled(['--fixture-live-match'], false, { PLAYWRIGHT_TEST: '1' })).toBe(true);
    expect(fixtureModeEnabled([], false, { PLAYWRIGHT_TEST: '1' })).toBe(false);
    expect(fixtureModeEnabled(['--fixture-live-match'], false, {})).toBe(false);
  });

  it('can never run in a packaged production app', () => {
    expect(fixtureModeEnabled(['--fixture-live-match'], true, { PLAYWRIGHT_TEST: '1' })).toBe(false);
    expect(fixtureModeEnabled(['--fixture-live-match'], true, { NODE_ENV: 'development' })).toBe(false);
  });
});
