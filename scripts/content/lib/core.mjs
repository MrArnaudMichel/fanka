// Loads the pure TypeScript helpers from core/ for plain-node scripts. Node
// cannot resolve their extensionless imports, so they are bundled in memory
// with esbuild (already a dependency of the toolchain) and imported as a
// data: URL. Vitest goes through the same path, so scripts behave alike.
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');

const result = await build({
  stdin: {
    contents: `
      export { fromZhuyin } from './core/chinese/zhuyin';
      export { toNumbered, parsePinyin } from './core/chinese/pinyin';
      export { wrongScriptCharactersIn } from './core/chinese/script';
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});

const code = result.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

/** @type {(zhuyin: string) => Array<{ text: string, tone: 1 | 2 | 3 | 4 | 5 }>} */
export const fromZhuyin = mod.fromZhuyin;
/** @type {(syllables: Array<{ text: string, tone: 1 | 2 | 3 | 4 | 5 }>) => string} */
export const toNumbered = mod.toNumbered;
/** @type {(text: string, bundle: 'mainland' | 'taiwan') => string[]} */
export const wrongScriptCharactersIn = mod.wrongScriptCharactersIn;
/** @type {(input: string) => Array<{ text: string, tone: 1 | 2 | 3 | 4 | 5 }>} */
export const parsePinyin = mod.parsePinyin;
