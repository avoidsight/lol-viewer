import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop packaging metadata', () => {
  it('declares the workspace pnpm version for electron-builder dependency collection', () => {
    const desktop = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { packageManager?: string };
    const workspace = JSON.parse(readFileSync(resolve('../..', 'package.json'), 'utf8')) as { packageManager?: string };
    expect(desktop.packageManager).toBe('pnpm@10.13.1');
    expect(desktop.packageManager).toBe(workspace.packageManager);
  });
});
