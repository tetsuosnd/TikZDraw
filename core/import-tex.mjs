import { newDocument, makeShape, validateDocument, PT_MM } from './document.mjs';
import { PARTICLES, VERTICES, COMPONENTS } from './specials.mjs';

function uncomment(text) {
  return text
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++)
        if (line[i] === '%') {
          let n = 0;
          for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) n++;
          if (n % 2 === 0) return line.slice(0, i);
        }
      return line;
    })
    .join('\n');
}
class Reader {
  constructor(text, fail) {
    this.text = text;
    this.i = 0;
    this.fail = fail;
  }
  ws() {
    while (/\s/.test(this.text[this.i] || '') && this.i < this.text.length) this.i++;
  }
  group(open = '{', close = '}') {
    this.ws();
    if (this.text[this.i] !== open) this.fail(`${open} が必要です`);
    const start = ++this.i;
    let depth = 1;
    for (; this.i < this.text.length; this.i++) {
      if (this.text[this.i] === '\\') {
        this.i++;
        continue;
      }
      if (this.text[this.i] === open) depth++;
      if (this.text[this.i] === close && !--depth) {
        const result = this.text.slice(start, this.i);
        this.i++;
        return result;
      }
    }
    this.fail(`${close} が閉じていません`);
  }
  optional() {
    this.ws();
    return this.text[this.i] === '[' ? this.group('[', ']') : '';
  }
  word(word) {
    this.ws();
    if (!this.text.startsWith(word, this.i)) this.fail(`「${word}」が必要です`);
    this.i += word.length;
  }
  statement() {
    const start = this.i;
    let braces = 0,
      brackets = 0;
    for (; this.i < this.text.length; this.i++) {
      const c = this.text[this.i];
      if (c === '\\') {
        this.i++;
        continue;
      }
      if (c === '{') braces++;
      if (c === '}') braces--;
      if (c === '[') brackets++;
      if (c === ']') brackets--;
      if (c === ';' && !braces && !brackets) {
        const result = this.text.slice(start, this.i);
        this.i++;
        return result;
      }
    }
    this.fail('文末の ; がありません');
  }
  done() {
    this.ws();
    if (this.i !== this.text.length)
      this.fail(`未対応の構文: ${this.text.slice(this.i, this.i + 65)}`);
  }
}
function split(text) {
  const out = [];
  let start = 0,
    a = 0,
    b = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '{') a++;
    if (text[i] === '}') a--;
    if (text[i] === '[') b++;
    if (text[i] === ']') b--;
    if (text[i] === ',' && !a && !b) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}
