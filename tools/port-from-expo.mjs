// okan-app の純粋関数（TS）を、okan-pwa/public/lib にESモジュール(JS)として移植する。
// TypeScript本体で変換するので、型を消した跡の空白が残らない。
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const SRC = 'D:/Claud_code_File_0/Projects/okan-app';
const DST = 'D:/Claud_code_File_0/Projects/okan-pwa/public';
const ts = createRequire(join(SRC, 'package.json'))('typescript');

const files = [
  'lib/datetime.ts',
  'lib/goalProgress.ts',
  'lib/weather.ts',
  'lib/okan/types.ts',
  'lib/okan/rules.ts',
  'lib/okan/templates.ts',
  'lib/okan/engine.ts',
  'lib/okan/suppression.ts',
  'lib/okan/schedulePlan.ts',
];

for (const f of files) {
  const input = readFileSync(join(SRC, f), 'utf8');
  let code = ts.transpileModule(input, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
      importsNotUsedAsValues: undefined,
      verbatimModuleSyntax: false,
    },
  }).outputText;
  const fromDir = posix.dirname(f);
  code = code.replace(/from ['"]@\/(lib\/[^'"]+)['"]/g, (_, target) => {
    let rel = posix.relative(fromDir, target);
    if (!rel.startsWith('.')) rel = './' + rel;
    return `from '${rel}.js'`;
  });
  const out = join(DST, f.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, code, 'utf8');
  console.log('ported', f, code.length);
}
