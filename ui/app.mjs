import {
  PT_MM,
  TYPE_NAMES,
  DEFAULT_STYLE,
  newDocument,
  makeShape,
  clone,
  round,
  bounds,
  radius,
  arcPoint,
  translate,
  resize,
  serializeDocument,
  parseDocument,
  exportTikz,
  exportTex,
  exampleDocument,
} from '../core/document.mjs';
import {
  PARTICLES,
  VERTICES,
  COMPONENTS,
  SPECIAL_TYPES,
  POINT_TYPES,
  specialDefaults,
  linearControls,
} from '../core/specials.mjs';
import { packageExample } from '../core/examples-specials.mjs';
import { renderSpecial } from './specials.mjs';
import { importTex } from '../core/import-tex.mjs';

const $ = (selector) => document.querySelector(selector);
const svgNS = 'http://www.w3.org/2000/svg';
const canvas = $('#canvas'),
  content = $('#elements'),
  overlay = $('#overlay');
const bridge = window.desktop;
const specialTools = [
  ...Object.entries(PARTICLES)
    .filter(([k]) => k !== 'anti fermion')
    .map(([particle, label]) => ({
      id: `f-${particle}`,
      label,
      group: 'feynman',
      type: 'feynman',
      props: { particle },
      geometry: 'straight',
    })),
  { id: 'f-curve', label: '曲線の伝播線', group: 'feynman', type: 'feynman', geometry: 'curve' },
  { id: 'f-loop', label: 'ループ', group: 'feynman', type: 'feynman', geometry: 'loop' },
  { id: 'f-vertex', label: '頂点', group: 'feynman', type: 'vertex' },
  ...Object.entries(COMPONENTS).map(([component, label]) => ({
    id: `c-${component}`,
    label,
    group: 'circuit',
    type: 'circuit',
    props: { component },
  })),
  { id: 'c-ground', label: '接地', group: 'circuit', type: 'ground' },
  { id: 'c-junction', label: '接続点', group: 'circuit', type: 'junction' },
];
const toolDefs = [
  ['select', '選択', 'V', '<path d="M5 2v15l4-4 3 6 3-1-3-6 6-1Z"/>'],
  ['line', '直線', 'L', '<path d="m3 17 14-14"/>'],
  ['arrow', '矢印', 'A', '<path d="m3 17 14-14M9 3h8v8"/>'],
  ['polyline', '折れ線', 'P', '<path d="m2 16 5-11 6 8 5-10"/>'],
  ['rect', '長方形', 'R', '<rect x="3" y="5" width="14" height="11" rx=".5"/>'],
  ['circle', '円', 'C', '<circle cx="10" cy="10" r="7"/>'],
  ['ellipse', '楕円', 'E', '<ellipse cx="10" cy="10" rx="8" ry="5"/>'],
  ['arc', '円弧', 'Q', '<path d="M3 15a7 7 0 1 1 14 0"/>'],
  ['bezier', '曲線', 'B', '<path d="M2 16C2-4 18 24 18 4"/>'],
  ['text', '文字', 'T', '<path d="M4 4h12M10 4v14M7 18h6"/>'],
  ['math', '数式', 'M', '<path d="M6 17 10 4q2-3 5-1M5 8h9M4 17q2 3 4 0"/>'],
];
for (const spec of specialTools)
  toolDefs.push([
    spec.id,
    spec.label,
    '',
    spec.type === 'vertex' || spec.type === 'junction'
      ? '<circle cx="10" cy="10" r="3"/>'
      : spec.type === 'ground'
        ? '<path d="M10 2v8M3 10h14M5 13h10M8 16h4"/>'
        : spec.type === 'circuit'
          ? '<path d="M1 10h4m10 0h4"/><rect x="5" y="7" width="10" height="6"/>'
          : '<path d="M1 10q3-9 6 0t6 0t6 0"/>',
  ]);
const hints = {
  select: '選択して編集 · ドラッグで範囲選択',
  line: 'ドラッグで始点と終点を指定',
  arrow: 'ドラッグして矢印を作成',
  polyline: '頂点をクリック · Enter / ダブルクリックで確定',
  rect: '対角の 2 点をドラッグで指定',
  circle: '中心からドラッグして半径を指定',
  ellipse: '対角の 2 点をドラッグで指定',
  arc: '中心から半径を指定 · 角度は右の設定で変更',
  bezier: 'ドラッグで作成 · 青い制御点で曲率を編集',
  text: '用紙をクリックして文字を配置',
  math: '用紙をクリックして数式を配置',
};
for (const spec of specialTools)
  hints[spec.id] = POINT_TYPES.includes(spec.type)
    ? '用紙をクリックして配置 · 設定は右のプロパティ'
    : 'ドラッグで配置 · 種類とラベルは右のプロパティ';
let palette = 'basic',
  toolPreset = null;
let enabledPalettes = { feynman: false, circuit: false };
let sourceEditing = false,
  sourceBase = '';
const sourceDraftKey = 'tikzdraw.source-draft';
const sourceDirty = () => sourceEditing && $('#source-editor').value !== sourceBase;
try {
  const stored = JSON.parse(localStorage.getItem('tikzdraw.palettes') || '{}');
  for (const key of Object.keys(enabledPalettes)) enabledPalettes[key] = stored[key] === true;
} catch {}
let doc = newDocument(),
  saved = JSON.stringify(doc),
  selection = new Set(),
  tool = 'select',
  style = { ...DEFAULT_STYLE };
let undoStack = [],
  redoStack = [],
  gesture = null,
  poly = null,
  zoom = 1,
  sourceKind = 'tikz',
  toastTimer,
  busy = false;