function options(text) {
  return split(text).map((s) => {
    const n = s.indexOf('=');
    return n < 0 ? [s, true] : [s.slice(0, n).trim(), s.slice(n + 1).trim()];
  });
}
function unbrace(value) {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}')
    ? value.slice(1, -1)
    : value;
}
function math(value) {
  return unbrace(value)
    .trim()
    .replace(/^\$([\s\S]*)\$$/, '$1');
}
function plain(value) {
  return value
    .replace(/\\textbackslash\{\}/g, '\u0000')
    .replace(/\\textasciicircum\{\}/g, '^')
    .replace(/\\textasciitilde\{\}/g, '~')
    .replace(/\\([{}%$&#_])/g, '$1')
    .replace(/\\\\/g, '\n')
    .replace(/\u0000/g, '\\');
}
export function importTex(source, { name = 'ソースから読み込んだ図' } = {}) {
  if (typeof source !== 'string' || source.length > 2_000_000)
    throw new Error('ソースは 2 MB 以下にしてください。');
  const text = uncomment(source);
  if (
    /\\(?:foreach|def|edef|gdef|newcommand|renewcommand|input|include|tikzset|draw\s*plot)\b/.test(
      text,
    )
  )
    throw new Error(
      'マクロ定義・繰り返し・外部入力・独自スタイル・plot は読み込めません。対応する図形の座標へ展開してください。',
    );
  const start = /\\begin\{(tikzpicture|circuitikz)\}/g,
    first = start.exec(text);
  if (!first || start.exec(text))
    throw new Error('tikzpicture または circuitikz 環境を 1 つ指定してください。');
  const end = text.indexOf(`\\end{${first[1]}}`, first.index + first[0].length);
  if (end < 0) throw new Error('図の環境が閉じていません。');
  const body = text.slice(first.index + first[0].length, end),
    doc = newDocument();
  doc.name = name;
  let line = 1;
  const fail = (message) => {
    throw new Error(`ソース ${line} 行付近: ${message}。図は変更していません。`);
  };
  const r = new Reader(body, fail);
  let xunit = 10,
    yunit = 10,
    bbox = null;
  let context = { standard: 'european', size: 14 };
  const stack = [];
  const colors = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    blue: '#0000ff',
    green: '#00ff00',
    gray: '#808080',
    orange: '#ff8000',
    brown: '#bf8040',
    magenta: '#ff00ff',
  };
  const vertices = new Map();
  let lastVertex = null;
  const length = (value, base = 1) => {
    const m = String(value)
      .trim()
      .match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(mm|cm|pt)?$/);
    if (!m) fail(`未対応の長さ ${value}`);
    return Number(m[1]) * (m[2] === 'cm' ? 10 : m[2] === 'pt' ? PT_MM : m[2] === 'mm' ? 1 : base);
  };
  const color = (value) => {
    const c = colors[value] || (/^#[\da-f]{6}$/i.test(value) ? value : null);
    if (!c) fail(`未対応の色 ${value}`);
    return c;
  };
  const root = options(r.optional());
  for (const [key, value] of root) {
    if (key === 'x') xunit = length(value);
    else if (key === 'y') yunit = length(value);
    else if (['american', 'european'].includes(key)) context.standard = key;
    else if (
      !(['line cap', 'line join'].includes(key) && value === 'round') &&
      !(key === 'voltage dir' && value === 'RP')
    )
      fail(`未対応の図オプション ${key}`);
  }
  if (xunit <= 0 || yunit <= 0) fail('x と y の単位は正の値にしてください');
  const coordinate = (q) => {
    const value = q.group('(', ')').trim();
    if (vertices.has(value)) return { ...vertices.get(value) };
    const parts = split(value);
    if (parts.length !== 2) fail(`未定義の座標 ${value}`);
    return { x: length(parts[0], xunit), y: length(parts[1], yunit) };
  };
  const add = (type, points, props = {}, style = {}) => {
    const e = Object.assign(makeShape(type, points, { stroke: '#000000', ...style }), props);
    doc.elements.push(e);
    return e;
  };
  const parseStyle = (opts) => {
    const style = {
        stroke: '#000000',
        fill: 'none',
        width: context.feynWidth ?? 0.4,
        dash: 'solid',
        arrow: 'none',
      },
      other = [];
    for (const [key, value] of opts) {
      if (key === 'draw' || key === 'color') style.stroke = color(value);
      else if (key === 'fill') style.fill = value === 'none' ? 'none' : color(value);
      else if (key === 'line width') style.width = length(value, PT_MM) / PT_MM;
      else if (['dashed', 'dotted'].includes(key)) style.dash = key;
      else if (['->', '<-', '<->', '-{Latex}', '{Latex}-', '{Latex}-{Latex}'].includes(key))
        style.arrow = ['->', '-{Latex}'].includes(key)
          ? 'end'
          : ['<-', '{Latex}-'].includes(key)
            ? 'start'
            : 'both';
      else if (['line cap', 'line join'].includes(key) && value === 'round') {
      } else other.push([key, value]);
    }
    return { style, other };
  };
  const readNodeLabel = (q) => {
    q.ws();
    if (!q.text.startsWith('node', q.i)) return { label: '', labelSide: 'left' };
    q.word('node');
    let side = 'left';
    for (const [k, v] of options(q.optional())) {
      if (k === 'auto' && ['left', 'right'].includes(v)) side = v;
      else if (k === 'text') color(v);
      else if (!(k === 'pos' && v === '0.5') && !(k === 'inner sep' && v === '2pt'))
        fail(`未対応の線ラベル設定 ${k}`);
    }
    return { label: math(q.group()), labelSide: side };
  };
  while (true) {
    r.ws();
    if (r.i >= body.length) break;
    line = text.slice(0, first.index + first[0].length + r.i).split('\n').length;
    const match = body.slice(r.i).match(/^\\([a-zA-Z]+)/);
    if (!match) fail(`未対応の入力 ${body.slice(r.i, r.i + 45)}`);
    r.i += match[0].length;
    const command = match[1];
    if (command === 'begin') {
      const env = r.group(),
        opts = options(r.optional());
      if (!['scope', 'feynhand'].includes(env)) fail(`未対応の環境 ${env}`);
      stack.push({ env, context: { ...context } });
      for (const [k, v] of opts) {
        if (['american', 'european'].includes(k)) context.standard = k;
        else if (!(k === 'voltage dir' && v === 'RP')) fail(`未対応の scope 設定 ${k}`);
      }
      continue;
    }
    if (command === 'end') {
      const env = r.group(),
        frame = stack.pop();
      if (!frame || frame.env !== env) fail('環境の対応が不正です');
      context = frame.context;
      continue;
    }
    if (command === 'definecolor') {
      const key = r.group(),
        model = r.group(),
        hex = r.group();
      if (model !== 'HTML' || !/^\w+$/.test(key) || !/^[\da-f]{6}$/i.test(hex))
        fail('HTML 6 桁の色だけを読み込めます');
      colors[key] = '#' + hex.toLowerCase();
      continue;
    }
    if (command === 'setlength') {
      if (r.group() !== '\\feynhandlinesize') fail('対応していない長さの設定です');
      context.feynWidth = length(r.group(), PT_MM) / PT_MM;
      continue;
    }
    if (command === 'ctikzset') {
      for (const [key, value] of options(r.group())) {
        if (key !== 'bipoles/length') fail(`未対応の回路設定 ${key}`);
        context.size = length(value);
      }
      continue;
    }
    if (!['draw', 'path', 'propag', 'propagator', 'vertex', 'node'].includes(command))
      fail(`未対応のコマンド \\${command}`);
    const q = new Reader(r.statement(), fail),
      opts = options(q.optional());
    if (command === 'vertex') {
      const id = q.group('(', ')');
      q.word('at');
      const point = coordinate(q);
      q.ws();
      if (q.text[q.i] === '{') {
        if (q.group()) fail('頂点内の文字は別のラベルで指定してください');
      }
      q.done();
      vertices.set(id, point);
      if (opts.length) {
        const { style, other } = parseStyle(opts);
        let vertexStyle = 'dot',
          size = 2;
        for (const [key, value] of other) {
          if (Object.hasOwn(VERTICES, key)) vertexStyle = key;
          else if (key === 'minimum size') size = length(value);
          else if (!(key === 'inner sep' && value === '0pt')) fail(`未対応の頂点設定 ${key}`);
        }
        lastVertex = add('vertex', [point], { vertexStyle, size }, style);
      } else lastVertex = null;
      continue;
    }
    if (command === 'node') {
      q.word('at');
      const point = coordinate(q),
        content = q.group();
      q.done();
      const data = Object.fromEntries(opts),
        { style } = parseStyle(
          opts.filter(([key]) => ['draw', 'color', 'line width'].includes(key)),
        );
      if (opts.some(([k]) => ['circ', 'ocirc'].includes(k))) {
        const allowed = [
          'circ',
          'ocirc',
          'draw',
          'color',
          'line width',
          'minimum size',
          'inner sep',
        ];
        for (const [key] of opts) if (!allowed.includes(key)) fail(`未対応の接続点設定 ${key}`);
        if (content) fail('接続点内の文字は読み込めません');
        add(
          'junction',
          [point],
          {
            size: data['minimum size'] ? length(data['minimum size']) : 1.6,
            open: 'ocirc' in data,
          },
          style,
        );
        continue;
      }
      if (
        lastVertex &&
        'above right' in data &&
        point.x === lastVertex.points[0].x &&
        point.y === lastVertex.points[0].y
      ) {
        for (const [key] of opts)
          if (!['above right', 'text'].includes(key)) fail(`未対応の頂点ラベル設定 ${key}`);
        lastVertex.label = math(content);
        lastVertex = null;
        continue;
      }
      const allowed = ['text', 'anchor', 'inner sep', 'outer sep', 'align', 'font'];
      for (const [key] of opts) if (!allowed.includes(key)) fail(`未対応のラベル設定 ${key}`);
      const font = data.font
        ? String(data.font).match(/^\\fontsize\{([\d.]+)\}\{[\d.]+\}\\selectfont$/)
        : null;
      if (data.font && !font) fail('フォントは \\fontsize の形式で指定してください');
      if (
        (data.align && data.align !== 'center') ||
        ['inner sep', 'outer sep'].some((k) => data[k] && length(data[k]) !== 0)
      )
        fail('ラベルの align は center、余白は 0pt にしてください');
      const isMath = content.startsWith('$') && content.endsWith('$');
      if (
        !isMath &&
        content
          .replace(
            /\\(?:textbackslash\{\}|textasciicircum\{\}|textasciitilde\{\}|[\\{}%$&#_])/g,
            '',
          )
          .includes('\\')
      )
        fail('通常の文字ラベル内の TeX コマンドは読み込めません');
      add(
        'text',
        [point],
        {
          text: isMath ? content.slice(1, -1) : plain(content),
          math: isMath,
          fontSize: font ? Number(font[1]) : 10,
          anchor: data.anchor || 'center',
        },
        { ...style, stroke: data.text ? color(data.text) : style.stroke },
      );
      continue;
    }
    const a = coordinate(q);
    q.ws();
    if (command === 'path') {
      if (opts.length !== 1 || opts[0][0] !== 'use as bounding box') fail('未対応の path 操作です');
      q.word('rectangle');
      const b = coordinate(q);
      q.done();
      bbox = {
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y),
      };
      continue;
    }
    const { style, other } = parseStyle(opts);
    if (command === 'propag' || command === 'propagator') {
      const props = {};
      let particle = null;
      for (const [key, value] of other) {
        if (Object.hasOwn(PARTICLES, key)) particle = key;
        else if (/^(rev)?mom'?$/.test(key)) {
          props.momentumReverse = key.startsWith('rev');
          props.momentumSide = key.endsWith("'") ? 'right' : 'left';
          let valueText = unbrace(value);
          if (valueText.startsWith('[')) {
            const labelReader = new Reader(valueText, fail);
            const arrowOpts = options(labelReader.optional());
            for (const [k, v] of arrowOpts) {
              if (k !== 'arrow style') fail('未対応の運動量矢印設定です');
              if (color(unbrace(v)) !== style.stroke)
                fail('運動量矢印は伝播線と同じ色を指定してください');
            }
            valueText = valueText.slice(labelReader.i);
          }
          props.momentum = math(valueText);
        } else fail(`未対応の伝播線設定 ${key}`);
      }
      if (!particle) fail('伝播線の粒子の種類が必要です');
      let points;
      if (q.text.startsWith('to', q.i)) {
        q.word('to');
        const edge = options(q.optional());
        const b = coordinate(q);
        points = [a, b];
        for (const [key, value] of edge) {
          if (!['edge label', "edge label'"].includes(key)) fail(`未対応の伝播線経路設定 ${key}`);
          props.label = math(value);
          props.labelSide = key.endsWith("'") ? 'right' : 'left';
        }
      } else {
        q.word('..');
        q.word('controls');
        const c1 = coordinate(q);
        q.word('and');
        const c2 = coordinate(q);
        q.word('..');
        const b = coordinate(q);
        points = [a, c1, c2, b];
      }
      const inline = readNodeLabel(q);
      if (inline.label) Object.assign(props, inline);
      q.done();
      add('feynman', points, { ...props, particle }, style);
      continue;
    }
    if (other.length) fail(`未対応の描画設定 ${other[0][0]}`);
    if (q.text.startsWith('to', q.i)) {
      q.word('to');
      const edge = options(q.optional()),
        b = coordinate(q),
        props = { standard: context.standard, size: context.size };
      let component = null;
      for (const [key, value] of edge) {
        if (Object.hasOwn(COMPONENTS, key)) component = key;
        else if (['l', 'l^', 'l_'].includes(key)) {
          props.label = math(value);
          props.labelSide = key === 'l_' ? 'right' : 'left';
        } else if (key === 'v^') props.voltage = math(value);
        else if (key === 'i>_') props.current = math(value);
        else if (key === 'invert') props.invert = true;
        else if (['*-*', 'o-o', '*-o', 'o-*', '-*', '*-', '-o', 'o-'].includes(key))
          props.terminals = key;
        else fail(`未対応の回路部品設定 ${key}`);
      }
      if (!component) fail('回路部品の種類が必要です');
      q.done();
      add('circuit', [a, b], { ...props, component }, style);
    } else if (q.text.startsWith('node', q.i)) {
      q.word('node');
      const nodeOpts = Object.fromEntries(options(q.optional()));
      const content = q.group();
      q.done();
      if (
        !('ground' in nodeOpts) ||
        content ||
        Object.keys(nodeOpts).some((k) => !['ground', 'rotate'].includes(k))
      )
        fail('未対応の線上ノードです');
      add(
        'ground',
        [a],
        { rotation: ((-(Number(nodeOpts.rotate) || 0) % 360) + 360) % 360 },
        style,
      );
    } else if (q.text.startsWith('rectangle', q.i)) {
      q.word('rectangle');
      add('rect', [a, coordinate(q)], {}, style);
      q.done();
    } else if (q.text.startsWith('circle', q.i)) {
      q.word('circle');
      const data = Object.fromEntries(options(q.optional()));
      if (Object.keys(data).length !== 1 || !data.radius) fail('円は radius で指定してください');
      const rad = length(data.radius, xunit);
      add('circle', [a, { x: a.x + rad, y: a.y }], {}, style);
      q.done();
    } else if (q.text.startsWith('ellipse', q.i)) {
      q.word('ellipse');
      const data = Object.fromEntries(options(q.optional()));
      if (Object.keys(data).length !== 2 || !data['x radius'] || !data['y radius'])
        fail('楕円は x radius / y radius で指定してください');
      const rx = length(data['x radius'], xunit),
        ry = length(data['y radius'], yunit);
      add(
        'ellipse',
        [
          { x: a.x - rx, y: a.y - ry },
          { x: a.x + rx, y: a.y + ry },
        ],
        {},
        style,
      );
      q.done();
    } else if (q.text.startsWith('arc', q.i)) {
      q.word('arc');
      const data = Object.fromEntries(options(q.optional()));
      if (
        Object.keys(data).length !== 3 ||
        !['radius', 'start angle', 'end angle'].every((k) => k in data)
      )
        fail('円弧の radius / start angle / end angle が必要です');
      const rad = length(data.radius, xunit),
        startAngle = Number(data['start angle']),
        endAngle = Number(data['end angle']),
        c = {
          x: a.x - rad * Math.cos((startAngle * Math.PI) / 180),
          y: a.y - rad * Math.sin((startAngle * Math.PI) / 180),
        };
      add('arc', [c, { x: c.x + rad, y: c.y }], { startAngle, endAngle }, style);
      q.done();
    } else if (q.text.startsWith('..', q.i)) {
      q.word('..');
      q.word('controls');
      const c1 = coordinate(q);
      q.word('and');
      const c2 = coordinate(q);
      q.word('..');
      add('bezier', [a, c1, c2, coordinate(q)], {}, style);
      q.done();
    } else {
      const points = [a];
      while (true) {
        q.ws();
        if (!q.text.startsWith('--', q.i)) break;
        q.word('--');
        points.push(coordinate(q));
      }
      if (points.length < 2) fail('直線の終点が必要です');
      q.done();
      add(points.length === 2 ? 'line' : 'polyline', points, {}, style);
    }
  }
  if (stack.length) fail('scope または feynhand 環境が閉じていません');
  if (!doc.elements.length && !bbox) fail('読み込める図形がありません');
  const all = doc.elements.flatMap((e) => e.points),
    xs = all.map((p) => p.x),
    ys = all.map((p) => p.y);
  const explicitBox = !!bbox;
  if (!bbox)
    bbox = {
      minX: Math.min(...xs) - 18,
      maxX: Math.max(...xs) + 18,
      minY: Math.min(...ys) - 18,
      maxY: Math.max(...ys) + 18,
    };
  doc.page.width = explicitBox ? bbox.maxX - bbox.minX : Math.max(40, bbox.maxX - bbox.minX);
  doc.page.height = explicitBox ? bbox.maxY - bbox.minY : Math.max(40, bbox.maxY - bbox.minY);
  for (const e of doc.elements)
    e.points = e.points.map((p) => ({
      x: Math.round((p.x - bbox.minX) * 1e4) / 1e4,
      y: Math.round((bbox.maxY - p.y) * 1e4) / 1e4,
    }));
  return validateDocument(doc);
}
