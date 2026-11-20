// Reads colours straight out of Kanto's token files, so the brand images never carry a
// colour Kanto does not define. kantoColour('dark', '--color-primary-base') → '#5f5dea'.
// Neutrals are oklch with the default tint (--neutral-hue 278, chroma 1).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, '../../node_modules/kanto-ds/dist/tokens');
const DEFAULTS = { '--neutral-hue': '278', '--neutral-chroma': '1' };

/** The first rule block of a token file, as { '--name': 'raw value' }. */
function block(file) {
  const css = readFileSync(`${DIR}/${file}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = css.slice(css.indexOf('{') + 1, css.indexOf('\n}'));
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return out;
}

const dark = block('colors.css');
const THEMES = { dark, light: { ...dark, ...block('theme-light.css') } };

const hex2 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');

function oklchToHex(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return '#' + lin.map((x) => hex2(x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)).join('');
}

function resolve(map, value) {
  // var(--x, fallback): the token if this theme defines it, the fallback otherwise.
  let v = value;
  for (let guard = 0; guard < 10 && v.includes('var('); guard++) {
    v = v.replace(/var\((--[a-z0-9-]+)(?:\s*,\s*([^()]+|[^()]*\([^()]*\)))?\)/g, (_, name, fb) =>
      map[name] ?? DEFAULTS[name] ?? (fb ?? '').trim());
  }
  v = v.replace(/calc\(([^()]+)\)/g, (_, e) => String(Function(`return (${e})`)()));
  let m;
  if ((m = v.match(/^#([0-9a-f]{6})$/i))) return v.toLowerCase();
  if ((m = v.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/))) {
    const [r, g, b, a = 1] = m.slice(1).map(Number);
    return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : '#' + [r, g, b].map((x) => hex2(x / 255)).join('');
  }
  if ((m = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/))) return oklchToHex(+m[1], +m[2], +m[3]);
  throw new Error(`Kanto token not resolvable to a colour: ${value} → ${v}`);
}

export function kantoColour(theme, name) {
  const map = THEMES[theme];
  if (!(name in map)) throw new Error(`Kanto has no ${name} in the ${theme} theme`);
  return resolve(map, map[name]);
}
