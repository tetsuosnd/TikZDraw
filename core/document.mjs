import {
  SPECIAL_TYPES,
  POINT_TYPES,
  specialDefaults,
  specialProperties,
  validateSpecial,
  specialBoundsPoints,
  linearControls,
  packageRequirements,
  exportSpecial,
} from './specials.mjs';
export const PT_MM = 25.4 / 72.27;
export const TYPES = [
  'line',
  'polyline',
  'rect',
  'circle',
  'ellipse',
  'arc',
  'bezier',
  'text',
  ...SPECIAL_TYPES,
];
export const TYPE_NAMES = {
  line: '直線',
  polyline: '折れ線',
  rect: '長方形',
  circle: '円',
  ellipse: '楕円',
  arc: '円弧',
  bezier: 'ベジェ曲線',
  text: 'ラベル',
  feynman: '伝播線',
  vertex: '頂点',
  circuit: '回路部品',
  ground: '接地',
  junction: '接続点',
};
export const DEFAULT_STYLE = {
  stroke: '#263544',
  fill: 'none',
  width: 0.8,
  dash: 'solid',
  arrow: 'none',
};
export const clone = (value) => structuredClone(value);
export const round = (n) => Math.round(n * 10000) / 10000;
export function newDocument() {
  return {
    format: 'tikz-draw',
    version: 1,
    name: '無題',
    page: { width: 160, height: 100, grid: 5 },
    elements: [],
  };
}
export function makeShape(type, points, style = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    points: clone(type === 'feynman' && points.length === 2 ? linearControls(...points) : points),
    style: { ...DEFAULT_STYLE, ...style },
    ...specialDefaults(type),
    ...(type === 'text' ? { text: 'ラベル', math: false, fontSize: 12, anchor: 'center' } : {}),
    ...(type === 'arc' ? { startAngle: 0, endAngle: 180 } : {}),
  };
}
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const color = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
function requireThat(ok, message) {
  if (!ok) throw new Error(message);
}
export function validateDocument(input) {
  requireThat(
    input && input.format === 'tikz-draw' && input.version === 1,
    'TikZ Draw 形式（version 1）のファイルを選んでください。',
  );
  requireThat(typeof input.name === 'string' && input.name.length <= 200, '図の名前が不正です。');
  const p = input.page;
  requireThat(
    p && finite(p.width, 10, 2000) && finite(p.height, 10, 2000) && finite(p.grid, 0.1, 100),
    '用紙サイズまたはグリッド間隔が不正です。',
  );
  requireThat(
    Array.isArray(input.elements) && input.elements.length <= 10000,
    '図形の数が不正です。',
  );
  const ids = new Set();
  for (const e of input.elements) {
    requireThat(
      e && typeof e.id === 'string' && e.id.length <= 100 && !ids.has(e.id),
      '図形の ID が不正または重複しています。',
    );
    ids.add(e.id);
    requireThat(TYPES.includes(e.type) && Array.isArray(e.points), '未対応の図形です。');
    const count = POINT_TYPES.includes(e.type) ? 1 : ['bezier', 'feynman'].includes(e.type) ? 4 : 2;
    requireThat(
      e.type === 'polyline'
        ? e.points.length >= 2 && e.points.length <= 10000
        : e.points.length === count,
      '図形の制御点の数が不正です。',
    );
    requireThat(
      e.points.every((q) => q && finite(q.x, -10000, 10000) && finite(q.y, -10000, 10000)),
      '座標が不正です。',
    );
    const s = e.style;
    requireThat(
      s &&
        color(s.stroke) &&
        (s.fill === 'none' || color(s.fill)) &&
        finite(s.width, 0.1, 20) &&
        ['solid', 'dashed', 'dotted'].includes(s.dash) &&
        ['none', 'end', 'start', 'both'].includes(s.arrow),
      '線または塗りの設定が不正です。',
    );
    if (e.type === 'text') {
      requireThat(
        typeof e.text === 'string' &&
          e.text.length <= 10000 &&
          typeof e.math === 'boolean' &&
          finite(e.fontSize, 4, 100) &&
          ['center', 'west', 'east'].includes(e.anchor),
        'ラベルの設定が不正です。',
      );
    }
    validateSpecial(e, requireThat, finite);
    if (e.type === 'arc')
      requireThat(
        finite(e.startAngle, -360, 360) &&
          finite(e.endAngle, -360, 360) &&
          Math.abs(e.endAngle - e.startAngle) <= 360,
        '円弧の角度が不正です（差は 360 度以内）。',
      );
  }
  // Rebuild known fields only; never propagate unrecognized imported properties.
  return {
    format: 'tikz-draw',
    version: 1,
    name: input.name,
    page: { width: p.width, height: p.height, grid: p.grid },
    elements: input.elements.map((e) => ({
      id: e.id,
      type: e.type,
      points: e.points.map((q) => ({ x: q.x, y: q.y })),
      style: {
        stroke: e.style.stroke,
        fill: e.style.fill,
        width: e.style.width,
        dash: e.style.dash,
        arrow: e.style.arrow,
      },
      ...(e.type === 'text'
        ? { text: e.text, math: e.math, fontSize: e.fontSize, anchor: e.anchor }
        : {}),
      ...(e.type === 'arc' ? { startAngle: e.startAngle, endAngle: e.endAngle } : {}),
      ...specialProperties(e),
    })),
  };
}
export function serializeDocument(doc) {
  return JSON.stringify(validateDocument(doc), null, 2) + '\n';
}
export function parseDocument(source) {
  requireThat(
    typeof source === 'string' && source.length <= 20_000_000,
    'ファイルが大きすぎます。',
  );
  return validateDocument(JSON.parse(source));
}
export function radius(e) {
  return Math.hypot(e.points[1].x - e.points[0].x, e.points[1].y - e.points[0].y);
}
export function arcPoint(e, angle) {
  const a = (angle * Math.PI) / 180,
    r = radius(e),
    c = e.points[0];
  return { x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a) };
}
export function bounds(e) {
  let points = specialBoundsPoints(e);
  if (e.type === 'circle' || e.type === 'arc') {
    const c = e.points[0],
      r = radius(e);
    points = [
      { x: c.x - r, y: c.y - r },
      { x: c.x + r, y: c.y + r },
    ];
  }
  if (e.type === 'text') {
    const p = e.points[0],
      h = e.fontSize * PT_MM * 1.5,
      w = Math.max(h, e.text.length * h * 0.55);
    const dx = e.anchor === 'west' ? w / 2 : e.anchor === 'east' ? -w / 2 : 0;
    points = [
      { x: p.x + dx - w / 2, y: p.y - h / 2 },
      { x: p.x + dx + w / 2, y: p.y + h / 2 },
    ];
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
export function translate(e, dx, dy) {
  e.points = e.points.map((p) => ({ x: round(p.x + dx), y: round(p.y + dy) }));
  return e;
}
export function resize(e, width, height) {
  const b = bounds(e);
  if (e.type === 'circle' || e.type === 'arc') {
    const r = width / 2;
    e.points[0] = { x: b.x + r, y: b.y + r };
    e.points[1] = { x: b.x + width, y: b.y + r };
    return e;
  }
  e.points = e.points.map((p, i) => ({
    x: round(
      b.x + (b.width ? ((p.x - b.x) * width) / b.width : (width * i) / (e.points.length - 1 || 1)),
    ),
    y: round(
      b.y +
        (b.height ? ((p.y - b.y) * height) / b.height : (height * i) / (e.points.length - 1 || 1)),
    ),
  }));
  return e;
}
const num = (n) => String(round(n));
export { packageRequirements };
export function escapeTex(text) {
  const map = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    '%': '\\%',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    _: '\\_',
    '^': '\\textasciicircum{}',
    '~': '\\textasciitilde{}',
  };
  return text.replace(/[\\{}%$&#_^~]/g, (c) => map[c]);
}
export function exportTikz(input) {
  const doc = validateDocument(input),
    colors = [
      ...new Set(
        doc.elements.flatMap((e) => [
          e.style.stroke,
          ...(e.style.fill === 'none' ? [] : [e.style.fill]),
        ]),
      ),
    ];
  const name = (c) => 'td' + colors.indexOf(c);
  const coord = (p) => `(${num(p.x)},${num(doc.page.height - p.y)})`;
  const rows = [
    '% Generated by TikZ Draw. Coordinates: mm; line widths and fonts: TeX pt.',
    `% Requires: \\usepackage{${['tikz', 'amsmath', 'amssymb', ...packageRequirements(doc)].join(',')}} and \\usetikzlibrary{arrows.meta}`,
    '\\begin{tikzpicture}[x=1mm,y=1mm,line cap=round,line join=round]',
  ];
  colors.forEach((c) =>
    rows.push(`  \\definecolor{${name(c)}}{HTML}{${c.slice(1).toUpperCase()}}`),
  );
  rows.push(
    `  \\path[use as bounding box] (0,0) rectangle (${num(doc.page.width)},${num(doc.page.height)});`,
  );
  for (const [index, e] of doc.elements.entries()) {
    const special = exportSpecial(e, { coord, name, num, index });
    if (special) {
      rows.push(...special);
      continue;
    }
    const s = e.style,
      p = e.points;
    const opts = [`draw=${name(s.stroke)}`, `line width=${num(s.width)}pt`];
    if (
      s.fill !== 'none' &&
      ['rect', 'circle', 'ellipse', 'polyline', 'arc', 'bezier'].includes(e.type)
    )
      opts.push(`fill=${name(s.fill)}`);
    if (s.dash !== 'solid') opts.push(s.dash);
    if (s.arrow !== 'none' && ['line', 'polyline', 'arc', 'bezier'].includes(e.type))
      opts.push({ end: '-{Latex}', start: '{Latex}-', both: '{Latex}-{Latex}' }[s.arrow]);
    let path;
    if (e.type === 'line' || e.type === 'polyline') path = p.map(coord).join(' -- ');
    if (e.type === 'rect') path = `${coord(p[0])} rectangle ${coord(p[1])}`;
    if (e.type === 'ellipse')
      path = `${coord({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })} ellipse [x radius=${num(Math.abs(p[1].x - p[0].x) / 2)}mm,y radius=${num(Math.abs(p[1].y - p[0].y) / 2)}mm]`;
    if (e.type === 'circle') path = `${coord(p[0])} circle [radius=${num(radius(e))}mm]`;
    if (e.type === 'arc')
      path = `${coord(arcPoint(e, e.startAngle))} arc[start angle=${num(e.startAngle)},end angle=${num(e.endAngle)},radius=${num(radius(e))}mm]`;
    if (e.type === 'bezier')
      path = `${coord(p[0])} .. controls ${coord(p[1])} and ${coord(p[2])} .. ${coord(p[3])}`;
    if (e.type === 'text') {
      const content = e.math ? `$${e.text}$` : escapeTex(e.text).replace(/\r?\n/g, '\\\\');
      rows.push(
        `  \\node[text=${name(s.stroke)},anchor=${e.anchor},inner sep=0pt,outer sep=0pt,align=center,font=\\fontsize{${num(e.fontSize)}}{${num(e.fontSize * 1.2)}}\\selectfont] at ${coord(p[0])} {${content}};`,
      );
    } else rows.push(`  \\draw[${opts.join(',')}] ${path};`);
  }
  rows.push('\\end{tikzpicture}');
  return rows.join('\n') + '\n';
}
export function exportTex(doc) {
  const japanese = doc.elements.some((e) =>
    ['text', 'label', 'momentum', 'voltage', 'current'].some(
      (k) => typeof e[k] === 'string' && /[^\x00-\x7f]/.test(e[k]),
    ),
  );
  return `${japanese ? '% Compile with LuaLaTeX (Japanese labels).' : '% Compile with pdfLaTeX or LuaLaTeX.'}\n\\documentclass[border=3mm]{standalone}\n${japanese ? '\\usepackage{luatexja}\n' : ''}\\usepackage{${['tikz', 'amsmath', 'amssymb', ...packageRequirements(doc)].join(',')}}\n\\usetikzlibrary{arrows.meta}\n\\begin{document}\n${exportTikz(doc)}\\end{document}\n`;
}
export function exampleDocument() {
  const doc = newDocument();
  doc.name = '円と接線';
  const add = (type, points, style, extra) =>
    doc.elements.push(Object.assign(makeShape(type, points, style), extra));
  add(
    'line',
    [
      { x: 20, y: 75 },
      { x: 140, y: 75 },
    ],
    { stroke: '#9aa6af', width: 0.6, arrow: 'end' },
  );
  add(
    'line',
    [
      { x: 40, y: 90 },
      { x: 40, y: 12 },
    ],
    { stroke: '#9aa6af', width: 0.6, arrow: 'end' },
  );
  add(
    'circle',
    [
      { x: 75, y: 50 },
      { x: 100, y: 50 },
    ],
    { stroke: '#1f6b62', width: 1.1, fill: '#eff7f5' },
  );
  add(
    'line',
    [
      { x: 75, y: 50 },
      { x: 95, y: 35 },
    ],
    { stroke: '#1f6b62', dash: 'dashed', width: 0.7 },
  );
  add(
    'line',
    [
      { x: 80, y: 15 },
      { x: 110, y: 55 },
    ],
    { stroke: '#c57542', width: 1.2 },
  );
  add(
    'arc',
    [
      { x: 75, y: 50 },
      { x: 84, y: 50 },
    ],
    { stroke: '#1f6b62', width: 0.6 },
    { startAngle: 0, endAngle: 36.87 },
  );
  add('text', [{ x: 85, y: 45 }], { stroke: '#1f6b62' }, { text: 'r', math: true, fontSize: 14 });
  add('text', [{ x: 103, y: 31 }], { stroke: '#c57542' }, { text: 'P', math: true, fontSize: 14 });
  add('text', [{ x: 75, y: 54 }], {}, { text: 'O', math: true, fontSize: 12 });
  add('text', [{ x: 141, y: 79 }], {}, { text: 'x', math: true, fontSize: 12 });
  add('text', [{ x: 35, y: 13 }], {}, { text: 'y', math: true, fontSize: 12 });
  return doc;
}
