import { newDocument, makeShape, translate } from './document.mjs';
export function packageExample(kind) {
  const doc = newDocument();
  const add = (type, points, props = {}, style = {}) => {
    const e = Object.assign(makeShape(type, points, style), props);
    doc.elements.push(e);
    return e;
  };
  const label = (x, y, text) => add('text', [{ x, y }], { text, fontSize: 11 });
  if (kind === 'feynman') {
    doc.name = 'FeynHand — one-loop diagram';
    add(
      'feynman',
      [
        { x: 15, y: 50 },
        { x: 50, y: 50 },
      ],
      { particle: 'photon', label: '\\gamma', momentum: 'q' },
      { stroke: '#226b61' },
    );
    add(
      'feynman',
      [
        { x: 110, y: 50 },
        { x: 145, y: 50 },
      ],
      { particle: 'photon', label: '\\gamma' },
      { stroke: '#226b61' },
    );
    add(
      'feynman',
      [
        { x: 50, y: 50 },
        { x: 50, y: 8 },
        { x: 110, y: 8 },
        { x: 110, y: 50 },
      ],
      { label: 'e^-', momentum: 'k', momentumSide: 'left', labelSide: 'right' },
    );
    add(
      'feynman',
      [
        { x: 110, y: 50 },
        { x: 110, y: 92 },
        { x: 50, y: 92 },
        { x: 50, y: 50 },
      ],
      { label: 'e^-', momentum: 'k+q', momentumSide: 'left', labelSide: 'right' },
    );
    add('vertex', [{ x: 50, y: 50 }]);
    add('vertex', [{ x: 110, y: 50 }]);
    label(80, 93, 'tikz-feynhand');
  } else if (kind === 'circuit') {
    doc.name = 'CircuiTikZ — RC circuit';
    add(
      'circuit',
      [
        { x: 40, y: 75 },
        { x: 40, y: 25 },
      ],
      { component: 'V', label: 'V_s', standard: 'american' },
    );
    add(
      'circuit',
      [
        { x: 40, y: 25 },
        { x: 115, y: 25 },
      ],
      { component: 'R', label: 'R_1', current: 'i', standard: 'american' },
      { stroke: '#226b61' },
    );
    add(
      'circuit',
      [
        { x: 115, y: 25 },
        { x: 115, y: 75 },
      ],
      { component: 'C', label: 'C_1', voltage: 'v_C', labelSide: 'right' },
    );
    add(
      'circuit',
      [
        { x: 115, y: 75 },
        { x: 40, y: 75 },
      ],
      { component: 'short' },
    );
    add('ground', [{ x: 40, y: 75 }]);
    add('junction', [{ x: 40, y: 75 }]);
    add('junction', [{ x: 115, y: 25 }]);
    label(80, 95, 'circuitikz');
  } else if (kind === 'mixed') {
    const f = packageExample('feynman'),
      c = packageExample('circuit');
    doc.name = 'FeynHand + CircuiTikZ';
    doc.page.height = 200;
    doc.elements = [...f.elements, ...c.elements.map((e) => translate(e, 0, 100))];
  }
  doc.elements.forEach((e, i) => (e.id = `${kind}-${i + 1}`));
  return doc;
}
