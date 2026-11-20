import { app, dialog, clipboard } from 'electron';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), 'tikzdraw-test-'));
app.setPath('userData', path.join(temp, 'profile'));
let win,
  passed = 0;
app.whenReady().then(async () => {
  try {
    process.env.TIKZDRAW_TEST = '1';
    const { createWindow } = await import('../desktop/main.mjs');
    win = await createWindow({ show: false });
    const wc = win.webContents;
    const errors = [];
    wc.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message);
    });
    const js = (code) => wc.executeJavaScript(code, true);
    const state = () => js('window.tikzDrawState');
    const click = async (selector) => {
      await js(`document.querySelector(${JSON.stringify(selector)}).click()`);
      await delay(60);
    };
    const pos = (x, y) =>
      js(
        `(()=>{const c=document.querySelector('#canvas'),r=c.getBoundingClientRect(),s=window.tikzDrawState.doc.page;return {x:Math.round(r.x+${x}/s.width*r.width),y:Math.round(r.y+${y}/s.height*r.height)}})()`,
      );
    const mouse = (type, p) => wc.sendInputEvent({ type, ...p, button: 'left', clickCount: 1 });
    const drag = async (a, b) => {
      const start = await pos(...a),
        end = await pos(...b);
      mouse('mouseDown', start);
      mouse('mouseMove', end);
      mouse('mouseUp', end);
      await delay(80);
    };
    const point = async (x, y) => {
      const p = await pos(x, y);
      mouse('mouseDown', p);
      mouse('mouseUp', p);
      await delay(60);
    };
    const check = async (name, fn) => {
      const start = performance.now();
      await fn();
      passed++;
      console.log(`[${passed}] ${name} (${Math.round(performance.now() - start)} ms)`);
    };
    await delay(200);
    await check('sandboxed window, local math renderer and blank document', async () => {
      assert.equal(wc.getLastWebPreferences().nodeIntegration, false);
      assert.equal(wc.getLastWebPreferences().sandbox, true);
      assert.equal(await js('typeof require'), 'undefined');
      assert.equal(await js('typeof katex.render'), 'function');
      assert.equal((await state()).doc.elements.length, 0);
    });
    await check('draw a line, undo and redo through native menu commands', async () => {
      await click('[data-tool="line"]');
      await drag([15, 20], [60, 45]);
      assert.equal((await state()).doc.elements.length, 1);
      assert.deepEqual((await state()).doc.elements[0].points, [
        { x: 15, y: 20 },
        { x: 60, y: 45 },
      ]);
      wc.send('command', 'undo');
      await delay(70);
      assert.equal((await state()).doc.elements.length, 0);
      wc.send('command', 'redo');
      await delay(70);
      assert.equal((await state()).doc.elements.length, 1);
    });
    await check('Bezier control handles change geometry and remain undoable', async () => {
      await click('[data-tool="bezier"]');
      await drag([70, 50], [120, 50]);
      await click('[data-tool="select"]');
      // Select the curve from the object list, then drag its first control handle.
      const id = (await state()).doc.elements.at(-1).id;
      await click(`[data-layer="${id}"]`);
      const before = (await state()).doc.elements.at(-1).points[1];
      await drag([before.x, before.y], [90, 70]);
      assert.deepEqual((await state()).doc.elements.at(-1).points[1], { x: 90, y: 70 });
      wc.send('command', 'undo');
      await delay(60);
      assert.deepEqual((await state()).doc.elements.at(-1).points[1], before);
    });
    await check('polyline clicks finish with Enter, math labels render with KaTeX', async () => {
      await click('[data-tool="polyline"]');
      await point(15, 70);
      await point(25, 85);
      await point(40, 70);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await delay(100);
      assert.equal((await state()).doc.elements.at(-1).type, 'polyline');
      assert.equal((await state()).doc.elements.at(-1).points.length, 3);
      await click('[data-tool="math"]');
      await point(100, 25);
      assert.equal((await state()).doc.elements.at(-1).math, true);
      assert.ok(await js("!!document.querySelector('#canvas .katex')"));
      await js(
        `(()=>{const e=document.querySelector('#label-input');e.value='\\\\frac{a}{b}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      );
      assert.equal((await state()).doc.elements.at(-1).text, '\\frac{a}{b}');
    });
    await check('save, new and reopen use real IPC and preserve source exactly', async () => {
      const savePath = path.join(temp, 'roundtrip.tikzdraw');
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savePath });
      await click('[data-action="save"]');
      await delay(200);
      assert.equal((await state()).dirty, false);
      const before = await readFile(savePath, 'utf8');
      const oldSource = await js("document.querySelector('#source').textContent");
      wc.send('command', 'new');
      await delay(150);
      assert.equal((await state()).doc.elements.length, 0);
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [savePath] });
      await click('[data-action="open"]');
      await delay(200);
      assert.deepEqual((await state()).doc, JSON.parse(before));
      assert.equal(await js("document.querySelector('#source').textContent"), oldSource);
    });
    await check(
      'rectangles, circles, ellipses and arcs draw and edit with physical units',
      async () => {
        for (const [type, a, b] of [
          ['rect', [10, 10], [30, 30]],
          ['circle', [75, 40], [85, 40]],
          ['ellipse', [100, 60], [140, 85]],
          ['arc', [70, 80], [85, 80]],
        ]) {
          await click(`[data-tool="${type}"]`);
          await drag(a, b);
          assert.equal((await state()).doc.elements.at(-1).type, type);
        }
        await click('[data-tool="select"]');
        const arc = (await state()).doc.elements.at(-1);
        await click(`[data-layer="${arc.id}"]`);
        await js(
          `(()=>{const e=document.querySelector('input[aria-label="終了角 / °"]');e.value='270';e.dispatchEvent(new Event('change'));})()`,
        );
        assert.equal((await state()).doc.elements.at(-1).endAngle, 270);
        await js(
          `(()=>{const e=document.querySelector('input[aria-label="線幅 / pt"]');e.value='1.5';e.dispatchEvent(new Event('change'));})()`,
        );
        assert.equal((await state()).doc.elements.at(-1).style.width, 1.5);
        await js(
          `(()=>{const e=document.querySelector('select[aria-label="矢印"]');e.value='end';e.dispatchEvent(new Event('change'));})()`,
        );
        assert.equal((await state()).doc.elements.at(-1).style.arrow, 'end');
        const circle = (await state()).doc.elements.find((e) => e.type === 'circle');
        await click(`[data-layer="${circle.id}"]`);
        await drag([75, 40], [80, 45]);
        const moved = (await state()).doc.elements.find((e) => e.id === circle.id);
        assert.deepEqual(moved.points, [
          { x: 80, y: 45 },
          { x: 90, y: 45 },
        ]);
      },
    );
    await check('multiple selection moves as one and keyboard nudges support undo', async () => {
      wc.send('command', 'select-all');
      await delay(60);
      const before = (await state()).doc.elements;
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
      await delay(90);
      const moved = (await state()).doc.elements;
      assert.equal(moved.length, before.length);
      for (let i = 0; i < moved.length; i++)
        assert.ok(Math.abs(moved[i].points[0].x - before[i].points[0].x - 0.2) < 0.0001);
      wc.send('command', 'undo');
      await delay(70);
      assert.deepEqual((await state()).doc.elements, before);
      // Commit these edits so subsequent canceled-open checks do not require an extra prompt.
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: path.join(temp, 'all-shapes.tikzdraw'),
      });
      await click('[data-action="save"]');
      await delay(100);
    });
    await check(
      'exported TikZ and TeX use the current document and native file selection',
      async () => {
        const tikzPath = path.join(temp, 'drawing.tikz');
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: tikzPath });
        await click('[data-action="export-tikz"]');
        await delay(120);
        assert.match(await readFile(tikzPath, 'utf8'), /\\begin\{tikzpicture\}/);
        const texPath = path.join(temp, 'drawing.tex');
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: texPath });
        wc.send('command', 'export-tex');
        await delay(120);
        assert.match(
          await readFile(texPath, 'utf8'),
          /\\documentclass\[border=3mm\]\{standalone\}/,
        );
      },
    );
    await check(
      'bad import, canceled save and canceled replacement preserve the drawing',
      async () => {
        const before = (await state()).doc;
        const broken = path.join(temp, 'broken.tikzdraw');
        await writeFile(broken, '{"format":"tikz-draw","version":999}');
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [broken] });
        await click('[data-action="open"]');
        await delay(130);
        assert.deepEqual((await state()).doc, before);
        wc.send('command', 'select-all');
        await delay(50);
        wc.send('command', 'duplicate');
        await delay(100);
        assert.equal((await state()).dirty, true);
        dialog.showSaveDialog = async () => ({ canceled: true });
        wc.send('command', 'save-as');
        await delay(120);
        assert.equal((await state()).dirty, true);
        const count = (await state()).doc.elements.length;
        dialog.showMessageBoxSync = () => 2;
        wc.send('command', 'new');
        await delay(120);
        assert.equal((await state()).doc.elements.length, count);
        wc.send('command', 'undo');
        await delay(70);
        assert.deepEqual((await state()).doc, before);
      },
    );
    await check('sample canvas and all sidebars fit the desktop window', async () => {
      dialog.showMessageBoxSync = () => 1;
      await click('[data-action="sample"]');
      await delay(150);
      wc.send('command', 'zoom-fit');
      await delay(80);
      const data = await js(
        `(()=>{const a=document.querySelector('#canvas').getBoundingClientRect(),b=document.querySelector('#viewport').getBoundingClientRect(),s=document.querySelector('.statusbar').getBoundingClientRect();return {left:a.left>=b.left,top:a.top>=b.top,right:a.right<=b.right,bottom:a.bottom<=b.bottom,math:document.querySelectorAll('#canvas .katex').length,statusBottom:s.bottom,height:innerHeight}})()`,
      );
      assert.ok(data.left && data.top && data.right && data.bottom, JSON.stringify(data));
      assert.equal(data.math, 5);
      assert.ok(data.statusBottom <= data.height, JSON.stringify(data));
      await js("document.querySelector('#toast').classList.remove('visible')");
      await delay(250);
      await mkdir(path.join(root, 'test-output'), { recursive: true });
      await writeFile(path.join(root, 'test-output/desktop.png'), (await wc.capturePage()).toPNG());
    });
    await check(
      'typing an expression previews immediately and native Close respects pending edits',
      async () => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: path.join(temp, 'last-edit.tikzdraw'),
        });
        await click('[data-action="save"]');
        await delay(100);
        const label = (await state()).doc.elements.find((e) => e.type === 'text');
        await click(`[data-layer="${label.id}"]`);
        await js(
          `(()=>{const e=document.querySelector('#label-input');e.focus();e.value='z^3';e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
        );
        assert.equal((await state()).doc.elements.find((e) => e.id === label.id).text, 'z^3');
        assert.equal(await js('document.activeElement.id'), 'label-input');
        let asked = 0;
        dialog.showMessageBoxSync = () => {
          asked++;
          return 2;
        };
        win.close();
        await delay(80);
        assert.equal(asked, 1);
        assert.equal(win.isDestroyed(), false);
        await click('[data-action="save"]');
        await delay(120);
        assert.equal(
          JSON.parse(await readFile(path.join(temp, 'last-edit.tikzdraw'), 'utf8')).elements.find(
            (e) => e.id === label.id,
          ).text,
          'z^3',
        );
      },
    );
    await check(
      'minimum supported window keeps controls and status inside the viewport',
      async () => {
        win.setSize(1060, 700);
        await delay(100);
        wc.send('command', 'zoom-fit');
        await delay(100);
        const metrics = await js(
          `({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,statusBottom:document.querySelector('.statusbar').getBoundingClientRect().bottom,height:innerHeight})`,
        );
        assert.ok(
          metrics.scrollWidth <= metrics.width && metrics.statusBottom <= metrics.height,
          JSON.stringify(metrics),
        );
        await writeFile(
          path.join(root, 'test-output/desktop-small.png'),
          (await wc.capturePage()).toPNG(),
        );
      },
    );
    assert.deepEqual(errors, []);
    console.log(`PASS: ${passed} desktop integration checks`);
    await js('localStorage.clear()');
    win.destroy();
    await rm(temp, { recursive: true, force: true });
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (win) {
      await mkdir(path.join(root, 'test-output'), { recursive: true });
      await writeFile(
        path.join(root, 'test-output/failure.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.destroy();
    }
    app.exit(1);
  }
});
