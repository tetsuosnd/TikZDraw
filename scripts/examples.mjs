import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { packageExample } from '../core/examples-specials.mjs';
import { PARTICLES, COMPONENTS, VERTICES } from '../core/specials.mjs';
import {
  exampleDocument,
  makeShape,
  serializeDocument,
  exportTikz,
  exportTex,
} from '../core/document.mjs';
const out = fileURLToPath(new URL('../examples/', import.meta.url));
await mkdir(out, { recursive: true });
const doc = exampleDocument();
doc.elements.forEach((e, i) => (e.id = `example-${i + 1}`));
for (const [ext, source] of [
  ['tikzdraw', serializeDocument(doc)],
  ['tikz', exportTikz(doc)],
  ['tex', exportTex(doc)],
])
  await writeFile(`${out}circle-tangent.${ext}`, source);
const all = exampleDocument();
all.name = '図形の書き出し確認';
all.elements.push(
  makeShape(
    'rect',
    [
      { x: 12, y: 12 },
      { x: 27, y: 30 },
    ],
    { fill: '#eff7f5' },
  ),
);
all.elements.push(
  makeShape(
    'ellipse',
    [
      { x: 110, y: 70 },
      { x: 145, y: 90 },
    ],
    { dash: 'dotted' },
  ),
);
all.elements.push(
  makeShape(
    'polyline',
    [
      { x: 10, y: 85 },
      { x: 20, y: 90 },
      { x: 30, y: 82 },
    ],
    { dash: 'dashed', arrow: 'both' },
  ),
);
all.elements.push(
  makeShape(
    'bezier',
    [
      { x: 110, y: 10 },
      { x: 120, y: 28 },
      { x: 130, y: 0 },
      { x: 145, y: 20 },
    ],
    { stroke: '#c57542', arrow: 'end' },
  ),
);
const label = makeShape('text', [{ x: 120, y: 45 }]);
Object.assign(label, { text: '\\frac{a_1}{b^2}', math: true, fontSize: 14 });
all.elements.push(label);
await writeFile(`${out}all-shapes.tex`, exportTex(all));
const ja = makeShape('text', [{ x: 80, y: 96 }]);
ja.text = '円と接線';
all.elements.push(ja);
await writeFile(`${out}japanese.tex`, exportTex(all));
console.log('examples/: circle-tangent.{tikzdraw,tikz,tex}, all-shapes.tex, japanese.tex');
for (const kind of ['feynman', 'circuit', 'mixed']) {
  const example = packageExample(kind);
  for (const [ext, source] of [
    ['tikzdraw', serializeDocument(example)],
    ['tikz', exportTikz(example)],
    ['tex', exportTex(example)],
  ])
    await writeFile(`${out}${kind}.${ext}`, source);
}
const catalog = packageExample('mixed');
catalog.name = 'Package symbol catalog';
catalog.elements = [];
catalog.page.height = 200;
Object.keys(PARTICLES).forEach((particle, i) =>
  catalog.elements.push(
    Object.assign(
      makeShape('feynman', [
        { x: 15, y: 15 + i * 22 },
        { x: 65, y: 15 + i * 22 },
      ]),
      {
        particle,
        label: particle === 'anti fermion' ? '\\bar{f}' : particle,
        momentum: i === 0 ? 'p' : '',
      },
    ),
  ),
);
Object.keys(COMPONENTS).forEach((component, i) =>
  catalog.elements.push(
    Object.assign(
      makeShape('circuit', [
        { x: 95, y: 15 + i * 17 },
        { x: 145, y: 15 + i * 17 },
      ]),
      {
        component,
        label: component,
        standard: i % 2 ? 'european' : 'american',
        terminals: i === 0 ? '*-*' : 'none',
        invert: i === 2,
      },
    ),
  ),
);
Object.keys(VERTICES).forEach((vertexStyle, i) =>
  catalog.elements.push(
    Object.assign(makeShape('vertex', [{ x: 20 + i * 15, y: 165 }]), { vertexStyle }),
  ),
);
catalog.elements.push(
  Object.assign(
    makeShape('feynman', [
      { x: 40, y: 195 },
      { x: 70, y: 155 },
      { x: 10, y: 155 },
      { x: 40, y: 195 },
    ]),
    { particle: 'scalar', momentum: 'k', momentumReverse: true },
  ),
);
await writeFile(`${out}package-catalog.tex`, exportTex(catalog));
console.log('examples/: feynman, circuit, mixed, package-catalog');
const japanesePackages = packageExample('mixed');
japanesePackages.elements.find((e) => e.type === 'feynman').label = '\\text{光子}';
japanesePackages.elements.find((e) => e.type === 'circuit').label = '\\text{電源}';
await writeFile(`${out}japanese-packages.tex`, exportTex(japanesePackages));
