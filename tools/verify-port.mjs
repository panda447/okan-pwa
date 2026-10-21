// 移植したJS（public/lib）が、okan-app の既存テスト（117件）を通ることを確かめる。
// 使い方: node tools/verify-port.mjs        （先に node tools/port-from-expo.mjs で移植しておく）
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pwaLib = resolve(here, '..', 'public', 'lib').replaceAll('\\', '/');
const okanApp = resolve(here, '..', '..', 'okan-app').replaceAll('\\', '/');

const config = {
  preset: 'jest-expo',
  rootDir: okanApp,
  roots: [`${okanApp}/__tests__`, pwaLib],
  modulePaths: [`${okanApp}/node_modules`],
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  // '@/lib/...' を、元のTSではなく移植したJSへ向ける
  moduleNameMapper: { '^@/lib/(.*)$': `${pwaLib}/$1`, '^@/(.*)$': '<rootDir>/$1' },
};

// コマンドラインにJSONを渡すとWindowsのシェルが引用符を食うので、一時ファイル経由で渡す
const dir = mkdtempSync(join(tmpdir(), 'okan-verify-'));
const configPath = join(dir, 'jest.config.json');
writeFileSync(configPath, JSON.stringify(config));
const r = spawnSync('npx', ['jest', '--config', `"${configPath}"`], { cwd: okanApp, stdio: 'inherit', shell: true });
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
