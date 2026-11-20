// Package names and styles come from the installed upstream manuals; see docs/package-support.md.
export const PARTICLES = {
  fermion: 'フェルミオン',
  'anti fermion': '反フェルミオン',
  scalar: 'スカラー',
  photon: '光子',
  gluon: 'グルーオン',
  ghost: 'ゴースト',
};
export const VERTICES = {
  dot: '点',
  ringdot: '白抜き点',
  crossdot: '交差付き点',
  blob: '有効頂点',
};
export const COMPONENTS = {
  R: '抵抗',
  C: 'コンデンサ',
  L: 'コイル',
  V: '電圧源',
  I: '電流源',
  battery1: '電池',
  D: 'ダイオード',
  leD: 'LED',
  nos: 'スイッチ',
  short: '配線',
};
export const SPECIAL_TYPES = ['feynman', 'vertex', 'circuit', 'ground', 'junction'];
export const POINT_TYPES = ['text', 'vertex', 'ground', 'junction'];
export function specialDefaults(type) {
  if (type === 'feynman')
    return {
      particle: 'fermion',
      label: '',
      momentum: '',
      labelSide: 'left',
      momentumSide: 'right',
      momentumReverse: false,
    };
  if (type === 'vertex') return { vertexStyle: 'dot', size: 2, label: '' };
  if (type === 'circuit')
    return {
      component: 'R',
      standard: 'american',
      size: 12,
      label: '',
      voltage: '',
      current: '',
      labelSide: 'left',
      invert: false,
      terminals: 'none',
    };
  if (type === 'ground') return { rotation: 0 };
  if (type === 'junction') return { size: 1.6, open: false };
  return {};
}
export function specialProperties(e) {
  return Object.fromEntries(Object.keys(specialDefaults(e.type)).map((k) => [k, e[k]]));
}
export function validateSpecial(e, check, finite) {
  const label = (s) => typeof s === 'string' && s.length <= 2000;
  const side = (s) => ['left', 'right'].includes(s);
  if (e.type === 'feynman')
    check(
      Object.hasOwn(PARTICLES, e.particle) &&
        label(e.label) &&
        label(e.momentum) &&
        side(e.labelSide) &&
        side(e.momentumSide) &&
        typeof e.momentumReverse === 'boolean',
      '伝播線の設定が不正です。',
    );
  if (e.type === 'vertex')
    check(
      Object.hasOwn(VERTICES, e.vertexStyle) && finite(e.size, 0.5, 20) && label(e.label),
      '頂点の設定が不正です。',
    );
  if (e.type === 'circuit')
    check(
      Object.hasOwn(COMPONENTS, e.component) &&
        ['american', 'european'].includes(e.standard) &&
        finite(e.size, 4, 40) &&
        label(e.label) &&
        label(e.voltage) &&
        label(e.current) &&
        side(e.labelSide) &&
        typeof e.invert === 'boolean' &&
        ['none', '*-*', 'o-o', '*-o', 'o-*', '-*', '*-', '-o', 'o-'].includes(e.terminals),
      '回路部品の設定が不正です。',
    );
  if (e.type === 'ground')
    check([0, 90, 180, 270].includes(e.rotation), '接地記号の向きが不正です。');
  if (e.type === 'junction')
    check(finite(e.size, 0.5, 10) && typeof e.open === 'boolean', '接続点の設定が不正です。');
}
export function packageRequirements(doc) {
  return [
    ...(doc.elements.some((e) => ['feynman', 'vertex'].includes(e.type)) ? ['tikz-feynhand'] : []),
    ...(doc.elements.some((e) => ['circuit', 'ground', 'junction'].includes(e.type))
      ? ['circuitikz']
      : []),
  ];
}
export function cubicPoint(points, t) {
  const u = 1 - t;
  return {
    x:
      u * u * u * points[0].x +
      3 * u * u * t * points[1].x +
      3 * u * t * t * points[2].x +
      t * t * t * points[3].x,
    y:
      u * u * u * points[0].y +
      3 * u * u * t * points[1].y +
      3 * u * t * t * points[2].y +
      t * t * t * points[3].y,
  };
}
export function cubicFrame(points, t) {
  const q = cubicPoint(points, t),
    a = cubicPoint(points, Math.max(0, t - 0.001)),
    b = cubicPoint(points, Math.min(1, t + 0.001));
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return {
    ...q,
    tx: (b.x - a.x) / d,
    ty: (b.y - a.y) / d,
    nx: (b.y - a.y) / d,
    ny: -(b.x - a.x) / d,
  };
}
export function linearControls(a, b) {
  return [
    a,
    { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
    { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 },
    b,
  ];
}
export function specialBoundsPoints(e) {
  const p = e.points[0];
  if (e.type === 'vertex' || e.type === 'junction')
    return [
      { x: p.x - e.size / 2, y: p.y - e.size / 2 },
      { x: p.x + e.size / 2, y: p.y + e.size / 2 },
    ];
  if (e.type === 'ground') {
    const a = (e.rotation * Math.PI) / 180;
    return [
      [-3, 0],
      [3, 0],
      [-3, 6],
      [3, 6],
    ].map(([x, y]) => ({
      x: p.x + x * Math.cos(a) - y * Math.sin(a),
      y: p.y + x * Math.sin(a) + y * Math.cos(a),
    }));
  }
  if (e.type === 'circuit') {
    const [a, b] = e.points,
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1,
      r = e.size * 0.35;
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return [
      a,
      b,
      ...[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([x, y]) => ({
        x: c.x + (x * r * dx) / len - (y * r * dy) / len,
        y: c.y + (x * r * dy) / len + (y * r * dx) / len,
      })),
    ];
  }
  return e.points;
}
export function exportSpecial(e, { coord, name, num, index }) {
  const c = name(e.style.stroke),
    width = num(e.style.width),
    p = e.points;
  const stroke = `draw=${c},line width=${width}pt`;
  if (e.type === 'feynman') {
    const a = `tdf${index}a`,
      b = `tdf${index}b`,
      opts = [e.particle, `color=${c}`];
    if (e.momentum) {
      const key = `${e.momentumReverse ? 'revmom' : 'mom'}${e.momentumSide === 'right' ? "'" : ''}`;
      opts.push(`${key}={[arrow style=${c}] $${e.momentum}$}`);
    }
    const label = e.label
      ? ` node[pos=0.5,auto=${e.labelSide},inner sep=2pt,text=${c}] {$${e.label}$}`
      : '';
    return [
      '  \\begin{feynhand}',
      `    \\setlength{\\feynhandlinesize}{${width}pt}`,
      `    \\vertex (${a}) at ${coord(p[0])};`,
      `    \\vertex (${b}) at ${coord(p[3])};`,
      `    \\propag[${opts.join(',')}] (${a}) .. controls ${coord(p[1])} and ${coord(p[2])} .. (${b})${label};`,
      '  \\end{feynhand}',
    ];
  }
  if (e.type === 'vertex')
    return [
      '  \\begin{feynhand}',
      `    \\vertex[${e.vertexStyle},color=${c},line width=${width}pt,minimum size=${num(e.size)}mm,inner sep=0pt] (tdv${index}) at ${coord(p[0])} {};`,
      ...(e.label ? [`    \\node[above right,text=${c}] at ${coord(p[0])} {$${e.label}$};`] : []),
      '  \\end{feynhand}',
    ];
  if (e.type === 'circuit') {
    const opts = [e.component];
    if (e.label) opts.push(`l${e.labelSide === 'right' ? '_' : '^'}={$${e.label}$}`);
    if (e.voltage) opts.push(`v^={$${e.voltage}$}`);
    if (e.current) opts.push(`i>_={$${e.current}$}`);
    if (e.invert) opts.push('invert');
    if (e.terminals !== 'none') opts.push(e.terminals);
    return [
      `  \\begin{scope}[${e.standard},voltage dir=RP]`,
      `    \\ctikzset{bipoles/length=${num(e.size)}mm}`,
      `    \\draw[${stroke}] ${coord(p[0])} to[${opts.join(',')}] ${coord(p[1])};`,
      '  \\end{scope}',
    ];
  }
  if (e.type === 'ground')
    return [`  \\draw[${stroke}] ${coord(p[0])} node[ground,rotate=${-e.rotation}] {};`];
  if (e.type === 'junction')
    return [
      `  \\node[${e.open ? 'ocirc' : 'circ'},color=${c},line width=${width}pt,minimum size=${num(e.size)}mm,inner sep=0pt] at ${coord(p[0])} {};`,
    ];
  return null;
}
