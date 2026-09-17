import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

describe('release version guard', () => {
  it('updates only package version and leaves files unchanged on invalid input', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'lol-version-test-'));
    try {
      mkdirSync(resolve(dir, 'scripts'));
      mkdirSync(resolve(dir, 'apps/desktop'), { recursive: true });
      const script = resolve(dir, 'scripts/release-version.mjs');
      copyFileSync(resolve('../../scripts/release-version.mjs'), script);
      const path = resolve(dir, 'apps/desktop/package.json');
      const original = '{\n  "name": "test", "version": "0.0.0", "other": true\n}\n';
      writeFileSync(path, original);
      execFileSync(process.execPath, [script, 'set', '1.0.0']);
      expect(readFileSync(path, 'utf8')).toBe(original.replace('0.0.0', '1.0.0'));
      expect(() => execFileSync(process.execPath, [script, 'set', '0.0.0'], { stdio: 'pipe' })).toThrow();
      expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe('1.0.0');
      execFileSync(process.execPath, [script, 'check']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('accepts normal releases and rejects placeholder or invalid Windows versions', () => {
    const url = pathToFileURL(resolve('../../scripts/release-version.mjs')).href;
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { validateReleaseVersion as validate } from ${JSON.stringify(url)};
      for (const version of ['0.1.0','1.0.0','2.12.45']) assert.equal(validate(version), version);
      for (const version of ['0.0.0','v1.0.0','1.0','01.0.0','1.0.0-beta','1.0.65536','1.0.0\\n','1.0.0;echo x','']) assert.throws(() => validate(version));
    `]);
  });
  it('checks all Windows packaging paths and picks the exact version artifact', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts['package:win']).toMatch(/^node .*release-version.mjs check &&/);
    const script = readFileSync(resolve('../../scripts/package-windows.ps1'), 'utf8');
    expect(script).toContain('param([string]$Version)');
    expect(script).toContain('峡谷雷达-$Version-windows-x64-setup.exe');
    expect(script).not.toContain('Sort-Object LastWriteTime');
  });
});
