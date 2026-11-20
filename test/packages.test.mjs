import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  makeShape,
  newDocument,
  parseDocument,
  serializeDocument,
  exportTex,
  exportTikz,
  packageRequirements,
  exampleDocument,
} from '../core/document.mjs';
import { packageExample } from '../core/examples-specials.mjs';
import { importTex } from '../core/import-tex.mjs';
import { PARTICLES, COMPONENTS, cubicPoint, linearControls } from '../core/specials.mjs';

test('legacy drawing files remain readable and require no specialty packages', async () => {
  const source = await readFile(
      new URL('../examples/circle-tangent.tikzdraw', import.meta.url),
      'utf8',
    ),
    doc = parseDocument(source);
  assert.equal(doc.elements.length, 11);
  assert.deepEqual(packageRequirements(doc), []);
  assert.doesNotMatch(exportTex(doc), /usepackage\{[^}]*circuitikz/);
});
test('mixed drawings preserve all package-specific properties through JSON', () => {
  const doc = packageExample('mixed');
  const f = doc.elements.find((e) => e.type === 'feynman'),
    c = doc.elements.find((e) => e.type === 'circuit');
  Object.assign(f, {
    particle: 'anti fermion',
    label: '\\bar{f}',
    momentum: 'p-q',
    momentumReverse: true,
  });
  Object.assign(c, {
    component: 'leD',
    standard: 'european',
    terminals: 'o-*',
    invert: true,
    current: 'I_1',
  });
  const reopened = parseDocument(serializeDocument(doc));
  assert.deepEqual(reopened, doc);
  assert.deepEqual(packageRequirements(reopened), ['tikz-feynhand', 'circuitikz']);
});
test('unsupported particle and component styles and malformed options are rejected', () => {
  for (const [type, mutations] of [
    [
      'feynman',
      [
        (e) => (e.particle = 'execute'),
        (e) => (e.momentumSide = 'top'),
        (e) => (e.momentumReverse = 'true'),
      ],
    ],
    [
      'circuit',
      [
        (e) => (e.component = 'R,unknown'),
        (e) => (e.standard = 'unknown'),
        (e) => (e.size = 0),
        (e) => (e.terminals = 'bad'),
      ],
    ],
  ]) {
    for (const mutate of mutations) {
      const doc = newDocument();
      const e = makeShape(type, [
        { x: 10, y: 20 },
        { x: 50, y: 20 },
      ]);
      mutate(e);
      doc.elements.push(e);
      assert.throws(() => serializeDocument(doc));
    }
  }
});
test('FeynHand emits named vertices, explicit controls and momentum reversal', () => {
  const doc = newDocument(),
    e = makeShape('feynman', [
      { x: 20, y: 50 },
      { x: 20, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 50 },
    ]);
  Object.assign(e, {
    particle: 'anti fermion',
    momentum: 'k',
    momentumReverse: true,
    label: 'e^-',
  });
  doc.elements.push(e);
  const tex = exportTex(doc);
  assert.ok(tex.includes('\\begin{feynhand}'));
  assert.ok(tex.includes('\\propag[anti fermion'));
  assert.ok(tex.includes("revmom'="));
  assert.ok(tex.includes('controls (20,90) and (60,90)'));
  assert.ok(tex.includes('{$e^-$}'));
});
test('decorated propagators keep their draw=none style and use the requested physical line size', () => {
  const doc = newDocument();
  doc.elements = [
    makeShape(
      'feynman',
      [
        { x: 10, y: 10 },
        { x: 60, y: 10 },
      ],
      { width: 1.2 },
    ),
  ];
  doc.elements[0].particle = 'photon';
  const source = exportTikz(doc);
  assert.ok(source.includes('\\setlength{\\feynhandlinesize}{1.2pt}'));
  assert.ok(source.includes('\\propag[photon,color='));
  assert.doesNotMatch(source, /\\propag\[[^\]]*draw=/);
});
test('colored vertices and connection dots preserve their colors through source import', () => {
  const doc = newDocument();
  for (const type of ['vertex', 'junction'])
    doc.elements.push(makeShape(type, [{ x: 20, y: 20 }], { stroke: '#226b61' }));
  const source = exportTikz(doc);
  assert.equal(exportTikz(importTex(source)), source);
  assert.match(source, /color=td0/);
});
test('CircuiTikZ emits standard, terminal, voltage and current options', () => {
  const doc = newDocument(),
    e = makeShape('circuit', [
      { x: 20, y: 20 },
      { x: 60, y: 20 },
    ]);
  Object.assign(e, {
    standard: 'european',
    label: 'R_1',
    voltage: 'U',
    current: 'I',
    terminals: '*-o',
    invert: true,
  });
  doc.elements.push(e);
  const tex = exportTex(doc);
  assert.ok(tex.includes('\\begin{scope}[european,voltage dir=RP]'));
  assert.ok(tex.includes('to[R,l^={$R_1$},v^={$U$},i>_={$I$},invert,*-o]'));
  assert.deepEqual(packageRequirements(doc), ['circuitikz']);
});
test('source import regenerates identical output for ordinary and specialty drawings', () => {
  for (const original of [
    exampleDocument(),
    ...['feynman', 'circuit', 'mixed'].map(packageExample),
  ]) {
    for (const source of [exportTikz(original), exportTex(original)]) {
      const imported = importTex(source, { name: original.name });
      assert.equal(exportTikz(imported), exportTikz(original), original.name);
    }
  }
});
test('explicit small page dimensions are preserved when importing app source', () => {
  const doc = newDocument();
  doc.page.width = 10;
  doc.page.height = 15;
  doc.elements.push(
    makeShape('line', [
      { x: 1, y: 1 },
      { x: 8, y: 12 },
    ]),
  );
  assert.equal(exportTikz(importTex(exportTex(doc))), exportTikz(doc));
});
test('source edits change actual geometry, labels and component types without hidden metadata', () => {
  const doc = packageExample('circuit'),
    source = exportTex(doc)
      .replace('to[R,', 'to[L,')
      .replace('{$R_1$}', '{$L_1$}')
      .replace('(115,75)', '(125,75)');
  const parsed = importTex(source);
  const inductor = parsed.elements.find((e) => e.type === 'circuit' && e.component === 'L');
  assert.equal(inductor.label, 'L_1');
  assert.equal(inductor.points[1].x, 125);
});
test('hand-written numeric TikZ and circuitikz use cm by default', () => {
  const ordinary = importTex('\\begin{tikzpicture}\\draw[->] (0,0) -- (3,2);\\end{tikzpicture}');
  assert.equal(ordinary.elements[0].points[1].x - ordinary.elements[0].points[0].x, 30);
  assert.equal(ordinary.elements[0].points[0].y - ordinary.elements[0].points[1].y, 20);
  const circuit = importTex(
    '\\begin{circuitikz}[american]\\draw (0,0) to[R,l={$R$}] (3,0);\\end{circuitikz}',
  );
  assert.equal(circuit.elements[0].component, 'R');
  assert.equal(circuit.elements[0].standard, 'american');
});
test('unsupported macros, styles, paths and incomplete sources stop import explicitly', () => {
  const picture = (s) => '\\begin{tikzpicture}' + s + '\\end{tikzpicture}';
  for (const source of [
    picture('\\foreach \\x in {1,2} {\\draw (0,0)--(1,1);}'),
    picture('\\draw[rotate=30] (0,0)--(1,1);'),
    picture('\\draw (0,0) plot coordinates {(1,1)};'),
    picture('\\draw (0,0)--(1,1)'),
    picture('\\draw (0,0)--(1,1);\\input{secret}'),
    picture('\\draw (0,0)--(1,1);\\unknown;'),
  ])
    assert.throws(() => importTex(source));
});
test('plain text escapes, nested math, comments and a blank exported page survive import', () => {
  const doc = newDocument();
  assert.deepEqual(importTex(exportTex(doc)).elements, []);
  const a = makeShape('text', [{ x: 20, y: 20 }]);
  a.text = '50% & A_B {x} \\ path\nline 2';
  const b = makeShape('text', [{ x: 50, y: 50 }]);
  Object.assign(b, { math: true, text: '\\frac{a_1}{b^{2}}' });
  doc.elements = [a, b];
  assert.equal(exportTikz(importTex(exportTex(doc))), exportTikz(doc));
});
test('all particle and component catalog entries export and import', () => {
  const doc = newDocument();
  for (const particle of Object.keys(PARTICLES))
    doc.elements.push(
      Object.assign(
        makeShape('feynman', [
          { x: 10, y: 20 },
          { x: 60, y: 20 },
        ]),
        { particle },
      ),
    );
  for (const component of Object.keys(COMPONENTS))
    doc.elements.push(
      Object.assign(
        makeShape('circuit', [
          { x: 10, y: 60 },
          { x: 60, y: 60 },
        ]),
        { component },
      ),
    );
  assert.equal(importTex(exportTex(doc)).elements.length, doc.elements.length);
});
test('straight controls and curve frames retain their endpoints for SVG and TeX geometry', () => {
  const a = { x: 10, y: 20 },
    b = { x: 70, y: 50 },
    points = linearControls(a, b);
  assert.deepEqual(cubicPoint(points, 0), a);
  assert.deepEqual(cubicPoint(points, 1), b);
  assert.deepEqual(cubicPoint(points, 0.5), { x: 40, y: 35 });
});