const recoveryKey = 'tikzdraw.recovery.v1';
const selected = () => doc.elements.filter((e) => selection.has(e.id));
const editing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
const dirty = () => JSON.stringify(doc) !== saved || sourceDirty();
function node(tag, attrs = {}, text) {
  const el = document.createElementNS(svgNS, tag);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  if (text !== undefined) el.textContent = text;
  return el;
}
function html(tag, attrs = {}, text) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
  $('#status').textContent = message;
}
function persist() {
  try {
    if (dirty()) localStorage.setItem(recoveryKey, serializeDocument(doc));
    else localStorage.removeItem(recoveryKey);
    if (sourceDirty())
      localStorage.setItem(
        sourceDraftKey,
        JSON.stringify({ source: $('#source-editor').value, kind: sourceKind }),
      );
    else localStorage.removeItem(sourceDraftKey);
  } catch {}
}
function syncState() {
  const isDirty = dirty();
  bridge?.changed(isDirty);
  $('#save-status').textContent = isDirty ? '未保存の変更' : '保存済み';
  document.title = `${isDirty ? '● ' : ''}${doc.name} — TikZ Draw`;
  if (document.activeElement !== $('#document-name')) $('#document-name').value = doc.name;
  $('#paper-name').textContent = doc.name;
  $('#paper-size').textContent = `${doc.page.width} × ${doc.page.height} mm`;
  $('#element-count').textContent = `${doc.elements.length} 図形`;
  $('#layer-count').textContent = doc.elements.length;
  $('#empty-note').hidden = doc.elements.length > 0 || !!gesture || !!poly;
  // display:flex on the hint must not override the hidden attribute.
  $('#empty-note').style.display = $('#empty-note').hidden ? 'none' : 'flex';
  $('[data-action="undo"]').disabled = undoStack.length === 0;
  $('[data-action="redo"]').disabled = redoStack.length === 0;
  persist();
}
function remember(before) {
  if (before === JSON.stringify(doc)) return;
  undoStack.push(before);
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}
function change(fn, { inspector = true } = {}) {
  const before = JSON.stringify(doc);
  fn();
  remember(before);
  render({ inspector });
}
function history(redo = false) {
  if (editing()) {
    document.execCommand(redo ? 'redo' : 'undo');
    return;
  }
  cancelGesture();
  const from = redo ? redoStack : undoStack,
    to = redo ? undoStack : redoStack;
  if (!from.length) return;
  to.push(JSON.stringify(doc));
  doc = parseDocument(from.pop());
  selection = new Set([...selection].filter((id) => doc.elements.some((e) => e.id === id)));
  render();
}
function setTool(value) {
  cancelGesture();
  const spec = specialTools.find((t) => t.id === value);
  if (spec && !enabledPalettes[spec.group]) return;
  if (value !== tool) toolPreset = spec ? { ...specialDefaults(spec.type), ...spec.props } : null;
  if (spec) palette = spec.group;
  else if (!['select', 'text', 'math'].includes(value)) palette = 'basic';
  tool = value;
  $('#palette').value = palette;
  canvas.classList.toggle('drawing', value !== 'select');
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.hidden =
      !['select', 'text', 'math'].includes(b.dataset.tool) &&
      (b.dataset.group || 'basic') !== palette;
    b.classList.toggle('active', b.dataset.tool === value);
    b.setAttribute('aria-pressed', String(b.dataset.tool === value));
  });
  $('#tool-hint').textContent = hints[value];
  if (value !== 'select') selection.clear();
  render();
}
for (const [id, label, key, icon] of toolDefs) {
  const button = html('button', {
    class: 'tool',
    'data-tool': id,
    title: `${label} (${key})`,
    'aria-label': label,
    'aria-pressed': 'false',
    'data-group': specialTools.find((t) => t.id === id)?.group || 'basic',
  });
  const span = html('span', { class: 'tool-icon' });
  span.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
  button.append(span, html('span', {}, label), html('span', { class: 'tool-key' }, key));
  button.addEventListener('click', () => setTool(id));
  $('#tool-buttons').append(button);
}
$('#palette').addEventListener('change', (event) => {
  commitInputs();
  palette = event.target.value;
  setTool('select');
});
function refreshPalettes() {
  const select = $('#palette');
  select.replaceChildren(html('option', { value: 'basic' }, '通常作図'));
  for (const [key, label] of [
    ['feynman', 'Feynman 図'],
    ['circuit', '回路図'],
  ]) {
    if (enabledPalettes[key]) select.append(html('option', { value: key }, label));
    $('#enable-' + key).checked = enabledPalettes[key];
  }
  if (palette !== 'basic' && !enabledPalettes[palette]) {
    palette = 'basic';
    tool = 'select';
    toolPreset = null;
  }
  $('[data-action="sample-mixed"]').hidden = !enabledPalettes.feynman && !enabledPalettes.circuit;
  try {
    localStorage.setItem('tikzdraw.palettes', JSON.stringify(enabledPalettes));
  } catch {}
  bridge?.palettesChanged(enabledPalettes);
  setTool(tool);
}
for (const key of Object.keys(enabledPalettes))
  $('#enable-' + key).addEventListener('change', (event) => {
    enabledPalettes[key] = event.target.checked;
    refreshPalettes();
  });
