import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_SOURCES, DATA_SOURCES, LIBRARIES } from '~/utils/licences';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('Licences page', () => {
  it('credits every production dependency, and only those', () => {
    const deps = Object.keys(pkg.dependencies).sort();
    const listed = LIBRARIES.map((l) => l.package).sort();
    expect(listed).toEqual(deps);
  });

  it('credits data sources that are still build inputs', () => {
    const missing = DATA_SOURCES.filter((d) => !(d.package in pkg.devDependencies)).map((d) => d.package);
    expect(missing).toEqual([]);
  });

  it('credits CC-CEDICT for the meanings of both courses', () => {
    const cedict = CONTENT_SOURCES.find((c) => c.name === 'CC-CEDICT');
    expect(cedict?.notice).toMatch(/both courses/);
    expect(CONTENT_SOURCES.find((c) => c.name === 'HSK vocabulary')?.notice).toMatch(/CC-CEDICT/);
  });

  it('says the TBCL list is adapted, and that Apache-2.0 is the model licence', () => {
    expect(CONTENT_SOURCES.find((c) => c.url === 'https://coct.naer.edu.tw')?.notice).toMatch(/[Aa]dapted/);
    const examples = CONTENT_SOURCES.find((c) => c.name === 'Example sentences');
    expect(examples?.licence).toMatch(/model/i);
    expect(examples?.url).not.toMatch(/Qwen3$/);
  });
});
