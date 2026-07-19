import { describe, expect, it } from 'vitest';
import { championGuideSnapshotSchema } from '../../shared/ipc';
import { getBundledGuide } from './bundled-guide';

describe('getBundledGuide', () => {
  it('returns a schema-valid, explicitly manual snapshot for the MVP coverage', () => {
    const guide = championGuideSnapshotSchema.parse(getBundledGuide(114, 'TOP'));
    expect(guide).toMatchObject({ championId: 114, lane: 'TOP', source: 'MANUAL' });
  });

  it('returns null instead of fabricating data outside bundled coverage', () => {
    expect(getBundledGuide(999_999, 'TOP')).toBeNull();
  });
});
