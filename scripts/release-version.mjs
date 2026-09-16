import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function validateReleaseVersion(value) {
  if (typeof value !== 'string' || value !== value.trim() || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
      || value === '0.0.0' || value.split('.').some(part => Number(part) > 65535)) {
    throw new Error('请输入有效发布版本 x.y.z（例如 0.1.0），不能使用 0.0.0，每段最多 65535。');
  }
  return value;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try {
    const path = new URL('../apps/desktop/package.json', import.meta.url);
    const original = readFileSync(path, 'utf8');
    const metadata = JSON.parse(original);
    const [command, value] = process.argv.slice(2);
    if (command === 'set') {
      const version = validateReleaseVersion(value);
      // Preserve formatting and touch only the top-level package version.
      const updated = original.replace(/("version"\s*:\s*")[^"]*(")/, (_match, before, after) => `${before}${version}${after}`);
      if (JSON.parse(updated).version !== version) throw new Error('无法更新客户端版本字段。');
      writeFileSync(path, updated, 'utf8');
      console.log(`客户端发布版本：${version}`);
    } else if (command === 'check') {
      console.log(`客户端发布版本：${validateReleaseVersion(metadata.version)}`);
    } else throw new Error('Usage: node scripts/release-version.mjs set <x.y.z> | check');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
