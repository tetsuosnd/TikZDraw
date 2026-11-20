import { cubicPoint, cubicFrame } from '../core/specials.mjs';
export function renderSpecial(e, { node, g, attrs, mathLabel, zoom }) {
  const p = e.points,
    s = e.style;
  const line = (parent, x1, y1, x2, y2, extra = {}) =>
    parent.append(node('line', { ...attrs, x1, y1, x2, y2, ...extra }));
  const path = (parent, d, extra = {}) =>
    parent.append(node('path', { ...attrs, d, fill: 'none', ...extra }));
  const arrow = (parent, point, dx, dy, size = 1.4) => {
    const len = Math.hypot(dx, dy) || 1,
      tx = dx / len,
      ty = dy / len;
    parent.append(
      node('path', {
        d: `M${point.x + tx * size} ${point.y + ty * size} L${point.x - tx * size - ty * size * 0.5} ${point.y - ty * size + tx * size * 0.5} L${point.x - tx * size + ty * size * 0.5} ${point.y - ty * size - tx * size * 0.5} Z`,
        fill: s.stroke,
        stroke: 'none',
      }),
    );
  };
  const base = { ...attrs, fill: 'none', 'stroke-dasharray': 'none' };
  if (e.type === 'feynman') {
    const d = `M${p[0].x} ${p[0].y} C${p[1].x} ${p[1].y} ${p[2].x} ${p[2].y} ${p[3].x} ${p[3].y}`;
    path(g, d, {
      stroke: 'transparent',
      'stroke-width': Math.max(3, 2 / zoom),
      'pointer-events': 'stroke',
    });
    if (['photon', 'gluon'].includes(e.particle)) {
      const samples = Array.from({ length: 201 }, (_, i) => cubicFrame(p, i / 200));
      let length = 0;
      const distances = [0];
      for (let i = 1; i < samples.length; i++) {
        length += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
        distances.push(length);
      }
      const widthMm = (s.width * 25.4) / 72.27,
        amplitude = (e.particle === 'gluon' ? 3 : 1.5) * widthMm;
      const waves = Math.max(
        1,
        Math.round(length / ((e.particle === 'gluon' ? 8 : 7.5) * widthMm)),
      );
      const wave = samples
        .map((q, i) => {
          const u = length ? distances[i] / length : 0,
            phase = u * waves * 2 * Math.PI,
            taper = Math.min(1, u * 10, (1 - u) * 10);
          const offset = Math.sin(phase) * taper * amplitude,
            axial = e.particle === 'gluon' ? Math.cos(phase) * amplitude * 0.8 * taper : 0;
          return `${i ? 'L' : 'M'}${q.x + q.nx * offset + q.tx * axial} ${q.y + q.ny * offset + q.ty * axial}`;
        })
        .join(' ');
      path(g, wave, base);
    } else {
      const dash = e.particle === 'scalar' ? '1.6 1.2' : e.particle === 'ghost' ? '0 1.3' : 'none';
      path(g, d, { ...base, 'stroke-dasharray': dash });
      if (['fermion', 'anti fermion'].includes(e.particle)) {
        const q = cubicFrame(p, 0.55),
          direction = e.particle === 'anti fermion' ? -1 : 1;
        arrow(g, q, q.tx * direction, q.ty * direction);
      }
    }
    const q = cubicFrame(p, 0.5);
    if (e.label) {
      const sign = e.labelSide === 'left' ? 1 : -1;
      mathLabel(e.label, { x: q.x + q.nx * 4 * sign, y: q.y + q.ny * 4 * sign });
    }
    if (e.momentum) {
      const sign = e.momentumSide === 'left' ? 1 : -1,
        offset = 5 * sign;
      const points = [0.32, 0.4, 0.5, 0.6, 0.68].map((t) => {
        const f = cubicFrame(p, t);
        return { ...f, x: f.x + f.nx * offset, y: f.y + f.ny * offset };
      });
      path(g, points.map((q, i) => `${i ? 'L' : 'M'}${q.x} ${q.y}`).join(' '), {
        ...base,
        'stroke-width': 0.18,
      });
      const end = points[e.momentumReverse ? 0 : points.length - 1];
      arrow(
        g,
        end,
        end.tx * (e.momentumReverse ? -1 : 1),
        end.ty * (e.momentumReverse ? -1 : 1),
        0.7,
      );
      mathLabel(e.momentum, {
        x: q.x + q.nx * (offset + 2.5 * sign),
        y: q.y + q.ny * (offset + 2.5 * sign),
      });
    }
  }
  if (e.type === 'vertex' || e.type === 'junction') {
    const c = p[0],
      r = e.size / 2,
      open = e.open || ['ringdot', 'crossdot'].includes(e.vertexStyle);
    g.append(
      node('circle', {
        ...base,
        cx: c.x,
        cy: c.y,
        r,
        fill: open ? 'white' : s.stroke,
      }),
    );
    if (e.vertexStyle === 'crossdot') {
      line(g, c.x - r * 0.7, c.y - r * 0.7, c.x + r * 0.7, c.y + r * 0.7);
      line(g, c.x - r * 0.7, c.y + r * 0.7, c.x + r * 0.7, c.y - r * 0.7);
    }
    if (e.label) mathLabel(e.label, { x: c.x + r + 3, y: c.y - r - 2 });
    g.append(
      node('circle', {
        cx: c.x,
        cy: c.y,
        r: Math.max(r, 1.5 / zoom),
        fill: 'transparent',
        stroke: 'none',
      }),
    );
  }
  if (e.type === 'ground') {
    const c = p[0],
      body = node('g', { transform: `translate(${c.x} ${c.y}) rotate(${e.rotation})` });
    g.append(body);
    line(body, 0, 0, 0, 2.5);
    for (const [y, w] of [
      [2.5, 2.5],
      [3.8, 1.6],
      [5.1, 0.7],
    ])
      line(body, -w, y, w, y);
    body.append(
      node('rect', { x: -3, y: 0, width: 6, height: 6, fill: 'transparent', stroke: 'none' }),
    );
  }
  if (e.type === 'circuit') {
    const [a, b] = p,
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy),
      angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      scale = e.size / 12,
      half = len / 2 / scale;
    const body = node('g', {
      transform: `translate(${c.x} ${c.y}) rotate(${angle}) scale(${scale})`,
    });
    g.append(body);
    body.append(
      node('rect', {
        x: -Math.max(half, 5),
        y: -5,
        width: Math.max(len / scale, 10),
        height: 10,
        fill: 'transparent',
        stroke: 'none',
      }),
    );
    let edge = 4.8;
    if (e.component === 'C') edge = 0.6;
    if (['V', 'I'].includes(e.component)) edge = 3.6;
    if (['D', 'leD'].includes(e.component)) edge = 2.4;
    if (e.component === 'battery1') edge = 1.1;
    if (e.component === 'nos') edge = 3.6;
    if (e.component === 'short') line(body, -half, 0, half, 0);
    else {
      line(body, -half, 0, -edge, 0);
      line(body, edge, 0, half, 0);
      const symbol = node('g', { transform: e.invert ? 'rotate(180)' : '' });
      body.append(symbol);
      if (e.component === 'R') {
        if (e.standard === 'european')
          symbol.append(node('rect', { ...base, x: -4.8, y: -1.8, width: 9.6, height: 3.6 }));
        else path(symbol, 'M-4.8 0 L-4 -1.8 -2.4 1.8 -.8 -1.8 .8 1.8 2.4 -1.8 4 1.8 4.8 0', base);
      }
      if (e.component === 'C') {
        line(symbol, -0.6, -3.6, -0.6, 3.6);
        line(symbol, 0.6, -3.6, 0.6, 3.6);
      }
      if (e.component === 'L')
        path(
          symbol,
          'M-4.8 0 C-4.8 -4 -2.4 -4 -2.4 0 C-2.4 -4 0 -4 0 0 C0 -4 2.4 -4 2.4 0 C2.4 -4 4.8 -4 4.8 0',
          base,
        );
      if (e.component === 'V' || e.component === 'I') {
        symbol.append(node('circle', { ...base, cx: 0, cy: 0, r: 3.6 }));
        if (e.component === 'V') {
          if (e.standard === 'european') line(symbol, -3.6, 0, 3.6, 0);
          else {
            line(symbol, -2.5, 0, -0.9, 0);
            line(symbol, 1.7, -0.8, 1.7, 0.8);
            line(symbol, 0.9, 0, 2.5, 0);
          }
        } else {
          line(symbol, -1.8, 0, 1.8, 0);
          arrow(symbol, { x: 1.1, y: 0 }, 1, 0, 0.7);
        }
      }
      if (e.component === 'battery1') {
        line(symbol, 1.1, -3.6, 1.1, 3.6);
        line(symbol, -1.1, -1.8, -1.1, 1.8);
      }
      if (e.component === 'D' || e.component === 'leD') {
        path(symbol, 'M-2.4 -2.4 L2.4 0 L-2.4 2.4 Z', base);
        line(symbol, 2.4, -2.4, 2.4, 2.4);
        if (e.component === 'leD')
          for (const x of [0, 2]) {
            line(symbol, x, -3, x + 1.5, -4.5);
            arrow(symbol, { x: x + 1.5, y: -4.5 }, 1, -1, 0.5);
          }
      }
      if (e.component === 'nos') {
        path(symbol, 'M-3.6 0 L1.8 -2.5', base);
        for (const x of [-3.6, 3.6])
          symbol.append(node('circle', { ...base, cx: x, cy: 0, r: 0.4, fill: 'white' }));
      }
    }
    if (e.terminals !== 'none') {
      for (const [point, char] of [
        [a, e.terminals[0]],
        [b, e.terminals.at(-1)],
      ])
        if (['*', 'o'].includes(char))
          g.append(
            node('circle', {
              ...base,
              cx: point.x,
              cy: point.y,
              r: 0.65,
              fill: char === '*' ? s.stroke : 'white',
            }),
          );
    }
    const tx = len ? dx / len : 1,
      ty = len ? dy / len : 0,
      nx = ty,
      ny = -tx;
    const labelAt = (text, distance) =>
      mathLabel(text, { x: c.x + nx * distance, y: c.y + ny * distance });
    if (e.label) labelAt(e.label, (e.labelSide === 'left' ? 1 : -1) * (e.size * 0.35 + 3));
    if (e.voltage) {
      const offset = e.size * 0.35 + 6;
      const pa = { x: c.x - tx * len * 0.3 + nx * offset, y: c.y - ty * len * 0.3 + ny * offset },
        pb = { x: c.x + tx * len * 0.3 + nx * offset, y: c.y + ty * len * 0.3 + ny * offset };
      if (e.standard === 'american') {
        mathLabel('+', pa);
        mathLabel('-', pb);
      } else {
        line(g, pa.x, pa.y, pb.x, pb.y, { 'stroke-width': 0.18 });
        arrow(g, pb, tx, ty, 0.7);
      }
      labelAt(e.voltage, offset + 3);
    }
    if (e.current) {
      const offset = -(e.size * 0.35 + 4);
      const pa = { x: c.x - tx * len * 0.2 + nx * offset, y: c.y - ty * len * 0.2 + ny * offset },
        pb = { x: c.x + tx * len * 0.2 + nx * offset, y: c.y + ty * len * 0.2 + ny * offset };
      line(g, pa.x, pa.y, pb.x, pb.y, { 'stroke-width': 0.18 });
      arrow(g, pb, tx, ty, 0.7);
      labelAt(e.current, offset - 3);
    }
  }
  return g;
}
