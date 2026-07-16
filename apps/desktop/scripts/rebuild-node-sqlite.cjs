const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { dirname } = require('node:path');

const packageJson = require.resolve('better-sqlite3/package.json');
const requireFromSqlite = createRequire(packageJson);
const installer = requireFromSqlite.resolve('prebuild-install/bin.js');
const result = spawnSync(process.execPath, [installer, '--force'], {
  cwd: dirname(packageJson),
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
