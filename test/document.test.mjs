import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDocument,
  makeShape,
  parseDocument,
  serializeDocument,
  exportTikz,
  exportTex,
  bounds,
  translate,
  resize,
  exampleDocument,
} from '../core/document.mjs';

test('a drawing survives a save/load without changing its exported source', () => {
  const doc = exampleDocument(),
    loaded = parseDocument(serializeDocument(doc));
  assert.deepEqual(loaded, doc);
  assert.equal(exportTikz(loaded), exportTikz(doc));
  loaded.elements[0].points[0].x = 999;
  assert.notEqual(doc.elements[0].points[0].x, 999);
});
test('malformed imports and duplicate IDs are rejected before reaching the canvas', () => {
  const doc = exampleDocument();
  for (const mutate of [
    (d) => (d.version = 2),
    (d) => (d.page.width = 0),
    (d) => (d.elements[0].points[0].x = Infinity),
    (d) => (d.elements[0].style.stroke = 'red] execute at end picture={bad}'),
    (d) => d.elements.push(d.elements[0]),
    (d) => (d.elements[0].type = 'script'),
    (d) => (d.elements[0].points = []),
  ]) {
    const candidate = structuredClone(doc);
    mutate(candidate);
    assert.throws(() => parseDocument(JSON.stringify(candidate)));
  }
  assert.throws(() => parseDocument('{bad JSON}'));
});
test('imports discard unexpected properties instead of forwarding them', () => {
  const doc = exampleDocument();
  doc.onLoad = 'bad';
  doc.elements[0].html = '<script>';
  doc.elements[0].style.onclick = 'bad';
  const loaded = parseDocument(JSON.stringify(doc));
  assert.equal(loaded.onLoad, undefined);
  assert.equal(loaded.elements[0].html, undefined);
  assert.equal(loaded.elements[0].style.onclick, undefined);
});
test('line, rectangle and circle use the correct physical coordinates and line width', () => {
  const doc = newDocument();
  doc.elements = [
    makeShape(
      'line',
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      { width: 1, arrow: 'both' },
    ),
    makeShape('rect', [
      { x: 50, y: 60 },
      { x: 20, y: 10 },
    ]),
    makeShape('circle', [
      { x: 60, y: 50 },
      { x: 63, y: 54 },
    ]),
  ];
  const source = exportTikz(doc);
  assert.match(source, /\(10,80\) -- \(30,60\)/);
  assert.match(source, /line width=1pt/);
  assert.match(source, /\{Latex\}-\{Latex\}/);
  assert.match(source, /\(50,40\) rectangle \(20,90\)/);
  assert.match(source, /\(60,50\) circle \[radius=5mm\]/);
});
test('Bezier controls and arc orientation are preserved in mathematical coordinates', () => {
  const doc = newDocument();
  doc.elements = [
    makeShape('bezier', [
      { x: 10, y: 90 },
      { x: 20, y: 70 },
      { x: 30, y: 60 },
      { x: 40, y: 80 },
    ]),
    {
      ...makeShape('arc', [
        { x: 50, y: 50 },
        { x: 60, y: 50 },
      ]),
      startAngle: 90,
      endAngle: -90,
    },
  ];
  const s = exportTikz(doc);
  assert.match(s, /\(10,10\) \.\. controls \(20,30\) and \(30,40\) \.\. \(40,20\)/);
  assert.match(s, /\(50,60\) arc\[start angle=90,end angle=-90,radius=10mm\]/);
});
test('text is escaped while explicitly selected math keeps its TeX commands', () => {
  const doc = newDocument();
  const plain = makeShape('text', [{ x: 20, y: 20 }]);
  plain.text = '50% & A_B #1 $x$ {y} \\';
  const math = makeShape('text', [{ x: 50, y: 50 }]);
  math.math = true;
  math.text = '\\frac{a_1}{b^2}';
  doc.elements = [plain, math];
  const s = exportTikz(doc);
  assert.ok(s.includes('50\\% \\& A\\_B \\#1 \\$x\\$ \\{y\\} \\textbackslash{}'));
  assert.ok(s.includes('$\\frac{a_1}{b^2}$'));
  plain.text = '日本語';
  assert.match(exportTex(doc), /Compile with LuaLaTeX/);
  assert.match(exportTex(doc), /\\usepackage\{luatexja\}/);
});
test('moving and resizing keep circle geometry and Bezier proportions', () => {
  const circle = makeShape('circle', [
    { x: 50, y: 50 },
    { x: 55, y: 50 },
  ]);
  translate(circle, 10, -10);
  assert.deepEqual(bounds(circle), { x: 55, y: 35, width: 10, height: 10 });
  resize(circle, 20, 20);
  assert.deepEqual(bounds(circle), { x: 55, y: 35, width: 20, height: 20 });
  const curve = makeShape('bezier', [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 20, y: 20 },
    { x: 30, y: 0 },
  ]);
  resize(curve, 60, 40);
  assert.deepEqual(curve.points, [
    { x: 0, y: 0 },
    { x: 20, y: 40 },
    { x: 40, y: 40 },
    { x: 60, y: 0 },
  ]);
});
test('export supports all drawing types and contains no NaN or undefined values', () => {
  const doc = newDocument();
  doc.elements = [
    makeShape(
      'ellipse',
      [
        { x: 10, y: 20 },
        { x: 50, y: 60 },
      ],
      { fill: '#eff7f5', dash: 'dotted' },
    ),
    makeShape(
      'polyline',
      [
        { x: 10, y: 90 },
        { x: 40, y: 80 },
        { x: 60, y: 90 },
      ],
      { dash: 'dashed', arrow: 'end' },
    ),
  ];
  const s = exportTex(doc);
  assert.match(s, /\(30,60\) ellipse \[x radius=20mm,y radius=20mm\]/);
  assert.match(s, /\(10,10\) -- \(40,20\) -- \(60,10\)/);
  assert.doesNotMatch(s, /NaN|undefined|Infinity/);
});
test('a horizontal or vertical line can gain height or width through numeric resizing', () => {
  const line = makeShape('line', [
    { x: 10, y: 10 },
    { x: 10, y: 40 },
  ]);
  resize(line, 20, 30);
  assert.deepEqual(line.points, [
    { x: 10, y: 10 },
    { x: 30, y: 40 },
  ]);
  resize(line, 20, 0);
  assert.deepEqual(line.points, [
    { x: 10, y: 10 },
    { x: 30, y: 10 },
  ]);
  resize(line, 20, 15);
  assert.deepEqual(line.points, [
    { x: 10, y: 10 },
    { x: 30, y: 25 },
  ]);
});