function renderDefs() {
  const defs = $('#defs');
  defs.replaceChildren();
  const pattern = node('pattern', {
    id: 'grid-pattern',
    width: doc.page.grid,
    height: doc.page.grid,
    patternUnits: 'userSpaceOnUse',
  });
  pattern.append(
    node('path', {
      d: `M ${doc.page.grid} 0 L 0 0 0 ${doc.page.grid}`,
      fill: 'none',
      stroke: '#dbe4da',
      'stroke-width': 0.12,
    }),
  );
  defs.append(pattern);
  for (const color of new Set([...doc.elements.map((e) => e.style.stroke), style.stroke])) {
    const marker = node('marker', {
      id: `arrow-${color.slice(1)}`,
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 8,
      markerHeight: 8,
      orient: 'auto-start-reverse',
      markerUnits: 'strokeWidth',
    });
    marker.append(node('path', { d: 'M0 0L10 5L0 10L2 5Z', fill: color }));
    defs.append(marker);
  }
}
function drawShape(e, ghost = false) {
  const g = node('g', { 'data-id': e.id, class: ghost ? 'ghost' : 'shape' }),
    s = e.style,
    p = e.points;
  const attrs = {
    fill: s.fill,
    stroke: s.stroke,
    'stroke-width': s.width * PT_MM,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  if (SPECIAL_TYPES.includes(e.type))
    return renderSpecial(e, {
      node,
      g,
      attrs,
      zoom,
      mathLabel: (text, position) =>
        g.append(
          drawShape({
            ...e,
            type: 'text',
            points: [position],
            text,
            math: true,
            fontSize: 10,
            anchor: 'center',
          }),
        ),
    });
  if (s.dash === 'dashed')
    attrs['stroke-dasharray'] = `${3 * s.width * PT_MM} ${2 * s.width * PT_MM}`;
  if (s.dash === 'dotted') attrs['stroke-dasharray'] = `0 ${2.5 * s.width * PT_MM}`;
  if (['line', 'polyline', 'arc', 'bezier'].includes(e.type)) {
    if (s.arrow === 'start' || s.arrow === 'both')
      attrs['marker-start'] = `url(#arrow-${s.stroke.slice(1)})`;
    if (s.arrow === 'end' || s.arrow === 'both')
      attrs['marker-end'] = `url(#arrow-${s.stroke.slice(1)})`;
  }
  let path, body;
  if (e.type === 'line' || e.type === 'polyline')
    path = p.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' ');
  if (e.type === 'bezier')
    path = `M${p[0].x} ${p[0].y} C${p[1].x} ${p[1].y} ${p[2].x} ${p[2].y} ${p[3].x} ${p[3].y}`;
  if (e.type === 'arc') {
    const start = arcPoint(e, e.startAngle),
      end = arcPoint(e, e.endAngle),
      r = radius(e),
      delta = e.endAngle - e.startAngle;
    if (Math.abs(delta) >= 359.999) {
      const mid = arcPoint(e, e.startAngle + delta / 2);
      path = `M${start.x} ${start.y} A${r} ${r} 0 0 ${delta > 0 ? 0 : 1} ${mid.x} ${mid.y} A${r} ${r} 0 0 ${delta > 0 ? 0 : 1} ${end.x} ${end.y}`;
    } else
      path = `M${start.x} ${start.y} A${r} ${r} 0 ${Math.abs(delta) > 180 ? 1 : 0} ${delta > 0 ? 0 : 1} ${end.x} ${end.y}`;
  }
  if (path) {
    body = node('path', { ...attrs, d: path, fill: e.type === 'line' ? 'none' : s.fill });
    const hit = node('path', {
      d: path,
      fill: 'none',
      stroke: 'transparent',
      'stroke-width': Math.max(2 / zoom, s.width * PT_MM),
      'pointer-events': 'stroke',
    });
    g.append(hit, body);
  }
  const b = bounds(e);
  if (e.type === 'rect')
    body = node('rect', { ...attrs, x: b.x, y: b.y, width: b.width, height: b.height });
  if (e.type === 'circle')
    body = node('circle', { ...attrs, cx: p[0].x, cy: p[0].y, r: radius(e) });
  if (e.type === 'ellipse')
    body = node('ellipse', {
      ...attrs,
      cx: b.x + b.width / 2,
      cy: b.y + b.height / 2,
      rx: b.width / 2,
      ry: b.height / 2,
    });
  if (['rect', 'circle', 'ellipse'].includes(e.type)) {
    g.append(
      node(body.tagName, {
        ...Object.fromEntries([...body.attributes].map((a) => [a.name, a.value])),
        fill: 'transparent',
        stroke: 'transparent',
        'stroke-width': 2 / zoom,
        'pointer-events': 'all',
      }),
      body,
    );
  }
  if (e.type === 'text') {
    const size = e.fontSize * PT_MM,
      a = e.anchor,
      x = p[0].x,
      y = p[0].y;
    if (e.math) {
      const fo = node('foreignObject', {
        x: a === 'west' ? x : a === 'east' ? x - 160 : x - 80,
        y: y - 15,
        width: 160,
        height: 30,
        class: 'math-label',
      });
      const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      div.className = `label-content ${a === 'west' ? 'left' : a === 'east' ? 'right' : ''}`;
      div.style.fontSize = `${size}px`;
      div.style.color = s.stroke;
      try {
        window.katex.render(e.text, div, {
          throwOnError: true,
          trust: false,
          strict: 'warn',
          output: 'html',
          maxSize: 20,
          maxExpand: 1000,
        });
      } catch {
        div.textContent = e.text;
        div.style.color = '#b55542';
      }
      fo.append(div);
      g.append(fo);
    } else {
      const lines = e.text.split('\n'),
        text = node('text', {
          x,
          y: y - (lines.length - 1) * size * 0.6,
          fill: s.stroke,
          'font-size': size,
          'text-anchor': { center: 'middle', west: 'start', east: 'end' }[a],
          'dominant-baseline': 'central',
          'font-family': 'Times New Roman, Hiragino Mincho ProN, serif',
        });
      lines.forEach((line, i) => text.append(node('tspan', { x, dy: i ? size * 1.2 : 0 }, line)));
      g.append(text);
    }
    // A label stays selectable even when all its contents live inside foreignObject.
    const hit = node('rect', {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      fill: 'transparent',
      stroke: 'none',
      'pointer-events': 'all',
    });
    g.append(hit);
  }
  return g;
}
function renderOverlay() {
  overlay.replaceChildren();
  const list = selected();
  for (const e of list) {
    const b = bounds(e);
    overlay.append(
      node('rect', {
        x: b.x - 1,
        y: b.y - 1,
        width: b.width + 2,
        height: b.height + 2,
        class: 'selection-outline',
      }),
    );
  }
  if (list.length === 1) {
    const e = list[0];
    if (e.type === 'bezier' || e.type === 'feynman') {
      for (const [i, j] of [
        [0, 1],
        [2, 3],
      ])
        overlay.append(
          node('line', {
            x1: e.points[i].x,
            y1: e.points[i].y,
            x2: e.points[j].x,
            y2: e.points[j].y,
            class: 'control-line',
          }),
        );
    }
    e.points.forEach((p, i) =>
      overlay.append(
        node('circle', {
          cx: p.x,
          cy: p.y,
          r: 0.8 / Math.sqrt(zoom),
          class: 'handle',
          'data-handle': i,
          'data-id': e.id,
        }),
      ),
    );
    if (e.type === 'arc')
      for (const [i, a] of [
        [0, e.startAngle],
        [1, e.endAngle],
      ]) {
        const p = arcPoint(e, a);
        overlay.append(
          node('rect', {
            x: p.x - 0.75,
            y: p.y - 0.75,
            width: 1.5,
            height: 1.5,
            class: 'handle',
            'data-angle': i,
            'data-id': e.id,
          }),
        );
      }
  }
  if (gesture?.kind === 'marquee') {
    const a = gesture.start,
      b = gesture.current;
    overlay.append(
      node('rect', {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
        class: 'marquee',
      }),
    );
  }
  if (gesture?.kind === 'draw') overlay.append(drawShape(gesture.shape, true));
  if (poly) {
    const points = [...poly.points, ...(poly.hover ? [poly.hover] : [])];
    if (points.length > 1) overlay.append(drawShape(makeShape('polyline', points, style), true));
  }
}
function render({ inspector = true } = {}) {
  const p = doc.page;
  canvas.setAttribute('viewBox', `0 0 ${p.width} ${p.height}`);
  for (const id of ['paper', 'grid']) {
    $('#' + id).setAttribute('width', p.width);
    $('#' + id).setAttribute('height', p.height);
  }
  canvas.style.width = `${p.width * 5 * zoom}px`;
  canvas.style.height = `${p.height * 5 * zoom}px`;
  $('#grid').style.display = $('#show-grid').checked ? '' : 'none';
  $('#zoom-value').textContent = `${Math.round(zoom * 100)}%`;
  renderDefs();
  content.replaceChildren(...doc.elements.map((e) => drawShape(e)));
  renderOverlay();
  $('#source').textContent = sourceKind === 'tex' ? exportTex(doc) : exportTikz(doc);
  renderLayers();
  if (inspector) renderInspector();
  if (sourceEditing)
    $('#properties')
      .querySelectorAll('input,select,textarea,button')
      .forEach((el) => (el.disabled = true));
  syncState();
}
function renderLayers() {
  const layers = $('#layers');
  layers.replaceChildren();
  if (!doc.elements.length) {
    layers.append(html('div', { class: 'no-layers' }, '図形を描くとここに表示されます'));
    return;
  }
  for (const e of [...doc.elements].reverse()) {
    const button = html('button', {
      class: `layer ${selection.has(e.id) ? 'active' : ''}`,
      'data-layer': e.id,
    });
    const swatch = html('span', { class: 'layer-swatch' });
    swatch.style.color = e.style.stroke;
    swatch.style.background = e.style.fill === 'none' ? 'transparent' : e.style.fill;
    button.append(
      swatch,
      html(
        'span',
        { class: 'layer-name' },
        e.type === 'text'
          ? e.text || '空のラベル'
          : `${TYPE_NAMES[e.type]} ${doc.elements.indexOf(e) + 1}`,
      ),
    );
    button.addEventListener('click', (event) => {
      if (event.shiftKey) {
        if (selection.has(e.id)) selection.delete(e.id);
        else selection.add(e.id);
      } else selection = new Set([e.id]);
      tool = 'select';
      setTool('select');
      render();
    });
    layers.append(button);
  }
}
function section(parent, title) {
  const s = html('section', { class: 'property-section' });
  s.append(html('div', { class: 'property-title' }, title));
  parent.append(s);
  return s;
}
function row(parent) {
  const r = html('div', { class: 'property-row' });
  parent.append(r);
  return r;
}
function field(
  parent,
  label,
  value,
  { type = 'number', min, max, step = 0.5, options, change: callback } = {},
) {
  const labelEl = html('label', {}, label);
  let input;
  if (options) {
    input = html('select', { 'aria-label': label });
    options.forEach(([v, t]) => input.append(html('option', { value: v }, t)));
    input.value = value;
  } else {
    input = html(type === 'textarea' ? 'textarea' : 'input', {
      'aria-label': label,
      ...(type === 'textarea' ? {} : { type }),
    });
    input.value = value;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    if (type === 'number') input.step = step;
  }
  labelEl.append(input);
  parent.append(labelEl);
  input.addEventListener('change', () => {
    const v = type === 'number' && !options ? Number(input.value) : input.value;
    if (
      type === 'number' &&
      !options &&
      (!Number.isFinite(v) ||
        input.value === '' ||
        (min !== undefined && v < min) ||
        (max !== undefined && v > max))
    ) {
      input.value = value;
      toast('設定値を確認してください。');
      return;
    }
    try {
      callback?.(v);
    } catch (error) {
      toast(error.message);
      renderInspector();
    }
  });
  return input;
}
function check(parent, label, value, callback) {
  const l = html('label', { class: 'inline-label' }),
    input = html('input', { type: 'checkbox', 'aria-label': label });
  input.checked = value;
  l.append(input, document.createTextNode(label));
  parent.append(l);
  input.addEventListener('change', () => callback(input.checked));
  return input;
}
function renderInspector() {
  const root = $('#properties');
  root.replaceChildren();
  const list = selected(),
    single = list.length === 1 ? list[0] : null;
  $('#selection-badge').textContent = single
    ? TYPE_NAMES[single.type]
    : list.length
      ? `${list.length} 図形`
      : '用紙';
  if (!list.length) {
    const page = section(root, '用紙 / mm'),
      r = row(page);
    for (const [key, label] of [
      ['width', '幅'],
      ['height', '高さ'],
    ])
      field(r, label, doc.page[key], {
        min: 10,
        max: 2000,
        step: 5,
        change: (v) => change(() => (doc.page[key] = v)),
      });
    field(row(page), 'グリッド間隔 / mm', doc.page.grid, {
      min: 0.1,
      max: 100,
      step: 1,
      change: (v) => change(() => (doc.page.grid = v)),
    });
    page.append(
      html('p', { class: 'property-note' }, '図形の寸法と位置は、mm 単位で指定できます。'),
    );
  } else {
    const pos = section(root, list.length > 1 ? '選択した図形' : '位置とサイズ / mm');
    if (single) {
      const b = bounds(single),
        r = row(pos),
        r2 = row(pos);
      field(r, 'X', round(b.x), {
        min: -9000,
        max: 9000,
        change: (v) => change(() => translate(single, v - b.x, 0)),
      });
      field(r, 'Y', round(b.y), {
        min: -9000,
        max: 9000,
        change: (v) => change(() => translate(single, 0, v - b.y)),
      });
      if (!POINT_TYPES.includes(single.type) && single.type !== 'circuit') {
        field(r2, '幅', round(b.width), {
          min: 0.1,
          max: 2000,
          change: (v) => change(() => resize(single, v, b.height)),
        });
        if (!['circle', 'arc'].includes(single.type))
          field(r2, '高さ', round(b.height), {
            min: 0.1,
            max: 2000,
            change: (v) => change(() => resize(single, b.width, v)),
          });
      }
      if (single.type === 'arc') {
        const r3 = row(pos);
        for (const [key, label] of [
          ['startAngle', '開始角 / °'],
          ['endAngle', '終了角 / °'],
        ])
          field(r3, label, single[key], {
            min: -360,
            max: 360,
            step: 5,
            change: (v) =>
              change(() => {
                if (Math.abs(v - single[key === 'startAngle' ? 'endAngle' : 'startAngle']) > 360)
                  throw new Error('開始角と終了角の差を 360 度以内にしてください。');
                single[key] = v;
              }),
          });
      }
    } else
      pos.append(html('p', { class: 'notice' }, 'まとめて移動、線の変更、複製・削除ができます。'));
  }
  const appearance = section(root, list.length ? '線と塗り' : '新しく描く図形'),
    target = single?.style || list[0]?.style || style;
  const updateStyle = (key, v) => {
    if (list.length) change(() => list.forEach((e) => (e.style[key] = v)));
    else {
      style[key] = v;
      render();
    }
  };
  const colors = row(appearance);
  field(colors, '線の色', target.stroke, {
    type: 'color',
    change: (v) => updateStyle('stroke', v),
  });
  const specialised = list.length
    ? list.every((e) => SPECIAL_TYPES.includes(e.type))
    : !!specialTools.find((t) => t.id === tool);
  if (!specialised) {
    field(colors, '塗りの色', target.fill === 'none' ? '#e5f1ea' : target.fill, {
      type: 'color',
      change: (v) => updateStyle('fill', v),
    });
    check(row(appearance), '塗りなし', target.fill === 'none', (v) =>
      updateStyle('fill', v ? 'none' : '#e5f1ea'),
    );
  }
  const lines = row(appearance);
  field(lines, '線幅 / pt', target.width, {
    min: 0.1,
    max: 20,
    step: 0.1,
    change: (v) => updateStyle('width', v),
  });
  if (!specialised) {
    field(lines, '線の種類', target.dash, {
      options: [
        ['solid', '実線'],
        ['dashed', '破線'],
        ['dotted', '点線'],
      ],
      change: (v) => updateStyle('dash', v),
    });
    field(row(appearance), '矢印', target.arrow, {
      options: [
        ['none', 'なし'],
        ['end', '終点 →'],
        ['start', '← 始点'],
        ['both', '← 両端 →'],
      ],
      change: (v) => updateStyle('arrow', v),
    });
  }
  const spec = specialTools.find((t) => t.id === tool);
  if (single && SPECIAL_TYPES.includes(single.type)) renderPackageProperties(root, single, true);
  else if (!list.length && spec) {
    toolPreset ||= { ...specialDefaults(spec.type), ...spec.props };
    renderPackageProperties(root, { type: spec.type, ...toolPreset }, false);
  }
  if (single?.type === 'text') {
    const text = section(root, 'ラベル');
    const input = field(row(text), single.math ? 'LaTeX 数式（$ は不要）' : '文字列', single.text, {
      type: 'textarea',
      change: (v) => change(() => (single.text = v)),
    });
    input.id = 'label-input';
    input.maxLength = 10000;
    // Keep focus while showing the current expression; one focus session is one undo step.
    input.addEventListener('input', () => {
      const before = JSON.stringify(doc);
      single.text = input.value;
      if (!input.dataset.history) {
        remember(before);
        input.dataset.history = '1';
      }
      render({ inspector: false });
    });
    check(row(text), 'LaTeX 数式として表示', single.math, (v) => change(() => (single.math = v)));
    const r = row(text);
    field(r, '文字サイズ / pt', single.fontSize, {
      min: 4,
      max: 100,
      step: 1,
      change: (v) => change(() => (single.fontSize = v)),
    });
    field(r, '基準点', single.anchor, {
      options: [
        ['center', '中央'],
        ['west', '左端'],
        ['east', '右端'],
      ],
      change: (v) => change(() => (single.anchor = v)),
    });
    if (single.math)
      try {
        window.katex.renderToString(single.text, {
          throwOnError: true,
          trust: false,
          maxSize: 20,
          maxExpand: 1000,
        });
        text.append(
          html('p', { class: 'property-note' }, '編集時表示: KaTeX / 出力: TikZ の数式ノード'),
        );
      } catch (error) {
        text.append(html('p', { class: 'validation-error' }, error.message));
      }
  }
  if (list.length) {
    const buttons = html('div', { class: 'property-buttons' });
    for (const [action, label] of [
      ['duplicate', '複製'],
      ['delete', '削除'],
    ]) {
      const b = html('button', {}, label);
      b.addEventListener('click', () => command(action));
      buttons.append(b);
    }
    root.append(buttons);
    const order = html('div', { class: 'reorder-buttons' });
    for (const [action, label] of [
      ['back', '最背面へ'],
      ['front', '最前面へ'],
    ]) {
      const b = html('button', {}, label);
      b.addEventListener('click', () => command(action));
      order.append(b);
    }
    root.append(order);
  }
}
function renderPackageProperties(root, e, isSelected) {
  const panel = section(
    root,
    e.type === 'feynman' || e.type === 'vertex' ? 'tikz-feynhand' : 'circuitikz',
  );
  const set = (key, value) => {
    if (key === 'rotation') value = Number(value);
    if (isSelected) change(() => (e[key] = value));
    else {
      toolPreset[key] = value;
      render();
    }
  };
  const choose = (label, key, values) =>
    field(row(panel), label, e[key], {
      options: Object.entries(values),
      change: (v) => set(key, v),
    });
  const text = (label, key) => {
    const input = field(row(panel), label, e[key], { type: 'text', change: (v) => set(key, v) });
    input.maxLength = 2000;
  };
  const size = () =>
    field(row(panel), '記号サイズ / mm', e.size, {
      min: e.type === 'circuit' ? 4 : 0.5,
      max: e.type === 'circuit' ? 40 : e.type === 'junction' ? 10 : 20,
      step: 0.5,
      change: (v) => set('size', v),
    });
  if (e.type === 'feynman') {
    choose('粒子の種類', 'particle', PARTICLES);
    if (isSelected) {
      const buttons = html('div', { class: 'property-buttons' });
      for (const [label, geometry] of [
        ['直線', 'straight'],
        ['曲線', 'curve'],
        ['ループ', 'loop'],
      ]) {
        const button = html('button', {}, label);
        button.addEventListener('click', () =>
          change(() => (e.points = propagatorPoints(e.points[0], e.points[3], geometry))),
        );
        buttons.append(button);
      }
      panel.append(buttons);
    }
    text('粒子名 / LaTeX', 'label');
    text('運動量 / LaTeX', 'momentum');
    choose('粒子名の側', 'labelSide', { left: '左側', right: '右側' });
    choose('運動量の側', 'momentumSide', { left: '左側', right: '右側' });
    check(row(panel), '運動量の矢印を反転', e.momentumReverse, (v) => set('momentumReverse', v));
  }
  if (e.type === 'vertex') {
    choose('頂点の種類', 'vertexStyle', VERTICES);
    size();
    text('頂点ラベル / LaTeX', 'label');
  }
  if (e.type === 'circuit') {
    choose('回路部品', 'component', COMPONENTS);
    choose('記号の規格', 'standard', { american: '米式', european: '欧式' });
    size();
    text('部品名・値 / LaTeX', 'label');
    text('電圧 / LaTeX', 'voltage');
    text('電流 / LaTeX', 'current');
    choose('部品名の側', 'labelSide', { left: '左側', right: '右側' });
    choose('端子', 'terminals', {
      none: 'なし',
      '*-*': '両端 ●',
      'o-o': '両端 ○',
      '*-o': '● → ○',
      'o-*': '○ → ●',
      '-*': '終点 ●',
      '*-': '始点 ●',
      '-o': '終点 ○',
      'o-': '始点 ○',
    });
    check(row(panel), '部品の向きを反転', e.invert, (v) => set('invert', v));
    panel.append(
      html(
        'p',
        { class: 'property-note' },
        '端点は青い点をドラッグして調整します。電圧は RP 規約で出力します。',
      ),
    );
  }
  if (e.type === 'ground')
    choose('接地記号の向き', 'rotation', {
      0: '下向き',
      90: '左向き',
      180: '上向き',
      270: '右向き',
    });
  if (e.type === 'junction') {
    size();
    check(row(panel), '白抜き接続点', e.open, (v) => set('open', v));
  }
  panel.append(
    html(
      'p',
      { class: 'property-note' },
      'ラベルは LaTeX 数式で指定（$ は不要）。画面は編集用の概略表示です。',
    ),
  );
}
function propagatorPoints(a, b, geometry) {
  if (geometry === 'loop') {
    const dx = Math.abs(b.x - a.x) > 1 ? b.x - a.x : 18,
      dy = Math.abs(b.y - a.y) > 1 ? b.y - a.y : -30;
    return [
      a,
      { x: a.x + dx * 1.6, y: a.y + dy * 1.6 },
      { x: a.x - dx * 1.6, y: a.y + dy * 1.6 },
      { ...a },
    ];
  }
  if (Math.hypot(b.x - a.x, b.y - a.y) < 0.1) b = { x: a.x + 30, y: a.y };
  const points = linearControls(a, b);
  if (geometry === 'curve')
    for (const i of [1, 2]) {
      points[i].x -= (b.y - a.y) * 0.35;
      points[i].y += (b.x - a.x) * 0.35;
    }
  return points;
}
function location(event, snap = true) {
  const m = canvas.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const q = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse());
  const grid = doc.page.grid;
  return {
    x: round(
      snap && $('#snap-grid').checked && !event.altKey ? Math.round(q.x / grid) * grid : q.x,
    ),
    y: round(
      snap && $('#snap-grid').checked && !event.altKey ? Math.round(q.y / grid) * grid : q.y,
    ),
  };
}
function cancelGesture() {
  if (gesture?.before) doc = parseDocument(gesture.before);
  gesture = null;
  poly = null;
  renderOverlay();
  syncState();
}
function updateDraw(p, shift = false) {
  const e = gesture.shape,
    a = e.points[0];
  if (e.type === 'feynman') {
    e.points = propagatorPoints(a, p, gesture.geometry);
    return;
  }
  if (shift && ['rect', 'ellipse'].includes(e.type)) {
    const size = Math.max(Math.abs(p.x - a.x), Math.abs(p.y - a.y));
    p = { x: a.x + Math.sign(p.x - a.x || 1) * size, y: a.y + Math.sign(p.y - a.y || 1) * size };
  }
  if (shift && e.type === 'line') {
    const dx = p.x - a.x,
      dy = p.y - a.y,
      len = Math.hypot(dx, dy),
      angle = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI) / 4;
    p = { x: a.x + len * Math.cos(angle), y: a.y + len * Math.sin(angle) };
  }
  if (e.type === 'bezier') {
    const dx = p.x - a.x,
      dy = p.y - a.y;
    e.points = [
      a,
      { x: a.x + dx / 3 - dy * 0.25, y: a.y + dy / 3 + dx * 0.25 },
      { x: a.x + (dx * 2) / 3 - dy * 0.25, y: a.y + (dy * 2) / 3 + dx * 0.25 },
      p,
    ];
  } else e.points[1] = p;
}
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || busy || sourceEditing) return;
  canvas.focus();
  const p = location(event),
    target = event.target.closest('[data-id]');
  const spec = specialTools.find((t) => t.id === tool);
  if (tool === 'select') {
    if (target?.hasAttribute('data-handle') || target?.hasAttribute('data-angle')) {
      const e = doc.elements.find((e) => e.id === target.dataset.id);
      gesture = {
        kind: target.hasAttribute('data-angle') ? 'angle' : 'handle',
        id: e.id,
        index: Number(target.dataset.handle ?? target.dataset.angle),
        before: JSON.stringify(doc),
      };
    } else if (target) {
      const id = target.dataset.id;
      if (event.shiftKey) {
        selection.has(id) ? selection.delete(id) : selection.add(id);
      } else if (!selection.has(id)) selection = new Set([id]);
      gesture = {
        kind: 'move',
        start: p,
        original: clone(doc.elements),
        before: JSON.stringify(doc),
      };
    } else {
      if (!event.shiftKey) selection.clear();
      gesture = {
        kind: 'marquee',
        start: location(event, false),
        current: location(event, false),
        previous: new Set(selection),
      };
    }
    render();
  } else if (spec && POINT_TYPES.includes(spec.type)) {
    const e = Object.assign(makeShape(spec.type, [p], style), toolPreset || spec.props);
    change(() => doc.elements.push(e));
    selection = new Set([e.id]);
    setTool('select');
    return;
  } else if (tool === 'text' || tool === 'math') {
    const e = makeShape('text', [p], style);
    e.math = tool === 'math';
    e.text = e.math ? 'x^2' : 'ラベル';
    change(() => doc.elements.push(e));
    selection = new Set([e.id]);
    setTool('select');
    setTimeout(() => {
      $('#label-input')?.focus();
      $('#label-input')?.select();
    }, 0);
    return;
  } else if (tool === 'polyline') {
    if (!poly) poly = { points: [p], hover: p };
    else if (Math.hypot(p.x - poly.points.at(-1).x, p.y - poly.points.at(-1).y) > 0.01)
      poly.points.push(p);
    renderOverlay();
    syncState();
    return;
  } else {
    const shape = makeShape(spec ? spec.type : tool === 'arrow' ? 'line' : tool, [p, p], {
      ...style,
      ...(tool === 'arrow' ? { arrow: 'end' } : {}),
    });
    if (spec) Object.assign(shape, toolPreset || spec.props);
    gesture = { kind: 'draw', shape, start: p, geometry: spec?.geometry || 'straight' };
    updateDraw(p);
    renderOverlay();
    syncState();
  }
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  const raw = location(event, false);
  $('#coordinates').textContent = `x ${raw.x.toFixed(1)}　y ${raw.y.toFixed(1)} mm`;
  const p = location(event);
  if (poly) {
    poly.hover = p;
    renderOverlay();
    return;
  }
  if (!gesture) return;
  if (gesture.kind === 'draw') updateDraw(p, event.shiftKey);
  if (gesture.kind === 'move') {
    const dx = p.x - gesture.start.x,
      dy = p.y - gesture.start.y;
    doc.elements = clone(gesture.original);
    doc.elements.filter((e) => selection.has(e.id)).forEach((e) => translate(e, dx, dy));
    content.replaceChildren(...doc.elements.map((e) => drawShape(e)));
  }
  if (gesture.kind === 'handle') {
    const e = doc.elements.find((e) => e.id === gesture.id),
      old = clone(e.points[gesture.index]);
    e.points[gesture.index] = p;
    if ((e.type === 'circle' || e.type === 'arc') && gesture.index === 0) {
      e.points[1].x += p.x - old.x;
      e.points[1].y += p.y - old.y;
    }
    content.replaceChildren(...doc.elements.map((e) => drawShape(e)));
  }
  if (gesture.kind === 'angle') {
    const e = doc.elements.find((e) => e.id === gesture.id),
      c = e.points[0],
      a = (Math.atan2(c.y - raw.y, raw.x - c.x) * 180) / Math.PI;
    const key = gesture.index === 0 ? 'startAngle' : 'endAngle',
      other = e[key === 'startAngle' ? 'endAngle' : 'startAngle'];
    const value = event.altKey ? a : Math.round(a / 5) * 5;
    if (Math.abs(value - other) <= 360) e[key] = round(value);
    content.replaceChildren(...doc.elements.map((e) => drawShape(e)));
  }
  if (gesture.kind === 'marquee') gesture.current = raw;
  renderOverlay();
});
canvas.addEventListener('pointerup', (event) => {
  if (!gesture) return;
  const g = gesture;
  if (g.kind === 'draw') {
    updateDraw(location(event), event.shiftKey);
    if (Math.hypot(location(event).x - g.start.x, location(event).y - g.start.y) > 0.05) {
      const before = JSON.stringify(doc);
      doc.elements.push(g.shape);
      remember(before);
      selection = new Set([g.shape.id]);
    }
  } else if (g.kind === 'marquee') {
    const a = g.start,
      b = g.current,
      l = Math.min(a.x, b.x),
      r = Math.max(a.x, b.x),
      t = Math.min(a.y, b.y),
      bottom = Math.max(a.y, b.y);
    selection = new Set(g.previous);
    for (const e of doc.elements) {
      const q = bounds(e);
      if (q.x >= l && q.y >= t && q.x + q.width <= r && q.y + q.height <= bottom)
        selection.add(e.id);
    }
  } else if (g.before) remember(g.before);
  gesture = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  render();
});
canvas.addEventListener('pointercancel', () => {
  cancelGesture();
  render();
});
function finishPolyline() {
  if (!poly) return;
  const points = poly.points;
  poly = null;
  if (points.length >= 2) {
    const e = makeShape('polyline', points, style);
    change(() => doc.elements.push(e));
    selection = new Set([e.id]);
  }
  render();
}
canvas.addEventListener('dblclick', (event) => {
  if (tool === 'polyline') {
    finishPolyline();
    event.preventDefault();
  } else if (tool === 'select') {
    const e = doc.elements.find((e) => e.id === event.target.closest('[data-id]')?.dataset.id);
    if (e?.type === 'text') {
      $('#label-input')?.focus();
      $('#label-input')?.select();
    }
  }
});
function zoomTo(value) {
  zoom = Math.max(0.15, Math.min(4, value));
  render({ inspector: false });
}
function fit() {
  const view = $('#viewport');
  zoomTo(
    Math.min(
      (view.clientWidth - 80) / (doc.page.width * 5),
      (view.clientHeight - 100) / (doc.page.height * 5),
      1.5,
    ),
  );
}
$('#viewport').addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomTo(zoom * (event.deltaY > 0 ? 0.9 : 1.1));
    }
  },
  { passive: false },
);
function commitInputs() {
  document.activeElement?.blur();
}
function sourceControls() {
  document
    .querySelectorAll('[data-source]')
    .forEach((button) => button.classList.toggle('active', button.dataset.source === sourceKind));
  $('#source').hidden = sourceEditing;
  $('#source-editor').hidden = !sourceEditing;
  $('[data-action="edit-source"]').hidden = sourceEditing;
  for (const action of ['apply-source', 'cancel-source'])
    $(`[data-action="${action}"]`).hidden = !sourceEditing;
  $('#source-panel').classList.toggle('editing-source', sourceEditing);
}
function beginSourceEdit(draft) {
  if (sourceEditing) return;
  commitInputs();
  sourceBase = sourceKind === 'tex' ? exportTex(doc) : exportTikz(doc);
  $('#source-editor').value = draft ?? sourceBase;
  sourceEditing = true;
  $('#source-panel').classList.remove('collapsed');
  sourceControls();
  render();
  $('#source-editor').focus();
}
function endSourceEdit() {
  sourceEditing = false;
  sourceBase = '';
  sourceControls();
  try {
    localStorage.removeItem(sourceDraftKey);
  } catch {}
}
function applySource() {
  try {
    const parsed = importTex($('#source-editor').value, { name: doc.name });
    endSourceEdit();
    selection.clear();
    change(() => (doc = parsed));
    toast('ソースを図に反映しました');
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}
$('#source-editor').addEventListener('input', () => syncState());
async function save(saveAs = false) {
  commitInputs();
  if (sourceEditing && !applySource()) return false;
  const source = serializeDocument(doc);
  if (!bridge) {
    toast('保存は Electron のアプリからご利用ください。');
    return false;
  }
  const result = await bridge.save(source, saveAs);
  if (result.error) {
    toast(result.error);
    return false;
  }
  if (result.canceled) return false;
  saved = JSON.stringify(parseDocument(source));
  syncState();
  toast('図を保存しました');
  return true;
}
async function canReplace() {
  commitInputs();
  if (!dirty()) return true;
  if (!bridge) return window.confirm('未保存の変更を破棄しますか？');
  const { choice, error } = await bridge.confirmDiscard();
  if (error) {
    toast(error);
    return false;
  }
  if (choice === 'save') return await save();
  return choice === 'discard';
}
function replaceDocument(value, { asSaved = false } = {}) {
  endSourceEdit();
  cancelGesture();
  doc = value;
  undoStack = [];
  redoStack = [];
  selection.clear();
  saved = asSaved ? JSON.stringify(doc) : JSON.stringify(newDocument());
  setTool('select');
  render();
  fit();
}
async function command(action) {
  if (action === 'edit-source') {
    beginSourceEdit();
    return;
  }
  if (action === 'apply-source') {
    applySource();
    return;
  }
  if (action === 'cancel-source') {
    endSourceEdit();
    render();
    return;
  }
  if (action.startsWith('toggle-palette-')) {
    const key = action.slice('toggle-palette-'.length);
    if (Object.hasOwn(enabledPalettes, key)) {
      enabledPalettes[key] = !enabledPalettes[key];
      refreshPalettes();
    }
    return;
  }
  if (action === 'palette-options') {
    $('#palette-dialog').showModal();
    return;
  }
  if (action === 'close-palettes') {
    $('#palette-dialog').close();
    return;
  }
  // Blur commits inspector edits before destructive commands or file operations.
  if (!['undo', 'redo', 'select-all'].includes(action)) commitInputs();
  if (['new', 'sample', 'sample-current', 'sample-mixed', 'open'].includes(action)) {
    if (busy) return;
    busy = true;
    try {
      if (!(await canReplace())) return;
      if (action === 'open') {
        const result = await bridge?.open();
        if (!result) {
          toast('読込は Electron のアプリからご利用ください。');
          return;
        }
        if (result.error) {
          toast(result.error);
          return;
        }
        if (result.canceled) return;
        replaceDocument(result.doc, { asSaved: result.kind !== 'tex' });
        toast('図を開きました');
      } else {
        bridge?.newPath();
        replaceDocument(
          action === 'new'
            ? newDocument()
            : action === 'sample-mixed'
              ? packageExample('mixed')
              : action === 'sample-current' && palette !== 'basic'
                ? packageExample(palette)
                : exampleDocument(),
          {
            asSaved: action === 'new',
          },
        );
        toast(action !== 'new' ? 'サンプルを開きました' : '新しい図を作成しました');
      }
    } finally {
      busy = false;
    }
    return;
  }
  if (action === 'save' || action === 'save-as') return await save(action === 'save-as');
  if (action === 'save-and-close') {
    if (await save()) {
      localStorage.removeItem(recoveryKey);
      bridge?.close();
    }
    return;
  }
  if (action === 'discard-and-close') {
    localStorage.removeItem(recoveryKey);
    localStorage.removeItem(sourceDraftKey);
    bridge?.close();
    return;
  }
  if (action === 'export-tikz' || action === 'export-tex' || action === 'export-source') {
    if (sourceEditing && !applySource()) return;
    const kind = action === 'export-source' ? sourceKind : action === 'export-tex' ? 'tex' : 'tikz',
      result = await bridge?.export(serializeDocument(doc), kind);
    if (result?.error) toast(result.error);
    else if (result && !result.canceled)
      toast(`${kind === 'tex' ? '単体 TeX' : 'TikZ'} を書き出しました`);
    return;
  }
  if (action === 'undo') return history();
  if (action === 'redo') return history(true);
  if (action === 'select-all') {
    if (editing()) {
      document.activeElement.select?.();
      return;
    }
    setTool('select');
    selection = new Set(doc.elements.map((e) => e.id));
    render();
    return;
  }
  if (action === 'delete')
    change(() => {
      doc.elements = doc.elements.filter((e) => !selection.has(e.id));
      selection.clear();
    });
  if (action === 'duplicate')
    change(() => {
      const copies = selected().map((e) => {
        const copy = clone(e);
        copy.id = crypto.randomUUID();
        return translate(copy, 5, 5);
      });
      doc.elements.push(...copies);
      selection = new Set(copies.map((e) => e.id));
    });
  if (action === 'front' || action === 'back')
    change(() => {
      const s = selected(),
        other = doc.elements.filter((e) => !selection.has(e.id));
      doc.elements = action === 'front' ? [...other, ...s] : [...s, ...other];
    });
  if (action === 'zoom-in') zoomTo(zoom * 1.2);
  if (action === 'zoom-out') zoomTo(zoom / 1.2);
  if (action === 'zoom-fit') fit();
  if (action === 'toggle-source') {
    $('#source-panel').classList.toggle('collapsed');
    $('#toggle-source').textContent = $('#source-panel').classList.contains('collapsed')
      ? '⌃'
      : '⌄';
  }
  if (action === 'copy-source')
    try {
      await navigator.clipboard.writeText(
        sourceEditing
          ? $('#source-editor').value
          : sourceKind === 'tex'
            ? exportTex(doc)
            : exportTikz(doc),
      );
      toast('ソースをコピーしました');
    } catch {
      const sel = window.getSelection();
      sel.selectAllChildren($('#source'));
      toast('ソースを選択しました。⌘C でコピーできます。');
    }
  if (action === 'help') $('#help-dialog').showModal();
  if (action === 'close-help') $('#help-dialog').close();
}
document
  .querySelectorAll('[data-action]')
  .forEach((button) =>
    button.addEventListener('click', () =>
      command(button.dataset.action).catch((error) => toast(error.message)),
    ),
  );
document.querySelectorAll('[data-source]').forEach((button) =>
  button.addEventListener('click', () => {
    if (sourceEditing) {
      toast('ソースを図に反映するか、取消してから切り替えてください。');
      return;
    }
    sourceKind = button.dataset.source;
    document
      .querySelectorAll('[data-source]')
      .forEach((b) => b.classList.toggle('active', b === button));
    render({ inspector: false });
  }),
);
$('#document-name').addEventListener('change', (event) =>
  change(() => (doc.name = event.target.value.trim() || '無題')),
);
// Native Close/Quit must notice an in-progress property edit, even before the field blurs.
document.addEventListener('input', (event) => {
  const input = event.target;
  if (
    input.matches('#document-name, #properties input:not([type=checkbox]), #properties textarea')
  ) {
    bridge?.changed(true);
    $('#save-status').textContent = '未保存の変更';
  }
});
$('#show-grid').addEventListener('change', () => render({ inspector: false }));
window.addEventListener('keydown', (event) => {
  if ($('#help-dialog').open || $('#palette-dialog').open) return;
  if (editing()) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelGesture();
    setTool('select');
    return;
  }
  if (event.key === 'Enter' && poly) {
    event.preventDefault();
    finishPolyline();
    return;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selection.size) {
    event.preventDefault();
    command('delete');
    return;
  }
  if (event.key.startsWith('Arrow') && selection.size) {
    event.preventDefault();
    const step = event.shiftKey ? doc.page.grid : 0.2;
    change(
      () =>
        selected().forEach((e) =>
          translate(
            e,
            event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0,
            event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0,
          ),
        ),
      { inspector: false },
    );
    renderInspector();
    return;
  }
  if (event.metaKey || event.ctrlKey) {
    // Native Electron menu accelerators own these shortcuts; browser mode is only a development fallback.
    if (!bridge) {
      const key = event.key.toLowerCase(),
        map = {
          z: event.shiftKey ? 'redo' : 'undo',
          s: event.shiftKey ? 'save-as' : 'save',
          a: 'select-all',
          d: 'duplicate',
          o: 'open',
          n: 'new',
          e: event.shiftKey ? 'export-tex' : 'export-tikz',
          0: 'zoom-fit',
        };
      if (map[key]) {
        event.preventDefault();
        command(map[key]);
      }
    }
    return;
  }
  const found = toolDefs.find((t) => t[2].toLowerCase() === event.key.toLowerCase());
  if (found) {
    event.preventDefault();
    setTool(found[0]);
  }
});
bridge?.onCommand((action) => command(action).catch((error) => toast(error.message)));
window.addEventListener('error', (event) => {
  toast(`操作エラー: ${event.message}`);
});
window.addEventListener('unhandledrejection', (event) => {
  toast(`操作エラー: ${event.reason?.message || event.reason}`);
});
try {
  const previous = localStorage.getItem(recoveryKey);
  if (previous) {
    doc = parseDocument(previous);
    toast('前回の未保存の図を復元しました。保存してご利用ください。');
  }
} catch {
  localStorage.removeItem(recoveryKey);
}
const sourceRecovery = localStorage.getItem(sourceDraftKey);
refreshPalettes();
try {
  if (sourceRecovery) {
    const draft = JSON.parse(sourceRecovery);
    if (typeof draft.source === 'string' && draft.source.length <= 2_000_000) {
      sourceKind = draft.kind === 'tex' ? 'tex' : 'tikz';
      beginSourceEdit(draft.source);
      sourceBase = '';
      syncState();
      toast('編集中のソースを復元しました。反映または保存してください。');
    }
  }
} catch {
  localStorage.removeItem(sourceDraftKey);
}
requestAnimationFrame(fit);
// Read-only inspection surface for the automated integration checks.
Object.defineProperty(window, 'tikzDrawState', {
  get: () =>
    clone({
      doc,
      selection: [...selection],
      tool,
      dirty: dirty(),
      undo: undoStack.length,
      redo: redoStack.length,
    }),
});
