import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_SOURCES, LIBRARIES } from '~/utils/licences';

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
});
