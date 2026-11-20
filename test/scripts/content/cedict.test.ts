import { describe, expect, it } from 'vitest';
import { parseCedict } from '../../../scripts/content/lib/cedict.mjs';

const TEXT = [
  '# CC-CEDICT',
  '#! version=1',
  '綠 绿 [lu:4] /green/CL:個|个[ge4]/',
  '你好 你好 [ni3 hao3] /hello/hi/',
  '女 女 [Nu:3] /woman/',
].join('\n');

describe('parseCedict', () => {
  const map = parseCedict(TEXT);

  it('skips comments and splits meanings', () => {
    expect(map.get('你好')).toEqual([
      { traditional: '你好', simplified: '你好', pinyin: 'ni3 hao3', meanings: ['hello', 'hi'] },
    ]);
  });

  it('normalises u: to v and lower-cases', () => {
    expect(map.get('綠')?.[0]?.pinyin).toBe('lv4');
    expect(map.get('女')?.[0]?.pinyin).toBe('nv3');
  });

  it('keys by traditional and by simplified', () => {
    expect(map.get('绿')).toEqual(map.get('綠'));
    expect(map.get('綠')?.[0]?.simplified).toBe('绿');
  });
});
